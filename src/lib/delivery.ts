import { StoreSettings } from '@/types';

/**
 * حساب المسافة بين نقطتين جغرافيتين باستخدام معادلة Haversine
 * النتيجة بالكيلومتر
 */
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * حساب كروة التوصيل بناءً على المسافة الفعلية بالكيلومتر
 */
export function calculateDeliveryFeeByDistance(
  customerLat: number,
  customerLng: number,
  settings: StoreSettings
): { fee: number; distanceKm: number; method: 'gps' } | null {
  const { warehouseLat, warehouseLng, pricePerKm, minDeliveryFee, maxDeliveryFee } = settings;

  // تحقق من توفر بيانات المخزن وسعر الكيلومتر
  if (!warehouseLat || !warehouseLng || !pricePerKm) return null;

  const distanceKm = calculateDistanceKm(warehouseLat, warehouseLng, customerLat, customerLng);

  let fee = Math.round(distanceKm * pricePerKm);

  // تطبيق الحد الأدنى
  if (minDeliveryFee && fee < minDeliveryFee) {
    fee = minDeliveryFee;
  }

  // تطبيق الحد الأقصى
  if (maxDeliveryFee && fee > maxDeliveryFee) {
    fee = maxDeliveryFee;
  }

  // تقريب لأقرب 250 دينار لمزيد من المنطقية
  fee = Math.round(fee / 250) * 250;

  return { fee, distanceKm: Math.round(distanceKm * 10) / 10, method: 'gps' };
}

export interface KarbalaAreaOption {
  name: string;
  tier: 'close' | 'medium' | 'far';
  tierLabel: string;
  zoneId: string;
  defaultFee: number;
}

export const KARBALA_AREAS: KarbalaAreaOption[] = [
  // 1. المناطق القريبة والمركز (أقل من 5 كم - 2,000 د.ع)
  { name: 'كربلاء - المركز والمدينة القديمة', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - العباسية (الشرقية / الغربية)', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - حي الحسين (ع)', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - حي المعلمين', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - حي الإسكان والجمعية', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - باب بغداد / باب الخان', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - شارع السناتر وحي البلدية', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - حي النقيب والمهندسين', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },

  // 2. المناطق المتوسطة (5 - 12 كم - 3,000 د.ع)
  { name: 'كربلاء - حي الحر', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي رمضان والتحدي', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي الموظفين', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي الغدير والوفاء', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي الميلاد والضباط', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - الإبراهيمية وحي العسكري', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي السلام وحي النصر', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - منطقة التعليب والصناعي', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },

  // 3. المناطق البعيدة والأطراف (أكثر من 12 كم - 5,000 د.ع)
  { name: 'كربلاء - قضاء الهندية (طويريج)', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - ناحية الجدول الغربي', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - ناحية الخيرات', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - قضاء عين التمر (شثاثة)', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - ناحية الحسينية', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - مجمع درة كربلاء والأطراف', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - منطقة الرزازة والأرياف', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - منطقة أخرى (حسب الاتفاق)', tier: 'medium', tierLabel: 'منطقة مخصصة 📍', zoneId: 'medium', defaultFee: 3000 },
];

/**
 * حساب كروة التوصيل الفعلية أو التقديرية بناءً على إعدادات المتجر وبيانات الزبون
 */
export function getEffectiveDeliveryFee(
  subtotal: number,
  settings: Partial<StoreSettings> | null | undefined,
  user?: { city?: string; address?: string; lat?: number; lng?: number } | null
): number {
  const freeThreshold = settings?.freeDeliveryThreshold ?? 50000;
  if (subtotal >= freeThreshold && subtotal > 0) {
    return 0;
  }
  if (subtotal === 0) return 0;

  // 1. حساب بالكيلومتر GPS إذا كان موقع الزبون والمخزن متوفراً
  if (user?.lat && user?.lng && settings && settings.warehouseLat && settings.pricePerKm) {
    const gpsRes = calculateDeliveryFeeByDistance(user.lat, user.lng, settings as StoreSettings);
    if (gpsRes) return gpsRes.fee;
  }

  // 2. حساب بالمنطقة المحددة إذا كان مسجل الدخول
  if (user?.city || user?.address) {
    const textToMatch = `${user?.city || ''} ${user?.address || ''}`;
    const matchedArea = KARBALA_AREAS.find((a) => {
      const cleanName = a.name.replace('كربلاء - ', '').trim();
      return textToMatch.includes(cleanName) || textToMatch.includes(a.name);
    });

    if (matchedArea) {
      if (settings?.deliveryZones) {
        const zoneSetting = settings.deliveryZones.find((z) => z.id === matchedArea.zoneId);
        if (zoneSetting && typeof zoneSetting.fee === 'number') {
          return zoneSetting.fee;
        }
      }
      return matchedArea.defaultFee;
    }
  }

  // 3. الكروة الافتراضية
  if (typeof settings?.deliveryFee === 'number') {
    return settings.deliveryFee;
  }
  return 3000;
}
