import { NextResponse } from 'next/server';
import { getCompanies, createCompany } from '@/lib/db';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const companies = getCompanies(category);
    return NextResponse.json({ success: true, companies });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' }, { status: 401 });
    }
    if (!hasPermission(admin, 'companies') && !hasPermission(admin, 'products') && admin.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بإدارة الشركات' }, { status: 403 });
    }

    const body = await request.json();
    const { name, category, categories, logo, icon } = body;

    const hasCats = (Array.isArray(categories) && categories.length > 0) || (typeof category === 'string' && category.trim().length > 0);

    if (!name || !hasCats) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال اسم الشركة واختيار قسم واحد على الأقل' },
        { status: 400 }
      );
    }

    const newCompany = createCompany({ name, category, categories, logo, icon });
    return NextResponse.json({ success: true, company: newCompany }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
