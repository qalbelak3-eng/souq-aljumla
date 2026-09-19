'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';

export default function FloatingBottomCartBar() {
  const pathname = usePathname();
  const {
    totalItemsCount,
    subtotal,
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    isBelowMinOrder,
    amountNeededForMinOrder,
  } = useCart();

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

  return (
    <div className="fixed bottom-[calc(66px+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(72px+env(safe-area-inset-bottom,0px))] inset-x-3 sm:inset-x-6 max-w-lg mx-auto z-40 select-none print:hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-2 sm:p-2.5 shadow-[0_14px_45px_rgba(0,0,0,0.18)] border border-slate-200/90 space-y-1.5">
        
        {/* Top Message: Hungerstation Style */}
        {isBelowMinOrder ? (
          <div className="text-center text-[11px] sm:text-xs text-amber-800 font-bold px-2 pt-0.5 flex items-center justify-center gap-1.5">
            <span>⚠️</span>
            <span>أضف بـ <strong className="font-mono font-black text-amber-950">{amountNeededForMinOrder.toLocaleString()} د.ع</strong> لإكمال الحد الأدنى</span>
          </div>
        ) : (
          <div className="text-center text-[11px] sm:text-xs text-slate-700 font-bold px-2 pt-0.5 flex items-center justify-center gap-1.5">
            <span>🎉</span>
            <span><strong>مبروك!</strong> يمكنك الآن إتمام طلبك.</span>
          </div>
        )}

        {/* Main Hungerstation Yellow Button */}
        <button
          type="button"
          onClick={() => setIsCartDrawerOpen(true)}
          className="w-full bg-[#FFDF00] hover:bg-[#F2D400] active:scale-[0.98] text-slate-950 rounded-2xl py-2.5 sm:py-3 px-4 flex items-center justify-between font-black text-xs sm:text-sm transition-all shadow-md cursor-pointer border border-amber-300/80 group"
        >
          {/* Right: Circle Count Badge + Title */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white text-slate-950 font-mono font-black text-xs flex items-center justify-center shadow-xs">
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
