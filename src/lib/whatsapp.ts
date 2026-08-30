import { Order, StoreSettings } from '@/types';

export function formatWhatsAppOrderMessage(order: Order, settings: StoreSettings): string {
  const paymentLabels: Record<string, string> = {
    cod: '💵 الدفع عند الاستلام (كاش بالدينار العراقي)',
    zaincash: '📱 زين كاش (ZainCash العراق)',
    qicard: '💳 بطاقة كي كارد / ماستر كارد (Qi Card)',
    bank_transfer: '🏦 تحويل مصرفي (الرافدين / الرشيد / TBI)',
    online: '💳 دفع إلكتروني مباشر',
  };

  const lines: string[] = [
    `🇮🇶🟣 *طلب جديد - ${settings.storeName}* 🟣🇮🇶`,
    `━━━━━━━━━━━━━━━━━━`,
    `🔖 *رقم الطلبية:* \`${order.orderNumber}\``,
    `📅 *التاريخ:* ${new Date(order.createdAt).toLocaleDateString('ar-IQ')} - ${new Date(order.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`,
    ``,
    `👤 *بيانات الزبون وموقع التوصيل:*`,
    `• *الاسم:* ${order.customer.name}`,
    order.customer.businessName ? `• *اسم المحل/المنشأة:* ${order.customer.businessName}` : '',
    `• *رقم الهاتف:* ${order.customer.phone}`,
    order.customer.email ? `• *البريد:* ${order.customer.email}` : '',
    order.customer.locationTitle ? `• *الموقع المخصص:* ${order.customer.locationTitle}` : '',
    `• *المحافظة:* ${order.customer.city}`,
    `• *العنوان بالتفصيل:* ${order.customer.address}`,
    order.customer.mapsUrl ? `• *📍 موقع GPS على الخريطة:* ${order.customer.mapsUrl}` : '',
    order.customer.notes ? `• *ملاحظات التوصيل:* ${order.customer.notes}` : '',
    `• *نوع الحساب:* ${order.customer.isGuest ? 'طلب مباشر (كزائر)' : 'زبون مسجل'}`,
    ``,
    `📦 *السناكات والمواد المطلوبة:*`,
    ...order.items.map((item, index) => {
      const typeTag = item.saleType === 'wholesale' ? ' [📦 جملة / كرتون]' : ' [🛒 مفرد]';
      const unitStr = item.unitLabel ? ` (${item.unitLabel})` : '';
      return `${index + 1}. *${item.name}*${typeTag}${unitStr}\n   ▫️ الكمية: *${item.quantity}* × ${item.price.toLocaleString()} ${settings.currency} = *${(item.quantity * item.price).toLocaleString()}* ${settings.currency}`;
    }),
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `💰 *ملخص الحساب:*`,
    `• المجموع الفرعي: *${order.subtotal.toLocaleString()}* ${settings.currency}`,
    order.discount > 0 ? `• الخصم: *-${order.discount.toLocaleString()}* ${settings.currency}` : '',
    order.usedCashbackDiscount ? `• خصم رصيد الأرباح (كاش باك 🎁): *-${order.usedCashbackDiscount.toLocaleString()}* ${settings.currency}` : '',
    `• كروة التوصيل: *${!order.deliveryFee ? 'مجاناً ⚡' : `${(order.deliveryFee || 0).toLocaleString()} ${settings.currency}`}*`,
    `⭐ *المبلغ الإجمالي:* *${order.total.toLocaleString()}* ${settings.currency}`,
    ``,
    `💳 *طريقة الدفع:* ${paymentLabels[order.paymentMethod] || order.paymentMethod}`,
    `━━━━━━━━━━━━━━━━━━`,
    `يرجى تأكيد استلام الطلبية والتجهيز للتوصيل. شكراً لتعاملكم مع مؤسسة الاتحاد في العراق! 🇮🇶🌾`,
  ].filter(Boolean);

  return lines.join('\n');
}

export function generateWhatsAppLink(order: Order, settings: StoreSettings): string {
  let phone = (settings.whatsappNumber || settings.whatsapp || '9647700000000').replace(/\D/g, '');
  
  // Iraqi phone formatting
  if (phone.startsWith('07')) {
    phone = '964' + phone.substring(1);
  } else if (phone.startsWith('7') && phone.length === 10) {
    phone = '964' + phone;
  } else if (!phone.startsWith('964') && phone.length <= 11) {
    phone = '964' + phone.replace(/^0+/, '');
  }

  const message = formatWhatsAppOrderMessage(order, settings);
  const encoded = encodeURIComponent(message);

  return `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`;
}

export function generateDirectWhatsAppSupportLink(settings: StoreSettings, message = "مرحباً مؤسسة الاتحاد / سوق الجملة، أود التواصل مع قسم الدعم الفني وخدمة العملاء"): string {
  let phone = (settings.supportWhatsappNumber || settings.whatsappNumber || settings.whatsapp || '9647700000000').replace(/\D/g, '');
  if (phone.startsWith('07')) {
    phone = '964' + phone.substring(1);
  } else if (phone.startsWith('7') && phone.length === 10) {
    phone = '964' + phone;
  } else if (!phone.startsWith('964') && phone.length <= 11) {
    phone = '964' + phone.replace(/^0+/, '');
  }
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

export function generateDeliveryCustomerWhatsAppLink(order: Order, driverName: string, settings: StoreSettings): string {
  let phone = (order.customer.phone || '').replace(/\D/g, '');
  if (phone.startsWith('07')) {
    phone = '964' + phone.substring(1);
  } else if (phone.startsWith('7') && phone.length === 10) {
    phone = '964' + phone;
  } else if (!phone.startsWith('964') && phone.length <= 11) {
    phone = '964' + phone.replace(/^0+/, '');
  }

  let paymentText = '💵 تم استلام المبلغ نقداً بالكامل';
  if (order.collectionStatus === 'debt_unpaid') {
    paymentText = `📝 تسليم بالآجل (دين مسجل: ${order.total.toLocaleString()} د.ع)`;
  } else if (order.collectionStatus === 'partial') {
    paymentText = `💳 دفع جزء كاش (${order.collectedAmount?.toLocaleString()} د.ع) والباقي دين (${order.remainingDebtAmount?.toLocaleString()} د.ع)`;
  } else if (order.collectionStatus === 'returned') {
    paymentText = '❌ تعذر التسليم / تم الإرجاع';
  }

  const message = [
    `🌸 *مرحباً ${order.customer.name} المحترم* 🌸`,
    `تم تسليم طلبيتك بنجاح من *${settings.storeName}* 🚚`,
    `━━━━━━━━━━━━━━━━━━`,
    `🔖 *رقم الفاتورة:* #${order.orderNumber}`,
    `📦 *الأصناف:* ${order.items.length} صنف`,
    `💰 *المبلغ الإجمالي:* ${order.total.toLocaleString()} د.ع`,
    `💳 *حالة الدفع والتحصيل:* ${paymentText}`,
    `👤 *مندوب التوصيل:* ${driverName}`,
    `📅 *الوقت:* ${new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })} - ${new Date().toLocaleDateString('ar-IQ')}`,
    `━━━━━━━━━━━━━━━━━━`,
    `شكراً لتعاملكم معنا ونسعد بخدمتكم دائماً! 🌹`,
  ].join('\n');

  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

export function generateDeliveryAccountantWhatsAppLink(order: Order, driverName: string, settings: StoreSettings): string {
  let phone = (settings.accountingWhatsappNumber || settings.whatsappNumber || settings.phone || '9647700000000').replace(/\D/g, '');
  if (phone.startsWith('07')) {
    phone = '964' + phone.substring(1);
  } else if (phone.startsWith('7') && phone.length === 10) {
    phone = '964' + phone;
  } else if (!phone.startsWith('964') && phone.length <= 11) {
    phone = '964' + phone.replace(/^0+/, '');
  }

  let paymentText = `💵 استلم السائق كاش: ${(order.collectedAmount || order.total).toLocaleString()} د.ع`;
  if (order.collectionStatus === 'debt_unpaid') {
    paymentText = `📝 تسليم بالآجل (المبلغ دين كامل: ${order.total.toLocaleString()} د.ع)`;
  } else if (order.collectionStatus === 'partial') {
    paymentText = `💳 تحصيل جزئي: استلم ${order.collectedAmount?.toLocaleString()} د.ع كاش • المتبقي دين: ${order.remainingDebtAmount?.toLocaleString()} د.ع`;
  } else if (order.collectionStatus === 'returned') {
    paymentText = `❌ إرجاع بضاعة / تعذر التسليم (${order.driverNotes || 'مغلق/مرفوض'})`;
  }

  const message = [
    `💼 *إشعار محاسبي: إتمام تسليم وتحصيل طلبية* 💼`,
    `━━━━━━━━━━━━━━━━━━`,
    `🔖 *رقم الفاتورة:* #${order.orderNumber}`,
    `👤 *الزبون / المحل:* ${order.customer.name} ${order.customer.businessName ? `(${order.customer.businessName})` : ''}`,
    `📱 *هاتف الزبون:* ${order.customer.phone}`,
    `📍 *المدينة والعنوان:* ${order.customer.city} - ${order.customer.address}`,
    `💰 *إجمالي الفاتورة:* ${order.total.toLocaleString()} د.ع`,
    `💵 *تفاصيل التحصيل:* ${paymentText}`,
    `🚚 *المندوب المسلم:* ${driverName}`,
    `📅 *تاريخ وساعة التسليم:* ${new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })} - ${new Date().toLocaleDateString('ar-IQ')}`,
    order.driverNotes ? `📝 *ملاحظات السائق:* ${order.driverNotes}` : '',
    `━━━━━━━━━━━━━━━━━━`,
    `النظام المحاسبي الآلي - سوق الجملة والاتحاد 🇮🇶`,
  ].filter(Boolean).join('\n');

  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}
