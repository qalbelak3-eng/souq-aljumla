'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ShoppingBag, BadgePercent, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';

function BottomNavContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();

  // Optimistic click state for instant 0ms visual feedback
  const [optimisticTab, setOptimisticTab] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticTab(null);
  }, [pathname, searchParams]);

  // Hide on Admin, Driver, Checkout, Cart, Order Success, Login, Register
  const isHiddenRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname === '/checkout' ||
    pathname.startsWith('/order-success') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/cart';

  if (isHiddenRoute) return null;

  const currentFilter = searchParams?.get('filter') || '';
  const isActualOffers = pathname === '/products' && (currentFilter === 'offers' || currentFilter.includes('offer'));
  const isActualOrders = pathname === '/orders' || pathname.startsWith('/orders');
  const isActualAccount = pathname.startsWith('/profile');
  const isActualHome = pathname === '/' && !currentFilter;

  // Resolved active tab (optimistic has priority, falls back to router)
  const activeTab = optimisticTab || (
    isActualOffers ? 'offers' :
    isActualOrders ? 'orders' :
    isActualAccount ? 'account' :
    isActualHome ? 'home' : ''
  );

  const isHome = activeTab === 'home';
  const isOrders = activeTab === 'orders';
  const isOffers = activeTab === 'offers';
  const isAccount = activeTab === 'account';

  return (
    <nav
      aria-label="شريط التنقل السفلي"
      className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[440px] z-40 print:hidden select-none"
    >
      <div className="bg-white/95 backdrop-blur-xl rounded-full px-2.5 py-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.12)] border border-slate-200/90 flex items-center justify-around">
        
        {/* 1. الرئيسية: ملون عند التفعيل ورمادي عند عدم التفعيل بدون إطار أصفر */}
        <Link
          href="/"
          onClick={() => setOptimisticTab('home')}
          className={`flex flex-col items-center justify-center transition-all duration-200 ${
            isHome
              ? 'bg-[#f0f1f3] rounded-full py-1.5 px-3.5 sm:px-4 text-slate-950 font-black'
              : 'bg-transparent py-1.5 px-2.5 sm:px-3 text-slate-700 hover:text-slate-950 font-bold'
          }`}
        >
          <div
            style={{ width: '22px', height: '22px' }}
            className="w-[22px] h-[22px] max-w-[22px] max-h-[22px] rounded-md overflow-hidden flex items-center justify-center shadow-2xs shrink-0 transition-all"
          >
            <img
              src={isHome ? '/images/souq-app-icon.png' : '/images/souq-app-icon-grey.png'}
              alt="الرئيسية"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              className="w-full h-full object-cover rounded-[3px] pointer-events-none"
            />
          </div>
          <span className="text-[10.5px] mt-0.5 leading-tight font-black">الرئيسية</span>
        </Link>

        {/* 2. الطلبات (أصفر عند التفعيل) */}
        <Link
          href="/orders"
          onClick={() => setOptimisticTab('orders')}
          className={`flex flex-col items-center justify-center transition-all duration-200 ${
            isOrders
              ? 'bg-[#f0f1f3] rounded-full py-1.5 px-3.5 sm:px-4 text-slate-950 font-black'
              : 'bg-transparent py-1.5 px-2.5 sm:px-3 text-slate-700 hover:text-slate-950 font-bold'
          }`}
        >
          <ShoppingBag
            className={`w-5 h-5 transition-transform ${
              isOrders
                ? 'stroke-slate-950 fill-[#fed000] stroke-[2] scale-105'
                : 'stroke-slate-700 fill-none stroke-[1.8]'
            }`}
          />
          <span className="text-[10.5px] mt-0.5 leading-tight font-black">الطلبات</span>
        </Link>

        {/* 3. العروض (أصفر فوري عند التفعيل) */}
        <Link
          href="/products?filter=offers"
          onClick={() => setOptimisticTab('offers')}
          className={`flex flex-col items-center justify-center transition-all duration-200 ${
            isOffers
              ? 'bg-[#f0f1f3] rounded-full py-1.5 px-3.5 sm:px-4 text-slate-950 font-black'
              : 'bg-transparent py-1.5 px-2.5 sm:px-3 text-slate-700 hover:text-slate-950 font-bold'
          }`}
        >
          <BadgePercent
            className={`w-5 h-5 transition-transform ${
              isOffers
                ? 'stroke-slate-950 fill-[#fed000] stroke-[2] scale-105'
                : 'stroke-slate-700 fill-none stroke-[1.8]'
            }`}
          />
          <span className="text-[10.5px] mt-0.5 leading-tight font-black">العروض</span>
        </Link>

        {/* 4. حسابي (أصفر عند التفعيل) */}
        <Link
          href="/profile"
          onClick={() => setOptimisticTab('account')}
          className={`flex flex-col items-center justify-center transition-all duration-200 relative ${
            isAccount
              ? 'bg-[#f0f1f3] rounded-full py-1.5 px-3.5 sm:px-4 text-slate-950 font-black'
              : 'bg-transparent py-1.5 px-2.5 sm:px-3 text-slate-700 hover:text-slate-950 font-bold'
          }`}
        >
          <User
            className={`w-5 h-5 transition-transform ${
              isAccount
                ? 'stroke-slate-950 fill-[#fed000] stroke-[2] scale-105'
                : 'stroke-slate-700 fill-none stroke-[1.8]'
            }`}
          />
          <span className="text-[10.5px] mt-0.5 leading-tight font-black">حسابي</span>

          {unreadCount > 0 && (
            <span className="absolute top-1 right-2 w-2 h-2 bg-red-600 rounded-full animate-pulse" />
          )}
        </Link>

      </div>
    </nav>
  );
}

export default function BottomNavigationBar() {
  return (
    <Suspense fallback={null}>
      <BottomNavContent />
    </Suspense>
  );
}
