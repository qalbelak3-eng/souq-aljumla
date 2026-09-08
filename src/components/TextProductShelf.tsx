'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { Banner, Product, SaleType } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { getProductPriceForUser } from '@/lib/pricing';
import ProductBuyModal from '@/components/ProductBuyModal';

interface TextProductShelfProps {
  banner: Banner;
  allProducts?: Product[];
  className?: string;
}

export default function TextProductShelf({ banner, allProducts = [], className = '' }: TextProductShelfProps) {
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
        if (banner.category && banner.category !== 'الكل') {
          const matched = allProducts.filter(
            (p) => (p.category || '').trim().toLowerCase() === banner.category?.trim().toLowerCase()
          );
          setProducts(matched.slice(0, 10));
        } else {
          setProducts(allProducts.slice(0, 10));
        }
      }
    } else {
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
              setProducts(matched.slice(0, 10));
            } else {
              setProducts(data.products.slice(0, 10));
            }
          }
        })
        .catch((err) => console.error(err));
    }
  }, [banner, allProducts]);

  if (products.length === 0) {
    return null;
  }

  const destinationUrl = banner.linkUrl && banner.linkUrl !== '/products'
    ? banner.linkUrl
    : `/campaigns/${banner.id}`;

  return (
    <div className={`my-3 sm:my-5 select-none ${className}`}>
      {/* 1. CLEAN SECTION HEADER (العنوان الكتابي وسهم الانتقال للقسم) */}
      <div className="flex items-center justify-between mb-2.5 sm:mb-3.5 px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-xl font-black text-slate-900 tracking-tight">
            {banner.title || banner.campaignProductsTitle || 'قسم مميز'}
          </h3>
          {banner.badge && (
            <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full">
              {banner.badge}
            </span>
          )}
        </div>

        {/* Destination Arrow Link */}
        <Link
          href={destinationUrl}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition shadow-2xs active:scale-95 cursor-pointer shrink-0"
          title="عرض كافة منتجات القسم"
        >
          <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
        </Link>
      </div>

      {/* 2. HORIZONTAL PRODUCT STRIP (شريط المنتجات الأفقي) */}
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
              className="w-[140px] sm:w-[165px] md:w-[175px] shrink-0 bg-white rounded-2xl sm:rounded-3xl p-2 sm:p-2.5 border border-slate-100/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group snap-start cursor-pointer"
              onClick={() => setSelectedProductForModal(product)}
            >
              {/* Image & Discount Badge */}
              <div className="relative aspect-square rounded-xl sm:rounded-2xl bg-slate-50/70 overflow-hidden flex items-center justify-center p-2 mb-1.5">
                {product.images && product.images[0] ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="text-3xl">📦</div>
                )}

                {hasDiscount && discountPercent > 0 && (
                  <span className="absolute top-1.5 right-1.5 bg-[#e11d48] text-white font-black text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-lg shadow-xs">
                    وفر {discountPercent}%
                  </span>
                )}

                {isOutOfStock && (
                  <div className="absolute inset-0 bg-white/85 backdrop-blur-2xs flex items-center justify-center">
                    <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                      نفد المخزون
                    </span>
                  </div>
                )}

                {/* Quick Add Button */}
                <button
                  type="button"
                  disabled={isOutOfStock}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProductForModal(product);
                  }}
                  className="absolute bottom-1.5 left-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white text-slate-800 hover:bg-slate-50 shadow-md border border-slate-100 flex items-center justify-center transition active:scale-90 disabled:opacity-50 cursor-pointer"
                  title="إضافة للسلة"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                </button>
              </div>

              {/* Title & Unit */}
              <div className="space-y-0.5 mb-1 px-1">
                <h4 className="text-[11px] sm:text-xs font-bold text-slate-900 line-clamp-2 leading-tight group-hover:text-brand-blue transition">
                  {product.name}
                </h4>
                {currentUnit && (
                  <span className="text-[10px] text-slate-400 block truncate font-medium">
                    {currentUnit}
                  </span>
                )}
              </div>

              {/* Pricing */}
              <div className="pt-1.5 px-1 border-t border-slate-100/80 flex items-baseline gap-1.5 flex-wrap">
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

      {/* Buy Modal */}
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
