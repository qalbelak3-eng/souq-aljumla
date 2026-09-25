import {
  Driver,
  Vehicle,
  Order,
  DriverBaseStatus,
  DriverOperationalStatus,
  QueuedDeliveryOrder,
  DriverDeliveryQueueResult,
} from '@/types';
import { calculateDistanceKm } from '@/lib/delivery';

export const HIGH_CUSTODY_THRESHOLD = 500_000; // 500,000 IQD
export const HIGH_CUSTODY_WARNING = '⚠️ عهدة مرتفعة — يفضّل إجراء تسوية قبل إسناد طلبات نقدية جديدة';

/**
 * احتساب الحالة التشغيلية الفعلية للسائق (Effective Operational Status)
 * - إذا كان السائق في استراحة 'break' -> يبقى 'break' ☕
 * - إذا كان السائق خارج الدوام 'off_duty' -> يبقى 'off_duty' ⚫
 * - إذا كان السائق متاحاً 'available' ولديه طلبات خرجت للتوصيل الفعلي بالطريق (inFlightDeliveries > 0) -> يتحول تشغيلياً إلى 'busy' 🟠
 * - إذا كان السائق متاحاً 'available' وبدون طلبات بالطريق (inFlightDeliveries === 0) -> يبقى 'available' 🟢
 */
export function computeDriverOperationalStatus(
  baseStatus?: DriverBaseStatus | string,
  inFlightDeliveries: number = 0
): DriverOperationalStatus {
  const clean = String(baseStatus || '').toLowerCase().trim();
  if (clean === 'break') return 'break';
  if (clean === 'off_duty') return 'off_duty';
  if (inFlightDeliveries > 0) return 'busy';
  return 'available';
}

/**
 * فحص ما إذا كان الطلب يتطلب تحصيلاً نقدياً من قبل السائق
 * الطرق غير النقدية: دفع إلكتروني، زين كاش، كي كارد، تحويل بنكي، أو دين/آجل مسجل
 */
export function isOrderCashCollection(
  order?: Partial<Order> | { paymentMethod?: string; collectionStatus?: string } | null
): boolean {
  if (!order) return true;
  const method = String(order.paymentMethod || '').toLowerCase().trim();
  if (['online', 'zaincash', 'qicard', 'bank_transfer', 'debt'].includes(method)) {
    return false;
  }
  if (order.collectionStatus === 'debt_unpaid') {
    return false;
  }
  return true;
}

export interface RankedDriver<T extends Driver = Driver> {
  driver: T;
  isRecommended: boolean;
  hasActiveVehicle: boolean;
  activeDeliveries: number;
  inFlightDeliveries: number;
  currentCashInHand: number;
  completedDeliveries: number;
  isHighCustody: boolean;
  operationalStatus: DriverOperationalStatus;
  effectiveStatus: DriverOperationalStatus;
  reasons: string[];
}

/**
 * التحقق من امتلاك السائق لمركبة فعالة
 */
export function driverHasActiveVehicle(driver: Driver, vehicles?: Vehicle[]): boolean {
  if (vehicles && vehicles.length > 0) {
    if (driver.defaultVehicleId) {
      const v = vehicles.find((veh) => veh.id === driver.defaultVehicleId);
      return Boolean(v && v.isActive);
    }
    return false;
  }
  if ((driver as any).isVehicleActive !== undefined) {
    return Boolean((driver as any).isVehicleActive);
  }
  return Boolean(driver.defaultVehicleId && driver.vehicleInfo);
}

/**
 * خوارزمية الترتيب الذكي للسائقين (Smart Recommendation)
 * 1. استبعاد السائقين غير الفعالين (isActive === false).
 * 2. استبعاد السائقين في حالة استراحة (break) أو خارج الدوام (off_duty).
 * 3. إعطاء أفضلية للمتاح (available) على المشغول (busy).
 * 4. تطبيق معايير التوزيع التشغيلي:
 *    - أفضلية من لديه مركبة فعالة.
 *    - الأقل في إجمالي الحمل التشغيلي (activeDeliveries).
 *    - للطلبات النقدية: الأقل في العهدة النقدية (currentCashInHand).
 *      للطلبات غير النقدية: الأكثر خبرة وإنجازاً (completedDeliveries).
 * 5. كسر التعادل بمعيار قطعي ثابت (Deterministic Tiebreaker) باستخدام الاسم أو المعرف.
 */
export function rankDriversForOrder<T extends Driver = Driver>(
  allDrivers: T[],
  order?: Partial<Order> | { paymentMethod?: string; collectionStatus?: string } | null,
  vehicles?: Vehicle[]
): RankedDriver<T>[] {
  // 1. استبعاد السائقين غير الفعالين إدارياً
  const activeDrivers = (allDrivers || []).filter((d) => d && d.isActive !== false);
  if (activeDrivers.length === 0) return [];

  // 2. تصفية واستبعاد السائقين في استراحة أو خارج الدوام
  const eligibleDrivers = activeDrivers.filter((driver) => {
    const rawStatus = (driver as any).operationalStatus || (driver as any).effectiveStatus;
    const inFlightDeliveries = Number((driver as any).inFlightDeliveries || 0);
    const effStatus = computeDriverOperationalStatus(rawStatus, inFlightDeliveries);
    return effStatus !== 'break' && effStatus !== 'off_duty';
  });

  if (eligibleDrivers.length === 0) return [];

  const isCash = isOrderCashCollection(order);

  const decorated: RankedDriver<T>[] = eligibleDrivers.map((driver) => {
    const hasActiveVehicle = driverHasActiveVehicle(driver, vehicles);
    const activeDeliveries = Number((driver as any).activeDeliveries || 0);
    const inFlightDeliveries = Number((driver as any).inFlightDeliveries || 0);
    const currentCashInHand = Number(driver.currentCashInHand || 0);
    const completedDeliveries = Number((driver as any).completedDeliveries || 0);
    const isHighCustody = currentCashInHand >= HIGH_CUSTODY_THRESHOLD;
    const baseStatus = ((driver as any).operationalStatus as DriverBaseStatus) || 'available';
    const effectiveStatus = (driver as any).effectiveStatus || computeDriverOperationalStatus(baseStatus, inFlightDeliveries);

    return {
      driver,
      isRecommended: false,
      hasActiveVehicle,
      activeDeliveries,
      inFlightDeliveries,
      currentCashInHand,
      completedDeliveries,
      isHighCustody,
      operationalStatus: baseStatus,
      effectiveStatus,
      reasons: [],
    };
  });

  // فرز السائقين حسب المعايير المحددة
  decorated.sort((a, b) => {
    // معيار 1: أفضلية المتاح (available) على المشغول (busy)
    const aIsAvail = a.effectiveStatus === 'available';
    const bIsAvail = b.effectiveStatus === 'available';
    if (aIsAvail !== bIsAvail) {
      return aIsAvail ? -1 : 1;
    }

    // معيار 2: أفضلية من لديه مركبة فعالة (1 قبل 0)
    if (a.hasActiveVehicle !== b.hasActiveVehicle) {
      return a.hasActiveVehicle ? -1 : 1;
    }

    // معيار 3: الأقل في عدد الطلبات النشطة (الأقل حملاً)
    if (a.activeDeliveries !== b.activeDeliveries) {
      return a.activeDeliveries - b.activeDeliveries;
    }

    // معيار 4: العهدة النقدية مقابل طبيعة الطلب
    if (isCash) {
      // الطلب نقدي: الأقل عهدة نقدية أفضل لمنع تراكم الكاش
      if (a.currentCashInHand !== b.currentCashInHand) {
        return a.currentCashInHand - b.currentCashInHand;
      }
      // عند التعادل: الأكثر إنجازاً
      if (a.completedDeliveries !== b.completedDeliveries) {
        return b.completedDeliveries - a.completedDeliveries;
      }
    } else {
      // الطلب غير نقدي (أونلاين / زين كاش / كي كارد / دين):
      // لا نجعل ارتفاع العهدة سبباً لتخفيض الترتيب! الأولوية للأكثر إنجازاً/خبرة
      if (a.completedDeliveries !== b.completedDeliveries) {
        return b.completedDeliveries - a.completedDeliveries;
      }
      // إذا تساويا في الإنجاز: الأقل عهدة
      if (a.currentCashInHand !== b.currentCashInHand) {
        return a.currentCashInHand - b.currentCashInHand;
      }
    }

    // معيار 5: كسر التعادل القطعي الثابت (Deterministic Tiebreaker)
    const nameDiff = String(a.driver.name || '').localeCompare(String(b.driver.name || ''), 'ar');
    if (nameDiff !== 0) return nameDiff;

    return String(a.driver.id || '').localeCompare(String(b.driver.id || ''));
  });

  // وسم السائق الأول كـ "مقترح"
  if (decorated.length > 0) {
    decorated[0].isRecommended = true;
    const reasons: string[] = [];
    if (decorated[0].effectiveStatus === 'available') {
      reasons.push('متاح 🟢');
    } else {
      reasons.push('مشغول 🟠');
    }
    if (decorated[0].hasActiveVehicle) reasons.push('مركبة فعالة');
    reasons.push(`${decorated[0].activeDeliveries} طلبات نشطة`);
    if (isCash) {
      reasons.push(`عهدة ${decorated[0].currentCashInHand.toLocaleString()} د.ع`);
    } else {
      reasons.push('طلب غير نقدي');
    }
    decorated[0].reasons = reasons;
  }

  return decorated;
}

/* =========================================================
   Phase Dispatch-3: Multi-Order Smart Delivery Queue
   ========================================================= */

export const DEFAULT_WAREHOUSE_COORDINATES = { lat: 32.6068, lng: 44.0186 }; // كربلاء المقدسة - المستودع الرئيسي

/**
 * فحص صحة الإحداثيات الجغرافية
 */
export function isValidCoords(lat: any, lng: any): boolean {
  if (lat === undefined || lat === null || lng === undefined || lng === null) return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) return false;
  if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) return false;
  if (numLat === 0 && numLng === 0) return false;
  return true;
}

/**
 * استخراج إحداثيات الطلب بدقة (سواء من كائن customer أو مباشرة من الطلب)
 */
export function extractOrderCoords(order: any): { lat: number; lng: number } | null {
  if (!order) return null;
  const lat = order.customer?.lat ?? order.lat;
  const lng = order.customer?.lng ?? order.lng;
  if (isValidCoords(lat, lng)) {
    return { lat: Number(lat), lng: Number(lng) };
  }
  return null;
}

/**
 * استخراج العنوان والعلامة المميزة locationDesc من العنوان المحفوظ
 */
export function extractOrderAddress(order: any): { baseAddress: string; locationDesc: string | null } {
  const fullAddress = order?.customer?.address || order?.deliveryAddressSnap || '';
  const parts = String(fullAddress).split('\n');
  const baseAddress = parts[0]?.trim() || '';
  const locationDesc = parts.length > 1 ? parts.slice(1).join('\n').trim() || null : null;
  return { baseAddress, locationDesc };
}

/**
 * توليد رابط خرائط Google للملاحة
 */
export function extractOrderMapsUrl(order: any): string {
  if (order?.customer?.mapsUrl) return order.customer.mapsUrl;
  if (order?.mapsUrl) return order.mapsUrl;
  const coords = extractOrderCoords(order);
  if (coords) {
    return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
  }
  const { baseAddress } = extractOrderAddress(order);
  const city = order?.customer?.city || order?.city || '';
  const query = encodeURIComponent(`${city} ${baseAddress}`.trim());
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}

/**
 * كسر التعادل قطعي وثابت (Deterministic Tiebreaker)
 */
export function compareOrdersDeterministically(a: any, b: any): number {
  const numA = String(a?.orderNumber || '');
  const numB = String(b?.orderNumber || '');
  const cmpNum = numA.localeCompare(numB);
  if (cmpNum !== 0) return cmpNum;

  const idA = String(a?.id || '');
  const idB = String(b?.id || '');
  return idA.localeCompare(idB);
}

export interface BuildDeliveryQueueOptions {
  warehouseLocation?: { lat: number; lng: number } | null;
  lastDeliveredLocation?: { lat: number; lng: number } | null;
  historyOrders?: any[];
}

/**
 * تحديد نقطة الانطلاق المرجعية لحساب مسار التوصيل:
 * 1. إذا توفر موقع آخر طلب تم تسليمه -> يستخدم كنقطة انطلاق (بدل العودة للمخزن).
 * 2. إذا توفر موقع المخزن في الإعدادات -> يستخدم كنقطة انطلاق في بداية الجولة.
 * 3. مستودع كربلاء الافتراضي كـ Fallback.
 */
export function resolveDeliveryQueueOrigin(options?: BuildDeliveryQueueOptions): {
  coords: { lat: number; lng: number } | null;
  type: 'last_delivered' | 'warehouse' | 'fallback' | 'none';
  label: string;
} {
  // 1. موقع صريح لآخر طلب تم تسليمه
  if (options?.lastDeliveredLocation && isValidCoords(options.lastDeliveredLocation.lat, options.lastDeliveredLocation.lng)) {
    return {
      coords: { lat: Number(options.lastDeliveredLocation.lat), lng: Number(options.lastDeliveredLocation.lng) },
      type: 'last_delivered',
      label: 'موقع آخر طلب تم تسليمه 📍',
    };
  }

  // 2. البحث عن آخر طلب تم تسليمه في سجل طلبات السائق (historyOrders)
  if (options?.historyOrders && options.historyOrders.length > 0) {
    const deliveredWithCoords = options.historyOrders
      .filter((o) => {
        const isDelivered = o?.status === 'delivered' || o?.collectionStatus === 'collected_cash' || o?.deliveredAt;
        if (!isDelivered) return false;
        return extractOrderCoords(o) !== null;
      })
      .sort((a, b) => {
        const timeA = new Date(a?.deliveredAt || a?.updatedAt || a?.createdAt || 0).getTime();
        const timeB = new Date(b?.deliveredAt || b?.updatedAt || b?.createdAt || 0).getTime();
        return timeB - timeA;
      });

    if (deliveredWithCoords.length > 0) {
      const latest = deliveredWithCoords[0];
      const coords = extractOrderCoords(latest)!;
      return {
        coords,
        type: 'last_delivered',
        label: `موقع آخر تسليم (${latest.orderNumber || 'الطلب السابق'}) 📍`,
      };
    }
  }

  // 3. موقع المخزن المحدد في الإعدادات
  if (options?.warehouseLocation && isValidCoords(options.warehouseLocation.lat, options.warehouseLocation.lng)) {
    return {
      coords: { lat: Number(options.warehouseLocation.lat), lng: Number(options.warehouseLocation.lng) },
      type: 'warehouse',
      label: 'موقع المستودع / المخزن 🏢',
    };
  }

  // 4. موقع المستودع الافتراضي (كربلاء)
  if (DEFAULT_WAREHOUSE_COORDINATES && isValidCoords(DEFAULT_WAREHOUSE_COORDINATES.lat, DEFAULT_WAREHOUSE_COORDINATES.lng)) {
    return {
      coords: DEFAULT_WAREHOUSE_COORDINATES,
      type: 'fallback',
      label: 'موقع المستودع الافتراضي (كربلاء) 🏢',
    };
  }

  return {
    coords: null,
    type: 'none',
    label: 'بدون نقطة انطلاق محددة',
  };
}

/**
 * خوارزمية ترتيب مسار التوصيل الذكي للطلبات المسندة للسائق (Nearest Neighbor)
 * - الطلبات shipped (في المركبة) تأتي أولاً في المسار الفعلي.
 * - الطلبات processing (قيد التجهيز) تأتي بعدها.
 * - في كل مرحلة، ترتب الطلبات ذات GPS بخوارزمية الجار الأقرب (Nearest Neighbor).
 * - الطلبات بدون GPS توضع في نهاية كل مرحلة مع توضيح أن المسافة غير متاحة.
 * - كسر التعادل قطعي وثابت.
 * - لا تغير هذه الدالة أي حالة في الطلبات ولا في قاعدة البيانات (Recommendation Only).
 */
export function buildDriverDeliveryQueue<T = any>(
  orders: T[],
  options?: BuildDeliveryQueueOptions
): DriverDeliveryQueueResult<T> {
  const list = Array.isArray(orders) ? orders : [];
  if (list.length === 0) {
    return {
      queue: [],
      nextSuggestedOrder: null,
      originUsed: null,
      totalDistanceKm: 0,
      ordersWithGpsCount: 0,
      ordersWithoutGpsCount: 0,
      shippedCount: 0,
      processingCount: 0,
    };
  }

  // 1. تصفية الطلبات النشطة فقط واستبعاد المكتملة أو الملغاة
  const activeOrders = list.filter((o: any) => {
    if (!o) return false;
    const status = String(o.status || '').toLowerCase().trim();
    if (status === 'delivered' || status === 'cancelled') return false;
    if (o.collectionStatus === 'returned') return false;
    return true;
  });

  if (activeOrders.length === 0) {
    return {
      queue: [],
      nextSuggestedOrder: null,
      originUsed: null,
      totalDistanceKm: 0,
      ordersWithGpsCount: 0,
      ordersWithoutGpsCount: 0,
      shippedCount: 0,
      processingCount: 0,
    };
  }

  // 2. تحديد نقطة الانطلاق
  const originInfo = resolveDeliveryQueueOrigin(options);

  // 3. تقسيم الطلبات إلى مجموعتين: shipped أولاً ثم processing
  const shippedOrders: any[] = [];
  const processingOrders: any[] = [];

  for (const o of activeOrders) {
    const status = String((o as any).status || '').toLowerCase().trim();
    if (status === 'shipped') {
      shippedOrders.push(o);
    } else {
      processingOrders.push(o);
    }
  }

  let currentPoint = originInfo.coords;
  let runningCumulativeKm = 0;
  let totalDistanceKm = 0;
  let ordersWithGpsCount = 0;
  let ordersWithoutGpsCount = 0;

  // خوارزمية ترتيب مجموعة طلبات باستخدام Nearest Neighbor
  function sequenceGroup(groupOrders: any[], statusGroup: 'shipped' | 'processing'): QueuedDeliveryOrder<T>[] {
    const withGps: Array<{ order: any; coords: { lat: number; lng: number } }> = [];
    const withoutGps: any[] = [];

    for (const ord of groupOrders) {
      const coords = extractOrderCoords(ord);
      if (coords) {
        withGps.push({ order: ord, coords });
      } else {
        withoutGps.push(ord);
      }
    }

    ordersWithGpsCount += withGps.length;
    ordersWithoutGpsCount += withoutGps.length;

    const result: QueuedDeliveryOrder<T>[] = [];

    // أ) ترتيب الطلبات ذات الإحداثيات GPS بالجار الأقرب
    while (withGps.length > 0) {
      let bestIndex = 0;
      let bestDistance = Infinity;

      if (currentPoint) {
        for (let i = 0; i < withGps.length; i++) {
          const item = withGps[i];
          const dist = calculateDistanceKm(
            currentPoint.lat,
            currentPoint.lng,
            item.coords.lat,
            item.coords.lng
          );

          if (dist < bestDistance - 0.0001) {
            bestDistance = dist;
            bestIndex = i;
          } else if (Math.abs(dist - bestDistance) <= 0.0001) {
            // كسر التعادل القطعي
            const cmp = compareOrdersDeterministically(item.order, withGps[bestIndex].order);
            if (cmp < 0) {
              bestDistance = dist;
              bestIndex = i;
            }
          }
        }
      } else {
        // إذا لم تتوفر نقطة انطلاق إطلاقاً: فرز قطعي للمحطة الأولى
        bestDistance = 0;
        for (let i = 1; i < withGps.length; i++) {
          if (compareOrdersDeterministically(withGps[i].order, withGps[bestIndex].order) < 0) {
            bestIndex = i;
          }
        }
      }

      const chosen = withGps.splice(bestIndex, 1)[0];
      const legDistance = currentPoint ? Math.round(bestDistance * 10) / 10 : null;

      if (legDistance !== null) {
        runningCumulativeKm += legDistance;
        totalDistanceKm += legDistance;
      }

      const { baseAddress, locationDesc } = extractOrderAddress(chosen.order);
      const mapsUrl = extractOrderMapsUrl(chosen.order);

      result.push({
        order: chosen.order,
        sequence: 0, // will be assigned globally
        isNextSuggested: false,
        distanceKm: legDistance,
        cumulativeDistanceKm: legDistance !== null ? Math.round(runningCumulativeKm * 10) / 10 : null,
        hasGps: true,
        statusGroup,
        locationDesc,
        baseAddress,
        mapsUrl,
      });

      // النقطة الحالية تنتقل إلى موقع المحطة المختارة
      currentPoint = chosen.coords;
    }

    // ب) الطلبات بدون GPS توضع بعد الطلبات المحسوبة مع فرز قطعي
    withoutGps.sort((a, b) => compareOrdersDeterministically(a, b));
    for (const ord of withoutGps) {
      const { baseAddress, locationDesc } = extractOrderAddress(ord);
      const mapsUrl = extractOrderMapsUrl(ord);

      result.push({
        order: ord,
        sequence: 0,
        isNextSuggested: false,
        distanceKm: null,
        cumulativeDistanceKm: null,
        hasGps: false,
        statusGroup,
        locationDesc,
        baseAddress,
        mapsUrl,
      });
    }

    return result;
  }

  // 4. تسلسل الطلبات: shipped أولاً ثم processing
  const sequencedShipped = sequenceGroup(shippedOrders, 'shipped');
  const sequencedProcessing = sequenceGroup(processingOrders, 'processing');

  const finalQueue = [...sequencedShipped, ...sequencedProcessing];

  // 5. تعيين الترقيم التسلسلي ووسم الطلب الأول المقترح ⭐
  finalQueue.forEach((item, idx) => {
    item.sequence = idx + 1;
    item.isNextSuggested = (idx === 0);
  });

  return {
    queue: finalQueue,
    nextSuggestedOrder: finalQueue[0] || null,
    originUsed: originInfo.coords
      ? {
          lat: originInfo.coords.lat,
          lng: originInfo.coords.lng,
          type: originInfo.type,
          label: originInfo.label,
        }
      : null,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    ordersWithGpsCount,
    ordersWithoutGpsCount,
    shippedCount: shippedOrders.length,
    processingCount: processingOrders.length,
  };
}

