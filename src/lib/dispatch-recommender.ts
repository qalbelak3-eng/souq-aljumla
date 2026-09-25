import { Driver, Vehicle, Order } from '@/types';

export const HIGH_CUSTODY_THRESHOLD = 500_000; // 500,000 IQD
export const HIGH_CUSTODY_WARNING = '⚠️ عهدة مرتفعة — يفضّل إجراء تسوية قبل إسناد طلبات نقدية جديدة';

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
  currentCashInHand: number;
  completedDeliveries: number;
  isHighCustody: boolean;
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
 * 2. إعطاء أفضلية لمن لديه مركبة فعالة.
 * 3. الأقل في عدد الطلبات النشطة (activeDeliveries).
 * 4. للطلبات النقدية: الأقل في العهدة النقدية (currentCashInHand).
 *    للطلبات غير النقدية: لا تُعاقب العهدة النقدية، بل يُرجّح الأكثر خبرة (completedDeliveries).
 * 5. كسر التعادل بمعيار قطعي ثابت (Deterministic Tiebreaker) باستخدام الاسم أو المعرف.
 */
export function rankDriversForOrder<T extends Driver = Driver>(
  allDrivers: T[],
  order?: Partial<Order> | { paymentMethod?: string; collectionStatus?: string } | null,
  vehicles?: Vehicle[]
): RankedDriver<T>[] {
  // 1. استبعاد السائقين غير الفعالين
  const activeDrivers = (allDrivers || []).filter((d) => d && d.isActive !== false);
  if (activeDrivers.length === 0) return [];

  const isCash = isOrderCashCollection(order);

  const decorated: RankedDriver<T>[] = activeDrivers.map((driver) => {
    const hasActiveVehicle = driverHasActiveVehicle(driver, vehicles);
    const activeDeliveries = Number((driver as any).activeDeliveries || 0);
    const currentCashInHand = Number(driver.currentCashInHand || 0);
    const completedDeliveries = Number((driver as any).completedDeliveries || 0);
    const isHighCustody = currentCashInHand >= HIGH_CUSTODY_THRESHOLD;

    return {
      driver,
      isRecommended: false,
      hasActiveVehicle,
      activeDeliveries,
      currentCashInHand,
      completedDeliveries,
      isHighCustody,
      reasons: [],
    };
  });

  // فرز السائقين حسب المعايير المحددة
  decorated.sort((a, b) => {
    // معيار 1: أفضلية من لديه مركبة فعالة (1 قبل 0)
    if (a.hasActiveVehicle !== b.hasActiveVehicle) {
      return a.hasActiveVehicle ? -1 : 1;
    }

    // معيار 2: الأقل في عدد الطلبات النشطة (الأقل حملاً)
    if (a.activeDeliveries !== b.activeDeliveries) {
      return a.activeDeliveries - b.activeDeliveries;
    }

    // معيار 3: العهدة النقدية مقابل طبيعة الطلب
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

    // معيار 4: كسر التعادل القطعي الثابت (Deterministic Tiebreaker)
    const nameDiff = String(a.driver.name || '').localeCompare(String(b.driver.name || ''), 'ar');
    if (nameDiff !== 0) return nameDiff;

    return String(a.driver.id || '').localeCompare(String(b.driver.id || ''));
  });

  // وسم السائق الأول كـ "مقترح"
  if (decorated.length > 0) {
    decorated[0].isRecommended = true;
    const reasons: string[] = [];
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
