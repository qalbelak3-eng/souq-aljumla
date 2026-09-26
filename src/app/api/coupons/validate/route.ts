import { NextResponse } from 'next/server';
import { getAuthenticatedCustomer, getAuthenticatedAdmin } from '@/lib/auth';
import { pgValidateCoupon } from '@/lib/postgres-coupons';
import { pgGetProducts } from '@/lib/postgres-catalog';
import { getProductPriceForUser, validateOrderItemQuantity } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, items } = body;
    let subtotal = Number(body.subtotal || 0);

    if (!code) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال كود الخصم' }, { status: 400 });
    }

    // Server-side session authentication: determine trusted account type
    const customer = getAuthenticatedCustomer(request);
    const admin = getAuthenticatedAdmin(request);

    const trustedAccountType = admin
      ? (body.userAccountType || 'individual')
      : (customer ? (customer.accountType || 'individual') : 'individual');

    // If items are passed, calculate trusted subtotal strictly from verified PostgreSQL products
    if (items && Array.isArray(items) && items.length > 0) {
      const allProducts = await pgGetProducts();
      let calculated = 0;
      for (const item of items) {
        const prod = allProducts.find((p) => p.id === item.productId || p.id === item.id);
        if (!prod || (prod as any).isActive === false) {
          return NextResponse.json({
            success: false,
            error: 'السلة تحتوي على منتج غير متوفر أو معطل حالياً',
          }, { status: 400 });
        }
        const qtyRes = validateOrderItemQuantity(item.quantity);
        if (!qtyRes.valid) {
          return NextResponse.json({
            success: false,
            error: `كمية غير صالحة للصنف (${prod.name}): ${qtyRes.error}`,
          }, { status: 400 });
        }
        const qty = qtyRes.quantity!;
        const saleType = item.saleType === 'wholesale' ? 'wholesale' : item.saleType === 'box' ? 'box' : 'retail';
        const pricingRes = getProductPriceForUser(prod, saleType as any, customer as any);
        calculated += pricingRes.price * qty;
      }
      subtotal = calculated;
    } else {
      // If items are missing or empty:
      // Admins may provide arbitrary subtotal for simulation, but customers/guests subtotal is strictly 0
      if (!admin) {
        subtotal = 0;
      }
    }

    const result = await pgValidateCoupon(code, subtotal, trustedAccountType);
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
