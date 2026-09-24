import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import { pgGetDrivers, pgCreateDriver } from '@/lib/postgres-drivers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'drivers')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إدارة السائقين' }, { status: 403 });
    }

    const drivers = await pgGetDrivers();

    return NextResponse.json({
      success: true,
      drivers,
    });
  } catch (error: any) {
    console.error('Error fetching drivers:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب قائمة السائقين' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'drivers')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إضافة سائقين' }, { status: 403 });
    }

    const body = await req.json();
    const { name, phone, password, vehicleInfo, defaultVehicleId, notes, isActive } = body;

    if (!name || !phone) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم السائق ورقم الهاتف' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return NextResponse.json(
        { success: false, error: 'كلمة مرور السائق مطلوبة ويجب ألا تقل عن 6 أحرف' },
        { status: 400 }
      );
    }

    const newDriver = await pgCreateDriver({
      name,
      phone,
      password: password.trim(),
      vehicleInfo: vehicleInfo || '',
      defaultVehicleId,
      notes: notes || '',
      isActive: isActive !== false,
    });

    return NextResponse.json({
      success: true,
      driver: newDriver,
      message: 'تم إضافة السائق بنجاح',
    });
  } catch (error: any) {
    console.error('Error creating driver:', error);
    const message = error.message || 'حدث خطأ أثناء إضافة السائق';
    const status = (message.includes('مسجل مسبقاً') || message.includes('المركبة المحددة') || message.includes('كلمة المرور') || message.includes('كلمة مرور')) ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
