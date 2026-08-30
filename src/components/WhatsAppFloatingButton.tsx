'use client';

import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/context/CartContext';

export default function WhatsAppFloatingButton() {
  const { totalItemsCount, setIsCartDrawerOpen } = useCart();

  return (
    /* Floating Coral Cart Button matching Jumlaty app (Screenshot media_1787336778773.jpg) */
    <button
      onClick={() => setIsCartDrawerOpen(true)}
      className="fixed bottom-6 left-5 sm:bottom-7 sm:left-7 z-50 w-14 h-14 sm:w-16 sm:h-16 bg-[#ef533a] hover:bg-[#e0452c] active:scale-95 text-white rounded-full shadow-[0_8px_25px_rgba(239,83,58,0.45)] flex items-center justify-center transition-all duration-300 transform hover:scale-105 border-2 border-white/20 print:hidden"
      aria-label="سلة التسوق"
      title="سلة التسوق"
    >
      <ShoppingCart className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.3]" />
      
      {totalItemsCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-950 text-xs font-black w-5.5 h-5.5 rounded-full flex items-center justify-center border-2 border-white shadow-md font-mono animate-bounce">
          {totalItemsCount}
        </span>
      )}
    </button>
  );
}
