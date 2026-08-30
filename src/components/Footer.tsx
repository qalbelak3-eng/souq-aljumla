'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Phone, Mail, MapPin, MessageCircle, Truck, Award, PackageCheck, Headphones, Clock, Sparkles } from 'lucide-react';
import EtihadLogo from '@/components/EtihadLogo';
import { StoreSettings } from '@/types';

export default function Footer() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);

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

  // WhatsApp Support Number calculation
  const rawSupportWa = settings?.supportWhatsappNumber || settings?.whatsappNumber || '9647700000000';
  const cleanSupportWa = rawSupportWa.replace(/\D/g, '');
  const intlSupportWa = cleanSupportWa.startsWith('0') ? '964' + cleanSupportWa.slice(1) : cleanSupportWa;
  const waSupportUrl = `https://api.whatsapp.com/send?phone=${intlSupportWa}&text=${encodeURIComponent('مرحباً خدمة عملاء سوق الجملة (كربلاء المقدسة) 🇮🇶، أود الاستفسار والمساعدة بخصوص...')}`;

  const footerText = settings?.footerDescription || settings?.storeTagline || 'سوق الجملة - خيارك الأوفر والأشمل لتجارة وتوريد المواد الغذائية، السناكات، الشيبس، الكرواسون ومشروبات الطاقة بالجملة والمفرد في كربلاء المقدسة.';
  const storeAddress = settings?.address || 'كربلاء المقدسة - سوق الجملة المركزي';
  const storePhone = settings?.phone || settings?.supportPhone || '+964 770 000 0000';
  const storeEmail = settings?.email || 'sales@souq-aljumla.iq';

  return (
    <footer className="bg-white text-slate-600 border-t border-slate-200 mt-16 text-xs print:hidden">
      
      {/* 1. Value Propositions Banner */}
      <div className="border-b border-slate-100 bg-[#f8fbfe]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-brand-blue flex items-center justify-center shrink-0">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-slate-900 font-bold text-xs">سناكات وأغذية (جملة ومفرد)</h4>
              <p className="text-[11px] text-slate-500">أسعار كراتين خاصة للأسواق والمطاعم</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-slate-900 font-bold text-xs">توصيل سريع ومباشر</h4>
              <p className="text-[11px] text-slate-500">توصيل لكافة مناطق كربلاء ومجاني للطلبيات</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-slate-900 font-bold text-xs">طلب فوري عبر واتساب</h4>
              <p className="text-[11px] text-slate-500">إرسال تفاصيل السلة والكميات بضغطة زر</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-slate-900 font-bold text-xs">منتجات طازجة ومضمونة</h4>
              <p className="text-[11px] text-slate-500">أصناف أصلية معتمدة وتاريخ إنتاج حديث</p>
            </div>
          </div>

        </div>
      </div>

      {/* 2. Main Focused Footer Content (2 Column Layout) */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* Right Side: Brand Logo, Description & WhatsApp Customer Support Button */}
        <div className="md:col-span-7 space-y-4">
          <EtihadLogo size="md" />
          
          <p className="text-xs text-slate-600 leading-relaxed max-w-xl font-medium">
            {footerText}
          </p>

          {/* WhatsApp Support CTA Button */}
          <div className="pt-2">
            <a
              href={waSupportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-3 px-5 rounded-2xl transition shadow-md hover:shadow-lg transform active:scale-98"
            >
              <MessageCircle className="w-4 h-4 text-emerald-100" />
              <span>محادثة خدمة العملاء واتساب 💬</span>
            </a>
          </div>
        </div>

        {/* Left Side: Contact Information (Karbala 🇮🇶) */}
        <div className="md:col-span-5 bg-[#f8fbfe] p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs space-y-3.5">
          <h4 className="text-slate-900 font-black text-xs sm:text-sm border-b border-slate-200/80 pb-2.5 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span>معلومات التواصل (كربلاء المقدسة 🇮🇶)</span>
          </h4>

          <ul className="space-y-3 text-xs">
            <li className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="font-bold text-slate-800 leading-snug">{storeAddress}</span>
            </li>

            <li className="flex items-center gap-2.5">
              <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
              <a
                href={`tel:${storePhone}`}
                className="font-mono font-bold text-slate-800 hover:text-emerald-700 transition"
                dir="ltr"
              >
                {storePhone}
              </a>
            </li>

            <li className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-emerald-600 shrink-0" />
              <a
                href={`mailto:${storeEmail}`}
                className="font-mono font-bold text-slate-800 hover:text-emerald-700 transition"
                dir="ltr"
              >
                {storeEmail}
              </a>
            </li>

            <li className="flex items-center gap-2.5 pt-1 border-t border-slate-200/60 text-[11px] text-slate-500 font-bold">
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>أوقات العمل: {settings?.workingHours || 'يومياً من 8:00 صباحاً حتى 11:00 مساءً'}</span>
            </li>
          </ul>
        </div>

      </div>

      {/* 3. Copyright */}
      <div className="border-t border-slate-200 bg-slate-50/80 py-4 text-center text-[11px] text-slate-500 font-bold">
        <p>{settings?.copyrightText || `جميع الحقوق محفوظة © ${new Date().getFullYear()} - سوق الجملة للتجارة الذكية في كربلاء المقدسة 🇮🇶`}</p>
      </div>

    </footer>
  );
}
