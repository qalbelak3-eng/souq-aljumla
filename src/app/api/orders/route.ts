import { NextResponse } from 'next/server';
import { getUsers, validateCoupon } from '@/lib/db';
import { pgGetStoreSettings } from '@/lib/postgres-settings';
import { pgGetOrders, pgCreateOrder } from '@/lib/postgres-orders';
import { pgGetProducts } from '@/lib/postgres-catalog';
import { getProductPriceForUser, getProductCashbackRate } from '@/lib/pricing';
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

    // Check if customer is a pending merchant or market
    const allUsers = getUsers();
    const existingUser = customer.userId
      ? allUsers.find((u) => u.id === customer.userId)
      : allUsers.find((u) => u.phone && u.phone.replace(/\D/g, '') === customer.phone.replace(/\D/g, ''));

    if (
      existingUser &&
      (existingUser.accountType === 'market' ||
        existingUser.accountType === 'wholesale' ||
        existingUser.accountType === 'merchant') &&
      existingUser.merchantStatus === 'pending'
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

    const verifiedItems = items.map((item: any) => {
      const prod = allProducts.find((p) => p.id === item.productId || p.id === item.id);
      const qty = Math.max(1, Number(item.quantity) || 1);
      const saleType = item.saleType === 'wholesale' ? 'wholesale' : item.saleType === 'box' ? 'box' : 'retail';

      let officialPrice = Number(item.price);
      if (prod) {
        const pricingRes = getProductPriceForUser(prod, saleType as any, existingUser);
        officialPrice = pricingRes.price;
      }

      const itemTotal = officialPrice * qty;
      calculatedSubtotal += itemTotal;

      const cashbackRate = prod ? getProductCashbackRate(prod, existingUser, settings, saleType as any) : 0;
      const earnedCashback = cashbackRate * qty;

      return {
        ...item,
        productId: prod?.id || item.productId || item.id,
        name: prod?.name || item.name || item.title || 'صنف',
        title: prod?.name || item.title || item.name || 'صنف',
        price: officialPrice,
        quantity: qty,
        saleType,
        unitLabel: item.unitLabel || (saleType === 'wholesale' ? 'كرتون' : saleType === 'box' ? 'علبة' : 'مفرد'),
        image: (prod?.images?.[0] && !prod.images[0].startsWith('data:image/'))
          ? prod.images[0]
          : (item.image && !item.image.startsWith('data:image/'))
          ? item.image
          : '',
        costPrice: prod?.pieceCostPrice || prod?.costPrice,
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

    // Server-side delivery fee verification
    const freeDeliveryThreshold = Number(settings.freeDeliveryThreshold) || 100000;
    const defaultDeliveryFee = Number(settings.deliveryFee) || 5000;
    const verifiedDeliveryFee = calculatedSubtotal >= freeDeliveryThreshold ? 0 : (deliveryFee !== undefined ? Number(deliveryFee) : defaultDeliveryFee);

    // Server-side coupon verification
    let verifiedDiscount = 0;
    if (couponCode) {
      const couponRes = validateCoupon(couponCode, calculatedSubtotal);
      if (couponRes.valid) {
        verifiedDiscount = couponRes.discount;
      }
    } else if (discount) {
      verifiedDiscount = Math.min(calculatedSubtotal, Math.max(0, Number(discount)));
    }

    // Server-side cashback discount
    const verifiedCashbackDiscount = Math.max(0, Number(usedCashbackDiscount) || 0);

    // Calculate final trusted total
    const finalTotal = Math.max(0, calculatedSubtotal + verifiedDeliveryFee - verifiedDiscount - verifiedCashbackDiscount);

    // Session-derived operator and identity binding
    const admin = getAuthenticatedAdmin(request);
    const customerSession = getAuthenticatedCustomer(request);

    // If an authenticated customer is placing an order, bind the order to their verified account
    if (customerSession && !admin) {
      customer.userId = customerSession.id;
      if (!customer.phone || customer.phone.trim() === '') {
        customer.phone = customerSession.phone;
      }
    }

    const operator = admin
      ? { name: admin.name, username: admin.username, role: admin.role }
      : customerSession
      ? { name: customerSession.name || customer.name, username: customerSession.phone, role: 'customer' }
      : { name: customer.name, username: customer.phone, role: 'guest' };

    const newOrder = await pgCreateOrder({
      customer,
      items: verifiedItems,
      subtotal: calculatedSubtotal,
      deliveryFee: verifiedDeliveryFee,
      discount: verifiedDiscount,
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
