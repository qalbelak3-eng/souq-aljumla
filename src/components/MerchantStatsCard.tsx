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
  CheckCircle2,
  Truck,
  ShieldCheck,
  CreditCard,
  UserCheck
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
            const userPhoneClean = user.phone ? user.phone.replace(/\D/g, '') : '';
            const userOrders = ordersData.orders.filter((o: Order) => {
              const oPhoneClean = o.customer.phone ? o.customer.phone.replace(/\D/g, '') : '';
              return (
                (o.customer.userId && o.customer.userId === user.id) ||
                (userPhoneClean && oPhoneClean && (oPhoneClean === userPhoneClean || oPhoneClean.endsWith(userPhoneClean) || userPhoneClean.endsWith(oPhoneClean)))
              );
            });
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
    (o) => new Date(o.createdAt).toDateString() === today && o.status !== 'cancelled'
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
    <div className="w-full select-none max-w-5xl mx-auto">
      
      {/* 2-CARD SPLIT EXECUTIVE DASHBOARD: Financial Card (Red Gradient) + Orders Pulse (Ultra-Compact Edition) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5">
        
        {/* ═══ CARD 1: المحفظة والحساب المالي (Luxury Crimson Red Glass Card - Ultra Compact) ═══ */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#8b1515] via-[#a81c1c] to-[#680e0e] text-white rounded-xl p-2.5 sm:p-3 border border-red-400/25 shadow-[0_4px_16px_rgba(139,21,21,0.16)] flex flex-col justify-between gap-1.5 group">
          
          {/* Subtle Ambient Radial Lights */}
          <div className="absolute -left-6 -top-6 w-20 h-20 bg-amber-400/15 rounded-full blur-lg pointer-events-none" />
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-red-300/10 rounded-full blur-md pointer-events-none" />

          {/* Top Row: Title Badge & Statement Button */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-white/15 text-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full border border-white/20 backdrop-blur-md">
              <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
              <span>محفظة الأرباح والحساب</span>
            </div>

            <Link
              href={statementUrl}
              className="bg-black/20 hover:bg-black/30 active:scale-95 text-white text-[10px] font-bold py-0.5 px-2 rounded-full border border-white/20 backdrop-blur-md transition flex items-center gap-1 group-hover:border-white/40"
            >
              <Receipt className="w-2.5 h-2.5 text-amber-200" />
              <span>كشف الحساب 🧾</span>
              <ChevronLeft className="w-2.5 h-2.5 transition-transform group-hover:-translate-x-0.5" />
            </Link>
          </div>

          {/* Center: Financial Two Pillars (رصيد أرباحك + المبلغ المتبقي) */}
          <div className="relative z-10 grid grid-cols-2 gap-1.5">
            
            {/* Pillar 1: رصيد أرباح الكاش باك */}
            <div className="bg-black/20 hover:bg-black/25 rounded-lg p-1.5 sm:p-2 border border-white/10 backdrop-blur-md transition space-y-0.5 text-right">
              <div className="flex items-center justify-end gap-1 text-[9px] text-red-100 font-bold">
                <span>رصيد أرباحك</span>
                <span>💰</span>
              </div>
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-sm sm:text-base font-black font-mono text-amber-300 leading-none">
                  {profitBalance.toLocaleString()}
                </span>
                <span className="text-[8.5px] font-bold text-red-100 font-sans">د.ع</span>
              </div>
              <span className="text-[8.5px] text-amber-200 font-bold block leading-tight truncate">
                ✨ اربح ابتداءً من 50 د.ع للقطعة
              </span>
            </div>

            {/* Pillar 2: المبلغ المتبقي (المطلوب) */}
            <Link
              href={statementUrl}
              className="bg-black/20 hover:bg-black/25 rounded-lg p-1.5 sm:p-2 border border-white/10 backdrop-blur-md transition space-y-0.5 text-right block group/item"
            >
              <div className="flex items-center justify-between">
                <ChevronLeft className="w-2.5 h-2.5 text-red-200 group-hover/item:-translate-x-0.5 transition-transform" />
                <div className="flex items-center gap-1 text-[9px] text-red-100 font-bold">
                  <span>المبلغ المتبقي</span>
                  <span>📊</span>
                </div>
              </div>
              <div className="flex items-baseline justify-end gap-1">
                <span className={`text-sm sm:text-base font-black font-mono leading-none ${statementBalance > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {statementBalance.toLocaleString()}
                </span>
                <span className="text-[8.5px] font-bold text-red-100 font-sans">د.ع</span>
              </div>
              <span className="text-[8.5px] text-red-100/90 font-bold block leading-tight truncate">
                {statementBalance > 0 ? '⚠️ مطلوب سداده' : '✅ مسدد بالكامل'}
              </span>
            </Link>

          </div>

        </div>

        {/* ═══ CARD 2: حركة ونشاط الطلبات (Modern Light Glass Card - Ultra Compact) ═══ */}
        <div className="bg-white/95 backdrop-blur-md rounded-xl p-2.5 sm:p-3 border border-slate-200/90 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex flex-col justify-between gap-1.5">
          
          {/* Top Row: Section Title & Orders Link */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-slate-800 text-[11px] font-black">
              <div className="w-4.5 h-4.5 rounded-md bg-red-50 text-red-600 flex items-center justify-center border border-red-100">
                <Package className="w-2.5 h-2.5" />
              </div>
              <span>نشاط وحالة الطلبيات</span>
            </div>

            <Link
              href={user ? "/profile" : "/login"}
              className="text-[10px] font-bold text-slate-700 hover:text-red-600 flex items-center gap-0.5 bg-slate-100/80 hover:bg-red-50 px-2 py-0.5 rounded-full transition border border-slate-200"
            >
              <span>سجل الطلبات</span>
              <ChevronLeft className="w-2.5 h-2.5" />
            </Link>
          </div>

          {/* 3 Metric Tiles (طلبات اليوم + قيد التجهيز + الطلبات السابقة) */}
          <div className="grid grid-cols-3 gap-1.5">
            
            {/* Metric 1: طلباتي اليوم */}
            <Link
              href={user ? "/profile" : "/login"}
              className="bg-slate-50/90 hover:bg-red-50/70 rounded-lg p-1 sm:p-1.5 border border-slate-200/80 hover:border-red-200 transition text-center space-y-0.5 block active:scale-98"
            >
              <div className="w-4.5 h-4.5 mx-auto rounded-full bg-blue-100/80 text-blue-700 flex items-center justify-center">
                <Calendar className="w-2.5 h-2.5" />
              </div>
              <span className="text-sm sm:text-base font-black font-mono text-slate-900 block leading-tight">
                {todayOrders}
              </span>
              <span className="text-[8.5px] font-bold text-slate-500 block">
                اليوم
              </span>
            </Link>

            {/* Metric 2: قيد التجهيز */}
            <Link
              href={user ? "/profile" : "/login"}
              className="bg-slate-50/90 hover:bg-amber-50/70 rounded-lg p-1 sm:p-1.5 border border-slate-200/80 hover:border-amber-200 transition text-center space-y-0.5 block active:scale-98"
            >
              <div className="w-4.5 h-4.5 mx-auto rounded-full bg-amber-100/80 text-amber-700 flex items-center justify-center">
                <Clock className="w-2.5 h-2.5" />
              </div>
              <span className="text-sm sm:text-base font-black font-mono text-amber-600 block leading-tight">
                {processingOrders}
              </span>
              <span className="text-[8.5px] font-bold text-slate-500 block">
                قيد التجهيز
              </span>
            </Link>

            {/* Metric 3: الطلبات السابقة */}
            <Link
              href={user ? "/profile" : "/login"}
              className="bg-slate-50/90 hover:bg-emerald-50/70 rounded-lg p-1 sm:p-1.5 border border-slate-200/80 hover:border-emerald-200 transition text-center space-y-0.5 block active:scale-98"
            >
              <div className="w-4.5 h-4.5 mx-auto rounded-full bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-2.5 h-2.5" />
              </div>
              <span className="text-sm sm:text-base font-black font-mono text-emerald-600 block leading-tight">
                {previousOrders}
              </span>
              <span className="text-[8.5px] font-bold text-slate-500 block">
                السابقة
              </span>
            </Link>

          </div>

        </div>

      </div>

    </div>
  );
}
