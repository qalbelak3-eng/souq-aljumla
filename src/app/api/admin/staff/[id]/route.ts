import { NextResponse } from 'next/server';
import { getStaffMemberById, updateStaffMember, deleteStaffMember } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
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
    const body = await request.json();
    const result = updateStaffMember(params.id, body);

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
    const success = deleteStaffMember(params.id);
    if (!success) {
      return NextResponse.json({ success: false, error: 'تعذر حذف حساب الموظف' }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: 'تم حذف حساب الموظف بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
