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
