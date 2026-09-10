import { Product, SaleType, User, MerchantTier, StoreSettings } from '@/types';

export function getProductPriceForUser(
  product: Product,
  saleType: SaleType = 'retail',
  user?: User | null
): { price: number; tierLabel: string; tier: MerchantTier | 'retail' | 'market' } {
  if (saleType === 'retail') {
    return { price: product.price, tierLabel: 'سعر المفرد', tier: 'retail' };
  }

  // 1. Normal Consumer (زبون عادي غير مسجل كتاجر أو ماركت)
  if (!user || user.accountType === 'individual' || !user.accountType) {
    const consumerCartonPrice = Number(product.boxPrice) > 0 ? Number(product.boxPrice) : Number(product.wholesalePrice);
    return { price: consumerCartonPrice, tierLabel: 'سعر الكرتون للمستهلك 📦', tier: 'retail' };
  }

  // 2. Market Customer (ماركت معتمد 🏪)
  if (user.accountType === 'market') {
    const price = Number(product.marketPrice) > 0 ? Number(product.marketPrice) : Number(product.wholesalePrice);
    return { price, tierLabel: 'سعر جملة الماركت 🏪', tier: 'market' };
  }

  // 3. Wholesale Merchant (تاجر جملة معتمد VIP 👑)
  if (user.accountType === 'wholesale' || user.accountType === 'merchant' || user.role === 'merchant') {
    const tier: MerchantTier = user.merchantTier || 'bronze';

    if (tier === 'gold') {
      const price = Number(product.vipPrice) > 0 ? Number(product.vipPrice) : (Number(product.specialPrice) || Number(product.wholesalePrice));
      return { price, tierLabel: 'سعر VIP ذهبي 👑', tier: 'gold' };
    }

    if (tier === 'silver') {
      const price = Number(product.specialPrice) > 0 ? Number(product.specialPrice) : Number(product.wholesalePrice);
      return { price, tierLabel: 'سعر خاص فضي ⭐', tier: 'silver' };
    }

    return { price: Number(product.wholesalePrice), tierLabel: 'سعر جملة برونزي 🥉', tier: 'bronze' };
  }

  const fallbackPrice = Number(product.boxPrice) > 0 ? Number(product.boxPrice) : Number(product.wholesalePrice);
  return { price: fallbackPrice, tierLabel: 'سعر الكرتون', tier: 'retail' };
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
