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
  const totalItemsSold = validOrders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => (i.saleType === 'wholesale' ? s : s + (i.quantity || 0)), 0),
    0
  );
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
      
      {/* ═══ حركة ونشاط الطلبات (Modern Light Glass Card - Sleek Compact Edition) ═══ */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex flex-col justify-between gap-2.5">
        
        {/* Top Row: Section Title & Orders Link */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-800 text-xs sm:text-sm font-black">
            <div className="w-6 h-6 rounded-lg bg-blue-50 text-brand-blue flex items-center justify-center border border-blue-100">
              <Package className="w-3.5 h-3.5" />
            </div>
            <span>نشاط وحالة الطلبيات</span>
          </div>

          <Link
            href={user ? "/profile" : "/login"}
            className="text-[11px] font-bold text-slate-700 hover:text-brand-blue flex items-center gap-1 bg-slate-100/80 hover:bg-blue-50 px-2.5 py-1 rounded-full transition border border-slate-200"
          >
            <span>سجل الطلبات</span>
            <ChevronLeft className="w-3 h-3" />
          </Link>
        </div>

        {/* 3 Metric Tiles (طلبات اليوم + قيد التجهيز + الطلبات السابقة) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          
          {/* Metric 1: طلباتي اليوم */}
          <Link
            href={user ? "/profile" : "/login"}
            className="bg-slate-50/90 hover:bg-blue-50/70 rounded-xl p-2 sm:p-2.5 border border-slate-200/80 hover:border-blue-200 transition text-center space-y-1 block active:scale-98"
          >
            <div className="w-6 h-6 mx-auto rounded-full bg-blue-100/80 text-blue-700 flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <span className="text-base sm:text-lg font-black font-mono text-slate-900 block leading-tight">
              {todayOrders}
            </span>
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 block">
              اليوم
            </span>
          </Link>

          {/* Metric 2: قيد التجهيز */}
          <Link
            href={user ? "/profile" : "/login"}
            className="bg-slate-50/90 hover:bg-amber-50/70 rounded-xl p-2 sm:p-2.5 border border-slate-200/80 hover:border-amber-200 transition text-center space-y-1 block active:scale-98"
          >
            <div className="w-6 h-6 mx-auto rounded-full bg-amber-100/80 text-amber-700 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <span className="text-base sm:text-lg font-black font-mono text-amber-600 block leading-tight">
              {processingOrders}
            </span>
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 block">
              قيد التجهيز
            </span>
          </Link>

          {/* Metric 3: الطلبات السابقة */}
          <Link
            href={user ? "/profile" : "/login"}
            className="bg-slate-50/90 hover:bg-emerald-50/70 rounded-xl p-2 sm:p-2.5 border border-slate-200/80 hover:border-emerald-200 transition text-center space-y-1 block active:scale-98"
          >
            <div className="w-6 h-6 mx-auto rounded-full bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <span className="text-base sm:text-lg font-black font-mono text-emerald-600 block leading-tight">
              {previousOrders}
            </span>
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 block">
              الطلبات السابقة
            </span>
          </Link>

        </div>

      </div>

    </div>
  );
}
