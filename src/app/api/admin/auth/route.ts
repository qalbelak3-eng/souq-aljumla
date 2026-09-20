import { NextResponse } from 'next/server';
import { verifyAdminCredentials, updateAdminCredentials, authenticateAdminOrStaff } from '@/lib/db';
import {
  signAdminSession,
  getAuthenticatedAdmin,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مسجل الدخول' }, { status: 401 });
    }
    return NextResponse.json({ success: true, admin });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, username, password, newPassword } = body;

    // 1. تسجيل الدخول وإنشاء الـ Signed HttpOnly Cookie
    if (action === 'login') {
      if (!username || !password) {
        return NextResponse.json({ success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' }, { status: 400 });
      }

      const authResult = authenticateAdminOrStaff(username, password);
      if (!authResult.success || !authResult.admin) {
        return NextResponse.json({ success: false, error: authResult.error || 'اسم المستخدم أو كلمة المرور غير صحيحة' }, { status: 401 });
      }

      const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
      const signedToken = signAdminSession({
        userId: authResult.admin.id,
        username: authResult.admin.username,
        role: authResult.admin.role,
        exp,
      });

      // إرجاع بيانات المستخدم دون Session Token في JSON
      const response = NextResponse.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        admin: {
          id: authResult.admin.id,
          name: authResult.admin.name,
          username: authResult.admin.username,
          role: authResult.admin.role,
          jobTitle: authResult.admin.jobTitle,
          permissions: authResult.admin.permissions,
        },
      });

      // تعيين الـ Cookie بخصائص أمنية مشددة
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: signedToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_DURATION_SECONDS,
      });

      return response;
    }

    // 2. التحقق من صلاحية الجلسة الحالية
    if (action === 'check' || action === 'me') {
      const admin = getAuthenticatedAdmin(request);
      if (!admin) {
        return NextResponse.json({ success: false, error: 'غير مسجل الدخول' }, { status: 401 });
      }
      return NextResponse.json({ success: true, admin });
    }

    // 3. تسجيل الخروج وإتلاف الـ Cookie
    if (action === 'logout') {
      const response = NextResponse.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
      return response;
    }

    // 4. تغيير كلمة المرور (يتطلب جلسة موثقة أولاً)
    if (action === 'update_password') {
      const currentAdmin = getAuthenticatedAdmin(request);
      if (!currentAdmin) {
        return NextResponse.json({ success: false, error: 'غير مصرح لك بتغيير كلمة المرور (جلسة غير مسجلة)' }, { status: 401 });
      }

      if (!username || !password || !newPassword) {
        return NextResponse.json({ success: false, error: 'يرجى ملء جميع الحقول' }, { status: 400 });
      }

      const isValid = verifyAdminCredentials(username, password);
      if (!isValid) {
        return NextResponse.json({ success: false, error: 'كلمة المرور الحالية غير صحيحة' }, { status: 401 });
      }

      updateAdminCredentials(username, newPassword);
      return NextResponse.json({ success: true, message: 'تم تحديث كلمة مرور الإدارة بنجاح' });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
