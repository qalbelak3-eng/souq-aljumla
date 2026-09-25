import { NextResponse } from 'next/server';
import { getAuthenticatedDriver } from '@/lib/auth';
import {
  pgGetDriverOrders,
  pgStartDriverDelivery,
  pgNotifyDriverArrived,
  pgDeliverDriverOrder,
  pgUpdateDriverDeliveryCollection,
  pgFailDriverDelivery,
  pgReturnDriverOrder,
} from '@/lib/postgres-delivery';
import { pgGetDriverById } from '@/lib/postgres-drivers';
import { getDb } from '@/db/client';
import { driverRatings } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { sendDirectCustomerAlert } from '@/lib/pushService';
import { buildDriverDeliveryQueue } from '@/lib/dispatch-recommender';
import { pgGetStoreSettings } from '@/lib/postgres-settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    // 1. Authenticate driver Server-Side via signed token/cookie and PostgreSQL active state
    const driver = await getAuthenticatedDriver(req);
    if (!driver) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (جلسة السائق غير مسجلة أو معطلة)' },
        { status: 401 }
      );
    }

    // 2. Object-level isolation: If driverId is sent in query, it MUST match the authenticated driver!
    const { searchParams } = new URL(req.url);
    const queryDriverId = searchParams.get('driverId');
    if (queryDriverId && queryDriverId !== driver.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول إلى طلبات سائق آخر' },
        { status: 403 }
      );
    }

    // 3. Fetch orders from PostgreSQL
    const { activeOrders, historyOrders } = await pgGetDriverOrders(driver.id);

    // 4. Fetch driver profile with fresh cash in hand calculation
    const driverProfile = await pgGetDriverById(driver.id);

    // 5. Fetch driver ratings from PostgreSQL
    const db = getDb();
    const ratings = await db
      .select()
      .from(driverRatings)
      .where(eq(driverRatings.driverId, driver.id))
      .orderBy(desc(driverRatings.createdAt))
      .limit(20);

    // 6. Compute Multi-Order Smart Delivery Queue (Phase Dispatch-3)
    let warehouseLocation: { lat: number; lng: number } | null = null;
    try {
      const settings = await pgGetStoreSettings();
      if (
        settings?.warehouseLat !== undefined &&
        settings?.warehouseLat !== null &&
        settings?.warehouseLng !== undefined &&
        settings?.warehouseLng !== null &&
        !isNaN(Number(settings.warehouseLat)) &&
        !isNaN(Number(settings.warehouseLng))
      ) {
        warehouseLocation = {
          lat: Number(settings.warehouseLat),
          lng: Number(settings.warehouseLng),
        };
      }
    } catch (e) {
      // Ignore settings fetch errors
    }

    const deliveryQueue = buildDriverDeliveryQueue(activeOrders, {
      warehouseLocation,
      historyOrders,
    });

    return NextResponse.json({
      success: true,
      driver: driverProfile
        ? {
            id: driverProfile.id,
            name: driverProfile.name,
            phone: driverProfile.phone,
            vehicleInfo: driverProfile.vehicleInfo,
            currentCashInHand: driverProfile.currentCashInHand || 0,
            activeDeliveries: driverProfile.activeDeliveries,
            inFlightDeliveries: driverProfile.inFlightDeliveries,
            completedDeliveries: driverProfile.completedDeliveries,
            totalDeliveredRevenue: driverProfile.totalDeliveredRevenue,
            operationalStatus: driverProfile.operationalStatus,
            effectiveStatus: driverProfile.effectiveStatus,
          }
        : driver,
      ratings,
      activeOrders,
      historyOrders,
      deliveryQueue,
    });
  } catch (error: any) {
    console.error('Error fetching driver orders:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب طلبيات السائق' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate driver Server-Side
    const driver = await getAuthenticatedDriver(req);
    if (!driver) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (جلسة السائق غير مسجلة أو معطلة)' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action, orderId, driverId: bodyDriverId, collectionStatus, collectedAmount, reason, notes } = body;

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'معرف الطلب مطلوب' }, { status: 400 });
    }

    // 2. Object-level isolation: Cannot execute operations on behalf of another driver
    if (bodyDriverId && bodyDriverId !== driver.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بتنفيذ عمليات نيابة عن سائق آخر' },
        { status: 403 }
      );
    }

    const driverOp = {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
    };

    // Action A: Start Delivery (خرج للتوصيل / Out for Delivery)
    if (action === 'start_delivery') {
      const order = await pgStartDriverDelivery(driver.id, orderId, driverOp);

      // Send Push notification to customer
      try {
        await sendDirectCustomerAlert({
          userId: order.customer.userId,
          phone: order.customer.phone,
          title: '🚚 طلبيتك في الطريق إليك الآن!',
          body: `مرحباً ${order.customer.name}، طلبيتك #${order.orderNumber} خرجت مع مندوب التوصيل وهي في الطريق إلى موقعك 🚀.`,
          url: `/order-success/${order.id}`,
        });
      } catch (e) {}

      return NextResponse.json({
        success: true,
        order,
        message: 'تم تحديث حالة الطلبية: خرج مع المندوب للتوصيل 🚚',
      });
    }

    // Action B: Notify Arrived (المندوب وصل لموقع الزبون)
    if (action === 'notify_arrived') {
      const result = await pgNotifyDriverArrived(driver.id, orderId, driverOp);

      // Send Push notification to customer only on first arrival registration
      if (!result.alreadyArrived) {
        try {
          const { pgGetOrderById } = await import('@/lib/postgres-orders');
          const order = await pgGetOrderById(orderId);
          if (order) {
            await sendDirectCustomerAlert({
              userId: order.customer.userId,
              phone: order.customer.phone,
              title: '🛵 المندوب وصل إلى موقعك الآن!',
              body: `مرحباً ${order.customer.name}، مندوب سوق الجملة وصل بانتظارك في الخارج لتسليم طلبيتك #${order.orderNumber}.`,
              url: `/order-success/${order.id}`,
            });
          }
        } catch (e) {}
      }

      return NextResponse.json({
        success: true,
        arrivedAt: result.arrivedAt,
        alreadyArrived: result.alreadyArrived || false,
        message: result.alreadyArrived
          ? 'تم التحقق من وصول المندوب مسبقاً'
          : 'تم تسجيل وصول المندوب وإشعار الزبون بنجاح 🔔🛵',
      });
    }

    // Action C: Update Collection Amount before Settlement (تعديل مبلغ التحصيل قبل التصفية)
    if (action === 'update_collection') {
      const order = await pgUpdateDriverDeliveryCollection(driver.id, orderId, driverOp, {
        collectionStatus,
        collectedAmount,
        notes,
      });

      const updatedDriver = await pgGetDriverById(driver.id);

      return NextResponse.json({
        success: true,
        order,
        driver: updatedDriver,
        message: 'تم تعديل مبلغ التحصيل وإعادة احتساب العهدة بنجاح 💵✓',
      });
    }

    // Action D: Failed Delivery Attempt (تعذر تسليم الطلبية)
    if (action === 'fail_delivery') {
      if (!reason) {
        return NextResponse.json(
          { success: false, error: 'يرجى تحديد سبب تعذر التسليم (customer_refused, customer_unreachable, wrong_address, customer_requested_reschedule, other)' },
          { status: 400 }
        );
      }

      const order = await pgFailDriverDelivery(driver.id, orderId, driverOp, {
        reason,
        notes,
      });

      return NextResponse.json({
        success: true,
        order,
        message: 'تم تسجيل تعذر التسليم بنجاح مع إبقاء الطلبية بانتظار إعادة الجدولة',
      });
    }

    // Action E: Return Order to Warehouse (إرجاع الطلبية للمستودع واسترجاع المخزون)
    if (action === 'return_delivery' || action === 'return_order') {
      const order = await pgReturnDriverOrder(driver.id, orderId, driverOp, {
        reason: notes || reason || 'إرجاع من السائق للمستودع',
      });

      // Send Push notification to customer
      try {
        await sendDirectCustomerAlert({
          userId: order.customer.userId,
          phone: order.customer.phone,
          title: '📦 تم إرجاع الطلبية',
          body: `مرحباً ${order.customer.name}، تم تسجيل إرجاع طلبيتك #${order.orderNumber}. ملاحظات: ${notes || 'تم الإرجاع للمستودع'}`,
          url: `/order-success/${order.id}`,
        });
      } catch (e) {}

      return NextResponse.json({
        success: true,
        order,
        message: 'تم تسجيل إرجاع الطلبية للمستودع واسترجاع المخزون بنجاح 📦',
      });
    }

    // Action F: Complete Delivery & Cash Collection (تسليم الطلبية وتحصيل المبلغ)
    // Supports explicit action 'complete_delivery' / 'deliver' or fallback when collectionStatus is provided
    const order = await pgDeliverDriverOrder(driver.id, orderId, driverOp, {
      collectionStatus: collectionStatus || 'collected_cash',
      collectedAmount,
      notes,
      deliveryPin: body.deliveryPin,
    });

    // Send Push notification to customer
    try {
      await sendDirectCustomerAlert({
        userId: order.customer.userId,
        phone: order.customer.phone,
        title: '🎉 تم تسليم طلبيتك بنجاح!',
        body: `مرحباً ${order.customer.name}، تم تسليم طلبيتك #${order.orderNumber} بنجاح. شكراً لتسوقك من سوق الجملة 🛍️`,
        url: `/order-success/${order.id}`,
      });
    } catch (e) {}

    const updatedDriver = await pgGetDriverById(driver.id);

    return NextResponse.json({
      success: true,
      order,
      driver: updatedDriver,
      message: 'تم إتمام عملية التسليم وتحديث عهدة السائق بنجاح 🚚🎉',
    });
  } catch (error: any) {
    console.error('Error in driver orders route:', error);
    const message = error.message || 'حدث خطأ أثناء معالجة طلب السائق';
    const status = message.includes('غير مسند')
      ? 403
      : message.includes('غير موجود')
      ? 404
      : message.includes('تم قفل')
      ? 423
      : message.includes('PIN') || message.includes('رمز') || message.includes('لا تسمح') || message.includes('ملغاة') || message.includes('بالفعل') || message.includes('مطلوب') || message.includes('حالة')
      ? 400
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
