import { NextResponse } from 'next/server';
import { getOrderById, updateOrderStatus, updateOrder, deleteOrder, getSettings, assignDriverToOrder } from '@/lib/db';
import { generateWhatsAppLink } from '@/lib/whatsapp';

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
    const { status, driverId, vehicleId } = body;

    let updated = null;

    if (driverId !== undefined || vehicleId !== undefined) {
      const existing = getOrderById(params.id);
      const targetDriverId = driverId !== undefined ? driverId : (existing?.driverId || '');
      updated = assignDriverToOrder(params.id, targetDriverId, vehicleId);
    }

    if (status !== undefined) {
      updated = updateOrderStatus(params.id, status);
    }

    if (!updated) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

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
