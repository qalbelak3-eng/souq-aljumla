import { NextResponse } from 'next/server';
import { pgGetPurchaseInvoiceById, pgCancelPurchaseInvoice, pgRecordSupplierRefund } from '@/lib/postgres-purchases';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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
        { success: false, error: 'غير مصرح لك باستعراض فاتورة الشراء' },
        { status: 403 }
      );
    }

    const invoice = await pgGetPurchaseInvoiceById(params.id);
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
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'purchases') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بإلغاء أو حذف فواتير الشراء' },
        { status: 403 }
      );
    }

    const operator = {
      userId: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
    };

    const cancelledInvoice = await pgCancelPurchaseInvoice(
      params.id,
      'إلغاء الفاتورة من لوحة تحكم المشتريات',
      { operator }
    );

    return NextResponse.json({
      success: true,
      message: 'تم إلغاء فاتورة الشراء وعكس كميات المخزون بنجاح',
      invoice: cancelledInvoice,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'purchases') && !hasPermission(admin, 'accounting') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بتسجيل استردادات الموردين' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { amount, paymentMethod, notes, claimId } = body;

    const operator = {
      userId: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
    };

    const res = await pgRecordSupplierRefund(
      {
        invoiceId: params.id,
        claimId,
        amount: Number(amount),
        paymentMethod,
        notes,
      },
      { operator }
    );

    return NextResponse.json({
      ...res,
      message: 'تم تسجيل استرداد المورد بنجاح',
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
