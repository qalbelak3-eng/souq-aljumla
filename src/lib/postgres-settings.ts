import { getDb } from '@/db/client';
import { storeSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { StoreSettings } from '@/types';
import { initialSettings } from '@/data/initialData';

/**
 * دالة تعقيم النصوص لضمان التوافقية التامة مع ترميزات PostgreSQL
 * وتفادي أخطاء الحروف غير المتوافقة (مثل الرموز التعبيرية 4-byte في خوادم WIN1256)
 */
function sanitizeForPostgres<T>(obj: T): T {
  if (obj instanceof Date) {
    return obj;
  }
  if (typeof obj === 'string') {
    return obj.replace(/[^\u0000-\u00FF\u0600-\u06FF\s]/g, '').trim() as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForPostgres) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const res: any = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = sanitizeForPostgres(v);
    }
    return res;
  }
  return obj;
}

function mapDbRowToStoreSettings(row: any): StoreSettings {
  const delivery = (row.deliveryConfig as any) || {};
  const cashback = (row.cashbackConfig as any) || {};
  const homepage = (row.homepageConfig as any) || {};
  const competitions = (row.competitionsConfig as any) || null;
  const popupAds = (row.popupAdsConfig as any) || {};

  return {
    storeName: row.storeName || 'سوق الجملة',
    phone: row.phone || '07700000000',
    whatsapp: row.whatsapp || undefined,
    whatsappNumber: row.whatsapp || undefined,
    accountingWhatsappNumber: row.accountingWhatsapp || undefined,
    supportWhatsappNumber: row.supportPhone || undefined,
    supportPhone: row.supportPhone || undefined,
    email: row.email || 'info@souq-aljumla.iq',
    address: row.address || 'العراق',
    currency: row.currency || 'IQD',

    // Delivery & Warehouse Config (Authoritative in PostgreSQL)
    deliveryFee: typeof delivery.deliveryFee === 'number' ? delivery.deliveryFee : 5000,
    freeDeliveryThreshold: typeof delivery.freeDeliveryThreshold === 'number' ? delivery.freeDeliveryThreshold : 50000,
    minOrderAmount: typeof delivery.minOrderAmount === 'number' ? delivery.minOrderAmount : 10000,
    deliveryPricingMode: delivery.deliveryPricingMode || 'fixed',
    deliveryZones: Array.isArray(delivery.deliveryZones) ? delivery.deliveryZones : undefined,
    warehouseLat:
      delivery.warehouseLat !== undefined && delivery.warehouseLat !== null && !isNaN(Number(delivery.warehouseLat))
        ? Number(delivery.warehouseLat)
        : undefined,
    warehouseLng:
      delivery.warehouseLng !== undefined && delivery.warehouseLng !== null && !isNaN(Number(delivery.warehouseLng))
        ? Number(delivery.warehouseLng)
        : undefined,
    warehouseName: delivery.warehouseName || undefined,
    warehouseMapsUrl: delivery.warehouseMapsUrl || undefined,
    pricePerKm: typeof delivery.pricePerKm === 'number' ? delivery.pricePerKm : undefined,
    minDeliveryFee: typeof delivery.minDeliveryFee === 'number' ? delivery.minDeliveryFee : undefined,
    maxDeliveryFee: typeof delivery.maxDeliveryFee === 'number' ? delivery.maxDeliveryFee : undefined,

    // Cashback Config
    cashbackPerItem: cashback.cashbackPerItem,
    cashbackCustomerPerItem: cashback.cashbackCustomerPerItem,
    cashbackMarketPerItem: cashback.cashbackMarketPerItem,
    cashbackMerchantPerItem: cashback.cashbackMerchantPerItem,

    // Homepage & Store General Config
    storeTagline: homepage.storeTagline,
    footerDescription: homepage.footerDescription,
    copyrightText: homepage.copyrightText,
    workingHours: homepage.workingHours,
    bannerText: homepage.bannerText,
    announcement: homepage.announcement,
    enableGuestCheckout: homepage.enableGuestCheckout ?? true,
    isStoreOpen: homepage.isStoreOpen ?? true,
    banners: homepage.banners,
    showOffersSection: homepage.showOffersSection,
    offersSectionTitle: homepage.offersSectionTitle,
    offersLimit: homepage.offersLimit,
    showBestSellersSection: homepage.showBestSellersSection,
    bestSellersSectionTitle: homepage.bestSellersSectionTitle,
    bestSellersLimit: homepage.bestSellersLimit,
    showNewArrivalsSection: homepage.showNewArrivalsSection,
    enableSuggestedProducts: homepage.enableSuggestedProducts,
    suggestedProductsTitle: homepage.suggestedProductsTitle,
    suggestedProductIds: homepage.suggestedProductIds,

    // Competitions & Popups
    competitions: competitions,
    popupAd: popupAds.popupAd,
    popupAds: popupAds.popupAds,
  };
}

async function pgInitializeStoreSettings(): Promise<StoreSettings> {
  const db = getDb();
  const init = initialSettings || {};

  const deliveryConfig = {
    deliveryFee: init.deliveryFee ?? 5000,
    freeDeliveryThreshold: init.freeDeliveryThreshold ?? 50000,
    minOrderAmount: init.minOrderAmount ?? 10000,
    deliveryPricingMode: init.deliveryPricingMode ?? 'fixed',
    deliveryZones: init.deliveryZones ?? [],
    warehouseLat: null, // Strictly null until configured by admin
    warehouseLng: null, // Strictly null until configured by admin
    warehouseName: null,
    warehouseMapsUrl: null,
    pricePerKm: init.pricePerKm ?? null,
    minDeliveryFee: init.minDeliveryFee ?? null,
    maxDeliveryFee: init.maxDeliveryFee ?? null,
  };

  const cashbackConfig = {
    cashbackPerItem: init.cashbackPerItem ?? 150,
    cashbackCustomerPerItem: init.cashbackCustomerPerItem ?? 150,
    cashbackMarketPerItem: init.cashbackMarketPerItem ?? 300,
    cashbackMerchantPerItem: init.cashbackMerchantPerItem ?? 500,
  };

  const homepageConfig = {
    storeTagline: init.storeTagline ?? '',
    footerDescription: init.footerDescription ?? '',
    copyrightText: init.copyrightText ?? '',
    workingHours: init.workingHours ?? '',
    bannerText: init.bannerText ?? '',
    announcement: init.announcement ?? '',
    enableGuestCheckout: init.enableGuestCheckout ?? true,
    isStoreOpen: init.isStoreOpen ?? true,
    banners: init.banners ?? [],
    showOffersSection: init.showOffersSection ?? true,
    offersSectionTitle: init.offersSectionTitle ?? '',
    offersLimit: init.offersLimit ?? 10,
    showBestSellersSection: init.showBestSellersSection ?? true,
    bestSellersSectionTitle: init.bestSellersSectionTitle ?? '',
    bestSellersLimit: init.bestSellersLimit ?? 10,
    showNewArrivalsSection: init.showNewArrivalsSection ?? true,
    enableSuggestedProducts: init.enableSuggestedProducts ?? true,
    suggestedProductsTitle: init.suggestedProductsTitle ?? '',
    suggestedProductIds: init.suggestedProductIds ?? [],
  };

  const valuesToInsert = sanitizeForPostgres({
    id: 1,
    storeName: init.storeName || 'سوق الجملة',
    phone: init.phone || '07700000000',
    whatsapp: init.whatsapp || init.whatsappNumber || '07700000000',
    accountingWhatsapp: init.accountingWhatsappNumber || '07700000000',
    supportPhone: init.supportPhone || init.supportWhatsappNumber || '07700000000',
    email: init.email || 'info@souq-aljumla.iq',
    address: init.address || 'العراق',
    currency: init.currency || 'IQD',
    deliveryConfig,
    cashbackConfig,
    homepageConfig,
    competitionsConfig: init.competitions ?? null,
    popupAdsConfig: { popupAd: init.popupAd ?? null, popupAds: init.popupAds ?? [] },
    updatedAt: new Date(),
  });

  const [inserted] = await db
    .insert(storeSettings)
    .values(valuesToInsert)
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return mapDbRowToStoreSettings(inserted);
  }

  // If another process inserted concurrently, read row 1
  const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1)).limit(1);
  return mapDbRowToStoreSettings(existing);
}

/**
 * جلب إعدادات المتجر المعتمدة من PostgreSQL
 */
export async function pgGetStoreSettings(): Promise<StoreSettings> {
  try {
    const db = getDb();
    const rows = await db.select().from(storeSettings).where(eq(storeSettings.id, 1)).limit(1);

    if (rows.length === 0) {
      return await pgInitializeStoreSettings();
    }

    return mapDbRowToStoreSettings(rows[0]);
  } catch (err: any) {
    console.error('Warning: pgGetStoreSettings error, returning initial fallback:', err?.message || err);
    return initialSettings;
  }
}

/**
 * تحديث وحفظ إعدادات المتجر في PostgreSQL بما فيها إحداثيات المخزن الحقيقية
 */
export async function pgUpdateStoreSettings(input: Partial<StoreSettings>): Promise<StoreSettings> {
  const db = getDb();
  const existing = await pgGetStoreSettings();

  const mergedDeliveryConfig = {
    deliveryPricingMode: input.deliveryPricingMode ?? existing.deliveryPricingMode ?? 'fixed',
    deliveryZones: input.deliveryZones !== undefined ? input.deliveryZones : (existing.deliveryZones || []),
    // Real persisted coordinates or null (no fake placeholders)
    warehouseLat:
      input.warehouseLat !== undefined
        ? (input.warehouseLat !== null && !isNaN(Number(input.warehouseLat)) ? Number(input.warehouseLat) : null)
        : (existing.warehouseLat ?? null),
    warehouseLng:
      input.warehouseLng !== undefined
        ? (input.warehouseLng !== null && !isNaN(Number(input.warehouseLng)) ? Number(input.warehouseLng) : null)
        : (existing.warehouseLng ?? null),
    warehouseName: input.warehouseName !== undefined ? (input.warehouseName || null) : (existing.warehouseName || null),
    warehouseMapsUrl: input.warehouseMapsUrl !== undefined ? (input.warehouseMapsUrl || null) : (existing.warehouseMapsUrl || null),
    pricePerKm: input.pricePerKm !== undefined ? (typeof input.pricePerKm === 'number' ? input.pricePerKm : null) : (existing.pricePerKm ?? null),
    minDeliveryFee: input.minDeliveryFee !== undefined ? (typeof input.minDeliveryFee === 'number' ? input.minDeliveryFee : null) : (existing.minDeliveryFee ?? null),
    maxDeliveryFee: input.maxDeliveryFee !== undefined ? (typeof input.maxDeliveryFee === 'number' ? input.maxDeliveryFee : null) : (existing.maxDeliveryFee ?? null),
    deliveryFee: input.deliveryFee !== undefined ? Number(input.deliveryFee) : (existing.deliveryFee ?? 5000),
    freeDeliveryThreshold: input.freeDeliveryThreshold !== undefined ? Number(input.freeDeliveryThreshold) : (existing.freeDeliveryThreshold ?? 50000),
    minOrderAmount: input.minOrderAmount !== undefined ? Number(input.minOrderAmount) : (existing.minOrderAmount ?? 10000),
  };

  const mergedCashbackConfig = {
    cashbackPerItem: input.cashbackPerItem !== undefined ? Number(input.cashbackPerItem) : (existing.cashbackPerItem ?? 150),
    cashbackCustomerPerItem: input.cashbackCustomerPerItem !== undefined ? Number(input.cashbackCustomerPerItem) : (existing.cashbackCustomerPerItem ?? 150),
    cashbackMarketPerItem: input.cashbackMarketPerItem !== undefined ? Number(input.cashbackMarketPerItem) : (existing.cashbackMarketPerItem ?? 300),
    cashbackMerchantPerItem: input.cashbackMerchantPerItem !== undefined ? Number(input.cashbackMerchantPerItem) : (existing.cashbackMerchantPerItem ?? 500),
  };

  const mergedHomepageConfig = {
    storeTagline: input.storeTagline !== undefined ? input.storeTagline : (existing.storeTagline ?? ''),
    footerDescription: input.footerDescription !== undefined ? input.footerDescription : (existing.footerDescription ?? ''),
    copyrightText: input.copyrightText !== undefined ? input.copyrightText : (existing.copyrightText ?? ''),
    workingHours: input.workingHours !== undefined ? input.workingHours : (existing.workingHours ?? ''),
    bannerText: input.bannerText !== undefined ? input.bannerText : (existing.bannerText ?? ''),
    announcement: input.announcement !== undefined ? input.announcement : (existing.announcement ?? ''),
    enableGuestCheckout: input.enableGuestCheckout !== undefined ? Boolean(input.enableGuestCheckout) : (existing.enableGuestCheckout ?? true),
    isStoreOpen: input.isStoreOpen !== undefined ? Boolean(input.isStoreOpen) : (existing.isStoreOpen ?? true),
    banners: input.banners !== undefined ? input.banners : (existing.banners || []),
    showOffersSection: input.showOffersSection !== undefined ? Boolean(input.showOffersSection) : (existing.showOffersSection ?? true),
    offersSectionTitle: input.offersSectionTitle !== undefined ? input.offersSectionTitle : (existing.offersSectionTitle ?? ''),
    offersLimit: input.offersLimit !== undefined ? Number(input.offersLimit) : (existing.offersLimit ?? 10),
    showBestSellersSection: input.showBestSellersSection !== undefined ? Boolean(input.showBestSellersSection) : (existing.showBestSellersSection ?? true),
    bestSellersSectionTitle: input.bestSellersSectionTitle !== undefined ? input.bestSellersSectionTitle : (existing.bestSellersSectionTitle ?? ''),
    bestSellersLimit: input.bestSellersLimit !== undefined ? Number(input.bestSellersLimit) : (existing.bestSellersLimit ?? 10),
    showNewArrivalsSection: input.showNewArrivalsSection !== undefined ? Boolean(input.showNewArrivalsSection) : (existing.showNewArrivalsSection ?? true),
    enableSuggestedProducts: input.enableSuggestedProducts !== undefined ? Boolean(input.enableSuggestedProducts) : (existing.enableSuggestedProducts ?? true),
    suggestedProductsTitle: input.suggestedProductsTitle !== undefined ? input.suggestedProductsTitle : (existing.suggestedProductsTitle ?? ''),
    suggestedProductIds: input.suggestedProductIds !== undefined ? input.suggestedProductIds : (existing.suggestedProductIds || []),
  };

  const mergedCompetitionsConfig = input.competitions !== undefined ? input.competitions : (existing.competitions ?? null);
  const mergedPopupAdsConfig = {
    popupAd: input.popupAd !== undefined ? input.popupAd : (existing.popupAd ?? null),
    popupAds: input.popupAds !== undefined ? input.popupAds : (existing.popupAds || []),
  };

  const valuesToSave = sanitizeForPostgres({
    id: 1,
    storeName: input.storeName || existing.storeName || 'سوق الجملة',
    phone: input.phone || existing.phone || '07700000000',
    whatsapp: input.whatsapp || input.whatsappNumber || existing.whatsapp || existing.whatsappNumber || '07700000000',
    accountingWhatsapp: input.accountingWhatsappNumber || existing.accountingWhatsappNumber || null,
    supportPhone: input.supportPhone || input.supportWhatsappNumber || existing.supportPhone || existing.supportWhatsappNumber || null,
    email: input.email || existing.email || 'info@souq-aljumla.iq',
    address: input.address || existing.address || 'العراق',
    currency: input.currency || existing.currency || 'IQD',
    deliveryConfig: mergedDeliveryConfig,
    cashbackConfig: mergedCashbackConfig,
    homepageConfig: mergedHomepageConfig,
    competitionsConfig: mergedCompetitionsConfig,
    popupAdsConfig: mergedPopupAdsConfig,
    updatedAt: new Date(),
  });

  await db
    .insert(storeSettings)
    .values(valuesToSave)
    .onConflictDoUpdate({
      target: storeSettings.id,
      set: valuesToSave,
    });

  return await pgGetStoreSettings();
}
