'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Sparkles, ChevronLeft, ChevronRight, ShoppingBag, Plus } from 'lucide-react';
import { Banner, Product, SaleType } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { getProductPriceForUser } from '@/lib/pricing';
import ProductBuyModal from '@/components/ProductBuyModal';

interface CampaignShowcaseCardProps {
  banner: Banner;
  allProducts?: Product[];
  className?: string;
}

export default function CampaignShowcaseCard({ banner, allProducts = [], className = '' }: CampaignShowcaseCardProps) {
  const { user, isApprovedMerchant } = useAuth();
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
      const scrollAmount = direction === 'left' ? -260 : 260;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const bgColor = banner.campaignBgColor || '#15803d'; // Default fresh green

  return (
    <div
      className={`rounded-3xl overflow-hidden shadow-md border border-slate-100 transition-all ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {/* 1. THEMED CAMPAIGN HEADER BANNER */}
      <div className="relative overflow-hidden p-4 sm:p-6 text-white">
        {/* Background Image / Texture if available */}
        {banner.image && (
          <div className="absolute inset-0 z-0">
            <img
              src={banner.image}
              alt={banner.title}
              className="w-full h-full object-cover object-center opacity-30 mix-blend-overlay"
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to right, ${bgColor} 0%, ${bgColor}d9 50%, transparent 100%)`,
              }}
            />
          </div>
        )}

        {/* Content Details */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 max-w-xl">
            {banner.badge && (
              <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-md text-white text-[11px] font-black px-2.5 py-0.5 rounded-full mb-1">
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>{banner.badge}</span>
              </span>
            )}
            <h3 className="text-xl sm:text-2xl font-black tracking-tight drop-shadow-xs">
              {banner.title}
            </h3>
            {banner.subtitle && (
              <p className="text-xs sm:text-sm text-white/90 font-medium line-clamp-2 drop-shadow-xs">
                {banner.subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {banner.linkUrl && (
              <Link
                href={banner.linkUrl}
                className="bg-white text-slate-900 hover:bg-slate-100 active:scale-95 font-black text-xs py-2 px-4 rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>تسوق العرض</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Link>
            )}

            {products.length > 2 && (
              <div className="hidden sm:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => scroll('right')}
                  className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition cursor-pointer backdrop-blur-xs"
                  aria-label="السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scroll('left')}
                  className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition cursor-pointer backdrop-blur-xs"
                  aria-label="التالي"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. HORIZONTAL PRODUCTS SLIDER CAROUSEL */}
      {products.length > 0 && (
        <div className="p-3 sm:p-4 pt-0">
          <div
            ref={scrollContainerRef}
            className="flex items-stretch gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {products.map((product) => {
              const selectedType: SaleType = isApprovedMerchant ? 'wholesale' : 'retail';
              const { price: currentPrice } = getProductPriceForUser(product, selectedType, user);
              const currentUnit = selectedType === 'wholesale' ? product.wholesaleUnit : product.retailUnit;
              const isOutOfStock = (product.stock ?? 0) <= 0;

              const oldPrice = selectedType === 'wholesale'
                ? product.originalWholesalePrice
                : product.originalPrice;

              const hasDiscount = Boolean(oldPrice && oldPrice > currentPrice);
              const discountPercent = hasDiscount && oldPrice ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100) : 0;

              return (
                <div
                  key={product.id}
                  className="w-[160px] sm:w-[185px] shrink-0 bg-white rounded-2xl p-2.5 border border-white/40 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group snap-start cursor-pointer"
                  onClick={() => setSelectedProductForModal(product)}
                >
                  {/* Image & Discount Badge */}
                  <div className="relative aspect-square rounded-xl bg-slate-50 overflow-hidden flex items-center justify-center p-2 mb-2">
                    {product.images && product.images[0] ? (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="text-3xl">📦</div>
                    )}

                    {hasDiscount && discountPercent > 0 && (
                      <span className="absolute top-1.5 right-1.5 bg-red-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded-lg shadow-xs">
                        -%{discountPercent}
                      </span>
                    )}

                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-2xs flex items-center justify-center">
                        <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          نفد المخزون
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Title & Unit */}
                  <div className="space-y-1 mb-2">
                    <h4 className="text-xs font-black text-slate-900 line-clamp-2 leading-snug group-hover:text-brand-blue transition">
                      {product.name}
                    </h4>
                    {currentUnit && (
                      <span className="text-[10px] text-slate-500 font-bold block truncate">
                        {currentUnit}
                      </span>
                    )}
                  </div>

                  {/* Pricing & Add Button */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                    <div>
                      <div className="text-xs sm:text-sm font-black text-brand-blue">
                        {currentPrice.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">د.ع</span>
                      </div>
                      {hasDiscount && oldPrice && (
                        <div className="text-[10px] text-slate-400 line-through font-mono">
                          {oldPrice.toLocaleString()} د.ع
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isOutOfStock}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProductForModal(product);
                      }}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-brand-coral hover:bg-brand-coralHover text-white flex items-center justify-center shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                      title="إضافة للسلة"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                </div>
              );
            })}
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
