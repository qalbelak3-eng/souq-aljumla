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
      
      {/* 2-CARD SPLIT EXECUTIVE DASHBOARD: Financial Card + Orders Pulse */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        
        {/* ═══ CARD 1: المحفظة والحساب المالي (Luxury Royal Blue Glass Card) ═══ */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0c2444] via-[#103058] to-[#081830] text-white rounded-3xl p-4 sm:p-5 border border-blue-400/20 shadow-[0_8px_30px_rgba(12,36,68,0.18)] flex flex-col justify-between space-y-3.5 group">
          
          {/* Subtle Ambient Radial Lights */}
          <div className="absolute -left-10 -top-10 w-36 h-36 bg-amber-400/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-emerald-400/15 rounded-full blur-xl pointer-events-none" />

          {/* Top Row: Title Badge & Statement Button */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-1.5 bg-amber-400/15 text-amber-300 text-[11px] sm:text-xs font-black px-3 py-1 rounded-full border border-amber-400/30 backdrop-blur-md shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>محفظة الأرباح والحساب</span>
            </div>

            <Link
              href={statementUrl}
              className="bg-white/10 hover:bg-white/20 active:scale-95 text-white text-[11px] sm:text-xs font-bold py-1 px-3 rounded-full border border-white/20 backdrop-blur-md transition flex items-center gap-1.5 group-hover:border-white/40 shadow-xs"
            >
              <Receipt className="w-3.5 h-3.5 text-sky-300" />
              <span>كشف الحساب 🧾</span>
              <ChevronLeft className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" />
            </Link>
          </div>

          {/* Center: Financial Two Pillars (رصيد أرباحك + المبلغ المتبقي) */}
          <div className="relative z-10 grid grid-cols-2 gap-3 pt-1">
            
            {/* Pillar 1: رصيد أرباح الكاش باك */}
            <div className="bg-white/10 hover:bg-white/15 rounded-2xl p-3 border border-white/15 backdrop-blur-md transition space-y-1.5 text-right shadow-xs">
              <span className="text-[11px] text-slate-200 font-bold block flex items-center justify-end gap-1">
                <span>رصيد أرباحك</span>
                <span>💰</span>
              </span>
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-xl sm:text-2xl font-black font-mono text-emerald-300 leading-none drop-shadow-xs">
                  {profitBalance.toLocaleString()}
                </span>
                <span className="text-[10px] font-bold text-slate-300 font-sans">د.ع</span>
              </div>
              <span className="text-[10px] text-amber-300 font-bold block leading-tight">
                ✨ اربح ابتداءً من 50 د.ع للقطعة
              </span>
            </div>

            {/* Pillar 2: المبلغ المتبقي (المطلوب) */}
            <Link
              href={statementUrl}
              className="bg-white/10 hover:bg-white/15 rounded-2xl p-3 border border-white/15 backdrop-blur-md transition space-y-1.5 text-right block shadow-xs group/item"
            >
              <div className="flex items-center justify-between">
                <ChevronLeft className="w-3.5 h-3.5 text-slate-300 group-hover/item:-translate-x-0.5 transition-transform" />
                <span className="text-[11px] text-slate-200 font-bold flex items-center gap-1">
                  <span>المبلغ المتبقي</span>
                  <span>📊</span>
                </span>
              </div>
              <div className="flex items-baseline justify-end gap-1">
                <span className={`text-xl sm:text-2xl font-black font-mono leading-none drop-shadow-xs ${statementBalance > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {statementBalance.toLocaleString()}
                </span>
                <span className="text-[10px] font-bold text-slate-300 font-sans">د.ع</span>
              </div>
              <span className="text-[10px] text-slate-300 font-bold block leading-tight">
                {statementBalance > 0 ? '⚠️ رصيد مطلوب سداده' : '✅ حسابك مسدد بالكامل'}
              </span>
            </Link>

          </div>

        </div>

        {/* ═══ CARD 2: حركة ونشاط الطلبات (Modern Light Glass Card) ═══ */}
        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 sm:p-5 border border-sky-100/90 shadow-[0_8px_30px_rgba(0,100,255,0.06)] flex flex-col justify-between space-y-3.5">
          
          {/* Top Row: Section Title & Orders Link */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 text-xs sm:text-sm font-black">
              <div className="w-7 h-7 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center shadow-2xs border border-blue-100/80">
                <Package className="w-4 h-4" />
              </div>
              <span>نشاط وحالة الطلبيات</span>
            </div>

            <Link
              href={user ? "/profile" : "/login"}
              className="text-[11px] font-bold text-brand-blue hover:text-brand-blueDark flex items-center gap-0.5 bg-blue-50 hover:bg-blue-100/80 px-3 py-1 rounded-full transition border border-blue-100/80 shadow-2xs"
            >
              <span>سجل الطلبات</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 3 Metric Tiles (طلبات اليوم + قيد التجهيز + الطلبات السابقة) */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-1">
            
            {/* Metric 1: طلباتي اليوم */}
            <Link
              href={user ? "/profile" : "/login"}
              className="bg-gradient-to-b from-sky-50/90 to-white hover:from-sky-100/90 rounded-2xl p-2.5 sm:p-3 border border-sky-100 hover:border-sky-300 transition text-center space-y-1.5 block shadow-2xs active:scale-98"
            >
              <div className="w-7 h-7 mx-auto rounded-full bg-sky-100 text-sky-700 flex items-center justify-center shadow-2xs">
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <span className="text-lg sm:text-xl font-black font-mono text-slate-900 block leading-tight">
                {todayOrders}
              </span>
              <span className="text-[10px] font-bold text-slate-600 block">
                طلبات اليوم
              </span>
            </Link>

            {/* Metric 2: قيد التجهيز */}
            <Link
              href={user ? "/profile" : "/login"}
              className="bg-gradient-to-b from-amber-50/90 to-white hover:from-amber-100/90 rounded-2xl p-2.5 sm:p-3 border border-amber-100 hover:border-amber-300 transition text-center space-y-1.5 block shadow-2xs active:scale-98"
            >
              <div className="w-7 h-7 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shadow-2xs">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <span className="text-lg sm:text-xl font-black font-mono text-amber-600 block leading-tight">
                {processingOrders}
              </span>
              <span className="text-[10px] font-bold text-slate-600 block">
                قيد التجهيز
              </span>
            </Link>

            {/* Metric 3: الطلبات السابقة */}
            <Link
              href={user ? "/profile" : "/login"}
              className="bg-gradient-to-b from-emerald-50/90 to-white hover:from-emerald-100/90 rounded-2xl p-2.5 sm:p-3 border border-emerald-100 hover:border-emerald-300 transition text-center space-y-1.5 block shadow-2xs active:scale-98"
            >
              <div className="w-7 h-7 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <span className="text-lg sm:text-xl font-black font-mono text-emerald-600 block leading-tight">
                {previousOrders}
              </span>
              <span className="text-[10px] font-bold text-slate-600 block">
                الطلبات السابقة
              </span>
            </Link>

          </div>

        </div>

      </div>

    </div>
  );
}
