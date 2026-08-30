'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Star, Check, Crown, Award } from 'lucide-react';
import { Product, SaleType } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { getProductPriceForUser } from '@/lib/pricing';
import ProductBuyModal from '@/components/ProductBuyModal';

export default function ProductCard({ product }: { product: Product }) {
  const { user, isApprovedMerchant } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!product) return null;

  const selectedType: SaleType = isApprovedMerchant ? 'wholesale' : 'retail';
  const { price: currentPrice, tierLabel, tier } = getProductPriceForUser(product, selectedType, user);
  const currentUnit = selectedType === 'wholesale' ? product.wholesaleUnit : product.retailUnit;
  const isOutOfStock = (product.stock ?? 0) <= 0;

  // Offer / Discount calculation
  const oldPrice = selectedType === 'wholesale' 
    ? product.originalWholesalePrice 
    : product.originalPrice;

  const hasDiscount = Boolean(oldPrice && oldPrice > currentPrice);
  const discountPercent = hasDiscount && oldPrice ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100) : 0;
  const savingsAmount = hasDiscount && oldPrice ? oldPrice - currentPrice : 0;

  const handleOpenBuyModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;
    setIsModalOpen(true);
  };

  return (
    <>
      <div className={`relative bg-white rounded-3xl p-3 sm:p-4 border transition-all duration-300 flex flex-col justify-between overflow-hidden group ${
        hasDiscount ? 'border-rose-200/80 shadow-[0_4px_16px_rgba(240,81,56,0.08)] hover:shadow-xl hover:border-brand-coral/40 ring-1 ring-rose-100/50' : 'border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-lg'
      } ${isOutOfStock ? 'opacity-70 bg-slate-50' : ''}`}>
        
        {/* Top Badges */}
        <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none flex flex-col gap-1 items-start">
          {hasDiscount ? (
            <span className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 text-white text-[10px] sm:text-[11px] font-black px-2.5 py-1 rounded-xl shadow-md flex items-center gap-1 animate-pulse">
              <span>🔥 {product.offerBadge || 'عرض خاص'}</span>
              {discountPercent > 0 && <span className="bg-white/20 px-1 py-0.2 rounded-md font-mono">-%{discountPercent}</span>}
            </span>
          ) : isApprovedMerchant ? (
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg shadow-xs flex items-center gap-0.5 ${
              tier === 'gold' ? 'bg-amber-400 text-amber-950 font-black' : tier === 'silver' ? 'bg-slate-700 text-white' : 'bg-amber-800 text-white'
            }`}>
              <span>{tierLabel}</span>
            </span>
          ) : product.isNew ? (
            <span className="bg-sky-500 text-white text-[10px] font-black px-2 py-0.5 rounded-lg shadow-xs">
              ✨ جديد
            </span>
          ) : null}
        </div>

        {/* Out of Stock Banner */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] z-20 flex items-center justify-center">
            <span className="bg-brand-coral text-white font-black text-xs px-4 py-1.5 rounded-xl shadow-lg">
              غير متوفر
            </span>
          </div>
        )}

        {/* Product Image */}
        <div
          onClick={handleOpenBuyModal}
          className="block relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-50/80 mb-2 mt-4 p-2 cursor-pointer"
        >
          <img
            src={product.images[0] || 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=500'}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        </div>

        {/* Product Title & Packaging Unit Description */}
        <div className="space-y-1 mb-2">
          <Link href={`/product/${product.id}`}>
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-2 hover:text-brand-blue transition leading-snug">
              {product.name}
            </h3>
          </Link>
          <p className="text-[11px] text-slate-500 line-clamp-1">
            {currentUnit}
          </p>
        </div>

        {/* Bottom Row: Price & Buy Button */}
        <div className="pt-2 border-t border-slate-100 flex items-end justify-between gap-2 mt-auto">
          
          {/* Price on right */}
          <div className="text-right space-y-0.5">
            {hasDiscount && oldPrice && (
              <div className="flex items-center gap-1 text-[11px] leading-none">
                <span className="text-slate-400 font-bold line-through font-mono">
                  {oldPrice.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400">د.ع</span>
              </div>
            )}
            
            <div className="flex items-baseline gap-1">
              <span className={`text-sm sm:text-base font-black block leading-none font-mono ${
                hasDiscount ? 'text-red-600' : 'text-slate-900'
              }`}>
                {currentPrice.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-600 font-bold">
                د.ع
              </span>
            </div>

            {hasDiscount && savingsAmount > 0 && (
              <span className="text-[9px] text-emerald-700 font-black bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded block w-fit">
                وفّر {savingsAmount.toLocaleString()} د.ع
              </span>
            )}
          </div>

          {/* 'اشتري' Button -> Opens Quantity Selection Modal */}
          <button
            type="button"
            onClick={handleOpenBuyModal}
            disabled={isOutOfStock}
            className={`font-black py-2 px-3.5 sm:px-4 rounded-xl text-xs transition transform active:scale-95 flex items-center gap-1 shadow-xs cursor-pointer ${
              hasDiscount
                ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-rose-200 ring-1 ring-red-300/50'
                : 'bg-[#16a34a] hover:bg-[#15803d] text-white shadow-sm shadow-green-600/20'
            }`}
            title="اختيار الكمية والشراء"
          >
            <span>اشتري</span>
          </button>

        </div>

      </div>

      {/* Quantity Buy Modal */}
      <ProductBuyModal
        product={product}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialSaleType={selectedType}
      />
    </>
  );
}
