import { NextResponse } from 'next/server';
import { getStaffMembers, createStaffMember } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';

async function requireMasterAdmin(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session || session.role !== 'admin') return null;

  const staff = await pgGetActiveStaffForSession({
    userId: session.userId,
    username: session.username,
  });
  if (!staff) return null;

  return staff;
}

export async function GET(request: Request) {
  try {
    const admin = await requireMasterAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'هذه العملية محصورة بالمدير العام' }, { status: 403 });
    }

    const staff = getStaffMembers();
    return NextResponse.json({ success: true, staff });
  } catch (error) {
    console.error('GET /api/admin/staff failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل بيانات الموظفين' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireMasterAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'هذه العملية محصورة بالمدير العام' }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const jobTitle = typeof body?.jobTitle === 'string' && body.jobTitle.trim() ? body.jobTitle.trim() : 'موظف';
    const role = typeof body?.role === 'string' && body.role.trim() ? body.role.trim() : 'custom';
    const permissions = Array.isArray(body?.permissions)
      ? body.permissions.filter((permission: unknown): permission is string => typeof permission === 'string')
      : [];
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';

    if (!name) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم الموظف' }, { status: 400 });
    }
    if (!username) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم مستخدم فريد للدخول' }, { status: 400 });
    }
    if (!password.trim()) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال كلمة مرور للموظف' }, { status: 400 });
    }

    const result = createStaffMember({
      name,
      username,
      password,
      phone,
      jobTitle,
      role,
      permissions,
      isActive: body?.isActive !== false,
      notes,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم إضافة الموظف بنجاح وتفعيل حسابه 🎉',
      staff: result.staff,
    });
  } catch (error) {
    console.error('POST /api/admin/staff failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر إضافة الموظف' }, { status: 500 });
  }
}
