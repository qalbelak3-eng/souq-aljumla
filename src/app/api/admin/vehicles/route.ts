import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import { pgGetVehicles, pgCreateVehicle } from '@/lib/postgres-drivers';

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
    if (access.forbidden) return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إدارة الأسطول والمركبات' }, { status: 403 });
    return NextResponse.json({ success: true, vehicles: await pgGetVehicles() });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء جلب قائمة السيارات' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireDriverPermission(req);
    if (!access) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    if (access.forbidden) return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إضافة مركبات' }, { status: 403 });

    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const plateNumber = typeof body?.plateNumber === 'string' ? body.plateNumber.trim() : '';
    const type = typeof body?.type === 'string' && body.type.trim() ? body.type.trim() : 'كيا حمل';
    const modelYear = typeof body?.modelYear === 'string' ? body.modelYear.trim() : '';
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
    if (!name || !plateNumber) return NextResponse.json({ success: false, error: 'يرجى إدخال اسم المركبة ورقم اللوحة' }, { status: 400 });

    const newVehicle = await pgCreateVehicle({ name, plateNumber, type, modelYear, notes, isActive: body?.isActive !== false });
    return NextResponse.json({ success: true, vehicle: newVehicle, message: 'تمت إضافة المركبة بنجاح! 🚗' });
  } catch (error) {
    console.error('Error creating vehicle:', error);
    const message = error instanceof Error ? error.message : '';
    const duplicate = message.includes('مسجل مسبقاً');
    return NextResponse.json({ success: false, error: duplicate ? message : 'حدث خطأ أثناء إضافة المركبة' }, { status: duplicate ? 400 : 500 });
  }
}
