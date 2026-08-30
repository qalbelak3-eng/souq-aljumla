'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  Package,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  Store,
  Layers,
  FileText,
  Banknote,
  ShieldCheck,
  Bell,
  Sparkles,
  Building2,
  Settings,
  MessageSquare,
  Truck,
  Flame
} from 'lucide-react';
import { Order, Product, User } from '@/types';

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [merchants, setMerchants] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/orders').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/admin/merchants').then((r) => r.json()),
    ])
      .then(([orderData, prodData, merchantData]) => {
        if (orderData.success) setOrders(orderData.orders || []);
        if (prodData.success) setProducts(prodData.products || []);
        if (merchantData.success) setMerchants(merchantData.merchants || []);
        setIsLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setIsLoading(false);
      });
  }, []);

  const totalSales = orders.reduce((acc, o) => acc + (o.status !== 'cancelled' ? o.total : 0), 0);
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const pendingMerchants = merchants.filter((m) => m.merchantStatus === 'pending').length;

  return (
    <div className="space-y-6 text-xs">
      
      {/* Welcome Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-900">مرحباً بك في لوحة تحكم سوق الجملة 🇮🇶</h1>
          <p className="text-xs text-slate-500 font-bold mt-1">النظام المحاسبي، متابعة الأرباح، إدارة الفواتير، واعتماد الماركتات</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingOrders > 0 && (
            <Link
              href="/admin/orders"
              className="bg-red-500 hover:bg-red-600 text-white font-black px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition animate-bounce"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{pendingOrders} طلبات زبائن جديدة 🔔</span>
            </Link>
          )}

          {pendingMerchants > 0 && (
            <Link
              href="/admin/merchants"
              className="bg-amber-500 hover:bg-amber-600 text-white font-black px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition animate-pulse"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{pendingMerchants} طلبات اعتماد تجار ⏳</span>
            </Link>
          )}
        </div>
      </div>

      {/* Prominent Action Alert Banners */}
      {(pendingOrders > 0 || pendingMerchants > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pendingOrders > 0 && (
            <div className="bg-red-50 border-2 border-red-200 p-4 rounded-3xl flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-xs sm:text-sm">يوجد {pendingOrders} طلبيات جديدة تحتاج معالجة!</h3>
                  <p className="text-[11px] text-slate-600 font-bold mt-0.5">يرجى مراجعة تفاصيل الفواتير وتجهيزها</p>
                </div>
              </div>
              <Link
                href="/admin/orders"
                className="bg-red-600 hover:bg-red-700 text-white font-black text-xs py-2 px-3.5 rounded-xl shrink-0 transition"
              >
                معالجة الطلبيات ⚡
              </Link>
            </div>
          )}

          {pendingMerchants > 0 && (
            <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-3xl flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-xs sm:text-sm">يوجد {pendingMerchants} طلبات تسجيل ماركت بانتظار الاعتماد!</h3>
                  <p className="text-[11px] text-slate-600 font-bold mt-0.5">تفعيل أسعار الجملة لأصحاب المحلات</p>
                </div>
              </div>
              <Link
                href="/admin/merchants"
                className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs py-2 px-3.5 rounded-xl shrink-0 transition"
              >
                اعتماد التجار 👑
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 font-bold">
            <span>إجمالي المبيعات والفواتير</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">{totalSales.toLocaleString()} <span className="text-xs font-normal text-slate-500">د.ع</span></div>
        </div>

        <div className={`bg-white p-5 rounded-3xl border shadow-xs space-y-2 ${pendingOrders > 0 ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-500 font-bold">
            <span className="flex items-center gap-1.5">
              <span>إجمالي الطلبيات</span>
              {pendingOrders > 0 && <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-md animate-pulse">({pendingOrders} جديد)</span>}
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-brand-blue flex items-center justify-center">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">{orders.length} <span className="text-xs font-normal text-slate-500">طلبية</span></div>
        </div>

        <div className={`bg-white p-5 rounded-3xl border shadow-xs space-y-2 ${pendingMerchants > 0 ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-500 font-bold">
            <span className="flex items-center gap-1.5">
              <span>الماركتات والتجار</span>
              {pendingMerchants > 0 && <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-md animate-pulse">({pendingMerchants} قيد المراجعة)</span>}
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">{merchants.length} <span className="text-xs font-normal text-slate-500">تاجر</span></div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 font-bold">
            <span>الأصناف والمنتجات</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">{products.length} <span className="text-xs font-normal text-slate-500">صنف</span></div>
        </div>
      </div>

      {/* Quick Navigation Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* 1. Accounting & Debts */}
        <Link
          href="/admin/accounting"
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between group transition"
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
              <span>💼 النظام المحاسبي وكشوفات الحسابات</span>
            </h4>
            <p className="text-slate-500 font-bold text-[11px]">متابعة الديون وسندات القبض وكشوفات الحساب</p>
          </div>
          <FileText className="w-6 h-6 text-brand-blue group-hover:scale-110 transition-transform" />
        </Link>

        {/* 2. Profit Reports */}
        <Link
          href="/admin/reports"
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between group transition"
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
              <span>📈 تقرير الأرباح والمبيعات الحقيقية</span>
            </h4>
            <p className="text-slate-500 font-bold text-[11px]">تحليل صافي الأرباح وهوامش ربح المنتجات</p>
          </div>
          <TrendingUp className="w-6 h-6 text-emerald-600 group-hover:scale-110 transition-transform" />
        </Link>

        {/* 3. Orders Management */}
        <Link
          href="/admin/orders"
          className={`bg-white hover:bg-slate-50 p-5 rounded-3xl border shadow-xs flex items-center justify-between group transition ${pendingOrders > 0 ? 'border-red-400 bg-red-50/20' : 'border-slate-200'}`}
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-2">
              <span>📦 إدارة وتجهيز الطلبيات</span>
              {pendingOrders > 0 && <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">{pendingOrders} جديد 🔔</span>}
            </h4>
            <p className="text-slate-500 font-bold text-[11px]">متابعة الفواتير وحالات التوصيل</p>
          </div>
          <ShoppingCart className="w-6 h-6 text-brand-coral group-hover:scale-110 transition-transform" />
        </Link>

        {/* 4. Products & 4-tier Pricing */}
        <Link
          href="/admin/products"
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between group transition"
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm">🏷️ إدارة الأصناف والتسعير الرباعي</h4>
            <p className="text-slate-500 font-bold text-[11px]">تحديد سعر الشراء، الجملة، المفرد، والخاص</p>
          </div>
          <Package className="w-6 h-6 text-indigo-600 group-hover:scale-110 transition-transform" />
        </Link>

        {/* 5. Merchants */}
        <Link
          href="/admin/merchants"
          className={`bg-white hover:bg-slate-50 p-5 rounded-3xl border shadow-xs flex items-center justify-between group transition ${pendingMerchants > 0 ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'}`}
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-2">
              <span>👑 اعتماد الماركتات وأسعار الجملة</span>
              {pendingMerchants > 0 && <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">{pendingMerchants} قيد المراجعة ⏳</span>}
            </h4>
            <p className="text-slate-500 font-bold text-[11px]">تفعيل كراتين الجملة لأصحاب المحلات</p>
          </div>
          <Store className="w-6 h-6 text-emerald-600 group-hover:scale-110 transition-transform" />
        </Link>

        {/* 6. Purchases & Invoices */}
        <Link
          href="/admin/purchases"
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between group transition"
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
              <span>📦 فواتير المشتريات والتوريد</span>
            </h4>
            <p className="text-slate-500 font-bold text-[11px]">تسجيل فواتير الشراء من الشركات وتعبئة المخزون</p>
          </div>
          <Package className="w-6 h-6 text-purple-600 group-hover:scale-110 transition-transform" />
        </Link>

        {/* 7. Companies */}
        <Link
          href="/admin/companies"
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between group transition"
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm">🏢 إدارة الشركات والماركات</h4>
            <p className="text-slate-500 font-bold text-[11px]">توزيع الشركات والمصانع المصنعة لكل قسم</p>
          </div>
          <Building2 className="w-6 h-6 text-brand-blue group-hover:scale-110 transition-transform" />
        </Link>

        {/* 8. Store Settings */}
        <Link
          href="/admin/settings"
          className="bg-gradient-to-br from-emerald-50 to-teal-50 hover:from-emerald-100/70 hover:to-teal-100/70 p-5 rounded-3xl border-2 border-emerald-300 shadow-xs flex items-center justify-between group transition"
        >
          <div className="space-y-1">
            <h4 className="font-black text-emerald-950 text-xs sm:text-sm flex items-center gap-1.5">
              <span>⚙️ إعدادات المتجر والتذييل (كربلاء)</span>
            </h4>
            <p className="text-emerald-800 font-bold text-[11px]">التحكم بالتذييل، أرقام الواتساب، الكروة، والكاش باك</p>
          </div>
          <Settings className="w-6 h-6 text-emerald-700 group-hover:rotate-45 transition-transform" />
        </Link>

        {/* 9. Complaints & Inquiries */}
        <Link
          href="/admin/complaints"
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between group transition"
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
              <span>💬 الشكاوى والملاحظات</span>
            </h4>
            <p className="text-slate-500 font-bold text-[11px]">متابعة رسائل الزبائن والرد المباشر عليها</p>
          </div>
          <MessageSquare className="w-6 h-6 text-rose-600 group-hover:scale-110 transition-transform" />
        </Link>

        {/* 10. Drivers & Delivery */}
        <Link
          href="/admin/drivers"
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between group transition"
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
              <span>🚚 إدارة وتوزيع السائقين</span>
            </h4>
            <p className="text-slate-500 font-bold text-[11px]">إسناد الطلبيات وتصفية عهدة الكاش</p>
          </div>
          <Truck className="w-6 h-6 text-emerald-600 group-hover:scale-110 transition-transform" />
        </Link>

        {/* 11. Offers */}
        <Link
          href="/admin/offers"
          className="bg-white hover:bg-slate-50 p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between group transition"
        >
          <div className="space-y-1">
            <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
              <span>🔥 العروض والتخفيضات الكبرى</span>
            </h4>
            <p className="text-slate-500 font-bold text-[11px]">إنشاء عروض الخصم المؤقتة وباقات الجملة</p>
          </div>
          <Flame className="w-6 h-6 text-rose-600 group-hover:scale-110 transition-transform" />
        </Link>

      </div>

    </div>
  );
}
