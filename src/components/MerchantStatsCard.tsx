'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Gift, Calendar, Clock, Package, FileText, ArrowLeft, Store, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Order } from '@/types';
import MerchantTierBadge from '@/components/MerchantTierBadge';
import { getUserCashbackRate } from '@/lib/pricing';

export default function MerchantStatsCard() {
  const { user, isApprovedMerchant } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [cashbackRate, setCashbackRate] = useState<number>(150);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/orders').then((res) => res.json()),
      fetch('/api/settings').then((res) => res.json()).catch(() => ({ success: false })),
    ])
      .then(([ordersData, settingsData]) => {
        if (settingsData?.success && settingsData?.settings) {
          const rate = getUserCashbackRate(user, settingsData.settings);
          setCashbackRate(rate);
        }

        if (ordersData?.success && Array.isArray(ordersData.orders)) {
          if (user) {
            const userOrders = ordersData.orders.filter(
              (o: Order) =>
                (o.customer.userId && o.customer.userId === user.id) ||
                (o.customer.phone && o.customer.phone === user.phone)
            );
            setOrders(userOrders);
          } else {
            setOrders([]);
          }
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [user]);

  // Calculate live statistics
  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (o) => new Date(o.createdAt).toDateString() === today
  ).length;
  const previousOrders = orders.filter((o) => o.status === 'delivered').length;
  const processingOrders = orders.filter(
    (o) => o.status === 'pending' || o.status === 'processing' || o.status === 'shipped'
  ).length;

  const validOrders = orders.filter((o) => o.status !== 'cancelled');
  const totalItemsSold = validOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
  const totalEarnedCashback = totalItemsSold * cashbackRate;
  const totalUsedCashback = validOrders.reduce((sum, o) => sum + Number(o.usedCashbackDiscount || 0), 0);
  const profitBalance = Math.max(0, totalEarnedCashback - totalUsedCashback);

  const remainingBalance = orders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'delivered')
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="space-y-2.5 w-full select-none max-w-5xl mx-auto">
      
      {/* 1. TOP ORANGE CARD: رصيد أرباحك (مطابق تماماً لـ جملتي media_1787414525069.png) */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#ef533a] via-[#f16340] to-[#f47348] text-white rounded-2xl md:rounded-3xl p-3 sm:p-4 md:py-3.5 md:px-6 shadow-sm flex items-center justify-between">
        
        {/* Left Side: Pill Button "عرض ومسحب ←" */}
        <Link
          href={user ? "/profile" : "/login"}
          className="bg-white/20 hover:bg-white/30 active:scale-95 text-white text-[10px] sm:text-xs font-bold py-1.5 px-3 rounded-full backdrop-blur-xs transition flex items-center gap-1 border border-white/20 shadow-xs"
        >
          <span>عرض ومسحب ←</span>
        </Link>

        {/* Right Side: Title + Number + Currency note */}
        <div className="flex flex-col items-end text-right space-y-0.5">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-white font-bold opacity-95">
            <span>رصيد أرباحك</span>
            <Gift className="w-3.5 h-3.5 text-white opacity-90" />
          </div>

          <span className="text-2xl sm:text-3xl font-black font-mono leading-none tracking-tight">
            {profitBalance.toLocaleString()}
          </span>

          <span className="text-[9px] sm:text-[10px] text-white/80 font-medium">
            دينار عراقي : {cashbackRate.toLocaleString()} د.ع لكل قطعة
          </span>
        </div>

      </div>

      {/* 2. THE 4 COLORED STAT RECTANGLES: 2 Cols on mobile, 4 Columns on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 text-white">
        
        {/* 1 (Right): Blue - طلباتي اليوم */}
        <Link
          href={user ? "/profile" : "/login"}
          className="bg-[#0096ea] hover:bg-[#008be5] active:scale-98 rounded-2xl p-3 md:p-3.5 shadow-xs transition flex flex-col justify-between aspect-[16/9] min-h-[66px] md:aspect-auto md:h-22"
        >
          <div className="flex items-center justify-end gap-1.5 text-white text-right">
            <span className="text-[10px] sm:text-[11px] font-bold">طلباتي اليوم</span>
            <Calendar className="w-3.5 h-3.5 opacity-90" />
          </div>
          <span className="text-xl sm:text-2xl font-black font-mono text-right leading-none">
            {todayOrders}
          </span>
        </Link>

        {/* 2: Dark Green - الطلبات السابقة */}
        <Link
          href={user ? "/profile" : "/login"}
          className="bg-[#2a453b] hover:bg-[#233b32] active:scale-98 rounded-2xl p-3 md:p-3.5 shadow-xs transition flex flex-col justify-between aspect-[16/9] min-h-[66px] md:aspect-auto md:h-22"
        >
          <div className="flex items-center justify-end gap-1.5 text-white text-right">
            <span className="text-[10px] sm:text-[11px] font-bold">الطلبات السابقة</span>
            <Clock className="w-3.5 h-3.5 opacity-90" />
          </div>
          <span className="text-xl sm:text-2xl font-black font-mono text-right leading-none">
            {previousOrders}
          </span>
        </Link>

        {/* 3: Yellow/Gold - قيد المعالجة */}
        <Link
          href={user ? "/profile" : "/login"}
          className="bg-[#f0ab1c] hover:bg-[#e4a014] active:scale-98 rounded-2xl p-3 md:p-3.5 shadow-xs transition flex flex-col justify-between aspect-[16/9] min-h-[66px] md:aspect-auto md:h-22"
        >
          <div className="flex items-center justify-end gap-1.5 text-white text-right">
            <span className="text-[10px] sm:text-[11px] font-bold">قيد المعالجة</span>
            <Package className="w-3.5 h-3.5 opacity-90" />
          </div>
          <span className="text-xl sm:text-2xl font-black font-mono text-right leading-none">
            {processingOrders}
          </span>
        </Link>

        {/* 4 (Left): Slate Grey - المبلغ المتبقي */}
        <Link
          href={user ? "/profile" : "/login"}
          className="bg-[#4d666e] hover:bg-[#435960] active:scale-98 rounded-2xl p-3 md:p-3.5 shadow-xs transition flex flex-col justify-between aspect-[16/9] min-h-[66px] md:aspect-auto md:h-22"
        >
          <div className="flex items-center justify-end gap-1.5 text-white text-right">
            <span className="text-[10px] sm:text-[11px] font-bold">المبلغ المتبقي</span>
            <FileText className="w-3.5 h-3.5 opacity-90" />
          </div>
          <div className="text-right flex flex-col items-end leading-none">
            <span className="text-xl sm:text-2xl font-black font-mono">
              {remainingBalance.toLocaleString()}
            </span>
            <span className="text-[8px] sm:text-[9px] text-white/80 font-bold mt-0.5">د.ع</span>
          </div>
        </Link>

      </div>

    </div>
  );
}
