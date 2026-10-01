import { NextResponse } from 'next/server';
import { getStaffMemberById, updateStaffMember, deleteStaffMember } from '@/lib/db';
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

function normalizeStaffId(value: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireMasterAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'هذه العملية محصورة بالمدير العام' }, { status: 403 });
    }

    const staffId = normalizeStaffId(params.id);
    if (!staffId) {
      return NextResponse.json({ success: false, error: 'معرف الموظف غير صالح' }, { status: 400 });
    }

    const staff = getStaffMemberById(staffId);
    if (!staff) {
      return NextResponse.json({ success: false, error: 'الموظف غير موجود' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      staff: { ...staff, password: staff.password ? '••••••••' : undefined },
    });
  } catch (error) {
    console.error('GET /api/admin/staff/[id] failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل بيانات الموظف' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireMasterAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'هذه العملية محصورة بالمدير العام' }, { status: 403 });
    }

    const staffId = normalizeStaffId(params.id);
    if (!staffId) {
      return NextResponse.json({ success: false, error: 'معرف الموظف غير صالح' }, { status: 400 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'بيانات الموظف غير صالحة' }, { status: 400 });
    }

    const result = updateStaffMember(staffId, body);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث بيانات وصلاحيات الموظف بنجاح ✓',
      staff: result.staff,
    });
  } catch (error) {
    console.error('PUT /api/admin/staff/[id] failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحديث بيانات الموظف' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireMasterAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'هذه العملية محصورة بالمدير العام' }, { status: 403 });
    }

    const staffId = normalizeStaffId(params.id);
    if (!staffId) {
      return NextResponse.json({ success: false, error: 'معرف الموظف غير صالح' }, { status: 400 });
    }

    if (staffId === admin.id) {
      return NextResponse.json({ success: false, error: 'لا يمكن حذف حساب المدير المستخدم في الجلسة الحالية' }, { status: 400 });
    }

    const success = deleteStaffMember(staffId);
    if (!success) {
      return NextResponse.json({ success: false, error: 'تعذر حذف حساب الموظف' }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: 'تم حذف حساب الموظف بنجاح' });
  } catch (error) {
    console.error('DELETE /api/admin/staff/[id] failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر حذف حساب الموظف' }, { status: 500 });
  }
}
