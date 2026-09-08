'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Search, Sparkles, ShoppingCart } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { Banner, Product } from '@/types';
import { useCart } from '@/context/CartContext';

export default function CampaignPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params?.id as string;
  const { totalItemsCount, subtotal, setIsCartDrawerOpen } = useCart();

  const [campaign, setCampaign] = useState<Banner | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) return;

    setIsLoading(true);
    Promise.all([
      fetch('/api/banners?all=true').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
    ])
      .then(([bannersData, productsData]) => {
        if (bannersData.success && Array.isArray(bannersData.banners)) {
          const foundBanner = bannersData.banners.find(
            (b: Banner) => b.id === campaignId || b.id === decodeURIComponent(campaignId)
          );
          if (foundBanner) {
            setCampaign(foundBanner);

            if (productsData.success && Array.isArray(productsData.products)) {
              if (foundBanner.campaignProductIds && foundBanner.campaignProductIds.length > 0) {
                const matched = foundBanner.campaignProductIds
                  .map((id: string) => productsData.products.find((p: Product) => p.id === id))
                  .filter(Boolean) as Product[];
                setProducts(matched);
              } else if (foundBanner.category && foundBanner.category !== 'الكل') {
                const matched = productsData.products.filter(
                  (p: Product) => (p.category || '').trim().toLowerCase() === foundBanner.category?.trim().toLowerCase()
                );
                setProducts(matched);
              } else {
                setProducts(productsData.products.slice(0, 16));
              }
            }
          }
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [campaignId]);

  const filteredProducts = products.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.company && p.company.toLowerCase().includes(q))
    );
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center space-y-3">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-bold text-slate-500">جاري تحميل عروض الحملة...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-3xl mx-auto">
          🔍
        </div>
        <h2 className="text-lg font-black text-slate-800">لم يتم العثور على الحملة المطلوبة</h2>
        <p className="text-xs text-slate-500">قد تكون هذه الحملة تم حذفها أو تعديلها</p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 bg-brand-blue text-white font-bold text-xs py-2.5 px-5 rounded-2xl"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للرئيسية</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 space-y-5 select-none">
      
      {/* Clean Top Navigation & Title Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
            title="رجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <h1 className="text-base sm:text-lg font-black text-slate-900">
              {campaign.title || 'منتجات العرض'}
            </h1>
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono font-black px-2.5 py-0.5 rounded-full">
              {filteredProducts.length} منتج
            </span>
          </div>
        </div>

        {/* Right side controls: Search + Cart Button */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Search inside this campaign */}
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث داخل هذه المنتجات..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-9 pl-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 font-medium"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          </div>

          {/* Cart Header Button */}
          <button
            type="button"
            onClick={() => setIsCartDrawerOpen(true)}
            className="relative flex items-center gap-2 bg-[#ef533a] hover:bg-[#e0452c] text-white px-3.5 py-2 rounded-xl shadow-xs transition active:scale-95 cursor-pointer shrink-0 font-black text-xs"
            title="سلة التسوق"
          >
            <ShoppingCart className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">السلة</span>
            {totalItemsCount > 0 ? (
              <span className="bg-white text-[#ef533a] text-[10px] font-mono font-black w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                {totalItemsCount}
              </span>
            ) : (
              <span className="text-[10px] text-white/80 font-mono">0</span>
            )}
          </button>
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mx-auto">
            📦
          </div>
          <h3 className="font-bold text-slate-700 text-xs">لم يتم العثور على منتجات مطابقة للبحث</h3>
          <p className="text-[11px] text-slate-400">جرب كتابة اسم منتج آخر</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 pb-20">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {/* Floating Bottom Cart Bar when items are present */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 max-w-lg mx-auto z-40 bg-slate-950/95 hover:bg-slate-950 backdrop-blur-md text-white p-3.5 rounded-2xl sm:rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] flex items-center justify-between gap-3 border border-slate-800 transition transform animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#ef533a] text-white flex items-center justify-center font-black shadow-sm shrink-0">
              <ShoppingCart className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black">{totalItemsCount} منتج في السلة</span>
              </div>
              <div className="text-sm font-black text-amber-400 font-mono">
                {subtotal.toLocaleString()} د.ع
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCartDrawerOpen(true)}
            className="bg-brand-blue hover:bg-brand-blueDark active:scale-95 text-white text-xs font-black py-2.5 px-4 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span>عرض السلة وإتمام الطلب</span>
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
        </div>
      )}

    </div>
  );
}