'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Receipt,
  ChevronLeft,
  Wallet
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Order } from '@/types';
import { getUserCashbackRate } from '@/lib/pricing';

export default function WalletStatsCard() {
  const { user } = useAuth();
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
      {/* ═══ المحفظة والحساب المالي (Modern Light Glass Card - Matching Orders Pulse Theme) ═══ */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex flex-col justify-between gap-2.5">
        
        {/* Top Row: Section Title & Statement Link */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-800 text-xs sm:text-sm font-black">
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Wallet className="w-3.5 h-3.5" />
            </div>
            <span>محفظة الأرباح والحساب</span>
          </div>

          <Link
            href={statementUrl}
            className="text-[11px] font-bold text-slate-700 hover:text-brand-blue flex items-center gap-1 bg-slate-100/80 hover:bg-blue-50 px-2.5 py-1 rounded-full transition border border-slate-200"
          >
            <span>كشف الحساب 🧾</span>
            <ChevronLeft className="w-3 h-3" />
          </Link>
        </div>

        {/* 2 Financial Pillars (رصيد أرباحك + المبلغ المتبقي) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          
          {/* Pillar 1: رصيد أرباح الكاش باك */}
          <div className="bg-slate-50/90 hover:bg-emerald-50/70 rounded-xl p-2 sm:p-2.5 border border-slate-200/80 hover:border-emerald-200 transition text-center space-y-1 block">
            <div className="w-6 h-6 mx-auto rounded-full bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-base sm:text-lg font-black font-mono text-emerald-600 block leading-tight">
                {profitBalance.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-slate-500">د.ع</span>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 block truncate">
              ✨ اربح على كل قطعة تطلبها
            </span>
          </div>

          {/* Pillar 2: المبلغ المتبقي (المطلوب) */}
          <Link
            href={statementUrl}
            className="bg-slate-50/90 hover:bg-rose-50/70 rounded-xl p-2 sm:p-2.5 border border-slate-200/80 hover:border-rose-200 transition text-center space-y-1 block active:scale-98 group/item"
          >
            <div className={`w-6 h-6 mx-auto rounded-full ${statementBalance > 0 ? 'bg-amber-100/80 text-amber-700' : 'bg-emerald-100/80 text-emerald-700'} flex items-center justify-center`}>
              <Receipt className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-baseline justify-center gap-1">
              <span className={`text-base sm:text-lg font-black font-mono leading-tight ${statementBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {statementBalance.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-slate-500">د.ع</span>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 block truncate">
              {statementBalance > 0 ? '⚠️ مطلوب سداده' : '✅ مسدد بالكامل'}
            </span>
          </Link>

        </div>

      </div>
    </div>
  );
}
