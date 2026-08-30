import { NextResponse } from 'next/server';
import { getDriverByPhone, getDrivers } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { phone, password } = await req.json();

    if (!phone || !password) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال رقم الهاتف وكلمة المرور' }, { status: 400 });
    }

    const cleanInputPhone = phone.replace(/\D/g, '');
    const drivers = getDrivers();
    const driver = drivers.find((d) => d.phone.replace(/\D/g, '') === cleanInputPhone);

    if (!driver) {
      return NextResponse.json({ success: false, error: 'رقم هاتف السائق غير مسجل في النظام' }, { status: 401 });
    }

    if (!driver.isActive) {
      return NextResponse.json({ success: false, error: 'تم تعطيل حساب السائق، يرجى مراجعة إدارة المتجر' }, { status: 403 });
    }

    if (driver.password && driver.password !== password) {
      return NextResponse.json({ success: false, error: 'كلمة المرور غير صحيحة' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        vehicleInfo: driver.vehicleInfo,
        currentCashInHand: driver.currentCashInHand || 0,
      },
      message: `مرحباً بك يا ${driver.name}! تم تسجيل الدخول بنجاح`,
    });
  } catch (error) {
    console.error('Error driver auth:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء تسجيل الدخول' }, { status: 500 });
  }
}
