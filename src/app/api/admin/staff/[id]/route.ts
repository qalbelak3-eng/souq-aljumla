import { NextResponse } from 'next/server';
import { getStaffMemberById, updateStaffMember, deleteStaffMember } from '@/lib/db';
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

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const denied = requireMasterAdmin(request);
    if (denied) return denied;

    const staff = getStaffMemberById(params.id);
    if (!staff) {
      return NextResponse.json({ success: false, error: 'الموظف غير موجود' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      staff: { ...staff, password: staff.password ? '••••••••' : undefined },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const denied = requireMasterAdmin(request);
    if (denied) return denied;

    const body = await request.json();
    const safeBody = {
      ...body,
      permissions: Array.isArray(body.permissions)
        ? body.permissions.filter((permission: unknown): permission is string => typeof permission === 'string' && permission !== '*')
        : body.permissions,
    };
    const result = updateStaffMember(params.id, safeBody);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث بيانات وصلاحيات الموظف بنجاح ✓',
      staff: result.staff,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const denied = requireMasterAdmin(request);
    if (denied) return denied;

    const success = deleteStaffMember(params.id);
    if (!success) {
      return NextResponse.json({ success: false, error: 'تعذر حذف حساب الموظف' }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: 'تم حذف حساب الموظف بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
