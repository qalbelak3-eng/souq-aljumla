import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db';
import {
  pgGetOrderById,
  pgUpdateOrderStatus,
  pgUpdateOrder,
  pgCancelOrder,
} from '@/lib/postgres-orders';
import { generateWhatsAppLink } from '@/lib/whatsapp';
import { sendDirectCustomerAlert } from '@/lib/pushService';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const order = await pgGetOrderById(params.id);
    if (!order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    const settings = getSettings();
    const whatsappUrl = generateWhatsAppLink(order, settings);

    return NextResponse.json({ success: true, order, whatsappUrl });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    // 1. Enforce admin authentication & 'orders' permission
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'orders')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إدارة الطلبات' }, { status: 403 });
    }

    const operator = { name: admin.name, username: admin.username, role: admin.role };

    const body = await request.json();
    const { status, driverId, vehicleId, cancellationReason, driverNotes } = body;

    const prevOrder = await pgGetOrderById(params.id);
    if (!prevOrder) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    // Terminal State Protection
    if ((prevOrder.status === 'cancelled' || prevOrder.collectionStatus === 'returned') && status !== 'cancelled') {
      return NextResponse.json({ success: false, error: 'الطلبية ملغاة أو راجعة ولا يمكن تعديلها أو إعادة فتحها (حالة نهائية)' }, { status: 400 });
    }

    let updated = null;

    if (status === 'cancelled') {
      // Financial Protection against cancelling with collected/paid money
      if ((prevOrder.paidAmount || 0) > 0 || (prevOrder.collectedAmount || 0) > 0) {
        return NextResponse.json({
          success: false,
          error: 'لا يمكن إلغاء الطلبية مباشرة لاحتوائها على حركة مالية مسجلة (دفع أو تحصيل). يتطلب الأمر إجراء تسوية/استرداد مالي (Financial Reversal / Refund).',
        }, { status: 400 });
      }

      updated = await pgCancelOrder(params.id, {
        reason: cancellationReason || driverNotes,
        operator,
      });
    } else if (status !== undefined) {
      updated = await pgUpdateOrderStatus(params.id, status, {
        driverNotes: driverNotes || cancellationReason,
        operator,
      });
    } else if (driverNotes !== undefined) {
      updated = await pgUpdateOrder(params.id, { driverNotes }, { adjustInventory: false, operator });
    } else {
      updated = prevOrder;
    }

    if (!updated) {
      return NextResponse.json({ success: false, error: 'فشل تحديث الطلب' }, { status: 400 });
    }

    // Push notifications for customer on status changes
    try {
      const effectiveStatus = updated.status;
      if (status === 'processing' || (effectiveStatus === 'processing' && prevOrder.status !== 'processing')) {
        await sendDirectCustomerAlert({
          userId: updated.customer.userId,
          phone: updated.customer.phone,
          title: '📦 طلبيتك قيد التجهيز والتعليب الآن!',
          body: `مرحباً ${updated.customer.name}، طلبيتك #${updated.orderNumber} قيد التجهيز والتعليب في المستودع تمهيداً لإرسالها مع المندوب.`,
          url: `/order-success/${updated.id}`,
        });
      } else if (status === 'shipped' || (effectiveStatus === 'shipped' && prevOrder.status !== 'shipped')) {
        await sendDirectCustomerAlert({
          userId: updated.customer.userId,
          phone: updated.customer.phone,
          title: '🚚 طلبيتك في الطريق إليك الآن!',
          body: `مرحباً ${updated.customer.name}، طلبيتك #${updated.orderNumber} خرجت مع مندوب التوصيل وهي في الطريق إلى موقعك 🚀.`,
          url: `/order-success/${updated.id}`,
        });
      } else if (status === 'delivered' || (effectiveStatus === 'delivered' && prevOrder.status !== 'delivered')) {
        await sendDirectCustomerAlert({
          userId: updated.customer.userId,
          phone: updated.customer.phone,
          title: '🎉 تم تسليم طلبيتك بنجاح!',
          body: `مرحباً ${updated.customer.name}، تم تسليم طلبيتك #${updated.orderNumber} بنجاح. شكراً لتسوقك من سوق الجملة 🛍️`,
          url: `/order-success/${updated.id}`,
        });
      } else if (status === 'cancelled' || (effectiveStatus === 'cancelled' && prevOrder.status !== 'cancelled')) {
        await sendDirectCustomerAlert({
          userId: updated.customer.userId,
          phone: updated.customer.phone,
          title: '❌ تم إلغاء الطلبية',
          body: `مرحباً ${updated.customer.name}، تم إلغاء طلبيتك #${updated.orderNumber}. يرجى التواصل معنا للاستفسار.`,
          url: `/order-success/${updated.id}`,
        });
      }
    } catch (e) {
      console.error('Error sending order status push alert:', e);
    }

    return NextResponse.json({ success: true, order: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    // 1. Enforce admin authentication & 'orders' permission
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'orders')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إدارة الطلبات' }, { status: 403 });
    }

    const operator = { name: admin.name, username: admin.username, role: admin.role };

    const body = await request.json();
    const { items, deliveryFee, discount, notes, status, customer, paymentMethod } = body;

    const prevOrder = await pgGetOrderById(params.id);
    if (!prevOrder) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    // Terminal State Protection
    if (prevOrder.status === 'cancelled' || prevOrder.collectionStatus === 'returned') {
      return NextResponse.json({ success: false, error: 'الطلبية ملغاة أو راجعة ولا يمكن تعديلها أو إعادة فتحها (حالة نهائية)' }, { status: 400 });
    }

    // Financial Protection
    if (status === 'cancelled' && ((prevOrder.paidAmount || 0) > 0 || (prevOrder.collectedAmount || 0) > 0)) {
      return NextResponse.json({
        success: false,
        error: 'لا يمكن إلغاء الطلبية مباشرة لاحتوائها على حركة مالية مسجلة (دفع أو تحصيل). يتطلب الأمر إجراء تسوية/استرداد مالي (Financial Reversal / Refund).'
      }, { status: 400 });
    }

    const updated = await pgUpdateOrder(
      params.id,
      {
        items,
        deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : undefined,
        discount: discount !== undefined ? Number(discount) : undefined,
        notes,
        status,
        customer,
        paymentMethod,
      },
      { adjustInventory: true, operator }
    );

    if (!updated) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    // Push alerts on status change
    if (status && status !== prevOrder.status) {
      try {
        if (status === 'processing') {
          await sendDirectCustomerAlert({
            userId: updated.customer.userId,
            phone: updated.customer.phone,
            title: '📦 طلبيتك قيد التجهيز والتعليب الآن!',
            body: `مرحباً ${updated.customer.name}، طلبيتك #${updated.orderNumber} قيد التجهيز والتعليب في المستودع تمهيداً لإرسالها مع المندوب.`,
            url: `/order-success/${updated.id}`,
          });
        } else if (status === 'shipped') {
          await sendDirectCustomerAlert({
            userId: updated.customer.userId,
            phone: updated.customer.phone,
            title: '🚚 طلبيتك في الطريق إليك الآن!',
            body: `مرحباً ${updated.customer.name}، طلبيتك #${updated.orderNumber} خرجت مع مندوب التوصيل وهي في الطريق إلى موقعك 🚀.`,
            url: `/order-success/${updated.id}`,
          });
        } else if (status === 'delivered') {
          await sendDirectCustomerAlert({
            userId: updated.customer.userId,
            phone: updated.customer.phone,
            title: '🎉 تم تسليم طلبيتك بنجاح!',
            body: `مرحباً ${updated.customer.name}، تم تسليم طلبيتك #${updated.orderNumber} بنجاح. شكراً لتسوقك من سوق الجملة 🛍️`,
            url: `/order-success/${updated.id}`,
          });
        }
      } catch (e) {
        console.error('Error sending order status alert in PUT:', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'تم تعديل الفاتورة وتحديث المخزون وحساب العميل بنجاح!',
      order: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    // 1. Enforce admin authentication & 'orders' permission
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'orders')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إدارة الطلبات' }, { status: 403 });
    }

    const operator = { name: admin.name, username: admin.username, role: admin.role };

    const prevOrder = await pgGetOrderById(params.id);
    if (!prevOrder) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود أو تعذر حذفه' }, { status: 404 });
    }

    // Logical cancellation: DB trigger trg_prevent_order_delete forbids physical DELETE
    await pgCancelOrder(params.id, {
      reason: 'تم إلغاء الفاتورة من لوحة التحكم (إلغاء منطقي واسترجاع المخزون)',
      operator,
    });

    return NextResponse.json({
      success: true,
      message: 'تم حذف الفاتورة واسترجاع المواد للمخزن وتحديث كشف الحساب بنجاح ✓',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
