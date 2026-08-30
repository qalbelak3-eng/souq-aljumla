import { NextResponse } from 'next/server';
import { updateCompany, deleteCompany } from '@/lib/db';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updated = updateCompany(params.id, body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'الشركة غير موجودة' }, { status: 404 });
    }
    return NextResponse.json({ success: true, company: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = deleteCompany(params.id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'تعذر حذف الشركة' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'تم حذف الشركة بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
