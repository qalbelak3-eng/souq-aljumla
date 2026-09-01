import { NextRequest, NextResponse } from 'next/server';
import { getDriverRatings, addDriverRating } from '@/lib/db';

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

    return NextResponse.json({
      success: true,
      message: 'تم تسجيل التقييم بنجاح! شكراً لك 🌹',
      rating: newRating,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
