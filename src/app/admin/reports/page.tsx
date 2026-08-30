'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  DollarSign,
  Package,
  Calendar,
  Filter,
  Printer,
  ArrowLeft,
  FileText,
  Percent,
  Receipt,
  Layers,
  ArrowUpRight,
  Sparkles,
  Search,
  RotateCcw
} from 'lucide-react';
import { ProfitReportSummary } from '@/types';
import EtihadLogo from '@/components/EtihadLogo';

export default function AdminReportsPage() {
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [report, setReport] = useState<ProfitReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [activeRangeLabel, setActiveRangeLabel] = useState('جميع الفترات (سجل كامل)');
  const router = useRouter();

  // Check auth
  useEffect(() => {
    const auth = localStorage.getItem('etihad_admin_auth');
    if (!auth) {
      router.push('/admin/login');
    }
  }, [router]);

  const fetchProfitReport = async (start?: string, end?: string, label?: string) => {
    setIsLoading(true);
    try {
      let url = '/api/reports/profits';
      const params = new URLSearchParams();
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
        if (label) {
          setActiveRangeLabel(label);
        } else if (start && end) {
          setActiveRangeLabel(`من تاريخ ${start} إلى تاريخ ${end}`);
        } else if (start) {
          setActiveRangeLabel(`من تاريخ ${start} حتى اليوم`);
        } else if (end) {
          setActiveRangeLabel(`حتى تاريخ ${end}`);
        } else {
          setActiveRangeLabel('جميع الفترات (سجل كامل)');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfitReport();
  }, []);

  const handleCustomFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate && !endDate) {
      fetchProfitReport();
      return;
    }
    fetchProfitReport(startDate, endDate);
  };

  const handleQuickPeriod = (type: 'today' | 'week' | 'month' | 'all') => {
    const now = new Date();
    if (type === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
      fetchProfitReport(todayStr, todayStr, `مبيعات وأرباح اليوم (${todayStr}) 📅`);
    } else if (type === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];
      setStartDate(weekAgo);
      setEndDate(todayStr);
      fetchProfitReport(weekAgo, todayStr, `آخر 7 أيام (من ${weekAgo} إلى ${todayStr}) 📅`);
    } else if (type === 'month') {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];
      setStartDate(firstDayOfMonth);
      setEndDate(todayStr);
      fetchProfitReport(firstDayOfMonth, todayStr, `هذا الشهر (من ${firstDayOfMonth} إلى ${todayStr}) 📅`);
    } else {
      setStartDate(getTodayStr());
      setEndDate(getTodayStr());
      fetchProfitReport(undefined, undefined, 'جميع الفترات (سجل كامل)');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 text-xs">
      
      {/* Title Header */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:border-none print:shadow-none">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <span>تقرير الأرباح وتحليل المبيعات 📊</span>
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-0.5">
            يعتمد التقرير على معادلة: (صافي الربح = سعر البيع الفعلي - سعر التكلفة/الشراء)
          </p>
        </div>

        {/* Print Button */}
        <button
          onClick={handlePrint}
          className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-2 print:hidden"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة التقرير 🖨️</span>
        </button>
      </div>

      {/* DATE RANGE FILTER BAR (تحديد تاريخ من إلى) */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3 print:hidden">
        <div className="flex items-center gap-2 text-slate-800 font-black text-xs">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span>تحديد فترة التقرير (من تاريخ / إلى تاريخ):</span>
        </div>

        <form onSubmit={handleCustomFilter} className="flex flex-wrap items-center gap-3">
          
          {/* Start Date */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600">من تاريخ:</span>
            <input
              type="date"
              dir="ltr"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold font-mono text-slate-900 text-center cursor-pointer focus:outline-none focus:border-brand-blue"
            />
          </div>

          {/* End Date */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-600">إلى تاريخ:</span>
            <input
              type="date"
              dir="ltr"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold font-mono text-slate-900 text-center cursor-pointer focus:outline-none focus:border-brand-blue"
            />
          </div>

          {/* Submit Date Filter */}
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            <span>تطبيق الفترة 🔍</span>
          </button>

          {/* Quick Period Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap mr-auto">
            <button
              type="button"
              onClick={() => handleQuickPeriod('today')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl transition text-[11px]"
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => handleQuickPeriod('week')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl transition text-[11px]"
            >
              آخر 7 أيام
            </button>
            <button
              type="button"
              onClick={() => handleQuickPeriod('month')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl transition text-[11px]"
            >
              هذا الشهر
            </button>
            <button
              type="button"
              onClick={() => handleQuickPeriod('all')}
              className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold px-3 py-1.5 rounded-xl transition text-[11px] flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>كل الفترات</span>
            </button>
          </div>

        </form>

        {/* Current Active Filter Indicator */}
        <div className="flex items-center gap-2 pt-1 text-[11px] text-emerald-800 font-bold bg-emerald-50/70 p-2 rounded-xl border border-emerald-100">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>الفترة المعروضة حالياً: <span className="font-black text-emerald-950">{activeRangeLabel}</span></span>
        </div>
      </div>

      {/* Official Print Header */}
      <div className="hidden print:flex items-center justify-between border-b border-slate-300 pb-3 mb-4">
        <div>
          <EtihadLogo size="sm" />
          <p className="text-[10px] text-slate-500 font-bold mt-0.5">سوق الجملة لتجارة المواد الغذائية والسناكات 🇮🇶</p>
        </div>
        <div className="text-left font-mono">
          <span className="text-sm font-black text-slate-900 block font-sans">تقرير الأرباح والمبيعات 📊</span>
          <span className="text-[11px] text-slate-600 block">الفترة: {activeRangeLabel}</span>
          <span className="text-[10px] text-slate-400">تاريخ الاستخراج: {new Date().toLocaleDateString('ar-IQ')}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-100">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-bold">جاري استخراج وحساب الأرباح للفترة المحددة...</p>
        </div>
      ) : (
        <>
          {/* 4 Financial Indicator Cards */}
          {report && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
              
              {/* 1. Total Sales / Revenue */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>إجمالي المبيعات (Revenue)</span>
                  <Receipt className="w-4 h-4 text-brand-blue" />
                </div>
                <div className="text-2xl font-black font-mono text-slate-900">
                  {report.totalRevenue.toLocaleString()} <span className="text-xs font-bold font-sans text-slate-500">د.ع</span>
                </div>
                <p className="text-[10px] text-slate-400 font-bold">
                  من إجمالي {report.totalOrders} طلبية
                </p>
              </div>

              {/* 2. Total Cost / COGS */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>إجمالي تكلفة البضاعة (COGS)</span>
                  <Package className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-2xl font-black font-mono text-slate-700">
                  {report.totalCost.toLocaleString()} <span className="text-xs font-bold font-sans text-slate-500">د.ع</span>
                </div>
                <p className="text-[10px] text-slate-400 font-bold">
                  محسوبة بدقة من أسعار الشراء والتكلفة
                </p>
              </div>

              {/* 3. Gross Profit (صافي الربح) */}
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-3xl shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-white/90">
                  <span>صافي الأرباح المحققة</span>
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="text-2xl font-black font-mono">
                  {report.grossProfit.toLocaleString()} <span className="text-xs font-bold font-sans">د.ع</span>
                </div>
                <p className="text-[10px] text-white/80 font-bold">
                  المبيعات - سعر التكلفة والشراء
                </p>
              </div>

              {/* 4. Profit Margin % */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                  <span>نسبة هامش الربح الإجمالي</span>
                  <Percent className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black font-mono text-emerald-700">
                  %{report.marginPercentage}
                </div>
                <p className="text-[10px] text-emerald-600/80 font-bold">
                  متوسط العائد على المبيعات
                </p>
              </div>

            </div>
          )}

          {/* Order-by-Order Profits Table */}
          {report && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-blue" />
                  <span>أرباح الطلبيات والفواتير بالتفصيل ({report.ordersBreakdown.length})</span>
                </h2>
                <span className="text-[11px] text-slate-500 font-bold">كل طلبية مع تكلفة الشراء وصافي ربحها</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 text-[11px] font-black border-y border-slate-200">
                    <tr className="divide-x divide-x-reverse divide-slate-200">
                      <th className="py-3 px-4">رقم الطلبية</th>
                      <th className="py-3 px-4">التاريخ</th>
                      <th className="py-3 px-4">الزبون</th>
                      <th className="py-3 px-4 text-center">القطع</th>
                      <th className="py-3 px-4 text-left">قيمة البيع</th>
                      <th className="py-3 px-4 text-left">تكلفة الشراء</th>
                      <th className="py-3 px-4 text-left">صافي الربح</th>
                      <th className="py-3 px-4 text-center">هامش الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.ordersBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 font-bold">
                          لا توجد مبيعات في الفترة المحددة
                        </td>
                      </tr>
                    ) : (
                      report.ordersBreakdown.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition divide-x divide-x-reverse divide-slate-100">
                          <td className="py-3 px-4 font-mono font-bold text-brand-blue" dir="ltr">
                            #{item.orderNumber}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {new Date(item.date).toLocaleDateString('en-GB')}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {item.customerName}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                            {item.itemsCount}
                          </td>
                          <td className="py-3 px-4 text-left font-mono font-bold text-slate-900 whitespace-nowrap">
                            {item.totalRevenue.toLocaleString()} د.ع
                          </td>
                          <td className="py-3 px-4 text-left font-mono font-bold text-slate-500 whitespace-nowrap">
                            {item.totalCost.toLocaleString()} د.ع
                          </td>
                          <td className="py-3 px-4 text-left font-mono font-black text-emerald-700 whitespace-nowrap">
                            +{item.grossProfit.toLocaleString()} د.ع
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                              %{item.marginPercentage}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Product-by-Product Profit Table */}
          {report && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <span>أرباح المنتجات الأكثر مبيعاً ومساهمة في الربح ({report.productsBreakdown.length})</span>
                </h2>
                <span className="text-[11px] text-slate-500 font-bold">مرتبة حسب أعلى صافي ربح</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 text-[11px] font-black border-y border-slate-200">
                    <tr className="divide-x divide-x-reverse divide-slate-200">
                      <th className="py-3 px-4">المنتج والتصنيف</th>
                      <th className="py-3 px-4 text-center">الكمية المباعة</th>
                      <th className="py-3 px-4 text-left">سعر الشراء / التكلفة</th>
                      <th className="py-3 px-4 text-left">إجمالي المبيعات</th>
                      <th className="py-3 px-4 text-left">إجمالي التكلفة</th>
                      <th className="py-3 px-4 text-left">صافي الأرباح</th>
                      <th className="py-3 px-4 text-center">نسبة الهامش</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.productsBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
                          لا توجد منتجات مباعة في الفترة المحددة
                        </td>
                      </tr>
                    ) : (
                      report.productsBreakdown.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition divide-x divide-x-reverse divide-slate-100">
                          <td className="py-3 px-4">
                            <span className="font-black text-slate-900 block">{p.productName}</span>
                            <span className="text-[10px] text-slate-400 font-bold">{p.category}</span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                            {p.unitsSold}
                          </td>
                          <td className="py-3 px-4 text-left font-mono font-bold text-slate-600 whitespace-nowrap">
                            {p.costPrice.toLocaleString()} د.ع
                          </td>
                          <td className="py-3 px-4 text-left font-mono font-bold text-slate-900 whitespace-nowrap">
                            {p.totalRevenue.toLocaleString()} د.ع
                          </td>
                          <td className="py-3 px-4 text-left font-mono font-bold text-slate-500 whitespace-nowrap">
                            {p.totalCost.toLocaleString()} د.ع
                          </td>
                          <td className="py-3 px-4 text-left font-mono font-black text-emerald-700 whitespace-nowrap">
                            +{p.grossProfit.toLocaleString()} د.ع
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                              %{p.marginPercentage}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
