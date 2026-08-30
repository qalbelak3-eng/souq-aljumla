import { NextRequest, NextResponse } from 'next/server';
import { getComplaints, addComplaint, updateComplaint, deleteComplaint } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const status = searchParams.get('status') || undefined;

    const complaints = getComplaints({ phone, userId, status });
    return NextResponse.json({ success: true, complaints });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerName, customerPhone, text, userId, businessName, city } = body;

    if (!customerPhone || !text) {
      return NextResponse.json(
        { success: false, error: 'رقم الهاتف ونص الرسالة مطلوبان' },
        { status: 400 }
      );
    }

    const complaint = addComplaint({
      userId,
      customerName: customerName || 'عميل المتجر',
      customerPhone,
      businessName,
      city,
      text,
    });

    return NextResponse.json({ success: true, complaint });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, adminReply, operator } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'معرف الشكوى مطلوب' },
        { status: 400 }
      );
    }

    const updated = updateComplaint(id, { status, adminReply, operator });
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'الشكوى غير موجودة' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, complaint: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'معرف الشكوى مطلوب' },
        { status: 400 }
      );
    }

    const deleted = deleteComplaint(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'الشكوى غير موجودة' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'تم حذف الشكوى بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
