import { NextResponse } from 'next/server';
import { getCoupons, createCoupon, updateCoupon, deleteCoupon } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const coupons = getCoupons();
    return NextResponse.json({ success: true, coupons });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.code || !body.discountType || body.discountValue === undefined) {
      return NextResponse.json({ success: false, error: 'يرجى كتابة كود الخصم ونوع الخصم وقيمته' }, { status: 400 });
    }

    const newCoupon = createCoupon(body);
    return NextResponse.json({ success: true, coupon: newCoupon });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, code, ...updates } = body;
    const identifier = id || code;

    if (!identifier) {
      return NextResponse.json({ success: false, error: 'يرجى تحديد الكوبون المراد تعديله' }, { status: 400 });
    }

    const updated = updateCoupon(identifier, updates);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'الكوبون غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ success: true, coupon: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const code = searchParams.get('code');
    const identifier = id || code;

    if (!identifier) {
      return NextResponse.json({ success: false, error: 'يرجى تحديد الكوبون المراد حذفه' }, { status: 400 });
    }

    const deleted = deleteCoupon(identifier);
    return NextResponse.json({ success: deleted });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
