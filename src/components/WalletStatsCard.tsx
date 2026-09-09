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
      {/* ═══ المحفظة والحساب المالي (Ultra Compact Sleek Edition) ═══ */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#39297e] via-[#4d3ca2] to-[#322372] text-white rounded-xl p-2 sm:p-2.5 border border-purple-300/30 shadow-[0_4px_16px_rgba(77,60,162,0.18)] flex flex-col justify-between gap-1.5 group">
        
        {/* Subtle Ambient Violet Radial Glows */}
        <div className="absolute -left-6 -top-6 w-20 h-20 bg-white/10 rounded-full blur-lg pointer-events-none" />
        <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-purple-300/10 rounded-full blur-md pointer-events-none" />

        {/* Top Row: Section Title & Statement Button */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-white/15 text-white text-[10px] font-black px-2 py-0.5 rounded-full border border-white/20 backdrop-blur-md">
            <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
            <span>محفظة الأرباح والحساب</span>
          </div>

          <Link
            href={statementUrl}
            className="bg-white/15 hover:bg-white/25 active:scale-95 text-white text-[10px] font-bold py-0.5 px-2 rounded-full border border-white/20 backdrop-blur-md transition flex items-center gap-1 group-hover:border-white/40"
          >
            <Receipt className="w-2.5 h-2.5 text-white" />
            <span>كشف الحساب 🧾</span>
            <ChevronLeft className="w-2.5 h-2.5 transition-transform group-hover:-translate-x-0.5" />
          </Link>
        </div>

        {/* 2 Financial Pillars (رصيد أرباحك + المبلغ المتبقي) */}
        <div className="relative z-10 grid grid-cols-2 gap-1.5 sm:gap-2">
          
          {/* Pillar 1: رصيد أرباح الكاش باك */}
          <div className="bg-white/10 hover:bg-white/15 rounded-lg p-1.5 sm:p-2 border border-white/15 backdrop-blur-md transition space-y-0.5 text-right">
            <div className="flex items-center justify-end gap-1 text-[9.5px] text-white/90 font-bold">
              <span>رصيد أرباحك</span>
              <span>💰</span>
            </div>
            <div className="flex items-baseline justify-end gap-1">
              <span className="text-sm sm:text-base font-black font-mono text-white leading-none">
                {profitBalance.toLocaleString()}
              </span>
              <span className="text-[8.5px] font-bold text-white/80 font-sans">د.ع</span>
            </div>
            <span className="text-[8.5px] sm:text-[9.5px] text-white font-bold block leading-tight truncate">
              ✨ اربح على كل قطعة تطلبها
            </span>
          </div>

          {/* Pillar 2: المبلغ المتبقي (المطلوب) */}
          <Link
            href={statementUrl}
            className="bg-white/10 hover:bg-white/15 rounded-lg p-1.5 sm:p-2 border border-white/15 backdrop-blur-md transition space-y-0.5 text-right block active:scale-98 group/item"
          >
            <div className="flex items-center justify-between">
              <ChevronLeft className="w-2.5 h-2.5 text-white/80 group-hover/item:-translate-x-0.5 transition-transform" />
              <div className="flex items-center gap-1 text-[9.5px] text-white/90 font-bold">
                <span>المبلغ المتبقي</span>
                <span>📊</span>
              </div>
            </div>
            <div className="flex items-baseline justify-end gap-1">
              <span className="text-sm sm:text-base font-black font-mono text-white leading-none">
                {statementBalance.toLocaleString()}
              </span>
              <span className="text-[8.5px] font-bold text-white/80 font-sans">د.ع</span>
            </div>
            <span className="text-[8.5px] sm:text-[9.5px] text-white font-bold block leading-tight truncate">
              {statementBalance > 0 ? '⚠️ مطلوب سداده' : '✅ مسدد بالكامل'}
            </span>
          </Link>

        </div>

      </div>
    </div>
  );
}
