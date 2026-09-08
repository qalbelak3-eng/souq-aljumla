'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { useCart } from '@/context/CartContext';

export default function FloatingBottomCartBar() {
  const pathname = usePathname();
  const { totalItemsCount, subtotal, isCartDrawerOpen, setIsCartDrawerOpen } = useCart();

  // Do not show on Home (Home uses the circular floating cart button)
  // Do not show on Checkout, Admin, Auth, or Driver pages
  // Hide if cart drawer is open
  const isHiddenRoute =
    pathname === '/' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname === '/checkout' ||
    pathname.startsWith('/order-success') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/statement';

  if (isHiddenRoute || totalItemsCount === 0 || isCartDrawerOpen) {
    return null;
  }

  return (
    <div
      onClick={() => setIsCartDrawerOpen(true)}
      className="fixed bottom-4 sm:bottom-6 inset-x-3 sm:inset-x-6 max-w-md mx-auto z-30 bg-slate-950/60 hover:bg-slate-950/75 backdrop-blur-2xl border border-white/25 text-white p-2.5 sm:p-3 rounded-2xl sm:rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.3)] flex items-center justify-between gap-3 cursor-pointer transition-all duration-300 transform active:scale-98 animate-in fade-in slide-in-from-bottom-4 select-none print:hidden"
    >
      {/* Right Details: Frosted Cart Icon + Quantity + Subtotal */}
      <div className="flex items-center gap-2.5 min-w-0 pr-1">
        <div className="relative w-10 h-10 rounded-xl sm:rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 text-white flex items-center justify-center font-black shadow-xs shrink-0">
          <ShoppingCart className="w-5 h-5 stroke-[2.3]" />
          <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-950 text-[10px] font-mono font-black w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-xs border border-white">
            {totalItemsCount}
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-bold text-slate-200 truncate">
            {totalItemsCount} منتجات في السلة
          </p>
          <p className="text-xs sm:text-sm font-black text-amber-300 font-mono tracking-tight">
            {subtotal.toLocaleString()} <span className="text-[10px] font-normal text-slate-300">د.ع</span>
          </p>
        </div>
      </div>

      {/* Left Action Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsCartDrawerOpen(true);
        }}
        className="bg-brand-blue/90 hover:bg-brand-blue backdrop-blur-md text-white font-black text-xs py-2 px-3.5 sm:px-4 rounded-xl sm:rounded-2xl border border-white/20 shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
      >
        <span>عرض السلة</span>
        <ArrowRight className="w-4 h-4 rotate-180" />
      </button>
    </div>
  );
}
