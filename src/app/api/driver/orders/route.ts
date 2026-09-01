import { NextResponse } from 'next/server';
import { getOrders, completeDriverDelivery, startDriverDelivery, getDriverById, getOrderById } from '@/lib/db';
import { sendDirectCustomerAlert } from '@/lib/pushService';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const driverId = searchParams.get('driverId');

    if (!driverId) {
      return NextResponse.json({ success: false, error: 'معرف السائق مطلوب' }, { status: 400 });
    }

    const driver = getDriverById(driverId);
    if (!driver) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }

    const allOrders = getOrders();
    const driverOrders = allOrders.filter((o) => o.driverId === driverId);

    // Active orders to be delivered
    const activeOrders = driverOrders.filter(
      (o) => o.status === 'pending' || o.status === 'processing' || o.status === 'shipped'
    );

    // Completed or Returned orders
    const historyOrders = driverOrders.filter(
      (o) => o.status === 'delivered' || o.status === 'cancelled'
    );

    return NextResponse.json({
      success: true,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        vehicleInfo: driver.vehicleInfo,
        currentCashInHand: driver.currentCashInHand || 0,
      },
      activeOrders: activeOrders.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      historyOrders: historyOrders.sort(
        (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
      ),
    });
  } catch (error) {
    console.error('Error fetching driver orders:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء جلب طلبيات السائق' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, orderId, driverId, collectionStatus, collectedAmount, notes } = body;

    if (!orderId || !driverId) {
      return NextResponse.json({ success: false, error: 'بيانات العملية غير مكتملة' }, { status: 400 });
    }

    // Action 1: Driver leaves warehouse / out for delivery (خرج مع المندوب للتوصيل)
    if (action === 'start_delivery') {
      const result = startDriverDelivery(orderId, driverId);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || 'فشلت عملية التحديث' }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        order: result.order,
        message: 'تم تحديث حالة الطلبية: خرج مع المندوب للتوصيل 🚚',
      });
    }

    // Action 2: Driver arrived at customer location (إشعار فوري بأن المندوب وصل)
    if (action === 'notify_arrived') {
      const order = getOrderById(orderId);
      const driver = getDriverById(driverId);
      if (!order) {
        return NextResponse.json({ success: false, error: 'الطلبية غير موجودة' }, { status: 404 });
      }

      // إرسال تنبيه Push لحظي لهاتف الزبون
      await sendDirectCustomerAlert({
        userId: order.customer.userId,
        phone: order.customer.phone,
        title: '🛵 المندوب وصل إلى موقعك الآن!',
        body: `مرحباً ${order.customer.name}، مندوب سوق الجملة (${driver?.name || 'المندوب'}) وصل بانتظارك في الخارج لتسليم طلبيتك #${order.orderNumber}.`,
        url: `/order-success/${order.id}`,
      });

      return NextResponse.json({
        success: true,
        message: 'تم إرسال إشعار وصول المندوب لهاتف الزبون بنجاح 🔔🛵',
      });
    }

    // Action 2: Driver completes delivery with cash / debt / partial / return
    if (!collectionStatus) {
      return NextResponse.json({ success: false, error: 'يرجى تحديد حالة التحصيل المالي' }, { status: 400 });
    }

    const result = completeDriverDelivery(orderId, driverId, {
      collectionStatus,
      collectedAmount: Number(collectedAmount) || 0,
      notes,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'فشلت عملية تحديث الطلبية' }, { status: 400 });
    }

    const updatedDriver = getDriverById(driverId);

    return NextResponse.json({
      success: true,
      order: result.order,
      driver: updatedDriver,
      message: 'تم إتمام عملية التسليم وتحديث الحساب بنجاح! ✅',
    });
  } catch (error) {
    console.error('Error in driver orders route:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء تحديث الطلبية' }, { status: 500 });
  }
}
