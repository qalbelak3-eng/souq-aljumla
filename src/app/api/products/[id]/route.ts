import { NextResponse } from 'next/server';
import { getProductById, updateProduct, deleteProduct } from '@/lib/db';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const product = getProductById(params.id);
  if (!product) {
    return NextResponse.json({ success: false, error: 'المنتج غير موجود' }, { status: 404 });
  }
  return NextResponse.json({ success: true, product });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const updated = updateProduct(params.id, body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'المنتج غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, product: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const ok = deleteProduct(params.id);
  if (!ok) {
    return NextResponse.json({ success: false, error: 'تعذر حذف المنتج' }, { status: 404 });
  }
  return NextResponse.json({ success: true, message: 'تم الحذف بنجاح' });
}
