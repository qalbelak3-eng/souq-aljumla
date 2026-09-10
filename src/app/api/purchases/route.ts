import { NextResponse } from 'next/server';
import { getPurchaseInvoices, createPurchaseInvoice, getLowStockProducts } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company') || undefined;
    const type = searchParams.get('type') || 'invoices';

    if (type === 'low-stock') {
      const lowStockProducts = getLowStockProducts();
      return NextResponse.json({ success: true, products: lowStockProducts });
    }

    const invoices = getPurchaseInvoices(company);
    return NextResponse.json({ success: true, invoices });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyName, companyId, supplierPhone, date, paymentMethod, paidAmount, remainingAmount, notes, items } = body;

    if (!companyName || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'يرجى اختيار الشركة المجهزة وإضافة صنف واحد على الأقل في الفاتورة' },
        { status: 400 }
      );
    }

    const newInvoice = createPurchaseInvoice({
      companyName,
      companyId,
      supplierPhone,
      date,
      paymentMethod: paymentMethod || 'cash',
      paidAmount: paidAmount ? Number(paidAmount) : undefined,
      remainingAmount: remainingAmount ? Number(remainingAmount) : undefined,
      notes,
      items,
    });

    return NextResponse.json({ success: true, invoice: newInvoice }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
