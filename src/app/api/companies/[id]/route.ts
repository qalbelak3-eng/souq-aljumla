import { NextResponse } from 'next/server';
import { pgUpdateCompany, pgDeleteCompany } from '@/lib/postgres-catalog';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function requireCompanyAdmin(request: Request) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' }, { status: 401 });
  if (!hasPermission(admin, 'companies') && !hasPermission(admin, 'products') && admin.role !== 'admin') return NextResponse.json({ success: false, error: 'غير مصرح لك بإدارة الشركات' }, { status: 403 });
  return null;
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const authError = await requireCompanyAdmin(request);
    if (authError) return authError;
    const body = await request.json();
    const normalizedBody = { ...body, categories: body.categories !== undefined ? body.categories : body.category !== undefined ? (body.category ? [body.category] : []) : undefined };
    const updated = await pgUpdateCompany(params.id, normalizedBody);
    if (!updated) return NextResponse.json({ success: false, error: 'الشركة غير موجودة' }, { status: 404 });
    return NextResponse.json({ success: true, company: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const authError = await requireCompanyAdmin(request);
    if (authError) return authError;
    const deleted = await pgDeleteCompany(params.id);
    if (!deleted) return NextResponse.json({ success: false, error: 'تعذر حذف الشركة' }, { status: 404 });
    return NextResponse.json({ success: true, message: 'تم حذف الشركة بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
