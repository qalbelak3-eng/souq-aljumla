'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Phone, Lock, ArrowLeft, ShieldCheck, UserCheck, AlertCircle } from 'lucide-react';
import EtihadLogo from '@/components/EtihadLogo';

export default function DriverLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password) {
      setError('يرجى كتابة رقم الهاتف وكلمة المرور');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/driver/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();

      if (data.success && data.driver) {
        localStorage.setItem('driver_session', JSON.stringify(data.driver));
        router.push('/driver');
      } else {
        setError(data.error || 'بيانات الدخول غير صحيحة');
      }
    } catch (err) {
      setError('حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f3f8fc] text-slate-800 flex flex-col justify-between p-4 sm:p-6" dir="rtl">
      
      {/* Top Header */}
      <div className="max-w-md mx-auto w-full pt-6 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-amber-100 border border-amber-200 text-amber-700 mb-1 shadow-xs">
          <Truck className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">بوابة سائقي ومناديب التوصيل 🚚</h1>
        <p className="text-xs text-slate-500 font-bold">
          مؤسسة الاتحاد وجملتي لتجارة وتوزيع المواد الغذائية في العراق
        </p>
      </div>

      {/* Login Card */}
      <div className="max-w-md mx-auto w-full bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 my-auto">
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-3.5 rounded-2xl flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-black text-slate-800 block">رقم هاتف السائق:</label>
            <div className="relative">
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07701112233"
                dir="ltr"
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl py-3 pr-4 pl-10 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-brand-blue transition"
              />
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-black text-slate-800 block">كلمة المرور:</label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl py-3 pr-4 pl-10 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-brand-blue transition"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-blue hover:bg-brand-blueDark active:scale-98 text-white font-black text-xs sm:text-sm py-3.5 rounded-2xl shadow-md transition flex items-center justify-center gap-2 mt-2 cursor-pointer"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>تسجيل الدخول لبدء التوصيل 🚀</span>
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

      </div>

      {/* Footer */}
      <div className="max-w-md mx-auto w-full text-center pb-4">
        <a href="/" className="text-xs font-bold text-slate-500 hover:text-slate-800 transition">
          ← العودة للواجهة الرئيسية للمتجر
        </a>
      </div>

    </div>
  );
}
