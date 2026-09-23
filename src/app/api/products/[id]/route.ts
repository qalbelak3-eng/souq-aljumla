import { NextResponse } from 'next/server';
import { getDomainDataSource } from '@/db/client';
import { getProductById, updateProduct, deleteProduct } from '@/lib/db';
import { pgGetProductById, pgUpdateProduct, pgDeleteProduct } from '@/lib/postgres-catalog';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const usePg = getDomainDataSource('CATALOG_BASE') === 'postgres';
    const product = usePg
      ? await pgGetProductById(params.id)
      : getProductById(params.id);
    if (!product) {
      return NextResponse.json({ success: false, error: 'المنتج غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, product });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const usePg = getDomainDataSource('CATALOG_BASE') === 'postgres';
    const updated = usePg
      ? await pgUpdateProduct(params.id, body)
      : updateProduct(params.id, body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'المنتج غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, product: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const usePg = getDomainDataSource('CATALOG_BASE') === 'postgres';
    const ok = usePg
      ? await pgDeleteProduct(params.id)
      : deleteProduct(params.id);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'تعذر حذف المنتج' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'تم الحذف بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

