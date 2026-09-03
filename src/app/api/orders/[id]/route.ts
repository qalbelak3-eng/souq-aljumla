import { NextResponse } from 'next/server';
import { getOrderById, updateOrderStatus, updateOrder, deleteOrder, getSettings, assignDriverToOrder } from '@/lib/db';
import { generateWhatsAppLink } from '@/lib/whatsapp';
import { sendDirectCustomerAlert } from '@/lib/pushService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const order = getOrderById(params.id);
  if (!order) {
    return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
  }

  const settings = getSettings();
  const whatsappUrl = generateWhatsAppLink(order, settings);

  return NextResponse.json({ success: true, order, whatsappUrl });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { status, driverId, vehicleId, cancellationReason, driverNotes } = body;

    const prevOrder = getOrderById(params.id);
    if (!prevOrder) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    let updated = null;

    if (driverId !== undefined || vehicleId !== undefined) {
      const targetDriverId = driverId !== undefined ? driverId : (prevOrder.driverId || '');
      updated = assignDriverToOrder(params.id, targetDriverId, vehicleId);
    }

    if (status !== undefined) {
      updated = updateOrderStatus(params.id, status);
      if (updated && (cancellationReason || driverNotes)) {
        const { updateOrder } = await import('@/lib/db');
        updated = updateOrder(params.id, {
          driverNotes: driverNotes || cancellationReason || 'تم الإلغاء بناءً على رغبة الزبون'
        }, false) || updated;
      }
    }

    if (!updated) {
      return NextResponse.json({ success: false, error: 'فشل تحديث الطلب' }, { status: 400 });
    }

    // إرسال تنبيه فوري لهاتف الزبون بناءً على تغير حالة الطلبية 🔔
    try {
      const effectiveStatus = updated.status;
      const statusChanged = prevOrder.status !== effectiveStatus;

      if (statusChanged || status !== undefined) {
        if (effectiveStatus === 'processing' && prevOrder.status === 'pending') {
          await sendDirectCustomerAlert({
            userId: updated.customer.userId,
            phone: updated.customer.phone,
            title: '📦 طلبيتك قيد التجهيز والتعليب الآن!',
            body: `مرحباً ${updated.customer.name}، طلبيتك #${updated.orderNumber} قيد التجهيز والتعليب في المستودع تمهيداً لإرسالها مع المندوب.`,
            url: `/order-success/${updated.id}`,
          });
        } else if (effectiveStatus === 'shipped') {
          await sendDirectCustomerAlert({
            userId: updated.customer.userId,
            phone: updated.customer.phone,
            title: '🚚 طلبيتك في الطريق إليك الآن!',
            body: `مرحباً ${updated.customer.name}، طلبيتك #${updated.orderNumber} خرجت مع مندوب التوصيل وهي في الطريق إلى موقعك 🚀.`,
            url: `/order-success/${updated.id}`,
          });
        } else if (effectiveStatus === 'delivered') {
          await sendDirectCustomerAlert({
            userId: updated.customer.userId,
            phone: updated.customer.phone,
            title: '🎉 تم تسليم طلبيتك بنجاح!',
            body: `مرحباً ${updated.customer.name}، تم تسليم طلبيتك #${updated.orderNumber} بنجاح. شكراً لتسوقك من سوق الجملة 🛍️`,
            url: `/order-success/${updated.id}`,
          });
        } else if (effectiveStatus === 'cancelled') {
          await sendDirectCustomerAlert({
            userId: updated.customer.userId,
            phone: updated.customer.phone,
            title: '❌ تم إلغاء الطلبية',
            body: `مرحباً ${updated.customer.name}، تم إلغاء طلبيتك #${updated.orderNumber}. يرجى التواصل معنا للاستفسار.`,
            url: `/order-success/${updated.id}`,
          });
        }
      }
    } catch (e) {}

    return NextResponse.json({ success: true, order: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { items, deliveryFee, discount, notes, status, customer, paymentMethod } = body;

    const updated = updateOrder(params.id, {
      items,
      deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : undefined,
      discount: discount !== undefined ? Number(discount) : undefined,
      notes,
      status,
      customer,
      paymentMethod,
    }, true);

    if (!updated) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
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
    const success = deleteOrder(params.id, true);
    if (!success) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود أو تعذر حذفه' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم حذف الفاتورة واسترجاع المواد للمخزن وتحديث كشف الحساب بنجاح ✓',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
