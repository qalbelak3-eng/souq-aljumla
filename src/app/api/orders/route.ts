import { NextResponse } from 'next/server';
import { getOrders, createOrder, getSettings, getUsers, getProducts, validateCoupon } from '@/lib/db';
import { getProductPriceForUser } from '@/lib/pricing';
import { generateWhatsAppLink } from '@/lib/whatsapp';
import { sendDirectCustomerAlert } from '@/lib/pushService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const orders = getOrders();
    return NextResponse.json({ success: true, orders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customer, items, deliveryFee, discount, couponCode, usedCashbackDiscount, paymentMethod, notes } = body;

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
    const allProducts = getProducts();
    let calculatedSubtotal = 0;

    const verifiedItems = items.map((item: any) => {
      const prod = allProducts.find((p) => p.id === item.productId || p.id === item.id);
      const qty = Math.max(1, Number(item.quantity) || 1);
      const saleType = item.saleType === 'wholesale' ? 'wholesale' : 'retail';

      let officialPrice = Number(item.price);
      if (prod) {
        const pricingRes = getProductPriceForUser(prod, saleType, existingUser);
        officialPrice = pricingRes.price;
      }

      const itemTotal = officialPrice * qty;
      calculatedSubtotal += itemTotal;

      return {
        ...item,
        productId: prod?.id || item.productId || item.id,
        name: prod?.name || item.name,
        price: officialPrice,
        quantity: qty,
        saleType,
        unitLabel: item.unitLabel || (saleType === 'wholesale' ? 'كرتون' : 'مفرد'),
        image: prod?.images?.[0] || item.image || '',
        costPrice: prod?.costPrice,
      };
    });

    const settings = getSettings();
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

    const newOrder = createOrder({
      customer,
      items: verifiedItems,
      subtotal: calculatedSubtotal,
      deliveryFee: verifiedDeliveryFee,
      discount: verifiedDiscount,
      usedCashbackDiscount: verifiedCashbackDiscount > 0 ? verifiedCashbackDiscount : undefined,
      total: finalTotal,
      notes: notes || '',
      paymentMethod: paymentMethod || 'cod',
      status: 'pending',
      whatsappSent: false,
    });

    // إرسال تنبيه فوري لهاتف الزبون: تم استلام الطلبية بنجاح 📋
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
