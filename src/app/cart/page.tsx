'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  Sparkles,
  Tag,
  ShieldCheck,
  Truck,
  Check,
  ChevronLeft
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

export default function CartPage() {
  const {
    cart,
    removeFromCart,
    updateQuantity,
    clearCart,
    subtotal,
    deliveryFee,
    discount,
    total,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    freeDeliveryThreshold,
    amountNeededForFreeDelivery,
    minOrderAmount,
    amountNeededForMinOrder,
    isBelowMinOrder,
  } = useCart();

  const { isApprovedMerchant } = useAuth();
  const router = useRouter();

  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    setIsApplying(true);
    setCouponError('');
    setCouponSuccess('');

    const res = await applyCoupon(couponInput.trim());
    setIsApplying(false);

    if (res.success) {
      setCouponSuccess(res.message);
      setCouponInput('');
    } else {
      setCouponError(res.message);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-slate-400 mx-auto shadow-sm border border-slate-100">
          <ShoppingBag className="w-10 h-10 text-brand-coral" />
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-800">سلة التسوق فارغة</h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          لم تقم بإضافة أي أصناف أو كراتين إلى سلتك بعد. تصفح قائمتنا واختر ما يناسبك!
        </p>
        <Link
          href="/products"
          className="inline-block bg-brand-coral hover:bg-brand-coralHover text-white font-black text-xs py-3 px-8 rounded-2xl shadow-md transition glow-coral"
        >
          تصفح الأصناف والسناكات
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 text-xs">
      
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-brand-coral" />
            <span>سلة المشتريات ({cart.length} أصناف)</span>
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            مراجعة الكميات وتأكيد الطلبية بالدينار العراقي (د.ع)
          </p>
        </div>

        <button
          onClick={clearCart}
          className="text-xs text-red-500 hover:text-red-700 font-bold transition flex items-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>تفريغ السلة</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Items List */}
        <div className="lg:col-span-8 space-y-3">
          {cart.map((item) => (
            <div
              key={`${item.product.id}-${item.saleType}`}
              className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3.5">
                <img
                  src={item.product.images[0]}
                  alt={item.product.name}
                  className="w-16 h-16 object-contain rounded-2xl bg-slate-50 p-1.5 shrink-0"
                />
                <div>
                  <Link href={`/product/${item.product.id}`}>
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm hover:text-brand-blue transition line-clamp-1">
                      {item.product.name}
                    </h3>
                  </Link>
                  <span className={`text-[10px] font-bold inline-block mt-0.5 px-2 py-0.5 rounded ${
                    item.saleType === 'wholesale' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-brand-blue'
                  }`}>
                    {item.saleType === 'wholesale' ? '📦 كرتون جملة' : '🛒 مفرد'} ({item.unitLabel})
                  </span>
                  <div className="text-slate-600 text-[11px] mt-1 font-mono">
                    سعر الوحدة: {item.pricePerUnit.toLocaleString()} د.ع
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Quantity Controls */}
                <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl p-1">
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.saleType)}
                    className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 transition shadow-xs"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-black text-xs px-2 text-slate-900">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.saleType)}
                    className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 transition shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Subtotal Item */}
                <div className="text-right min-w-[75px]">
                  <span className="font-black text-sm text-slate-900 block">
                    {(item.pricePerUnit * item.quantity).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-600 font-bold">د.ع</span>
                </div>

                <button
                  onClick={() => removeFromCart(item.product.id, item.saleType)}
                  className="text-slate-400 hover:text-red-500 p-1 transition"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary Column */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Summary Box */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h2 className="text-sm font-black text-slate-900 border-b border-slate-100 pb-3">
              ملخص الفاتورة والتوصيل
            </h2>

            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>المجموع الفرعي:</span>
                <span className="font-bold text-slate-900">{subtotal.toLocaleString()} د.ع</span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>الخصم المطبق:</span>
                  <span className="font-bold">-{discount.toLocaleString()} د.ع</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>كروة التوصيل:</span>
                <span className="font-bold text-slate-900">
                  {deliveryFee === 0 ? <span className="text-emerald-600 font-bold">مجاناً ⚡</span> : `${deliveryFee.toLocaleString()} د.ع`}
                </span>
              </div>

              {isBelowMinOrder && (
                <div className="bg-amber-50 border-2 border-amber-300 text-amber-950 p-3 rounded-2xl text-[11px] font-black space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <span className="text-sm">⛔</span>
                    <span>الحد الأدنى لقيمة الطلب: {minOrderAmount.toLocaleString()} د.ع</span>
                  </div>
                  <p className="text-[10px] text-amber-800 font-bold">
                    مجموع طلبك الحالي ({subtotal.toLocaleString()} د.ع). يرجى إضافة منتجات بقيمة <strong>{amountNeededForMinOrder.toLocaleString()} د.ع</strong> إضافية لإتمام الطلبية.
                  </p>
                </div>
              )}

              {!isBelowMinOrder && amountNeededForFreeDelivery > 0 && subtotal > 0 && (
                <div className="bg-sky-50 text-brand-blue p-2.5 rounded-xl text-[11px] font-bold">
                  💡 أضف منتجات بقيمة {amountNeededForFreeDelivery.toLocaleString()} د.ع للحصول على توصيل مجاني لكافة مناطق كربلاء! 🚚
                </div>
              )}

              <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-sm font-black text-slate-900">
                <span>الإجمالي النهائي:</span>
                <span className="text-lg font-black text-brand-coral">{total.toLocaleString()} د.ع</span>
              </div>
            </div>

            {/* Coupon Code Input */}
            <form onSubmit={handleApplyCoupon} className="pt-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="كود الخصم (مثال: ETIHAD10)"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-brand-blue uppercase"
                />
                <button
                  type="submit"
                  disabled={isApplying}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 px-4 rounded-xl transition"
                >
                  {isApplying ? '...' : 'تطبيق'}
                </button>
              </div>
              {couponError && <p className="text-red-500 text-[11px] mt-1">{couponError}</p>}
              {couponSuccess && <p className="text-emerald-600 text-[11px] mt-1">{couponSuccess}</p>}
            </form>

            {/* Checkout Button or Min Order Warning Button */}
            {isBelowMinOrder ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled
                  className="w-full bg-slate-200 text-slate-500 font-black py-3.5 px-4 rounded-2xl cursor-not-allowed flex items-center justify-center gap-2 text-xs border border-slate-300"
                >
                  <span>الحد الأدنى للطلب {minOrderAmount.toLocaleString()} د.ع (متبقي {amountNeededForMinOrder.toLocaleString()} د.ع)</span>
                </button>
                <Link
                  href="/products"
                  className="w-full bg-brand-blue hover:bg-blue-700 text-white font-black py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-1.5 text-xs shadow-xs"
                >
                  <span>+ تصفح الأصناف وإكمال الحد الأدنى 🛒</span>
                </Link>
              </div>
            ) : (
              <Link
                href="/checkout"
                className="w-full bg-brand-coral hover:bg-brand-coralHover text-white font-black py-3.5 px-4 rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-xs glow-coral"
              >
                <span>متابعة إتمام الطلبية 🚀</span>
                <ChevronLeft className="w-4 h-4" />
              </Link>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
