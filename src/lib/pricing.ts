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

export function getUserCashbackRate(user?: User | null, settings?: StoreSettings | null): number {
  const defaultRate = Number(settings?.cashbackPerItem ?? 150);

  if (!user || user.accountType === 'individual' || !user.accountType) {
    return Number(settings?.cashbackCustomerPerItem ?? 100);
  }

  if (user.accountType === 'market') {
    return Number(settings?.cashbackMarketPerItem ?? 150);
  }

  if (user.accountType === 'wholesale' || user.accountType === 'merchant' || user.role === 'merchant') {
    return Number(settings?.cashbackMerchantPerItem ?? 250);
  }

  return defaultRate;
}
