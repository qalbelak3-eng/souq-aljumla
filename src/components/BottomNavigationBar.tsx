'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ShoppingBag, BadgePercent, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import { useScrollNav } from '@/context/ScrollNavContext';

function BottomNavContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { isNavVisible } = useScrollNav();

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
      className={`fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200/80 shadow-[0_-2px_15px_rgba(0,0,0,0.04)] print:hidden select-none pb-[env(safe-area-inset-bottom,0px)] transition-transform duration-300 ease-out will-change-transform ${
        isNavVisible ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`}
    >
      <div className="max-w-lg mx-auto px-2 py-1 flex items-center justify-around h-[56px]">
        
        {/* 1. الرئيسية: ملون عند التفعيل ورمادي عند عدم التفعيل بدون إطار أصفر */}
        <Link
          href="/"
          prefetch={true}
          onClick={() => setOptimisticTab('home')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
            isHome
              ? 'text-slate-950 font-black'
              : 'text-slate-500 hover:text-slate-800 font-bold'
          }`}
        >
          <div
            style={{ width: '22px', height: '22px' }}
            className="w-[22px] h-[22px] max-w-[22px] max-h-[22px] rounded-md overflow-hidden flex items-center justify-center shrink-0"
          >
            <img
              src={isHome ? '/images/souq-app-icon.png' : '/images/souq-app-icon-grey.png'}
              alt="الرئيسية"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              className="w-full h-full object-cover rounded-[3px] pointer-events-none"
            />
          </div>
          <span className="text-[10px] mt-0.5 leading-tight font-bold">الرئيسية</span>
        </Link>

        {/* 2. الطلبات (أصفر عند التفعيل) */}
        <Link
          href="/orders"
          prefetch={true}
          onClick={() => setOptimisticTab('orders')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
            isOrders
              ? 'text-slate-950 font-black'
              : 'text-slate-500 hover:text-slate-800 font-bold'
          }`}
        >
          <ShoppingBag
            className={`w-5 h-5 ${
              isOrders
                ? 'stroke-slate-950 fill-[#fed000] stroke-[2]'
                : 'stroke-slate-600 fill-none stroke-[1.8]'
            }`}
          />
          <span className="text-[10px] mt-0.5 leading-tight font-bold">الطلبات</span>
        </Link>

        {/* 3. العروض (أصفر فوري عند التفعيل) */}
        <Link
          href="/products?filter=offers"
          prefetch={true}
          onClick={() => setOptimisticTab('offers')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors ${
            isOffers
              ? 'text-slate-950 font-black'
              : 'text-slate-500 hover:text-slate-800 font-bold'
          }`}
        >
          <BadgePercent
            className={`w-5 h-5 ${
              isOffers
                ? 'stroke-slate-950 fill-[#fed000] stroke-[2]'
                : 'stroke-slate-600 fill-none stroke-[1.8]'
            }`}
          />
          <span className="text-[10px] mt-0.5 leading-tight font-bold">العروض</span>
        </Link>

        {/* 4. حسابي (أصفر عند التفعيل) */}
        <Link
          href="/profile"
          prefetch={true}
          onClick={() => setOptimisticTab('account')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-colors relative ${
            isAccount
              ? 'text-slate-950 font-black'
              : 'text-slate-500 hover:text-slate-800 font-bold'
          }`}
        >
          <User
            className={`w-5 h-5 ${
              isAccount
                ? 'stroke-slate-950 fill-[#fed000] stroke-[2]'
                : 'stroke-slate-600 fill-none stroke-[1.8]'
            }`}
          />
          <span className="text-[10px] mt-0.5 leading-tight font-bold">حسابي</span>

          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-[calc(50%-14px)] w-2 h-2 bg-red-600 rounded-full animate-pulse" />
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
