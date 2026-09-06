import { NextResponse } from 'next/server';
import { validateCoupon } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { code, subtotal, userAccountType } = await request.json();
    if (!code) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال كود الخصم' }, { status: 400 });
    }

    const result = validateCoupon(code, Number(subtotal || 0), userAccountType);
    if (!result.valid) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      discount: result.discount,
      message: result.message,
      coupon: result.coupon,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
