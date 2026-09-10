'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Coins,
  FileText,
  ChevronLeft,
  ArrowUpRight
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
      {/* ═══ الشريط البنفسجي الأنيق (Sleek Modern Monochrome Edition) ═══ */}
      <div className="relative overflow-hidden bg-gradient-to-l from-[#322372] via-[#46359c] to-[#39297e] text-white rounded-2xl p-2 sm:p-2.5 border border-white/20 shadow-md shadow-purple-950/20">
        
        {/* Subtle Ambient Light Reflections */}
        <div className="absolute -left-10 -top-10 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-purple-400/10 rounded-full blur-lg pointer-events-none" />

        {/* 2 Balanced Sleek Columns */}
        <div className="relative z-10 grid grid-cols-2 gap-2 sm:gap-3">
          
          {/* العمود الأول: رصيد أرباحك */}
          <div className="bg-white/10 hover:bg-white/15 rounded-xl p-2 sm:p-2.5 border border-white/15 backdrop-blur-md transition-all flex flex-col justify-between text-right space-y-1">
            <div className="flex items-center justify-end gap-1.5 text-[11px] sm:text-xs text-white/90 font-bold">
              <span>رصيد أرباحك</span>
              <Coins className="w-3.5 h-3.5 text-white/90" />
            </div>
            
            <div className="flex items-baseline justify-end gap-1">
              <span className="text-base sm:text-lg font-black font-mono text-white leading-none tracking-tight">
                {isLoading ? '...' : profitBalance.toLocaleString()}
              </span>
              <span className="text-[9px] sm:text-[10px] font-bold text-white/80 font-sans">د.ع</span>
            </div>

            <div className="text-[9.5px] sm:text-[10.5px] text-white/85 font-medium leading-tight truncate">
              اربح على كل قطعة تطلبها
            </div>
          </div>

          {/* العمود الثاني: المبلغ المتبقي */}
          <Link
            href={statementUrl}
            className="bg-white/10 hover:bg-white/15 rounded-xl p-2 sm:p-2.5 border border-white/15 backdrop-blur-md transition-all flex flex-col justify-between text-right space-y-1 active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between">
              <ChevronLeft className="w-3 h-3 text-white/70 group-hover:-translate-x-0.5 transition-transform" />
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-white/90 font-bold">
                <span>المبلغ المتبقي</span>
                <FileText className="w-3.5 h-3.5 text-white/90" />
              </div>
            </div>

            <div className="flex items-baseline justify-end gap-1">
              <span className="text-base sm:text-lg font-black font-mono text-white leading-none tracking-tight">
                {isLoading ? '...' : statementBalance.toLocaleString()}
              </span>
              <span className="text-[9px] sm:text-[10px] font-bold text-white/80 font-sans">د.ع</span>
            </div>

            <div className="text-[9.5px] sm:text-[10.5px] text-white/85 font-medium leading-tight truncate flex items-center justify-end gap-1">
              <span>{statementBalance > 0 ? 'مطلوب سداده' : 'مسدد بالكامل'}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
            </div>
          </Link>

        </div>

      </div>
    </div>
  );
}
