import { NextResponse } from 'next/server';
import { pgGetCategories, pgCreateCategory } from '@/lib/postgres-catalog';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const categories = await pgGetCategories();
    return NextResponse.json({ success: true, categories });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' }, { status: 401 });
    }
    if (!hasPermission(admin, 'categories') && admin.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بإضافة الأقسام' }, { status: 403 });
    }

    const body = await request.json();
    const { name, image, icon, color, description, orderIndex, hideFromHome } = body;
    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'يرجى كتابة اسم القسم' }, { status: 400 });
    }

    const newCategory = await pgCreateCategory({ name, image, icon, color, description, orderIndex: orderIndex !== undefined ? Number(orderIndex) : undefined, hideFromHome: hideFromHome !== undefined ? Boolean(hideFromHome) : undefined });
    return NextResponse.json({ success: true, category: newCategory }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
