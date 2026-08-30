import { NextResponse } from 'next/server';
import { getCategories, createCategory } from '@/lib/db';

export async function GET() {
  try {
    const categories = getCategories();
    return NextResponse.json({ success: true, categories });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, image, icon, color, description } = body;
    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'يرجى كتابة اسم القسم' }, { status: 400 });
    }

    const newCategory = createCategory({ name, image, icon, color, description });
    return NextResponse.json({ success: true, category: newCategory }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
