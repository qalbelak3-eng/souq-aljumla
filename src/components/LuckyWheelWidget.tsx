'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, Gift } from 'lucide-react';
import LuckyWheelModal from '@/components/LuckyWheelModal';
import { useAuth } from '@/context/AuthContext';

export default function LuckyWheelWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasFreeSpin, setHasFreeSpin] = useState(true);
  const [isEnabled, setIsEnabled] = useState(true);
  const [cooldownHours, setCooldownHours] = useState(24);
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    fetch('/api/lucky-wheel')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) {
          setIsEnabled(data.settings.isEnabled ?? true);
          if (data.settings.cooldownHours) {
            setCooldownHours(data.settings.cooldownHours);
          }
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const storageKey = user?.id ? `lucky_spin_${user.id}` : 'lucky_spin_guest';
    const lastSpinTime = localStorage.getItem(storageKey);
    if (!lastSpinTime) {
      setHasFreeSpin(true);
    } else {
      const diff = Date.now() - parseInt(lastSpinTime, 10);
      const cooldown = (cooldownHours || 24) * 60 * 60 * 1000;
      setHasFreeSpin(diff >= cooldown);
    }
  }, [isOpen, user, cooldownHours]);

  // Only display on Home Page ('/')
  if (pathname !== '/' || !isEnabled) return null;

  return (
    <>
      {/* Floating Circular Widget Button */}
      <div className="fixed bottom-20 right-5 sm:bottom-22 sm:right-7 z-50 flex items-center gap-2 print:hidden select-none">
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-500 to-amber-400 text-slate-950 shadow-[0_8px_25px_rgba(245,158,11,0.45)] hover:shadow-[0_12px_30px_rgba(245,158,11,0.6)] transform hover:scale-105 active:scale-95 transition-all duration-300 border-2 border-white/60 cursor-pointer animate-pulse"
          aria-label="چرخ الحظ والمكافآت"
          title="چرخ الحظ والمكافآت اليومية 🎡"
        >
          {/* Glowing Ring Animation */}
          <span className="absolute inset-0 rounded-full border-2 border-amber-300 animate-ping opacity-30"></span>

          {/* Icon */}
          <div className="flex flex-col items-center justify-center">
            <span className="text-2xl sm:text-3xl filter drop-shadow">🎡</span>
          </div>

          {/* Badge: Free spin available (1) or Gift Icon */}
          {hasFreeSpin && (
            <span className="absolute -top-1.5 -left-1.5 bg-rose-600 text-white w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-md animate-bounce">
              <Gift className="w-3.5 h-3.5 text-white" />
            </span>
          )}

          {/* Floating Tag tooltip on Hover */}
          <span className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 bg-slate-900/90 backdrop-blur-xs text-amber-300 text-[11px] font-black px-2.5 py-1 rounded-xl shadow-lg border border-amber-400/30 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none hidden sm:block">
            چرخ الحظ 🎁
          </span>
        </button>
      </div>

      {/* Interactive Modal */}
      <LuckyWheelModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
