'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Gift,
  Calendar,
  Clock,
  Package,
  FileText,
  ArrowLeft,
  Store,
  Sparkles,
  Receipt,
  Wallet,
  ChevronLeft,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Order } from '@/types';
import MerchantTierBadge from '@/components/MerchantTierBadge';
import { getUserCashbackRate } from '@/lib/pricing';

export default function MerchantStatsCard() {
  const { user, isApprovedMerchant } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [cashbackRate, setCashbackRate] = useState<number>(150);
  const [statementBalance, setStatementBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const promises: Promise<any>[] = [
      fetch('/api/orders').then((res) => res.json()).catch(() => ({ success: false })),
      fetch('/api/settings').then((res) => res.json()).catch(() => ({ success: false })),
    ];

    if (user?.phone) {
      promises.push(
        fetch(`/api/accounting/statement?phone=${encodeURIComponent(user.phone)}`)
          .then((res) => res.json())
          .catch(() => ({ success: false }))
      );
    }

    Promise.all(promises)
      .then(([ordersData, settingsData, statementData]) => {
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

        if (statementData?.success && statementData?.statement?.summary) {
          setStatementBalance(statementData.statement.summary.remainingBalance ?? 0);
        } else {
          setStatementBalance(0);
        }

        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [user]);

  // Calculate live order stats
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

  const statementUrl = user?.phone
    ? `/statement?phone=${encodeURIComponent(user.phone)}`
    : user
    ? '/profile'
    : '/login';

  return (
    <div className="space-y-2.5 w-full select-none max-w-5xl mx-auto">
      
      {/* 1. HERO WALLET CARD: رصيد أرباحك - Modern Luxury Crimson Design */}
      <div className="relative overflow-hidden bg-gradient-to-r from-rose-700 via-red-600 to-rose-800 text-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:py-4 md:px-6 shadow-[0_8px_25px_rgba(225,29,72,0.18)] border border-rose-500/30 flex items-center justify-between group transition-all">
        
        {/* Subtle Ambient Decorative Glow Circles */}
        <div className="absolute -left-12 -top-12 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -right-8 -bottom-8 w-28 h-28 bg-amber-400/15 rounded-full blur-xl pointer-events-none" />

        {/* Left Side: Statement / Account Action Button */}
        <Link
          href={statementUrl}
          className="relative z-10 bg-white/15 hover:bg-white/25 active:scale-95 text-white text-[11px] sm:text-xs font-black py-2 px-3.5 sm:px-4 rounded-xl sm:rounded-2xl backdrop-blur-md transition-all flex items-center gap-1.5 border border-white/20 shadow-xs group-hover:border-white/40"
        >
          <span>عرض كشف الحساب</span>
          <ChevronLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
        </Link>

        {/* Right Side: Badge + Balance Number + Note */}
        <div className="relative z-10 flex flex-col items-end text-right space-y-0.5">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-rose-100 font-bold">
            <span>محفظة أرباحك والكاش باك</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-rose-100 font-sans">د.ع</span>
            <span className="text-2xl sm:text-3xl md:text-4xl font-black font-mono leading-none tracking-tight text-white drop-shadow-xs">
              {profitBalance.toLocaleString()}
            </span>
          </div>

          <span className="text-[9px] sm:text-[10px] text-rose-100/90 font-medium">
            💰 كاش باك {cashbackRate.toLocaleString()} د.ع لكل قطعة
          </span>
        </div>

      </div>

      {/* 2. THE 4 SLEEK STAT CARDS: 2 Cols on mobile, 4 Columns on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        
        {/* 1 (Right): Blue - طلباتي اليوم */}
        <Link
          href={user ? "/profile" : "/login"}
          className="relative overflow-hidden bg-gradient-to-br from-[#0284c7] to-[#0369a1] text-white hover:shadow-md active:scale-98 rounded-2xl p-3 sm:p-3.5 border border-sky-400/20 shadow-xs transition-all flex flex-col justify-between aspect-[16/9] min-h-[72px] md:aspect-auto md:h-[90px] group"
        >
          <div className="flex items-center justify-between gap-1 text-white">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/15 flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5 text-sky-100" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold text-sky-100">طلباتي اليوم</span>
          </div>
          <span className="text-xl sm:text-2xl font-black font-mono text-right leading-none mt-1">
            {todayOrders}
          </span>
        </Link>

        {/* 2 (Second from Right): Green - الطلبات السابقة */}
        <Link
          href={user ? "/profile" : "/login"}
          className="relative overflow-hidden bg-gradient-to-br from-[#16a34a] to-[#15803d] text-white hover:shadow-md active:scale-98 rounded-2xl p-3 sm:p-3.5 border border-emerald-400/20 shadow-xs transition-all flex flex-col justify-between aspect-[16/9] min-h-[72px] md:aspect-auto md:h-[90px] group"
        >
          <div className="flex items-center justify-between gap-1 text-white">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/15 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-100" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold text-emerald-100">الطلبات السابقة</span>
          </div>
          <span className="text-xl sm:text-2xl font-black font-mono text-right leading-none mt-1">
            {previousOrders}
          </span>
        </Link>

        {/* 3: Amber/Gold - قيد المعالجة */}
        <Link
          href={user ? "/profile" : "/login"}
          className="relative overflow-hidden bg-gradient-to-br from-[#d97706] to-[#b45309] text-white hover:shadow-md active:scale-98 rounded-2xl p-3 sm:p-3.5 border border-amber-400/20 shadow-xs transition-all flex flex-col justify-between aspect-[16/9] min-h-[72px] md:aspect-auto md:h-[90px] group"
        >
          <div className="flex items-center justify-between gap-1 text-white">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/15 flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-amber-100" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-100">قيد المعالجة</span>
          </div>
          <span className="text-xl sm:text-2xl font-black font-mono text-right leading-none mt-1">
            {processingOrders}
          </span>
        </Link>

        {/* 4 (First from Left): Deep Purple/Indigo - المبلغ المتبقي (مربوط بكشف الحساب الفعلي) */}
        <Link
          href={statementUrl}
          className="relative overflow-hidden bg-gradient-to-br from-[#6366f1] to-[#4f46e5] text-white hover:shadow-md active:scale-98 rounded-2xl p-3 sm:p-3.5 border border-indigo-400/20 shadow-xs transition-all flex flex-col justify-between aspect-[16/9] min-h-[72px] md:aspect-auto md:h-[90px] group"
        >
          <div className="flex items-center justify-between gap-1 text-white">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/15 flex items-center justify-center">
              <Receipt className="w-3.5 h-3.5 text-indigo-100" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold text-indigo-100">المبلغ المتبقي</span>
          </div>
          <div className="text-right flex items-baseline justify-end gap-1 leading-none mt-1">
            <span className="text-[9px] sm:text-[10px] font-bold text-indigo-200">د.ع</span>
            <span className="text-xl sm:text-2xl font-black font-mono tracking-tight">
              {statementBalance.toLocaleString()}
            </span>
          </div>
        </Link>

      </div>

    </div>
  );
}
