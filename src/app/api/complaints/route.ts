import { NextRequest, NextResponse } from 'next/server';
import {
  pgGetComplaints,
  pgAddComplaint,
  pgUpdateComplaint,
  pgDeleteComplaint,
} from '@/lib/postgres-complaints';
import { getAuthenticatedAdmin, getAuthenticatedCustomer, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function canManageComplaints(request: NextRequest) {
  const admin = getAuthenticatedAdmin(request);
  if (!admin) return null;
  if (admin.role === 'admin' || hasPermission(admin, 'complaints')) return admin;
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = canManageComplaints(request);
    if (admin) {
      const { searchParams } = new URL(request.url);
      const phone = searchParams.get('phone') || undefined;
      const userId = searchParams.get('userId') || undefined;
      const status = searchParams.get('status') || undefined;
      const complaints = await pgGetComplaints({ phone, userId, status });
      return NextResponse.json({ success: true, complaints });
    }

    // Customers may only read their own complaints. Never trust phone/userId query params.
    const customer = getAuthenticatedCustomer(request);
    if (!customer) {
      return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }
    const complaints = await pgGetComplaints({ userId: customer.id });
    return NextResponse.json({ success: true, complaints });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const customer = getAuthenticatedCustomer(request);
    if (!customer) {
      return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول لإرسال الشكوى' }, { status: 401 });
    }

    const body = await request.json();
    const { text, businessName, city } = body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ success: false, error: 'نص الرسالة مطلوب' }, { status: 400 });
    }

    // Identity is always derived from the trusted authenticated session.
    const complaint = await pgAddComplaint({
      userId: customer.id,
      customerName: customer.name || 'عميل المتجر',
      customerPhone: customer.phone,
      businessName,
      city,
      text: text.trim(),
    });

    return NextResponse.json({ success: true, complaint });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = canManageComplaints(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بإدارة الشكاوى' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, adminReply } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف الشكوى مطلوب' }, { status: 400 });
    }

    const operator = { id: admin.id, name: admin.name, username: admin.username, role: admin.role };
    const updated = await pgUpdateComplaint(id, { status, adminReply, operator });
    if (!updated) {
      return NextResponse.json({ success: false, error: 'الشكوى غير موجودة' }, { status: 404 });
    }
    return NextResponse.json({ success: true, complaint: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = canManageComplaints(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بحذف الشكاوى' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف الشكوى مطلوب' }, { status: 400 });
    }

    const deleted = await pgDeleteComplaint(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'الشكوى غير موجودة' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'تم حذف الشكوى بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
