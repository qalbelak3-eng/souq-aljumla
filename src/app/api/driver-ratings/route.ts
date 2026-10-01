import { NextRequest, NextResponse } from 'next/server';
import { getPostgresClient } from '@/db/client';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function ratingLabel(rating: number): string {
  if (rating >= 5) return 'ممتاز';
  if (rating === 4) return 'جيد جداً';
  if (rating === 3) return 'جيد';
  if (rating === 2) return 'ضعيف';
  return 'سيئ';
}

async function canListAllRatings(request: Request): Promise<boolean> {
  const session = getSessionFromRequest(request);
  if (!session) return false;
  const staff = await pgGetActiveStaffForSession({ userId: session.userId, username: session.username });
  if (!staff) return false;
  const permissions = staff.permissions || [];
  return session.role === 'admin' || permissions.includes('*') || permissions.includes('orders') || permissions.includes('drivers');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const driverId = (searchParams.get('driverId') || '').trim();
    if (!driverId && !(await canListAllRatings(request))) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك باستعراض جميع التقييمات' }, { status: 401 });
    }

    const sql = getPostgresClient();
    const rows = await sql`
      SELECT
        id,
        driver_id as "driverId",
        order_id as "orderId",
        order_number as "orderNumber",
        customer_name as "customerName",
        customer_phone as "customerPhone",
        rating,
        rating_label as "ratingLabel",
        tag,
        comment,
        created_at as "createdAt"
      FROM driver_ratings
      WHERE (${driverId} = '' OR driver_id::text = ${driverId})
      ORDER BY created_at DESC
      LIMIT 1000;
    `;
    return NextResponse.json({ success: true, ratings: rows });
  } catch (error) {
    console.error('GET /api/driver-ratings failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل تقييمات السائقين' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const driverId = typeof body?.driverId === 'string' ? body.driverId.trim() : '';
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim().slice(0, 50) : '';
    const customerName = typeof body?.customerName === 'string' && body.customerName.trim() ? body.customerName.trim().slice(0, 150) : 'زبون المتجر';
    const customerPhone = typeof body?.customerPhone === 'string' ? body.customerPhone.trim().slice(0, 20) : '';
    const rating = Number(body?.rating);
    const tag = typeof body?.tag === 'string' && body.tag.trim() ? body.tag.trim().slice(0, 100) : null;
    const comment = typeof body?.comment === 'string' && body.comment.trim() ? body.comment.trim().slice(0, 5000) : null;

    if (!driverId || !orderId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ success: false, error: 'بيانات التقييم غير مكتملة أو غير صالحة' }, { status: 400 });
    }

    const sql = getPostgresClient();
    const driverRows = await sql`SELECT id, name FROM drivers WHERE id = ${driverId}::uuid LIMIT 1;`;
    if (!driverRows[0]) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }
    const orderRows = await sql`SELECT id, order_number as "orderNumber" FROM orders WHERE id = ${orderId}::uuid LIMIT 1;`;
    if (!orderRows[0]) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    const finalOrderNumber = orderNumber || String(orderRows[0].orderNumber || '');
    const label = ratingLabel(rating);
    const inserted = await sql`
      INSERT INTO driver_ratings (
        driver_id, order_id, order_number, customer_name, customer_phone,
        rating, rating_label, tag, comment
      ) VALUES (
        ${driverId}::uuid, ${orderId}::uuid, ${finalOrderNumber}, ${customerName}, ${customerPhone},
        ${rating}, ${label}, ${tag}, ${comment}
      )
      RETURNING
        id, driver_id as "driverId", order_id as "orderId", order_number as "orderNumber",
        customer_name as "customerName", customer_phone as "customerPhone", rating,
        rating_label as "ratingLabel", tag, comment, created_at as "createdAt";
    `;

    if (comment || rating <= 3) {
      const driverName = String(driverRows[0].name || 'مندوب التوصيل');
      const complaintText = `[تقييم السائق: ${driverName} • ${rating}/5 ⭐ ${tag ? `• ${tag}` : ''} • فاتورة #${finalOrderNumber}]\n${comment ? `رأي وملاحظة الزبون: ${comment}` : 'تقييم منخفض بدون تعليق نصي'}`;
      await sql`
        INSERT INTO customer_complaints (
          customer_name, customer_phone, text, status
        ) VALUES (${customerName}, ${customerPhone}, ${complaintText}, 'pending');
      `;
    }

    return NextResponse.json({
      success: true,
      message: 'تم تسجيل التقييم بنجاح! شكراً لك 🌹',
      rating: inserted[0],
    });
  } catch (error) {
    console.error('POST /api/driver-ratings failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تسجيل تقييم السائق' }, { status: 500 });
  }
}
