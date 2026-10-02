import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import { pgGetStaffMembers, pgCreateStaffMember } from '@/lib/postgres-staff';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function requireMasterAdmin(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return { status: 401, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' };
  const staff = await pgGetActiveStaffForSession({ userId: session.userId, username: session.username });
  if (!staff) return { status: 401, error: 'الجلسة غير صالحة أو الحساب غير فعال' };
  const master = session.role === 'admin' || staff.role === 'admin' || staff.role === 'master' || (staff.permissions || []).includes('*');
  return master ? null : { status: 403, error: 'إدارة حسابات الموظفين محصورة بالمدير العام فقط' };
}

export async function GET(request: Request) {
  try {
    const denied = await requireMasterAdmin(request);
    if (denied) return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });
    return NextResponse.json({ success: true, staff: await pgGetStaffMembers() });
  } catch (error) {
    console.error('GET /api/admin/staff failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل حسابات الموظفين' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireMasterAdmin(request);
    if (denied) return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!name) return NextResponse.json({ success: false, error: 'يرجى إدخال اسم الموظف' }, { status: 400 });
    if (!username) return NextResponse.json({ success: false, error: 'يرجى إدخال اسم مستخدم فريد للدخول' }, { status: 400 });
    if (password.trim().length < 8) return NextResponse.json({ success: false, error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });
    const permissions = Array.isArray(body?.permissions) ? body.permissions.filter((p: unknown): p is string => typeof p === 'string' && p !== '*') : [];
    const staff = await pgCreateStaffMember({ name, username, password: password.trim(), phone: typeof body?.phone === 'string' ? body.phone : '', jobTitle: typeof body?.jobTitle === 'string' ? body.jobTitle : 'موظف', role: typeof body?.role === 'string' ? body.role : 'custom', permissions, isActive: body?.isActive !== false });
    return NextResponse.json({ success: true, message: 'تم إضافة الموظف بنجاح وتفعيل حسابه 🎉', staff });
  } catch (error) {
    console.error('POST /api/admin/staff failed:', error);
    const message = error instanceof Error ? error.message : '';
    const safe = message.includes('مسجل مسبقاً');
    return NextResponse.json({ success: false, error: safe ? message : 'تعذر إضافة حساب الموظف' }, { status: safe ? 400 : 500 });
  }
}
