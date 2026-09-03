'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bell,
  BellRing,
  X,
  Check,
  ShieldCheck,
  Sparkles,
  Clock,
  ChevronLeft,
  Trash2
} from 'lucide-react';
import { useNotifications } from '@/context/NotificationsContext';

export default function PushNotificationManager() {
  const {
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    unreadCount,
    notifications,
    permission,
    isSubscribing,
    requestPermission,
    clearAllClientNotifications,
  } = useNotifications();

  const [showWelcomePrompt, setShowWelcomePrompt] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && permission === 'default') {
      const dismissed = localStorage.getItem('etihad_push_prompt_dismissed');
      if (!dismissed) {
        const timer = setTimeout(() => {
          setShowWelcomePrompt(true);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [permission]);

  return (
    <>
      {/* 1. FLOATING NOTIFICATION BELL BUTTON */}
      <button
        type="button"
        onClick={openDrawer}
        className="fixed bottom-24 left-4 z-40 w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-950 text-white flex items-center justify-center shadow-2xl border-2 border-white/80 backdrop-blur-md transition-transform hover:scale-105 active:scale-95 cursor-pointer group"
        aria-label="مركز التنبيهات والإشعارات"
        title="مركز الإشعارات والتنبيهات 🔔"
      >
        <Bell className="w-5 h-5 text-amber-400 group-hover:animate-bounce" />
        
        {/* Unread Counter Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-600 text-white text-[10px] font-black rounded-full px-1.5 flex items-center justify-center border-2 border-white animate-pulse shadow-md">
            {unreadCount}
          </span>
        )}
      </button>

      {/* 2. PROMPT BANNER FOR NEW VISITORS */}
      {showWelcomePrompt && permission === 'default' && (
        <aside
          aria-label="تنبيهات المتجر"
          className="fixed bottom-36 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-slate-900/95 text-white p-4 rounded-3xl shadow-2xl border border-slate-700/80 backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300 select-none print:hidden"
          dir="rtl"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 animate-bounce">
              <BellRing className="w-5 h-5" />
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                  <span>تفعيل تنبيهات المتجر والعروض</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setShowWelcomePrompt(false);
                    localStorage.setItem('etihad_push_prompt_dismissed', 'true');
                  }}
                  className="text-slate-400 hover:text-white p-0.5 rounded-full transition cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                فعّل التنبيهات لتصلك أحدث عروض التوفير والخصومات وتحديثات طلبياتك على هاتفك فوراً 📱
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubscribing}
                  onClick={async () => {
                    await requestPermission();
                    setShowWelcomePrompt(false);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs py-2 px-4 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubscribing ? 'جاري التفعيل...' : 'تفعيل الإشعارات الآن 🔔'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowWelcomePrompt(false);
                    localStorage.setItem('etihad_push_prompt_dismissed', 'true');
                  }}
                  className="text-slate-400 hover:text-slate-200 font-bold text-xs py-2 px-3 transition cursor-pointer"
                >
                  لاحقاً
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* 3. CUSTOMER NOTIFICATIONS DRAWER (مركز الإشعارات والتنبيهات للزبون) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-200" dir="rtl">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={closeDrawer}
          />

          {/* Drawer Container */}
          <div className="fixed inset-y-0 left-0 max-w-md w-full bg-white shadow-2xl flex flex-col justify-between z-50 animate-in slide-in-from-left duration-300">
            
            {/* Top Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">مركز التنبيهات والإشعارات</h3>
                  <p className="text-[11px] text-slate-300">أحدث العروض والرسائل وتحديثات الحساب</p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDrawer}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Permission Status & Toggle Card */}
            <div className="p-4 bg-slate-50 border-b border-slate-100">
              {permission === 'granted' ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-xs text-emerald-900">
                  <div className="flex items-center gap-2 font-bold">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span>الإشعارات المباشرة مفعلة على جهازك 📱</span>
                  </div>
                  <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-black">نشط ✅</span>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-950">
                  <div>
                    <span className="font-black block text-xs">تفعيل إشعارات الهاتف المباشرة</span>
                    <span className="text-[10px] text-amber-800">لتصلك العروض حتى عند غلق الشاشة</span>
                  </div>
                  <button
                    type="button"
                    disabled={isSubscribing}
                    onClick={requestPermission}
                    className="bg-brand-blue hover:bg-brand-blueDark active:scale-95 text-white font-black text-xs py-2 px-3.5 rounded-xl transition cursor-pointer shrink-0 shadow-xs"
                  >
                    {isSubscribing ? 'جاري التفعيل...' : 'تفعيل الآن 🔔'}
                  </button>
                </div>
              )}
            </div>

            {/* Notifications List Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {notifications.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-3xl bg-slate-100 text-slate-400 flex items-center justify-center text-2xl font-black">
                    🔔
                  </div>
                  <h4 className="font-black text-slate-700 text-xs">لا توجد إشعارات جديدة حالياً</h4>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    سيتم حفظ جميع رسائل وتنبيهات العروض والتخفيضات التي ترسلها الإدارة هنا للرجوع إليها في أي وقت.
                  </p>
                </div>
              ) : (
                notifications.map((item) => {
                  let safeUrl = item.url || '/products?filter=offers';
                  if (safeUrl.startsWith('/admin') || safeUrl.includes('/admin/')) {
                    if (safeUrl.includes('offer')) safeUrl = '/products?filter=offers';
                    else if (safeUrl.includes('product')) safeUrl = '/products';
                    else safeUrl = '/products?filter=offers';
                  }

                  return (
                    <Link
                      key={item.id}
                      href={safeUrl}
                      onClick={closeDrawer}
                      className="block bg-white hover:bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition space-y-2 group cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-brand-coral shrink-0" />
                          <h4 className="font-black text-xs text-slate-900 group-hover:text-brand-blue transition leading-tight">
                            {item.title}
                          </h4>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5 shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(item.createdAt).toLocaleDateString('ar-IQ')}</span>
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-3">
                        {item.body}
                      </p>

                      {item.image && (
                        <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-slate-100 border border-slate-200 mt-1">
                          <img src={item.image} alt="صورة الإشعار" className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="pt-1.5 flex items-center justify-between text-[10px] text-brand-blue font-bold border-t border-slate-100">
                        <span>عرض تفاصيل العرض في المتجر 🛍️</span>
                        <ChevronLeft className="w-3.5 h-3.5 transition group-hover:-translate-x-1" />
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-bold">
                  التنبيهات: {notifications.length}
                </span>

                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllClientNotifications}
                    className="text-rose-600 hover:text-rose-800 text-[11px] font-black px-2 py-1 rounded-lg hover:bg-rose-50 transition flex items-center gap-1 cursor-pointer"
                    title="مسح كافة الإشعارات والتنبيهات من هذا الجهاز"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>مسح التنبيهات</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={closeDrawer}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-1.5 px-4 rounded-xl transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
