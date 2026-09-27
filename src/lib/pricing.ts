import { Product, SaleType, User, MerchantTier, StoreSettings } from '@/types';

export const MAX_ORDER_ITEM_QUANTITY = 50000;

export interface QuantityValidationResult {
  valid: boolean;
  quantity?: number;
  error?: string;
}

/**
 * دالة موحدة لفحص وتأكيد سلامة كمية الأصناف في السلة والطلبات والكوبونات والمستودع:
 * - تقبل فقط الأعداد الصحيحة الموجبة (positive integer >= 1)
 * - تمنع تماماً الكسور (decimals مثل 2.5)، الصفر، السالب، النصوص، NaN، و Infinity
 * - تمنع القيم الخارجة عن نطاق الأمان أو المتجاوزة للحد الأقصى للطلب الواحد (50,000)
 */
export function validateOrderItemQuantity(
  rawQty: any,
  maxAllowed: number = MAX_ORDER_ITEM_QUANTITY
): QuantityValidationResult {
  if (rawQty === undefined || rawQty === null || rawQty === '' || typeof rawQty === 'boolean') {
    return { valid: false, error: 'الكمية مطلوبة ويجب أن تكون رقماً صحيحاً' };
  }

  let numVal: number;
  if (typeof rawQty === 'string') {
    const trimmed = rawQty.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      return { valid: false, error: 'الكمية غير صالحة: يجب إدخال عدد صحيح بدون كسور أو نصوص' };
    }
    numVal = Number(trimmed);
  } else if (typeof rawQty === 'number') {
    numVal = rawQty;
  } else {
    return { valid: false, error: 'نوع بيانات الكمية غير صالح' };
  }

  if (isNaN(numVal) || !isFinite(numVal)) {
    return { valid: false, error: 'الكمية غير صالحة' };
  }

  if (!Number.isSafeInteger(numVal)) {
    return { valid: false, error: 'الكمية يجب أن تكون عدداً صحيحاً داخل النطاق الآمن' };
  }

  if (numVal < 1) {
    return { valid: false, error: 'الكمية يجب أن تكون عدداً صحيحاً موجباً (1 على الأقل)' };
  }

  if (numVal > maxAllowed) {
    return {
      valid: false,
      error: `الكمية المطلوبة (${numVal.toLocaleString()}) تتجاوز الحد الأقصى المسموح به للطلب الواحد (${maxAllowed.toLocaleString()})`,
    };
  }

  return { valid: true, quantity: numVal };
}

export interface NormalizedPricingUser {
  accountType: 'individual' | 'market' | 'wholesale';
  merchantTier?: MerchantTier;
  role: 'customer' | 'merchant';
}

/**
 * دالة موحدة ومركزية لتطبيع هوية التسعير بين مفاهيم User وجدول financial_accounts ودوال التسعير:
 * - accountType يحدد مسار التسعير (individual للمستهلك، market للماركت، wholesale للجملة).
 * - pricingTier هو الحقل المحاسبي القادم من financial_accounts ('retail' | 'general' | 'market' | 'wholesale' | 'special').
 *   يتم تحويله دلالياً:
 *   * 'retail' و 'general' -> 'individual'
 *   * 'market' -> 'market'
 *   * 'wholesale' -> 'wholesale'
 *   * 'special' -> توافق Legacy مؤقت موثق: يعامل كـ wholesale مع merchantTier = 'silver' فقط في حال عدم تحديد merchantTier صريح.
 * - merchantTier هو الفئة الصريحة لتاجر الجملة ('bronze' | 'silver' | 'gold').
 * - لا يتم الثقة أبداً بأي مدخلات غير موثوقة من Payload العميل.
 */
export function normalizePricingIdentity(input: {
  accountType?: string | null;
  pricingTier?: string | null;
  merchantTier?: string | null;
}): NormalizedPricingUser {
  const rawAccountType = String(input.accountType || '').trim().toLowerCase();
  const rawPricingTier = String(input.pricingTier || '').trim().toLowerCase();
  const rawMerchantTier = String(input.merchantTier || '').trim().toLowerCase();

  let resolvedAccountType: 'individual' | 'market' | 'wholesale' = 'individual';
  let resolvedMerchantTier: MerchantTier | undefined = undefined;

  // 1. Resolve Account Type:
  if (rawAccountType === 'market' || rawPricingTier === 'market' || rawMerchantTier === 'market') {
    resolvedAccountType = 'market';
  } else if (
    rawAccountType === 'wholesale' ||
    rawAccountType === 'merchant' ||
    rawPricingTier === 'wholesale' ||
    rawPricingTier === 'special'
  ) {
    resolvedAccountType = 'wholesale';
  } else {
    // 'individual', 'retail', 'general', empty or unknown fallback to individual consumer
    resolvedAccountType = 'individual';
  }

  // 2. Resolve Merchant Tier (Bronze / Silver / Gold):
  if (resolvedAccountType === 'wholesale') {
    if (rawMerchantTier === 'gold') {
      resolvedMerchantTier = 'gold';
    } else if (rawMerchantTier === 'silver') {
      resolvedMerchantTier = 'silver';
    } else if (rawMerchantTier === 'bronze') {
      resolvedMerchantTier = 'bronze';
    } else if (rawPricingTier === 'special') {
      // Documented Legacy Compatibility ONLY:
      // If legacy financial account has pricingTier === 'special' without explicit merchantTier, treat as silver
      resolvedMerchantTier = 'silver';
    } else {
      resolvedMerchantTier = 'bronze';
    }
  }

  return {
    accountType: resolvedAccountType,
    merchantTier: resolvedMerchantTier,
    role: resolvedAccountType === 'wholesale' ? 'merchant' : 'customer',
  };
}

export type PricingTierApplied =
  | 'retail'
  | 'consumer_carton'
  | 'market'
  | 'wholesale_bronze'
  | 'wholesale_silver'
  | 'wholesale_gold';

export interface AuthoritativePriceParams {
  product: Product | any;
  saleType?: SaleType | 'box' | 'carton' | 'piece' | string;
  user?: User | NormalizedPricingUser | { accountType?: string | null; merchantTier?: string | null; pricingTier?: string | null } | null;
  activeOffer?: {
    id: string;
    offerPrice: number;
    offerWholesalePrice?: number | null;
    originalPrice?: number | null;
    originalWholesalePrice?: number | null;
    startDate?: any;
    endDate?: any;
    isActive?: boolean;
    isArchived?: boolean;
  } | null;
}

export interface AuthoritativePriceResult {
  finalUnitPrice: number;
  originalUnitPrice: number;
  pricingTierApplied: PricingTierApplied;
  tierLabel: string;
  isOfferApplied: boolean;
  offerId: string | null;
  offerSavingsPerUnit: number;
  tierSavingsPerUnit: number;
  totalSavingsPerUnit: number;
  explanation: string;
}

/**
 * Phase Commerce-2B3: Final Pricing Authority
 * المرجع المركزي والموحد الوحيد في النظام لاتخاذ السعر النهائي المؤهل للعميل (Best Eligible Price)
 * تضمن:
 * 1. حصول العميل على أقل سعر من الأسعار التي هو مؤهل لها قانونياً وتجارياً فقط.
 * 2. عدم استفادة زبون المفرد من أسعار الجملة أو الرتب الخاصة.
 * 3. عدم دفع صاحب الماركت سعراً أعلى من عرض الجملة العام المتاح.
 * 4. توافق تسعير الرتب (Bronze / Silver / Gold) عند وجود عروض ترويجية.
 */
export function resolveAuthoritativeProductPrice(params: AuthoritativePriceParams): AuthoritativePriceResult {
  const { product, saleType = 'retail', user, activeOffer } = params;

  // 1. تطبيع هوية العميل بصورة مركزية
  const effectiveUser = normalizePricingIdentity(user || {});
  const isRetail = saleType === 'retail' || saleType === 'piece';

  // 2. فحص وتدقيق العرض الترويجي النشط
  let hasValidActiveOffer = false;
  let offerId: string | null = null;
  let offerRetailPrice: number | null = null;
  let offerWholesalePrice: number | null = null;
  let offerOriginalRetailPrice: number | null = null;
  let offerOriginalWholesalePrice: number | null = null;

  if (activeOffer) {
    const isUnarchived = !activeOffer.isArchived;
    const isExplicitActive = activeOffer.isActive !== false;
    let isTimeValid = true;
    const now = Date.now();
    if (activeOffer.endDate) {
      const end = new Date(activeOffer.endDate).getTime();
      if (!isNaN(end) && end <= now) isTimeValid = false;
    }
    if (activeOffer.startDate) {
      const start = new Date(activeOffer.startDate).getTime();
      if (!isNaN(start) && start > now) isTimeValid = false;
    }

    if (isUnarchived && isExplicitActive && isTimeValid) {
      hasValidActiveOffer = true;
      offerId = String(activeOffer.id);
      offerRetailPrice = Number(activeOffer.offerPrice);
      offerWholesalePrice = (activeOffer.offerWholesalePrice !== undefined && activeOffer.offerWholesalePrice !== null && Number(activeOffer.offerWholesalePrice) > 0)
        ? Number(activeOffer.offerWholesalePrice)
        : null;
      offerOriginalRetailPrice = activeOffer.originalPrice ? Number(activeOffer.originalPrice) : null;
      offerOriginalWholesalePrice = activeOffer.originalWholesalePrice ? Number(activeOffer.originalWholesalePrice) : null;
    }
  } else if (product.isOnOffer && product.offerId) {
    hasValidActiveOffer = true;
    offerId = String(product.offerId);
    offerRetailPrice = Number(product.price);
    offerWholesalePrice = (product.wholesalePrice !== undefined && product.originalWholesalePrice !== undefined && Number(product.wholesalePrice) < Number(product.originalWholesalePrice))
      ? Number(product.wholesalePrice)
      : (product.offerWholesalePrice ? Number(product.offerWholesalePrice) : null);
    offerOriginalRetailPrice = product.originalPrice ? Number(product.originalPrice) : null;
    offerOriginalWholesalePrice = product.originalWholesalePrice ? Number(product.originalWholesalePrice) : null;
  }

  // 3. الأسعار الأساسية الدائمة للصنف
  const baseRetailPrice = Number(
    offerOriginalRetailPrice ?? product.basePrice ?? (product.isOnOffer ? product.originalPrice : product.price) ?? product.price
  ) || 0;

  const baseWholesalePrice = Number(
    offerOriginalWholesalePrice ?? product.baseWholesalePrice ?? (product.isOnOffer ? product.originalWholesalePrice : product.wholesalePrice) ?? product.wholesalePrice
  ) || 0;

  const regularBoxPrice = Number(product.boxPrice) || 0;
  const regularMarketPrice = Number(product.marketPrice) || 0;
  const regularSpecialPrice = Number(product.specialPrice) || 0;
  const regularVipPrice = Number(product.vipPrice) || 0;

  // =========================================================================
  // الحالة الأولى: البيع بالمفرد (Retail Piece Sale)
  // =========================================================================
  if (isRetail) {
    const originalUnitPrice = baseRetailPrice;
    const canUseRetailOffer = hasValidActiveOffer && offerRetailPrice !== null && offerRetailPrice > 0 && offerRetailPrice < baseRetailPrice;

    if (canUseRetailOffer) {
      const finalUnitPrice = offerRetailPrice!;
      const offerSavings = Math.max(0, originalUnitPrice - finalUnitPrice);
      return {
        finalUnitPrice,
        originalUnitPrice,
        pricingTierApplied: 'retail',
        tierLabel: 'سعر المفرد',
        isOfferApplied: true,
        offerId,
        offerSavingsPerUnit: offerSavings,
        tierSavingsPerUnit: 0,
        totalSavingsPerUnit: offerSavings,
        explanation: `استفادة من العرض الترويجي للمفرد بسعر ${finalUnitPrice.toLocaleString()} د.ع بدلاً من ${originalUnitPrice.toLocaleString()} د.ع`,
      };
    }

    return {
      finalUnitPrice: baseRetailPrice,
      originalUnitPrice: baseRetailPrice,
      pricingTierApplied: 'retail',
      tierLabel: 'سعر المفرد',
      isOfferApplied: false,
      offerId: null,
      offerSavingsPerUnit: 0,
      tierSavingsPerUnit: 0,
      totalSavingsPerUnit: 0,
      explanation: `سعر المفرد الاعتيادي ${baseRetailPrice.toLocaleString()} د.ع`,
    };
  }

  // =========================================================================
  // الحالة الثانية: البيع بالكرتون / الجملة (Wholesale / Carton Sale)
  // =========================================================================
  const hasWholesaleOffer = hasValidActiveOffer && offerWholesalePrice !== null && offerWholesalePrice > 0;
  const activeOfferWholesale = hasWholesaleOffer ? offerWholesalePrice! : null;

  // 1. كرتون المستهلك العادي (Individual Consumer Carton)
  if (effectiveUser.accountType === 'individual') {
    const finalUnitPrice = regularBoxPrice > 0 ? regularBoxPrice : baseWholesalePrice;
    return {
      finalUnitPrice,
      originalUnitPrice: finalUnitPrice,
      pricingTierApplied: 'consumer_carton',
      tierLabel: 'سعر الكرتون للمستهلك',
      isOfferApplied: false,
      offerId: null,
      offerSavingsPerUnit: 0,
      tierSavingsPerUnit: 0,
      totalSavingsPerUnit: 0,
      explanation: `سعر كرتون المستهلك ${finalUnitPrice.toLocaleString()} د.ع`,
    };
  }

  // 2. كرتون أصحاب الماركت (Market Merchant) — Best Eligible Price
  if (effectiveUser.accountType === 'market') {
    const nominalMarket = regularMarketPrice > 0 ? regularMarketPrice : baseWholesalePrice;
    const isOffer = activeOfferWholesale !== null && activeOfferWholesale < nominalMarket;
    const finalUnitPrice = isOffer ? activeOfferWholesale : nominalMarket;
    const originalUnitPrice = nominalMarket;

    return {
      finalUnitPrice,
      originalUnitPrice,
      pricingTierApplied: 'market',
      tierLabel: 'سعر الماركت',
      isOfferApplied: isOffer,
      offerId: isOffer ? offerId : null,
      offerSavingsPerUnit: isOffer ? Math.max(0, nominalMarket - finalUnitPrice) : 0,
      tierSavingsPerUnit: 0,
      totalSavingsPerUnit: Math.max(0, originalUnitPrice - finalUnitPrice),
      explanation: isOffer
        ? `سعر الماركت مستفيداً من عرض الجملة العام ${finalUnitPrice.toLocaleString()} د.ع بدلاً من ${originalUnitPrice.toLocaleString()} د.ع`
        : `سعر كرتون الماركت ${finalUnitPrice.toLocaleString()} د.ع`,
    };
  }

  // 3. تجار الجملة المعتمدون (Wholesale Bronze, Silver, Gold)
  const tier = effectiveUser.merchantTier || 'bronze';

  if (tier === 'gold') {
    const nominalGold = regularVipPrice > 0
      ? Math.min(regularVipPrice, regularSpecialPrice > 0 ? regularSpecialPrice : baseWholesalePrice, baseWholesalePrice)
      : (regularSpecialPrice > 0 ? Math.min(regularSpecialPrice, baseWholesalePrice) : baseWholesalePrice);

    const isOffer = activeOfferWholesale !== null && activeOfferWholesale < nominalGold;
    const finalUnitPrice = isOffer ? activeOfferWholesale : nominalGold;
    const originalUnitPrice = baseWholesalePrice;

    return {
      finalUnitPrice,
      originalUnitPrice,
      pricingTierApplied: 'wholesale_gold',
      tierLabel: 'سعر جملة ذهبي',
      isOfferApplied: isOffer,
      offerId: isOffer ? offerId : null,
      offerSavingsPerUnit: isOffer ? Math.max(0, nominalGold - finalUnitPrice) : 0,
      tierSavingsPerUnit: Math.max(0, baseWholesalePrice - nominalGold),
      totalSavingsPerUnit: Math.max(0, originalUnitPrice - finalUnitPrice),
      explanation: isOffer
        ? `سعر جملة ذهبي VIP مستفيداً من عرض الجملة ${finalUnitPrice.toLocaleString()} د.ع`
        : `سعر جملة ذهبي VIP مخصص ${finalUnitPrice.toLocaleString()} د.ع`,
    };
  }

  if (tier === 'silver') {
    const nominalSilver = regularSpecialPrice > 0
      ? Math.min(regularSpecialPrice, baseWholesalePrice)
      : baseWholesalePrice;

    const isOffer = activeOfferWholesale !== null && activeOfferWholesale < nominalSilver;
    const finalUnitPrice = isOffer ? activeOfferWholesale : nominalSilver;
    const originalUnitPrice = baseWholesalePrice;

    return {
      finalUnitPrice,
      originalUnitPrice,
      pricingTierApplied: 'wholesale_silver',
      tierLabel: 'سعر جملة فضي',
      isOfferApplied: isOffer,
      offerId: isOffer ? offerId : null,
      offerSavingsPerUnit: isOffer ? Math.max(0, nominalSilver - finalUnitPrice) : 0,
      tierSavingsPerUnit: Math.max(0, baseWholesalePrice - nominalSilver),
      totalSavingsPerUnit: Math.max(0, originalUnitPrice - finalUnitPrice),
      explanation: isOffer
        ? `سعر جملة فضي مستفيداً من عرض الجملة ${finalUnitPrice.toLocaleString()} د.ع`
        : `سعر جملة فضي ${finalUnitPrice.toLocaleString()} د.ع`,
    };
  }

  // Bronze Wholesale
  const nominalBronze = baseWholesalePrice;
  const isOffer = activeOfferWholesale !== null && activeOfferWholesale < nominalBronze;
  const finalUnitPrice = isOffer ? activeOfferWholesale : nominalBronze;
  const originalUnitPrice = baseWholesalePrice;

  return {
    finalUnitPrice,
    originalUnitPrice,
    pricingTierApplied: 'wholesale_bronze',
    tierLabel: 'سعر جملة برونزي',
    isOfferApplied: isOffer,
    offerId: isOffer ? offerId : null,
    offerSavingsPerUnit: isOffer ? Math.max(0, baseWholesalePrice - finalUnitPrice) : 0,
    tierSavingsPerUnit: 0,
    totalSavingsPerUnit: isOffer ? Math.max(0, originalUnitPrice - finalUnitPrice) : 0,
    explanation: isOffer
      ? `سعر جملة برونزي مستفيداً من عرض الجملة ${finalUnitPrice.toLocaleString()} د.ع بدلاً من ${originalUnitPrice.toLocaleString()} د.ع`
      : `سعر جملة برونزي ${finalUnitPrice.toLocaleString()} د.ع`,
  };
}

/**
 * واجهة توافقية لـ getProductPriceForUser تعتمد داخلياً على resolveAuthoritativeProductPrice
 */
export function getProductPriceForUser(
  product: Product,
  saleType: SaleType = 'retail',
  user?: User | NormalizedPricingUser | null
): { price: number; tierLabel: string; tier: MerchantTier | 'retail' | 'market' } {
  const result = resolveAuthoritativeProductPrice({ product, saleType, user });
  let tier: MerchantTier | 'retail' | 'market' = 'retail';
  if (result.pricingTierApplied === 'market') tier = 'market';
  else if (result.pricingTierApplied === 'wholesale_gold') tier = 'gold';
  else if (result.pricingTierApplied === 'wholesale_silver') tier = 'silver';
  else if (result.pricingTierApplied === 'wholesale_bronze') tier = 'bronze';
  else tier = 'retail';

  return {
    price: result.finalUnitPrice,
    tierLabel: result.tierLabel,
    tier,
  };
}

export function getUserCashbackRate(
  user?: User | null,
  settings?: StoreSettings | null,
  saleType: SaleType = 'retail'
): number {
  return 0;
}

/**
 * حساب معدل مكافأة الهدية/الكاشباك لمنتج معين حسب فئة الحساب ونوع الشراء (مفرد / كرتون):
 * - زبون المفرد: يحصل على هدية القطعة المفردة (cashbackCustomerAmount).
 * - صاحب الماركت: يحصل على هدية كرتون الماركت المخصصة (cashbackMarketAmount).
 * - تاجر الجملة VIP: يحصل على هدية كرتون الجملة المخصصة (cashbackMerchantAmount).
 * - إذا لم تُحدد هدية في الصنف أو تم إيقافها، يكون المبلغ 0 د.ع تماماً بدون أي تعميم تلقائي.
 */
export function getProductCashbackRate(
  product?: Product | null,
  user?: User | null,
  settings?: StoreSettings | null,
  saleType: SaleType = 'retail'
): number {
  if (!product) {
    return 0;
  }
  
  // إذا تم إيقاف الهدية صراحة عن هذا الصنف
  if (product.enableCashbackReward === false) {
    return 0;
  }

  const accountType = user?.accountType;

  // 1. حساب تاجر الجملة VIP 👑
  if (accountType === 'wholesale' || accountType === 'merchant' || user?.role === 'merchant') {
    if (saleType === 'wholesale') {
      if (typeof product.cashbackMerchantAmount === 'number' && product.cashbackMerchantAmount > 0) {
        return product.cashbackMerchantAmount;
      }
      return 0;
    }
    // إذا اشترى بالمفرد
    if (typeof product.cashbackCustomerAmount === 'number' && product.cashbackCustomerAmount > 0) {
      return product.cashbackCustomerAmount;
    }
    return 0;
  }

  // 2. حساب صاحب الماركت والمحل 🏪
  if (accountType === 'market') {
    if (saleType === 'wholesale') {
      if (typeof product.cashbackMarketAmount === 'number' && product.cashbackMarketAmount > 0) {
        return product.cashbackMarketAmount;
      }
      return 0;
    }
    // إذا اشترى بالمفرد
    if (typeof product.cashbackCustomerAmount === 'number' && product.cashbackCustomerAmount > 0) {
      return product.cashbackCustomerAmount;
    }
    return 0;
  }

  // 3. حساب الزبون العادي / المستهلك (المفرد) 👤
  if (saleType === 'wholesale') {
    if (typeof product.cashbackWholesalePerCarton === 'number' && product.cashbackWholesalePerCarton > 0) {
      return product.cashbackWholesalePerCarton;
    }
    return 0;
  }

  // شراء بالمفرد للزبون العادي
  if (typeof product.cashbackCustomerAmount === 'number' && product.cashbackCustomerAmount > 0) {
    return product.cashbackCustomerAmount;
  }
  if (typeof product.customCashbackAmount === 'number' && product.customCashbackAmount > 0) {
    return product.customCashbackAmount;
  }
  return 0;
}

/**
 * حساب إجمالي رصيد الأرباح المكتسب والمستخدم للمستخدم من سجل طلبياته الفعلية
 */
export function calculateUserCashbackFromOrders(
  orders: any[],
  user?: User | null,
  products?: Product[] | null
): {
  totalEarned: number;
  pendingEarned: number;
  totalUsed: number;
  netBalance: number;
  pendingBalance: number;
  totalItemsCount: number;
} {
  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    return { totalEarned: 0, pendingEarned: 0, totalUsed: 0, netBalance: 0, pendingBalance: 0, totalItemsCount: 0 };
  }

  const productsMap: Record<string, Product> = {};
  if (products && Array.isArray(products)) {
    for (const p of products) {
      if (p && p.id) productsMap[p.id] = p;
    }
  }

  const validOrders = orders.filter((o) => o && o.status !== 'cancelled');

  let totalEarned = 0;      // Delivered orders only (spendable)
  let pendingEarned = 0;    // In-flight orders (pending, processing, shipped)
  let totalUsed = 0;
  let totalItemsCount = 0;

  for (const order of validOrders) {
    totalUsed += Number(order.usedCashbackDiscount || 0);
    const isDelivered = order.status === 'delivered';

    for (const item of (order.items || [])) {
      const qty = Number(item.quantity) || 0;
      totalItemsCount += qty;

      let itemEarned = 0;
      if (typeof item.earnedCashback === 'number' && !isNaN(item.earnedCashback)) {
        itemEarned = item.earnedCashback;
      } else if (typeof item.cashbackPerUnit === 'number' && !isNaN(item.cashbackPerUnit)) {
        itemEarned = item.cashbackPerUnit * qty;
      } else {
        // Fallback: look up product from catalog if available
        const prod = productsMap[item.productId];
        if (prod) {
          const rate = getProductCashbackRate(prod, user, null, item.saleType);
          itemEarned = rate * qty;
        }
      }

      if (isDelivered) {
        totalEarned += itemEarned;
      } else {
        pendingEarned += itemEarned;
      }
    }
  }

  const netBalance = Math.max(0, totalEarned - totalUsed);
  return {
    totalEarned,
    pendingEarned,
    totalUsed,
    netBalance,
    pendingBalance: pendingEarned,
    totalItemsCount,
  };
}

/* =========================================================================
   Phase Commerce-2B2: Product Pricing Foundation, Validation & Semantic Audit
   ========================================================================= */

export interface ProductPricingInput {
  costPrice?: number | string | null;
  price?: number | string | null;
  wholesalePrice?: number | string | null;
  specialPrice?: number | string | null;
  vipPrice?: number | string | null;
  marketPrice?: number | string | null;
  boxPrice?: number | string | null; // Semantic: Consumer Carton Price (سعر الكرتون للمستهلك)
  boxesPerCarton?: number | string | null;
  itemsPerBox?: number | string | null;
  piecesPerCarton?: number | string | null;
  isSellable?: boolean;
}

export interface ProductPricingValidationOptions {
  allowBelowCostOverride?: boolean;
  overrideReason?: string;
  operator?: {
    role?: string | null;
    username?: string | null;
    name?: string | null;
    permissions?: string[] | null;
  };
}

export interface PricingValidationResult {
  valid: boolean;
  hardErrors: string[];
  warnings: string[];
  requiresOverride: boolean;
  metrics: {
    piecesPerCarton: number;
    pieceCostPrice: number;
    retailCartonTotal: number;
    bronzeMarginPercent: number;
    bronzeProfit: number;
    goldMarginPercent?: number;
    silverMarginPercent?: number;
    marketMarginPercent?: number;
    consumerCartonMarginPercent?: number;
  };
}

function parsePricingNumber(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? NaN : num;
}

/**
 * محرك مركزي للتحقق من سلامة أسعار المنتجات (Server-Side + Client-Side):
 * - Hard Errors: أخطاء قطعية تمنع حفظ المنتج (سالب، تكلفة صفر، أسعار أساسية صفرية، تناقض رتب الجملة Gold > Silver أو Silver > Bronze).
 * - Warnings: تحذيرات تسترعي الانتباه وتتطلب موافقة إدارية معللة في حال البيع دون التكلفة.
 */
export function validateProductPricing(
  input: ProductPricingInput,
  options?: ProductPricingValidationOptions
): PricingValidationResult {
  const hardErrors: string[] = [];
  const warnings: string[] = [];

  const cost = parsePricingNumber(input.costPrice);
  const retailPiece = parsePricingNumber(input.price);
  const wholesale = parsePricingNumber(input.wholesalePrice);
  const special = parsePricingNumber(input.specialPrice);
  const vip = parsePricingNumber(input.vipPrice);
  const market = parsePricingNumber(input.marketPrice);
  const box = parsePricingNumber(input.boxPrice); // Consumer Carton Price

  const boxes = Math.max(1, Number(input.boxesPerCarton) || 1);
  const items = Math.max(1, Number(input.itemsPerBox) || 1);
  const pieces = Number(input.piecesPerCarton) || (boxes * items);

  // 1. Negative or Non-Numeric Checks (Hard Errors)
  const allFields: { name: string; val: number | null }[] = [
    { name: 'سعر التكلفة', val: cost },
    { name: 'سعر القطعة المفردة', val: retailPiece },
    { name: 'سعر كرتون الجملة البرونزي', val: wholesale },
    { name: 'سعر كرتون الجملة الفضي', val: special },
    { name: 'سعر كرتون الجملة الذهبي VIP', val: vip },
    { name: 'سعر كرتون الماركت', val: market },
    { name: 'سعر كرتون المستهلك', val: box },
  ];

  for (const f of allFields) {
    if (f.val !== null) {
      if (isNaN(f.val) || !isFinite(f.val)) {
        hardErrors.push(`${f.name} غير صالح ويجب أن يكون رقماً صحيحاً`);
      } else if (f.val < 0) {
        hardErrors.push(`${f.name} لا يمكن أن يكون رقماً سالباً`);
      }
    }
  }

  // 2. Required Values for Sellable Products (Hard Errors)
  const isSellable = input.isSellable !== false;
  if (isSellable) {
    if (cost === null || cost <= 0) {
      hardErrors.push('سعر تكلفة الكرتون (costPrice) مطلوب ويجب أن يكون أكبر من صفر للسلع القابلة للبيع');
    }
    if (retailPiece === null || retailPiece <= 0) {
      hardErrors.push('سعر بيع القطعة المفردة للمستهلك (price) مطلوب ويجب أن يكون أكبر من صفر');
    }
    if (wholesale === null || wholesale <= 0) {
      hardErrors.push('سعر كرتون الجملة الأساسي للتاجر البرونزي (wholesalePrice) مطلوب ويجب أن يكون أكبر من صفر');
    }
  }

  // 3. Wholesale Tier Logical Hierarchy (Hard Errors)
  // القاعدة التجارية الصارمة: Gold VIP <= Silver <= Bronze
  if (vip !== null && vip > 0 && special !== null && special > 0) {
    if (vip > special) {
      hardErrors.push(
        `تناقض في تسعير الرتب: سعر التاجر الذهبي VIP (${vip.toLocaleString()} د.ع) لا يمكن أن يكون أعلى من سعر التاجر الفضي (${special.toLocaleString()} د.ع)`
      );
    }
  }

  if (special !== null && special > 0 && wholesale !== null && wholesale > 0) {
    if (special > wholesale) {
      hardErrors.push(
        `تناقض في تسعير الرتب: سعر التاجر الفضي (${special.toLocaleString()} د.ع) لا يمكن أن يكون أعلى من سعر التاجر البرونزي (${wholesale.toLocaleString()} د.ع)`
      );
    }
  }

  if (vip !== null && vip > 0 && wholesale !== null && wholesale > 0) {
    if (vip > wholesale) {
      hardErrors.push(
        `تناقض في تسعير الرتب: سعر التاجر الذهبي VIP (${vip.toLocaleString()} د.ع) لا يمكن أن يكون أعلى من سعر التاجر البرونزي (${wholesale.toLocaleString()} د.ع)`
      );
    }
  }

  // 4. Calculations & Financial Metrics
  const pieceCostPrice = cost && cost > 0 && pieces > 0 ? Number((cost / pieces).toFixed(4)) : 0;
  const retailCartonTotal = retailPiece && retailPiece > 0 && pieces > 0 ? retailPiece * pieces : 0;
  const bronzeProfit = wholesale && cost ? wholesale - cost : 0;
  const bronzeMarginPercent = wholesale && cost && wholesale > 0 ? Number((((wholesale - cost) / wholesale) * 100).toFixed(1)) : 0;

  const calcMargin = (p: number | null) => (p && cost && p > 0 ? Number((((p - cost) / p) * 100).toFixed(1)) : undefined);
  const goldMarginPercent = calcMargin(vip);
  const silverMarginPercent = calcMargin(special);
  const marketMarginPercent = calcMargin(market);
  const consumerCartonMarginPercent = calcMargin(box);

  // 5. Warnings & Below Cost Verification
  let requiresOverride = false;
  if (cost !== null && cost > 0) {
    if (wholesale !== null && wholesale > 0 && wholesale < cost) {
      warnings.push(`سعر كرتون الجملة البرونزي (${wholesale.toLocaleString()} د.ع) أقل من سعر التكلفة (${cost.toLocaleString()} د.ع)`);
      requiresOverride = true;
    }
    if (special !== null && special > 0 && special < cost) {
      warnings.push(`سعر كرتون التاجر الفضي (${special.toLocaleString()} د.ع) أقل من سعر التكلفة (${cost.toLocaleString()} د.ع)`);
      requiresOverride = true;
    }
    if (vip !== null && vip > 0 && vip < cost) {
      warnings.push(`سعر كرتون التاجر الذهبي VIP (${vip.toLocaleString()} د.ع) أقل من سعر التكلفة (${cost.toLocaleString()} د.ع)`);
      requiresOverride = true;
    }
    if (market !== null && market > 0 && market < cost) {
      warnings.push(`سعر كرتون الماركت (${market.toLocaleString()} د.ع) أقل من سعر التكلفة (${cost.toLocaleString()} د.ع)`);
      requiresOverride = true;
    }
    if (box !== null && box > 0 && box < cost) {
      warnings.push(`سعر كرتون المستهلك (${box.toLocaleString()} د.ع) أقل من سعر التكلفة (${cost.toLocaleString()} د.ع)`);
      requiresOverride = true;
    }
    if (retailCartonTotal > 0 && retailCartonTotal < cost) {
      warnings.push(`إجمالي بيع محتويات الكرتون بالمفرد (${retailCartonTotal.toLocaleString()} د.ع) أقل من سعر التكلفة (${cost.toLocaleString()} د.ع)`);
      requiresOverride = true;
    }
  }

  // 6. Packaging & Unit Consistency Warnings
  if (box !== null && box > 0 && retailCartonTotal > 0 && retailCartonTotal < box) {
    warnings.push(
      `سعر شراء محتويات الكرتون بالقطع المفردة (${retailCartonTotal.toLocaleString()} د.ع) أرخص من سعر كرتون المستهلك (${box.toLocaleString()} د.ع)، مما يجعل الشراء بالكرتون غير مجدٍ للمستهلك`
    );
  }

  if (retailCartonTotal > 0 && wholesale !== null && wholesale > 0 && retailCartonTotal < wholesale) {
    warnings.push(
      `سعر شراء محتويات الكرتون بالقطع المفردة (${retailCartonTotal.toLocaleString()} د.ع) أرخص من سعر كرتون الجملة (${wholesale.toLocaleString()} د.ع)`
    );
  }

  if (market !== null && market > 0 && wholesale !== null && wholesale > 0 && market < wholesale) {
    warnings.push(
      `سعر كرتون الماركت (${market.toLocaleString()} د.ع) أقل من سعر كرتون الجملة البرونزي (${wholesale.toLocaleString()} د.ع)`
    );
  }

  if (box !== null && box > 0 && wholesale !== null && wholesale > 0 && box < wholesale) {
    warnings.push(
      `سعر كرتون المستهلك (${box.toLocaleString()} د.ع) أقل من سعر كرتون الجملة البرونزي (${wholesale.toLocaleString()} د.ع)، مما قد يدفع التجار للشراء كأفراد`
    );
  }

  // 7. Administrative Below-Cost Override Gate
  let valid = hardErrors.length === 0;
  if (requiresOverride) {
    if (!options?.allowBelowCostOverride) {
      valid = false;
    } else {
      const reason = (options.overrideReason || '').trim();
      if (reason.length < 5) {
        hardErrors.push('يرجى تقديم سبب إداري واضح ومفصل للبيع دون سعر التكلفة (5 أحرف على الأقل)');
        valid = false;
      }
    }
  }

  return {
    valid,
    hardErrors,
    warnings,
    requiresOverride,
    metrics: {
      piecesPerCarton: pieces,
      pieceCostPrice,
      retailCartonTotal,
      bronzeMarginPercent,
      bronzeProfit,
      goldMarginPercent,
      silverMarginPercent,
      marketMarginPercent,
      consumerCartonMarginPercent,
    },
  };
}

export interface SuggestedTierPrices {
  goldPrice: number;
  silverPrice: number;
  marketPrice: number;
  consumerCartonPrice: number;
}

/**
 * دالة مساعدة لتوليد اقتراحات ذكية غير ملزمة للرتب انطلاقاً من سعر البرونزي والتكلفة:
 * - لا تفرض قيماً ثابتة كقاعدة دائمة، بل تقدم للمشرف قيم استرشادية مريحة مع الحفاظ على حق التعديل اليدوي الكامل.
 */
export function suggestTierPricing(wholesalePrice: number, costPrice?: number): SuggestedTierPrices {
  const ws = Math.max(0, Number(wholesalePrice) || 0);
  const cost = costPrice ? Math.max(0, Number(costPrice) || 0) : 0;

  // Gold VIP: خصم تقريبي 5% مع التقريب لأقرب 250 د.ع وبما لا يقل عن التكلفة
  const rawGold = Math.max(0, Math.round((ws * 0.95) / 250) * 250);
  const goldPrice = cost > 0 ? Math.max(cost, rawGold) : rawGold;

  // Silver: خصم تقريبي 2% مع التقريب لأقرب 250 د.ع وبما لا يقل عن التكلفة
  const rawSilver = Math.max(0, Math.round((ws * 0.98) / 250) * 250);
  const silverPrice = cost > 0 ? Math.max(cost, rawSilver) : rawSilver;

  // Market: زيادة تقريبية 3% فوق سعر الجملة
  const marketPrice = Math.max(0, Math.round((ws * 1.03) / 250) * 250);

  // Consumer Carton: زيادة تقريبية 8% فوق سعر الجملة (أنسب من المفرد وأعلى من الجملة)
  const consumerCartonPrice = Math.max(0, Math.round((ws * 1.08) / 250) * 250);

  return {
    goldPrice,
    silverPrice,
    marketPrice,
    consumerCartonPrice,
  };
}

export interface ProductPricingAuditReport {
  productId: string;
  productName: string;
  hasHardErrors: boolean;
  hasWarnings: boolean;
  hardErrors: string[];
  warnings: string[];
  boxPriceClassification: 'none' | 'consumer_carton' | 'inner_box' | 'ambiguous';
  costPrice: number;
  wholesalePrice: number;
  boxPrice?: number;
  price: number;
  piecesPerCarton: number;
  retailCartonTotal: number;
}

/**
 * أداة تدقيق وفحص للأصناف المخزنة لاكتشاف أي بيانات غير متناسقة في الأصناف القديمة (Legacy)
 * دون تعديلها تلقائياً، وتصنيف معنى boxPrice الفعلي في كل صنف.
 */
export function auditProductPricing(product: Product): ProductPricingAuditReport {
  const boxes = Math.max(1, Number(product.boxesPerCarton) || 1);
  const items = Math.max(1, Number(product.itemsPerBox) || 1);
  const pieces = Number(product.itemsPerWholesaleUnit) || (boxes * items);

  const costP = Number(product.costPrice) || 0;
  const wsP = Number(product.wholesalePrice) || 0;
  const retailP = Number(product.price) || 0;
  const boxP = product.boxPrice !== undefined && product.boxPrice !== null ? Number(product.boxPrice) : undefined;
  const retailCarton = retailP * pieces;

  let classification: 'none' | 'consumer_carton' | 'inner_box' | 'ambiguous' = 'none';
  if (boxP !== undefined && boxP > 0) {
    if (wsP > 0 && boxP >= wsP) {
      classification = 'consumer_carton';
    } else if (boxes > 1 && wsP > 0 && boxP <= (wsP / boxes) * 1.5) {
      classification = 'inner_box';
    } else {
      classification = 'ambiguous';
    }
  }

  const res = validateProductPricing({
    costPrice: product.costPrice,
    price: product.price,
    wholesalePrice: product.wholesalePrice,
    specialPrice: product.specialPrice,
    vipPrice: product.vipPrice,
    marketPrice: product.marketPrice,
    boxPrice: product.boxPrice,
    boxesPerCarton: product.boxesPerCarton,
    itemsPerBox: product.itemsPerBox,
    piecesPerCarton: pieces,
    isSellable: true,
  });

  return {
    productId: product.id,
    productName: product.name,
    hasHardErrors: res.hardErrors.length > 0,
    hasWarnings: res.warnings.length > 0,
    hardErrors: res.hardErrors,
    warnings: res.warnings,
    boxPriceClassification: classification,
    costPrice: costP,
    wholesalePrice: wsP,
    boxPrice: boxP,
    price: retailP,
    piecesPerCarton: pieces,
    retailCartonTotal: retailCarton,
  };
}

export function auditAllProductsPricing(products: Product[]): {
  total: number;
  cleanCount: number;
  warningCount: number;
  errorCount: number;
  boxPriceBreakdown: { none: number; consumer_carton: number; inner_box: number; ambiguous: number };
  reports: ProductPricingAuditReport[];
} {
  const reports = products.map(auditProductPricing);
  const breakdown = { none: 0, consumer_carton: 0, inner_box: 0, ambiguous: 0 };

  let clean = 0;
  let warn = 0;
  let err = 0;

  for (const r of reports) {
    breakdown[r.boxPriceClassification]++;
    if (r.hasHardErrors) err++;
    else if (r.hasWarnings) warn++;
    else clean++;
  }

  return {
    total: products.length,
    cleanCount: clean,
    warningCount: warn,
    errorCount: err,
    boxPriceBreakdown: breakdown,
    reports,
  };
}
