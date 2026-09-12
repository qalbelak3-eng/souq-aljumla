'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
} from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import BannerSlider from '@/components/BannerSlider';
import CampaignShowcaseCard from '@/components/CampaignShowcaseCard';
import CategoryIcon from '@/components/CategoryIcon';
import CompetitionLeaderboard from '@/components/CompetitionLeaderboard';
import { Product, Category, Banner } from '@/types';
import { initialCategories, initialSettings, initialProducts } from '@/data/initialData';
import { useAuth } from '@/context/AuthContext';

interface HomePageClientProps {
  serverBanners: Banner[];
}

export default function HomePageClient({ serverBanners }: HomePageClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [banners, setBanners] = useState<Banner[]>(serverBanners || []);
  const [settings, setSettings] = useState<any>(initialSettings);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const { user, isApprovedMerchant } = useAuth();
  const router = useRouter();

  // Keep banners synced if serverBanners changes
  useEffect(() => {
    if (Array.isArray(serverBanners) && serverBanners.length > 0) {
      setBanners(serverBanners);
    }
  }, [serverBanners]);

  useEffect(() => {
    // Purge old stale banner cache from previous implementations
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('souq_store_banners_cache');
      }
    } catch (e) {}

    // Load products/categories/settings from cache safely on client mount without hydration mismatch
    try {
      const cachedProd = localStorage.getItem('souq_store_products_cache');
      if (cachedProd) {
        const parsed = JSON.parse(cachedProd);
        if (Array.isArray(parsed) && parsed.length > 0) setProducts(parsed);
      }
      const cachedCat = localStorage.getItem('souq_store_categories_cache');
      if (cachedCat) {
        const parsed = JSON.parse(cachedCat);
        if (Array.isArray(parsed) && parsed.length > 0) setCategories(parsed);
      }
      const cachedSet = localStorage.getItem('souq_store_settings_cache');
      if (cachedSet) {
        const parsed = JSON.parse(cachedSet);
        if (parsed) setSettings(parsed);
      }
    } catch (e) {}

    try {
      router.prefetch('/products');
    } catch (e) {}

    Promise.all([
      fetch('/api/products', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/categories', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/banners?all=false', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
      fetch('/api/companies', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
      fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
    ])
      .then(([prodData, catData, bannerData, compData, settingsData]) => {
        if (prodData.success && Array.isArray(prodData.products)) {
          setProducts(prodData.products);
          if (typeof window !== 'undefined') {
            localStorage.setItem('souq_store_products_cache', JSON.stringify(prodData.products));
          }
        }
        if (catData.success && Array.isArray(catData.categories)) {
          setCategories(catData.categories);
          if (typeof window !== 'undefined') {
            localStorage.setItem('souq_store_categories_cache', JSON.stringify(catData.categories));
          }
        }
        if (bannerData?.success && Array.isArray(bannerData.banners)) {
          setBanners(bannerData.banners);
        }
        if (compData.success && Array.isArray(compData.companies)) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('souq_store_companies_cache', JSON.stringify(compData.companies));
          }
        }
        if (settingsData?.success && settingsData?.settings) {
          setSettings(settingsData.settings);
          if (typeof window !== 'undefined') {
            localStorage.setItem('souq_store_settings_cache', JSON.stringify(settingsData.settings));
          }
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [router]);

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
  const displayBestSellers = validProducts
    .filter((p) => {
      if (p.isBestSeller || p.isFeatured) return true;
      if (isWholesaleUser) {
        return (p.orderedWholesaleQty || 0) > 0 || (p.orderedTotalQty || 0) > 0;
      }
      return (p.orderedRetailQty || 0) > 0 || (p.orderedTotalQty || 0) > 0;
    })
    .sort((a, b) => {
      const pA = a.isBestSeller ? 1 : 0;
      const pB = b.isBestSeller ? 1 : 0;
      if (pB !== pA) return pB - pA;

      const fA = a.isFeatured ? 1 : 0;
      const fB = b.isFeatured ? 1 : 0;
      if (fB !== fA) return fB - fA;

      const totA = a.orderedTotalQty || 0;
      const totB = b.orderedTotalQty || 0;
      if (totB !== totA) return totB - totA;

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

  // Active Promotional Campaign Showcases for Home (sorted by configured order)
  const activeShowcases = banners
    .filter((b) => b.isActive && b.isCampaignShowcase)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const topShowcases = activeShowcases.filter((b) => b.position === 'top');
  const belowCatShowcases = activeShowcases.filter((b) => b.position === 'below_categories');
  const middleShowcases = activeShowcases.filter((b) => b.position === 'middle');
  const bottomShowcases = activeShowcases.filter((b) => !b.position || b.position === 'bottom' || b.position === 'all');

  return (
    <div className="space-y-5 sm:space-y-6 pb-20 overflow-x-hidden w-full max-w-full">
      
      {/* 1. AUTO-SLIDING BANNERS (TOP) - Hungerstation Full Bleed Hero */}
      <section className="w-full">
        <BannerSlider position="top" initialData={banners.filter(b => !b.isCampaignShowcase && (b.position === 'top' || (!b.position && b.isActive)))} />
      </section>

      {/* 2.5. TOP THEMED CAMPAIGN SHOWCASES (e.g. منتجاتنا الطازجة) */}
      {topShowcases.map((showcase) => (
        <section key={showcase.id} className="max-w-5xl mx-auto px-4 sm:px-6">
          <CampaignShowcaseCard banner={showcase} allProducts={validProducts} />
        </section>
      ))}

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
            جاري تحميل الأقسام...
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
            {categories
              .filter(c => !c.hideFromHome)
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((cat) => (
                <Link
                  key={cat.id || cat.name}
                  href={`/products?category=${encodeURIComponent(cat.name)}`}
                  className="group flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-slate-100/90 hover:border-brand-blue/30 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md transition duration-200 active:scale-95 text-center min-h-[95px] sm:min-h-[110px]"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-1.5 transition duration-300 group-hover:scale-110">
                    <CategoryIcon name={cat.name} icon={cat.icon} />
                  </div>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-700 group-hover:text-brand-blue transition line-clamp-1">
                    {cat.name}
                  </span>
                </Link>
              ))}
          </div>
        )}
      </section>

      {/* 3.5. CATEGORY / SECONDARY HERO BANNERS (PEEK CAROUSEL) */}
      <section className="w-full">
        <BannerSlider position="below_categories" aspectRatio="compact" />
      </section>

      {/* 3.6 BELOW CATEGORIES CAMPAIGN SHOWCASES */}
      {belowCatShowcases.map((showcase) => (
        <section key={showcase.id} className="max-w-5xl mx-auto px-4 sm:px-6">
          <CampaignShowcaseCard banner={showcase} allProducts={validProducts} />
        </section>
      ))}

      {/* 4. SECTION 1: SPECIAL OFFERS / DISCOUNTED PRODUCTS (العروض والتخفيضات الخاصة) */}
      {showOffers && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 flex items-center gap-1.5">
              <span>{offersTitle}</span>
              <span className="text-red-500 text-lg">🔥</span>
            </h2>

            <Link
              href="/products?filter=offers"
              className="text-xs font-bold text-brand-blue hover:text-brand-blueDark flex items-center gap-1"
            >
              <span>شاهد الكل ({offerProducts.length})</span>
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
              <span className="text-amber-500 text-lg">🏆</span>
            </h2>

            <Link
              href="/products?filter=best-seller"
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

      {/* 5.5 MIDDLE BANNER SLIDER */}
      <section className="w-full">
        <BannerSlider position="middle" aspectRatio="compact" />
      </section>

      {/* 5.6 MIDDLE THEMED CAMPAIGN SHOWCASES */}
      {middleShowcases.map((showcase) => (
        <section key={showcase.id} className="max-w-5xl mx-auto px-4 sm:px-6">
          <CampaignShowcaseCard banner={showcase} allProducts={validProducts} />
        </section>
      ))}

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

      {/* 6.5 BOTTOM BANNER SLIDER & BOTTOM CAMPAIGN SHOWCASES */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <BannerSlider position="bottom" />
      </section>

      {bottomShowcases.map((showcase) => (
        <section key={showcase.id} className="max-w-5xl mx-auto px-4 sm:px-6">
          <CampaignShowcaseCard banner={showcase} allProducts={validProducts} />
        </section>
      ))}

      {/* Loading state skeleton if data is loading and no products in cache */}
      {isLoading && products.length === 0 && (
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
