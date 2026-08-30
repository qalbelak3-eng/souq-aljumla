import { NextResponse } from 'next/server';
import { getCompanies, createCompany } from '@/lib/db';

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
