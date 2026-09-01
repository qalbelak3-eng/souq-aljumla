import { NextRequest, NextResponse } from 'next/server';
import { getDriverRatings, addDriverRating, addComplaint, getDriverById } from '@/lib/db';
import { sendWebPushNotification } from '@/lib/pushService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const driverId = searchParams.get('driverId') || undefined;
    const ratings = getDriverRatings(driverId);
    return NextResponse.json({ success: true, ratings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { driverId, orderId, orderNumber, customerName, customerPhone, rating, tag, comment } = body;

    if (!driverId || !orderId || !rating) {
      return NextResponse.json(
        { success: false, error: 'بيانات التقييم غير مكتملة' },
        { status: 400 }
      );
    }

    const newRating = addDriverRating({
      driverId,
      orderId,
      orderNumber: orderNumber || '',
      customerName: customerName || 'زبون المتجر',
      customerPhone: customerPhone || '',
      rating: Number(rating),
      tag,
      comment,
    });

    const driver = getDriverById(driverId);
    const driverName = driver?.name || 'مندوب التوصيل';

    // إذا كان هناك تعليق مكتوب أو تقييم منخفض (3 نجوم أو أقل): سجل في الشكاوى وأرسل إشعاراً فورياً للإدارة
    if (comment && comment.trim().length > 0 || Number(rating) <= 3) {
      try {
        addComplaint({
          customerName: customerName || 'زبون المتجر',
          customerPhone: customerPhone || '',
          text: `[تقييم السائق: ${driverName} • ${rating}/5 ⭐ ${tag ? `• ${tag}` : ''} • فاتورة #${orderNumber}]\n${comment ? `رأي وملاحظة الزبون: ${comment}` : 'تقييم منخفض بدون تعليق نصي'}`,
        });
      } catch (err) {
        console.error('Error auto-creating complaint from rating:', err);
      }

      try {
        await sendWebPushNotification({
          targetAudience: 'all',
          title: `⭐ ملاحظة / تقييم جديد: ${customerName || 'زبون'}`,
          body: `السائق: ${driverName} (${rating}⭐) • ${comment ? `"${comment}"` : tag || 'تقييم جديد'}`,
          url: '/admin/drivers',
        });
      } catch (err) {
        console.error('Error sending rating push notification:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'تم تسجيل التقييم بنجاح! شكراً لك 🌹',
      rating: newRating,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
