import { NextResponse } from 'next/server';
import { getUsers } from '@/lib/db';
import { pgGetStoreSettings } from '@/lib/postgres-settings';
import { pgGetOrders, pgCreateOrder } from '@/lib/postgres-orders';
import { pgGetProducts } from '@/lib/postgres-catalog';
import { pgValidateCoupon } from '@/lib/postgres-coupons';
import { getProductPriceForUser, getProductCashbackRate } from '@/lib/pricing';
import { getEffectiveDeliveryFee } from '@/lib/delivery';
import { generateWhatsAppLink } from '@/lib/whatsapp';
import { sendDirectCustomerAlert } from '@/lib/pushService';
import {
  getAuthenticatedAdmin,
  hasPermission,
  getAuthenticatedCustomer,
  signOrderAccessToken,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    const status = (searchParams.get('status') as any) || undefined;

    const admin = getAuthenticatedAdmin(request);
    const isStaffOrAdmin = admin && hasPermission(admin, 'orders');

    if (isStaffOrAdmin) {
      // Admin with 'orders' permission can query all orders or filter by query parameters
      const userId = searchParams.get('userId') || undefined;
      const phone = searchParams.get('phone') || undefined;
      const email = searchParams.get('email') || undefined;

      const orders = await pgGetOrders({
        userId,
        phone,
        email,
        limit,
        status,
      });

      return NextResponse.json({ success: true, orders, count: orders.length });
    }

    // Customer flow: MUST authenticate server-side via trusted session
    const customer = getAuthenticatedCustomer(request);
    if (!customer) {
      return NextResponse.json({
        success: false,
        error: 'غير مصرح لك باستعراض الطلبات (يتطلب جلسة مسجلة للزبون أو صلاحية إدارية)',
      }, { status: 401 });
    }

    // STRICT SERVER-SIDE ISOLATION:
    // Extract identity EXCLUSIVELY from customer session. URL query params cannot override or access another customer's data!
    const orders = await pgGetOrders({
      userId: customer.id,
      phone: customer.phone,
      email: customer.email,
      limit,
      status,
    }, { includePin: true });

    return NextResponse.json({ success: true, orders, count: orders.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      customer,
      items,
      deliveryFee,
      discount,
      couponCode,
      usedCashbackDiscount,
      paymentMethod,
      notes,
      accountId,
    } = body;

    if (!customer || !customer.name || !customer.phone || !customer.city || !customer.address) {
      return NextResponse.json({ success: false, error: 'يرجى إكمال جميع بيانات العميل المطلوبة' }, { status: 400 });
    }

    // Server-side lat/lng range validation (Req #9)
    if (customer.lat !== undefined && customer.lat !== null && customer.lat !== '') {
      const latVal = Number(customer.lat);
      if (isNaN(latVal) || latVal < -90 || latVal > 90) {
        return NextResponse.json({ success: false, error: 'إحداثيات الموقع (lat) غير صالحة — يجب أن تكون بين -90 و 90' }, { status: 400 });
      }
      customer.lat = latVal;
    } else {
      customer.lat = undefined;
    }
    if (customer.lng !== undefined && customer.lng !== null && customer.lng !== '') {
      const lngVal = Number(customer.lng);
      if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
        return NextResponse.json({ success: false, error: 'إحداثيات الموقع (lng) غير صالحة — يجب أن تكون بين -180 و 180' }, { status: 400 });
      }
      customer.lng = lngVal;
    } else {
      customer.lng = undefined;
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'سلة المشتريات فارغة' }, { status: 400 });
    }

    // Session-derived operator and trusted identity resolution (Requirement 4)
    const admin = getAuthenticatedAdmin(request);
    const customerSession = getAuthenticatedCustomer(request);

    const allUsers = getUsers();
    let trustedUser: any = null;

    if (admin && customer.userId) {
      trustedUser = allUsers.find((u) => u.id === customer.userId) || null;
    } else if (customerSession) {
      trustedUser = allUsers.find((u) => u.id === customerSession.id) || {
        id: customerSession.id,
        phone: customerSession.phone,
        name: customerSession.name,
        accountType: customerSession.accountType || 'individual',
        merchantStatus: customerSession.merchantStatus,
        pricingTier: customerSession.pricingTier,
        isActive: true,
      };
      customer.userId = customerSession.id;
      if (!customer.phone || customer.phone.trim() === '') {
        customer.phone = customerSession.phone;
      }
    } else {
      // Unauthenticated / guest customer: strictly individual account
      trustedUser = null;
      customer.userId = undefined;
    }

    const effectiveAccountType = trustedUser?.accountType || 'individual';

    // Check if customer is a pending merchant or market
    if (
      trustedUser &&
      (effectiveAccountType === 'market' ||
        effectiveAccountType === 'wholesale' ||
        effectiveAccountType === 'merchant') &&
      trustedUser.merchantStatus === 'pending'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'حسابك (ماركت/تاجر) قيد المراجعة والتدقيق من قبل الإدارة حالياً. لا يمكن إرسال فواتير الشراء إلا بعد قيام الإدارة بالاتصال بك واعتماد الحساب.',
        },
        { status: 403 }
      );
    }

    // Server-side recalculation of each item price based on verified product catalog
    const settings = await pgGetStoreSettings();
    const allProducts = await pgGetProducts();
    let calculatedSubtotal = 0;

    // Strict product validation: reject non-existent or inactive products (Requirement 5)
    for (const item of items) {
      const prodId = item.productId || item.id;
      if (!prodId) {
        return NextResponse.json({ success: false, error: 'أحد الأصناف لا يحتوي على معرّف منتج صالح' }, { status: 400 });
      }
      const prod = allProducts.find((p) => p.id === prodId);
      if (!prod || (prod as any).isActive === false || (prod as any).status === 'inactive' || (prod as any).status === 'archived') {
        return NextResponse.json({
          success: false,
          error: `المنتج "${item.name || item.title || prodId}" غير موجود أو غير متوفر حالياً.`,
        }, { status: 400 });
      }
    }

    const verifiedItems = items.map((item: any) => {
      const prod = allProducts.find((p) => p.id === item.productId || p.id === item.id)!;
      const qty = Math.max(1, Number(item.quantity) || 1);
      const saleType = item.saleType === 'wholesale' ? 'wholesale' : item.saleType === 'box' ? 'box' : 'retail';

      // Strictly derive price from PostgreSQL product and trusted session tier (Requirement 6)
      const pricingRes = getProductPriceForUser(prod, saleType as any, trustedUser);
      const officialPrice = pricingRes.price;

      const itemTotal = officialPrice * qty;
      calculatedSubtotal += itemTotal;

      const cashbackRate = getProductCashbackRate(prod, trustedUser, settings, saleType as any);
      const earnedCashback = cashbackRate * qty;

      return {
        ...item,
        productId: prod.id,
        name: prod.name,
        title: prod.name,
        price: officialPrice,
        quantity: qty,
        saleType,
        unitLabel: item.unitLabel || (saleType === 'wholesale' ? 'كرتون' : saleType === 'box' ? 'علبة' : 'مفرد'),
        image: (prod.images?.[0] && !prod.images[0].startsWith('data:image/'))
          ? prod.images[0]
          : (item.image && !item.image.startsWith('data:image/'))
          ? item.image
          : '',
        costPrice: prod.pieceCostPrice || prod.costPrice,
        cashbackPerUnit: cashbackRate,
        earnedCashback,
      };
    });

    const totalEarnedCashback = verifiedItems.reduce((s: number, it: any) => s + (Number(it.earnedCashback) || 0), 0);

    const minOrder = Number(settings.minOrderAmount) || 0;
    if (minOrder > 0 && calculatedSubtotal < minOrder) {
      return NextResponse.json({
        success: false,
        error: `عذراً، الحد الأدنى لقيمة الطلبية في المتجر هو ${minOrder.toLocaleString()} د.ع. مجموع مشترياتك الحالي هو ${calculatedSubtotal.toLocaleString()} د.ع.`,
      }, { status: 400 });
    }

    // Server-side delivery fee & warehouse readiness verification (Strict Second Defense)
    const pricingMode = settings.deliveryPricingMode || 'fixed';
    if (pricingMode === 'distance_tiered' || pricingMode === 'per_km') {
      const isValidWarehouse =
        settings.warehouseLat !== undefined &&
        settings.warehouseLat !== null &&
        !isNaN(Number(settings.warehouseLat)) &&
        Number(settings.warehouseLat) >= -90 &&
        Number(settings.warehouseLat) <= 90 &&
        settings.warehouseLng !== undefined &&
        settings.warehouseLng !== null &&
        !isNaN(Number(settings.warehouseLng)) &&
        Number(settings.warehouseLng) >= -180 &&
        Number(settings.warehouseLng) <= 180;

      if (!isValidWarehouse) {
        return NextResponse.json(
          {
            success: false,
            error:
              'لا يمكن إتمام الطلب بنظام حساب المسافة لعدم ضبط إحداثيات المستودع في إعدادات المتجر. يرجى مراجعة إدارة المتجر.',
          },
          { status: 400 }
        );
      }
    }

    // Strictly recomputed server-side without trusting client deliveryFee (Requirement 8)
    const verifiedDeliveryFee = getEffectiveDeliveryFee(calculatedSubtotal, settings, customer);

    // Server-side coupon verification (Requirement 3, 7, 10)
    let verifiedDiscount = 0;
    if (couponCode && String(couponCode).trim()) {
      const couponRes = await pgValidateCoupon(String(couponCode).trim(), calculatedSubtotal, effectiveAccountType);
      if (!couponRes.valid) {
        return NextResponse.json({ success: false, error: couponRes.message }, { status: 400 });
      }
      verifiedDiscount = couponRes.discount;
    } else if (discount !== undefined && discount !== null && Number(discount) > 0) {
      // Disallow arbitrary discounts from customers (Requirement 7)
      if (!admin || !hasPermission(admin, 'orders')) {
        return NextResponse.json(
          { success: false, error: 'غير مصرح للعميل بتحديد خصم مباشر. يجب استخدام كود خصم معتمد.' },
          { status: 400 }
        );
      }
      verifiedDiscount = Math.min(calculatedSubtotal, Math.max(0, Number(discount)));
    }

    // Server-side cashback discount
    const verifiedCashbackDiscount = Math.max(0, Number(usedCashbackDiscount) || 0);

    // Calculate final trusted total
    const finalTotal = Math.max(0, calculatedSubtotal + verifiedDeliveryFee - verifiedDiscount - verifiedCashbackDiscount);

    const operator = admin
      ? { name: admin.name, username: admin.username, role: admin.role, id: admin.id }
      : customerSession
      ? { name: customerSession.name || customer.name, username: customerSession.phone, role: 'customer', id: customerSession.id }
      : { name: customer.name, username: customer.phone, role: 'guest' };

    const newOrder = await pgCreateOrder({
      customer,
      items: verifiedItems,
      subtotal: calculatedSubtotal,
      deliveryFee: verifiedDeliveryFee,
      discount: verifiedDiscount,
      couponCode: couponCode && String(couponCode).trim() ? String(couponCode).trim() : undefined,
      userAccountType: effectiveAccountType,
      usedCashbackDiscount: verifiedCashbackDiscount > 0 ? verifiedCashbackDiscount : undefined,
      earnedCashback: totalEarnedCashback > 0 ? totalEarnedCashback : undefined,
      total: finalTotal,
      notes: notes || '',
      paymentMethod: paymentMethod || 'cod',
      status: 'pending',
      accountId,
      createAccountIfMissing: true,
      operator,
    });

    // Generate cryptographic order access token for secure tracking (especially for guests)
    const orderAccessToken = signOrderAccessToken({
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      phone: customer.phone,
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    });

    // Send push alert to customer phone
    try {
      await sendDirectCustomerAlert({
        userId: customer.userId,
        phone: customer.phone,
        title: '📋 تم استلام طلبيتك بنجاح!',
        body: `مرحباً ${customer.name}، تم تسجيل طلبيتك #${newOrder.orderNumber} بمبلغ ${finalTotal.toLocaleString()} د.ع وجاري مراجعتها من الكادر.`,
        url: `/order-success/${newOrder.id}?token=${encodeURIComponent(orderAccessToken)}`,
      });
    } catch (e) {}

    const whatsappUrl = generateWhatsAppLink(newOrder, settings);

    const response = NextResponse.json({
      success: true,
      order: newOrder,
      orderAccessToken,
      whatsappUrl,
    }, { status: 201 });

    // Set scoped cookie for guest tracking on this browser
    response.cookies.set({
      name: `etihad_order_token_${newOrder.id}`,
      value: orderAccessToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
