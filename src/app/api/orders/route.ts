import { NextResponse } from 'next/server';
import { pgGetStoreSettings } from '@/lib/postgres-settings';
import { pgGetOrders, pgCreateOrder, pgResolveCustomerIdentity } from '@/lib/postgres-orders';
import { pgGetProducts } from '@/lib/postgres-catalog';
import { pgValidateCoupon } from '@/lib/postgres-coupons';
import { pgResolveCustomerAccount, pgGetAccountCashbackBalance } from '@/lib/postgres-cashback';
import { getProductPriceForUser, resolveAuthoritativeProductPrice, getProductCashbackRate, validateOrderItemQuantity } from '@/lib/pricing';
import { getEffectiveDeliveryFee } from '@/lib/delivery';
import { generateWhatsAppLink } from '@/lib/whatsapp';
import { sendDirectCustomerAlert } from '@/lib/pushService';
import { toCanonicalIraqiPhone } from '@/lib/phone-utils';
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

    const admin = await getAuthenticatedAdmin(request);
    const isStaffOrAdmin = admin && hasPermission(admin, 'orders');

    if (isStaffOrAdmin) {
      const userId = searchParams.get('userId') || undefined;
      const phone = searchParams.get('phone') || undefined;
      const email = searchParams.get('email') || undefined;

      const orders = await pgGetOrders({ userId, phone, email, limit, status });
      return NextResponse.json({ success: true, orders, count: orders.length });
    }

    const customer = await getAuthenticatedCustomer(request);
    if (!customer) {
      return NextResponse.json({
        success: false,
        error: 'غير مصرح لك باستعراض الطلبات (يتطلب جلسة مسجلة للزبون أو صلاحية إدارية)',
      }, { status: 401 });
    }

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

    const admin = await getAuthenticatedAdmin(request);
    const customerSession = await getAuthenticatedCustomer(request);

    let trustedUser: any = null;

    if (admin && customer.userId) {
      trustedUser = await pgResolveCustomerIdentity(customer.userId);
    } else if (customerSession) {
      const pgUser = await pgResolveCustomerIdentity({
        userId: customerSession.id,
        phone: customerSession.phone,
        merchantTier: customerSession.merchantTier,
      });
      trustedUser = pgUser || {
        id: customerSession.id,
        phone: customerSession.phone,
        name: customerSession.name,
        accountType: customerSession.accountType || 'individual',
        merchantStatus: customerSession.merchantStatus,
        merchantTier: customerSession.merchantTier,
        pricingTier: customerSession.pricingTier,
        isActive: true,
      };
      customer.userId = customerSession.id;
      if (!customer.phone || customer.phone.trim() === '') {
        customer.phone = customerSession.phone;
      }
    } else {
      trustedUser = null;
      customer.userId = undefined;
    }

    const effectiveAccountType = trustedUser?.accountType || 'individual';

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
          error: 'حسابك (ماركت/تاجر) قيد المراجعة والتدقيق من قبل الإدارة حالياً. لا يمكن إرسال فواتير الشراء إلا بعد قيام الإدارة بالاتصال بك واعتماد الحساب.',
        },
        { status: 403 }
      );
    }

    const settings = await pgGetStoreSettings();
    const allProducts = await pgGetProducts();
    let calculatedSubtotal = 0;

    for (const item of items) {
      const prodId = item.productId || item.id;
      if (!prodId) {
        return NextResponse.json({ success: false, error: 'أحد الأصناف لا يحتوي على معرّف منتج صالح' }, { status: 400 });
      }
      const prod = allProducts.find((p) => p.id === prodId);
      if (!prod || prod.isActive === false || prod.isArchived === true || (prod as any).status === 'inactive' || (prod as any).status === 'archived') {
        return NextResponse.json({
          success: false,
          error: `المنتج "${item.name || item.title || prodId}" غير موجود أو غير متوفر حالياً.`,
        }, { status: 400 });
      }
      const qtyRes = validateOrderItemQuantity(item.quantity);
      if (!qtyRes.valid) {
        return NextResponse.json({
          success: false,
          error: `كمية غير صالحة للصنف (${prod.name}): ${qtyRes.error}`,
        }, { status: 400 });
      }

      const shouldRejectStale = body.rejectStaleCartPrice === true || body.enforceExactCartPrices === true || item.enforceExactPrice === true;
      if (!admin && shouldRejectStale && item.price !== undefined && item.price !== null && item.price !== '') {
        const saleType = item.saleType === 'wholesale' ? 'wholesale' : item.saleType === 'box' ? 'box' : 'retail';
        const authPricing = resolveAuthoritativeProductPrice({ product: prod, saleType: saleType as any, user: trustedUser });
        const officialPrice = authPricing.finalUnitPrice;
        const submittedPrice = Number(item.price);
        if (!isNaN(submittedPrice) && Math.abs(submittedPrice - officialPrice) >= 0.01) {
          return NextResponse.json({
            success: false,
            code: 'STALE_CART_PRICE',
            error: `تغير سعر المنتج "${prod.name}" من ${submittedPrice.toLocaleString()} د.ع إلى ${officialPrice.toLocaleString()} د.ع، يرجى مراجعة وتحديث السلة والمتابعة.`,
          }, { status: 400 });
        }
      }
    }

    const verifiedItems = items.map((item: any) => {
      const prod = allProducts.find((p) => p.id === item.productId || p.id === item.id)!;
      const qtyRes = validateOrderItemQuantity(item.quantity);
      const qty = qtyRes.quantity!;
      const saleType = item.saleType === 'wholesale' ? 'wholesale' : item.saleType === 'box' ? 'box' : 'retail';
      const authPricing = resolveAuthoritativeProductPrice({ product: prod, saleType: saleType as any, user: trustedUser });
      const officialPrice = authPricing.finalUnitPrice;
      const itemTotal = officialPrice * qty;
      calculatedSubtotal += itemTotal;
      const cashbackRate = getProductCashbackRate(prod, trustedUser, settings, saleType as any);
      const earnedCashback = cashbackRate * qty;
      const originalPriceSnap = authPricing.originalUnitPrice;
      const offerIdSnap = authPricing.offerId || undefined;
      const offerDiscountSnap = authPricing.offerSavingsPerUnit;
      const pricingTierSnap = authPricing.pricingTierApplied;

      return {
        ...item,
        productId: prod.id,
        name: prod.name,
        title: prod.name,
        price: officialPrice,
        originalPrice: originalPriceSnap,
        offerId: offerIdSnap,
        offerDiscount: offerDiscountSnap,
        originalPriceSnap,
        offerIdSnap,
        offerDiscountSnap,
        pricingTierSnap,
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
            error: 'لا يمكن إتمام الطلب بنظام حساب المسافة لعدم ضبط إحداثيات المستودع في إعدادات المتجر. يرجى مراجعة إدارة المتجر.',
          },
          { status: 400 }
        );
      }
    }

    const verifiedDeliveryFee = getEffectiveDeliveryFee(calculatedSubtotal, settings, customer);
    let verifiedDiscount = 0;
    if (couponCode && String(couponCode).trim()) {
      const calculatedNonDiscountedSubtotal = verifiedItems.reduce((acc: number, it: any) => {
        const isDiscounted = Boolean(it.offerIdSnap || (it.offerDiscountSnap && it.offerDiscountSnap > 0));
        return isDiscounted ? acc : acc + (Number(it.price) * Number(it.quantity));
      }, 0);

      const couponRes = await pgValidateCoupon(
        String(couponCode).trim(),
        calculatedSubtotal,
        effectiveAccountType,
        {
          eligibleSubtotal: calculatedNonDiscountedSubtotal,
          customerId: customer.userId || null,
          customerPhone: customer.phone ? toCanonicalIraqiPhone(customer.phone) : null,
        }
      );
      if (!couponRes.valid) {
        return NextResponse.json({ success: false, error: couponRes.message }, { status: 400 });
      }
      verifiedDiscount = couponRes.discount;
    } else if (discount !== undefined && discount !== null && Number(discount) > 0) {
      if (!admin || !hasPermission(admin, 'orders')) {
        return NextResponse.json(
          { success: false, error: 'غير مصرح للعميل بتحديد خصم مباشر. يجب استخدام كود خصم معتمد.' },
          { status: 400 }
        );
      }
      verifiedDiscount = Math.min(calculatedSubtotal, Math.max(0, Number(discount)));
    }

    let verifiedCashbackDiscount = 0;
    const requestedCashback = Number(usedCashbackDiscount);

    if (!isNaN(requestedCashback) && requestedCashback > 0) {
      if (!customerSession && !admin) {
        return NextResponse.json(
          { success: false, error: 'غير مصرح للزائر باستخدام رصيد الأرباح. يرجى تسجيل الدخول بحسابك أولاً.' },
          { status: 400 }
        );
      }

      const customerAccount = await pgResolveCustomerAccount({
        accountId,
        userId: customerSession?.id || (admin ? customer.userId : undefined),
        phone: customerSession?.phone || customer.phone,
      });

      if (!customerAccount) {
        return NextResponse.json(
          { success: false, error: 'لم يتم العثور على حساب مالي موثوق مرتبط بك لاستخدام رصيد الأرباح' },
          { status: 400 }
        );
      }

      const availableBalance = await pgGetAccountCashbackBalance(customerAccount.id);
      if (availableBalance <= 0) {
        return NextResponse.json(
          { success: false, error: 'رصيد الأرباح المتاح لديك هو 0 د.ع ولا يمكن استخدام رصيد أرباح في هذا الطلب' },
          { status: 400 }
        );
      }
      if (requestedCashback > availableBalance) {
        return NextResponse.json(
          {
            success: false,
            error: `رصيد الأرباح المتاح لديك (${availableBalance.toLocaleString()} د.ع) أقل من المبلغ المطلوب (${requestedCashback.toLocaleString()} د.ع).`,
          },
          { status: 400 }
        );
      }
      const maxAllowableCashback = Math.max(0, calculatedSubtotal - verifiedDiscount);
      verifiedCashbackDiscount = Math.min(requestedCashback, availableBalance, maxAllowableCashback);
    }

    const finalTotal = Math.max(0, calculatedSubtotal + verifiedDeliveryFee - verifiedDiscount - verifiedCashbackDiscount);
    const operator = admin
      ? { name: admin.name, username: admin.username, role: admin.role, id: admin.id }
      : customerSession
      ? { name: customerSession.name || customer.name, username: customerSession.phone, role: 'customer', id: customerSession.id }
      : { name: customer.name, username: customer.phone, role: 'guest' };

    const idempotencyKey =
      request.headers.get('idempotency-key') ||
      request.headers.get('Idempotency-Key') ||
      request.headers.get('x-idempotency-key') ||
      (body.idempotencyKey ? String(body.idempotencyKey).trim() : undefined) ||
      undefined;

    const newOrder = await pgCreateOrder({
      customer,
      items: verifiedItems,
      subtotal: calculatedSubtotal,
      deliveryFee: verifiedDeliveryFee,
      discount: verifiedDiscount,
      couponCode: couponCode && String(couponCode).trim() ? String(couponCode).trim() : undefined,
      userAccountType: effectiveAccountType,
      userMerchantTier: trustedUser?.merchantTier,
      usedCashbackDiscount: verifiedCashbackDiscount > 0 ? verifiedCashbackDiscount : undefined,
      earnedCashback: totalEarnedCashback > 0 ? totalEarnedCashback : undefined,
      total: finalTotal,
      notes: notes || '',
      paymentMethod: paymentMethod || 'cod',
      status: 'pending',
      accountId,
      createAccountIfMissing: true,
      operator,
      idempotencyKey,
    });

    const orderAccessToken = signOrderAccessToken({
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      phone: customer.phone,
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    });

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
    const isConflict =
      error?.code === 'IDEMPOTENCY_CONFLICT' ||
      String(error?.message).toLowerCase().includes('idempotency conflict');
    if (isConflict) {
      return NextResponse.json({
        success: false,
        code: 'IDEMPOTENCY_CONFLICT',
        error: error.message,
      }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
