import { NextResponse } from 'next/server';
import { verifyAdminCredentials, updateAdminCredentials, authenticateAdminOrStaff } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { action, username, password, newPassword } = await request.json();

    if (action === 'login') {
      if (!username || !password) {
        return NextResponse.json({ success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' }, { status: 400 });
      }

      const authResult = authenticateAdminOrStaff(username, password);
      if (!authResult.success) {
        return NextResponse.json({ success: false, error: authResult.error || 'اسم المستخدم أو كلمة المرور غير صحيحة' }, { status: 401 });
      }

      return NextResponse.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        admin: authResult.admin,
      });
    }

    if (action === 'update_password') {
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
