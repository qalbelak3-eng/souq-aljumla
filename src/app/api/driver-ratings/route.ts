import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, getAuthenticatedCustomer } from '@/lib/auth';
import { pgAddDriverRating, pgGetDriverRatings } from '@/lib/postgres-driver-ratings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Ratings contain customer snapshots; only authenticated back-office users may enumerate them.
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const driverId = searchParams.get('driverId') || undefined;
    const ratings = await pgGetDriverRatings(driverId);
    return NextResponse.json({ success: true, ratings });
  } catch (error: any) {
    console.error('GET /api/driver-ratings failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل التقييمات' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const customer = await getAuthenticatedCustomer(request);
    if (!customer) {
      return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول لتقييم المندوب' }, { status: 401 });
    }

    const body = await request.json();
    const orderId = String(body?.orderId || '').trim();
    const rating = Number(body?.rating);
    if (!orderId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ success: false, error: 'بيانات التقييم غير مكتملة أو غير صحيحة' }, { status: 400 });
    }

    // driverId/orderNumber/customerName/customerPhone are deliberately ignored: all trusted values
    // are derived server-side from the authenticated customer's delivered PostgreSQL order.
    const newRating = await pgAddDriverRating({
      customerAuthIdentityId: customer.id,
      orderId,
      rating,
      tag: typeof body?.tag === 'string' ? body.tag : null,
      comment: typeof body?.comment === 'string' ? body.comment : null,
    });

    return NextResponse.json({
      success: true,
      message: 'تم تسجيل التقييم بنجاح! شكراً لك 🌹',
      rating: newRating,
    });
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'RATING_ALREADY_EXISTS') return NextResponse.json({ success: false, error: 'تم تقييم مندوب هذه الطلبية مسبقاً' }, { status: 409 });
    if (code === 'ORDER_NOT_FOUND') return NextResponse.json({ success: false, error: 'الطلبية غير موجودة' }, { status: 404 });
    if (code === 'ORDER_NOT_OWNED') return NextResponse.json({ success: false, error: 'غير مصرح بتقييم هذه الطلبية' }, { status: 403 });
    if (code === 'ORDER_NOT_DELIVERED') return NextResponse.json({ success: false, error: 'يمكن تقييم المندوب بعد تسليم الطلبية فقط' }, { status: 409 });
    if (code === 'ORDER_HAS_NO_DRIVER') return NextResponse.json({ success: false, error: 'لا يوجد مندوب مرتبط بهذه الطلبية' }, { status: 409 });
    if (code === 'CUSTOMER_ACCOUNT_NOT_FOUND') return NextResponse.json({ success: false, error: 'حساب الزبون غير مرتبط بقاعدة البيانات' }, { status: 403 });
    if (code === 'INVALID_RATING') return NextResponse.json({ success: false, error: 'التقييم يجب أن يكون بين 1 و5' }, { status: 400 });
    // PostgreSQL unique constraint remains the final concurrency-safe guard.
    if (error?.code === '23505') return NextResponse.json({ success: false, error: 'تم تقييم مندوب هذه الطلبية مسبقاً' }, { status: 409 });

    console.error('POST /api/driver-ratings failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تسجيل التقييم' }, { status: 500 });
  }
}
