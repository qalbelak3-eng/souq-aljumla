import { NextRequest, NextResponse } from 'next/server';
import { getPostgresClient } from '@/db/client';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALLOWED_STATUSES = new Set(['pending', 'in_progress', 'resolved', 'archived']);

async function requireComplaintAdmin(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return null;

  const staff = await pgGetActiveStaffForSession({
    userId: session.userId,
    username: session.username,
  });
  if (!staff) return null;

  const permissions = staff.permissions || [];
  const allowed =
    session.role === 'admin' ||
    permissions.includes('*') ||
    permissions.includes('orders') ||
    permissions.includes('customers');

  return { staff, forbidden: !allowed };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = (searchParams.get('phone') || '').trim();
    const userId = (searchParams.get('userId') || '').trim();
    const status = (searchParams.get('status') || '').trim();

    // Unfiltered/global complaint listing is an admin operation.
    if (!phone && !userId) {
      const access = await requireComplaintAdmin(request);
      if (!access) {
        return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
      }
      if (access.forbidden) {
        return NextResponse.json({ success: false, error: 'ليس لديك صلاحية استعراض الشكاوى' }, { status: 403 });
      }
    }

    if (status && status !== 'all' && !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ success: false, error: 'حالة الشكوى غير صالحة' }, { status: 400 });
    }

    const sql = getPostgresClient();
    const rows = await sql`
      SELECT
        id,
        account_id as "userId",
        customer_name as "customerName",
        customer_phone as "customerPhone",
        business_name as "businessName",
        city,
        text,
        status,
        admin_reply as "adminReply",
        replied_at as "repliedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM customer_complaints
      WHERE (${phone} = '' OR regexp_replace(customer_phone, '\\D', '', 'g') = regexp_replace(${phone}, '\\D', '', 'g'))
        AND (${userId} = '' OR account_id::text = ${userId})
        AND (${status} = '' OR ${status} = 'all' OR status = ${status})
      ORDER BY created_at DESC
      LIMIT 500;
    `;

    return NextResponse.json({ success: true, complaints: rows });
  } catch (error) {
    console.error('GET /api/complaints failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل الشكاوى' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const customerName = typeof body?.customerName === 'string' && body.customerName.trim()
      ? body.customerName.trim().slice(0, 150)
      : 'عميل المتجر';
    const customerPhone = typeof body?.customerPhone === 'string' ? body.customerPhone.trim().slice(0, 20) : '';
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const businessName = typeof body?.businessName === 'string' ? body.businessName.trim().slice(0, 150) : null;
    const city = typeof body?.city === 'string' && body.city.trim() ? body.city.trim().slice(0, 100) : 'كربلاء المقدسة';
    const accountId = typeof body?.userId === 'string' && body.userId.trim() ? body.userId.trim() : null;

    if (!customerPhone || !text) {
      return NextResponse.json({ success: false, error: 'رقم الهاتف ونص الرسالة مطلوبان' }, { status: 400 });
    }
    if (text.length > 5000) {
      return NextResponse.json({ success: false, error: 'نص الشكوى طويل جداً' }, { status: 400 });
    }

    const sql = getPostgresClient();
    const rows = await sql`
      INSERT INTO customer_complaints (
        account_id, customer_name, customer_phone, business_name, city, text, status
      ) VALUES (
        ${accountId}::uuid, ${customerName}, ${customerPhone}, ${businessName}, ${city}, ${text}, 'pending'
      )
      RETURNING
        id,
        account_id as "userId",
        customer_name as "customerName",
        customer_phone as "customerPhone",
        business_name as "businessName",
        city,
        text,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt";
    `;

    return NextResponse.json({ success: true, complaint: rows[0] });
  } catch (error) {
    console.error('POST /api/complaints failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر إرسال الشكوى' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await requireComplaintAdmin(request);
    if (!access) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }
    if (access.forbidden) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إدارة الشكاوى' }, { status: 403 });
    }

    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const status = typeof body?.status === 'string' ? body.status.trim() : '';
    const adminReply = typeof body?.adminReply === 'string' ? body.adminReply.trim().slice(0, 5000) : null;

    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف الشكوى مطلوب' }, { status: 400 });
    }
    if (status && !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ success: false, error: 'حالة الشكوى غير صالحة' }, { status: 400 });
    }

    const sql = getPostgresClient();
    const rows = await sql`
      UPDATE customer_complaints
      SET
        status = CASE WHEN ${status} = '' THEN status ELSE ${status} END,
        admin_reply = CASE WHEN ${adminReply}::text IS NULL THEN admin_reply ELSE ${adminReply} END,
        replied_by_staff_id = CASE WHEN ${adminReply}::text IS NULL THEN replied_by_staff_id ELSE ${access.staff.id}::uuid END,
        replied_at = CASE WHEN ${adminReply}::text IS NULL THEN replied_at ELSE NOW() END,
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING
        id,
        account_id as "userId",
        customer_name as "customerName",
        customer_phone as "customerPhone",
        business_name as "businessName",
        city,
        text,
        status,
        admin_reply as "adminReply",
        replied_at as "repliedAt",
        created_at as "createdAt",
        updated_at as "updatedAt";
    `;

    if (!rows[0]) {
      return NextResponse.json({ success: false, error: 'الشكوى غير موجودة' }, { status: 404 });
    }

    return NextResponse.json({ success: true, complaint: rows[0] });
  } catch (error) {
    console.error('PUT /api/complaints failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحديث الشكوى' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireComplaintAdmin(request);
    if (!access) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }
    if (access.forbidden) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية حذف الشكاوى' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = (searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف الشكوى مطلوب' }, { status: 400 });
    }

    const sql = getPostgresClient();
    const rows = await sql`DELETE FROM customer_complaints WHERE id = ${id}::uuid RETURNING id;`;
    if (!rows[0]) {
      return NextResponse.json({ success: false, error: 'الشكوى غير موجودة' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'تم حذف الشكوى بنجاح' });
  } catch (error) {
    console.error('DELETE /api/complaints failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر حذف الشكوى' }, { status: 500 });
  }
}
