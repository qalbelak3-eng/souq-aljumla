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
  Power
} from 'lucide-react';
import { Product, ProductOffer } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';

export default function AdminOffersPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [offers, setOffers] = useState<ProductOffer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ProductOffer | null>(null);

  // Form Fields
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

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [offersRes, productsRes] = await Promise.all([
        fetch('/api/offers').then((r) => r.json()),
        fetch('/api/products').then((r) => r.json()),
      ]);

      if (offersRes.success) setOffers(offersRes.offers || []);
      if (productsRes.success) setProducts(productsRes.products || []);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل بيانات العروض');
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
    
    // Format endDate for datetime-local input
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

  // Handle Product Selection From Smart Search
  const handleSelectProduct = (prod: Product) => {
    setSelectedProductId(prod.id);
    setSelectedProduct(prod);
    setProductSearchText(prod.name);
    setIsSearchDropdownOpen(false);
    setOriginalPrice(prod.price);
    setOriginalWholesalePrice(prod.wholesalePrice || '');
    setOfferPrice(Math.round(prod.price * 0.85)); // 15% recommended discount
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

    const prod = selectedProduct || products.find((p) => p.id === selectedProductId);
    const payload = {
      productId: selectedProductId,
      productName: prod?.name || 'صنف',
      productImage: prod?.images[0] || '',
      category: prod?.category || '',
      company: prod?.company || '',
      originalPrice: Number(originalPrice) || prod?.price || 0,
      originalWholesalePrice: originalWholesalePrice !== '' ? Number(originalWholesalePrice) : undefined,
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
          toast.success('تم تحديث العرض بنجاح ✨');
          setIsModalOpen(false);
        } else {
          toast.error(data.error || 'فشل تحديث العرض');
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
          toast.success('تم إطلاق وتفعيل العرض بنجاح 🚀🔥');
          setIsModalOpen(false);
        } else {
          toast.error(data.error || 'فشل إضافة العرض');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حفظ العرض');
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
              قسم إدارة التخفيضات الذكية 🔥
            </span>
          </div>
          <h1 className="text-base sm:text-xl font-black mt-1.5 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <span>إدارة العروض والتخفيضات الموقوتة</span>
          </h1>
          <p className="text-xs text-rose-200/90 font-medium mt-1">
            اختر أي صنف وحدد سعره المخفض الجديد وفترة الصلاحية، وسيتوقف العرض تلقائياً عند انتهاء المدة
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة عرض جديد ⚡</span>
        </button>
      </div>

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

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم المنتج أو الشارة أو الشركة..."
            className="w-full bg-white border border-slate-300 rounded-2xl py-2.5 pr-10 pl-4 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-blue shadow-xs"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            جميع العروض ({offers.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${
              statusFilter === 'active'
                ? 'bg-rose-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            النشطة حالياً ({activeOffersCount})
          </button>
          <button
            onClick={() => setStatusFilter('expired')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${
              statusFilter === 'expired'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            المنتهية والمتوقفة ({expiredOffersCount})
          </button>
        </div>
      </div>

      {/* Offers Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-bold">جاري تحميل العروض والتخفيضات...</p>
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <Flame className="w-12 h-12 mx-auto text-rose-300" />
            <p className="text-sm font-bold text-slate-700">لا توجد عروض مسجلة تطابق البحث</p>
            <button
              onClick={openAddModal}
              className="bg-brand-blue hover:bg-brand-blueDark text-white font-bold text-xs py-2 px-4 rounded-xl transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة أول عرض الآن</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-black text-[11px]">
                <tr className="divide-x divide-x-reverse divide-slate-200">
                  <th className="py-3 px-4 w-[28%] min-w-[220px]">الصنف والشركة</th>
                  <th className="py-3 px-3 w-[15%] min-w-[130px] text-center">السعر السابق (الأساسي)</th>
                  <th className="py-3 px-3 w-[18%] min-w-[150px] text-center">سعر العرض المخفض 🔥</th>
                  <th className="py-3 px-3 w-[12%] min-w-[100px] text-center">نسبة الخصم والتوفير</th>
                  <th className="py-3 px-3 w-[17%] min-w-[140px] text-center">المدة والصلاحية ⏳</th>
                  <th className="py-3 px-3 w-[10%] min-w-[90px] text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOffers.map((offer) => {
                  const rem = formatRemainingTime(offer.endDate, offer.isActive);
                  const saving = offer.originalPrice - offer.offerPrice;
                  const discountPct = offer.discountPercent || (offer.originalPrice > 0 ? Math.round((saving / offer.originalPrice) * 100) : 0);

                  return (
                    <tr
                      key={offer.id}
                      className={`hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100 ${
                        !offer.isActive || rem.isExpired ? 'opacity-70 bg-slate-50/50' : ''
                      }`}
                    >
                      {/* Product details */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={offer.productImage || 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=200'}
                            alt={offer.productName}
                            className="w-12 h-12 object-contain rounded-2xl bg-slate-50 border border-slate-200 p-1 shrink-0"
                          />
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-900 text-xs sm:text-sm">{offer.productName}</span>
                              <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-2 py-0.5 rounded-md border border-rose-200">
                                {offer.badge || '🔥 عرض خاص'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px]">
                              {offer.company && (
                                <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                  🏢 {offer.company}
                                </span>
                              )}
                              <span className="text-slate-400 font-bold">{offer.category}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Original Base Price */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="space-y-0.5 font-mono">
                          <span className="text-xs font-bold text-slate-400 line-through block">
                            {offer.originalPrice.toLocaleString()} د.ع
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium block">قطعة مفردة</span>
                          {offer.originalWholesalePrice && (
                            <span className="text-[10px] text-slate-400 line-through block pt-0.5">
                              كرتون: {offer.originalWholesalePrice.toLocaleString()} د.ع
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Offer Price */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="space-y-0.5 font-mono">
                          <span className="text-sm font-black text-rose-600 block">
                            {offer.offerPrice.toLocaleString()} د.ع
                          </span>
                          <span className="text-[10px] text-rose-800 font-bold block">سعر العرض للقطعة</span>
                          {offer.offerWholesalePrice && (
                            <span className="text-[11px] font-black text-amber-800 block pt-0.5">
                              كرتون: {offer.offerWholesalePrice.toLocaleString()} د.ع
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Discount & Savings */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="space-y-1">
                          <span className="inline-block bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono font-black text-[11px] px-2 py-0.5 rounded-lg">
                            خصم {discountPct}%
                          </span>
                          {saving > 0 && (
                            <span className="text-[10px] text-emerald-700 font-bold block">
                              توفير {saving.toLocaleString()} د.ع
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Expiration Countdown */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="space-y-1">
                          <span className={`inline-block font-bold text-[10px] px-2.5 py-1 rounded-xl border ${rem.color}`}>
                            {rem.text}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            ينتهي: {new Date(offer.endDate).toLocaleDateString('ar-IQ')} {new Date(offer.endDate).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Active Toggle Switch */}
                          <button
                            onClick={() => handleToggleActive(offer)}
                            className={`p-2 rounded-xl border transition shadow-2xs ${
                              offer.isActive
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-400 border-slate-200'
                            }`}
                            title={offer.isActive ? 'إيقاف العرض مؤقتاً' : 'تفعيل العرض'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => openEditModal(offer)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl border border-slate-200 transition shadow-2xs"
                            title="تعديل السعر أو تمديد التاريخ"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-brand-blue" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(offer.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl border border-red-200 transition shadow-2xs"
                            title="حذف العرض"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* ADD / EDIT OFFER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 text-xs my-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Flame className="w-5 h-5 text-rose-600" />
                <span>{editingOffer ? 'تعديل بيانات العرض والتخفيض' : 'إنشاء وإطلاق عرض جديد ⚡'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              
              {/* 1. Smart Search & Product Selection */}
              <div className="space-y-1.5 relative">
                <label className="font-black text-slate-800 block text-xs flex items-center justify-between">
                  <span>1. ابحث واختر الصنف المطلوب عمل عرض وتخفيض عليه *:</span>
                  {selectedProduct && !editingOffer && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProductId('');
                        setSelectedProduct(null);
                        setProductSearchText('');
                        setIsSearchDropdownOpen(true);
                        setOriginalPrice(0);
                        setOriginalWholesalePrice('');
                        setOfferPrice('');
                        setOfferWholesalePrice('');
                      }}
                      className="text-[10px] text-rose-600 hover:underline font-bold"
                    >
                      تغيير الصنف ↺
                    </button>
                  )}
                </label>

                {/* Search Input Box */}
                <div className="relative">
                  <input
                    type="text"
                    disabled={Boolean(editingOffer)}
                    value={productSearchText}
                    onChange={(e) => {
                      setProductSearchText(e.target.value);
                      setIsSearchDropdownOpen(true);
                      if (!e.target.value.trim()) {
                        setSelectedProductId('');
                        setSelectedProduct(null);
                        setOriginalPrice(0);
                        setOriginalWholesalePrice('');
                      }
                    }}
                    onFocus={() => {
                      if (!editingOffer) setIsSearchDropdownOpen(true);
                    }}
                    placeholder="🔍 ابحث بالاسم أو الشركة أو القسم... (مثال: رقائق، عصير، شيبس، التونسا...)"
                    className={`w-full border-2 rounded-2xl py-3 pr-10 pl-10 text-xs font-bold text-slate-900 transition-all ${
                      selectedProduct
                        ? 'bg-emerald-50/60 border-emerald-400 focus:bg-white'
                        : 'bg-slate-50 border-slate-300 focus:bg-white focus:border-brand-blue shadow-xs'
                    }`}
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  
                  {productSearchText && !editingOffer && (
                    <button
                      type="button"
                      onClick={() => {
                        setProductSearchText('');
                        setSelectedProductId('');
                        setSelectedProduct(null);
                        setOriginalPrice(0);
                        setOriginalWholesalePrice('');
                        setOfferPrice('');
                        setOfferWholesalePrice('');
                        setIsSearchDropdownOpen(true);
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Smart Search Filtered Results Dropdown */}
                {isSearchDropdownOpen && !editingOffer && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-2xl border-2 border-brand-blue shadow-2xl max-h-64 overflow-y-auto p-1.5 space-y-1">
                    {(() => {
                      const q = productSearchText.toLowerCase().trim();
                      const matches = products.filter(
                        (p) =>
                          !q ||
                          p.name.toLowerCase().includes(q) ||
                          (p.company && p.company.toLowerCase().includes(q)) ||
                          p.category.toLowerCase().includes(q)
                      );

                      if (matches.length === 0) {
                        return (
                          <div className="p-4 text-center text-slate-400 text-xs font-bold">
                            لا توجد منتجات تطابق كلمة البحث &quot;{productSearchText}&quot;
                          </div>
                        );
                      }

                      return matches.map((p) => {
                        const isSel = selectedProductId === p.id;
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => handleSelectProduct(p)}
                            className={`w-full text-right p-2.5 rounded-xl transition flex items-center justify-between gap-3 border ${
                              isSel
                                ? 'bg-sky-50 border-brand-blue shadow-xs'
                                : 'bg-white hover:bg-slate-50 border-slate-100 hover:border-sky-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={p.images[0] || 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=100'}
                                alt={p.name}
                                className="w-10 h-10 rounded-xl object-contain bg-slate-50 border border-slate-200 p-0.5 shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="font-black text-slate-900 text-xs block truncate">{p.name}</span>
                                <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                                  {p.company && (
                                    <span className="text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded-md font-bold">
                                      🏢 {p.company}
                                    </span>
                                  )}
                                  <span className="text-slate-500 font-bold">{p.category}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-left font-mono shrink-0">
                              <span className="text-xs font-black text-slate-900 block">{p.price.toLocaleString()} د.ع</span>
                              {p.wholesalePrice && (
                                <span className="text-[10px] text-slate-400 font-bold block">
                                  جملة: {p.wholesalePrice.toLocaleString()} د.ع
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Selected Product Card (if selected) */}
                {selectedProduct && (
                  <div className="bg-emerald-50/80 border border-emerald-300 rounded-2xl p-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={selectedProduct.images[0]}
                        alt={selectedProduct.name}
                        className="w-9 h-9 rounded-xl object-contain bg-white border border-emerald-200 p-0.5 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-black text-emerald-950 block truncate">
                          ✓ {selectedProduct.name}
                        </span>
                        <span className="text-[10px] text-emerald-800 font-bold block">
                          {selectedProduct.company ? `${selectedProduct.company} - ` : ''}{selectedProduct.category}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-black font-mono text-emerald-900 bg-white px-2.5 py-1 rounded-xl border border-emerald-200 shrink-0">
                      السعر الحالي: {selectedProduct.price.toLocaleString()} د.ع
                    </span>
                  </div>
                )}
              </div>

              {/* 2. Auto-Fetched Regular Base Price Display (معلومات السعر الأصلي الحالي) */}
              <div className="bg-sky-50/70 p-3.5 rounded-2xl border border-sky-200 space-y-2">
                <span className="font-black text-sky-950 text-xs block flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-600" />
                  <span>السعر الأساسي المسجل للصنف (تم جلبه تلقائياً من النظام):</span>
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-2.5 rounded-xl border border-sky-200">
                    <span className="text-[10px] text-slate-500 font-bold block">سعر المفرد المسجل (السابق):</span>
                    <span className="text-sm font-black font-mono text-slate-900">
                      {selectedProductId ? `${originalPrice.toLocaleString()} د.ع` : '--- (بانتظار اختيار الصنف)'}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-sky-200">
                    <span className="text-[10px] text-slate-500 font-bold block">سعر كرتون الجملة المسجل:</span>
                    <span className="text-sm font-black font-mono text-slate-900">
                      {selectedProductId ? (originalWholesalePrice ? `${Number(originalWholesalePrice).toLocaleString()} د.ع` : 'غير محدد') : '---'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. New Offer Prices Inputs */}
              <div className="bg-rose-50/60 p-3.5 rounded-2xl border border-rose-200 space-y-3">
                <span className="font-black text-rose-950 text-xs block flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-rose-600" />
                  <span>أسعار العرض المخفضة الجديدة (د.ع):</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Retail Offer Price */}
                  <div className="space-y-1">
                    <label className="font-black text-rose-900 block text-xs">
                      سعر العرض للقطعة المفردة * (د.ع):
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={offerPrice}
                      onChange={(e) => setOfferPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="مثال: 400"
                      className="w-full bg-white border-2 border-rose-400 rounded-xl py-2 px-3 text-xs font-black font-mono text-rose-950 focus:border-rose-600 shadow-xs"
                    />
                    <span className="text-[10px] text-rose-700 font-bold block">السعر المخفض الذي سيظهر للزبون</span>
                  </div>

                  {/* Wholesale Offer Price */}
                  <div className="space-y-1">
                    <label className="font-bold text-amber-900 block text-xs">
                      سعر العرض لكرتون الجملة (اختياري):
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={offerWholesalePrice}
                      onChange={(e) => setOfferWholesalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="مثال: 7000"
                      className="w-full bg-white border border-amber-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-amber-950 focus:border-amber-500"
                    />
                    <span className="text-[10px] text-amber-700 block">إذا كان العرض يشمل كراتين الجملة أيضاً</span>
                  </div>
                </div>

                {/* Realtime Savings Calculator Indicator */}
                {savingAmount > 0 && (
                  <div className="bg-emerald-100/90 border border-emerald-300 p-2.5 rounded-xl flex items-center justify-between text-emerald-900 font-black text-xs">
                    <span>🎉 نسبة الخصم: <strong className="text-sm font-mono">{savingPercent}%</strong></span>
                    <span>💰 توفير: <strong className="text-sm font-mono">{savingAmount.toLocaleString()} د.ع</strong> بالقطعة!</span>
                  </div>
                )}
              </div>

              {/* 4. Duration & Expiration Setup (تاريخ الانتهاء والتوقف التلقائي) */}
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-800 block text-xs flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-brand-blue" />
                    <span>تاريخ ووقت انتهاء العرض (يتوقف تلقائياً) *:</span>
                  </label>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-slate-500 font-bold">مدة جاهزة:</span>
                  <button
                    type="button"
                    onClick={() => setEndDate(getDefaultEndDate(3))}
                    className="bg-white hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-300 font-bold text-[10px] transition"
                  >
                    ⚡ 3 أيام
                  </button>
                  <button
                    type="button"
                    onClick={() => setEndDate(getDefaultEndDate(7))}
                    className="bg-white hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-300 font-bold text-[10px] transition"
                  >
                    📅 أسبوع كامل
                  </button>
                  <button
                    type="button"
                    onClick={() => setEndDate(getDefaultEndDate(15))}
                    className="bg-white hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-300 font-bold text-[10px] transition"
                  >
                    🗓️ 15 يوم
                  </button>
                  <button
                    type="button"
                    onClick={() => setEndDate(getDefaultEndDate(30))}
                    className="bg-white hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-300 font-bold text-[10px] transition"
                  >
                    📆 شهر كامل
                  </button>
                </div>

                {/* Date Input */}
                <input
                  type="datetime-local"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-slate-900 focus:border-brand-blue"
                  dir="ltr"
                />
                <span className="text-[10px] text-slate-500 font-bold block">
                  عند بلوغ هذا الوقت، سيعود المنتج لسعره الطبيعي تلقائياً بدون الحاجة لأي تعديل يدوي.
                </span>
              </div>

              {/* 5. Badge Text & Quick Chips */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block text-xs">
                  نص شارة العرض (تظهر كعلامة بارزة على المنتج):
                </label>
                <div className="flex items-center gap-1.5 flex-wrap pb-1">
                  {['🔥 عرض خاص', '⚡ خصم اليوم', '⭐ عرض الأسبوع', '📦 تصفية مخزون', '👑 عرض الماركت'].map((b) => (
                    <button
                      type="button"
                      key={b}
                      onClick={() => setBadge(b)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition ${
                        badge === b ? 'bg-rose-500 text-white border-rose-600' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  placeholder="مثال: 🔥 عرض خاص"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                />
              </div>

              {/* Submit / Cancel Buttons */}
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
                  <span>{editingOffer ? 'حفظ تعديلات العرض ✅' : 'إطلاق وتفعيل العرض الآن 🚀'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
