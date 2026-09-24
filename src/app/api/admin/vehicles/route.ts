import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import { pgGetVehicles, pgCreateVehicle } from '@/lib/postgres-drivers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'drivers')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إدارة الأسطول والمركبات' }, { status: 403 });
    }

    const vehicles = await pgGetVehicles();

    return NextResponse.json({
      success: true,
      vehicles,
    });
  } catch (error: any) {
    console.error('Error fetching vehicles:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب قائمة السيارات' },
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
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إضافة مركبات' }, { status: 403 });
    }

    const body = await req.json();
    const { name, plateNumber, type, modelYear, notes, isActive } = body;

    if (!name || !plateNumber) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم المركبة ورقم اللوحة' }, { status: 400 });
    }

    const newVehicle = await pgCreateVehicle({
      name,
      plateNumber,
      type: type || 'كيا حمل',
      modelYear: modelYear || '',
      notes: notes || '',
      isActive: isActive !== false,
    });

    return NextResponse.json({
      success: true,
      vehicle: newVehicle,
      message: 'تمت إضافة المركبة بنجاح! 🚗',
    });
  } catch (error: any) {
    console.error('Error creating vehicle:', error);
    const message = error.message || 'حدث خطأ أثناء إضافة المركبة';
    const status = message.includes('مسجل مسبقاً') ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
