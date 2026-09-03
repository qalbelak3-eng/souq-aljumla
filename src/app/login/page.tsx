'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Headphones, Phone, MessageCircle, X, ShieldAlert, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import EtihadLogo from '@/components/EtihadLogo';
import { StoreSettings } from '@/types';

function LoginForm() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) {
          setSettings(data.settings);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('يرجى إدخال رقم الموبايل أو البريد');
      return;
    }

    setIsLoading(true);
    setError('');
    setStatusNote('');

    const res = await login(identifier.trim(), password ? password.trim() : undefined);
    setIsLoading(false);

    if (res.success && res.user) {
      if ((res.user.accountType === 'wholesale' || res.user.accountType === 'merchant') && res.user.merchantStatus === 'pending') {
        setStatusNote('طلب اعتماد حسابك كتاجر جملة قيد المراجعة والتدقيق من قبل الإدارة، يمكنك التسوق بسعر المفرد ريثما يتم اعتماد حسابك وتصنيفك.');
        setTimeout(() => {
          window.location.href = redirect;
        }, 1200);
      } else {
        window.location.href = redirect;
      }
    } else {
      setError(res.error || 'فشل تسجيل الدخول، تأكد من رقم الموبايل وكلمة السر');
    }
  };

  const supportWhatsapp = settings?.supportWhatsappNumber || settings?.whatsappNumber || '07717637525';
  const techSupportPhone = settings?.phone || '07842220088';

  const formatPhoneForWa = (raw: string) => {
    let p = raw.replace(/\D/g, '');
    if (p.startsWith('07')) p = '964' + p.substring(1);
    else if (p.startsWith('7') && p.length === 10) p = '964' + p;
    return p;
  };

  const handleOpenWhatsApp = (targetPhone: string, deptName: string) => {
    const cleanPhone = identifier ? identifier.trim() : '';
    const text = cleanPhone
      ? `مرحباً ${deptName} في سوق الجملة 🇮🇶، نسيت كلمة السر الخاصة بحسابي المسجل برقم الهاتف (${cleanPhone})، يرجى مساعدتي في استعادة حسابي.`
      : `مرحباً ${deptName} في سوق الجملة 🇮🇶، أود المساعدة في تسجيل الدخول واستعادة الحساب.`;
    window.open(`https://api.whatsapp.com/send?phone=${formatPhoneForWa(targetPhone)}&text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="relative min-h-[85vh] flex flex-col justify-center max-w-md mx-auto px-4 py-8 select-none" dir="rtl">
      
      {/* Top Floating Support Headphones Icon */}
      <button
        type="button"
        onClick={() => setIsSupportModalOpen(true)}
        className="fixed top-5 left-5 z-40 w-11 h-11 rounded-full bg-[#4c489d] hover:bg-[#3f3c8a] text-white flex items-center justify-center shadow-lg shadow-[#4c489d]/30 transition transform hover:scale-105 active:scale-95 cursor-pointer"
        title="خدمة العملاء والمساعدة"
      >
        <Headphones className="w-5 h-5" />
      </button>

      {/* Top Logo & Brand Tagline */}
      <div className="text-center space-y-1.5 flex flex-col items-center mb-5">
        <EtihadLogo size="lg" />
        <h1 className="text-xs sm:text-sm font-bold text-slate-500 pt-1">
          تسجيل الدخول إلى حسابك
        </h1>
      </div>

      {/* Main Login Card */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_30px_rgba(0,0,0,0.05)] space-y-5 text-xs">
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs p-3 rounded-2xl font-bold text-center">
            {error}
          </div>
        )}

        {statusNote && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-2xl font-bold text-center">
            {statusNote}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          
          {/* Mobile input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">رقم الموبايل</label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="07XXXXXXXXX"
              dir="ltr"
              className="w-full bg-white border border-slate-200 rounded-2xl py-3 px-4 text-xs text-right text-slate-900 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue placeholder:text-slate-400 font-bold"
            />
          </div>

          {/* Password input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">كلمة السر</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="......"
              dir="ltr"
              className="w-full bg-white border border-slate-200 rounded-2xl py-3 px-4 text-xs text-right text-slate-900 focus:outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue placeholder:text-slate-400 font-mono"
            />
          </div>

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-brand-blue to-indigo-700 hover:from-brand-blueDark hover:to-indigo-800 active:scale-98 text-white font-black py-3.5 px-4 rounded-2xl shadow-md transition text-xs flex items-center justify-center gap-2 mt-2 cursor-pointer"
          >
            {isLoading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        {/* Clean Center Links */}
        <div className="text-center space-y-2.5 pt-1 text-xs">
          <div>
            <button
              type="button"
              onClick={() => setIsSupportModalOpen(true)}
              className="text-slate-500 hover:text-[#4c489d] text-[11px] font-bold transition hover:underline cursor-pointer"
            >
              هل نسيت كلمة المرور؟
            </button>
          </div>

          <div className="text-slate-600 text-xs">
            ليس لديك حساب؟{' '}
            <Link
              href={`/register?redirect=${redirect}`}
              className="text-brand-coral font-black hover:underline"
            >
              أنشئ حساب جديد
            </Link>
          </div>
        </div>

        {/* Guest Browse link */}
        <div className="pt-2 border-t border-slate-100 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-brand-blue transition"
          >
            <span>تصفح المتجر كزائر دون تسجيل دخول 🛒</span>
          </Link>
        </div>

      </div>

      {/* MODAL: خدمة العملاء والمساعدة (Brand Purple Identity) */}
      {isSupportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 border border-slate-100 text-center">
            
            {/* Brand Purple Header with Headset Icon */}
            <div className="relative bg-gradient-to-b from-[#5651b1] via-[#4c489d] to-[#3b3780] text-white pt-7 pb-6 px-6">
              <button
                type="button"
                onClick={() => setIsSupportModalOpen(false)}
                className="absolute top-4 left-4 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition cursor-pointer text-xs font-bold"
              >
                ✕
              </button>

              <div className="w-14 h-14 mx-auto rounded-full bg-white/15 border border-white/25 flex items-center justify-center mb-3 shadow-inner">
                <Headphones className="w-7 h-7 text-white" />
              </div>

              <h2 className="text-lg font-black tracking-tight">خدمة العملاء</h2>
              <p className="text-xs text-purple-100/90 font-medium mt-0.5">نحن دائماً معك</p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                اضغط على أيقونة الواتساب لإرسال رسالة جاهزة، أو على الهاتف للاتصال مباشرة.
              </p>

              {/* Contact 1: Customer Service */}
              <div className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-2xl p-3 flex items-center justify-between transition">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenWhatsApp(supportWhatsapp, 'خدمة العملاء')}
                    className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center shadow-xs transition cursor-pointer"
                    title="مراسلة واتساب"
                  >
                    <MessageCircle className="w-5 h-5 fill-current" />
                  </button>
                  <a
                    href={`tel:${supportWhatsapp}`}
                    className="w-9 h-9 rounded-full bg-[#1b4332] hover:bg-[#143628] active:scale-95 text-white flex items-center justify-center shadow-xs transition"
                    title="اتصال هاتفي"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                </div>

                <div className="text-left">
                  <span className="text-[10px] text-slate-400 font-bold block text-right">خدمة العملاء</span>
                  <span className="text-xs font-black text-slate-800 font-mono tracking-wide" dir="ltr">
                    {supportWhatsapp}
                  </span>
                </div>
              </div>

              {/* Contact 2: Technical Support */}
              <div className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-2xl p-3 flex items-center justify-between transition">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenWhatsApp(techSupportPhone, 'الدعم الفني')}
                    className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center shadow-xs transition cursor-pointer"
                    title="مراسلة واتساب"
                  >
                    <MessageCircle className="w-5 h-5 fill-current" />
                  </button>
                  <a
                    href={`tel:${techSupportPhone}`}
                    className="w-9 h-9 rounded-full bg-[#1b4332] hover:bg-[#143628] active:scale-95 text-white flex items-center justify-center shadow-xs transition"
                    title="اتصال هاتفي"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                </div>

                <div className="text-left">
                  <span className="text-[10px] text-slate-400 font-bold block text-right">الدعم الفني</span>
                  <span className="text-xs font-black text-slate-800 font-mono tracking-wide" dir="ltr">
                    {techSupportPhone}
                  </span>
                </div>
              </div>

              {/* Working Hours */}
              <div className="pt-2">
                <p className="text-[10px] text-slate-400 font-bold">
                  {settings?.workingHours || 'أوقات الدوام: السبت - الخميس ٩ صباحاً - ٩ مساءً'}
                </p>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-xs text-slate-400">جاري التحميل...</div>}>
      <LoginForm />
    </Suspense>
  );
}
