import { NextResponse } from 'next/server';
import { getStaffMembers, createStaffMember } from '@/lib/db';

export async function GET() {
  try {
    const staff = getStaffMembers();
    return NextResponse.json({ success: true, staff });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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

    const result = createStaffMember({
      name,
      username,
      password,
      phone: phone || '',
      jobTitle: jobTitle || 'موظف',
      role: role || 'custom',
      permissions: permissions || [],
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
