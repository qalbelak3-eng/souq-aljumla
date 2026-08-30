'use client';

import React, { useState } from 'react';
import { X, Plus, Minus, ShoppingBag, Check, Gift } from 'lucide-react';
import { Product, SaleType } from '@/types';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { getProductPriceForUser } from '@/lib/pricing';

interface ProductBuyModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  initialSaleType?: SaleType;
}

export default function ProductBuyModal({
  product,
  isOpen,
  onClose,
  initialSaleType,
}: ProductBuyModalProps) {
  const { addToCart, freeDeliveryThreshold } = useCart();
  const { user, isApprovedMerchant } = useAuth();

  const [saleType, setSaleType] = useState<SaleType>(
    initialSaleType || (isApprovedMerchant ? 'wholesale' : 'retail')
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  if (!isOpen) return null;

  const { price: currentPrice, tierLabel, tier } = getProductPriceForUser(product, saleType, user);
  const { price: wholesaleCalculatedPrice } = getProductPriceForUser(product, 'wholesale', user);
  const { price: retailCalculatedPrice } = getProductPriceForUser(product, 'retail', user);
  const currentUnit = saleType === 'wholesale' ? product.wholesaleUnit : product.retailUnit;
  const oldPrice = saleType === 'wholesale' ? product.originalWholesalePrice : product.originalPrice;
  const hasDiscount = Boolean(oldPrice && oldPrice > currentPrice);
  const total = currentPrice * quantity;
  const availableStock = product.stock || 24;

  const handleConfirmBuy = () => {
    addToCart(product, quantity, saleType);
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 text-xs select-none">
      
      {/* Dark Translucent Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Centered Modal Card (في وسط الشاشة تماماً لجميع الأجهزة) */}
      <div className="relative bg-white rounded-3xl max-w-sm sm:max-w-md w-full p-4 sm:p-6 space-y-3.5 sm:space-y-4 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-200 border border-slate-100 overflow-hidden my-auto">
        
        {/* Floating Top Close Button (X) */}
        <button
          onClick={onClose}
          className="absolute top-3.5 left-3.5 z-20 w-8 h-8 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition shadow-xs cursor-pointer border border-slate-200"
          aria-label="إغلاق"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Centered Large Product Image */}
        <div className="bg-[#f0f7ff] rounded-2xl p-3 sm:p-4 flex items-center justify-center relative aspect-[4/3] max-h-48 sm:max-h-52 overflow-hidden mx-auto w-full">
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-contain drop-shadow-sm transition-transform duration-300 hover:scale-105"
          />
        </div>

        {/* Product Title & Packaging Unit Description */}
        <div className="space-y-1 text-center sm:text-right">
          <h3 className="text-sm font-black text-slate-900 leading-snug">
            {product.name}
          </h3>
          <p className="text-xs text-slate-500 font-bold">
            الوحدة المختارة: <span className="text-slate-800 font-black">{currentUnit}</span>
          </p>
        </div>

        {/* Dual Choice: Buy by Piece (مفرد) OR Buy by Carton/Box (كرتون/علبة) */}
        {product.wholesalePrice > 0 && product.price > 0 && (
          <div className="grid grid-cols-2 gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => {
                setSaleType('retail');
                setQuantity(1);
              }}
              className={`py-2 px-2.5 rounded-xl font-bold text-xs transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                saleType === 'retail'
                  ? 'bg-white text-brand-blue shadow-xs ring-2 ring-blue-200 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-1">
                <span>🛒 بالقطعة (مفرد)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-medium">({product.retailUnit || 'قطعة'})</span>
              <span className="font-mono text-xs font-black text-brand-blue mt-0.5">{retailCalculatedPrice.toLocaleString()} د.ع</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSaleType('wholesale');
                setQuantity(1);
              }}
              className={`py-2 px-2.5 rounded-xl font-bold text-xs transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                saleType === 'wholesale'
                  ? 'bg-white text-emerald-700 shadow-xs ring-2 ring-emerald-200 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-1">
                <span>📦 بالكرتون / الباكيت</span>
              </span>
              <span className="text-[10px] text-slate-500 font-medium">({product.wholesaleUnit || 'كرتون'})</span>
              <span className="font-mono text-xs font-black text-emerald-700 mt-0.5">
                {wholesaleCalculatedPrice.toLocaleString()} د.ع
              </span>
            </button>
          </div>
        )}

        {/* Large Price Row */}
        <div className="flex items-baseline justify-between border-y border-slate-100 py-2 px-1">
          <span className="text-xs font-bold text-slate-600">سعر الوحدة المختارة:</span>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-black leading-none font-mono ${
              hasDiscount ? 'text-red-600' : 'text-slate-900'
            }`}>
              {currentPrice.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-600">د.ع</span>
            {hasDiscount && oldPrice && (
              <span className="text-[11px] text-slate-400 font-bold line-through font-mono mr-1">
                {oldPrice.toLocaleString()} د.ع
              </span>
            )}
          </div>
        </div>

        {/* Quantity Selector Row */}
        <div className="bg-[#f8fafc] border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">
            الكمية <span className="text-[11px] text-slate-600 font-normal">(المتوفر: {availableStock})</span>
          </span>

          <div className="flex items-center gap-2">
            {/* Minus Button */}
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center transition shadow-xs active:scale-95 cursor-pointer shrink-0"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Direct Number Input */}
            <input
              type="number"
              min="1"
              max={availableStock}
              value={quantity === 0 ? '' : quantity}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                if (isNaN(val)) {
                  setQuantity(1);
                } else {
                  setQuantity(Math.max(0, val));
                }
              }}
              onBlur={() => {
                if (!quantity || quantity < 1) setQuantity(1);
              }}
              onFocus={(e) => e.target.select()}
              className="w-16 h-8 text-center text-sm font-black text-slate-900 font-mono bg-white border border-slate-300 rounded-xl focus:border-brand-blue focus:ring-2 focus:ring-blue-100 focus:outline-none transition shadow-inner"
              title="اضغط لكتابة العدد المطلوب مباشرة"
            />

            {/* Plus Button: Dark Green Circle */}
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              className="w-8 h-8 rounded-full bg-[#1b4332] hover:bg-[#143628] text-white flex items-center justify-center transition shadow-xs active:scale-95 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Gift / Savings Badge */}
        <div className="bg-[#fff1f0] border border-rose-200/80 rounded-2xl py-2 px-3 text-center flex items-center justify-center gap-1.5 text-[11px] font-bold text-brand-coral">
          <Gift className="w-3.5 h-3.5" />
          <span>توصيل مجاني للطلبيات فوق {(freeDeliveryThreshold || 50000).toLocaleString()} د.ع لكافة مناطق كربلاء 🚚</span>
        </div>

        {/* Total Summary Row */}
        <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-600">المجموع</span>
          <div className="text-left">
            <span className="text-xl font-black text-brand-coral font-mono">
              {total.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-brand-coral mr-1">د.ع</span>
          </div>
        </div>

        {/* 'اشتري' Wide Button */}
        <button
          type="button"
          onClick={handleConfirmBuy}
          className={`w-full font-black py-3.5 px-4 rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-xs sm:text-sm transform active:scale-98 cursor-pointer ${
            added
              ? 'bg-[#16a34a] text-white'
              : hasDiscount
              ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-rose-200'
              : 'bg-[#16a34a] hover:bg-[#15803d] text-white shadow-sm'
          }`}
        >
          {added ? (
            <>
              <Check className="w-5 h-5" />
              <span>تمت الإضافة للسلة بنجاح!</span>
            </>
          ) : (
            <>
              <span>اشتري</span>
              <ShoppingBag className="w-4 h-4" />
            </>
          )}
        </button>

      </div>

    </div>
  );
}
