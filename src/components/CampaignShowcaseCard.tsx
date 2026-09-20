'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Sparkles, ChevronLeft, ChevronRight, ShoppingBag, Plus } from 'lucide-react';
import { Banner, Product, SaleType } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { getProductPriceForUser } from '@/lib/pricing';
import ProductBuyModal from '@/components/ProductBuyModal';
import TextProductShelf from '@/components/TextProductShelf';

interface CampaignShowcaseCardProps {
  banner: Banner;
  allProducts?: Product[];
  className?: string;
}

export default function CampaignShowcaseCard({ banner, allProducts = [], className = '' }: CampaignShowcaseCardProps) {
  if (banner.isTextShelf || !banner.image) {
    return <TextProductShelf banner={banner} allProducts={allProducts} className={className} />;
  }
  const { user, isApprovedMerchant } = useAuth();
  const { cart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Array.isArray(allProducts) && allProducts.length > 0) {
      if (banner.campaignProductIds && banner.campaignProductIds.length > 0) {
        const matched = banner.campaignProductIds
          .map((id) => allProducts.find((p) => p.id === id))
          .filter(Boolean) as Product[];
        setProducts(matched);
      } else {
        // Fallback: match by banner category if any
        if (banner.category && banner.category !== 'الكل') {
          const matched = allProducts.filter(
            (p) => (p.category || '').trim().toLowerCase() === banner.category?.trim().toLowerCase()
          );
          setProducts(matched.slice(0, 8));
        } else {
          setProducts(allProducts.slice(0, 8));
        }
      }
    } else {
      // Fetch products
      fetch('/api/products')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.products)) {
            if (banner.campaignProductIds && banner.campaignProductIds.length > 0) {
              const matched = banner.campaignProductIds
                .map((id: string) => data.products.find((p: Product) => p.id === id))
                .filter(Boolean) as Product[];
              setProducts(matched);
            } else if (banner.category && banner.category !== 'الكل') {
              const matched = data.products.filter(
                (p: Product) => (p.category || '').trim().toLowerCase() === banner.category?.trim().toLowerCase()
              );
              setProducts(matched.slice(0, 8));
            } else {
              setProducts(data.products.slice(0, 8));
            }
          }
        })
        .catch((err) => console.error(err));
    }
  }, [banner, allProducts]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -280 : 280;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const destinationUrl = banner.linkUrl && banner.linkUrl !== '/products'
    ? banner.linkUrl
    : `/campaigns/${banner.id}`;

  return (
    <div className={`relative my-2 sm:my-6 select-none ${className}`}>
      {/* 1. GRAPHIC DESIGNER BANNER IMAGE (تقوس الحافات العلوية مثل هنقرستيشن تماماً) */}
      <div 
        className="relative w-full rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-none border-0 aspect-[1200/550] max-h-[550px] bg-transparent group"
        style={{ backgroundColor: banner.bannerBgColor || banner.campaignBgColor || 'transparent' }}
      >
        <Link href={destinationUrl} className="block w-full h-full relative cursor-pointer">
          <img
            src={banner.image}
            alt={banner.title || 'حملة عروض'}
            className="w-full h-full object-cover object-center rounded-t-3xl sm:rounded-3xl group-hover:scale-[1.01] transition-transform duration-300"
          />
          {/* Top Navigation Arrow (للدخول إلى صفحة القسم أو العرض) */}
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/40 hover:bg-white/70 backdrop-blur-md text-white hover:text-slate-900 flex items-center justify-center transition shadow-xs active:scale-95">
            <ChevronLeft className="w-5 h-5" />
          </div>
        </Link>
      </div>

      {/* 2. OVERLAPPING HORIZONTAL PRODUCTS STRIP (تنزيل المنتجات قليلاً جداً وبداية بمسافة أنيقة متطابقة مع الأقسام) */}
      {products.length > 0 && (
        <div className="relative -mt-[68px] sm:-mt-[105px] md:-mt-[160px] lg:-mt-[245px] z-10 w-full px-0">
          <div
            ref={scrollContainerRef}
            className="flex items-stretch gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory pt-1 w-full pr-4 sm:pr-6 pl-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {products.map((product) => {
              const selectedType: SaleType = isApprovedMerchant ? 'wholesale' : 'retail';
              const { price: currentPrice } = getProductPriceForUser(product, selectedType, user);
              const currentUnit = selectedType === 'wholesale' 
                ? (user?.accountType === 'market' 
                    ? (product.marketUnit || product.wholesaleUnit?.replace(/جملة/g, 'ماركت') || product.wholesaleUnit)
                    : product.wholesaleUnit)
                : product.retailUnit;
              const isOutOfStock = (product.stock ?? 0) <= 0;

              const oldPrice = selectedType === 'wholesale'
                ? product.originalWholesalePrice
                : product.originalPrice;

              const hasDiscount = Boolean(oldPrice && oldPrice > currentPrice);
              const discountPercent = hasDiscount && oldPrice ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100) : 0;

              const cartItem = cart.find((item) => item.product.id === product.id);
              const inCartQty = cartItem ? cartItem.quantity : 0;

              return (
                <div
                  key={product.id}
                  className="w-[112px] sm:w-[138px] md:w-[155px] shrink-0 bg-white rounded-2xl sm:rounded-3xl p-1.5 sm:p-2 border border-slate-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-md transition-all flex flex-col justify-between group snap-start cursor-pointer"
                  onClick={() => setSelectedProductForModal(product)}
                >
                  {/* Image & Discount Badge */}
                  <div className="relative aspect-square rounded-xl sm:rounded-2xl bg-slate-50/60 overflow-hidden flex items-center justify-center p-1 sm:p-1.5 mb-1">
                    {product.images && product.images[0] ? (
                      <img
                        src={product.images[0] || '/images/placeholder.png'}
                        alt={product.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/images/placeholder.png';
                        }}
                      />
                    ) : (
                      <div className="text-2xl sm:text-3xl">📦</div>
                    )}

                    {hasDiscount && discountPercent > 0 && (
                      <span className="absolute top-1 right-1 bg-[#e11d48] text-white font-black text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-md shadow-xs">
                        وفر {discountPercent}%
                      </span>
                    )}

                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-white/85 backdrop-blur-2xs flex items-center justify-center">
                        <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200">
                          نفد المخزون
                        </span>
                      </div>
                    )}

                    {/* Quick Add / In-Cart Yellow Indicator Button */}
                    {inCartQty > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProductForModal(product);
                        }}
                        className="absolute bottom-1 left-1 w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-[#FFDF00] hover:bg-[#F2D400] text-slate-950 shadow-sm border border-amber-400 flex items-center justify-center font-black text-xs transition active:scale-90 font-mono"
                        title={`${inCartQty} بالسلة - انقر للتعديل`}
                      >
                        {inCartQty}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProductForModal(product);
                        }}
                        className="absolute bottom-1 left-1 w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-white text-slate-800 hover:bg-slate-50 shadow-sm border border-slate-100 flex items-center justify-center transition active:scale-90 disabled:opacity-50 cursor-pointer"
                        title="إضافة للسلة"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    )}
                  </div>

                  {/* Title & Unit */}
                  <div className="space-y-0.5 mb-1 px-0.5">
                    <h4 className="text-[10px] sm:text-[11px] font-bold text-slate-900 line-clamp-1 sm:line-clamp-2 leading-tight group-hover:text-brand-blue transition">
                      {product.name}
                    </h4>
                    {currentUnit && (
                      <span className="text-[9px] text-slate-400 block truncate font-medium">
                        {currentUnit}
                      </span>
                    )}
                  </div>

                  {/* Pricing */}
                  <div className="pt-1 px-0.5 border-t border-slate-100/80 flex items-baseline gap-1 flex-wrap">
                    <div className="text-[11px] sm:text-xs font-black text-[#e11d48]">
                      {currentPrice.toLocaleString()} <span className="text-[9px] font-normal text-slate-600">د.ع</span>
                    </div>
                    {hasDiscount && oldPrice && (
                      <div className="text-[9px] text-slate-400 line-through font-mono">
                        {oldPrice.toLocaleString()} د.ع
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="w-2 sm:w-4 shrink-0" aria-hidden="true" />
          </div>
        </div>
      )}

      {/* Modal for direct buying / quantity choice */}
      {selectedProductForModal && (
        <ProductBuyModal
          isOpen={true}
          product={selectedProductForModal}
          onClose={() => setSelectedProductForModal(null)}
        />
      )}
    </div>
  );
}
