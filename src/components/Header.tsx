'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search,
  MapPin,
  Bell
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import { sendSystemNotification, playNotificationSound } from '@/lib/notifications';

export default function Header() {
  const { user, isLoading: authLoading } = useAuth();
  const { openDrawer: openNotificationsDrawer, unreadCount: unreadNotificationsCount } = useNotifications();
  const [cachedName, setCachedName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('etihad_user_iq');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.businessName || parsed?.name) {
          setCachedName(parsed.businessName || parsed.name);
        }
      }
    } catch {}
  }, []);

  const activeCustomerName = user?.businessName || user?.name || cachedName;
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadRepliesCount, setUnreadRepliesCount] = useState<number>(0);
  const [liveReplyToast, setLiveReplyToast] = useState<{ id: string; text: string } | null>(null);
  const knownRepliedIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const router = useRouter();
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (!isHomePage) {
      setIsScrolled(true);
      return;
    }

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHomePage]);

  // Poll for user's complaints updates in realtime (every 25s)
  const userPhone = user?.phone;
  useEffect(() => {
    if (!userPhone) return;

    let isSubscribed = true;
    const checkComplaintsReplies = async () => {
      try {
        const res = await fetch(`/api/complaints?phone=${encodeURIComponent(userPhone)}`);
        const data = await res.json();
        if (!isSubscribed) return;

        if (data.success && Array.isArray(data.complaints)) {
          let unread = 0;
          let newReplyFound: { id: string; text: string } | null = null;

          for (const c of data.complaints) {
            if (c.adminReply) {
              const seenKey = 'seen_reply_' + c.id;
              const seenVal = typeof window !== 'undefined' ? localStorage.getItem(seenKey) : null;
              
              if (seenVal !== (c.repliedAt || 'replied')) {
                unread++;
                
                // If it was just replied while user is browsing
                if (!isFirstLoadRef.current && !knownRepliedIdsRef.current.has(c.id)) {
                  newReplyFound = { id: c.id, text: String(c.adminReply) };
                }
              }

              knownRepliedIdsRef.current.add(c.id);
            }
          }

          setUnreadRepliesCount(unread);

          if (newReplyFound) {
            const replyObj: { id: string; text: string } = newReplyFound;
            setLiveReplyToast(replyObj);
            playNotificationSound('merchant');
            sendSystemNotification({
              title: '💬 وصلك رد جديد من إدارة سوق الجملة!',
              body: `ردت الإدارة على شكواك: ${replyObj.text.slice(0, 75)}... اضغط لعرض الرد`,
              url: '/profile?tab=complaints',
              soundType: 'merchant',
            });
          }

          if (isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
          }
        }
      } catch (err) {
        // quiet catch
      }
    };

    checkComplaintsReplies();
    const interval = setInterval(checkComplaintsReplies, 25000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [userPhone]);



  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header
      className={`z-40 transition-all duration-300 w-full print:hidden pt-[env(safe-area-inset-top,0px)] ${
        isHomePage
          ? isScrolled
            ? 'fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs'
            : 'fixed top-0 left-0 right-0 bg-transparent border-b border-transparent shadow-none'
          : 'sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs'
      }`}
    >
      <div className={`max-w-5xl mx-auto px-4 sm:px-6 ${isHomePage ? 'py-2' : 'py-2.5 space-y-2.5'}`}>
        
        {/* ROW 1: Customer Name on Right, Notification Bell on Left (Hungerstation Style) */}
        <div className="flex items-center justify-between gap-3">
          
          {/* Right: Customer Name / Location */}
          <Link
            href={user ? "/profile" : "/login"}
            className="flex flex-col text-right min-w-0 hover:opacity-90 transition group"
            title={user ? "إدارة الحساب والعناوين" : "تسجيل الدخول"}
          >
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="text-[10px] text-slate-600 font-bold leading-none">التوصيل إلى</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <span 
                suppressHydrationWarning
                className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-brand-blue transition truncate max-w-[200px] sm:max-w-[320px]"
              >
                {activeCustomerName || (authLoading ? '...' : 'سوق الجملة (تسجيل الدخول)')}
              </span>
              {user?.accountType === 'market' && (
                <span className="hidden sm:inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                  ماركت
                </span>
              )}
              {(user?.accountType === 'wholesale' || user?.accountType === 'merchant') && (
                <span className="hidden sm:inline-flex items-center gap-0.5 bg-amber-50 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded-full border border-amber-200 shrink-0">
                  VIP
                </span>
              )}
            </div>
          </Link>

          {/* Left: Notification Bell Only (Standalone Hungerstation Style) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openNotificationsDrawer}
              className="p-1.5 text-slate-800 hover:text-slate-950 transition cursor-pointer relative shrink-0 active:scale-90"
              title="مركز الإشعارات والتنبيهات 🔔"
            >
              <Bell className="w-5 h-5 text-slate-800" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute 0 top-0.5 right-0.5 min-w-[16px] h-4 bg-red-600 text-white text-[8px] font-black rounded-full px-1 flex items-center justify-center border border-white animate-pulse">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ROW 2: Wide Search Bar Below Logo (Hidden on Home, as home has it in the scrolling hero background) */}
        {!isHomePage && (
          <form onSubmit={handleSearch} className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن المنتج الذي ترغب به"
              className="w-full bg-white text-slate-800 text-xs sm:text-sm rounded-xl py-2.5 pr-10 pl-4 border border-slate-200/80 focus:border-brand-blue focus:outline-none transition shadow-[0_2px_10px_rgba(0,0,0,0.05)] placeholder:text-slate-500"
            />
            {/* Search Icon on Right */}
            <button
              type="submit"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-brand-blue transition"
              title="بحث"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Live Admin Reply Alert Floating Banner */}
        {liveReplyToast && (
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300 border border-emerald-400/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-base animate-bounce">💬</span>
              <div className="min-w-0">
                <span className="text-xs font-black block">وصلك رد جديد من إدارة سوق الجملة! 💌</span>
                <p className="text-[11px] text-emerald-100 font-medium truncate max-w-xs sm:max-w-md">
                  {liveReplyToast.text}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/profile?tab=complaints"
                onClick={() => {
                  setLiveReplyToast(null);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('seen_reply_' + liveReplyToast.id, 'seen');
                  }
                }}
                className="bg-white text-emerald-900 font-black text-xs px-3 py-1.5 rounded-xl shadow-xs hover:bg-emerald-50 transition"
              >
                مشاهدة الرد ↗
              </Link>
              <button
                type="button"
                onClick={() => setLiveReplyToast(null)}
                className="text-white/80 hover:text-white p-1 text-xs"
                title="إغلاق"
              >
                ✕
              </button>
            </div>
          </div>
        )}

      </div>
    </header>
  );
}
