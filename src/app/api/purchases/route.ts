import { NextResponse } from 'next/server';
import { pgGetPurchaseInvoices, pgCreatePurchaseInvoice } from '@/lib/postgres-purchases';
import { pgGetProducts } from '@/lib/postgres-catalog';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (يتطلب تسجيل الدخول كمسؤول)' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'purchases') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك باستعراض فواتير الشراء' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company') || undefined;
    const type = searchParams.get('type') || 'invoices';
    const status = (searchParams.get('status') as 'active' | 'cancelled') || undefined;

    if (type === 'low-stock') {
      const allProducts = await pgGetProducts({ includeInactive: true });
      const lowStockProducts = allProducts.filter((p) => (p.stock || 0) <= (p.minStockAlert ?? 5));
      return NextResponse.json({ success: true, products: lowStockProducts });
    }

    const invoices = await pgGetPurchaseInvoices({
      companyName: company,
      status,
    });

    return NextResponse.json({ success: true, invoices });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'purchases') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بإنشاء فواتير الشراء' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { companyName, companyId, supplierAccountId, supplierPhone, date, paymentMethod, paidAmount, remainingAmount, notes, items } = body;

    if (!companyName || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'يرجى اختيار الشركة المجهزة وإضافة صنف واحد على الأقل في الفاتورة' },
        { status: 400 }
      );
    }

    const operator = {
      userId: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
    };

    const newInvoice = await pgCreatePurchaseInvoice(
      {
        companyName,
        companyId,
        supplierAccountId,
        supplierPhone,
        date,
        paymentMethod: paymentMethod || 'cash',
        paidAmount: paidAmount !== undefined ? Number(paidAmount) : undefined,
        remainingAmount: remainingAmount !== undefined ? Number(remainingAmount) : undefined,
        notes,
        items,
      },
      { operator }
    );

    return NextResponse.json({ success: true, invoice: newInvoice }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
