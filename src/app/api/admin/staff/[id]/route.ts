import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import { pgGetStaffMemberById, pgUpdateStaffMember, pgDeleteStaffMember } from '@/lib/postgres-staff';

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

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const denied = await requireMasterAdmin(request);
    if (denied) return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });
    const staff = await pgGetStaffMemberById(params.id);
    if (!staff) return NextResponse.json({ success: false, error: 'الموظف غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true, staff });
  } catch (error) {
    console.error('GET /api/admin/staff/[id] failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل حساب الموظف' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const denied = await requireMasterAdmin(request);
    if (denied) return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });
    const body = await request.json();
    if (typeof body?.password === 'string' && body.password.trim() && body.password.trim().length < 8) return NextResponse.json({ success: false, error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });
    const permissions = Array.isArray(body?.permissions) ? body.permissions.filter((p: unknown): p is string => typeof p === 'string' && p !== '*') : undefined;
    const staff = await pgUpdateStaffMember(params.id, { name: typeof body?.name === 'string' ? body.name : undefined, username: typeof body?.username === 'string' ? body.username : undefined, password: typeof body?.password === 'string' ? body.password : undefined, phone: typeof body?.phone === 'string' ? body.phone : undefined, jobTitle: typeof body?.jobTitle === 'string' ? body.jobTitle : undefined, role: typeof body?.role === 'string' ? body.role : undefined, permissions, isActive: typeof body?.isActive === 'boolean' ? body.isActive : undefined });
    if (!staff) return NextResponse.json({ success: false, error: 'الموظف غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true, message: 'تم تحديث بيانات وصلاحيات الموظف بنجاح ✓', staff });
  } catch (error) {
    console.error('PUT /api/admin/staff/[id] failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحديث حساب الموظف' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const denied = await requireMasterAdmin(request);
    if (denied) return NextResponse.json({ success: false, error: denied.error }, { status: denied.status });
    const session = getSessionFromRequest(request);
    const current = session ? await pgGetActiveStaffForSession({ userId: session.userId, username: session.username }) : null;
    if (current?.id === params.id) return NextResponse.json({ success: false, error: 'لا يمكنك حذف حسابك الإداري الحالي' }, { status: 400 });
    const deleted = await pgDeleteStaffMember(params.id);
    if (!deleted) return NextResponse.json({ success: false, error: 'الموظف غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true, message: 'تم حذف حساب الموظف بنجاح' });
  } catch (error) {
    console.error('DELETE /api/admin/staff/[id] failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر حذف حساب الموظف' }, { status: 500 });
  }
}
