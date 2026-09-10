'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Minus, Check, Sparkles, Flame, ShoppingBag } from 'lucide-react';
import { Product, StoreSettings } from '@/types';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

interface SuggestedCartProductsProps {
  variant?: 'cart' | 'drawer' | 'checkout';
  className?: string;
}

export default function SuggestedCartProducts({
  variant = 'cart',
  className = '',
}: SuggestedCartProductsProps) {
  const { cart, addToCart, updateQuantity, removeFromCart } = useCart();
  const { isApprovedMerchant } = useAuth();
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_suggested_products_cache') || localStorage.getItem('souq_store_products_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return [];
  });

  const [settings, setSettings] = useState<StoreSettings | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_store_settings_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_suggested_products_cache') || localStorage.getItem('souq_store_products_cache');
        if (cached && JSON.parse(cached).length > 0) return false;
      } catch (e) {}
    }
    return true;
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [settingsRes, productsRes] = await Promise.all([
          fetch('/api/settings').then((r) => r.json()).catch(() => ({ success: false })),
          fetch('/api/products').then((r) => r.json()).catch(() => ({ success: false })),
        ]);

        if (settingsRes.success && settingsRes.settings) {
          setSettings(settingsRes.settings);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('souq_store_settings_cache', JSON.stringify(settingsRes.settings));
            } catch (e) {}
          }
        }

        if (productsRes.success && Array.isArray(productsRes.products)) {
          setProducts(productsRes.products);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('souq_suggested_products_cache', JSON.stringify(productsRes.products));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.error('Error loading suggested products', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  if (isLoading && products.length === 0) return null;
  if (settings?.enableSuggestedProducts === false) return null;

  // Selected suggested IDs from Admin Settings
  const configuredIds: string[] = settings?.suggestedProductIds || [];

  // Get matching products (keep them visible so customer can add multiple quantities)
  let suggestedItems: Product[] = [];
  if (configuredIds.length > 0) {
    suggestedItems = configuredIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is Product => p !== undefined && p.stock > 0);
  }

  // Fallback: If admin hasn't selected specific IDs, suggest top featured / discounted products
  if (suggestedItems.length === 0 && configuredIds.length === 0) {
    suggestedItems = products
      .filter((p) => p.stock > 0 && (p.isFeatured || (p.originalPrice && p.originalPrice > p.price)))
      .slice(0, 6);
  }

  if (suggestedItems.length === 0) return null;

  const saleType = isApprovedMerchant ? 'wholesale' : 'retail';

  const handleQuickAdd = (product: Product, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    addToCart(product, 1, saleType);
    toast.showToast(`تمت إضافة "${product.name.slice(0, 24)}..." إلى طلبك بنجاح! 🛒`, 'success');
  };

  const handleIncrement = (product: Product, currentQty: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    updateQuantity(product.id, currentQty + 1, saleType);
    toast.showToast(`الكمية الحالية: ${currentQty + 1} من "${product.name.slice(0, 20)}..." 🛒`, 'success');
  };

  const handleDecrement = (product: Product, currentQty: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (currentQty <= 1) {
      removeFromCart(product.id, saleType);
      toast.showToast(`تمت إزالة "${product.name.slice(0, 20)}..." من السلة`, 'info');
    } else {
      updateQuantity(product.id, currentQty - 1, saleType);
    }
  };

  const title = settings?.suggestedProductsTitle || 'أضف إلى طلبك ✨';

  // Compact layout for Drawer
  if (variant === 'drawer') {
    return (
      <div className={`space-y-2 py-2 border-t border-slate-100 ${className}`} dir="rtl">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[11px] font-black text-slate-800 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{title}</span>
          </h4>
          <span className="text-[9px] text-slate-400 font-bold">بلمسة واحدة ⚡</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none snap-x">
          {suggestedItems.map((prod) => {
            const inCartItem = cart.find((item) => item.product.id === prod.id && item.saleType === saleType);
            const qty = inCartItem ? inCartItem.quantity : 0;
            const price = isApprovedMerchant && prod.wholesalePrice ? prod.wholesalePrice : prod.price;

            return (
              <div
                key={prod.id}
                className="w-28 shrink-0 bg-white rounded-2xl border border-slate-200/80 p-2 shadow-2xs hover:shadow-xs transition flex flex-col justify-between snap-start group relative"
              >
                <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-50 mb-1.5 border border-slate-100">
                  <img
                    src={prod.images?.[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop'}
                    alt={prod.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                  {prod.originalPrice && prod.originalPrice > prod.price && (
                    <span className="absolute top-1 right-1 bg-rose-600 text-white text-[8px] font-black px-1 py-0.5 rounded-md shadow-xs">
                      خصم
                    </span>
                  )}
                  {qty > 0 && (
                    <span className="absolute bottom-1 right-1 bg-emerald-700 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
                      ✓ {qty}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <h5 className="text-[10px] font-bold text-slate-800 line-clamp-1 leading-tight" title={prod.name}>
                    {prod.name}
                  </h5>

                  <div className="flex items-center justify-between pt-0.5 gap-1">
                    <span className="text-[10px] font-black text-brand-coral font-mono">
                      {price.toLocaleString()} د.ع
                    </span>

                    {qty > 0 ? (
                      <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-300 rounded-lg p-0.5 shadow-2xs shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleDecrement(prod, qty, e)}
                          className="w-4 h-4 rounded-md bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 flex items-center justify-center transition cursor-pointer active:scale-90"
                          title="تقليل"
                        >
                          <Minus className="w-2.5 h-2.5 stroke-[3]" />
                        </button>
                        <span className="font-mono font-black text-[10px] text-emerald-900 min-w-[12px] text-center">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleIncrement(prod, qty, e)}
                          className="w-4 h-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition cursor-pointer active:scale-90"
                          title="زيادة"
                        >
                          <Plus className="w-2.5 h-2.5 stroke-[3]" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleQuickAdd(prod, e)}
                        className="w-6 h-6 rounded-lg bg-brand-blue hover:bg-brand-blueDark text-white flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-90 shrink-0"
                        title="أضف للطلب"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Standard layout for /cart and /checkout
  return (
    <div className={`bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs space-y-3 select-none ${className}`} dir="rtl">
      <div className="flex items-center justify-between border-b border-slate-100/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xs font-black">
            ✨
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span>{title}</span>
              <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                مقترح لك 💡
              </span>
            </h3>
          </div>
        </div>

        <span className="text-[11px] text-slate-400 font-bold hidden sm:inline">
          أضف إلى سلتك بضغطة زر واحدة 🚀
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-slate-200 snap-x">
        {suggestedItems.map((prod) => {
          const inCartItem = cart.find((item) => item.product.id === prod.id && item.saleType === saleType);
          const qty = inCartItem ? inCartItem.quantity : 0;
          const price = isApprovedMerchant && prod.wholesalePrice ? prod.wholesalePrice : prod.price;

          return (
            <div
              key={prod.id}
              className={`w-36 sm:w-40 shrink-0 border rounded-2xl p-2.5 shadow-2xs hover:shadow-md transition flex flex-col justify-between snap-start group ${
                qty > 0 ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50/70 hover:bg-slate-50 border-slate-200/90'
              }`}
            >
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-white mb-2 border border-slate-100">
                <img
                  src={prod.images?.[0] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop'}
                  alt={prod.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  loading="lazy"
                />

                {prod.originalPrice && prod.originalPrice > prod.price && (
                  <span className="absolute top-1.5 right-1.5 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
                    <Flame className="w-2.5 h-2.5" />
                    <span>توفير</span>
                  </span>
                )}

                {qty > 0 && (
                  <span className="absolute bottom-1.5 right-1.5 bg-emerald-800 text-white text-[9px] font-black px-2 py-0.5 rounded-lg backdrop-blur-xs shadow-xs flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" />
                    <span>بالسلة ({qty})</span>
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-slate-800 line-clamp-1 leading-tight group-hover:text-brand-blue transition" title={prod.name}>
                  {prod.name}
                </h4>

                <div className="flex items-center justify-between pt-1 gap-1">
                  <div>
                    <span className="text-xs font-black text-brand-coral font-mono block">
                      {price.toLocaleString()} د.ع
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold block">
                      {isApprovedMerchant ? prod.wholesaleUnit || 'كرتون' : prod.retailUnit || 'قطعة'}
                    </span>
                  </div>

                  {qty > 0 ? (
                    /* Interactive Stepper (+ / -) when in cart */
                    <div className="flex items-center gap-1 bg-emerald-100/80 border border-emerald-300 rounded-xl p-0.5 shadow-xs shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleDecrement(prod, qty, e)}
                        className="w-5 h-5 rounded-lg bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 flex items-center justify-center transition shadow-2xs cursor-pointer active:scale-90"
                        title="تقليل العدد"
                      >
                        <Minus className="w-3 h-3 stroke-[3]" />
                      </button>
                      <span className="font-mono font-black text-xs text-emerald-950 px-1 min-w-[14px] text-center">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleIncrement(prod, qty, e)}
                        className="w-5 h-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition shadow-2xs cursor-pointer active:scale-90"
                        title="زيادة العدد"
                      >
                        <Plus className="w-3 h-3 stroke-[3]" />
                      </button>
                    </div>
                  ) : (
                    /* Initial Add Button */
                    <button
                      type="button"
                      onClick={(e) => handleQuickAdd(prod, e)}
                      className="px-2.5 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-90 bg-brand-blue hover:bg-brand-blueDark text-white shadow-blue-500/20 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span className="text-[10px]">أضف</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
