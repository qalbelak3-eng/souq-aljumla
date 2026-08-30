'use client';

import React from 'react';
import Link from 'next/link';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, MessageCircle, Truck, Sparkles } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

export default function CartDrawer() {
  const {
    cart,
    removeFromCart,
    updateQuantity,
    subtotal,
    deliveryFee,
    discount,
    total,
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    freeDeliveryThreshold,
    amountNeededForFreeDelivery,
    isFreeDelivery,
    minOrderAmount,
    amountNeededForMinOrder,
    isBelowMinOrder,
  } = useCart();

  const { isApprovedMerchant } = useAuth();

  if (!isCartDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden text-xs print:hidden">
      
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={() => setIsCartDrawerOpen(false)}
      />

      <div className="fixed inset-y-0 left-0 max-w-full flex pl-10 sm:pl-16">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-r border-slate-100">
          
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-coral/10 text-brand-coral flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-800">سلة المشتريات والطلبيات</h2>
                <span className="text-[11px] text-slate-500">
                  {cart.length} أصناف مسجلة
                  {isApprovedMerchant && <strong className="text-emerald-600 mr-1">(بأسعار الجملة 👑)</strong>}
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsCartDrawerOpen(false)}
              className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Dynamic Free Delivery Progress Bar */}
          {cart.length > 0 && (
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              {isFreeDelivery ? (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 py-1.5 px-3 rounded-xl text-center font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs">
                  <Truck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>🎉 مبروك! حصلت على توصيل مجاني للطلبية</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-700 font-bold">
                    <span className="flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-amber-600" />
                      <span>أضف بـ <strong className="text-emerald-700 font-mono font-black">{amountNeededForFreeDelivery.toLocaleString()} د.ع</strong> للتوصيل المجاني</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {subtotal.toLocaleString()} / {freeDeliveryThreshold.toLocaleString()} د.ع
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.round((subtotal / (freeDeliveryThreshold || 50000)) * 100))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8fbfe]">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-700">السلة فارغة حالياً</h3>
                <p className="text-xs text-slate-500">تصفح الأصناف والسناكات وأضف ما تحتاجه بالمفرد أو كراتين الجملة!</p>
                <button
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="mt-2 bg-brand-blue hover:bg-brand-blueDark text-white font-bold text-xs py-2.5 px-6 rounded-xl transition"
                >
                  تصفح الأصناف الآن
                </button>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={`${item.product.id}-${item.saleType}`}
                  className="bg-white p-3 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3"
                >
                  <img
                    src={item.product.images[0]}
                    alt={item.product.name}
                    className="w-14 h-14 object-contain rounded-xl bg-slate-50 p-1 shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-800 text-xs truncate">{item.product.name}</h4>
                    <span className={`text-[10px] font-bold inline-block mt-0.5 px-1.5 py-0.5 rounded ${
                      item.saleType === 'wholesale' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-brand-blue'
                    }`}>
                      {item.saleType === 'wholesale' ? '📦 كرتون جملة' : '🛒 مفرد'} ({item.unitLabel})
                    </span>

                    <div className="flex items-center justify-between mt-2">
                      <span className="font-black text-slate-900 text-xs">
                        {(item.pricePerUnit * item.quantity).toLocaleString()} د.ع
                      </span>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.saleType)}
                          className="w-6 h-6 rounded bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 transition shadow-xs cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity === 0 ? '' : item.quantity}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                            if (isNaN(val)) {
                              updateQuantity(item.product.id, 1, item.saleType);
                            } else {
                              updateQuantity(item.product.id, Math.max(0, val), item.saleType);
                            }
                          }}
                          onBlur={() => {
                            if (!item.quantity || item.quantity < 1) updateQuantity(item.product.id, 1, item.saleType);
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-12 h-6 text-center font-bold text-xs text-slate-900 font-mono bg-white border border-slate-200 rounded focus:border-brand-blue focus:outline-none transition shadow-inner"
                          title="اضغط لتعديل العدد مباشرة"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.saleType)}
                          className="w-6 h-6 rounded bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 transition shadow-xs cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.product.id, item.saleType)}
                    className="text-slate-400 hover:text-red-500 p-1"
                    title="حذف من السلة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer Summary */}
          {cart.length > 0 && (
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-white space-y-3 shadow-lg">
              {/* Minimum Order Warning in Drawer */}
              {isBelowMinOrder && (
                <div className="bg-amber-50 border-2 border-amber-300 text-amber-950 p-2.5 rounded-xl text-[11px] font-black space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <span className="text-sm">⛔</span>
                    <span>الحد الأدنى لقيمة الطلب: {minOrderAmount.toLocaleString()} د.ع</span>
                  </div>
                  <p className="text-[10px] text-amber-800 font-bold leading-tight">
                    مجموع طلبك الحالي ({subtotal.toLocaleString()} د.ع). متبقي <strong>{amountNeededForMinOrder.toLocaleString()} د.ع</strong> إضافية لإتمام الطلبية.
                  </p>
                </div>
              )}

              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span className="font-bold text-slate-800">{subtotal.toLocaleString()} د.ع</span>
                </div>
                <div className="flex justify-between">
                  <span>كروة التوصيل:</span>
                  <span className="font-bold text-slate-800">
                    {deliveryFee === 0 ? <span className="text-emerald-600 font-black">مجاناً ⚡</span> : `${deliveryFee.toLocaleString()} د.ع`}
                  </span>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-sm font-black text-slate-900">
                  <span>الإجمالي الكلي:</span>
                  <span className="text-base font-black text-brand-coral">{total.toLocaleString()} د.ع</span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {isBelowMinOrder ? (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      disabled
                      className="w-full bg-slate-200 text-slate-500 font-black py-3 px-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2 text-xs border border-slate-300 shadow-none"
                    >
                      <span>الحد الأدنى للطلب {minOrderAmount.toLocaleString()} د.ع (متبقي {amountNeededForMinOrder.toLocaleString()} د.ع)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCartDrawerOpen(false)}
                      className="w-full bg-brand-blue hover:bg-blue-700 text-white font-black py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-1.5 text-xs shadow-xs cursor-pointer"
                    >
                      <span>+ تصفح الأصناف وإكمال الحد الأدنى 🛒</span>
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/checkout"
                    onClick={() => setIsCartDrawerOpen(false)}
                    className="w-full bg-brand-coral hover:bg-brand-coralHover text-white font-black py-3 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    <span>إتمام الطلبية وتأكيد الشراء 🚀</span>
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </Link>
                )}

                <Link
                  href="/cart"
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl transition text-center block text-xs"
                >
                  عرض السلة الكاملة
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
