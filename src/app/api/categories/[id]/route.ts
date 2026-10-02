import { NextResponse } from 'next/server';
import { pgUpdateCategory, pgDeleteCategory } from '@/lib/postgres-catalog';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' }, { status: 401 });
    if (!hasPermission(admin, 'categories') && admin.role !== 'admin') return NextResponse.json({ success: false, error: 'غير مصرح لك بتعديل الأقسام' }, { status: 403 });
    const body = await request.json();
    const updated = await pgUpdateCategory(params.id, body);
    if (!updated) return NextResponse.json({ success: false, error: 'القسم غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true, category: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' }, { status: 401 });
    if (!hasPermission(admin, 'categories') && admin.role !== 'admin') return NextResponse.json({ success: false, error: 'غير مصرح لك بحذف الأقسام' }, { status: 403 });
    const trustedOperator = { id: admin.id, name: admin.name, username: admin.username, role: admin.role, permissions: admin.permissions };
    const res = await pgDeleteCategory(params.id, trustedOperator);
    if (!res.success) return NextResponse.json({ success: false, error: res.error || 'تعذر حذف القسم أو أنه غير موجود' }, { status: 400 });
    return NextResponse.json({ success: true, message: 'تم حذف القسم بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
