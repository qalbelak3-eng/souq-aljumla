'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Search,
  X,
  Package,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Percent,
  Flame,
  ArrowRight,
  ExternalLink,
  Power,
  Ticket,
  Tag,
  Copy,
  Check,
  Users,
  Store,
  Crown
} from 'lucide-react';
import { Product, ProductOffer, Coupon } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';

export default function AdminOffersPage() {
  const toast = useToast();
  const { confirm } = useConfirm();

  // Tab State: Product Flash Offers VS Promotional Coupons
  const [activeTab, setActiveTab] = useState<'products' | 'coupons'>('products');

  const [offers, setOffers] = useState<ProductOffer[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Offer Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ProductOffer | null>(null);

  // Offer Form Fields
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productSearchText, setProductSearchText] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [originalPrice, setOriginalPrice] = useState<number>(0);
  const [originalWholesalePrice, setOriginalWholesalePrice] = useState<number | ''>('');
  const [offerPrice, setOfferPrice] = useState<number | ''>('');
  const [offerWholesalePrice, setOfferWholesalePrice] = useState<number | ''>('');
  const [badge, setBadge] = useState('🔥 عرض خاص');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Coupon Modal State
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  // Coupon Form Fields
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscountType, setCouponDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [couponDiscountValue, setCouponDiscountValue] = useState<number | ''>('');
  const [couponMinOrderAmount, setCouponMinOrderAmount] = useState<number | ''>('');
  const [couponTargetAudience, setCouponTargetAudience] = useState<'all' | 'individual' | 'market' | 'wholesale'>('all');
  const [couponDescription, setCouponDescription] = useState('');
  const [couponExpiresAt, setCouponExpiresAt] = useState('');
  const [couponIsActive, setCouponIsActive] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [offersRes, productsRes, couponsRes] = await Promise.all([
        fetch('/api/offers').then((r) => r.json()),
        fetch('/api/products').then((r) => r.json()),
        fetch('/api/coupons').then((r) => r.json()).catch(() => ({ success: false })),
      ]);

      if (offersRes.success) setOffers(offersRes.offers || []);
      if (productsRes.success) setProducts(productsRes.products || []);
      if (couponsRes.success) setCoupons(couponsRes.coupons || []);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل بيانات العروض والكوبونات');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper to get default end date (+7 days from now in YYYY-MM-DDTHH:mm format)
  const getDefaultEndDate = (days = 7) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  // --- Product Offers Handlers ---
  const openAddModal = () => {
    setEditingOffer(null);
    setSelectedProductId('');
    setSelectedProduct(null);
    setProductSearchText('');
    setIsSearchDropdownOpen(false);
    setOriginalPrice(0);
    setOriginalWholesalePrice('');
    setOfferPrice('');
    setOfferWholesalePrice('');
    setBadge('🔥 عرض خاص');
    setEndDate(getDefaultEndDate(7));
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (o: ProductOffer) => {
    setEditingOffer(o);
    setSelectedProductId(o.productId);
    const prod = products.find((p) => p.id === o.productId) || null;
    setSelectedProduct(prod);
    setProductSearchText(o.productName);
    setIsSearchDropdownOpen(false);
    setOriginalPrice(o.originalPrice);
    setOriginalWholesalePrice(o.originalWholesalePrice || '');
    setOfferPrice(o.offerPrice);
    setOfferWholesalePrice(o.offerWholesalePrice || '');
    setBadge(o.badge || '🔥 عرض خاص');
    
    if (o.endDate) {
      const d = new Date(o.endDate);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setEndDate(d.toISOString().slice(0, 16));
    } else {
      setEndDate(getDefaultEndDate(7));
    }
    setIsActive(o.isActive);
    setIsModalOpen(true);
  };

  const handleSelectProduct = (prod: Product) => {
    setSelectedProductId(prod.id);
    setSelectedProduct(prod);
    setProductSearchText(prod.name);
    setIsSearchDropdownOpen(false);
    setOriginalPrice(prod.price);
    setOriginalWholesalePrice(prod.wholesalePrice || '');
    setOfferPrice(Math.round(prod.price * 0.85));
    setOfferWholesalePrice(prod.wholesalePrice ? Math.round(prod.wholesalePrice * 0.9) : '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      toast.error('يرجى اختيار الصنف المطلوب عمل عرض عليه');
      return;
    }
    if (offerPrice === '' || Number(offerPrice) <= 0) {
      toast.error('يرجى كتابة سعر العرض للمفرد');
      return;
    }
    if (!endDate) {
      toast.error('يرجى تحديد تاريخ ووقت انتهاء العرض');
      return;
    }

    const payload = {
      productId: selectedProductId,
      offerPrice: Number(offerPrice),
      offerWholesalePrice: offerWholesalePrice !== '' ? Number(offerWholesalePrice) : undefined,
      badge: badge.trim() || '🔥 عرض خاص',
      endDate: new Date(endDate).toISOString(),
      isActive,
    };

    try {
      if (editingOffer) {
        const res = await fetch(`/api/offers/${editingOffer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setOffers((prev) => prev.map((o) => (o.id === editingOffer.id ? data.offer : o)));
          setIsModalOpen(false);
          toast.success('تم تحديث بيانات العرض الترويجي بنجاح ✨');
          fetchData();
        } else {
          toast.error(data.error || 'حدث خطأ أثناء تعديل العرض');
        }
      } else {
        const res = await fetch('/api/offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setOffers((prev) => [data.offer, ...prev]);
          setIsModalOpen(false);
          toast.success('تم إطلاق وتفعيل العرض الترويجي بنجاح 🚀');
          fetchData();
        } else {
          toast.error(data.error || 'حدث خطأ أثناء إضافة العرض');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('تعذر الاتصال بالسيرفر لحفظ العرض');
    }
  };

  const handleToggleActive = async (offer: ProductOffer) => {
    const newStatus = !offer.isActive;
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setOffers((prev) => prev.map((o) => (o.id === offer.id ? data.offer : o)));
        toast.success(newStatus ? 'تم تفعيل العرض وإظهاره بالمتجر 🔥' : 'تم إيقاف العرض مؤقتاً ⏸️');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, offerName?: string) => {
    const isConfirmed = await confirm({
      title: 'حذف العرض الترويجي',
      message: `هل أنت متأكد من حذف ${offerName ? `"${offerName}"` : 'هذا العرض'} نهائياً؟\nسيعود سعر المنتج لسعره الأساسي فوراً.`,
      confirmText: 'نعم، احذف العرض',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setOffers((prev) => prev.filter((o) => o.id !== id));
        toast.info('تم حذف العرض بنجاح');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حذف العرض');
    }
  };

  // --- Coupon Handlers ---
  const openAddCouponModal = () => {
    setEditingCoupon(null);
    setCouponCode('');
    setCouponDiscountType('fixed');
    setCouponDiscountValue('');
    setCouponMinOrderAmount('');
    setCouponTargetAudience('all');
    setCouponDescription('');
    setCouponExpiresAt(getDefaultEndDate(30));
    setCouponIsActive(true);
    setIsCouponModalOpen(true);
  };

  const openEditCouponModal = (c: Coupon) => {
    setEditingCoupon(c);
    setCouponCode(c.code);
    setCouponDiscountType(c.discountType);
    setCouponDiscountValue(c.discountValue);
    setCouponMinOrderAmount(c.minOrderAmount ?? '');
    setCouponTargetAudience(c.targetAudience ?? 'all');
    setCouponDescription(c.description ?? '');
    if (c.expiresAt) {
      const d = new Date(c.expiresAt);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setCouponExpiresAt(d.toISOString().slice(0, 16));
    } else {
      setCouponExpiresAt('');
    }
    setCouponIsActive(c.isActive);
    setIsCouponModalOpen(true);
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) {
      toast.error('يرجى كتابة كود الخصم');
      return;
    }
    if (couponDiscountValue === '' || Number(couponDiscountValue) <= 0) {
      toast.error('يرجى تحديد قيمة الخصم');
      return;
    }

    const payload = {
      id: editingCoupon?.id,
      code: couponCode.trim().toUpperCase(),
      discountType: couponDiscountType,
      discountValue: Number(couponDiscountValue),
      minOrderAmount: couponMinOrderAmount !== '' ? Number(couponMinOrderAmount) : undefined,
      targetAudience: couponTargetAudience,
      description: couponDescription.trim(),
      expiresAt: couponExpiresAt ? new Date(couponExpiresAt).toISOString() : undefined,
      isActive: couponIsActive,
    };

    try {
      const method = editingCoupon ? 'PUT' : 'POST';
      const res = await fetch('/api/coupons', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setIsCouponModalOpen(false);
        toast.success(editingCoupon ? 'تم حفظ تعديلات كود الخصم بنجاح ✨' : 'تم إنشاء كود الخصم الجديد بنجاح 🚀');
        fetchData();
      } else {
        toast.error(data.error || 'حدث خطأ أثناء حفظ الكوبون');
      }
    } catch (err) {
      console.error(err);
      toast.error('تعذر الاتصال بالسيرفر لحفظ الكود');
    }
  };

  const handleToggleCouponActive = async (c: Coupon) => {
    const newStatus = !c.isActive;
    try {
      const res = await fetch('/api/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, code: c.code, isActive: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setCoupons((prev) => prev.map((item) => (item.code === c.code ? { ...item, isActive: newStatus } : item)));
        toast.success(newStatus ? `تم تفعيل كود الخصم ${c.code} ✅` : `تم إيقاف كود الخصم ${c.code} ⏸️`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCoupon = async (c: Coupon) => {
    const isConfirmed = await confirm({
      title: 'حذف كود الخصم',
      message: `هل أنت متأكد من حذف كود الخصم "${c.code}" نهائياً من النظام؟`,
      confirmText: 'نعم، احذف الكود',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/coupons?code=${encodeURIComponent(c.code)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setCoupons((prev) => prev.filter((item) => item.code !== c.code));
        toast.info('تم حذف كود الخصم بنجاح');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حذف الكوبون');
    }
  };

  const handleCopyCouponCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`تم نسخ كود الخصم (${code})`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Remaining time formatter
  const formatRemainingTime = (endIso: string, active: boolean) => {
    if (!active) return { text: 'متوقف مؤقتاً ⏸️', isExpired: false, color: 'text-slate-500 bg-slate-100' };
    const now = new Date().getTime();
    const end = new Date(endIso).getTime();
    const diff = end - now;

    if (diff <= 0) {
      return { text: 'منتهي الصلاحية ⌛', isExpired: true, color: 'text-red-700 bg-red-100 border-red-200' };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return { text: `متبقي ${days} يوم و ${hours} ساعة ⏳`, isExpired: false, color: 'text-emerald-800 bg-emerald-100 border-emerald-300' };
    }
    return { text: `متبقي ${hours} ساعة و ${minutes} دقيقة ⚡`, isExpired: false, color: 'text-amber-800 bg-amber-100 border-amber-300 animate-pulse' };
  };

  // Stats
  const nowTime = new Date().getTime();
  const activeOffersCount = offers.filter((o) => o.isActive && new Date(o.endDate).getTime() > nowTime).length;
  const expiredOffersCount = offers.filter((o) => !o.isActive || new Date(o.endDate).getTime() <= nowTime).length;

  const filteredOffers = offers.filter((o) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      o.productName.toLowerCase().includes(q) ||
      (o.company && o.company.toLowerCase().includes(q)) ||
      (o.badge && o.badge.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    const isExp = !o.isActive || new Date(o.endDate).getTime() <= nowTime;
    if (statusFilter === 'active' && isExp) return false;
    if (statusFilter === 'expired' && !isExp) return false;

    return true;
  });

  const filteredCoupons = coupons.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      c.code.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  });

  // Calculate savings on form
  const curOrig = Number(originalPrice) || 0;
  const curOff = Number(offerPrice) || 0;
  const savingAmount = curOrig > curOff ? curOrig - curOff : 0;
  const savingPercent = curOrig > 0 && curOff < curOrig ? Math.round(((curOrig - curOff) / curOrig) * 100) : 0;

  return (
    <div className="space-y-6 text-xs">
      
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-rose-900 via-red-800 to-rose-950 text-white p-5 sm:p-6 rounded-3xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-rose-500/30 text-rose-200 border border-rose-400/40 text-[10px] font-black px-2.5 py-0.5 rounded-full">
              قسم إدارة التخفيضات والكوبونات 🔥
            </span>
          </div>
          <h1 className="text-base sm:text-xl font-black mt-1.5 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <span>إدارة العروض وأكواد الخصم الترويجية</span>
          </h1>
          <p className="text-xs text-rose-200/90 font-medium mt-1">
            أنشئ عروض أسعار موقوتة للأصناف، أو أصدر أكواد خصم (كوبونات) مخصصة للزبائن والمحلات وكبار التجار
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'products' ? (
            <button
              onClick={openAddModal}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة عرض صنف جديد ⚡</span>
            </button>
          ) : (
            <button
              onClick={openAddCouponModal}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء كود خصم جديد 🎟️</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 bg-slate-200/70 p-1.5 rounded-2xl border border-slate-300/60 max-w-md">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'products'
              ? 'bg-white text-rose-700 shadow-xs ring-2 ring-rose-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>عروض وتخفيضات الأصناف ({offers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('coupons')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'coupons'
              ? 'bg-white text-amber-700 shadow-xs ring-2 ring-amber-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>كوبونات وأكواد الخصم ({coupons.length})</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: PRODUCT FLASH OFFERS */}
      {/* ======================================================== */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* 4 Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center font-black text-lg">
                🔥
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">العروض النشطة</span>
                <span className="text-base font-black text-slate-900 font-mono">{activeOffersCount} عرض</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-black text-lg">
                ⏳
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">منتهية / متوقفة</span>
                <span className="text-base font-black text-slate-900 font-mono">{expiredOffersCount} عرض</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-black text-lg">
                📦
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">إجمالي العروض</span>
                <span className="text-base font-black text-slate-900 font-mono">{offers.length}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-black text-lg">
                %
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">إدارة آلية</span>
                <span className="text-xs font-black text-emerald-700 block">توقف تلقائي ✓</span>
              </div>
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                placeholder="ابحث باسم المنتج أو الشركة أو الشارة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-9 text-xs focus:bg-white focus:border-rose-500 font-bold"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {(['all', 'active', 'expired'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`py-1.5 px-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                    statusFilter === filter
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filter === 'all' && 'الكل'}
                  {filter === 'active' && 'النشطة فقط 🔥'}
                  {filter === 'expired' && 'المنتهية ⌛'}
                </button>
              ))}
            </div>
          </div>

          {/* Offers Table / Cards */}
          {isLoading ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-500 font-bold">جاري تحميل بيانات العروض والتخفيضات...</p>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
              <span className="text-4xl block">🏷️</span>
              <h3 className="text-sm font-black text-slate-800">لا توجد عروض حالياً مطابقة لبحثك</h3>
              <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                يمكنك الضغط على زر "إضافة عرض جديد" للبدء في ترويج أي صنف بسعر مخفض لفترة محددة!
              </p>
              <button
                onClick={openAddModal}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة أول عرض الآن</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOffers.map((o) => {
                const prod = products.find((p) => p.id === o.productId);
                const timeStatus = formatRemainingTime(o.endDate, o.isActive);

                return (
                  <div
                    key={o.id}
                    className={`bg-white rounded-3xl border transition shadow-xs hover:shadow-md p-4 flex flex-col justify-between space-y-3 relative overflow-hidden ${
                      !o.isActive
                        ? 'border-slate-200 opacity-75'
                        : timeStatus.isExpired
                        ? 'border-red-200 bg-red-50/20'
                        : 'border-rose-200 ring-1 ring-rose-100'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 p-1 flex items-center justify-center shrink-0 border border-slate-200">
                            <img
                              src={o.productImage || prod?.images[0] || 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=800'}
                              alt={o.productName}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div>
                            <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md inline-block shadow-2xs">
                              {o.badge || '🔥 عرض خاص'}
                            </span>
                            <h3 className="text-xs font-black text-slate-900 mt-1 line-clamp-1">
                              {o.productName}
                            </h3>
                            <span className="text-[10px] text-slate-400 font-bold block">{o.company || 'شركة عامة'}</span>
                          </div>
                        </div>

                        {o.discountPercent && (
                          <div className="bg-amber-400 text-slate-950 font-black text-xs px-2 py-1 rounded-xl shadow-2xs shrink-0 font-mono">
                            -{o.discountPercent}%
                          </div>
                        )}
                      </div>

                      {/* Pricing Comparison */}
                      <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 font-bold">سعر المفرد المخفض:</span>
                          <div className="flex items-center gap-1.5 font-mono font-black">
                            <span className="text-rose-600 text-sm">{o.offerPrice.toLocaleString()} د.ع</span>
                            <span className="text-[10px] text-slate-400 line-through">{o.originalPrice.toLocaleString()}</span>
                          </div>
                        </div>

                        {o.offerWholesalePrice && o.originalWholesalePrice && (
                          <div className="flex items-center justify-between border-t border-slate-200/60 pt-1">
                            <span className="text-[11px] text-slate-500 font-bold">سعر كرتون الجملة:</span>
                            <div className="flex items-center gap-1.5 font-mono font-black">
                              <span className="text-emerald-700 text-xs">{o.offerWholesalePrice.toLocaleString()} د.ع</span>
                              <span className="text-[10px] text-slate-400 line-through">{o.originalWholesalePrice.toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Remaining Time Badge */}
                      <div className={`py-1.5 px-3 rounded-xl border text-[11px] font-black flex items-center justify-between ${timeStatus.color}`}>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{timeStatus.text}</span>
                        </div>
                        <span className="text-[10px] opacity-80 font-mono">
                          {new Date(o.endDate).toLocaleDateString('ar-IQ')}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 gap-2">
                      <button
                        onClick={() => handleToggleActive(o)}
                        className={`py-1.5 px-3 rounded-xl font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer ${
                          o.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{o.isActive ? 'مفعل بالمتجر' : 'متوقف'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(o)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 transition cursor-pointer"
                          title="تعديل العرض"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(o.id, o.productName)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 transition cursor-pointer"
                          title="حذف العرض"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: COUPONS & DISCOUNT CODES */}
      {/* ======================================================== */}
      {activeTab === 'coupons' && (
        <div className="space-y-6">
          {/* Coupons Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-black text-lg">
                🎟️
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">إجمالي الكوبونات</span>
                <span className="text-base font-black text-slate-900 font-mono">{coupons.length} كود</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-black text-lg">
                ✅
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">الكوبونات الفعالة</span>
                <span className="text-base font-black text-emerald-700 font-mono">{coupons.filter(c => c.isActive).length} كود</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-black text-lg">
                🏪
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">كوبونات الماركت</span>
                <span className="text-base font-black text-slate-900 font-mono">{coupons.filter(c => c.targetAudience === 'market').length}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center font-black text-lg">
                👑
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold block">كبار تجار الجملة</span>
                <span className="text-base font-black text-slate-900 font-mono">{coupons.filter(c => c.targetAudience === 'wholesale').length}</span>
              </div>
            </div>
          </div>

          {/* Coupons Search and Action Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                placeholder="ابحث بكود الخصم أو الوصف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-9 text-xs focus:bg-white focus:border-amber-500 font-bold"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>

            <button
              onClick={openAddCouponModal}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs py-2 px-4 rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء كود خصم جديد</span>
            </button>
          </div>

          {/* Coupons List */}
          {isLoading ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-500 font-bold">جاري تحميل قائمة الكوبونات...</p>
            </div>
          ) : filteredCoupons.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
              <span className="text-4xl block">🎟️</span>
              <h3 className="text-sm font-black text-slate-800">لا توجد أكواد خصم حالياً</h3>
              <p className="text-xs text-slate-500 font-medium max-w-sm mx-auto">
                اضغط على زر "إنشاء كود خصم جديد" لإصدار أول كوبون ترويجي لزبائنك أو أصحاب المحلات!
              </p>
              <button
                onClick={openAddCouponModal}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2 px-4 rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء أول كود خصم الآن</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCoupons.map((c) => {
                const isCopied = copiedCode === c.code;

                return (
                  <div
                    key={c.code}
                    className={`bg-white rounded-3xl border transition shadow-xs hover:shadow-md p-4 flex flex-col justify-between space-y-3 relative overflow-hidden ${
                      !c.isActive ? 'border-slate-200 opacity-70 bg-slate-50/50' : 'border-amber-200 ring-1 ring-amber-100'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Code Header & Copy */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-black bg-slate-900 text-amber-400 px-3 py-1 rounded-xl border border-amber-400/40 tracking-wider">
                            {c.code}
                          </span>
                          <button
                            onClick={() => handleCopyCouponCode(c.code)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            title="نسخ الكود"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Audience Badge */}
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl border ${
                          c.targetAudience === 'market'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : c.targetAudience === 'wholesale'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : c.targetAudience === 'individual'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-800 border-slate-200'
                        }`}>
                          {c.targetAudience === 'market' && '🏪 أصحاب الماركتات'}
                          {c.targetAudience === 'wholesale' && '👑 كبار تجار الجملة VIP'}
                          {c.targetAudience === 'individual' && '🛒 زبائن المفرد'}
                          {(!c.targetAudience || c.targetAudience === 'all') && '🌍 عام للجميع'}
                        </span>
                      </div>

                      {/* Discount Details Box */}
                      <div className="bg-amber-50/60 p-3 rounded-2xl border border-amber-200/80 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-amber-950 font-bold">قيمة الخصم الممنوح:</span>
                          <span className="font-mono text-sm font-black text-amber-900">
                            {c.discountType === 'percentage'
                              ? `خصم ${c.discountValue}%`
                              : `خصم ${c.discountValue.toLocaleString()} د.ع`}
                          </span>
                        </div>

                        {c.minOrderAmount && (
                          <div className="flex items-center justify-between border-t border-amber-200/60 pt-1 text-[11px]">
                            <span className="text-slate-600 font-bold">الحد الأدنى للطلب:</span>
                            <span className="font-mono font-black text-slate-800">{c.minOrderAmount.toLocaleString()} د.ع</span>
                          </div>
                        )}

                        {c.description && (
                          <p className="text-[10px] text-amber-800/90 font-medium pt-1 border-t border-amber-200/40">
                            📝 {c.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 gap-2">
                      <button
                        onClick={() => handleToggleCouponActive(c)}
                        className={`py-1.5 px-3 rounded-xl font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer ${
                          c.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{c.isActive ? 'مفعل ومتاح للاستخدام' : 'معطل مؤقتاً'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditCouponModal(c)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 transition cursor-pointer"
                          title="تعديل الكوبون"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCoupon(c)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 transition cursor-pointer"
                          title="حذف الكوبون"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: ADD/EDIT PRODUCT OFFER */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 text-xs select-none">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setIsModalOpen(false)} />

          <div className="relative bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl z-10 border border-slate-100 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  🔥
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {editingOffer ? 'تعديل بيانات العرض الترويجي' : 'إطلاق وتفعيل عرض تخفيض موقوت'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    حدد الصنف والسعر المخفض الجديد وتاريخ انتهاء العرض
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1 relative">
                <label className="font-bold text-slate-800 block text-xs">
                  اختر الصنف المراد عمل العرض عليه: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ابحث بالاسم لاختيار الصنف..."
                  value={productSearchText}
                  onChange={(e) => {
                    setProductSearchText(e.target.value);
                    setIsSearchDropdownOpen(true);
                  }}
                  onFocus={() => setIsSearchDropdownOpen(true)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                />

                {isSearchDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto mt-1 p-1 space-y-1">
                    {products
                      .filter((p) => p.name.toLowerCase().includes(productSearchText.toLowerCase()))
                      .slice(0, 8)
                      .map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProduct(p)}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <img src={p.images[0]} alt={p.name} className="w-8 h-8 object-contain rounded-lg bg-slate-100 p-0.5" />
                            <div>
                              <span className="font-bold text-slate-900 block">{p.name}</span>
                              <span className="text-[10px] text-slate-500">{p.company}</span>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-slate-700">{p.price.toLocaleString()} د.ع</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Price Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block text-xs">سعر المفرد المخفض:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      required
                      value={offerPrice}
                      onChange={(e) => setOfferPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-white border border-rose-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-rose-600 focus:border-rose-500"
                    />
                    <span className="text-[11px] font-bold text-slate-600 shrink-0">د.ع</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block text-xs">سعر كرتون الجملة (اختياري):</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={offerWholesalePrice}
                      onChange={(e) => setOfferWholesalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-emerald-700 focus:border-emerald-600"
                    />
                    <span className="text-[11px] font-bold text-slate-600 shrink-0">د.ع</span>
                  </div>
                </div>
              </div>

              {/* End Date */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 block text-xs">تاريخ ووقت انتهاء العرض:</label>
                <input
                  type="datetime-local"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-slate-900 focus:border-brand-blue"
                  dir="ltr"
                />
              </div>

              {/* Badge Text */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 block text-xs">نص شارة العرض:</label>
                <input
                  type="text"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                >
                  <Flame className="w-4 h-4" />
                  <span>{editingOffer ? 'حفظ التعديلات' : 'إطلاق العرض الآن'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: ADD/EDIT COUPON */}
      {/* ======================================================== */}
      {isCouponModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 text-xs select-none">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setIsCouponModalOpen(false)} />

          <div className="relative bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl z-10 border border-slate-100 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  🎟️
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {editingCoupon ? 'تعديل كود الخصم' : 'إنشاء وإصدار كود خصم جديد (كوبون)'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    حدد كود الخصم وقيمته والشريحة المستهدفة لاستخدامه في السلة
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsCouponModalOpen(false)}
                className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCoupon} className="space-y-3.5">
              {/* Coupon Code Input */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 block text-xs">
                  رمز كود الخصم (الكوبون): <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: ETIHAD2026 أو MARKET5"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  className="w-full bg-slate-50 border border-amber-300 rounded-xl py-2 px-3 text-sm font-black font-mono text-slate-950 uppercase tracking-wider focus:bg-white focus:border-amber-600"
                />
                <span className="text-[10px] text-slate-400 block font-medium">
                  يكتبه الزبون في سلة التسوق عند إتمام الشراء.
                </span>
              </div>

              {/* Discount Type & Value */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block text-xs">نوع الخصم:</label>
                  <select
                    value={couponDiscountType}
                    onChange={(e) => setCouponDiscountType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-900 focus:bg-white"
                  >
                    <option value="fixed">مبلغ ثابت (بالدينار د.ع)</option>
                    <option value="percentage">نسبة مئوية (%)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block text-xs">
                    قيمة الخصم: <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      required
                      min="1"
                      value={couponDiscountValue}
                      onChange={(e) => setCouponDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder={couponDiscountType === 'percentage' ? '10' : '5000'}
                      className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-slate-900 focus:border-amber-500"
                    />
                    <span className="text-[11px] font-black text-slate-700 shrink-0">
                      {couponDiscountType === 'percentage' ? '%' : 'د.ع'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Target Audience (الشرائح الثلاث) */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 block text-xs">
                  الفئة والشريحة المستهدفة بالكوبون:
                </label>
                <select
                  value={couponTargetAudience}
                  onChange={(e) => setCouponTargetAudience(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-900 focus:bg-white"
                >
                  <option value="all">🌍 عام لجميع الزبائن (مفرد + ماركت + تجار)</option>
                  <option value="individual">🛒 زبائن المفرد فقط (القطاعي والعادي)</option>
                  <option value="market">🏪 أصحاب الماركتات والمحلات المعتمدة فقط</option>
                  <option value="wholesale">👑 كبار تجار الجملة VIP فقط</option>
                </select>
                <span className="text-[10px] text-slate-500 block font-medium">
                  إذا حاول مستخدم من غير الشريحة المختارة استخدام الكوبون سيمنعه النظام تلقائياً.
                </span>
              </div>

              {/* Min Order Amount */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 block text-xs">
                  الحد الأدنى لقيمة الفاتورة (اختياري):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    placeholder="مثال: 50000 (اتركه فارغاً إذا بدون حد أدنى)"
                    value={couponMinOrderAmount}
                    onChange={(e) => setCouponMinOrderAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold font-mono text-slate-900 focus:border-amber-500"
                  />
                  <span className="text-[11px] font-bold text-slate-600 shrink-0">د.ع</span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 block text-xs">
                  وصف الكوبون (داخلي للإدارة والترويج):
                </label>
                <input
                  type="text"
                  placeholder="مثال: كود ترويجي لعيد الفطر / خصم الماركتات"
                  value={couponDescription}
                  onChange={(e) => setCouponDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCouponModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Ticket className="w-4 h-4" />
                  <span>{editingCoupon ? 'حفظ تعديلات الكوبون' : 'إصدار وتفعيل الكود 🚀'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
