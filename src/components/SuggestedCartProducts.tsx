'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Check, Sparkles, Flame, ShoppingBag } from 'lucide-react';
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
  const { cart, addToCart } = useCart();
  const { isApprovedMerchant } = useAuth();
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [settingsRes, productsRes] = await Promise.all([
          fetch('/api/settings').then((r) => r.json()).catch(() => ({ success: false })),
          fetch('/api/products').then((r) => r.json()).catch(() => ({ success: false })),
        ]);

        if (settingsRes.success && settingsRes.settings) {
          setSettings(settingsRes.settings);
        }

        if (productsRes.success && Array.isArray(productsRes.products)) {
          setProducts(productsRes.products);
        }
      } catch (err) {
        console.error('Error loading suggested products', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  if (isLoading) return null;
  if (settings?.enableSuggestedProducts === false) return null;

  // Selected suggested IDs from Admin Settings
  const configuredIds: string[] = settings?.suggestedProductIds || [];

  // IDs of products already added to the customer's cart
  const cartProductIds = new Set(cart.map((item) => item.product.id));

  // Get matching products (Excluding items already in customer cart)
  let suggestedItems: Product[] = [];
  if (configuredIds.length > 0) {
    suggestedItems = configuredIds
      .filter((id) => !cartProductIds.has(id))
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is Product => p !== undefined && p.stock > 0);
  }

  // Fallback: If admin hasn't selected specific IDs or all configured ones are in cart,
  // suggest other featured / discounted products not currently in the cart
  if (suggestedItems.length === 0 && configuredIds.length === 0) {
    suggestedItems = products
      .filter((p) => !cartProductIds.has(p.id) && p.stock > 0 && (p.isFeatured || (p.originalPrice && p.originalPrice > p.price)))
      .slice(0, 6);
  }

  // If no items remain (e.g. all suggested items already in cart), hide the component
  if (suggestedItems.length === 0) return null;

  const handleQuickAdd = (product: Product, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    addToCart(product, 1, isApprovedMerchant ? 'wholesale' : 'retail');
    setRecentlyAddedId(product.id);
    toast.showToast(`تمت إضافة "${product.name.slice(0, 24)}..." إلى طلبك بنجاح! 🛒`, 'success');

    setTimeout(() => {
      setRecentlyAddedId(null);
    }, 1200);
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
            const isAdded = recentlyAddedId === prod.id;
            const inCartItem = cart.find((item) => item.product.id === prod.id);
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
                  {inCartItem && (
                    <span className="absolute bottom-1 right-1 bg-slate-900/80 text-white text-[8px] font-bold px-1 rounded-md">
                      بالسلة: {inCartItem.quantity}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <h5 className="text-[10px] font-bold text-slate-800 line-clamp-1 leading-tight" title={prod.name}>
                    {prod.name}
                  </h5>

                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[10px] font-black text-brand-coral font-mono">
                      {price.toLocaleString()} د.ع
                    </span>

                    <button
                      type="button"
                      onClick={(e) => handleQuickAdd(prod, e)}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-90 ${
                        isAdded
                          ? 'bg-emerald-600 text-white'
                          : 'bg-brand-blue hover:bg-brand-blueDark text-white'
                      }`}
                      title="أضف للطلب"
                    >
                      {isAdded ? <Check className="w-3.5 h-3.5 animate-bounce" /> : <Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </button>
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
          const isAdded = recentlyAddedId === prod.id;
          const inCartItem = cart.find((item) => item.product.id === prod.id);
          const price = isApprovedMerchant && prod.wholesalePrice ? prod.wholesalePrice : prod.price;

          return (
            <div
              key={prod.id}
              className="w-36 sm:w-40 shrink-0 bg-slate-50/70 hover:bg-slate-50 border border-slate-200/90 rounded-2xl p-2.5 shadow-2xs hover:shadow-md transition flex flex-col justify-between snap-start group"
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

                {inCartItem && (
                  <span className="absolute bottom-1.5 right-1.5 bg-slate-900/85 text-white text-[9px] font-bold px-2 py-0.5 rounded-lg backdrop-blur-xs">
                    بالسلة: {inCartItem.quantity}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-slate-800 line-clamp-1 leading-tight group-hover:text-brand-blue transition" title={prod.name}>
                  {prod.name}
                </h4>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-xs font-black text-brand-coral font-mono block">
                      {price.toLocaleString()} د.ع
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold block">
                      {isApprovedMerchant ? prod.wholesaleUnit || 'كرتون' : prod.retailUnit || 'قطعة'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleQuickAdd(prod, e)}
                    className={`px-2.5 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-90 ${
                      isAdded
                        ? 'bg-emerald-600 text-white shadow-emerald-500/30'
                        : 'bg-brand-blue hover:bg-brand-blueDark text-white shadow-blue-500/20'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span className="text-[10px]">أضيف ✓</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span className="text-[10px]">أضف</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
