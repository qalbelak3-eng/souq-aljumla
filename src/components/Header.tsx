'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  User as UserIcon,
  Headphones,
  Mic,
  Package,
  Gift,
  AlertCircle,
  MapPin,
  LogOut,
  ChevronDown,
  FileText,
  Store,
  Crown,
  Bell
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import EtihadLogo from '@/components/EtihadLogo';
import MerchantTierBadge from '@/components/MerchantTierBadge';
import { sendSystemNotification, playNotificationSound } from '@/lib/notifications';

export default function Header() {
  const { totalItemsCount, setIsCartDrawerOpen } = useCart();
  const { user, logout, isApprovedMerchant } = useAuth();
  const { openDrawer: openNotificationsDrawer, unreadCount: unreadNotificationsCount } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [unreadRepliesCount, setUnreadRepliesCount] = useState<number>(0);
  const [liveReplyToast, setLiveReplyToast] = useState<{ id: string; text: string } | null>(null);
  const knownRepliedIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Poll for user's complaints updates in realtime
  useEffect(() => {
    if (!user?.phone) return;

    const checkComplaintsReplies = async () => {
      try {
        const res = await fetch(`/api/complaints?phone=${encodeURIComponent(user.phone)}`);
        const data = await res.json();
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
    const interval = setInterval(checkComplaintsReplies, 7000);
    return () => clearInterval(interval);
  }, [user?.phone]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#f3f8fc]/85 backdrop-blur-md border-b border-blue-100/40 transition-all duration-300 w-full print:hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 space-y-2.5">
        
        {/* ROW 1: Logo on Right, Support & User on Left */}
        <div className="flex items-center justify-between">
          
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 hover:opacity-95 transition">
            <EtihadLogo size="md" showTagline={false} />
          </Link>

          {/* Left Actions (Support & User Profile Dropdown) */}
          <div className="flex items-center gap-2">
            
            {/* User Classification Badge */}
            {user && (
              <Link href="/profile" className="flex items-center gap-1.5 hover:opacity-95 transition">
                <span className="hidden sm:inline-block text-xs font-bold text-slate-800 line-clamp-1 max-w-[120px]">
                  {user.businessName || user.name}
                </span>
                {user.accountType === 'market' ? (
                  <span className="inline-flex items-center gap-1 bg-[#1b4332] text-emerald-100 text-[10px] font-black px-2.5 py-1 rounded-full border border-emerald-500/40 shadow-xs">
                    <Store className="w-3 h-3 text-emerald-300" />
                    <span>ماركت ومحل 🏪</span>
                  </span>
                ) : (user.accountType === 'wholesale' || user.accountType === 'merchant') ? (
                  <MerchantTierBadge tier={user.merchantTier || 'bronze'} size="sm" />
                ) : null}
              </Link>
            )}

            {/* Customer Notification Bell Button in Header */}
            <button
              type="button"
              onClick={openNotificationsDrawer}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center transition shadow-xs cursor-pointer relative shrink-0"
              title="مركز الإشعارات والتنبيهات 🔔"
            >
              <Bell className="w-4 h-4 text-amber-500" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4.5 bg-red-600 text-white text-[9px] font-black rounded-full px-1 flex items-center justify-center border-2 border-white animate-pulse">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* Customer Support Button */}
            <a
              href="https://api.whatsapp.com/send?phone=9647700000000&text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D9%8B%20%D8%AE%D8%AF%D9%85%D8%A9%20%D8%A7%D9%84%D8%B9%D9%85%D9%84%D8%A7%D8%A1%20%D8%AC%D9%85%D9%8A%D9%84%D8%A9%20%D9%83%D8%B1%D8%A8%D9%84%D8%A7%D8%A1"
              target="_blank"
              rel="noopener noreferrer"
              style={{ backgroundColor: '#c0d732' }}
              className="h-9 px-3 rounded-full text-slate-900 hover:brightness-105 flex items-center gap-1.5 transition shadow-xs group shrink-0 text-xs font-black"
              title="خدمة العملاء واتساب"
            >
              <Headphones className="w-4 h-4 text-slate-900 animate-headphone-shake shrink-0" />
              <span className="hidden xs:inline">خدمة العملاء</span>
            </a>

            {/* Profile User Avatar Trigger */}
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden p-0.5 bg-gradient-to-tr from-brand-blue to-emerald-500 hover:scale-105 shadow-xs transition cursor-pointer select-none border-2 relative ${
                    isProfileMenuOpen ? 'border-brand-blue ring-2 ring-blue-300' : 'border-white'
                  }`}
                  title={user.businessName || user.name}
                >
                  <div className="w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-brand-blue text-white flex items-center justify-center font-black text-sm">
                        {user.name.slice(0, 1)}
                      </div>
                    )}
                  </div>

                  {/* Pulsing red alert dot if there is an unread admin reply */}
                  {unreadRepliesCount > 0 && (
                    <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-600 border-2 border-white rounded-full animate-bounce shadow-md" />
                  )}
                </button>

                {/* Floating Dropdown Menu (matching "جملتي" exactly) */}
                {isProfileMenuOpen && (
                  <div
                    className="absolute left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in-95 origin-top-left divide-y divide-slate-100"
                    dir="rtl"
                  >
                    {/* Header info: Store Name bold + Owner Name smaller below, no phone */}
                    <div className="px-3.5 py-2.5 bg-slate-50/70 border-b border-slate-100">
                      <p className="font-black text-xs text-slate-900 truncate flex items-center gap-1.5">
                        <span>🏪</span>
                        <span>{user.businessName || user.name}</span>
                      </p>
                      <p className="text-[11px] text-slate-500 font-bold truncate mt-0.5 flex items-center gap-1">
                        <span>👤</span>
                        <span>{user.name}</span>
                      </p>
                    </div>

                    {/* Menu items */}
                    <div className="py-1">
                      <Link
                        href="/profile?tab=orders"
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-brand-blue transition"
                      >
                        <Package className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>طلباتي</span>
                      </Link>

                      <Link
                        href="/profile?tab=rewards"
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-amber-600 transition"
                      >
                        <Gift className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>أرباحي</span>
                      </Link>

                      <Link
                        href="/profile?tab=complaints"
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center justify-between px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-rose-600 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>الشكاوى والملاحظات</span>
                        </div>
                        {unreadRepliesCount > 0 && (
                          <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                            رد جديد 🔔
                          </span>
                        )}
                      </Link>

                      <Link
                        href="/profile?tab=locations"
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-sky-600 transition"
                      >
                        <MapPin className="w-4 h-4 text-sky-500 shrink-0" />
                        <span>مواقعي</span>
                      </Link>

                      <Link
                        href="/profile?tab=account"
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition"
                      >
                        <UserIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span>إدارة حسابي</span>
                      </Link>

                      <Link
                        href={`/statement?phone=${encodeURIComponent(user.phone)}`}
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-brand-blue transition"
                      >
                        <FileText className="w-4 h-4 text-brand-blue shrink-0" />
                        <span>كشف حسابي والديون</span>
                      </Link>
                    </div>

                    {/* Logout */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          logout();
                          router.push('/');
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition text-right cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-red-500 shrink-0" />
                        <span>خروج</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/90 border border-slate-200/80 text-slate-600 hover:text-brand-blue flex items-center justify-center shadow-xs transition shrink-0"
                title="تسجيل الدخول"
              >
                <UserIcon className="w-4.5 h-4.5" />
              </Link>
            )}

          </div>
        </div>

        {/* ROW 2: Wide Search Bar Below Logo */}
        <form onSubmit={handleSearch} className="relative w-full">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن المنتج الذي ترغب به"
            className="w-full bg-white/95 text-slate-800 text-xs sm:text-sm rounded-full py-2.5 pr-10 pl-11 border border-slate-200/80 focus:border-brand-blue focus:bg-white focus:outline-none transition shadow-[0_2px_10px_rgba(0,0,0,0.03)] placeholder:text-slate-600"
          />
          {/* Search Icon on Right */}
          <button
            type="submit"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-brand-blue transition"
            title="بحث"
          >
            <Search className="w-4 h-4" />
          </button>
          {/* Blue Circle Voice / Mic Icon on Left */}
          <button
            type="button"
            onClick={() => {}}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#0284c7] hover:bg-sky-600 text-white flex items-center justify-center shadow-xs transition"
            title="بحث صوتي"
          >
            <Mic className="w-3.5 h-3.5" />
          </button>
        </form>

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
