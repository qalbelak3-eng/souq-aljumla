import { NextResponse } from 'next/server';
import { getPurchaseInvoiceById, deletePurchaseInvoice } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const invoice = getPurchaseInvoiceById(params.id);
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'فاتورة الشراء غير موجودة' }, { status: 404 });
    }
    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = deletePurchaseInvoice(params.id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'تعذر حذف فاتورة الشراء' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'تم حذف فاتورة الشراء بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
