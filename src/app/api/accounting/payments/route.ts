import { NextResponse } from 'next/server';
import { addPayment, getPayments, getCustomerStatement, reversePayment } from '@/lib/db';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'accounting')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية قراءة سجلات المحاسبة' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone') || undefined;
    const payments = getPayments(phone);
    return NextResponse.json({ success: true, payments });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'accounting')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إجراء العمليات المالية' }, { status: 403 });
    }

    const body = await request.json();

    // هوية منفذ الحركة تُشتق حصراً من الجلسة الموثقة في السيرفر وتتجاهل أي تزوير في Body
    const operator = {
      name: admin.name,
      username: admin.username,
      role: admin.role,
    };

    // 1. معالجة عكس السند المالي (Voucher Reversal - Phase 2B-3)
    if (body.action === 'reverse' || (body.paymentId && body.reason)) {
      if (!hasPermission(admin, 'accounting:reverse')) {
        return NextResponse.json({ success: false, error: 'ليس لديك صلاحية عكس السندات المالية' }, { status: 403 });
      }

      const { paymentId, reason } = body;
      if (!paymentId) {
        return NextResponse.json({ success: false, error: 'معرف السند المراد عكسه مطلوب' }, { status: 400 });
      }

      const res = reversePayment(paymentId, reason, operator);

      if (!res.success) {
        return NextResponse.json({ success: false, error: res.error }, { status: 400 });
      }

      const updatedStatement = res.original?.customerPhone
        ? getCustomerStatement(res.original.customerPhone)
        : null;

      return NextResponse.json({
        success: true,
        message: `تم إصدار سند العكس (#${res.reversal?.receiptNumber}) بنجاح!`,
        reversal: res.reversal,
        original: res.original,
        statement: updatedStatement,
      }, { status: 201 });
    }

    // 2. إصدار سند جديد عادي (Receipt / Disbursement)
    if (!hasPermission(admin, 'accounting:create')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إصدار السندات المالية' }, { status: 403 });
    }

    const { customerPhone, customerName, amount, paymentMethod, notes, voucherType, receivedBy } = body;

    if (!customerPhone || !customerName || !amount) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال رقم هاتف الحساب والاسم ومبلغ السند' },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال مبلغ صحيح أكبر من الصفر' },
        { status: 400 }
      );
    }

    const isDisb = voucherType === 'disbursement';
    const payment = addPayment({
      customerPhone,
      customerName,
      amount: numAmount,
      paymentMethod: paymentMethod || 'cash',
      notes,
      receivedBy: receivedBy?.trim() || operator.name,
      voucherType: isDisb ? 'disbursement' : 'receipt',
      operatorName: operator.name,
      operatorUsername: operator.username,
      operatorRole: operator.role,
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'فشل حفظ السند المالي على القرص (خطأ في قاعدة البيانات)' },
        { status: 500 }
      );
    }

    const updatedStatement = getCustomerStatement(customerPhone);

    return NextResponse.json({
      success: true,
      message: isDisb
        ? `تم تسجيل سند صرف رقم #${payment.receiptNumber} بمبلغ ${numAmount.toLocaleString()} د.ع بنجاح!`
        : `تم تسجيل سند قبض رقم #${payment.receiptNumber} بمبلغ ${numAmount.toLocaleString()} د.ع بنجاح!`,
      payment,
      statement: updatedStatement,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT() {
  return NextResponse.json({
    success: false,
    error: 'تعديل مبالغ أو بيانات السندات المنشورة محظور نظامياً (Immutable Voucher). لتصحيح المبلغ يجب عكس السند القديم وإصدار سند جديد بالمبلغ الصحيح.'
  }, { status: 400 });
}

export async function DELETE() {
  return NextResponse.json({
    success: false,
    error: 'الحذف المادي المباشر للسندات المالية محظور نظامياً (Immutable Voucher). يرجى استخدام عملية عكس السند (Reversal).'
  }, { status: 400 });
}
