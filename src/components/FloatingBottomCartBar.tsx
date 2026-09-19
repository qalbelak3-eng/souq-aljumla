'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useScrollNav } from '@/context/ScrollNavContext';

export default function FloatingBottomCartBar() {
  const pathname = usePathname();
  const {
    totalItemsCount,
    subtotal,
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    minOrderAmount,
    isBelowMinOrder,
    amountNeededForMinOrder,
  } = useCart();
  const { isNavVisible } = useScrollNav();

  // Animation state for green line on minimum order completion
  const [showGreenCompleteBar, setShowGreenCompleteBar] = useState(false);
  const prevBelowMinOrderRef = useRef<boolean | null>(null);

  useEffect(() => {
    // When switching from below minimum order to met/completed
    if (prevBelowMinOrderRef.current === true && !isBelowMinOrder) {
      setShowGreenCompleteBar(true);
      const timer = setTimeout(() => {
        setShowGreenCompleteBar(false);
      }, 1600);
      return () => clearTimeout(timer);
    }
    prevBelowMinOrderRef.current = isBelowMinOrder;
  }, [isBelowMinOrder]);

  // Do not show on Checkout, Admin, Auth, Driver, or Cart pages
  // Hide if cart drawer is open
  const isHiddenRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname === '/checkout' ||
    pathname.startsWith('/order-success') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/cart' ||
    pathname === '/statement';

  if (isHiddenRoute || totalItemsCount === 0 || isCartDrawerOpen) {
    return null;
  }

  const progressPercent = Math.min(100, Math.round((subtotal / (minOrderAmount || 10000)) * 100));

  return (
    <div
      className={`fixed inset-x-0 z-40 select-none print:hidden transition-all duration-300 ease-out will-change-transform ${
        isNavVisible
          ? 'bottom-[calc(56px+env(safe-area-inset-bottom,0px))]'
          : 'bottom-0 pb-[env(safe-area-inset-bottom,0px)]'
      }`}
    >
      <div className="max-w-lg mx-auto bg-white rounded-t-3xl border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] p-2.5 sm:p-3 space-y-2">
        
        {/* Top Message & Progress: Hungerstation Style */}
        {isBelowMinOrder ? (
          <div className="space-y-1.5 px-1 pt-0.5" dir="rtl">
            <div className="text-[11px] sm:text-xs text-slate-800 font-bold flex items-center justify-between">
              <span>
                أضف <strong className="text-slate-950 font-black font-mono">{amountNeededForMinOrder.toLocaleString()} د.ع</strong> إضافية لإتمام طلبك.
              </span>
              <span className="text-[10px] text-amber-700 font-mono font-black">
                {progressPercent}%
              </span>
            </div>

            {/* Hungerstation Slim Progress Bar (Orange) */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, progressPercent)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="px-1 pt-0.5" dir="rtl">
            <div className="text-[11px] sm:text-xs text-slate-800 font-bold text-right">
              <span><strong>مبروك!</strong> يمكنك الآن إتمام طلبك.</span>
            </div>

            {/* Hungerstation Green Progress Line: animates upon reaching min-order, then fades out smoothly */}
            <div
              className={`w-full overflow-hidden transition-all duration-700 ease-out ${
                showGreenCompleteBar
                  ? 'max-h-3 opacity-100 mt-1.5'
                  : 'max-h-0 opacity-0 mt-0 pointer-events-none'
              }`}
            >
              <div className="w-full bg-emerald-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-600 h-full rounded-full w-full transition-all duration-500" />
              </div>
            </div>
          </div>
        )}

        {/* Main Hungerstation Yellow Button */}
        <button
          type="button"
          onClick={() => setIsCartDrawerOpen(true)}
          className="w-full bg-[#FFDF00] hover:bg-[#F2D400] active:scale-[0.99] text-slate-950 rounded-xl py-2.5 sm:py-3 px-4 flex items-center justify-between font-black text-xs sm:text-sm transition-all cursor-pointer group"
        >
          {/* Right: Circle Count Badge + Title */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white text-slate-950 font-mono font-black text-xs flex items-center justify-center">
              {totalItemsCount}
            </div>
            <span className="font-black text-slate-950 text-xs sm:text-sm">
              عرض السلّة
            </span>
          </div>

          {/* Left: Total Price */}
          <div className="font-mono font-black text-xs sm:text-sm text-slate-950">
            {subtotal.toLocaleString()} د.ع
          </div>
        </button>
      </div>
    </div>
  );
}
