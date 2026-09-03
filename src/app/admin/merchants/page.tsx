'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Store,
  Check,
  X,
  MessageCircle,
  Search,
  RefreshCw,
  Clock,
  MapPin,
  Building,
  Award,
  Crown,
  Star,
  UserCheck,
  Eye,
  ArrowRightLeft,
  Users,
  User,
  ShoppingBag,
  Phone,
  Copy,
  CheckCircle2,
  FileText,
  Filter,
  Sparkles,
  Send,
  BellRing,
  Key,
  Lock
} from 'lucide-react';
import { CustomerWithStats, MerchantStatus, MerchantTier, AccountType } from '@/types';

export default function AdminMerchantsPage() {
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'wholesale' | 'market' | 'retail'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [purchaseFilter, setPurchaseFilter] = useState<'all' | 'purchased' | 'never_purchased'>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [notifyCustomer, setNotifyCustomer] = useState<{ customer: CustomerWithStats; status: MerchantStatus } | null>(null);
  const [copiedNotifyMsg, setCopiedNotifyMsg] = useState(false);

  // Customer Password Reset Modal
  const [passwordModalCustomer, setPasswordModalCustomer] = useState<CustomerWithStats | null>(null);
  const [resetCustomerPassword, setResetCustomerPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Add New Customer / Merchant Modal State
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAccountType, setNewCustomerAccountType] = useState<AccountType>('market');
  const [newCustomerBusinessName, setNewCustomerBusinessName] = useState('');
  const [newCustomerBusinessType, setNewCustomerBusinessType] = useState('ميني ماركت وبقالة');
  const [newCustomerCity, setNewCustomerCity] = useState('كربلاء المقدسة');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerPasswordVal, setNewCustomerPasswordVal] = useState('123456');
  const [isSubmittingNewCustomer, setIsSubmittingNewCustomer] = useState(false);
  const [addCustomerError, setAddCustomerError] = useState('');

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      setAddCustomerError('يرجى إدخال اسم الزبون ورقم الهاتف');
      return;
    }

    setAddCustomerError('');
    setIsSubmittingNewCustomer(true);
    try {
      const res = await fetch('/api/admin/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim(),
          accountType: newCustomerAccountType,
          businessName: newCustomerBusinessName.trim() || undefined,
          businessType: newCustomerBusinessType.trim() || undefined,
          city: newCustomerCity.trim() || 'كربلاء المقدسة',
          address: newCustomerAddress.trim() || 'مركز المدينة',
          password: newCustomerPasswordVal.trim() || '123456',
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        fetchCustomers();
        setIsAddCustomerModalOpen(false);
        // Reset form
        setNewCustomerName('');
        setNewCustomerPhone('');
        setNewCustomerBusinessName('');
        setNewCustomerAddress('');
        setNewCustomerPasswordVal('123456');
      } else {
        setAddCustomerError(data.error || 'حدث خطأ أثناء إضافة الزبون');
      }
    } catch (err: any) {
      console.error(err);
      setAddCustomerError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setIsSubmittingNewCustomer(false);
    }
  };

  const fetchCustomers = () => {
    setIsLoading(true);
    fetch('/api/admin/merchants', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCustomers(data.merchants || []);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleUpdateStatus = async (targetCustomer: CustomerWithStats, status: MerchantStatus) => {
    setUpdatingId(targetCustomer.id);
    try {
      const res = await fetch('/api/admin/merchants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetCustomer.id, status }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setCustomers((prev) => prev.map((m) => (m.id === targetCustomer.id ? { ...m, ...data.user } : m)));
        // Open the WhatsApp notification modal to notify customer
        setNotifyCustomer({
          customer: { ...targetCustomer, ...data.user },
          status: status,
        });
      }
    } catch (e) {
      console.error(e);
    }
    setUpdatingId(null);
  };

  const handleUpdateTier = async (userId: string, tier: MerchantTier) => {
    setUpdatingId(userId);
    try {
      const res = await fetch('/api/admin/merchants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tier }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setCustomers((prev) => prev.map((m) => (m.id === userId ? { ...m, ...data.user } : m)));
      }
    } catch (e) {
      console.error(e);
    }
    setUpdatingId(null);
  };

  const handleUpdateAccountType = async (userId: string, accountType: AccountType, tier?: MerchantTier) => {
    setUpdatingId(userId);
    try {
      const res = await fetch('/api/admin/merchants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, accountType, tier }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setCustomers((prev) => prev.map((m) => (m.id === userId ? { ...m, ...data.user } : m)));
      }
    } catch (e) {
      console.error(e);
    }
    setUpdatingId(null);
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const handleResetCustomerPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalCustomer || !resetCustomerPassword.trim()) return;

    setIsResettingPassword(true);
    try {
      const res = await fetch('/api/admin/merchants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: passwordModalCustomer.id,
          password: resetCustomerPassword.trim(),
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setCustomers((prev) => prev.map((m) => (m.id === passwordModalCustomer.id ? { ...m, ...data.user } : m)));
        
        // Open WhatsApp to send the new password to customer
        const targetPhone = passwordModalCustomer.phone.replace(/\D/g, '');
        const waPhone = targetPhone.startsWith('07') ? '964' + targetPhone.substring(1) : targetPhone;
        const msg = `مرحباً ${passwordModalCustomer.name} 🌸، تم تعيين كلمة مرور جديدة لحسابك في متجر سوق الجملة بنجاح:\n\n🔐 كلمة المرور الجديدة: ${resetCustomerPassword.trim()}\n📱 رقم الهاتف: ${passwordModalCustomer.phone}\n\nيمكنك الآن تسجيل الدخول مباشرة عبر: https://souq-aljumla.iq/login`;
        window.open(`https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(msg)}`, '_blank');
        
        setPasswordModalCustomer(null);
        setResetCustomerPassword('');
      }
    } catch (err) {
      console.error(err);
    }
    setIsResettingPassword(false);
  };

  // Helper to normalize arabic numbers to english for search
  const normalizeDigits = (str: string) => {
    const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    return str.replace(/[٠-٩]/g, (w) => arabicDigits.indexOf(w).toString()).replace(/\D/g, '');
  };

  const filteredCustomers = customers.filter((c) => {
    // 1. Type Filter
    const isWholesale = c.accountType === 'wholesale' || c.accountType === 'merchant' || (c.role === 'merchant' && c.accountType !== 'market');
    const isMarket = c.accountType === 'market';
    const isRetail = !isWholesale && !isMarket;

    if (typeFilter === 'wholesale' && !isWholesale) return false;
    if (typeFilter === 'market' && !isMarket) return false;
    if (typeFilter === 'retail' && !isRetail) return false;

    // 2. Status Filter
    if (statusFilter !== 'all') {
      if (c.merchantStatus !== statusFilter) return false;
    }

    // 3. Purchase Activity Filter
    if (purchaseFilter === 'purchased' && (!c.totalOrdersCount || c.totalOrdersCount === 0)) return false;
    if (purchaseFilter === 'never_purchased' && c.totalOrdersCount && c.totalOrdersCount > 0) return false;

    // 4. Tier Filter (for wholesale)
    if (typeFilter === 'wholesale' || tierFilter !== 'all') {
      const currentTier = c.merchantTier || 'bronze';
      if (tierFilter !== 'all' && currentTier !== tierFilter) return false;
    }

    // 5. Smart Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const qDigits = normalizeDigits(q);

      const nameMatch = c.name?.toLowerCase().includes(q);
      const businessMatch = c.businessName?.toLowerCase().includes(q);
      const cityMatch = c.city?.toLowerCase().includes(q);
      const addressMatch = c.address?.toLowerCase().includes(q);
      
      const phoneClean = normalizeDigits(c.phone || '');
      const phoneMatch = qDigits ? phoneClean.includes(qDigits) : c.phone?.includes(q);

      if (!nameMatch && !businessMatch && !cityMatch && !addressMatch && !phoneMatch) {
        return false;
      }
    }

    return true;
  });

  // KPI Counts
  const totalCount = customers.length;
  const wholesaleCount = customers.filter((c) => c.accountType === 'wholesale' || c.accountType === 'merchant' || (c.role === 'merchant' && c.accountType !== 'market')).length;
  const marketCount = customers.filter((c) => c.accountType === 'market').length;
  const retailCount = customers.filter((c) => c.accountType !== 'wholesale' && c.accountType !== 'merchant' && c.accountType !== 'market' && c.role !== 'merchant').length;
  
  const pendingCount = customers.filter((c) => c.merchantStatus === 'pending').length;
  const purchasedCount = customers.filter((c) => (c.totalOrdersCount || 0) > 0).length;
  const neverPurchasedCount = totalCount - purchasedCount;

  return (
    <div className="space-y-5 text-xs pb-10">
      
      {/* Top Pending Alert Notification */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0 animate-bounce">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-xs sm:text-sm">
                تنبيه: يوجد {pendingCount} حسابات بانتظار المراجعة والاعتماد! ⏳
              </h3>
              <p className="text-[11px] text-slate-600 font-bold mt-0.5">
                يمكنك مراجعة الحسابات واعتمادها مباشرة من القائمة المنسدلة لإرسال إشعار التفعيل للزبون.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setStatusFilter('pending');
              setTypeFilter('all');
            }}
            className="bg-amber-500 hover:bg-amber-600 text-white font-black text-xs py-2 px-3.5 rounded-xl shrink-0 shadow-xs transition cursor-pointer"
          >
            عرض الطلبات المعلقة ({pendingCount}) ⚡
          </button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold">إجمالي المسجلين</span>
            <Users className="w-4 h-4 text-brand-blue" />
          </div>
          <span className="text-lg font-black text-slate-900 font-mono block">
            {totalCount} <span className="text-[10px] font-bold text-slate-400">حساب</span>
          </span>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-white p-3.5 rounded-2xl border border-amber-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-800">
            <span className="text-[11px] font-black">كبار التجار 👑</span>
            <Crown className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-lg font-black text-amber-950 font-mono block">
            {wholesaleCount} <span className="text-[10px] font-bold text-amber-600">تاجر</span>
          </span>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-white p-3.5 rounded-2xl border border-emerald-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-[11px] font-black">أصحاب الماركتات 🏪</span>
            <Store className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-lg font-black text-emerald-950 font-mono block">
            {marketCount} <span className="text-[10px] font-bold text-emerald-600">ماركت</span>
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold">زبائن المفرد 👤</span>
            <User className="w-4 h-4 text-sky-600" />
          </div>
          <span className="text-lg font-black text-slate-800 font-mono block">
            {retailCount} <span className="text-[10px] font-bold text-slate-400">زبون</span>
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold">اشتروا 🛒</span>
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-lg font-black text-emerald-700 font-mono block">
            {purchasedCount} <span className="text-[10px] font-bold text-slate-400">مشترين</span>
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold">لم يطلبوا بعد ⏳</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-lg font-black text-slate-700 font-mono block">
            {neverPurchasedCount} <span className="text-[10px] font-bold text-slate-400">حساب</span>
          </span>
        </div>
      </div>

      {/* Primary Classification Tabs */}
      <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1.5 border border-slate-200 flex-wrap sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setTypeFilter('all')}
          className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
            typeFilter === 'all'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white/80'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>الكل ({totalCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setTypeFilter('wholesale')}
          className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
            typeFilter === 'wholesale'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white/80'
          }`}
        >
          <Crown className="w-3.5 h-3.5 text-amber-200" />
          <span>👑 كبار التجار ({wholesaleCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setTypeFilter('market')}
          className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
            typeFilter === 'market'
              ? 'bg-[#1b4332] text-white shadow-sm'
              : 'text-slate-700 hover:bg-white/80'
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          <span>🏪 أصحاب الماركتات ({marketCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setTypeFilter('retail')}
          className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
            typeFilter === 'retail'
              ? 'bg-sky-700 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white/80'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>👤 الزبائن العاديين ({retailCount})</span>
        </button>
      </div>

      {/* Smart Search & Filters Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 بحث ذكي: اسم، هاتف (077...)، ماركت، محافظة..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-9 pl-4 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-brand-blue transition shadow-inner"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto scrollbar-none flex-wrap">
          
          {/* Purchase Status Filter */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl gap-1">
            <button
              onClick={() => setPurchaseFilter('all')}
              className={`px-2 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                purchaseFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setPurchaseFilter('purchased')}
              className={`px-2 py-1 rounded-lg text-[10px] font-black transition cursor-pointer flex items-center gap-1 ${
                purchaseFilter === 'purchased' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              <ShoppingBag className="w-3 h-3" />
              <span>اشتروا ({purchasedCount})</span>
            </button>
            <button
              onClick={() => setPurchaseFilter('never_purchased')}
              className={`px-2 py-1 rounded-lg text-[10px] font-black transition cursor-pointer flex items-center gap-1 ${
                purchaseFilter === 'never_purchased' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600 hover:text-amber-700'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>لم يشتروا ({neverPurchasedCount})</span>
            </button>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-blue cursor-pointer"
          >
            <option value="all">كافة حالات الاعتماد</option>
            <option value="approved">معتمد ومفعل ✓</option>
            <option value="pending">غير معتمد / قيد المراجعة ⏳</option>
            <option value="rejected">مرفوض ✕</option>
          </select>

          {/* Tier Filter */}
          {typeFilter === 'wholesale' && (
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="bg-amber-50 border border-amber-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-amber-950 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">كل رتب التجار</option>
              <option value="gold">👑 ذهبي VIP 🥇</option>
              <option value="silver">⭐ فضي خاص 🥈</option>
              <option value="bronze">🥉 برونزي جملة</option>
            </select>
          )}

          {/* Add Customer Button */}
          <button
            type="button"
            onClick={() => setIsAddCustomerModalOpen(true)}
            className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-black py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md shrink-0"
          >
            <UserCheck className="w-4 h-4" />
            <span>+ إضافة زبون / تاجر جديد 👤</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchCustomers}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-xl transition flex items-center gap-1 cursor-pointer shrink-0"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

        </div>

      </div>

      {/* Customers Table with 100% Fit Dimensions (No horizontal scroll on desktop) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-bold">جاري استدعاء سجل ودليل الزبائن...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-14 text-center text-slate-500 space-y-2">
            <Users className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-xs font-black text-slate-800">لا يوجد زبائن أو مستخدمين يطابقون خيارات البحث الحالية</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="bg-brand-blue text-white font-black text-xs py-1.5 px-3.5 rounded-xl shadow-xs cursor-pointer"
              >
                مسح البحث
              </button>
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto lg:overflow-x-visible">
            <table className="w-full text-right text-xs table-auto lg:table-fixed">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-black text-[11px]">
                <tr className="divide-x divide-x-reverse divide-slate-200">
                  <th className="py-3 px-3 w-[24%]">الزبون / المنشأة التجارية</th>
                  <th className="py-3 px-3 w-[16%]">المسؤول والاتصال</th>
                  <th className="py-3 px-3 w-[14%]">المحافظة والعنوان</th>
                  <th className="py-3 px-3 w-[17%]">نوع الحساب والرتبة</th>
                  <th className="py-3 px-3 w-[13%]">المشتريات والطلبات</th>
                  <th className="py-3 px-3 w-[16%] text-center">حالة الحساب والاعتماد ⚡</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => {
                  const isApproved = customer.merchantStatus === 'approved';
                  const isPending = customer.merchantStatus === 'pending';
                  const isRejected = customer.merchantStatus === 'rejected';
                  const isWholesale = customer.accountType === 'wholesale' || customer.accountType === 'merchant' || (customer.role === 'merchant' && customer.accountType !== 'market');
                  const isMarket = customer.accountType === 'market';
                  const tier = customer.merchantTier || 'bronze';

                  let phoneClean = (customer.phone || '').replace(/\D/g, '');
                  if (phoneClean.startsWith('07')) phoneClean = '964' + phoneClean.substring(1);

                  const whatsAppLink = `https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodeURIComponent(
                    `مرحباً ${customer.name} 🇮🇶 بخصوص حسابكم في سوق الجملة:`
                  )}`;

                  const hasOrders = (customer.totalOrdersCount || 0) > 0;

                  return (
                    <tr key={customer.id} className="hover:bg-slate-50/70 transition divide-x divide-x-reverse divide-slate-100">
                      
                      {/* Customer Info & Profile */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center group">
                            {customer.storefrontImage || customer.avatar ? (
                              <>
                                <img
                                  src={customer.storefrontImage || customer.avatar}
                                  alt={customer.businessName || customer.name}
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(customer.storefrontImage || customer.avatar || null)}
                                  className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                                  title="معاينة الصورة"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <span className="text-base">
                                {isWholesale ? '👑' : isMarket ? '🏪' : '👤'}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="font-black text-slate-900 text-xs flex items-center gap-1 flex-wrap">
                              <span className="truncate max-w-[140px]">{customer.businessName || customer.name}</span>
                              {customer.storefrontImage && (
                                <span className="bg-emerald-100 text-emerald-800 text-[8px] font-bold px-1 rounded">
                                  📸 واجهة
                                </span>
                              )}
                            </div>
                            {customer.businessName && customer.name !== customer.businessName && (
                              <span className="text-[10px] text-slate-500 font-medium block truncate max-w-[140px]">
                                ({customer.name})
                              </span>
                            )}
                            <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                              مسجل: {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('ar-IQ') : 'سابقاً'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Phone & Direct Contact */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 font-mono font-bold text-slate-900 text-[11px]" dir="ltr">
                            <span>{customer.phone}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyPhone(customer.phone)}
                              className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                              title="نسخ رقم الهاتف"
                            >
                              {copiedPhone === customer.phone ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          {/* عرض كلمة السر الحالية للمدير */}
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-lg border border-slate-200/80 w-fit">
                            <span className="text-slate-500">الرمز السري:</span>
                            <span className="font-mono font-black text-amber-900 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              {customer.password || '123456 (افتراضي)'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <a
                              href={whatsAppLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 hover:text-emerald-900 font-bold text-[9px] inline-flex items-center gap-0.5 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 transition"
                            >
                              <MessageCircle className="w-2.5 h-2.5 text-emerald-600" />
                              <span>واتساب</span>
                            </a>

                            <a
                              href={`tel:${customer.phone}`}
                              className="text-slate-600 hover:text-slate-900 font-bold text-[9px] inline-flex items-center gap-0.5 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-200 transition"
                            >
                              <Phone className="w-2.5 h-2.5 text-slate-500" />
                              <span>اتصال</span>
                            </a>

                            <button
                              type="button"
                              onClick={() => {
                                setPasswordModalCustomer(customer);
                                setResetCustomerPassword('');
                              }}
                              className="text-amber-700 hover:text-amber-900 font-bold text-[9px] inline-flex items-center gap-0.5 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 transition cursor-pointer"
                              title="استعادة / تعيين كلمة سر جديدة للعميل"
                            >
                              <Key className="w-2.5 h-2.5 text-amber-600" />
                              <span>تغيير كلمة السر 🔑</span>
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Location & Province */}
                      <td className="py-3 px-3 text-slate-700">
                        <div className="font-bold text-slate-900 text-[11px]">{customer.city || 'العراق'}</div>
                        <div className="text-slate-500 text-[10px] truncate max-w-[130px]" title={customer.address}>
                          {customer.address || 'العنوان غير محدد'}
                        </div>
                        {customer.mapsUrl && (
                          <a
                            href={customer.mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-700 hover:text-sky-900 font-bold text-[9px] inline-flex items-center gap-0.5 mt-0.5 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200"
                          >
                            <MapPin className="w-2.5 h-2.5 text-sky-600" />
                            <span>GPS</span>
                          </a>
                        )}
                      </td>

                      {/* Account Type & Tier Selection */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          
                          {/* Badge */}
                          <div>
                            {isWholesale ? (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-950 border border-amber-300 font-black px-2 py-0.5 rounded-lg text-[9px] shadow-2xs">
                                <Crown className="w-3 h-3 text-amber-600" />
                                <span>👑 تاجر جملة ({tier === 'gold' ? 'VIP' : tier === 'silver' ? 'خاص' : 'برونزي'})</span>
                              </span>
                            ) : isMarket ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 border border-emerald-300 font-black px-2 py-0.5 rounded-lg text-[9px] shadow-2xs">
                                <Store className="w-3 h-3 text-emerald-700" />
                                <span>🏪 ماركت ومحل</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-300 font-bold px-2 py-0.5 rounded-lg text-[9px]">
                                <User className="w-3 h-3 text-slate-500" />
                                <span>👤 زبون عادي</span>
                              </span>
                            )}
                          </div>

                          {/* Quick Switch Dropdown */}
                          <div className="flex items-center gap-1">
                            <select
                              disabled={updatingId === customer.id}
                              value={isWholesale ? 'wholesale' : isMarket ? 'market' : 'individual'}
                              onChange={(e) => {
                                const newType = e.target.value as AccountType;
                                handleUpdateAccountType(customer.id, newType, newType === 'wholesale' ? 'bronze' : undefined);
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-slate-700 focus:bg-white cursor-pointer"
                              title="تغيير تصنيف الحساب"
                            >
                              <option value="wholesale">👑 تاجر جملة</option>
                              <option value="market">🏪 ماركت</option>
                              <option value="individual">👤 زبون عادي</option>
                            </select>

                            {isWholesale && (
                              <select
                                disabled={updatingId === customer.id}
                                value={tier}
                                onChange={(e) => handleUpdateTier(customer.id, e.target.value as MerchantTier)}
                                className="bg-amber-50 border border-amber-300 rounded-md px-1 py-0.5 text-[9px] font-black text-amber-950 cursor-pointer"
                              >
                                <option value="bronze">🥉 برونزي</option>
                                <option value="silver">🥈 فضي</option>
                                <option value="gold">🥇 VIP</option>
                              </select>
                            )}
                          </div>

                        </div>
                      </td>

                      {/* Orders & Purchases Stats */}
                      <td className="py-3 px-3">
                        {hasOrders ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className="bg-emerald-100 text-emerald-900 text-[9px] font-black px-1.5 py-0.2 rounded">
                                🛒 {customer.totalOrdersCount}
                              </span>
                              <span className="font-mono font-black text-[10px] text-slate-900">
                                {(customer.totalOrdersAmount || 0).toLocaleString()} د.ع
                              </span>
                            </div>
                            {customer.lastOrderDate && (
                              <span className="text-[8px] text-slate-400 font-medium block">
                                آخر: {new Date(customer.lastOrderDate).toLocaleDateString('ar-IQ')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            لم يطلب بعد ⏳
                          </span>
                        )}
                      </td>

                      {/* Account Approval Status Selector (Dropdown) + Notification Trigger */}
                      <td className="py-3 px-3 text-center">
                        <div className="space-y-1.5">
                          
                          {/* Direct Status Selector Dropdown */}
                          <div className="relative">
                            <select
                              disabled={updatingId === customer.id}
                              value={customer.merchantStatus || 'pending'}
                              onChange={(e) => handleUpdateStatus(customer, e.target.value as MerchantStatus)}
                              className={`w-full font-black text-[10px] py-1 px-2 rounded-lg border cursor-pointer transition shadow-2xs ${
                                isApproved
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                  : isPending
                                  ? 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100 font-black animate-pulse'
                                  : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                              }`}
                            >
                              <option value="pending">⏳ غير معتمد (قيد المراجعة)</option>
                              <option value="approved">✓ معتمد ومفعل</option>
                              <option value="rejected">✕ مرفوض</option>
                            </select>
                          </div>

                          {/* Action Links: Statement & Notify Button */}
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setNotifyCustomer({ customer, status: customer.merchantStatus || 'pending' })}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded text-[9px] font-bold transition flex items-center gap-0.5 cursor-pointer"
                              title="إرسال إشعار للزبون عبر واتساب"
                            >
                              <Send className="w-2.5 h-2.5 text-emerald-600" />
                              <span>إشعار الزبون</span>
                            </button>

                            <Link
                              href={`/admin/accounting?search=${encodeURIComponent(customer.phone)}&openPhone=${encodeURIComponent(customer.phone)}`}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[9px] font-bold transition flex items-center gap-0.5"
                              title="عرض كشف الحساب والمحاسبة"
                            >
                              <FileText className="w-2.5 h-2.5 text-indigo-600" />
                              <span>كشف الحساب</span>
                            </Link>
                          </div>

                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer WhatsApp Notification Modal */}
      {notifyCustomer && (
        <div
          onClick={() => setNotifyCustomer(null)}
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 cursor-pointer animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white p-5 rounded-3xl max-w-lg w-full shadow-2xl space-y-4 relative animate-scaleUp"
          >
            <button
              onClick={() => setNotifyCustomer(null)}
              className="absolute top-4 left-4 bg-slate-100 text-slate-500 p-1.5 rounded-full hover:bg-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-xs ${
                notifyCustomer.status === 'approved' ? 'bg-emerald-600' : notifyCustomer.status === 'pending' ? 'bg-amber-500' : 'bg-red-600'
              }`}>
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900">
                  {notifyCustomer.status === 'approved'
                    ? '🎉 إرسال إشعار الاعتماد والتفعيل للزبون'
                    : notifyCustomer.status === 'pending'
                    ? '⏳ إشعار الزبون بأن الحساب قيد المراجعة'
                    : '✕ إشعار الزبون بحالة الطلب'}
                </h3>
                <span className="text-xs text-slate-500 font-bold">
                  المرسل إليه: <span className="text-slate-900 font-black">{notifyCustomer.customer.businessName || notifyCustomer.customer.name}</span> ({notifyCustomer.customer.phone})
                </span>
              </div>
            </div>

            {/* Pre-written WhatsApp Message Preview */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">نص الرسالة التلقائية الجاهزة للإرسال عبر واتساب:</label>
              {(() => {
                const cust = notifyCustomer.customer;
                const status = notifyCustomer.status;
                let msg = '';
                if (status === 'approved') {
                  msg = `مرحباً ${cust.name} 🇮🇶\n\nنود إعلامكم بأنه تم تدقيق وتفعيل حسابكم (${cust.businessName || cust.name}) في تطبيق سوق الجملة بنجاح ✓.\n\nيمكنكم الآن تصفح الأسعار وإرسال فواتير الشراء والطلبيات مباشرة عبر التطبيق.\n\nنتشرف بخدمتكم دائماً! 🌟`;
                } else if (status === 'pending') {
                  msg = `مرحباً ${cust.name} 🇮🇶\n\nطلب تسجيل حسابكم (${cust.businessName || cust.name}) في تطبيق سوق الجملة قيد المراجعة والتدقيق حالياً ⏳.\n\nسيقوم فريق الإدارة بالتواصل معكم قريباً لاعتماد الحساب وتفعيل إرسال الفواتير.`;
                } else {
                  msg = `مرحباً ${cust.name} 🇮🇶\n\nنعتذر، لم يتم اعتماد طلب التسجيل لحساب (${cust.businessName || cust.name}) حالياً. يرجى التواصل مع الدعم الفني للاستفسار وتحديث البيانات.`;
                }

                let phoneClean = (cust.phone || '').replace(/\D/g, '');
                if (phoneClean.startsWith('07')) phoneClean = '964' + phoneClean.substring(1);
                const waUrl = `https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodeURIComponent(msg)}`;

                return (
                  <div className="space-y-3">
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">
                      {msg}
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4 text-emerald-100" />
                        <span>إرسال الإشعار عبر واتساب الآن 🚀</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(msg);
                          setCopiedNotifyMsg(true);
                          setTimeout(() => setCopiedNotifyMsg(false), 2000);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-3 rounded-xl border border-slate-200 transition flex items-center gap-1"
                        title="نسخ نص الرسالة"
                      >
                        {copiedNotifyMsg ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedNotifyMsg ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setNotifyCustomer(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                تخطي وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Storefront Image Fullscreen Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white p-4 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col items-center gap-3 shadow-2xl relative"
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 left-4 bg-slate-900/70 text-white p-2 rounded-full hover:bg-slate-900 transition"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-black text-slate-900 text-sm">📸 معاينة صورة واجهة المحل / الماركت</h3>
            <img
              src={previewImage}
              alt="معاينة واجهة المحل"
              className="w-full max-h-[70vh] object-contain rounded-2xl bg-slate-50"
            />
          </div>
        </div>
      )}

      {/* CUSTOMER PASSWORD RESET MODAL */}
      {passwordModalCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    تعيين كلمة مرور جديدة للعميل
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold">
                    {passwordModalCustomer.name} • {passwordModalCustomer.phone}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPasswordModalCustomer(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetCustomerPassword} className="space-y-4">
              
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-950 space-y-1 font-bold">
                <p>💡 بمجرد الضغط على الحفظ، سيتم تحديث كلمة المرور في النظام تلقائياً وفتح نافذة واتساب لإرسال الرمز الجديد للعميل.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 block">
                  كلمة المرور الجديدة للعميل *:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={resetCustomerPassword}
                    onChange={(e) => setResetCustomerPassword(e.target.value)}
                    placeholder="مثال: 123456 أو كلمة سر من اختيارك"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 pr-4 pl-10 text-xs font-bold text-slate-900 font-mono focus:bg-white focus:border-amber-600 focus:outline-none"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPasswordModalCustomer(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition cursor-pointer text-xs"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isResettingPassword}
                  className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black px-5 py-2.5 rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer text-xs disabled:opacity-50"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{isResettingPassword ? 'جاري الحفظ...' : 'حفظ وإرسال كلمة السر عبر واتساب 💬'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* 👤 نافذة إضافة زبون / تاجر / ماركت جديد يدوياً (Add New Customer Modal) */}
      {isAddCustomerModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 text-xs">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">إضافة وتثبيت زبون / تاجر جديد</h3>
                  <p className="text-[11px] text-slate-500 font-bold">تسجيل زبائن الهاتف والطلبات الخارجية في الدليل الدائم</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCustomerModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {addCustomerError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-2xl font-bold flex items-center gap-2">
                <span>⚠️ {addCustomerError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCustomer} className="space-y-3.5">
              
              {/* Account Type Selector */}
              <div>
                <label className="font-black text-slate-800 block mb-1.5">تصنيف الحساب ونوع التعامل *:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCustomerAccountType('market')}
                    className={`p-2.5 rounded-xl border text-center font-bold transition cursor-pointer ${
                      newCustomerAccountType === 'market'
                        ? 'bg-[#1b4332] text-white border-[#1b4332] shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block text-base mb-0.5">🏪</span>
                    <span className="text-[11px] block font-black">صاحب ماركت</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewCustomerAccountType('wholesale')}
                    className={`p-2.5 rounded-xl border text-center font-bold transition cursor-pointer ${
                      newCustomerAccountType === 'wholesale'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block text-base mb-0.5">👑</span>
                    <span className="text-[11px] block font-black">تاجر جملة وموزع</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewCustomerAccountType('individual')}
                    className={`p-2.5 rounded-xl border text-center font-bold transition cursor-pointer ${
                      newCustomerAccountType === 'individual'
                        ? 'bg-sky-700 text-white border-sky-700 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block text-base mb-0.5">👤</span>
                    <span className="text-[11px] block font-black">زبون مفرد</span>
                  </button>
                </div>
              </div>

              {/* Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-black text-slate-800 block mb-1">الاسم الكامل *:</label>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="مثال: عباس الشمري"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-black text-slate-800 block mb-1">رقم الهاتف (الواتساب) *:</label>
                  <input
                    type="text"
                    required
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="077XXXXXXXX"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 font-mono focus:bg-white focus:border-emerald-600 focus:outline-none text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Business Name & Type */}
              {newCustomerAccountType !== 'individual' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <div>
                    <label className="font-black text-slate-800 block mb-1">اسم المحل / الماركت / النشاط:</label>
                    <input
                      type="text"
                      value={newCustomerBusinessName}
                      onChange={(e) => setNewCustomerBusinessName(e.target.value)}
                      placeholder="مثال: أسواق الكوثر المركزية"
                      className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-black text-slate-800 block mb-1">نوع التجارة / النشاط:</label>
                    <input
                      type="text"
                      value={newCustomerBusinessType}
                      onChange={(e) => setNewCustomerBusinessType(e.target.value)}
                      placeholder="مثال: ميني ماركت وبقالة"
                      className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* City & Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-black text-slate-800 block mb-1">المحافظة / المدينة:</label>
                  <input
                    type="text"
                    value={newCustomerCity}
                    onChange={(e) => setNewCustomerCity(e.target.value)}
                    placeholder="كربلاء المقدسة"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-black text-slate-800 block mb-1">العنوان التفصيلي / نقطة دالة:</label>
                  <input
                    type="text"
                    value={newCustomerAddress}
                    onChange={(e) => setNewCustomerAddress(e.target.value)}
                    placeholder="مثال: حي الحسين - قرب جامع الإمام علي"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Default Password */}
              <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <span className="font-black text-emerald-950 block text-[11px]">كلمة المرور الافتراضية للحساب:</span>
                  <span className="text-[10px] text-emerald-800">يمكن للزبون استخدامها لتسجيل الدخول للتطبيق في أي وقت</span>
                </div>
                <input
                  type="text"
                  value={newCustomerPasswordVal}
                  onChange={(e) => setNewCustomerPasswordVal(e.target.value)}
                  className="w-24 bg-white border border-emerald-300 rounded-xl px-2 py-1 text-xs font-mono font-bold text-center text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition cursor-pointer text-xs"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingNewCustomer}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-50"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{isSubmittingNewCustomer ? 'جاري الحفظ...' : 'حفظ وإضافة الزبون للدليل ✅'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
