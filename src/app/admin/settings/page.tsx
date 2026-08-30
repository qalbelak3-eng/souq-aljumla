'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  Check,
  MessageCircle,
  Truck,
  Sparkles,
  Building,
  AlertCircle,
  Gift,
  Trophy,
  Crown,
  Store,
  Plus,
  Trash2,
  Clock,
  Award,
  Flame,
  Edit2,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  Layers,
  Package,
  Users,
  Receipt,
  Car,
  FileText,
  ShieldAlert,
  Database
} from 'lucide-react';
import { StoreSettings, CompetitionLeader, CompetitionTrack } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';

export default function AdminSettingsPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [compTab, setCompTab] = useState<'customer' | 'retail' | 'wholesale'>('customer');
  const [registeredMerchants, setRegisteredMerchants] = useState<any[]>([]);
  const [activeLeaderSearchId, setActiveLeaderSearchId] = useState<string | null>(null);

  // Database Reset Stats State
  const [dbStats, setDbStats] = useState<any>(null);
  const [isResetting, setIsResetting] = useState<string | null>(null);

  const fetchDbStats = async () => {
    try {
      const res = await fetch('/api/admin/reset');
      const data = await res.json();
      if (data.success) {
        setDbStats(data.stats);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDbStats();
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((res) => res.json()),
      fetch('/api/admin/merchants').then((res) => res.json()).catch(() => ({ success: false })),
    ])
      .then(([settingsData, merchantsData]) => {
        if (settingsData.success && settingsData.settings) {
          setSettings(settingsData.settings);
        }
        if (merchantsData.success && merchantsData.merchants) {
          setRegisteredMerchants(merchantsData.merchants);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setIsSaving(true);
    setSavedSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setSavedSuccess(true);
        toast.success('تم حفظ كافة إعدادات المتجر بنجاح! ✅');
        setTimeout(() => setSavedSuccess(false), 3500);
      } else {
        toast.error('حدث خطأ أثناء حفظ الإعدادات');
      }
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ في الاتصال أثناء الحفظ');
    }
    setIsSaving(false);
  };

  const handleReset = async (target: string, label: string, countText?: string) => {
    const isFullReset = target === 'all';
    const isConfirmed = await confirm({
      title: isFullReset ? '🚨 تصفير وإعادة ضبط النظام بالكامل' : `تصفير جدول: ${label}`,
      message: isFullReset
        ? 'تحذير هام جداً:\nسيتم تصفير ومسح كافة بيانات النظام (الأصناف، الأقسام، الشركات، الطلبيات، الفواتير، الحسابات، التجار والسائقين).\n\n🔒 سيتم حفظ نسخة احتياطية فورية تلقائياً قبل التصفير، مع الإبقاء على حساب دخول المدير.\n\nهل تريد المتابعة وتصفير النظام بالكامل؟'
        : `هل أنت متأكد من تصفير ومسح كافة بيانات ${label} ${countText ? `(${countText})` : ''} نهائياً؟\n🔒 سيتم توثيق نسخة احتياطية فورية تلقائياً قبل الحذف.`,
      confirmText: isFullReset ? 'نعم، صَفّر النظام بالكامل 💥' : `نعم، تصفير ${label}`,
      cancelText: 'تراجع وإلغاء',
      type: 'danger',
    });

    if (!isConfirmed) return;

    setIsResetting(target);
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (data.success) {
        setDbStats(data.stats);
        toast.success(data.message || `تم تصفير ${label} بنجاح ✓`);
        if (isFullReset) {
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        }
      } else {
        toast.error(data.error || 'فشلت عملية التصفير');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setIsResetting(null);
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-500 font-bold">جاري تحميل إعدادات المتجر...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-xs max-w-4xl mx-auto">
      
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-brand-blue" />
            <span>إعدادات متجر سوق الجملة والواتساب ⚙️</span>
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-0.5">
            تخصيص رقم الواتساب المستلم للطلبات، معلومات المتجر، ورسوم التوصيل بالدينار العراقي (د.ع)
          </p>
        </div>

        {savedSuccess && (
          <span className="bg-emerald-50 text-emerald-800 text-xs font-bold px-4 py-2 rounded-2xl border border-emerald-200 flex items-center gap-1.5 shadow-xs animate-fadeIn">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>تم حفظ كافة التعديلات بنجاح! ✅</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* 1. Orders WhatsApp Configuration Card */}
        <div className="bg-emerald-50/80 border-2 border-emerald-300 p-6 sm:p-7 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-block bg-emerald-200 text-emerald-950 text-[10px] font-black px-2 py-0.5 rounded-md mb-1">
                خاص بقسم المبيعات والفواتير 📦
              </div>
              <h2 className="text-sm sm:text-base font-black text-emerald-950">
                رقم الواتساب المخصص لاستقبال وإرسال الفواتير والطلبيات
              </h2>
              <p className="text-xs text-emerald-800 font-bold mt-0.5">
                هذا هو الرقم الذي تُرسل إليه رسائل تفاصيل الطلبيات والفواتير تلقائياً فور تأكيد الزبون أو التاجر للطلب
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-xs font-black text-emerald-950 block">
              رقم واتساب استلام الفواتير والطلبيات (مثال: 07708020686 أو 9647708020686):
            </label>
            <input
              type="text"
              required
              value={settings.whatsappNumber || ''}
              onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
              placeholder="07708020686"
              dir="ltr"
              className="w-full bg-white border-2 border-emerald-400 rounded-2xl py-3 px-4 text-sm sm:text-base font-mono font-black text-slate-900 shadow-inner focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 transition"
            />
            <p className="text-[11px] text-emerald-800 font-bold flex items-center gap-1.5">
              <span>⚡ مخصص للطلبيات: عند ضغط الزبون على تأكيد الطلب، سيتم إرسال الفاتورة وتفاصيل الأسعار والأصناف لهذا الرقم.</span>
            </p>
          </div>
        </div>

        {/* 2. Customer Support & Assistance Configuration Card */}
        <div className="bg-sky-50/80 border-2 border-sky-300 p-6 sm:p-7 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-block bg-sky-200 text-sky-950 text-[10px] font-black px-2 py-0.5 rounded-md mb-1">
                خاص بقسم خدمة العملاء والدعم الفني 🎧
              </div>
              <h2 className="text-sm sm:text-base font-black text-sky-950">
                رقم واتساب وهاتف الدعم الفني والمساعدة (منفصل عن الفواتير)
              </h2>
              <p className="text-xs text-sky-800 font-bold mt-0.5">
                هذا الرقم مخصص للتواصل مع الزبائن، الإجابة عن الاستفسارات، الشكاوى، والمساعدة المباشرة
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-sky-950 block">
                رقم واتساب الدعم الفني وخدمة العملاء:
              </label>
              <input
                type="text"
                value={settings.supportWhatsappNumber || ''}
                onChange={(e) => setSettings({ ...settings, supportWhatsappNumber: e.target.value })}
                placeholder="07700000000"
                dir="ltr"
                className="w-full bg-white border-2 border-sky-400 rounded-2xl py-3 px-4 text-sm sm:text-base font-mono font-black text-slate-900 shadow-inner focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200 transition"
              />
              <p className="text-[10px] text-sky-800 font-bold">
                يُفتح عندما يضغط الزبون على أزرار الدعم والاستفسارات بالمتجر.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-sky-950 block">
                هاتف الاتصال المباشر للدعم الفني (اختياري):
              </label>
              <input
                type="text"
                value={settings.supportPhone || ''}
                onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                placeholder="+964 770 000 0000"
                dir="ltr"
                className="w-full bg-white border-2 border-sky-300 rounded-2xl py-3 px-4 text-sm sm:text-base font-mono font-black text-slate-900 shadow-inner focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200 transition"
              />
              <p className="text-[10px] text-sky-800 font-bold">
                للاتصال الهاتفي المباشر لخدمة الزبائن.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Financial Accounting WhatsApp Configuration Card */}
        <div className="bg-amber-50/80 border-2 border-amber-300 p-6 sm:p-7 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-block bg-amber-200 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-md mb-1">
                خاص بقسم الحسابات والمحاسب 💼
              </div>
              <h2 className="text-sm sm:text-base font-black text-amber-950">
                رقم واتساب المحاسب المعتمد (استقبال إشعارات التحصيل وتصفية العهد المالية)
              </h2>
              <p className="text-xs text-amber-900 font-bold mt-0.5">
                تُرسل إلى هذا الرقم إشعارات التحصيل المالي وإثباتات تسليم السائق للطلبيات والمبالغ النقدية والديون
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="text-xs font-black text-amber-950 block">
              رقم واتساب المحاسب / قسم الحسابات (مثال: 07708020686):
            </label>
            <input
              type="text"
              value={settings.accountingWhatsappNumber || ''}
              onChange={(e) => setSettings({ ...settings, accountingWhatsappNumber: e.target.value })}
              placeholder="07708020686"
              dir="ltr"
              className="w-full bg-white border-2 border-amber-400 rounded-2xl py-3 px-4 text-sm sm:text-base font-mono font-black text-slate-900 shadow-inner focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200 transition"
            />
            <p className="text-[11px] text-amber-900 font-bold flex items-center gap-1.5">
              <span>💼 يقوم السائق بإرسال إشعار فوري لهذا الرقم عند تسليم الطلبية وتحصيل المبلغ كاش أو تسجيله كدين آجل.</span>
            </p>
          </div>
        </div>

        {/* 2. General Store Information Card */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <h2 className="font-black text-sm text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Building className="w-4 h-4 text-brand-blue" />
            <span>المعلومات العامة للمتجر</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="space-y-1.5">
              <label className="font-black text-slate-800 block">اسم المتجر / المنشأة *:</label>
              <input
                type="text"
                required
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-black text-slate-800 block">رمز العملة *:</label>
              <input
                type="text"
                required
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="font-black text-slate-800 block">وصف وشعار المتجر (Tagline):</label>
              <input
                type="text"
                value={settings.storeTagline}
                onChange={(e) => setSettings({ ...settings, storeTagline: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="font-black text-slate-800 block">نص شريط الإعلانات العلوي في الموقع:</label>
              <input
                type="text"
                value={settings.bannerText}
                onChange={(e) => setSettings({ ...settings, bannerText: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
              />
            </div>

          </div>
        </div>

        {/* 2.1 FOOTER & KARBALA CONTACT INFO CONTROL CARD */}
        <div className="bg-gradient-to-br from-emerald-50/80 via-teal-50/70 to-sky-50/70 border-2 border-emerald-300 p-6 sm:p-7 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-3.5 border-b border-emerald-200/80 pb-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-block bg-emerald-200 text-emerald-950 text-[10px] font-black px-2 py-0.5 rounded-md mb-1">
                تذييل الصفحة ومعلومات التواصل (كربلاء المقدسة 🇮🇶)
              </div>
              <h2 className="text-sm sm:text-base font-black text-emerald-950">
                التحكم بنصوص وبيانات الجزء السفلي من المتجر (Footer)
              </h2>
              <p className="text-xs text-emerald-800 font-bold mt-0.5">
                تعديل الكلام التعريفي أسفل شعار سوق الجملة، عنوان المقر في كربلاء، وأرقام الاتصال والواتساب الرسمية
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            
            {/* Footer Description Below Logo */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="font-black text-emerald-950 text-xs block">
                نص الوصف التعريفي أسفل شعار سوق الجملة في التذييل:
              </label>
              <textarea
                rows={2}
                value={settings.footerDescription || ''}
                onChange={(e) => setSettings({ ...settings, footerDescription: e.target.value })}
                placeholder="سوق الجملة - خيارك الأوفر والأشمل لتجارة وتوريد المواد الغذائية، السناكات، الشيبس، الكرواسون ومشروبات الطاقة بالجملة والمفرد في كربلاء المقدسة."
                className="w-full bg-white border-2 border-emerald-300 rounded-2xl p-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition leading-relaxed shadow-2xs"
              />
              <p className="text-[10px] text-emerald-800 font-bold">
                💡 هذا النص يظهر للزوار في أسفل جميع صفحات المتجر مباشرة تحت الشعار.
              </p>
            </div>

            {/* Address in Karbala */}
            <div className="space-y-1.5">
              <label className="font-black text-emerald-950 text-xs block">
                📍 عنوان ومقر المتجر (كربلاء المقدسة):
              </label>
              <input
                type="text"
                value={settings.address || ''}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                placeholder="كربلاء المقدسة - سوق الجملة المركزي"
                className="w-full bg-white border-2 border-emerald-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition shadow-2xs"
              />
            </div>

            {/* General Contact Phone */}
            <div className="space-y-1.5">
              <label className="font-black text-emerald-950 text-xs block">
                📞 هاتف التواصل والاستعلامات:
              </label>
              <input
                type="text"
                value={settings.phone || ''}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                placeholder="+964 770 000 0000"
                dir="ltr"
                className="w-full bg-white border-2 border-emerald-300 rounded-xl py-2.5 px-3 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition shadow-2xs"
              />
            </div>

            {/* Support WhatsApp Number */}
            <div className="space-y-1.5">
              <label className="font-black text-emerald-950 text-xs block">
                💬 رقم واتساب خدمة العملاء (يرتبط بزر المحادثة السفلي):
              </label>
              <input
                type="text"
                value={settings.supportWhatsappNumber || ''}
                onChange={(e) => setSettings({ ...settings, supportWhatsappNumber: e.target.value })}
                placeholder="07700000000"
                dir="ltr"
                className="w-full bg-white border-2 border-emerald-300 rounded-xl py-2.5 px-3 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition shadow-2xs"
              />
              <p className="text-[10px] text-emerald-800 font-bold">
                ⚡ عند ضغط الزبون على زر "محادثة خدمة العملاء واتساب" في التذييل يُفتح هذا الرقم مباشرة.
              </p>
            </div>

            {/* Official Email */}
            <div className="space-y-1.5">
              <label className="font-black text-emerald-950 text-xs block">
                ✉️ البريد الإلكتروني الرسمي:
              </label>
              <input
                type="email"
                value={settings.email || ''}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                placeholder="sales@souq-aljumla.iq"
                dir="ltr"
                className="w-full bg-white border-2 border-emerald-300 rounded-xl py-2.5 px-3 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition shadow-2xs"
              />
            </div>

            {/* Working Hours */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="font-black text-emerald-950 text-xs block">
                🕒 أوقات وساعات العمل (تظهر في التذييل ومعلومات التواصل):
              </label>
              <input
                type="text"
                value={settings.workingHours || ''}
                onChange={(e) => setSettings({ ...settings, workingHours: e.target.value })}
                placeholder="يومياً من 8:00 صباحاً حتى 11:00 مساءً"
                className="w-full bg-white border-2 border-emerald-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition shadow-2xs"
              />
              <p className="text-[10px] text-emerald-800 font-bold">
                💡 مثال: يومياً من 8:00 صباحاً حتى 11:00 مساءً (أو حدد الأيام والساعات المناسبة لمتجركم).
              </p>
            </div>

            {/* Copyright Text */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="font-black text-emerald-950 text-xs block">
                ©️ نص حقوق النشر في أسفل التذييل (Copyright Text):
              </label>
              <input
                type="text"
                value={settings.copyrightText || ''}
                onChange={(e) => setSettings({ ...settings, copyrightText: e.target.value })}
                placeholder="جميع الحقوق محفوظة © 2026 - سوق الجملة للتجارة الذكية في كربلاء المقدسة 🇮🇶"
                className="w-full bg-white border-2 border-emerald-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition shadow-2xs"
              />
              <p className="text-[10px] text-emerald-800 font-bold">
                💡 هذا النص يظهر في الشريط الرمادي في أسفل جميع صفحات المتجر ويمكنك تعديله وكتابة أي نص تريده.
              </p>
            </div>

          </div>
        </div>

        {/* 3. Shipping & Delivery Card with Distance & Area-based Pricing */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-black text-sm text-slate-900">
                  كروة التوصيل والشحن في كربلاء المقدسة 🇮🇶
                </h2>
                <p className="text-[11px] text-slate-500 font-bold">
                  تحديد كروة التوصيل الثابتة أو حساب الكروة حسب مسافة المنطقة (قريبة / متوسطة / بعيدة)
                </p>
              </div>
            </div>

            {/* Mode Toggle Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl shrink-0">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, deliveryPricingMode: 'fixed' })}
                className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer ${
                  (settings.deliveryPricingMode || 'distance_tiered') === 'fixed'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                كروة موحدة ثابتة
              </button>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, deliveryPricingMode: 'distance_tiered' })}
                className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1 ${
                  (settings.deliveryPricingMode || 'distance_tiered') === 'distance_tiered'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>حسب المنطقة والمسافة ⚡</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-black text-slate-800 text-xs block">
                كروة التوصيل الافتراضية (د.ع):
              </label>
              <input
                type="number"
                min="0"
                step="500"
                value={settings.deliveryFee ?? 3000}
                onChange={(e) => setSettings({ ...settings, deliveryFee: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-mono font-black text-slate-900 focus:bg-white focus:border-brand-blue"
              />
              <p className="text-[10px] text-slate-500 font-bold">
                تُطبق كقيمة أساسية عند عدم تحديد منطقة خاصة.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-black text-slate-800 text-xs block">
                الحد الأدنى للتوصيل المجاني لجميع مناطق كربلاء (د.ع):
              </label>
              <input
                type="number"
                min="0"
                step="5000"
                value={settings.freeDeliveryThreshold ?? 50000}
                onChange={(e) => setSettings({ ...settings, freeDeliveryThreshold: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-mono font-black text-slate-900 focus:bg-white focus:border-brand-blue"
              />
              <p className="text-[10px] text-emerald-700 font-bold">
                ⚡ عند وصول سلة العميل لهذا المبلغ يصبح التوصيل 0 د.ع مجاناً لكافة مناطق كربلاء.
              </p>
            </div>

            {/* Minimum Order Value Control (الحد الأدنى لقيمة الطلب) */}
            <div className="sm:col-span-2 space-y-1.5 bg-amber-50/80 border-2 border-amber-300 p-4 rounded-2xl">
              <label className="font-black text-amber-950 text-xs block flex items-center justify-between">
                <span>⛔ الحد الأدنى لقيمة الطلبية في المتجر (د.ع) *:</span>
                <span className="text-[10px] bg-amber-200 text-amber-950 px-2 py-0.5 rounded-md font-black">
                  حماية من الطلبيات الصغيرة جداً
                </span>
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                required
                value={settings.minOrderAmount ?? 10000}
                onChange={(e) => setSettings({ ...settings, minOrderAmount: Number(e.target.value) })}
                placeholder="10000"
                className="w-full bg-white border-2 border-amber-400 rounded-xl py-2.5 px-3 text-sm font-mono font-black text-slate-900 focus:border-amber-600 focus:outline-none transition shadow-inner"
              />
              <p className="text-[11px] text-amber-900 font-bold leading-relaxed">
                💡 <strong>فائدة هذا الخيار:</strong> يمنع الزبون من طلب فاتورة صغيرة جداً (مثلاً قطعة واحدة بـ 250 دينار). لن يتمكن الزبون من إتمام وتأكيد الطلب إلا إذا وصل مجموع مشترياته لهذا المبلغ كحد أدنى (مثلاً 10,000 د.ع).
              </p>
            </div>
          </div>

          {/* Area & Distance-based Zones Configuration */}
          {(settings.deliveryPricingMode || 'distance_tiered') === 'distance_tiered' && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                  <span>📍 تسعير كروة التوصيل حسب مسافة الأحياء والمناطق في كربلاء</span>
                </h3>
                <span className="text-[10px] bg-emerald-100 text-emerald-900 font-black px-2 py-0.5 rounded-lg">
                  مفعل في صفحة الدفع ✓
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                
                {/* Zone 1: Close / Central */}
                <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-emerald-950 text-xs flex items-center gap-1">
                      <span>🟢 المناطق القريبة والمركز</span>
                    </span>
                    <span className="text-[10px] bg-emerald-200 text-emerald-950 font-bold px-1.5 py-0.5 rounded">
                      أقل من 5 كم
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-700 block">الكروة (د.ع):</label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={
                        (settings.deliveryZones?.find((z) => z.id === 'close')?.fee) ?? 2000
                      }
                      onChange={(e) => {
                        const fee = Number(e.target.value);
                        const zones = settings.deliveryZones ? [...settings.deliveryZones] : [
                          { id: 'close', name: 'المناطق القريبة والمركز', distanceTier: 'close' as const, fee: 2000, areas: 'المركز، العباسية، حي الحسين، حي المعلمين، حي الإسكان، باب بغداد، باب الخان، البلدية، الجمعية، شارع السناتر، حي النقيب' },
                          { id: 'medium', name: 'المناطق المتوسطة', distanceTier: 'medium' as const, fee: 3000, areas: 'حي الحر، حي رمضان، التحدي، الموظفين، حي الغدير، حي الوفاء، حي الميلاد، حي الضباط، الإبراهيمية، التعليب، حي العسكري، حي النصر، حي السلام' },
                          { id: 'far', name: 'المناطق البعيدة والأطراف', distanceTier: 'far' as const, fee: 5000, areas: 'قضاء الهندية (طويريج)، ناحية الجدول الغربي، ناحية الخيرات، قضاء عين التمر، ناحية الحسينية، درة كربلاء، منطقة الرزازة، البستنة والأرياف' }
                        ];
                        const idx = zones.findIndex((z) => z.id === 'close');
                        if (idx > -1) zones[idx].fee = fee;
                        else zones.push({ id: 'close', name: 'المناطق القريبة والمركز', distanceTier: 'close' as const, fee, areas: 'المركز، العباسية، حي الحسين، حي المعلمين، حي الإسكان، باب بغداد، باب الخان، البلدية، الجمعية، شارع السناتر، حي النقيب' });
                        setSettings({ ...settings, deliveryZones: zones });
                      }}
                      className="w-full bg-white border border-emerald-300 rounded-xl py-1.5 px-2.5 text-xs font-mono font-black text-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">الأحياء المشمولة:</label>
                    <textarea
                      rows={2}
                      value={
                        (settings.deliveryZones?.find((z) => z.id === 'close')?.areas) ?? 'المركز، العباسية، حي الحسين، حي المعلمين، حي الإسكان، باب بغداد، باب الخان، البلدية، الجمعية، شارع السناتر، حي النقيب'
                      }
                      onChange={(e) => {
                        const areas = e.target.value;
                        const zones = settings.deliveryZones ? [...settings.deliveryZones] : [
                          { id: 'close', name: 'المناطق القريبة والمركز', distanceTier: 'close' as const, fee: 2000, areas: '' },
                          { id: 'medium', name: 'المناطق المتوسطة', distanceTier: 'medium' as const, fee: 3000, areas: 'حي الحر، حي رمضان، التحدي، الموظفين، حي الغدير، حي الوفاء، حي الميلاد، حي الضباط، الإبراهيمية، التعليب، حي العسكري، حي النصر، حي السلام' },
                          { id: 'far', name: 'المناطق البعيدة والأطراف', distanceTier: 'far' as const, fee: 5000, areas: 'قضاء الهندية (طويريج)، ناحية الجدول الغربي، ناحية الخيرات، قضاء عين التمر، ناحية الحسينية، درة كربلاء، منطقة الرزازة، البستنة والأرياف' }
                        ];
                        const idx = zones.findIndex((z) => z.id === 'close');
                        if (idx > -1) zones[idx].areas = areas;
                        setSettings({ ...settings, deliveryZones: zones });
                      }}
                      className="w-full bg-white border border-emerald-200 rounded-xl p-1.5 text-[11px] font-medium text-slate-700 leading-snug"
                    />
                  </div>
                </div>

                {/* Zone 2: Medium */}
                <div className="bg-amber-50/70 border-2 border-amber-300 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-950 text-xs flex items-center gap-1">
                      <span>🟡 المناطق المتوسطة</span>
                    </span>
                    <span className="text-[10px] bg-amber-200 text-amber-950 font-bold px-1.5 py-0.5 rounded">
                      5 كم - 12 كم
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-700 block">الكروة (د.ع):</label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={
                        (settings.deliveryZones?.find((z) => z.id === 'medium')?.fee) ?? 3000
                      }
                      onChange={(e) => {
                        const fee = Number(e.target.value);
                        const zones = settings.deliveryZones ? [...settings.deliveryZones] : [
                          { id: 'close', name: 'المناطق القريبة والمركز', distanceTier: 'close' as const, fee: 2000, areas: 'المركز، العباسية، حي الحسين، حي المعلمين، حي الإسكان، باب بغداد، باب الخان، البلدية، الجمعية، شارع السناتر، حي النقيب' },
                          { id: 'medium', name: 'المناطق المتوسطة', distanceTier: 'medium' as const, fee: 3000, areas: 'حي الحر، حي رمضان، التحدي، الموظفين، حي الغدير، حي الوفاء، حي الميلاد، حي الضباط، الإبراهيمية، التعليب، حي العسكري، حي النصر، حي السلام' },
                          { id: 'far', name: 'المناطق البعيدة والأطراف', distanceTier: 'far' as const, fee: 5000, areas: 'قضاء الهندية (طويريج)، ناحية الجدول الغربي، ناحية الخيرات، قضاء عين التمر، ناحية الحسينية، درة كربلاء، منطقة الرزازة، البستنة والأرياف' }
                        ];
                        const idx = zones.findIndex((z) => z.id === 'medium');
                        if (idx > -1) zones[idx].fee = fee;
                        else zones.push({ id: 'medium', name: 'المناطق المتوسطة', distanceTier: 'medium' as const, fee, areas: 'حي الحر، حي رمضان، التحدي، الموظفين، حي الغدير، حي الوفاء، حي الميلاد، حي الضباط، الإبراهيمية، التعليب، حي العسكري، حي النصر، حي السلام' });
                        setSettings({ ...settings, deliveryZones: zones });
                      }}
                      className="w-full bg-white border border-amber-300 rounded-xl py-1.5 px-2.5 text-xs font-mono font-black text-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">الأحياء المشمولة:</label>
                    <textarea
                      rows={2}
                      value={
                        (settings.deliveryZones?.find((z) => z.id === 'medium')?.areas) ?? 'حي الحر، حي رمضان، التحدي، الموظفين، حي الغدير، حي الوفاء، حي الميلاد، حي الضباط، الإبراهيمية، التعليب، حي العسكري، حي النصر، حي السلام'
                      }
                      onChange={(e) => {
                        const areas = e.target.value;
                        const zones = settings.deliveryZones ? [...settings.deliveryZones] : [
                          { id: 'close', name: 'المناطق القريبة والمركز', distanceTier: 'close' as const, fee: 2000, areas: 'المركز، العباسية، حي الحسين، حي المعلمين، حي الإسكان، باب بغداد، باب الخان، البلدية، الجمعية، شارع السناتر، حي النقيب' },
                          { id: 'medium', name: 'المناطق المتوسطة', distanceTier: 'medium' as const, fee: 3000, areas: '' },
                          { id: 'far', name: 'المناطق البعيدة والأطراف', distanceTier: 'far' as const, fee: 5000, areas: 'قضاء الهندية (طويريج)، ناحية الجدول الغربي، ناحية الخيرات، قضاء عين التمر، ناحية الحسينية، درة كربلاء، منطقة الرزازة، البستنة والأرياف' }
                        ];
                        const idx = zones.findIndex((z) => z.id === 'medium');
                        if (idx > -1) zones[idx].areas = areas;
                        setSettings({ ...settings, deliveryZones: zones });
                      }}
                      className="w-full bg-white border border-amber-200 rounded-xl p-1.5 text-[11px] font-medium text-slate-700 leading-snug"
                    />
                  </div>
                </div>

                {/* Zone 3: Far / Outskirts */}
                <div className="bg-rose-50/70 border-2 border-rose-300 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-rose-950 text-xs flex items-center gap-1">
                      <span>🔴 الأطراف والمناطق البعيدة</span>
                    </span>
                    <span className="text-[10px] bg-rose-200 text-rose-950 font-bold px-1.5 py-0.5 rounded">
                      أكثر من 12 كم
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-700 block">الكروة (د.ع):</label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={
                        (settings.deliveryZones?.find((z) => z.id === 'far')?.fee) ?? 5000
                      }
                      onChange={(e) => {
                        const fee = Number(e.target.value);
                        const zones = settings.deliveryZones ? [...settings.deliveryZones] : [
                          { id: 'close', name: 'المناطق القريبة والمركز', distanceTier: 'close' as const, fee: 2000, areas: 'المركز، العباسية، حي الحسين، حي المعلمين، حي الإسكان، باب بغداد، باب الخان، البلدية، الجمعية، شارع السناتر، حي النقيب' },
                          { id: 'medium', name: 'المناطق المتوسطة', distanceTier: 'medium' as const, fee: 3000, areas: 'حي الحر، حي رمضان، التحدي، الموظفين، حي الغدير، حي الوفاء، حي الميلاد، حي الضباط، الإبراهيمية، التعليب، حي العسكري، حي النصر، حي السلام' },
                          { id: 'far', name: 'المناطق البعيدة والأطراف', distanceTier: 'far' as const, fee: 5000, areas: 'قضاء الهندية (طويريج)، ناحية الجدول الغربي، ناحية الخيرات، قضاء عين التمر، ناحية الحسينية، درة كربلاء، منطقة الرزازة، البستنة والأرياف' }
                        ];
                        const idx = zones.findIndex((z) => z.id === 'far');
                        if (idx > -1) zones[idx].fee = fee;
                        else zones.push({ id: 'far', name: 'المناطق البعيدة والأطراف', distanceTier: 'far' as const, fee, areas: 'قضاء الهندية (طويريج)، ناحية الجدول الغربي، ناحية الخيرات، قضاء عين التمر، ناحية الحسينية، درة كربلاء، منطقة الرزازة، البستنة والأرياف' });
                        setSettings({ ...settings, deliveryZones: zones });
                      }}
                      className="w-full bg-white border border-rose-300 rounded-xl py-1.5 px-2.5 text-xs font-mono font-black text-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">الأحياء المشمولة:</label>
                    <textarea
                      rows={2}
                      value={
                        (settings.deliveryZones?.find((z) => z.id === 'far')?.areas) ?? 'قضاء الهندية (طويريج)، ناحية الجدول الغربي، ناحية الخيرات، قضاء عين التمر، ناحية الحسينية، درة كربلاء، منطقة الرزازة، البستنة والأرياف'
                      }
                      onChange={(e) => {
                        const areas = e.target.value;
                        const zones = settings.deliveryZones ? [...settings.deliveryZones] : [
                          { id: 'close', name: 'المناطق القريبة والمركز', distanceTier: 'close' as const, fee: 2000, areas: 'المركز، العباسية، حي الحسين، حي المعلمين، حي الإسكان، باب بغداد، باب الخان، البلدية، الجمعية، شارع السناتر، حي النقيب' },
                          { id: 'medium', name: 'المناطق المتوسطة', distanceTier: 'medium' as const, fee: 3000, areas: 'حي الحر، حي رمضان، التحدي، الموظفين، حي الغدير، حي الوفاء، حي الميلاد، حي الضباط، الإبراهيمية، التعليب، حي العسكري، حي النصر، حي السلام' },
                          { id: 'far', name: 'المناطق البعيدة والأطراف', distanceTier: 'far' as const, fee: 5000, areas: '' }
                        ];
                        const idx = zones.findIndex((z) => z.id === 'far');
                        if (idx > -1) zones[idx].areas = areas;
                        setSettings({ ...settings, deliveryZones: zones });
                      }}
                      className="w-full bg-white border border-rose-200 rounded-xl p-1.5 text-[11px] font-medium text-slate-700 leading-snug"
                    />
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* 4. Customer Cashback & Rewards Card (3 Tiers) */}
        <div className="bg-gradient-to-r from-orange-50/90 via-amber-50/80 to-yellow-50/80 border-2 border-orange-200 p-6 sm:p-7 rounded-3xl shadow-xs space-y-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-md shrink-0">
              <Gift className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-block bg-orange-200 text-orange-950 text-[10px] font-black px-2 py-0.5 rounded-md mb-1">
                نظام المكافآت والأرباح (كاش باك لكل صنف) 🎁
              </div>
              <h2 className="text-sm sm:text-base font-black text-orange-950">
                تحديد مبلغ الأرباح المكتسبة لكل فئة من الزبائن (3 مستويات)
              </h2>
              <p className="text-xs text-orange-800 font-bold mt-0.5">
                حدد المبلغ بالدينار العراقي الذي يربحه كل نوع زبون عن كل قطعة يطلبها، ليكون لكل فئة رصيد مكافآت خاص بها يظهر في واجهته ويُخصم من فواتيره.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            
            {/* 1. Individual Customer */}
            <div className="bg-white/90 p-4 rounded-2xl border-2 border-sky-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                  <span>👤 الزبون العادي (مفرد)</span>
                </span>
                <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded-md">
                  مشتريات عادية
                </span>
              </div>
              <label className="text-[11px] text-slate-600 font-bold block">
                مبلغ الكاش باك لكل قطعة:
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="25"
                  required
                  value={settings.cashbackCustomerPerItem ?? 100}
                  onChange={(e) => setSettings({ ...settings, cashbackCustomerPerItem: Number(e.target.value) })}
                  className="w-full bg-slate-50 border-2 border-sky-300 rounded-xl py-2.5 px-3 text-sm font-mono font-black text-slate-900 focus:bg-white focus:border-sky-500 focus:outline-none transition"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
                  د.ع / قطعة
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold">
                يكسب عند طلب أي مادة بالمفرد.
              </p>
            </div>

            {/* 2. Market Owner */}
            <div className="bg-white/90 p-4 rounded-2xl border-2 border-emerald-300 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                  <span>🏪 صاحب الماركت المعتمد</span>
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                  جملة الماركت
                </span>
              </div>
              <label className="text-[11px] text-slate-600 font-bold block">
                مبلغ الكاش باك لكل قطعة:
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="25"
                  required
                  value={settings.cashbackMarketPerItem ?? 150}
                  onChange={(e) => setSettings({ ...settings, cashbackMarketPerItem: Number(e.target.value) })}
                  className="w-full bg-slate-50 border-2 border-emerald-400 rounded-xl py-2.5 px-3 text-sm font-mono font-black text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
                  د.ع / قطعة
                </span>
              </div>
              <p className="text-[10px] text-emerald-700 font-bold">
                يكسب عن كل قطعة داخل كراتين الجملة.
              </p>
            </div>

            {/* 3. Wholesale Merchant */}
            <div className="bg-white/90 p-4 rounded-2xl border-2 border-amber-300 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                  <span>👑 تاجر الجملة المعتمد (VIP)</span>
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-md">
                  VIP جملة
                </span>
              </div>
              <label className="text-[11px] text-slate-600 font-bold block">
                مبلغ الكاش باك لكل قطعة:
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="25"
                  required
                  value={settings.cashbackMerchantPerItem ?? 250}
                  onChange={(e) => setSettings({ ...settings, cashbackMerchantPerItem: Number(e.target.value) })}
                  className="w-full bg-slate-50 border-2 border-amber-400 rounded-xl py-2.5 px-3 text-sm font-mono font-black text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none transition"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
                  د.ع / قطعة
                </span>
              </div>
              <p className="text-[10px] text-amber-800 font-bold">
                يكسب أعلى نسبة كاش باك لتحفيز كبار التجار.
              </p>
            </div>

          </div>

          <p className="text-[11px] text-orange-950 font-bold bg-white/70 p-2.5 rounded-xl border border-orange-200">
            💡 <strong>ملاحظة هامة:</strong> يتعرف النظام تلقائياً على نوع الحساب عند تسجيل دخوله (زبون عادي / ماركت / تاجر)، ويعرض له السعر المخصص والمكافأة الخاصة به في شريط الواجهة وصفحة الدفع.
          </p>
        </div>

        {/* 5. Homepage Sections Control Card (التحكم بأقسام الصفحة الرئيسية) */}
        <div className="bg-gradient-to-r from-purple-50/90 via-indigo-50/80 to-blue-50/80 border-2 border-purple-200 p-6 sm:p-7 rounded-3xl shadow-xs space-y-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-block bg-purple-200 text-purple-950 text-[10px] font-black px-2 py-0.5 rounded-md mb-1">
                تخصيص واجهة المتجر 🎛️
              </div>
              <h2 className="text-sm sm:text-base font-black text-purple-950">
                التحكم بأقسام الصفحة الرئيسية وترتيب عرض المنتجات
              </h2>
              <p className="text-xs text-purple-800 font-bold mt-0.5">
                تفعيل أو تعطيل أقسام الواجهة الرئيسية، وتحديد عناوينها وعدد الأصناف المعروضة في كل قسم
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            
            {/* 1. Offers Section */}
            <div className={`p-4 rounded-2xl border-2 transition-all space-y-3 ${
              settings.showOffersSection ?? true ? 'bg-white/95 border-rose-300 shadow-sm' : 'bg-slate-100/70 border-slate-200 opacity-60'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔥</span>
                  <span className="font-black text-slate-900 text-xs">قسم العروض</span>
                </div>

                {/* Toggle Button */}
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, showOffersSection: !(settings.showOffersSection ?? true) })}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 flex items-center ${
                    settings.showOffersSection ?? true ? 'bg-rose-500 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-transform" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">عنوان القسم في الواجهة:</label>
                  <input
                    type="text"
                    value={settings.offersSectionTitle ?? 'العروض والتخفيضات الخاصة 🔥'}
                    onChange={(e) => setSettings({ ...settings, offersSectionTitle: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-rose-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">عدد المنتجات المعروضة:</label>
                  <input
                    type="number"
                    min="2"
                    max="24"
                    value={settings.offersLimit ?? 8}
                    onChange={(e) => setSettings({ ...settings, offersLimit: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-black text-slate-900 focus:bg-white focus:border-rose-400"
                  />
                </div>
                <p className="text-[10px] text-rose-700 font-bold">
                  🏷️ يظهر فيه فقط المنتجات التي عليها خصم أو عروض خاصة.
                </p>
              </div>
            </div>

            {/* 2. Best Sellers Section */}
            <div className={`p-4 rounded-2xl border-2 transition-all space-y-3 ${
              settings.showBestSellersSection ?? true ? 'bg-white/95 border-amber-300 shadow-sm' : 'bg-slate-100/70 border-slate-200 opacity-60'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <span className="font-black text-slate-900 text-xs">الأكثر طلباً ومبيعاً</span>
                </div>

                {/* Toggle Button */}
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, showBestSellersSection: !(settings.showBestSellersSection ?? true) })}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 flex items-center ${
                    settings.showBestSellersSection ?? true ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-transform" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">عنوان القسم في الواجهة:</label>
                  <input
                    type="text"
                    value={settings.bestSellersSectionTitle ?? 'الأكثر طلباً ومبيعاً 🏆'}
                    onChange={(e) => setSettings({ ...settings, bestSellersSectionTitle: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">عدد المنتجات المعروضة:</label>
                  <input
                    type="number"
                    min="2"
                    max="24"
                    value={settings.bestSellersLimit ?? 8}
                    onChange={(e) => setSettings({ ...settings, bestSellersLimit: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-black text-slate-900 focus:bg-white focus:border-amber-400"
                  />
                </div>
                <p className="text-[10px] text-amber-800 font-bold">
                  ⭐ يظهر فيه الأصناف الأكثر طلباً ومبيعاً بالمستودع.
                </p>
              </div>
            </div>

            {/* 3. New Arrivals Section */}
            <div className={`p-4 rounded-2xl border-2 transition-all space-y-3 ${
              settings.showNewArrivalsSection ?? true ? 'bg-white/95 border-sky-300 shadow-sm' : 'bg-slate-100/70 border-slate-200 opacity-60'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <span className="font-black text-slate-900 text-xs">وصل حديثاً للمستودع</span>
                </div>

                {/* Toggle Button */}
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, showNewArrivalsSection: !(settings.showNewArrivalsSection ?? true) })}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 flex items-center ${
                    settings.showNewArrivalsSection ?? true ? 'bg-sky-500 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-transform" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">عنوان القسم في الواجهة:</label>
                  <input
                    type="text"
                    value={settings.newArrivalsSectionTitle ?? 'وصل حديثاً للمستودع ✨'}
                    onChange={(e) => setSettings({ ...settings, newArrivalsSectionTitle: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-sky-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">عدد المنتجات المعروضة:</label>
                  <input
                    type="number"
                    min="2"
                    max="24"
                    value={settings.newArrivalsLimit ?? 8}
                    onChange={(e) => setSettings({ ...settings, newArrivalsLimit: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-black text-slate-900 focus:bg-white focus:border-sky-400"
                  />
                </div>
                <p className="text-[10px] text-sky-800 font-bold">
                  🆕 يظهر فيه أحدث المنتجات المضافة بالترتيب الزمني.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* 6. COMPETITIONS & LEADERBOARDS MANAGEMENT (إدارة مسابقات الأكثر طلباً للمفرد والجملة) */}
        {(() => {
          const defaultCustomerTrack: CompetitionTrack = {
            id: 'customer',
            title: 'سباق الزبائن والعملاء الأكثر طلباً 🎁',
            subtitle: 'اطلب واجمع مشترياتك المنزلية لتفوز بقسائم تسوق شهرية مجانية وهدايا قيمة!',
            prizeSummary: '🥇 المركز الأول: قسيمة تسوق مجانية بقيمة 150,000 د.ع + شحن مجاني لمدة شهر',
            endDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
            isActive: true,
            leaders: [],
          };

          const comp = settings.competitions || {
            isEnabled: true,
            sectionTitle: '🏆 مسابقات المتصدرين وجوائز المتجر الكبرى',
            customerTrack: defaultCustomerTrack,
            retailTrack: {
              id: 'retail' as const,
              title: 'سباق ماركتات ومحلات المفرد الشهري 🏪',
              subtitle: 'الأكثر طلباً لمشتريات المفرد والكراتين الخفيفة يفوز برصيد وتخفيضات شهرية!',
              prizeSummary: '🥇 المركز الأول: رصيد مشتريات 500,000 د.ع + شحن مجاني لشهر كامل',
              endDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
              isActive: true,
              leaders: [
                { id: 'ldr-r1', rank: 1, name: 'أسواق الصافي المركزية', city: 'كربلاء المقدسة', score: '751 كرتون', prize: 'قسيمة 500,000 د.ع 🥇', badge: '🥇' },
              ]
            },
            wholesaleTrack: {
              id: 'wholesale' as const,
              title: 'دوري كبار التجار والموزعين (الجملة) 👑',
              subtitle: 'لأصحاب الطلبيات الكبرى وتجار الجملة - جوائز نقدية وبضاعة مجانية!',
              prizeSummary: '🥇 المركز الأول: بضاعة مجانية بقيمة 1,500,000 د.ع + درع التميز الذهبي',
              endDate: new Date(Date.now() + 25 * 24 * 3600 * 1000).toISOString(),
              isActive: true,
              leaders: [
                { id: 'ldr-w1', rank: 1, name: 'شركة الأمانة لتجارة المواد الغذائية', city: 'بغداد - جميلة', score: '3,850 كرتون', prize: 'بضاعة بقيمة 1,500,000 د.ع 🥇', badge: '🥇' },
              ]
            }
          };

          const updateComp = (newComp: any) => {
            setSettings({ ...settings, competitions: newComp });
          };

          const currentTrack = compTab === 'customer'
            ? (comp.customerTrack || defaultCustomerTrack)
            : compTab === 'retail'
            ? comp.retailTrack
            : comp.wholesaleTrack;

          const updateCurrentTrack = (trackUpdates: Partial<typeof currentTrack>) => {
            if (compTab === 'customer') {
              updateComp({ ...comp, customerTrack: { ...(comp.customerTrack || defaultCustomerTrack), ...trackUpdates } });
            } else if (compTab === 'retail') {
              updateComp({ ...comp, retailTrack: { ...comp.retailTrack, ...trackUpdates } });
            } else {
              updateComp({ ...comp, wholesaleTrack: { ...comp.wholesaleTrack, ...trackUpdates } });
            }
          };

          const addLeader = () => {
            const newLeader: CompetitionLeader = {
              id: `ldr-${Date.now()}`,
              rank: (currentTrack.leaders?.length || 0) + 1,
              name: '',
              city: 'كربلاء المقدسة',
              score: compTab === 'customer' ? '10 طلبيات' : '100 كرتون',
              prize: compTab === 'customer' ? 'قسيمة 50,000 د.ع 🎁' : 'هدية رمزية 🎁',
              badge: (currentTrack.leaders?.length || 0) === 0 ? '🥇' : (currentTrack.leaders?.length || 0) === 1 ? '🥈' : (currentTrack.leaders?.length || 0) === 2 ? '🥉' : '⭐',
            };
            updateCurrentTrack({ leaders: [...(currentTrack.leaders || []), newLeader] });
          };

          const updateLeader = (id: string, updates: Partial<CompetitionLeader>) => {
            const list = (currentTrack.leaders || []).map((l) => (l.id === id ? { ...l, ...updates } : l));
            updateCurrentTrack({ leaders: list });
          };

          const deleteLeader = (id: string) => {
            const list = (currentTrack.leaders || []).filter((l) => l.id !== id);
            updateCurrentTrack({ leaders: list });
          };

          const setDateDays = (days: number) => {
            const d = new Date();
            d.setDate(d.getDate() + days);
            updateCurrentTrack({ endDate: d.toISOString() });
          };

          const formatDtLocal = (iso: string) => {
            if (!iso) return '';
            try {
              const d = new Date(iso);
              d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
              return d.toISOString().slice(0, 16);
            } catch {
              return '';
            }
          };

          return (
            <div className="bg-gradient-to-br from-indigo-950/10 via-purple-900/5 to-slate-900/10 border-2 border-purple-300 p-6 sm:p-7 rounded-3xl shadow-sm space-y-5">
              
              {/* Card Header & Master Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-200/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shadow-md shrink-0 text-xl font-black">
                    🏆
                  </div>
                  <div>
                    <div className="inline-block bg-purple-200 text-purple-950 text-[10px] font-black px-2 py-0.5 rounded-md mb-1">
                      المسابقات ولوحة شرف الأكثر طلباً 👑
                    </div>
                    <h2 className="text-sm sm:text-base font-black text-slate-900">
                      إدارة مسابقات سباق الأكثر طلباً (الزبائن الأفراد & الماركتات & كبار التجار)
                    </h2>
                    <p className="text-xs text-slate-600 font-medium">
                      تحديد جوائز كل مسابقة، تاريخ ووقت انتهاء العداد التنازلي، وقائمة المتصدرين
                    </p>
                  </div>
                </div>

                {/* Master Switch */}
                <div className="flex items-center gap-2 self-start sm:self-auto bg-white p-2 rounded-2xl border border-purple-200">
                  <span className="text-xs font-bold text-slate-700">إظهار بالرئيسية:</span>
                  <button
                    type="button"
                    onClick={() => updateComp({ ...comp, isEnabled: !comp.isEnabled })}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 flex items-center ${
                      comp.isEnabled ? 'bg-purple-600 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-md block transition-transform" />
                  </button>
                </div>
              </div>

              {/* Main Title Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">عنوان القسم الرئيسي في الصفحة:</label>
                  <input
                    type="text"
                    value={comp.sectionTitle || '🏆 مسابقات المتصدرين وجوائز المتجر الكبرى'}
                    onChange={(e) => updateComp({ ...comp, sectionTitle: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:border-brand-blue"
                  />
                </div>
              </div>

              {/* Triple Track Tab Buttons */}
              <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-2 border border-slate-200 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setCompTab('customer')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    compTab === 'customer'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-white/80'
                  }`}
                >
                  <Gift className="w-4 h-4" />
                  <span>🎁 1. مسابقة الزبائن والأفراد</span>
                  {(comp.customerTrack?.isActive ?? true) && (
                    <span className="w-2 h-2 rounded-full bg-emerald-300 inline-block" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCompTab('retail')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    compTab === 'retail'
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-white/80'
                  }`}
                >
                  <Store className="w-4 h-4" />
                  <span>🏪 2. مسابقة الماركتات والمحلات</span>
                  {comp.retailTrack.isActive && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCompTab('wholesale')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    compTab === 'wholesale'
                      ? 'bg-amber-700 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-white/80'
                  }`}
                >
                  <Crown className="w-4 h-4 text-amber-300" />
                  <span>👑 3. مسابقة كبار التجار (الجملة)</span>
                  {comp.wholesaleTrack.isActive && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  )}
                </button>
              </div>

              {/* Active Track Form Details */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
                
                {/* Active Checkbox */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentTrack.isActive}
                      onChange={(e) => updateCurrentTrack({ isActive: e.target.checked })}
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <span className="font-black text-xs text-slate-900">
                      تفعيل وإطلاق هذه المسابقة ({compTab === 'customer' ? 'الزبائن الأفراد 🎁' : compTab === 'retail' ? 'الماركتات 🏪' : 'تجار الجملة 👑'})
                    </span>
                  </label>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    currentTrack.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {currentTrack.isActive ? 'مفعلة ونشطة ✓' : 'متوقفة'}
                  </span>
                </div>

                {/* Track Titles & Prizes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">عنوان المسابقة:</label>
                    <input
                      type="text"
                      value={currentTrack.title}
                      onChange={(e) => updateCurrentTrack({ title: e.target.value })}
                      placeholder="مثال: سباق الزبائن الأكثر طلباً"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">وصف الحماس والتشجيع:</label>
                    <input
                      type="text"
                      value={currentTrack.subtitle}
                      onChange={(e) => updateCurrentTrack({ subtitle: e.target.value })}
                      placeholder="مثال: الأكثر طلباً يفوز بجوائز وتخفيضات كبرى!"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-black text-amber-900 block mb-1 flex items-center gap-1">
                      <Gift className="w-3.5 h-3.5 text-amber-600" />
                      <span>ملخص الجوائز (يظهر للمتسابقين فور انتهاء العداد التنازلي 🎁):</span>
                    </label>
                    <input
                      type="text"
                      value={currentTrack.prizeSummary || ''}
                      onChange={(e) => updateCurrentTrack({ prizeSummary: e.target.value })}
                      placeholder="مثال: 🥇 المركز الأول: رصيد مشتريات 150,000 د.ع + شحن مجاني لشهر كامل"
                      className="w-full bg-amber-50/60 border-2 border-amber-300 rounded-xl py-2 px-3 text-xs font-bold text-amber-950 focus:bg-white focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Expiration Date & Presets */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-brand-blue" />
                      <span>تاريخ ووقت انتهاء المسابقة (العداد التنازلي الحي):</span>
                    </label>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-500 font-bold">تحديد سريع:</span>
                      <button
                        type="button"
                        onClick={() => setDateDays(7)}
                        className="bg-white text-slate-700 hover:bg-slate-200 px-2 py-0.5 rounded-md border border-slate-300 font-bold text-[10px]"
                      >
                        📅 أسبوع
                      </button>
                      <button
                        type="button"
                        onClick={() => setDateDays(14)}
                        className="bg-white text-slate-700 hover:bg-slate-200 px-2 py-0.5 rounded-md border border-slate-300 font-bold text-[10px]"
                      >
                        🗓️ 14 يوم
                      </button>
                      <button
                        type="button"
                        onClick={() => setDateDays(30)}
                        className="bg-white text-slate-700 hover:bg-slate-200 px-2 py-0.5 rounded-md border border-slate-300 font-bold text-[10px]"
                      >
                        📆 شهر
                      </button>
                    </div>
                  </div>

                  <input
                    type="datetime-local"
                    value={formatDtLocal(currentTrack.endDate)}
                    onChange={(e) => updateCurrentTrack({ endDate: new Date(e.target.value).toISOString() })}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-slate-900 focus:border-brand-blue"
                    dir="ltr"
                  />
                </div>

                {/* Leaders Leaderboard Management Table */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-500" />
                      <span>قائمة المتصدرين في السباق ({currentTrack.leaders?.length || 0} مشارك):</span>
                    </h4>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/competitions/sync');
                            const data = await res.json();
                            if (data.success) {
                              if (compTab === 'retail') {
                                if (data.retailLeaders && data.retailLeaders.length > 0) {
                                  updateCurrentTrack({ leaders: data.retailLeaders });
                                  toast.success(`تم سحب وترتيب ${data.retailLeaders.length} ماركت من واقع فواتير المتجر بنجاح! ⚡`);
                                } else {
                                  toast.info('لا توجد طلبيات مسجلة للمفرد بعد في فواتير النظام.');
                                }
                              } else {
                                if (data.wholesaleLeaders && data.wholesaleLeaders.length > 0) {
                                  updateCurrentTrack({ leaders: data.wholesaleLeaders });
                                  toast.success(`تم سحب وترتيب ${data.wholesaleLeaders.length} تاجر جملة من واقع فواتير المتجر بنجاح! ⚡`);
                                } else {
                                  toast.info('لا توجد طلبيات جملة مسجلة بعد في فواتير النظام.');
                                }
                              }
                            } else {
                              toast.error('تعذر سحب البيانات من الفواتير');
                            }
                          } catch (err) {
                            console.error(err);
                            toast.error('حدث خطأ أثناء الاتصال بالسيرفر');
                          }
                        }}
                        className="bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-black text-[10px] py-1.5 px-3 rounded-xl transition flex items-center gap-1 shadow-xs cursor-pointer"
                        title="يقوم بحساب مجموع كراتين كل تاجر أو ماركت من فواتير النظام وترتيبهم تنازلياً"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        <span>🔄 جلب وترتيب تلقائي من الفواتير الحقيقية</span>
                      </button>

                      <button
                        type="button"
                        onClick={addLeader}
                        className="bg-brand-blue hover:bg-brand-blueDark text-white font-bold text-[11px] py-1.5 px-3 rounded-xl transition flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة متصدر</span>
                      </button>
                    </div>
                  </div>

                  {(!currentTrack.leaders || currentTrack.leaders.length === 0) ? (
                    <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                      لا يوجد متصدرين مسجلين حالياً. اضغط على زر (إضافة متصدر جديد) للأعلى.
                    </div>
                  ) : (
                    <div className="space-y-2.5 overflow-visible">
                      {currentTrack.leaders.map((ldr, idx) => (
                        <div
                          key={ldr.id || idx}
                          className="bg-slate-50 p-3 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs relative overflow-visible focus-within:z-40"
                        >
                          {/* Medal / Rank */}
                          <div className="sm:col-span-2 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={ldr.badge || ''}
                              onChange={(e) => updateLeader(ldr.id, { badge: e.target.value })}
                              placeholder="🥇"
                              className="w-10 text-center bg-white border border-slate-300 rounded-lg py-1.5 font-black text-sm"
                            />
                            <span className="text-[10px] text-slate-500 font-bold">الترتيب #{idx + 1}</span>
                          </div>

                          {/* Name & Smart Merchant Search */}
                          <div className="sm:col-span-3 relative overflow-visible">
                            {(() => {
                              const q = (ldr.name || '').toLowerCase().trim();
                              const matches = registeredMerchants.filter((m: any) => {
                                if (!q) return false;
                                const n = (m.businessName || m.name || '').toLowerCase();
                                const c = (m.city || '').toLowerCase();
                                const p = (m.phone || '').toLowerCase();
                                return n.includes(q) || c.includes(q) || p.includes(q);
                              });

                              const isDropdownOpen = activeLeaderSearchId === ldr.id && q.length > 0 && matches.length > 0;
                              // If row is near bottom (idx >= 1), open upwards to avoid colliding with sticky bottom save bar
                              const openUpwards = idx >= 1;

                              return (
                                <div className="relative overflow-visible">
                                  <input
                                    type="text"
                                    value={ldr.name}
                                    onFocus={() => setActiveLeaderSearchId(ldr.id)}
                                    onBlur={() => setTimeout(() => setActiveLeaderSearchId(null), 250)}
                                    onChange={(e) => {
                                      updateLeader(ldr.id, { name: e.target.value });
                                      setActiveLeaderSearchId(ldr.id);
                                    }}
                                    placeholder="🔍 اكتب اسم الماركت / التاجر..."
                                    className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-xs font-bold text-slate-900 focus:border-brand-blue"
                                  />

                                  {/* Smart Autocomplete Dropdown */}
                                  {isDropdownOpen && (
                                    <div
                                      className={`absolute left-0 sm:min-w-[280px] w-full z-[100] bg-white rounded-2xl border-2 border-brand-blue shadow-2xl max-h-56 overflow-y-auto p-1.5 space-y-1 ${
                                        openUpwards ? 'bottom-full mb-2' : 'top-full mt-2'
                                      }`}
                                    >
                                      <div className="text-[10px] font-black text-slate-400 px-2 py-1 border-b border-slate-100 flex items-center justify-between">
                                        <span>التجار والماركتات المسجلين ({matches.length}):</span>
                                        <span className="text-brand-blue">اضغط للاختيار ⚡</span>
                                      </div>
                                      {matches.slice(0, 8).map((m: any, mIdx: number) => {
                                        const displayName = m.businessName || m.name || 'تاجر مسجل';
                                        const city = m.city || 'كربلاء المقدسة';
                                        const isMerchant = m.accountType === 'merchant' || m.tier === 'wholesale';

                                        return (
                                          <button
                                            type="button"
                                            key={m.id || mIdx}
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              updateLeader(ldr.id, {
                                                name: displayName,
                                                city: city,
                                              });
                                              setActiveLeaderSearchId(null);
                                            }}
                                            className="w-full text-right p-2 rounded-xl hover:bg-sky-50 transition flex items-center justify-between gap-2 border border-transparent hover:border-sky-200 cursor-pointer"
                                          >
                                            <span className="font-black text-slate-900 text-xs truncate">
                                              {displayName}
                                            </span>

                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border shrink-0 ${
                                              isMerchant ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-purple-50 text-purple-800 border-purple-300'
                                            }`}>
                                              {isMerchant ? '👑 تاجر' : '🏪 ماركت'}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* City */}
                          <div className="sm:col-span-2">
                            <input
                              type="text"
                              value={ldr.city}
                              onChange={(e) => updateLeader(ldr.id, { city: e.target.value })}
                              placeholder="المحافظة"
                              className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-xs font-bold text-slate-900"
                            />
                          </div>

                          {/* Score / Cartons */}
                          <div className="sm:col-span-2">
                            <input
                              type="text"
                              value={ldr.score}
                              onChange={(e) => updateLeader(ldr.id, { score: e.target.value })}
                              placeholder="مثال: 750 كرتون"
                              className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-xs font-mono font-black text-indigo-900"
                            />
                          </div>

                          {/* Prize */}
                          <div className="sm:col-span-2">
                            <input
                              type="text"
                              value={ldr.prize || ''}
                              onChange={(e) => updateLeader(ldr.id, { prize: e.target.value })}
                              placeholder="الجائزة المخصصة"
                              className="w-full bg-white border border-amber-300 rounded-lg py-1.5 px-2 text-xs font-bold text-amber-900"
                            />
                          </div>

                          {/* Delete */}
                          <div className="sm:col-span-1 text-left sm:text-center">
                            <button
                              type="button"
                              onClick={() => deleteLeader(ldr.id)}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition"
                              title="حذف هذا المتصدر"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>

              </div>

            </div>
          );
        })()}

        {/* 7. SYSTEM RESET & DATA CLEARING CENTER (مركز تصفير وإعادة ضبط النظام والبيانات) */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white p-6 sm:p-7 rounded-3xl border-2 border-red-500/40 shadow-xl space-y-5">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/30 text-red-400 flex items-center justify-center text-xl shrink-0">
                <Database className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-black px-2.5 py-0.5 rounded-md mb-1">
                  <ShieldAlert className="w-3 h-3 text-red-400" />
                  <span>منطقة التحكم المتقدمة بإدارة وتصفير البيانات</span>
                </div>
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span>مركز تصفير وإعادة ضبط النظام 🧹</span>
                </h2>
                <p className="text-xs text-slate-400 font-bold mt-0.5">
                  يمكنك تصفير أي قسم أو جدول بشكل مستقل تماماً، أو إجراء تصفير شامل للنظام، مع توثيق نسخة احتياطية فورية تلقائياً 🔒.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchDbStats}
              className="self-start sm:self-auto flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2 px-3.5 rounded-xl border border-slate-700 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث أعداد البيانات 🔄</span>
            </button>
          </div>

          {/* Grid of Selective Table Resets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            
            {/* 1. Products */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 font-black">
                  <Package className="w-4 h-4" />
                  <span>الأصناف والمخزون</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.productsCount ?? '...'} صنف
                </span>
              </div>
              <p className="text-[11px] text-slate-400">حذف كافة المنتجات والمخزون المسجل بالمستودع.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('products', 'الأصناف والمخزون', `${dbStats?.productsCount ?? 0} صنف`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'products' ? 'جاري التصفير...' : 'تصفير الأصناف'}</span>
              </button>
            </div>

            {/* 2. Categories */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400 font-black">
                  <Layers className="w-4 h-4" />
                  <span>الأقسام والتصنيفات</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.categoriesCount ?? '...'} قسم
                </span>
              </div>
              <p className="text-[11px] text-slate-400">حذف كافة الأقسام والتصنيفات في المتجر.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('categories', 'الأقسام والتصنيفات', `${dbStats?.categoriesCount ?? 0} قسم`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'categories' ? 'جاري التصفير...' : 'تصفير الأقسام'}</span>
              </button>
            </div>

            {/* 3. Companies */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sky-400 font-black">
                  <Building className="w-4 h-4" />
                  <span>الشركات والماركات</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.companiesCount ?? '...'} شركة
                </span>
              </div>
              <p className="text-[11px] text-slate-400">حذف كافة الشركات والمصانع المصنعة.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('companies', 'الشركات والماركات', `${dbStats?.companiesCount ?? 0} شركة`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'companies' ? 'جاري التصفير...' : 'تصفير الشركات'}</span>
              </button>
            </div>

            {/* 4. Orders */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 font-black">
                  <Receipt className="w-4 h-4" />
                  <span>الطلبيات والفواتير</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.ordersCount ?? '...'} طلبية
                </span>
              </div>
              <p className="text-[11px] text-slate-400">تصفير سجل كافة طلبات وفواتير الزبائن والتجار.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('orders', 'الطلبيات والفواتير', `${dbStats?.ordersCount ?? 0} طلبية`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'orders' ? 'جاري التصفير...' : 'تصفير الطلبيات'}</span>
              </button>
            </div>

            {/* 5. Accounting & Debts */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-black">
                  <FileText className="w-4 h-4" />
                  <span>المحاسبة والديون</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.paymentsCount ?? '...'} سند قبض
                </span>
              </div>
              <p className="text-[11px] text-slate-400">تصفير سجل سندات القبض والدفعات وتصفية الذمم.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('accounting', 'سندات القبض والمحاسبة', `${dbStats?.paymentsCount ?? 0} سند`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'accounting' ? 'جاري التصفير...' : 'تصفير المحاسبة'}</span>
              </button>
            </div>

            {/* 6. Purchase Invoices */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-teal-400 font-black">
                  <Package className="w-4 h-4" />
                  <span>فواتير مشتريات التوريد</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.purchasesCount ?? '...'} فاتورة
                </span>
              </div>
              <p className="text-[11px] text-slate-400">حذف فواتير توريد البضاعة من الشركات المجهزة.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('purchases', 'فواتير مشتريات التوريد', `${dbStats?.purchasesCount ?? 0} فاتورة`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'purchases' ? 'جاري التصفير...' : 'تصفير المشتريات'}</span>
              </button>
            </div>

            {/* 7. Merchants & Customers */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-orange-400 font-black">
                  <Users className="w-4 h-4" />
                  <span>الزبائن والتجار</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.merchantsCount ?? '...'} حساب
                </span>
              </div>
              <p className="text-[11px] text-slate-400">حذف كافة حسابات التجار والزبائن المسجلين.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('merchants', 'حسابات الزبائن والتجار', `${dbStats?.merchantsCount ?? 0} حساب`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'merchants' ? 'جاري التصفير...' : 'تصفير الزبائن والتجار'}</span>
              </button>
            </div>

            {/* 8. Drivers & Fleet */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-black">
                  <Car className="w-4 h-4" />
                  <span>السائقين وأسطول السيارات</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {(dbStats?.driversCount ?? 0) + (dbStats?.vehiclesCount ?? 0)} سائق ومركبة
                </span>
              </div>
              <p className="text-[11px] text-slate-400">حذف كافة السائقين والمركبات المسجلة بالأسطول.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('drivers', 'السائقين وأسطول المركبات', `${(dbStats?.driversCount ?? 0) + (dbStats?.vehiclesCount ?? 0)} عنصر`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'drivers' ? 'جاري التصفير...' : 'تصفير السائقين'}</span>
              </button>
            </div>

            {/* 9. Banners */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-purple-400 font-black">
                  <Sparkles className="w-4 h-4" />
                  <span>البنرات والإعلانات</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.bannersCount ?? '...'} بنر
                </span>
              </div>
              <p className="text-[11px] text-slate-400">حذف كافة البنرات وسلايدر الإعلانات والنافذة المنبثقة.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('banners', 'البنرات والإعلانات', `${dbStats?.bannersCount ?? 0} بنر`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'banners' ? 'جاري التصفير...' : 'تصفير البنرات'}</span>
              </button>
            </div>

            {/* 10. Offers */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 font-black">
                  <Flame className="w-4 h-4" />
                  <span>العروض والتخفيضات</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.offersCount ?? '...'} عرض
                </span>
              </div>
              <p className="text-[11px] text-slate-400">حذف كافة العروض الترويجية والخصومات الموقوتة.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('offers', 'العروض والتخفيضات', `${dbStats?.offersCount ?? 0} عرض`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'offers' ? 'جاري التصفير...' : 'تصفير العروض'}</span>
              </button>
            </div>

            {/* 11. Staff Members */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between space-y-3 hover:border-slate-600 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-purple-400 font-black">
                  <Users className="w-4 h-4" />
                  <span>حسابات الموظفين</span>
                </div>
                <span className="bg-slate-700 text-slate-200 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                  {dbStats?.staffCount ?? '...'} موظف
                </span>
              </div>
              <p className="text-[11px] text-slate-400">حذف كافة حسابات الموظفين الفرعية مع إبقاء حساب المدير الرئيسي.</p>
              <button
                type="button"
                disabled={isResetting !== null}
                onClick={() => handleReset('staff', 'حسابات الموظفين', `${dbStats?.staffCount ?? 0} موظف`)}
                className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isResetting === 'staff' ? 'جاري التصفير...' : 'تصفير الموظفين'}</span>
              </button>
            </div>

          </div>

          {/* Master Full Factory Reset Card */}
          <div className="bg-red-950/60 border-2 border-red-500/60 p-5 sm:p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4 shadow-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-red-400 font-black text-sm">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
                <span>إعادة ضبط المصنع الشاملة (تصفير النظام بالكامل) 💥</span>
              </div>
              <p className="text-xs text-slate-300 font-bold">
                يقوم بمسح وتصفير كافة الجداول والبيانات المدخلة في النظام للبدء من جديد تماماً، مع حفظ نسخة احتياطية فورية تلقائياً قبل التصفير والإبقاء على حساب دخول المدير.
              </p>
            </div>

            <button
              type="button"
              disabled={isResetting !== null}
              onClick={() => handleReset('all', 'النظام بالكامل')}
              className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-xs sm:text-sm py-3 px-6 rounded-2xl shadow-xl shadow-red-600/30 transition cursor-pointer flex items-center justify-center gap-2 shrink-0 active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{isResetting === 'all' ? 'جاري التصفير الشامل...' : 'تصفير النظام بالكامل 💥'}</span>
            </button>
          </div>

        </div>

        {/* Sticky Submit Action Bar (Always visible and shows clear success feedback) */}
        <div className="sticky bottom-4 z-40 bg-white/95 backdrop-blur-md p-4 rounded-3xl border-2 border-slate-200 shadow-xl flex items-center justify-between gap-4">
          <div>
            {savedSuccess ? (
              <span className="bg-emerald-50 text-emerald-800 text-xs font-black px-4 py-2 rounded-2xl border-2 border-emerald-300 flex items-center gap-2 shadow-xs">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>تم حفظ كافة الإعدادات بنجاح تام! ✅</span>
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 font-bold hidden sm:inline-block">
                💾 اضغط على الزر لحفظ وتحديث كافة التعديلات في النظام
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="bg-brand-blue hover:bg-brand-blueDark active:scale-98 text-white font-black text-xs sm:text-sm py-3 px-8 rounded-2xl shadow-md transition flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'جاري الحفظ...' : 'حفظ كافة الإعدادات ✅'}</span>
          </button>
        </div>

      </form>

    </div>
  );
}
