import { NextResponse } from 'next/server';
import { updateCategory, deleteCategory } from '@/lib/db';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const updated = updateCategory(params.id, body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'القسم غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, category: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const success = deleteCategory(params.id);
    if (!success) {
      return NextResponse.json({ success: false, error: 'تعذر حذف القسم أو أنه غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'تم حذف القسم بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
