'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Receipt,
  Sparkles,
  Search,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Scale,
  ShieldAlert,
  Clock,
  RefreshCw,
  ArrowDownRight,
  ArrowUpRight,
  Eye
} from 'lucide-react';
import {
  ProfitReportSummary,
  InventoryReportSummary,
  DailyReconciliationSummary,
  InventoryMovementItem
} from '@/types';
import EtihadLogo from '@/components/EtihadLogo';

type ReportTab = 'inventory' | 'expiry' | 'reconciliation' | 'statements' | 'profits';

interface AccountSummary {
  userId: string;
  name: string;
  businessName?: string;
  phone: string;
  category: 'customer' | 'supplier' | 'employee' | 'driver' | string;
  remainingBalance: number;
  totalInvoiced: number;
  totalPaid: number;
}

export default function AdminReportsPage() {
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [activeTab, setActiveTab] = useState<ReportTab>('inventory');
  const router = useRouter();

  // Date States
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [reconciliationDate, setReconciliationDate] = useState(getTodayStr());
  const [activeRangeLabel, setActiveRangeLabel] = useState('اليوم');

  // Loading States
  const [isLoading, setIsLoading] = useState(false);

  // Data States
  const [profitReport, setProfitReport] = useState<ProfitReportSummary | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryReportSummary | null>(null);
  const [reconciliationReport, setReconciliationReport] = useState<DailyReconciliationSummary | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);

  // Search & Filter within tabs
  const [inventoryView, setInventoryView] = useState<'best' | 'lowest' | 'all'>('best');
  const [inventorySearch, setInventorySearch] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expired' | 'warning' | 'valid'>('all');
  const [expirySearch, setExpirySearch] = useState('');
  const [statementSearch, setStatementSearch] = useState('');
  const [statementType, setStatementType] = useState<'all' | 'customer' | 'supplier'>('all');

  // Check auth
  useEffect(() => {
    const auth = localStorage.getItem('etihad_admin_auth');
    if (!auth) {
      router.push('/admin/login');
    }
  }, [router]);

  // Fetch functions
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
        setProfitReport(data.report);
        if (label) setActiveRangeLabel(label);
        else if (start && end) setActiveRangeLabel(`من ${start} إلى ${end}`);
        else setActiveRangeLabel('جميع الفترات');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInventoryReport = async (start?: string, end?: string, label?: string) => {
    setIsLoading(true);
    try {
      let url = '/api/reports/inventory';
      const params = new URLSearchParams();
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.report) {
        setInventoryReport(data.report);
        if (label) setActiveRangeLabel(label);
        else if (start && end) setActiveRangeLabel(`من ${start} إلى ${end}`);
        else setActiveRangeLabel('جميع الفترات');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchReconciliationReport = async (dateStr: string) => {
    setIsLoading(true);
    try {
      const url = `/api/reports/reconciliation?date=${encodeURIComponent(dateStr)}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.report) {
        setReconciliationReport(data.report);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounting/accounts', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchInventoryReport(startDate, endDate, 'اليوم');
    fetchProfitReport(startDate, endDate, 'اليوم');
    fetchReconciliationReport(reconciliationDate);
    fetchAccounts();
  }, []);

  // Quick Period handlers for Inventory & Profits
  const handleQuickPeriod = (type: 'today' | 'week' | 'month' | 'all') => {
    const now = new Date();
    if (type === 'today') {
      const todayStr = getTodayStr();
      setStartDate(todayStr);
      setEndDate(todayStr);
      fetchInventoryReport(todayStr, todayStr, 'اليوم');
      fetchProfitReport(todayStr, todayStr, 'اليوم');
    } else if (type === 'week') {
      const start = new Date();
      start.setDate(now.getDate() - 7);
      const startStr = start.toISOString().split('T')[0];
      const endStr = now.toISOString().split('T')[0];
      setStartDate(startStr);
      setEndDate(endStr);
      fetchInventoryReport(startStr, endStr, 'آخر 7 أيام');
      fetchProfitReport(startStr, endStr, 'آخر 7 أيام');
    } else if (type === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const startStr = start.toISOString().split('T')[0];
      const endStr = now.toISOString().split('T')[0];
      setStartDate(startStr);
      setEndDate(endStr);
      fetchInventoryReport(startStr, endStr, 'هذا الشهر');
      fetchProfitReport(startStr, endStr, 'هذا الشهر');
    } else {
      setStartDate('');
      setEndDate('');
      fetchInventoryReport(undefined, undefined, 'جميع الفترات (سجل كامل)');
      fetchProfitReport(undefined, undefined, 'جميع الفترات (سجل كامل)');
    }
  };

  const handleCustomFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInventoryReport(startDate || undefined, endDate || undefined);
    fetchProfitReport(startDate || undefined, endDate || undefined);
  };

  const handleReconciliationFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (reconciliationDate) {
      fetchReconciliationReport(reconciliationDate);
    }
  };

  // Inventory filtered items for display
  const displayedInventory = useMemo(() => {
    if (!inventoryReport) return [];
    let list: InventoryMovementItem[] = inventoryReport.allInventory || [];
    if (inventoryView === 'best') list = inventoryReport.bestSellers || [];
    else if (inventoryView === 'lowest') list = inventoryReport.lowestSellers || [];

    if (inventorySearch.trim()) {
      const q = inventorySearch.toLowerCase().trim();
      list = list.filter(item =>
        item.productName.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.company && item.company.toLowerCase().includes(q))
      );
    }
    return list;
  }, [inventoryReport, inventoryView, inventorySearch]);

  // Expiry filtered items for display
  const displayedExpiry = useMemo(() => {
    if (!inventoryReport) return [];
    let list: InventoryMovementItem[] = inventoryReport.allInventory || [];

    if (expiryFilter === 'expired') {
      list = list.filter(i => i.expiryStatus === 'expired');
    } else if (expiryFilter === 'warning') {
      list = list.filter(i => i.expiryStatus === 'warning');
    } else if (expiryFilter === 'valid') {
      list = list.filter(i => i.expiryStatus === 'valid');
    } else {
      list = list.filter(i => !!i.expiryDate);
    }

    if (expirySearch.trim()) {
      const q = expirySearch.toLowerCase().trim();
      list = list.filter(item =>
        item.productName.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.company && item.company.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => (a.daysUntilExpiry ?? 9999) - (b.daysUntilExpiry ?? 9999));
  }, [inventoryReport, expiryFilter, expirySearch]);

  // Statements Analysis
  const statementsSummary = useMemo(() => {
    const customerAccounts = accounts.filter(a => a.category !== 'supplier');
    const supplierAccounts = accounts.filter(a => a.category === 'supplier');

    const totalCustomerDebt = customerAccounts.reduce((sum, a) => sum + Math.max(0, a.remainingBalance), 0);
    const totalSupplierDebt = supplierAccounts.reduce((sum, a) => sum + Math.max(0, a.remainingBalance), 0);

    let filtered = accounts.filter(a => a.remainingBalance !== 0);
    if (statementType === 'customer') filtered = customerAccounts.filter(a => a.remainingBalance !== 0);
    else if (statementType === 'supplier') filtered = supplierAccounts.filter(a => a.remainingBalance !== 0);

    if (statementSearch.trim()) {
      const q = statementSearch.toLowerCase().trim();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.phone.toLowerCase().includes(q) ||
        (item.businessName && item.businessName.toLowerCase().includes(q))
      );
    }

    return {
      totalCustomerDebt,
      totalSupplierDebt,
      filtered: filtered.sort((a, b) => Math.abs(b.remainingBalance) - Math.abs(a.remainingBalance))
    };
  }, [accounts, statementType, statementSearch]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16 text-right font-sans" dir="rtl">
      {/* Printable Watermark / Header */}
      <div className="hidden print:block text-center border-b pb-4 mb-6">
        <div className="flex items-center justify-between">
          <EtihadLogo size="lg" />
          <div>
            <h1 className="text-2xl font-black text-slate-800">مجمع أسواق الاتحاد للمواد الغذائية والمنزلية</h1>
            <p className="text-sm text-slate-500 font-bold">تقرير إداري شامل ومفصل - نظام الإدارة المركزي</p>
          </div>
          <div className="text-xs text-slate-600 font-bold text-left">
            <div>التاريخ: {new Date().toLocaleDateString('ar-IQ')}</div>
            <div>الوقت: {new Date().toLocaleTimeString('ar-IQ')}</div>
          </div>
        </div>
      </div>

      {/* Screen Header */}
      <div className="bg-slate-900 text-white shadow-lg sticky top-0 z-30 print:hidden border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700"
                title="العودة للوحة التحكم"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="p-2 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white flex items-center gap-2">
                  مركز التقارير والمطابقات الشاملة
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    مباشر ومحدث
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  تقارير حركة المخزون، الصلاحيات، المطابقة اليومية للصندوق، كشوفات الحساب، وتحليل الأرباح
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-bold text-sm transition shadow-sm"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                طباعة التقرير A4
              </button>
              <button
                onClick={() => {
                  fetchInventoryReport(startDate, endDate);
                  fetchProfitReport(startDate, endDate);
                  fetchReconciliationReport(reconciliationDate);
                  fetchAccounts();
                }}
                disabled={isLoading}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition"
                title="تحديث البيانات"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 scrollbar-none border-t border-slate-800 pt-3">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition whitespace-nowrap ${
                activeTab === 'inventory'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
              }`}
            >
              <Package className="w-4 h-4" />
              حركة المخزن (الأكثر والأقل مبيعاً)
            </button>

            <button
              onClick={() => setActiveTab('expiry')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition whitespace-nowrap ${
                activeTab === 'expiry'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20 font-black'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              تاريخ الصلاحية وتنبيهات المخزون
              {inventoryReport && (inventoryReport.expiredCount + inventoryReport.nearExpiryCount) > 0 && (
                <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                  {inventoryReport.expiredCount + inventoryReport.nearExpiryCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('reconciliation')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition whitespace-nowrap ${
                activeTab === 'reconciliation'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20 font-black'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
              }`}
            >
              <Scale className="w-4 h-4" />
              المطابقة اليومية للصندوق (181)
            </button>

            <button
              onClick={() => setActiveTab('statements')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition whitespace-nowrap ${
                activeTab === 'statements'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
              }`}
            >
              <Receipt className="w-4 h-4" />
              كشوفات الحسابات والديون
            </button>

            <button
              onClick={() => setActiveTab('profits')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition whitespace-nowrap ${
                activeTab === 'profits'
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20 font-black'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              الأرباح والمبيعات
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ========================================================================= */}
        {/* TAB 1: INVENTORY REPORT (الأكثر والأقل مبيعاً والراكد) */}
        {/* ========================================================================= */}
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            {/* Filters Bar */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 print:hidden space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-700 font-black text-sm">
                  <Filter className="w-4 h-4 text-amber-500" />
                  <span>تحديد فترة تقرير حركة المخزن:</span>
                  <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-200">
                    {activeRangeLabel}
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <button
                    onClick={() => handleQuickPeriod('today')}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-amber-500 hover:text-slate-950 transition border border-slate-200"
                  >
                    اليوم
                  </button>
                  <button
                    onClick={() => handleQuickPeriod('week')}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-amber-500 hover:text-slate-950 transition border border-slate-200"
                  >
                    آخر 7 أيام
                  </button>
                  <button
                    onClick={() => handleQuickPeriod('month')}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-amber-500 hover:text-slate-950 transition border border-slate-200"
                  >
                    هذا الشهر
                  </button>
                  <button
                    onClick={() => handleQuickPeriod('all')}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-amber-500 hover:text-slate-950 transition border border-slate-200"
                  >
                    سجل كامل
                  </button>
                </div>
              </div>

              {/* Custom Date Form */}
              <form onSubmit={handleCustomFilter} className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600">من تاريخ:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-xl px-3 py-2 font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600">إلى تاريخ:</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-xl px-3 py-2 font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl transition shadow-sm"
                >
                  تطبيق الفلترة
                </button>
              </form>
            </div>

            {/* Inventory KPI Cards */}
            {inventoryReport && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500">إجمالي كمية المخزون الحالي</p>
                      <h3 className="text-2xl font-black text-slate-900 mt-1">
                        {inventoryReport.totalStockUnits.toLocaleString()} <span className="text-xs font-bold text-slate-400">قطعة / كرتون</span>
                      </h3>
                    </div>
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-2 h-full bg-blue-500" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500">قيمة بضاعة المخزن (سعر الجملة)</p>
                      <h3 className="text-2xl font-black text-blue-700 mt-1">
                        {inventoryReport.totalStockValueWholesale.toLocaleString()} <span className="text-xs font-bold text-slate-400">د.ع</span>
                      </h3>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                      <DollarSign className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-2 h-full bg-amber-500" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500">المنتجات الأكثر مبيعاً بالفترة</p>
                      <h3 className="text-2xl font-black text-amber-700 mt-1">
                        {inventoryReport.bestSellers.length} <span className="text-xs font-bold text-slate-400">صنف نشط</span>
                      </h3>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                      <Sparkles className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-2 h-full bg-rose-500" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500">المنتجات الراكدة / عديمة الحركة</p>
                      <h3 className="text-2xl font-black text-rose-700 mt-1">
                        {inventoryReport.lowestSellers.filter(i => i.totalEquivalentSoldPieces === 0).length} <span className="text-xs font-bold text-slate-400">صنف راكد</span>
                      </h3>
                    </div>
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                      <Clock className="w-6 h-6" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Inventory Table Tabs & Search */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInventoryView('best')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      inventoryView === 'best'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    🔥 الأكثر مبيعاً (Best Sellers)
                  </button>
                  <button
                    onClick={() => setInventoryView('lowest')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      inventoryView === 'lowest'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    ❄️ الأقل مبيعاً والراكد (Stagnant Stock)
                  </button>
                  <button
                    onClick={() => setInventoryView('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      inventoryView === 'all'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    📋 كل المواد ({inventoryReport?.allInventory.length || 0})
                  </button>
                </div>

                <div className="w-full sm:w-64 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="بحث باسم المنتج أو القسم أو الشركة..."
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 text-xs rounded-xl font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5 text-center w-12">#</th>
                      <th className="p-3.5">المنتج / الصنف</th>
                      <th className="p-3.5">القسم / الشركة</th>
                      <th className="p-3.5 text-center">المبيعات (مكافئ قطع)</th>
                      <th className="p-3.5 text-center">المبيعات (كراتين جملة)</th>
                      <th className="p-3.5 text-left">إجمالي الإيراد</th>
                      <th className="p-3.5 text-center">الرصيد بالمخزن حالياً</th>
                      <th className="p-3.5 text-center">حالة الحركة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedInventory.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                          لا توجد بيانات مطابقة لخيارات البحث المحددة
                        </td>
                      </tr>
                    ) : (
                      displayedInventory.map((item, idx) => (
                        <tr key={item.productId} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-black text-slate-800">
                            {item.productName}
                          </td>
                          <td className="p-3 text-slate-600 font-bold">
                            {item.category || 'عام'} {item.company ? `- ${item.company}` : ''}
                          </td>
                          <td className="p-3 text-center font-black text-emerald-700 bg-emerald-50/40">
                            {item.totalEquivalentSoldPieces.toLocaleString()}
                          </td>
                          <td className="p-3 text-center font-bold text-blue-700">
                            {item.unitsSoldWholesale} كرتون
                          </td>
                          <td className="p-3 text-left font-black text-slate-900">
                            {item.totalSalesRevenue.toLocaleString()} د.ع
                          </td>
                          <td className="p-3 text-center font-black">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                              item.currentStock <= 0
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : item.currentStock <= 10
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-800'
                            }`}>
                              {item.currentStock}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {item.totalEquivalentSoldPieces > 50 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                                🔥 ممتاز (سريع)
                              </span>
                            ) : item.totalEquivalentSoldPieces > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                                ⚡ متوسط الحركة
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                                ❄️ راكد / لا مبيعات
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: EXPIRY DATES & SHELF-LIFE ALERTS */}
        {/* ========================================================================= */}
        {activeTab === 'expiry' && (
          <div className="space-y-6">
            {/* Expiry Header KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-rose-600">منتجات منتهية الصلاحية بالمخزن</p>
                  <h3 className="text-2xl font-black text-rose-800 mt-1">
                    {inventoryReport?.expiredCount || 0} <span className="text-xs font-bold">صنف</span>
                  </h3>
                </div>
                <div className="p-3 bg-rose-100 text-rose-700 rounded-xl">
                  <ShieldAlert className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-700">تنبيه: تنتهي قريباً (أقل من مدة التنبيه)</p>
                  <h3 className="text-2xl font-black text-amber-900 mt-1">
                    {inventoryReport?.nearExpiryCount || 0} <span className="text-xs font-bold">صنف</span>
                  </h3>
                </div>
                <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-700">إجمالي الأصناف الموثقة بصلاحيات</p>
                  <h3 className="text-2xl font-black text-emerald-900 mt-1">
                    {inventoryReport?.allInventory.filter(i => !!i.expiryDate).length || 0} <span className="text-xs font-bold">من أصل {inventoryReport?.allInventory.length || 0}</span>
                  </h3>
                </div>
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Filter & Search */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpiryFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      expiryFilter === 'all'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    عرض كل المؤرخة ({inventoryReport?.allInventory.filter(i => !!i.expiryDate).length || 0})
                  </button>
                  <button
                    onClick={() => setExpiryFilter('expired')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      expiryFilter === 'expired'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    🔴 منتهية الصلاحية ({inventoryReport?.expiredCount || 0})
                  </button>
                  <button
                    onClick={() => setExpiryFilter('warning')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      expiryFilter === 'warning'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    ⚠️ تنتهي قريباً ({inventoryReport?.nearExpiryCount || 0})
                  </button>
                  <button
                    onClick={() => setExpiryFilter('valid')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      expiryFilter === 'valid'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    🟢 صالحة وسليمة
                  </button>
                </div>

                <div className="w-full sm:w-64 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="بحث باسم المنتج أو الشركة..."
                    value={expirySearch}
                    onChange={(e) => setExpirySearch(e.target.value)}
                    className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 text-xs rounded-xl font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5 text-center w-12">#</th>
                      <th className="p-3.5">اسم المادة / الصنف</th>
                      <th className="p-3.5">القسم / الماركة</th>
                      <th className="p-3.5 text-center">الكمية المتوفرة بالمخزن</th>
                      <th className="p-3.5 text-center">تاريخ الإنتاج</th>
                      <th className="p-3.5 text-center">تاريخ الانتهاء</th>
                      <th className="p-3.5 text-center">الأيام المتبقية</th>
                      <th className="p-3.5 text-center">حالة الصلاحية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedExpiry.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                          لا توجد منتجات مسجلة تطابق هذا الفلتر
                        </td>
                      </tr>
                    ) : (
                      displayedExpiry.map((item, idx) => (
                        <tr key={item.productId} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-black text-slate-800">
                            {item.productName}
                          </td>
                          <td className="p-3 text-slate-600 font-bold">
                            {item.category || 'عام'} {item.company ? `- ${item.company}` : ''}
                          </td>
                          <td className="p-3 text-center font-black">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                              item.currentStock <= 0 ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-700'
                            }`}>
                              {item.currentStock}
                            </span>
                          </td>
                          <td className="p-3 text-center text-slate-600 font-mono">
                            {item.productionDate || '---'}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-slate-900">
                            {item.expiryDate || 'غير محدد'}
                          </td>
                          <td className="p-3 text-center font-bold font-mono">
                            {item.daysUntilExpiry !== undefined ? (
                              item.daysUntilExpiry <= 0 ? (
                                <span className="text-rose-600 font-black">منتهي منذ {Math.abs(item.daysUntilExpiry)} يوم</span>
                              ) : (
                                <span className={item.expiryStatus === 'warning' ? 'text-amber-700 font-black' : 'text-emerald-700 font-bold'}>
                                  متبقي {item.daysUntilExpiry} يوم
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400">---</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {item.expiryStatus === 'expired' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-xs">
                                🔴 منتهي الصلاحية
                              </span>
                            ) : item.expiryStatus === 'warning' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                ⚠️ ينتهي قريباً
                              </span>
                            ) : item.expiryStatus === 'valid' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                🟢 ساري الصلاحية
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                غير مسجل
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: DAILY RECONCILIATION (المطابقة اليومية للصندوق 181 والعهد) */}
        {/* ========================================================================= */}
        {activeTab === 'reconciliation' && (
          <div className="space-y-6">
            {/* Reconciliation Date Selector */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 print:hidden flex flex-wrap items-center justify-between gap-4">
              <form onSubmit={handleReconciliationFilter} className="flex items-center gap-3">
                <label className="text-sm font-black text-slate-700 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  تاريخ المطابقة اليومية:
                </label>
                <input
                  type="date"
                  value={reconciliationDate}
                  onChange={(e) => setReconciliationDate(e.target.value)}
                  className="bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-xl px-3 py-2 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition shadow-sm"
                >
                  عرض مطابقة هذا اليوم
                </button>
              </form>

              <div className="text-xs text-slate-500 font-bold">
                تاريخ العرض: <span className="text-indigo-600 font-black">{reconciliationDate}</span>
              </div>
            </div>

            {reconciliationReport && (
              <>
                {/* Summary Flow Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-slate-400" />
                    <p className="text-xs font-bold text-slate-500">الرصيد الافتتاحي للصندوق (181)</p>
                    <h3 className="text-xl font-black text-slate-800 mt-1">
                      {reconciliationReport.vaultOpeningBalance.toLocaleString()} <span className="text-xs text-slate-400">د.ع</span>
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">رصيد بداية اليوم قبل العمليات</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500" />
                    <p className="text-xs font-bold text-emerald-600">إجمالي الداخل والمقبوضات (+)</p>
                    <h3 className="text-xl font-black text-emerald-700 mt-1">
                      {(reconciliationReport.cashSalesCollected + reconciliationReport.receiptVouchersTotal + reconciliationReport.driverCashTurnover).toLocaleString()} <span className="text-xs text-slate-400">د.ع</span>
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">مبيعات نقدية + سندات قبض + عهد سائقين</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-rose-500" />
                    <p className="text-xs font-bold text-rose-600">إجمالي الخارج والمصروفات (-)</p>
                    <h3 className="text-xl font-black text-rose-700 mt-1">
                      {(reconciliationReport.purchasesCashPaid + reconciliationReport.disbursementVouchersTotal).toLocaleString()} <span className="text-xs text-slate-400">د.ع</span>
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">دفعات مشتريات + سندات صرف ونفقات</p>
                  </div>

                  <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
                    <p className="text-xs font-bold text-indigo-300">الرصيد الختامي المتوقع بالصندوق</p>
                    <h3 className="text-xl font-black text-amber-400 mt-1">
                      {reconciliationReport.vaultClosingBalance.toLocaleString()} <span className="text-xs text-slate-400">د.ع</span>
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">الرصيد الفعلي المتوجب وجوده بنهاية اليوم</p>
                  </div>
                </div>

                {/* Detailed Two-Column Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* INFLOW DETAILS */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-emerald-50/70 p-4 border-b border-emerald-100 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-800 font-black text-sm">
                        <ArrowDownRight className="w-5 h-5 text-emerald-600" />
                        <span>تفاصيل المقبوضات والواردات (Inflow)</span>
                      </div>
                      <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">
                        {(reconciliationReport.cashSalesCollected + reconciliationReport.receiptVouchersTotal + reconciliationReport.driverCashTurnover).toLocaleString()} د.ع
                      </span>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-xs font-black text-slate-800">مبيعات نقدية مباشرة (مباشر)</p>
                          <p className="text-[10px] text-slate-500">عدد الطلبات: {reconciliationReport.ordersCount}</p>
                        </div>
                        <span className="text-sm font-black text-emerald-700">
                          {reconciliationReport.cashSalesCollected.toLocaleString()} د.ع
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-xs font-black text-slate-800">سندات قبض نقدية مسجلة</p>
                          <p className="text-[10px] text-slate-500">عدد السندات: {reconciliationReport.receiptVouchersCount}</p>
                        </div>
                        <span className="text-sm font-black text-emerald-700">
                          {reconciliationReport.receiptVouchersTotal.toLocaleString()} د.ع
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-xs font-black text-slate-800">تحصيلات السائقين وتصفية العهد</p>
                          <p className="text-[10px] text-slate-500">عدد الحركات: {reconciliationReport.driverSettlementsCount}</p>
                        </div>
                        <span className="text-sm font-black text-emerald-700">
                          {reconciliationReport.driverCashTurnover.toLocaleString()} د.ع
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* OUTFLOW DETAILS */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-rose-50/70 p-4 border-b border-rose-100 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-rose-800 font-black text-sm">
                        <ArrowUpRight className="w-5 h-5 text-rose-600" />
                        <span>تفاصيل المدفوعات والمصروفات (Outflow)</span>
                      </div>
                      <span className="text-xs font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg">
                        {(reconciliationReport.purchasesCashPaid + reconciliationReport.disbursementVouchersTotal).toLocaleString()} د.ع
                      </span>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-xs font-black text-slate-800">دفعات فواتير المشتريات للموردين</p>
                          <p className="text-[10px] text-slate-500">عدد الفواتير: {reconciliationReport.purchasesCount}</p>
                        </div>
                        <span className="text-sm font-black text-rose-700">
                          {reconciliationReport.purchasesCashPaid.toLocaleString()} د.ع
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-xs font-black text-slate-800">سندات صرف ومصاريف تشغيلية</p>
                          <p className="text-[10px] text-slate-500">عدد السندات: {reconciliationReport.disbursementVouchersCount}</p>
                        </div>
                        <span className="text-sm font-black text-rose-700">
                          {reconciliationReport.disbursementVouchersTotal.toLocaleString()} د.ع
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Footer */}
                <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-700">
                      تم تدقيق كافة الحركات المسجلة بتأريخ {reconciliationDate} وتطابقها مع الحسابات المحاسبية
                    </span>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="text-xs font-black text-indigo-700 hover:text-indigo-800 underline print:hidden"
                  >
                    طباعة محضر المطابقة اليومية
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: ACCOUNT STATEMENTS & DEBTS (كشوفات الحساب والديون) */}
        {/* ========================================================================= */}
        {activeTab === 'statements' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-500">إجمالي ديون الزبائن والأسواق (لنا بذمتهم)</p>
                <h3 className="text-2xl font-black text-emerald-700 mt-1">
                  {statementsSummary.totalCustomerDebt.toLocaleString()} <span className="text-xs font-bold text-slate-400">د.ع</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">مطلوبة من الأسواق والتجار والزبائن</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-500">إجمالي مستحقات الموردين (لهم بذمتنا)</p>
                <h3 className="text-2xl font-black text-rose-700 mt-1">
                  {statementsSummary.totalSupplierDebt.toLocaleString()} <span className="text-xs font-bold text-slate-400">د.ع</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">واجبة الدفع للشركات والمجهزين</p>
              </div>

              <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-sm">
                <p className="text-xs font-bold text-slate-400">صافي الموقف المالي (الديون - المستحقات)</p>
                <h3 className="text-2xl font-black text-amber-400 mt-1">
                  {(statementsSummary.totalCustomerDebt - statementsSummary.totalSupplierDebt).toLocaleString()} <span className="text-xs text-slate-400">د.ع</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">فارق المديونية الإجمالي</p>
              </div>
            </div>

            {/* Statements List Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStatementType('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      statementType === 'all'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    كل الحسابات
                  </button>
                  <button
                    onClick={() => setStatementType('customer')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      statementType === 'customer'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    👤 كشوفات الزبائن والأسواق
                  </button>
                  <button
                    onClick={() => setStatementType('supplier')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      statementType === 'supplier'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    🏭 كشوفات الموردين والشركات
                  </button>
                </div>

                <div className="w-full sm:w-64 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="بحث باسم الحساب أو الهاتف أو المحل..."
                    value={statementSearch}
                    onChange={(e) => setStatementSearch(e.target.value)}
                    className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 text-xs rounded-xl font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5 text-center w-12">#</th>
                      <th className="p-3.5">اسم العميل / الشركة</th>
                      <th className="p-3.5">النوع</th>
                      <th className="p-3.5">المحل / الهاتف</th>
                      <th className="p-3.5 text-left">إجمالي الفواتير</th>
                      <th className="p-3.5 text-left">إجمالي المسدد</th>
                      <th className="p-3.5 text-left">الرصيد المتبقي</th>
                      <th className="p-3.5 text-center print:hidden">كشف الحساب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statementsSummary.filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                          لا توجد حسابات بذمتها أرصدة أو مطابقة لبحثك
                        </td>
                      </tr>
                    ) : (
                      statementsSummary.filtered.map((item, idx) => (
                        <tr key={item.userId} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-black text-slate-800">{item.name}</td>
                          <td className="p-3 text-slate-600 font-bold">
                            {item.category === 'supplier' ? '🏭 مورد / مجهز' : '👤 زبون / ماركت'}
                          </td>
                          <td className="p-3 text-slate-600 font-mono">
                            {item.businessName ? `${item.businessName} - ${item.phone}` : item.phone}
                          </td>
                          <td className="p-3 text-left text-slate-700 font-bold">
                            {item.totalInvoiced.toLocaleString()} د.ع
                          </td>
                          <td className="p-3 text-left text-emerald-700 font-bold">
                            {item.totalPaid.toLocaleString()} د.ع
                          </td>
                          <td className="p-3 text-left font-black text-sm">
                            <span className={item.remainingBalance > 0 ? (item.category === 'supplier' ? 'text-rose-700' : 'text-amber-700') : 'text-emerald-700'}>
                              {item.remainingBalance.toLocaleString()} د.ع
                            </span>
                          </td>
                          <td className="p-3 text-center print:hidden">
                            <Link
                              href={item.category === 'supplier' ? '/admin/debts' : `/admin/customers/${item.userId}/statement`}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              عرض الكشف
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: PROFITS & SALES (الأرباح والمبيعات) */}
        {/* ========================================================================= */}
        {activeTab === 'profits' && (
          <div className="space-y-6">
            {/* Period Filters */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 print:hidden space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-700 font-black text-sm">
                  <Filter className="w-4 h-4 text-blue-500" />
                  <span>تحديد فترة تقرير الأرباح:</span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-200">
                    {activeRangeLabel}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <button
                    onClick={() => handleQuickPeriod('today')}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white transition border border-slate-200"
                  >
                    اليوم
                  </button>
                  <button
                    onClick={() => handleQuickPeriod('week')}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white transition border border-slate-200"
                  >
                    آخر 7 أيام
                  </button>
                  <button
                    onClick={() => handleQuickPeriod('month')}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white transition border border-slate-200"
                  >
                    هذا الشهر
                  </button>
                  <button
                    onClick={() => handleQuickPeriod('all')}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white transition border border-slate-200"
                  >
                    سجل كامل
                  </button>
                </div>
              </div>

              <form onSubmit={handleCustomFilter} className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600">من تاريخ:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-xl px-3 py-2 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600">إلى تاريخ:</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-xl px-3 py-2 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl transition shadow-sm"
                >
                  تطبيق الفلترة
                </button>
              </form>
            </div>

            {profitReport && (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-blue-500" />
                    <p className="text-xs font-bold text-slate-500">إجمالي المبيعات (الإيراد)</p>
                    <h3 className="text-2xl font-black text-slate-900 mt-1">
                      {profitReport.totalRevenue.toLocaleString()} <span className="text-xs font-bold text-slate-400">د.ع</span>
                    </h3>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-slate-500" />
                    <p className="text-xs font-bold text-slate-500">إجمالي التكلفة (رأس المال)</p>
                    <h3 className="text-2xl font-black text-slate-700 mt-1">
                      {profitReport.totalCost.toLocaleString()} <span className="text-xs font-bold text-slate-400">د.ع</span>
                    </h3>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500" />
                    <p className="text-xs font-bold text-slate-500">صافي الأرباح المحققة</p>
                    <h3 className="text-2xl font-black text-emerald-700 mt-1">
                      {profitReport.grossProfit.toLocaleString()} <span className="text-xs font-bold text-slate-400">د.ع</span>
                    </h3>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full bg-amber-500" />
                    <p className="text-xs font-bold text-slate-500">هامش الربح الإجمالي</p>
                    <h3 className="text-2xl font-black text-amber-700 mt-1">
                      {profitReport.marginPercentage.toFixed(1)} %
                    </h3>
                  </div>
                </div>

                {/* Orders Breakdown List */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      سجل طلبات وفواتير المبيعات خلال الفترة ({profitReport.ordersBreakdown?.length || 0} طلب)
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-3.5">رقم الطلب</th>
                          <th className="p-3.5">الزبون</th>
                          <th className="p-3.5">التاريخ والوقت</th>
                          <th className="p-3.5 text-left">قيمة الفاتورة</th>
                          <th className="p-3.5 text-left">التكلفة</th>
                          <th className="p-3.5 text-left">الربح المحقق</th>
                          <th className="p-3.5 text-center">النسبة %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(!profitReport.ordersBreakdown || profitReport.ordersBreakdown.length === 0) ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                              لا توجد فواتير مبيعات مسجلة في هذه الفترة
                            </td>
                          </tr>
                        ) : (
                          profitReport.ordersBreakdown.map((inv) => (
                            <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                              <td className="p-3 font-mono font-bold text-slate-700">{inv.orderNumber}</td>
                              <td className="p-3 font-bold text-slate-900">{inv.customerName}</td>
                              <td className="p-3 text-slate-500 font-mono">
                                {new Date(inv.date).toLocaleString('ar-IQ')}
                              </td>
                              <td className="p-3 text-left font-black text-slate-900">
                                {inv.totalRevenue.toLocaleString()} د.ع
                              </td>
                              <td className="p-3 text-left text-slate-500 font-bold">
                                {inv.totalCost.toLocaleString()} د.ع
                              </td>
                              <td className="p-3 text-left font-black text-emerald-700">
                                {inv.grossProfit.toLocaleString()} د.ع
                              </td>
                              <td className="p-3 text-center font-bold text-slate-600">
                                {inv.marginPercentage.toFixed(1)}%
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
