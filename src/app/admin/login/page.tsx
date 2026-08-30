'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, User, ShieldCheck, ArrowRight, KeyRound } from 'lucide-react';
import EtihadLogo from '@/components/EtihadLogo';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور للإدارة');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username, password }),
      });
      const data = await res.json();

      if (data.success && data.admin) {
        localStorage.setItem('etihad_admin_auth', JSON.stringify({
          id: data.admin.id,
          name: data.admin.name,
          username: data.admin.username,
          role: data.admin.role || 'admin',
          jobTitle: data.admin.jobTitle || 'مدير النظام',
          permissions: data.admin.permissions || ['*'],
          token: 'auth_' + Date.now(),
          loggedAt: new Date().toISOString(),
        }));
        router.push('/admin');
      } else {
        setError(data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } catch (err: any) {
      setError('حدث خطأ في الاتصال بالسيرفر');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-[#eaf4fd] to-slate-200 flex items-center justify-center p-4">
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-2xl max-w-md w-full space-y-5 text-xs text-slate-800">
        
        {/* Header */}
        <div className="text-center space-y-2.5 flex flex-col items-center">
          <EtihadLogo size="lg" />
          <div className="pt-1 space-y-1">
            <span className="inline-block bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-black px-3 py-1 rounded-full">
              منطقة الإدارة المحمية 🔐
            </span>
            <h1 className="text-xl font-black text-slate-900 mt-1">تسجيل دخول لوحة التحكم</h1>
            <p className="text-xs text-slate-600 font-bold">
              يرجى إدخال اسم المستخدم والرقم السري المعتمد للوصول للإدارة
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl font-bold flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-800 block">
              اسم المستخدم (Username):
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 pr-4 pl-10 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 transition placeholder:text-slate-600"
              />
              <User className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-800 block">
              الرقم السري (Password):
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 pr-4 pl-10 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 transition placeholder:text-slate-600"
              />
              <KeyRound className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-emerald-600 to-indigo-700 hover:from-emerald-700 hover:to-indigo-800 text-white font-black py-3 px-4 rounded-xl shadow-lg transition text-xs flex items-center justify-center gap-2"
          >
            {isLoading ? 'جاري التحقق...' : 'دخول للوحة الإدارة ⚡'}
          </button>
        </form>

        <div className="text-center pt-3 border-t border-slate-100">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-brand-blue font-bold transition"
          >
            <span>العودة للمتجر الرئيسي</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

      </div>
    </div>
  );
}
