'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { Banner, Product, SaleType } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { getProductPriceForUser } from '@/lib/pricing';
import ProductBuyModal from '@/components/ProductBuyModal';

interface TextProductShelfProps {
  banner: Banner;
  allProducts?: Product[];
  className?: string;
}

export default function TextProductShelf({ banner, allProducts = [], className = '' }: TextProductShelfProps) {
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
      <div className="flex items-center justify-between mb-2 sm:mb-3 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
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

      {/* 2. HORIZONTAL PRODUCT STRIP (شريط المنتجات بنفس حجم ونمط حملات العروض ممتد لنهاية الشاشة) */}
      <div
        ref={scrollContainerRef}
        className="flex items-stretch gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory pt-0.5 w-full"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* بداية شريط المنتجات بمسافة 16px متناسقة مع حافة الصفحة في RTL */}
        <div className="w-2 sm:w-3 shrink-0 pointer-events-none" aria-hidden="true" />
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
        {/* نهاية شريط المنتجات بمسافة متناسقة عند اكتمال التمرير */}
        <div className="w-2 sm:w-3 shrink-0 pointer-events-none" aria-hidden="true" />
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
