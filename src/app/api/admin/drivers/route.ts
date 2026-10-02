import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import { pgGetDrivers, pgCreateDriver } from '@/lib/postgres-drivers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function requireDriverPermission(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) return null;
  const staff = await pgGetActiveStaffForSession({ userId: session.userId, username: session.username });
  if (!staff) return null;
  const permissions = staff.permissions || [];
  const allowed = session.role === 'admin' || permissions.includes('*') || permissions.includes('drivers') || permissions.includes('accounting');
  return { forbidden: !allowed };
}

export async function GET(req: Request) {
  try {
    const access = await requireDriverPermission(req);
    if (!access) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    if (access.forbidden) return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إدارة السائقين' }, { status: 403 });
    return NextResponse.json({ success: true, drivers: await pgGetDrivers() });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء جلب قائمة السائقين' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireDriverPermission(req);
    if (!access) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    if (access.forbidden) return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إضافة سائقين' }, { status: 403 });

    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const vehicleInfo = typeof body?.vehicleInfo === 'string' ? body.vehicleInfo.trim() : '';
    const defaultVehicleId = typeof body?.defaultVehicleId === 'string' && body.defaultVehicleId.trim() ? body.defaultVehicleId.trim() : undefined;
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
    if (!name || !phone) return NextResponse.json({ success: false, error: 'يرجى إدخال اسم السائق ورقم الهاتف' }, { status: 400 });
    if (password.trim().length < 6) return NextResponse.json({ success: false, error: 'كلمة مرور السائق مطلوبة ويجب ألا تقل عن 6 أحرف' }, { status: 400 });

    const newDriver = await pgCreateDriver({ name, phone, password: password.trim(), vehicleInfo, defaultVehicleId, notes, isActive: body?.isActive !== false });
    return NextResponse.json({ success: true, driver: newDriver, message: 'تم إضافة السائق بنجاح' });
  } catch (error) {
    console.error('Error creating driver:', error);
    const message = error instanceof Error ? error.message : '';
    const safe = message.includes('مسجل مسبقاً') || message.includes('المركبة المحددة') || message.includes('كلمة المرور') || message.includes('كلمة مرور');
    return NextResponse.json({ success: false, error: safe ? message : 'حدث خطأ أثناء إضافة السائق' }, { status: safe ? 400 : 500 });
  }
}
