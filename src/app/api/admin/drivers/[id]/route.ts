import { NextResponse } from 'next/server';
import { getDriverById, updateDriver, deleteDriver, getOrders } from '@/lib/db';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const driver = getDriverById(params.id);
    if (!driver) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }

    const orders = getOrders();
    const driverOrders = orders.filter((o) => o.driverId === params.id);

    return NextResponse.json({
      success: true,
      driver,
      orders: driverOrders,
    });
  } catch (error) {
    console.error('Error fetching driver details:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء جلب تفاصيل السائق' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const updated = updateDriver(params.id, body);

    if (!updated) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      driver: updated,
      message: 'تم تحديث بيانات السائق بنجاح',
    });
  } catch (error) {
    console.error('Error updating driver:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء تحديث بيانات السائق' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const deleted = deleteDriver(params.id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم حذف السائق بنجاح',
    });
  } catch (error) {
    console.error('Error deleting driver:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء حذف السائق' }, { status: 500 });
  }
}
