'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import AnnouncementBar from '@/components/AnnouncementBar';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CartDrawer from '@/components/CartDrawer';
import WhatsAppFloatingButton from '@/components/WhatsAppFloatingButton';
import PopupAdvertisement from '@/components/PopupAdvertisement';
import PushNotificationManager from '@/components/PushNotificationManager';

export default function StoreLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith('/admin');
  const isDriverRoute = pathname.startsWith('/driver');
  const isAuthRoute = pathname === '/register' || pathname === '/login';
  const isStatementRoute = pathname === '/statement';
  const isCheckoutRoute = pathname === '/checkout';
  const isOrderSuccessRoute = pathname.startsWith('/order-success');
  
  // Hide main home header on dedicated sub-pages like /products catalog where category header takes over
  const isProductsCatalog = pathname === '/products' || pathname.startsWith('/products/');

  if (isAdminRoute || isAuthRoute || isDriverRoute || isStatementRoute || isCheckoutRoute || isOrderSuccessRoute) {
    // Isolated Dedicated View: No customer header, no announcement bar, no floating widgets, no footer
    return (
      <main className="flex-1 min-h-screen flex flex-col justify-center bg-[#f3f8fc]">
        {children}
      </main>
    );
  }

  // Regular Store View for customers
  return (
    <>
      <AnnouncementBar />
      {/* Show Main Header only on pages that don't have their own dedicated category bar */}
      {!isProductsCatalog && <Header />}
      
      <main className="flex-1">
        {children}
      </main>
      <Footer />
      <CartDrawer />
      <WhatsAppFloatingButton />
      <PopupAdvertisement />
      <PushNotificationManager />
    </>
  );
}
