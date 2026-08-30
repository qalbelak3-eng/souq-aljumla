'use client';

import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Crown,
  Store,
  Clock,
  Sparkles,
  Award,
  ChevronLeft,
  X,
  Gift,
  User as UserIcon,
} from 'lucide-react';
import { CompetitionsSettings, CompetitionTrack } from '@/types';
import { useAuth } from '@/context/AuthContext';

interface Props {
  competitions?: CompetitionsSettings;
}

export default function CompetitionLeaderboard({ competitions }: Props) {
  const { user } = useAuth();

  const isAdminUser = Boolean(user && (user.role === 'admin' || (user.accountType as string) === 'admin'));

  // Comprehensive check for wholesale merchant classification
  const isWholesaleUser = Boolean(
    !isAdminUser &&
    user &&
    (
      user.accountType === 'wholesale' ||
      user.accountType === 'merchant' ||
      user.role === 'merchant' ||
      (user.merchantTier as string) === 'gold' ||
      (user.merchantTier as string) === 'silver' ||
      (user.merchantTier as string) === 'bronze' ||
      user.businessType === 'wholesale' ||
      (user.businessName && user.businessName.includes('جملة'))
    )
  );

  const isMarketUser = Boolean(
    !isAdminUser &&
    user &&
    !isWholesaleUser &&
    (
      user.accountType === 'market' ||
      user.businessType === 'market' ||
      user.businessType === 'supermarket'
    )
  );

  const isIndividualUser = Boolean(
    !isAdminUser && !isWholesaleUser && !isMarketUser
  );

  const targetTrack: 'customer' | 'retail' | 'wholesale' = isWholesaleUser
    ? 'wholesale'
    : isMarketUser
    ? 'retail'
    : 'customer';

  const [activeTab, setActiveTab] = useState<'customer' | 'retail' | 'wholesale'>(targetTrack);
  const [showFullModal, setShowFullModal] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [merchantsMap, setMerchantsMap] = useState<Record<string, any>>({});

  // Time remaining state
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  // Track resolution
  const config = competitions;
  const isEnabled = Boolean(config && config.isEnabled);

  const defaultCustomerTrack: CompetitionTrack = {
    id: 'customer',
    title: 'سباق الزبائن والعملاء الأكثر طلباً 🎁',
    subtitle: 'اطلب واجمع مشترياتك المنزلية لتفوز بقسائم تسوق شهرية مجانية وهدايا قيمة!',
    prizeSummary: '🥇 المركز الأول: قسيمة تسوق مجانية بقيمة 150,000 د.ع + شحن مجاني لمدة شهر',
    endDate: '2026-09-20T23:59:59',
    isActive: true,
    leaders: [],
  };

  const defaultTrack: CompetitionTrack = {
    id: activeTab,
    title:
      activeTab === 'customer'
        ? 'سباق الزبائن والعملاء الأكثر طلباً 🎁'
        : activeTab === 'retail'
        ? 'سباق ماركتات ومحلات المفرد الشهري 🏪'
        : 'سباق كبار التجار والموزعين (الجملة) 👑',
    subtitle:
      activeTab === 'customer'
        ? 'اطلب واجمع مشترياتك لتفوز بقسائم تسوق وهدايا مميزة!'
        : activeTab === 'retail'
        ? 'الأكثر طلباً لمشتريات المفرد والكراتين الخفيفة يفوز برصيد وتخفيضات شهرية كبرى'
        : 'لأصحاب الطلبيات الكبرى وتجار الجملة - جوائز نقدية وبضاعة مجانية!',
    prizeSummary:
      activeTab === 'customer'
        ? 'المركز الأول: قسيمة شراء 150,000 د.ع + توصيل مجاني 🚀'
        : activeTab === 'retail'
        ? 'المركز الأول: رصيد مشتريات 500,000 د.ع + شحن مجاني لشهر كامل'
        : 'المركز الأول: بضاعة مجانية بقيمة 1,500,000 د.ع + درع التميز',
    endDate: '2026-09-25T23:59:59',
    isActive: true,
    leaders: [],
  };

  const currentTrack: CompetitionTrack =
    (config
      ? activeTab === 'customer'
        ? config.customerTrack || defaultCustomerTrack
        : activeTab === 'retail'
        ? config.retailTrack
        : config.wholesaleTrack
      : null) || defaultTrack;

  // Hook 1: Component mount flag & strictly synchronize tab with user classification
  useEffect(() => {
    setIsMounted(true);
    if (isWholesaleUser) {
      setActiveTab('wholesale');
    } else if (isMarketUser) {
      setActiveTab('retail');
    } else {
      setActiveTab('customer');
    }
  }, [user, isWholesaleUser, isMarketUser]);

  // Hook 2: Fetch merchants map for profile pictures
  useEffect(() => {
    fetch('/api/admin/merchants')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.merchants)) {
          const map: Record<string, any> = {};
          data.merchants.forEach((m: any) => {
            if (m.name) map[m.name.trim().toLowerCase()] = m;
            if (m.businessName) map[m.businessName.trim().toLowerCase()] = m;
          });
          setMerchantsMap(map);
        }
      })
      .catch(() => {});
  }, []);

  // Hook 3: Real-time ticking countdown (unconditional top-level hook)
  useEffect(() => {
    if (!isEnabled || !currentTrack?.endDate) return;

    const updateCountdown = () => {
      try {
        const now = Date.now();
        const end = new Date(currentTrack.endDate).getTime();
        const diff = end - now;

        if (isNaN(diff) || diff <= 0) {
          setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
          return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setTimeLeft({
          days: Math.max(0, days),
          hours: Math.max(0, hours),
          minutes: Math.max(0, minutes),
          seconds: Math.max(0, seconds),
          isExpired: false,
        });
      } catch {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [isEnabled, currentTrack?.endDate, activeTab]);

  // Safe early return after all hooks are mounted:
  if (!config || !config.isEnabled) return null;

  const rawLeaders = Array.isArray(currentTrack?.leaders) ? currentTrack.leaders : [];
  const leaders = rawLeaders.filter((l) => l && typeof l === 'object');
  const topLeaders = leaders.slice(0, 4);

  // Determine section display title
  const sectionTitle = isWholesaleUser
    ? '👑 مسابقة كبار التجار والموزعين (الجملة)'
    : isMarketUser
    ? '🏪 مسابقة ماركتات ومحلات المفرد'
    : isIndividualUser
    ? '🎁 مسابقة الزبائن والعملاء الأكثر طلباً'
    : (config.sectionTitle || '🏆 مسابقات المتصدرين والجوائز الكبرى');

  return (
    <div className="space-y-3 select-none">
      
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${
            isWholesaleUser ? 'bg-amber-400/20 text-amber-600' : isMarketUser ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {isWholesaleUser ? '👑' : isMarketUser ? '🏪' : '🎁'}
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-1.5">
              <span>{sectionTitle}</span>
            </h2>
            <p className="text-[11px] text-slate-500 font-bold">
              {isWholesaleUser
                ? 'لوحة شرف كبار التجار والموزعين الأكثر سحباً وطلباً لبضاعة الجملة'
                : isMarketUser
                ? 'لوحة شرف الماركتات والمحلات الأكثر طلباً'
                : 'لوحة شرف وجوائز الزبائن والعملاء الأكثر طلباً وتسوقاً'}
            </p>
          </div>
        </div>

        {/* Track Switcher Tabs (Only for Admin to inspect all tracks) */}
        {isAdminUser && (
          <div className="bg-slate-100/90 p-1 rounded-2xl flex items-center gap-1 self-start sm:self-auto border border-slate-200/80 shadow-2xs overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('customer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-xs transition transform active:scale-95 cursor-pointer whitespace-nowrap ${
                activeTab === 'customer'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              <span>🎁 مسابقة الزبائن</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('retail')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-xs transition transform active:scale-95 cursor-pointer whitespace-nowrap ${
                activeTab === 'retail'
                  ? 'bg-gradient-to-r from-purple-700 to-indigo-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>🏪 مسابقة الماركتات</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wholesale')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-xs transition transform active:scale-95 cursor-pointer whitespace-nowrap ${
                activeTab === 'wholesale'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-amber-300" />
              <span>👑 مسابقة التجار</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Interactive Competition Box */}
      <div
        className={`rounded-3xl p-4 sm:p-6 text-white shadow-xl transition-all relative overflow-hidden border ${
          activeTab === 'customer'
            ? 'bg-gradient-to-br from-teal-950 via-emerald-900 to-slate-950 border-emerald-800/40'
            : activeTab === 'wholesale'
            ? 'bg-gradient-to-br from-slate-950 via-amber-950 to-stone-900 border-amber-800/40'
            : 'bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-950 border-purple-800/40'
        }`}
      >
        {/* Decorative Top Accent */}
        <div className="absolute -top-12 -left-12 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          
          {/* Header Info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                    activeTab === 'customer'
                      ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/30'
                      : activeTab === 'wholesale'
                      ? 'bg-amber-500/30 text-amber-200 border-amber-400/30'
                      : 'bg-purple-500/30 text-purple-200 border-purple-400/30'
                  }`}
                >
                  {activeTab === 'customer'
                    ? '🎁 سباق الزبائن والعملاء الأكثر طلباً'
                    : activeTab === 'wholesale'
                    ? '👑 مسابقة كبار التجار والموزعين'
                    : '🏪 مسابقة محلات المفرد والأسواق'}
                </span>
                <span className="text-[10px] text-amber-300 font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>تحديث دوري حي</span>
                </span>
              </div>
              <h3 className="font-black text-sm sm:text-base text-white flex items-center gap-2">
                <span>
                  {currentTrack?.title ||
                    (activeTab === 'customer'
                      ? 'سباق الزبائن والعملاء الأكثر طلباً 🎁'
                      : activeTab === 'wholesale'
                      ? 'دوري كبار التجار والموزعين (الجملة) 👑'
                      : 'سباق ماركتات ومحلات المفرد الشهري 🏪')}
                </span>
              </h3>
              {currentTrack?.subtitle && (
                <p className="text-[11px] text-slate-200/90 font-medium">
                  {currentTrack.subtitle}
                </p>
              )}
            </div>

            {/* Prize Announcement - ONLY DISPLAYED AFTER COMPETITION ENDS */}
            {timeLeft.isExpired && currentTrack?.prizeSummary && (
              <div className="bg-amber-400/20 border border-amber-400/40 rounded-2xl p-2.5 px-3 flex items-center gap-2.5 self-start sm:self-auto animate-pulse">
                <Gift className="w-5 h-5 text-amber-300 shrink-0" />
                <div>
                  <span className="text-[9px] text-amber-200 font-bold block">الجوائز المستحقة:</span>
                  <span className="text-xs font-black text-amber-300 block">{currentTrack.prizeSummary}</span>
                </div>
              </div>
            )}
          </div>

          {/* Live Countdown Timer Grid */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>الوقت المتبقي حتى إعلان وتكريم الفائزين:</span>
              </span>
              {timeLeft.isExpired && (
                <span className="text-red-400 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-500/30">
                  انتهت فترة المسابقة الحالية ⌛
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2 text-center" dir="ltr" suppressHydrationWarning>
              <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-2.5 border border-white/10">
                <span className="text-base sm:text-xl font-black block font-mono text-white" suppressHydrationWarning>
                  {isMounted ? String(timeLeft.seconds).padStart(2, '0') : '00'}
                </span>
                <span className="text-[10px] text-slate-300 font-bold">ثانية</span>
              </div>
              <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-2.5 border border-white/10">
                <span className="text-base sm:text-xl font-black block font-mono text-white" suppressHydrationWarning>
                  {isMounted ? String(timeLeft.minutes).padStart(2, '0') : '00'}
                </span>
                <span className="text-[10px] text-slate-300 font-bold">دقيقة</span>
              </div>
              <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-2.5 border border-white/10">
                <span className="text-base sm:text-xl font-black block font-mono text-white" suppressHydrationWarning>
                  {isMounted ? String(timeLeft.hours).padStart(2, '0') : '00'}
                </span>
                <span className="text-[10px] text-slate-300 font-bold">ساعة</span>
              </div>
              <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-2.5 border border-white/10">
                <span className="text-base sm:text-xl font-black block font-mono text-amber-300" suppressHydrationWarning>
                  {isMounted ? String(timeLeft.days).padStart(2, '0') : '00'}
                </span>
                <span className="text-[10px] text-amber-300 font-bold">يوم</span>
              </div>
            </div>
          </div>

          {/* Top Leaders Roster */}
          <div className="border-t border-white/10 pt-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-black text-amber-300 flex items-center gap-1">
                <Award className="w-3.5 h-3.5" />
                <span>المتصدرون الحاليون في السباق:</span>
              </span>

              {leaders.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowFullModal(true)}
                  className="text-[11px] font-bold text-amber-300 hover:text-amber-200 underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>عرض الكل ({leaders.length})</span>
                  <ChevronLeft className="w-3 h-3" />
                </button>
              )}
            </div>

            {leaders.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-300/80 bg-white/5 rounded-2xl border border-white/10">
                لا يوجد متصدرين مسجلين في هذا المسار حالياً.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topLeaders.map((ldr, idx) => {
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '⭐';
                  const isFirst = idx === 0;

                  // Find profile picture if available
                  const qName = (ldr.name || '').trim().toLowerCase();
                  const matchedMerchant = merchantsMap[qName];
                  const avatarUrl = ldr.avatar || matchedMerchant?.avatar || matchedMerchant?.storefrontImage;

                  return (
                    <div
                      key={ldr.id || idx}
                      className={`p-2.5 rounded-2xl border transition flex items-center justify-between gap-2.5 ${
                        isFirst
                          ? 'bg-amber-400/20 border-amber-400/50 text-white shadow-xs'
                          : 'bg-white/5 border-white/10 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Medal */}
                        <span className="text-lg shrink-0">{ldr.badge || medal}</span>

                        {/* Profile Picture */}
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden bg-white/15 border border-white/30 flex items-center justify-center shrink-0">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={ldr.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-tr from-amber-500 to-indigo-600 text-white font-black text-xs flex items-center justify-center">
                              {ldr.name ? ldr.name.charAt(0) : <UserIcon className="w-4 h-4" />}
                            </div>
                          )}
                        </div>

                        {/* Name Only */}
                        <div className="min-w-0 truncate">
                          <strong className="text-xs sm:text-sm font-black text-white block truncate">
                            {ldr.name || 'متصدر'}
                          </strong>
                        </div>
                      </div>

                      {/* Score / Cartons only */}
                      <div className="text-left shrink-0">
                        <span
                          className={`text-xs font-black font-mono block ${
                            isFirst ? 'text-amber-300' : 'text-slate-100'
                          }`}
                        >
                          {ldr.score || ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* FULL LEADERBOARD MODAL */}
      {showFullModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-4 text-xs my-auto text-slate-900">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-base">
                  🏆
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">{currentTrack?.title || 'لوحة المتصدرين'}</h3>
                  <p className="text-[10px] text-slate-500 font-bold">قائمة المتصدرين في السباق</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowFullModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Prize Announcement ONLY IF EXPIRED */}
            {timeLeft.isExpired && currentTrack?.prizeSummary && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center gap-2.5">
                <Gift className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="text-[11px]">
                  <span className="font-black text-amber-900 block">جوائز هذا السباق:</span>
                  <span className="text-amber-800 font-bold block">{currentTrack.prizeSummary}</span>
                </div>
              </div>
            )}

            {/* Leaders List Table */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {leaders.map((ldr, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                const qName = (ldr.name || '').trim().toLowerCase();
                const matchedMerchant = merchantsMap[qName];
                const avatarUrl = ldr.avatar || matchedMerchant?.avatar || matchedMerchant?.storefrontImage;

                return (
                  <div
                    key={ldr.id || idx}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                      idx === 0
                        ? 'bg-amber-50/80 border-amber-300'
                        : idx === 1
                        ? 'bg-slate-50 border-slate-300'
                        : idx === 2
                        ? 'bg-orange-50/60 border-orange-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base font-black w-6 text-center">{ldr.badge || medal}</span>
                      
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt={ldr.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-slate-200 text-slate-700 font-black text-xs flex items-center justify-center">
                            {ldr.name ? ldr.name.charAt(0) : <UserIcon className="w-4 h-4" />}
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="font-black text-xs text-slate-900 block">{ldr.name || 'متصدر'}</span>
                      </div>
                    </div>

                    <div className="text-left font-mono font-black text-xs text-slate-800">
                      {ldr.score || ''}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowFullModal(false)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 rounded-xl transition cursor-pointer"
            >
              إغلاق
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
