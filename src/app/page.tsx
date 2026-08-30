'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  TrendingUp,
  Package,
  Clock,
  CheckCircle2,
  Store,
  Truck,
  ShieldCheck,
  Headphones,
  ShoppingBag,
  Layers,
  ChevronLeft,
  Trophy,
  Gift
} from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import BannerSlider from '@/components/BannerSlider';
import MerchantStatsCard from '@/components/MerchantStatsCard';
import CategoryIcon from '@/components/CategoryIcon';
import CompetitionLeaderboard from '@/components/CompetitionLeaderboard';
import { Product, Category } from '@/types';
import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { user, isApprovedMerchant } = useAuth();

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()).catch(() => ({ success: false })),
    ])
      .then(([prodData, catData, settingsData]) => {
        if (prodData.success) setProducts(prodData.products || []);
        if (catData.success) setCategories(catData.categories || []);
        if (settingsData?.success && settingsData?.settings) setSettings(settingsData.settings);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  // 0. Filter: Valid products with required fields
  const validProducts = Array.isArray(products) ? products.filter((p) => p && p.id && typeof p.price === 'number') : [];

  // 1. Filter: Special Offers Products
  const offerProducts = validProducts.filter(
    (p) =>
      p.isOnOffer ||
      p.offerBadge ||
      (p.originalPrice && p.originalPrice > p.price) ||
      (p.originalWholesalePrice && p.originalWholesalePrice > p.wholesalePrice)
  );

  // User Classification Detection: Wholesale vs Market vs Regular Retail Customer
  const isWholesaleUser = Boolean(
    user &&
    (
      user.accountType === 'wholesale' ||
      user.accountType === 'merchant' ||
      user.role === 'merchant' ||
      user.businessType === 'wholesale' ||
      (user.businessName && user.businessName.includes('جملة'))
    )
  );

  const isMarketUser = Boolean(
    !isWholesaleUser &&
    user &&
    (
      user.accountType === 'market' ||
      user.businessType === 'market' ||
      Boolean(user.businessName)
    )
  );

  // 2. Filter: Best Sellers / Most Ordered Products:
  // يظهر فقط: المنتجات التي تم اختيارها يدوياً من لوحة الإدارة أو المنتجات التي تم طلبها فعلياً من قبل الزبائن/التجار/الماركتات
  const displayBestSellers = validProducts
    .filter((p) => {
      // 1. الأصناف المحددة يدوياً من الإدارة كأكثر طلباً ومبيعاً
      if (p.isBestSeller || p.isFeatured) return true;

      // 2. أو الأصناف التي عليها طلبات فعلية مسجلة بالنظام
      if (isWholesaleUser) {
        return (p.orderedWholesaleQty || 0) > 0 || (p.orderedTotalQty || 0) > 0;
      }
      if (isMarketUser) {
        return (p.orderedMarketQty || 0) > 0 || (p.orderedTotalQty || 0) > 0;
      }
      // الزبائن العاديين / المفرد / الزوار
      return (p.orderedRetailQty || 0) > 0 || (p.orderedTotalQty || 0) > 0;
    })
    .sort((a, b) => {
      // Priority 1: كمية الطلب الفعلية حسب نوع حساب الزبون
      if (isWholesaleUser) {
        const qA = a.orderedWholesaleQty || 0;
        const qB = b.orderedWholesaleQty || 0;
        if (qB !== qA) return qB - qA;
      } else if (isMarketUser) {
        const qA = a.orderedMarketQty || 0;
        const qB = b.orderedMarketQty || 0;
        if (qB !== qA) return qB - qA;
      } else {
        // Regular Retail Customers / Guests (الزبائن العاديين / المفرد)
        const qA = a.orderedRetailQty || 0;
        const qB = b.orderedRetailQty || 0;
        if (qB !== qA) return qB - qA;
      }

      // Priority 2: التحديد اليدوي من لوحة الإدارة
      const manualA = (a.isBestSeller || a.isFeatured) ? 1 : 0;
      const manualB = (b.isBestSeller || b.isFeatured) ? 1 : 0;
      if (manualB !== manualA) return manualB - manualA;

      // Priority 3: إجمالي الطلبات الكلية عبر كافة الزبائن
      const totA = a.orderedTotalQty || 0;
      const totB = b.orderedTotalQty || 0;
      if (totB !== totA) return totB - totA;

      // Priority 4: التقييم
      return (b.rating || 0) - (a.rating || 0);
    });

  // 3. Filter: New Arrivals / Latest Products (sorted by createdAt)
  const newArrivalProducts = [...validProducts]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .filter((p) => p.isNew || !offerProducts.some(o => o.id === p.id));

  // Section visibility & limits from settings
  const showOffers = (settings?.showOffersSection ?? true) && offerProducts.length > 0;
  const offersTitle = settings?.offersSectionTitle || 'العروض والتخفيضات الخاصة 🔥';
  const offersLimit = Number(settings?.offersLimit) || 8;

  const showBestSellers = (settings?.showBestSellersSection ?? true) && displayBestSellers.length > 0;
  const bestSellersTitle = settings?.bestSellersSectionTitle || 'الأكثر طلباً ومبيعاً 🏆';
  const bestSellersLimit = Number(settings?.bestSellersLimit) || 8;

  const showNewArrivals = (settings?.showNewArrivalsSection ?? true) && (newArrivalProducts.length > 0 || products.length > 0);
  const newArrivalsTitle = settings?.newArrivalsSectionTitle || 'وصل حديثاً للمستودع ✨';
  const newArrivalsLimit = Number(settings?.newArrivalsLimit) || 8;

  return (
    <div className="space-y-5 sm:space-y-6 pb-20 overflow-x-hidden w-full max-w-full">
      
      {/* 1. PROFITS & 4 STATS RECTANGLES (رصيد أرباحك + المستطيلات الأربعة) */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-1">
        <MerchantStatsCard />
      </section>

      {/* 2. AUTO-SLIDING BANNERS */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <BannerSlider />
      </section>

      {/* 3. DYNAMIC CATEGORIES - JUMLATY STYLE WITH ANIMATED ICONS */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">
            الأقسام
          </h2>
        </div>

        {/* Jumlaty Style Clean Cards Grid */}
        {categories.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-slate-100 text-slate-400 text-xs font-bold">
            لا توجد أقسام مسجلة حالياً
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 sm:gap-3.5">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/products?category=${encodeURIComponent(cat.name)}`}
                className="bg-[#f7fbff] hover:bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-sky-100/90 shadow-[0_2px_12px_rgba(0,100,255,0.04)] hover:shadow-md hover:border-sky-300 transition-all text-center flex flex-col items-center justify-center space-y-2.5 group transform active:scale-95"
              >
                {/* Animated Swaying Vector Icon */}
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition">
                  <CategoryIcon name={cat.name} icon={cat.icon} size="lg" animate={true} />
                </div>

                {/* Clean Category Name Only */}
                <span className="text-xs sm:text-sm font-black text-slate-800 line-clamp-1 group-hover:text-brand-blue transition block">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 4. SECTION 1: OFFERS & DISCOUNTS (يظهر فقط المنتجات التي عليها عروض) */}
      {showOffers && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 flex items-center gap-1.5">
              <span>{offersTitle}</span>
              <span className="text-amber-500 animate-pulse text-lg">✦</span>
            </h2>

            <Link
              href="/products?filter=offers"
              className="text-xs font-bold text-brand-blue hover:text-brand-blueDark flex items-center gap-1"
            >
              <span>شاهد كل العروض ({offerProducts.length})</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {offerProducts.slice(0, offersLimit).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* 5. SECTION 2: BEST SELLERS / MOST POPULAR (الأكثر طلباً ومبيعاً) */}
      {showBestSellers && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 flex items-center gap-1.5">
              <span>{bestSellersTitle}</span>
              <span className="text-amber-500 text-lg">⭐</span>
            </h2>

            <Link
              href="/products?filter=bestsellers"
              className="text-xs font-bold text-brand-blue hover:text-brand-blueDark flex items-center gap-1"
            >
              <span>شاهد الكل ({displayBestSellers.length})</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {displayBestSellers.slice(0, bestSellersLimit).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* 5.5 BANNER SLIDER (MIDDLE): بنر إعلاني ترويجي أوسط بين الأكثر طلباً ومبيعاً ووصل حديثاً للمستودع */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <BannerSlider position="middle" />
      </section>

      {/* 6. SECTION 3: NEW ARRIVALS / LATEST PRODUCTS (وصل حديثاً للمستودع) */}
      {showNewArrivals && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 flex items-center gap-1.5">
              <span>{newArrivalsTitle}</span>
              <span className="text-sky-500 text-lg">✨</span>
            </h2>

            <Link
              href="/products?filter=new"
              className="text-xs font-bold text-brand-blue hover:text-brand-blueDark flex items-center gap-1"
            >
              <span>شاهد الكل ({validProducts.length})</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {(newArrivalProducts.length > 0 ? newArrivalProducts : validProducts).slice(0, newArrivalsLimit).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* Loading state skeleton if data is loading */}
      {isLoading && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 space-y-3">
          <div className="h-6 bg-slate-200 rounded w-48 animate-pulse mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-white rounded-3xl p-3 border border-slate-100 shadow-sm animate-pulse space-y-2">
                <div className="aspect-square bg-slate-100 rounded-2xl" />
                <div className="h-3 bg-slate-200 rounded w-3/4" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. TOP ORDERING MARKETS & WHOLESALE MERCHANTS COMPETITION */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <CompetitionLeaderboard competitions={settings?.competitions} />
      </section>

      {/* 6. Wholesale Market Registration CTA */}
      {!isApprovedMerchant && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-2">
          <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 rounded-3xl p-5 sm:p-7 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
            <div className="space-y-1 text-center sm:text-right">
              <span className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full">
                خاص بأصحاب الماركتات 🏪
              </span>
              <h3 className="text-base sm:text-lg font-black">
                هل أنت صاحب أسواق أو سوبرماركت؟
              </h3>
              <p className="text-[11px] text-emerald-200">
                سجّل حسابك الآن لتفعيل أسعار كراتين الجملة المعتمدة مباشرة!
              </p>
            </div>

            <Link
              href="/register?type=merchant"
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-2.5 px-5 rounded-xl shadow-md transition whitespace-nowrap"
            >
              تسجيل حساب ماركت ⚡
            </Link>
          </div>
        </section>
      )}

    </div>
  );
}
