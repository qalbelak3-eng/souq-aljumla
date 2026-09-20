import { NextResponse } from 'next/server';
import { addPayment, getPayments, getCustomerStatement, updatePayment, deletePayment, reversePayment } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
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
    const body = await request.json();

    // 1. معالجة عكس السند المالي (Voucher Reversal - Phase 2B-3)
    if (body.action === 'reverse' || (body.paymentId && body.reason)) {
      const { paymentId, reason, operatorName, operatorUsername, operatorRole } = body;
      if (!paymentId) {
        return NextResponse.json({ success: false, error: 'معرف السند المراد عكسه مطلوب' }, { status: 400 });
      }

      const res = reversePayment(paymentId, reason, {
        name: operatorName,
        username: operatorUsername,
        role: operatorRole,
      });

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
    const { customerPhone, customerName, amount, paymentMethod, notes, receivedBy, operatorName, operatorUsername, voucherType } = body;

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
      receivedBy: receivedBy || operatorName || 'كادر المحاسبة',
      voucherType: isDisb ? 'disbursement' : 'receipt',
      operatorName,
      operatorUsername,
    });

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

export async function PUT(request: Request) {
  return NextResponse.json({
    success: false,
    error: 'تعديل مبالغ أو بيانات السندات المنشورة محظور نظامياً (Immutable Voucher). لتصحيح المبلغ يجب عكس السند القديم وإصدار سند جديد بالمبلغ الصحيح.'
  }, { status: 400 });
}

export async function DELETE(request: Request) {
  return NextResponse.json({
    success: false,
    error: 'الحذف المادي المباشر للسندات المالية محظور نظامياً (Immutable Voucher). يرجى استخدام عملية عكس السند (Reversal).'
  }, { status: 400 });
}
