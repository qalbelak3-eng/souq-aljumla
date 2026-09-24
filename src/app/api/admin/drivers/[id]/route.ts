import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import { pgGetDriverById, pgUpdateDriver, pgDeleteDriver } from '@/lib/postgres-drivers';
import { getDb } from '@/db/client';
import { orders } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'drivers')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إدارة السائقين' }, { status: 403 });
    }

    const driver = await pgGetDriverById(params.id);
    if (!driver) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }

    const db = getDb();
    const driverOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.driverId, params.id))
      .orderBy(desc(orders.createdAt));

    return NextResponse.json({
      success: true,
      driver,
      orders: driverOrders,
    });
  } catch (error: any) {
    console.error('Error fetching driver details:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب تفاصيل السائق' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'drivers')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية تعديل بيانات السائقين' }, { status: 403 });
    }

    const body = await req.json();
    const resolvedParams = await params;
    const driverId = resolvedParams?.id;
    const updated = await pgUpdateDriver(driverId, body);

    if (!updated) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      driver: updated,
      message: 'تم تحديث بيانات السائق بنجاح',
    });
  } catch (error: any) {
    console.error('Error updating driver:', error);
    const message = error.message || 'حدث خطأ أثناء تحديث بيانات السائق';
    const status = message.includes('مسجل مسبقاً') ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'drivers')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية حذف السائقين' }, { status: 403 });
    }

    const result = await pgDeleteDriver(params.id);

    return NextResponse.json({
      success: true,
      message: result.message || 'تم حذف السائق بنجاح',
    });
  } catch (error: any) {
    console.error('Error deleting driver:', error);
    const message = error.message || 'حدث خطأ أثناء حذف السائق';
    const status = message === 'السائق غير موجود' ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
