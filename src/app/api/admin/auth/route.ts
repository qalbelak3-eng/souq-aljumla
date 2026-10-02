import { NextResponse } from 'next/server';
import { signAdminSession, getSessionFromRequest, SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from '@/lib/auth';
import { pgAuthenticateAdminOrStaff, pgGetActiveStaffForSession, pgUpdateStaffPassword } from '@/lib/postgres-session-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function sessionRole(staffRole: string, permissions: string[]): 'admin' | 'staff' {
  return staffRole === 'admin' || staffRole === 'master' || permissions.includes('*') ? 'admin' : 'staff';
}

async function getCurrentAdmin(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return null;
  const staff = await pgGetActiveStaffForSession({ userId: session.userId, username: session.username });
  if (!staff) return null;
  const role = sessionRole(staff.role, staff.permissions);
  return { id: staff.id, name: staff.name, username: staff.username, role, jobTitle: staff.jobTitle, permissions: role === 'admin' ? ['*'] : staff.permissions, isActive: true };
}

export async function GET(request: Request) {
  try {
    const admin = await getCurrentAdmin(request);
    if (!admin) return NextResponse.json({ success: false, error: 'غير مسجل الدخول' }, { status: 401 });
    return NextResponse.json({ success: true, admin });
  } catch (error) {
    console.error('GET /api/admin/auth failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر التحقق من جلسة الإدارة' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = typeof body?.action === 'string' ? body.action.trim() : '';
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (action === 'login') {
      if (!username || !password) return NextResponse.json({ success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' }, { status: 400 });
      const staff = await pgAuthenticateAdminOrStaff(username, password);
      if (!staff) return NextResponse.json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, { status: 401 });
      const role = sessionRole(staff.role, staff.permissions);
      const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
      const signedToken = signAdminSession({ userId: staff.id, username: staff.username, role, exp });
      const response = NextResponse.json({ success: true, message: 'تم تسجيل الدخول بنجاح', admin: { id: staff.id, name: staff.name, username: staff.username, role, jobTitle: staff.jobTitle, permissions: role === 'admin' ? ['*'] : staff.permissions } });
      response.cookies.set({ name: SESSION_COOKIE_NAME, value: signedToken, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DURATION_SECONDS });
      return response;
    }

    if (action === 'check' || action === 'me') {
      const admin = await getCurrentAdmin(request);
      if (!admin) return NextResponse.json({ success: false, error: 'غير مسجل الدخول' }, { status: 401 });
      return NextResponse.json({ success: true, admin });
    }

    if (action === 'logout') {
      const response = NextResponse.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
      response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
      return response;
    }

    if (action === 'update_password') {
      const session = getSessionFromRequest(request);
      if (!session) return NextResponse.json({ success: false, error: 'غير مصرح لك بتغيير كلمة المرور (جلسة غير مسجلة)' }, { status: 401 });
      const currentStaff = await pgGetActiveStaffForSession({ userId: session.userId, username: session.username });
      if (!currentStaff) return NextResponse.json({ success: false, error: 'الجلسة غير صالحة أو الحساب غير فعال' }, { status: 401 });
      if (!password || !newPassword) return NextResponse.json({ success: false, error: 'يرجى ملء جميع الحقول' }, { status: 400 });
      if (newPassword.trim().length < 8) return NextResponse.json({ success: false, error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' }, { status: 400 });
      const updated = await pgUpdateStaffPassword({ staffId: currentStaff.id, username: currentStaff.username, currentPassword: password, newPassword: newPassword.trim() });
      if (!updated) return NextResponse.json({ success: false, error: 'كلمة المرور الحالية غير صحيحة' }, { status: 401 });
      return NextResponse.json({ success: true, message: 'تم تحديث كلمة مرور الإدارة بنجاح' });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/admin/auth failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تنفيذ عملية المصادقة' }, { status: 500 });
  }
}
