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
      const scrollAmount = direction === 'left' ? -280 : 280;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className={`space-y-3.5 my-4 sm:my-6 ${className}`}>
      {/* 1. GRAPHIC DESIGNER BANNER IMAGE (التصميم الإعلاني الكامل) */}
      <div className="relative w-full rounded-3xl overflow-hidden shadow-xs border border-slate-100/80 group">
        {banner.linkUrl ? (
          <Link href={banner.linkUrl} className="block w-full">
            <img
              src={banner.image}
              alt={banner.title || 'حملة عروض'}
              className="w-full h-auto object-cover rounded-3xl group-hover:opacity-95 transition"
            />
          </Link>
        ) : (
          <img
            src={banner.image}
            alt={banner.title || 'حملة عروض'}
            className="w-full h-auto object-cover rounded-3xl"
          />
        )}

        {/* Desktop Scroll Controls if many products */}
        {products.length > 3 && (
          <div className="absolute bottom-3 left-3 hidden sm:flex items-center gap-1.5 z-10">
            <button
              type="button"
              onClick={() => scroll('right')}
              className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition cursor-pointer backdrop-blur-xs shadow-sm"
              aria-label="السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll('left')}
              className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition cursor-pointer backdrop-blur-xs shadow-sm"
              aria-label="التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 2. HORIZONTAL PRODUCTS STRIP (شريط المنتجات المعروضة) */}
      {products.length > 0 && (
        <div className="relative">
          <div
            ref={scrollContainerRef}
            className="flex items-stretch gap-2.5 sm:gap-3.5 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory pt-0.5 px-0.5"
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
                  className="w-[145px] sm:w-[170px] shrink-0 bg-white rounded-2xl p-2.5 border border-slate-200/70 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group snap-start cursor-pointer"
                  onClick={() => setSelectedProductForModal(product)}
                >
                  {/* Image & Discount Badge */}
                  <div className="relative aspect-square rounded-xl bg-slate-50/70 overflow-hidden flex items-center justify-center p-2 mb-2">
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
                      <span className="absolute top-1.5 right-1.5 bg-[#e11d48] text-white font-black text-[10px] px-2 py-0.5 rounded-md shadow-xs">
                        وفر {discountPercent}%
                      </span>
                    )}

                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-2xs flex items-center justify-center">
                        <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          نفد المخزون
                        </span>
                      </div>
                    )}

                    {/* Quick Add Button on bottom left of image */}
                    <button
                      type="button"
                      disabled={isOutOfStock}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProductForModal(product);
                      }}
                      className="absolute bottom-1.5 left-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white text-slate-800 hover:bg-slate-100 shadow-md border border-slate-100 flex items-center justify-center transition active:scale-90 disabled:opacity-50 cursor-pointer"
                      title="إضافة للسلة"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>

                  {/* Title & Unit */}
                  <div className="space-y-0.5 mb-1.5">
                    <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight group-hover:text-brand-blue transition">
                      {product.name}
                    </h4>
                    {currentUnit && (
                      <span className="text-[10px] text-slate-400 block truncate">
                        {currentUnit}
                      </span>
                    )}
                  </div>

                  {/* Pricing */}
                  <div className="pt-1.5 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                    <div className="text-xs sm:text-sm font-black text-[#e11d48]">
                      {currentPrice.toLocaleString()} <span className="text-[10px] font-normal text-slate-600">د.ع</span>
                    </div>
                    {hasDiscount && oldPrice && (
                      <div className="text-[10px] text-slate-400 line-through font-mono">
                        {oldPrice.toLocaleString()} د.ع
                      </div>
                    )}
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
