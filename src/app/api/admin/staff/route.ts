import { NextResponse } from 'next/server';
import { getStaffMembers, createStaffMember } from '@/lib/db';
import { getAuthenticatedAdmin } from '@/lib/auth';

function requireMasterAdmin(request: Request) {
  const admin = getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' },
      { status: 401 }
    );
  }

  if (admin.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'إدارة حسابات الموظفين محصورة بالمدير العام فقط' },
      { status: 403 }
    );
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const denied = requireMasterAdmin(request);
    if (denied) return denied;

    const staff = getStaffMembers();
    return NextResponse.json({ success: true, staff });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = requireMasterAdmin(request);
    if (denied) return denied;

    const body = await request.json();
    const { name, username, password, phone, jobTitle, role, permissions, isActive, notes } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم الموظف' }, { status: 400 });
    }
    if (!username || !username.trim()) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم مستخدم فريد للدخول' }, { status: 400 });
    }
    if (!password || !password.trim()) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال كلمة مرور للموظف' }, { status: 400 });
    }

    const requestedPermissions = Array.isArray(permissions)
      ? permissions.filter((permission): permission is string => typeof permission === 'string' && permission !== '*')
      : [];

    const result = createStaffMember({
      name,
      username,
      password,
      phone: phone || '',
      jobTitle: jobTitle || 'موظف',
      role: role || 'custom',
      permissions: requestedPermissions,
      isActive: isActive !== false,
      notes: notes || '',
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم إضافة الموظف بنجاح وتفعيل حسابه 🎉',
      staff: result.staff,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
