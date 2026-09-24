import { NextResponse } from 'next/server';
import { getSettings, getUsers, validateCoupon } from '@/lib/db';
import { pgGetOrders, pgCreateOrder } from '@/lib/postgres-orders';
import { pgGetProducts } from '@/lib/postgres-catalog';
import { getProductPriceForUser, getProductCashbackRate } from '@/lib/pricing';
import { generateWhatsAppLink } from '@/lib/whatsapp';
import { sendDirectCustomerAlert } from '@/lib/pushService';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || undefined;
    const phone = searchParams.get('phone') || undefined;
    const email = searchParams.get('email') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;

    const admin = getAuthenticatedAdmin(request);
    const isStaffOrAdmin = admin && hasPermission(admin, 'orders');

    // Security Check: Non-admin users cannot query all orders across the system.
    // They MUST specify their own customer identifier (phone, userId, or email) to only access their own orders.
    if (!isStaffOrAdmin) {
      if (!phone && !userId && !email) {
        return NextResponse.json({
          success: false,
          error: 'غير مصرح لك باستعراض كافة الطلبات (يتطلب جلسة إدارية بصلاحية إدارة الطلبات)',
        }, { status: 401 });
      }
    }

    const orders = await pgGetOrders({
      userId,
      phone,
      email,
      limit,
    });

    return NextResponse.json({ success: true, orders });
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
    const settings = getSettings();
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

    // Session-derived operator for audit trail
    const admin = getAuthenticatedAdmin(request);
    const operator = admin
      ? { name: admin.name, username: admin.username, role: admin.role }
      : { name: customer.name, username: customer.phone, role: 'customer' };

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

    // Send push alert to customer phone
    try {
      await sendDirectCustomerAlert({
        userId: customer.userId,
        phone: customer.phone,
        title: '📋 تم استلام طلبيتك بنجاح!',
        body: `مرحباً ${customer.name}، تم تسجيل طلبيتك #${newOrder.orderNumber} بمبلغ ${finalTotal.toLocaleString()} د.ع وجاري مراجعتها من الكادر.`,
        url: `/order-success/${newOrder.id}`,
      });
    } catch (e) {}

    const whatsappUrl = generateWhatsAppLink(newOrder, settings);

    return NextResponse.json({
      success: true,
      order: newOrder,
      whatsappUrl,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
