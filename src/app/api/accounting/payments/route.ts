import { NextResponse } from 'next/server';
import { addPayment, getPayments, getCustomerStatement, updatePayment, deletePayment } from '@/lib/db';

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
    const { customerPhone, customerName, amount, paymentMethod, notes, receivedBy } = body;

    if (!customerPhone || !customerName || !amount) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال رقم هاتف الزبون والاسم ومبلغ الدفعة المسددة' },
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

    const payment = addPayment({
      customerPhone,
      customerName,
      amount: numAmount,
      paymentMethod: paymentMethod || 'cash',
      notes,
      receivedBy: receivedBy || 'كادر المحاسبة',
    });

    const updatedStatement = getCustomerStatement(customerPhone);

    return NextResponse.json({
      success: true,
      message: `تم تسجيل سند قبض بمبلغ ${numAmount.toLocaleString()} د.ع بنجاح!`,
      payment,
      statement: updatedStatement,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, amount, paymentMethod, notes, customerPhone } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف سند القبض مطلوب' }, { status: 400 });
    }

    const updated = updatePayment(id, {
      amount: amount !== undefined ? Number(amount) : undefined,
      paymentMethod,
      notes,
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: 'لم يتم العثور على سند القبض' }, { status: 404 });
    }

    const updatedStatement = customerPhone ? getCustomerStatement(customerPhone) : null;

    return NextResponse.json({
      success: true,
      message: 'تم تعديل سند القبض وتحديث الحساب بنجاح!',
      payment: updated,
      statement: updatedStatement,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const customerPhone = searchParams.get('phone');

    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف سند القبض مطلوب' }, { status: 400 });
    }

    const deleted = deletePayment(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'تعذر حذف سند القبض' }, { status: 404 });
    }

    const updatedStatement = customerPhone ? getCustomerStatement(customerPhone) : null;

    return NextResponse.json({
      success: true,
      message: 'تم حذف سند القبض وتصحيح كشف الحساب بنجاح!',
      statement: updatedStatement,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
