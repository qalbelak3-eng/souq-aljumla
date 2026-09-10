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
  Crown,
  Gift,
  RotateCw,
  Palette,
  Settings2,
  Sliders
} from 'lucide-react';
import { Product, ProductOffer, Coupon, LuckyWheelPrize, LuckyWheelSettings, StoreSettings } from '@/types';
import { initialLuckyWheelSettings } from '@/data/initialData';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';

export default function AdminOffersPage() {
  const toast = useToast();
  const { confirm } = useConfirm();

  // Tab State: Product Flash Offers VS Promotional Coupons VS Lucky Wheel VS Suggested Cart Upsells
  const [activeTab, setActiveTab] = useState<'products' | 'coupons' | 'lucky_wheel' | 'suggested'>('products');

  const [offers, setOffers] = useState<ProductOffer[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_offers_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return [];
  });
  const [coupons, setCoupons] = useState<Coupon[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_coupons_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });
  const [products, setProducts] = useState<Product[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_products_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_offers_cache');
        if (cached && JSON.parse(cached).length > 0) return false;
      } catch (e) {}
    }
    return true;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Suggested Cart Products State (أضف لطلبك)
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [enableSuggested, setEnableSuggested] = useState(true);
  const [suggestedTitle, setSuggestedTitle] = useState('أضف إلى طلبك ✨');
  const [selectedSuggestedIds, setSelectedSuggestedIds] = useState<string[]>([]);
  const [suggestedSearch, setSuggestedSearch] = useState('');
  const [suggestedCategoryFilter, setSuggestedCategoryFilter] = useState<string>('all');
  const [isSavingSuggested, setIsSavingSuggested] = useState(false);

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

  // Lucky Wheel State
  const [luckyWheelSettings, setLuckyWheelSettings] = useState<LuckyWheelSettings>(initialLuckyWheelSettings);
  const [isSavingWheel, setIsSavingWheel] = useState(false);
  const [isPrizeModalOpen, setIsPrizeModalOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<LuckyWheelPrize | null>(null);

  // Prize Form Fields
  const [prizeLabel, setPrizeLabel] = useState('');
  const [prizeSubLabel, setPrizeSubLabel] = useState('');
  const [prizeType, setPrizeType] = useState<'cashback' | 'coupon' | 'delivery' | 'try_again'>('cashback');
  const [prizeValue, setPrizeValue] = useState<number | string>(500);
  const [prizeCouponCode, setPrizeCouponCode] = useState('');
  const [prizeColor, setPrizeColor] = useState('#16a34a');
  const [prizeProbability, setPrizeProbability] = useState<number>(20);

  const fetchData = async (isSilent = false) => {
    if (!isSilent) {
      if (offers.length === 0) setIsLoading(true);
      if (offers.length > 0) setIsRefreshing(true);
    }
    try {
      const [offersRes, productsRes, couponsRes, wheelRes, settingsRes] = await Promise.all([
        fetch('/api/offers', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/products', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/coupons', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/lucky-wheel', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
      ]);

      if (offersRes?.success) {
        setOffers(offersRes.offers || []);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('souq_admin_offers_cache', JSON.stringify(offersRes.offers || []));
          } catch (e) {}
        }
      }
      if (productsRes?.success) {
        setProducts(productsRes.products || []);
        if (typeof window !== 'undefined') {
          try {
            const lightProds = (productsRes.products || []).slice(0, 100).map((p: any) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              company: p.company,
              price: p.price,
              wholesalePrice: p.wholesalePrice,
              boxPrice: p.boxPrice,
              images: Array.isArray(p.images) && p.images.length > 0 ? [p.images[0]] : p.image ? [p.image] : [],
            }));
            localStorage.setItem('souq_admin_products_cache', JSON.stringify(lightProds));
          } catch (e) {}
        }
      }
      if (couponsRes?.success) {
        setCoupons(couponsRes.coupons || []);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('souq_admin_coupons_cache', JSON.stringify(couponsRes.coupons || []));
          } catch (e) {}
        }
      }
      if (wheelRes?.success && wheelRes.settings) setLuckyWheelSettings(wheelRes.settings);
      if (settingsRes?.success && settingsRes.settings) {
        setStoreSettings(settingsRes.settings);
        setEnableSuggested(settingsRes.settings.enableSuggestedProducts ?? true);
        setSuggestedTitle(settingsRes.settings.suggestedProductsTitle || 'أضف إلى طلبك ✨');
        setSelectedSuggestedIds(settingsRes.settings.suggestedProductIds || []);
      }
    } catch (err) {
      console.error(err);
      if (!isSilent) {
        toast.error('حدث خطأ أثناء تحميل بيانات العروض والكوبونات');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
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

    let validExpiresAt: string | undefined = undefined;
    if (couponExpiresAt) {
      try {
        const d = new Date(couponExpiresAt);
        if (!isNaN(d.getTime())) {
          validExpiresAt = d.toISOString();
        }
      } catch (e) {}
    }

    const payload = {
      id: editingCoupon?.id,
      code: couponCode.trim().toUpperCase(),
      discountType: couponDiscountType,
      discountValue: Number(couponDiscountValue),
      minOrderAmount: couponMinOrderAmount !== '' ? Number(couponMinOrderAmount) : undefined,
      targetAudience: couponTargetAudience,
      description: couponDescription.trim(),
      expiresAt: validExpiresAt,
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
      if (data.success && data.coupon) {
        if (editingCoupon) {
          setCoupons((prev) => prev.map((c) => (c.id === data.coupon.id || c.code === data.coupon.code ? data.coupon : c)));
        } else {
          setCoupons((prev) => [data.coupon, ...prev.filter((c) => c.code !== data.coupon.code)]);
        }
        if (typeof window !== 'undefined') {
          try {
            const cached = localStorage.getItem('souq_admin_coupons_cache');
            const list = cached ? JSON.parse(cached) : [];
            const updated = [data.coupon, ...list.filter((c: any) => c.code !== data.coupon.code && c.id !== data.coupon.id)];
            localStorage.setItem('souq_admin_coupons_cache', JSON.stringify(updated));
          } catch (e) {}
        }
        setIsCouponModalOpen(false);
        toast.success(editingCoupon ? 'تم حفظ تعديلات كود الخصم بنجاح ✨' : 'تم إنشاء كود الخصم الجديد بنجاح 🚀');
        fetchData(true);
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
    setCoupons((prev) => prev.map((item) => (item.code === c.code ? { ...item, isActive: newStatus } : item)));
    try {
      const res = await fetch('/api/coupons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, code: c.code, isActive: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(newStatus ? `تم تفعيل كود الخصم ${c.code} ✅` : `تم إيقاف كود الخصم ${c.code} ⏸️`);
        if (typeof window !== 'undefined') {
          try {
            const cached = localStorage.getItem('souq_admin_coupons_cache');
            if (cached) {
              const list = JSON.parse(cached);
              const updated = list.map((item: any) => (item.code === c.code ? { ...item, isActive: newStatus } : item));
              localStorage.setItem('souq_admin_coupons_cache', JSON.stringify(updated));
            }
          } catch (e) {}
        }
      } else {
        setCoupons((prev) => prev.map((item) => (item.code === c.code ? { ...item, isActive: !newStatus } : item)));
      }
    } catch (err) {
      console.error(err);
      setCoupons((prev) => prev.map((item) => (item.code === c.code ? { ...item, isActive: !newStatus } : item)));
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

    setCoupons((prev) => prev.filter((item) => item.code !== c.code));
    try {
      const res = await fetch(`/api/coupons?code=${encodeURIComponent(c.code)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.info('تم حذف كود الخصم بنجاح');
        if (typeof window !== 'undefined') {
          try {
            const cached = localStorage.getItem('souq_admin_coupons_cache');
            if (cached) {
              const list = JSON.parse(cached);
              const updated = list.filter((item: any) => item.code !== c.code);
              localStorage.setItem('souq_admin_coupons_cache', JSON.stringify(updated));
            }
          } catch (e) {}
        }
      } else {
        fetchData(true);
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حذف الكوبون');
      fetchData(true);
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

  // --- Lucky Wheel Handlers ---
  const handleSaveLuckyWheelSettings = async (newSettings: LuckyWheelSettings) => {
    setIsSavingWheel(true);
    try {
      const res = await fetch('/api/lucky-wheel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      const data = await res.json();
      if (data.success) {
        setLuckyWheelSettings(data.settings);
        toast.success(data.message || 'تم حفظ إعدادات چرخ الحظ بنجاح! 🎡');
      } else {
        toast.error(data.error || 'حدث خطأ أثناء حفظ الإعدادات');
      }
    } catch {
      toast.error('تعذر الاتصال بالسيرفر لحفظ الإعدادات');
    } finally {
      setIsSavingWheel(false);
    }
  };

  const openAddPrizeModal = () => {
    setEditingPrize(null);
    setPrizeLabel('');
    setPrizeSubLabel('');
    setPrizeType('cashback');
    setPrizeValue(500);
    setPrizeCouponCode('');
    setPrizeColor('#16a34a');
    setPrizeProbability(20);
    setIsPrizeModalOpen(true);
  };

  const openEditPrizeModal = (prize: LuckyWheelPrize) => {
    setEditingPrize(prize);
    setPrizeLabel(prize.label);
    setPrizeSubLabel(prize.subLabel);
    setPrizeType(prize.type);
    setPrizeValue(prize.value);
    setPrizeCouponCode(prize.couponCode || '');
    setPrizeColor(prize.color);
    setPrizeProbability(prize.probability);
    setIsPrizeModalOpen(true);
  };

  const handleSavePrize = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prizeLabel.trim()) {
      toast.error('يرجى كتابة عنوان الجائزة');
      return;
    }

    const newPrize: LuckyWheelPrize = {
      id: editingPrize?.id || `p-${Date.now()}`,
      label: prizeLabel.trim(),
      subLabel: prizeSubLabel.trim() || (prizeType === 'cashback' ? 'رصيد أرباح 💰' : prizeType === 'coupon' ? 'كوبون خصم 🏷️' : 'حاول غداً 🍀'),
      type: prizeType,
      value: prizeType === 'cashback' ? Number(prizeValue) || 0 : prizeValue,
      couponCode: prizeType === 'coupon' ? (prizeCouponCode.trim().toUpperCase() || undefined) : undefined,
      color: prizeColor,
      textColor: '#ffffff',
      probability: Number(prizeProbability) || 10,
    };

    let updatedPrizes: LuckyWheelPrize[] = [];
    if (editingPrize) {
      updatedPrizes = luckyWheelSettings.prizes.map((p) => (p.id === editingPrize.id ? newPrize : p));
    } else {
      updatedPrizes = [...luckyWheelSettings.prizes, newPrize];
    }

    const updatedSettings: LuckyWheelSettings = {
      ...luckyWheelSettings,
      prizes: updatedPrizes,
    };

    setLuckyWheelSettings(updatedSettings);
    handleSaveLuckyWheelSettings(updatedSettings);
    setIsPrizeModalOpen(false);
  };

  const handleDeletePrize = async (prizeId: string) => {
    const isConfirmed = await confirm({
      title: 'حذف شريحة الجائزة من العجلة',
      message: 'هل أنت متأكد من رغبتك في حذف هذا القطاع من چرخ الحظ؟',
      confirmText: 'نعم، احذف',
      type: 'danger',
    });

    if (isConfirmed) {
      const updatedPrizes = luckyWheelSettings.prizes.filter((p) => p.id !== prizeId);
      const updatedSettings = { ...luckyWheelSettings, prizes: updatedPrizes };
      setLuckyWheelSettings(updatedSettings);
      handleSaveLuckyWheelSettings(updatedSettings);
    }
  };

  const handleResetWheelToDefault = async () => {
    const isConfirmed = await confirm({
      title: 'استعادة جوائز چرخ الحظ الافتراضية',
      message: 'هل تريد إعادة ضبط جميع قطاعات وجوائز العجلة إلى التشكيلة القياسية الافتراضية؟',
      confirmText: 'نعم، استعادة الافتراضي',
      type: 'warning',
    });

    if (isConfirmed) {
      const resetSettings: LuckyWheelSettings = {
        ...luckyWheelSettings,
        prizes: initialLuckyWheelSettings.prizes,
      };
      setLuckyWheelSettings(resetSettings);
      handleSaveLuckyWheelSettings(resetSettings);
    }
  };

  // --- Suggested Cart Products Handlers (أضف لطلبك) ---
  const handleToggleSuggestedProduct = (productId: string) => {
    setSelectedSuggestedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleSaveSuggestedProducts = async () => {
    setIsSavingSuggested(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableSuggestedProducts: enableSuggested,
          suggestedProductsTitle: suggestedTitle.trim() || 'أضف إلى طلبك ✨',
          suggestedProductIds: selectedSuggestedIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStoreSettings(data.settings);
        toast.success('تم حفظ منتجات "أضف إلى طلبك" المقترحة بنجاح! 🛒✨');
      } else {
        toast.error(data.error || 'حدث خطأ أثناء حفظ الإعدادات');
      }
    } catch {
      toast.error('تعذر الاتصال بالسيرفر لحفظ الإعدادات');
    } finally {
      setIsSavingSuggested(false);
    }
  };

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
              قسم إدارة التخفيضات والكوبونات والمقترحات 🔥
            </span>
          </div>
          <h1 className="text-base sm:text-xl font-black mt-1.5 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <span>إدارة العروض وأكواد الخصم والمنتجات المقترحة</span>
          </h1>
          <p className="text-xs text-rose-200/90 font-medium mt-1">
            أنشئ عروض أسعار موقوتة، أصدر أكواد خصم (كوبونات)، خصص عجلة الحظ، أو اختر المنتجات المقترحة "أضف لطلبك" في السلة
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'products' && (
            <button
              onClick={openAddModal}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة عرض صنف جديد ⚡</span>
            </button>
          )}
          {activeTab === 'coupons' && (
            <button
              onClick={openAddCouponModal}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء كود خصم جديد 🎟️</span>
            </button>
          )}
          {activeTab === 'lucky_wheel' && (
            <button
              onClick={openAddPrizeModal}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة جائزة جديدة 🎡</span>
            </button>
          )}
          {activeTab === 'suggested' && (
            <button
              onClick={handleSaveSuggestedProducts}
              disabled={isSavingSuggested}
              className="bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSavingSuggested ? 'جاري الحفظ...' : 'حفظ منتجات السلة 💾'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 bg-slate-200/70 p-1.5 rounded-2xl border border-slate-300/60 max-w-4xl flex-wrap sm:flex-nowrap">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'products'
              ? 'bg-white text-rose-700 shadow-xs ring-2 ring-rose-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>عروض الأصناف ({offers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('coupons')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'coupons'
              ? 'bg-white text-amber-700 shadow-xs ring-2 ring-amber-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>كوبونات الخصم ({coupons.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('lucky_wheel')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'lucky_wheel'
              ? 'bg-white text-purple-700 shadow-xs ring-2 ring-purple-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>چرخ الحظ والجوائز 🎡</span>
        </button>

        <button
          onClick={() => setActiveTab('suggested')}
          className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'suggested'
              ? 'bg-white text-emerald-700 shadow-xs ring-2 ring-emerald-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>أضف لطلبك (مقترحات السلة) 🛒 ({selectedSuggestedIds.length})</span>
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
          {isRefreshing && (
            <div className="h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500 animate-pulse rounded-full mb-2" />
          )}
          {isLoading && offers.length === 0 ? (
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
                              src={o.productImage || prod?.images?.[0] || 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=800'}
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
          {isRefreshing && (
            <div className="h-1 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 animate-pulse rounded-full mb-2" />
          )}
          {isLoading && coupons.length === 0 ? (
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
      {/* TAB 3: LUCKY WHEEL & PRIZES MANAGEMENT (چرخ الحظ) */}
      {/* ======================================================== */}
      {activeTab === 'lucky_wheel' && (
        <div className="space-y-6">
          {/* Main Control Card */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center text-2xl shadow-md shrink-0">
                  🎡
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <span>إعدادات ونظام چرخ الحظ التفاعلي</span>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black ${luckyWheelSettings.isEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                      {luckyWheelSettings.isEnabled ? 'نشط في المتجر ✅' : 'معطل مؤقتاً ⏸️'}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    تحكم بالجوائز ونسب الفوز وأكواد الخصم التي يربحها الزبائن عند تدوير العجلة
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Reset to defaults button */}
                <button
                  type="button"
                  onClick={handleResetWheelToDefault}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  title="استعادة التشكيلة الافتراضية للجوائز"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>استعادة الافتراضي</span>
                </button>

                {/* Add prize button */}
                <button
                  type="button"
                  onClick={openAddPrizeModal}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-black text-xs py-2 px-3.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة جائزة جديدة ➕</span>
                </button>
              </div>
            </div>

            {/* Quick Settings Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              {/* 1. Toggle Wheel Status */}
              <div
                onClick={() => {
                  const updated = { ...luckyWheelSettings, isEnabled: !luckyWheelSettings.isEnabled };
                  setLuckyWheelSettings(updated);
                  handleSaveLuckyWheelSettings(updated);
                }}
                className={`border-2 rounded-2xl p-3.5 flex items-center justify-between cursor-pointer transition-all duration-200 select-none ${
                  luckyWheelSettings.isEnabled
                    ? 'bg-emerald-50/90 border-emerald-400 shadow-xs ring-2 ring-emerald-500/20'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-2xs shrink-0 ${
                      luckyWheelSettings.isEnabled
                        ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-black text-xs text-slate-900 block">ظهور العجلة في المتجر:</span>
                    <span className={`text-[10px] font-bold ${luckyWheelSettings.isEnabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {luckyWheelSettings.isEnabled ? 'مفعلة وتظهر للزبائن الآن' : 'معطلة ومخفية عن الزبائن'}
                    </span>
                  </div>
                </div>

                <div
                  className={`flex items-center gap-1.5 font-black text-xs px-3 py-1.5 rounded-xl border shadow-2xs transition-all ${
                    luckyWheelSettings.isEnabled
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-slate-200 text-slate-600 border-slate-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${luckyWheelSettings.isEnabled ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
                  <span>{luckyWheelSettings.isEnabled ? 'تشغيل ✅' : 'إيقاف ⏸️'}</span>
                </div>
              </div>

              {/* 2. Cooldown Duration */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-black text-xs text-slate-900 block">تكرار التدوير المجاني:</span>
                  <span className="text-[10px] text-slate-500">كل كم ساعة يحق للزبون التدوير</span>
                </div>
                <select
                  value={luckyWheelSettings.cooldownHours || 24}
                  onChange={(e) => {
                    const updated = { ...luckyWheelSettings, cooldownHours: Number(e.target.value) };
                    setLuckyWheelSettings(updated);
                    handleSaveLuckyWheelSettings(updated);
                  }}
                  className="bg-white border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:border-purple-500 cursor-pointer"
                >
                  <option value={6}>كل 6 ساعات (4 مرات يومياً)</option>
                  <option value={12}>كل 12 ساعة (مرتان يومياً)</option>
                  <option value={24}>كل 24 ساعة (مرة يومياً - قياسي)</option>
                  <option value={48}>كل 48 ساعة (مرة كل يومين)</option>
                </select>
              </div>

              {/* 3. Summary Stats */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-around sm:col-span-2 lg:col-span-1">
                <div className="text-center">
                  <span className="text-[10px] font-bold text-slate-500 block">عدد الجوائز</span>
                  <span className="text-base font-black text-purple-700 font-mono">{luckyWheelSettings.prizes?.length || 0}</span>
                </div>
                <div className="w-px h-8 bg-slate-200" />
                <div className="text-center">
                  <span className="text-[10px] font-bold text-slate-500 block">مجموع الأوزان</span>
                  <span className="text-base font-black text-slate-800 font-mono">
                    {(luckyWheelSettings.prizes || []).reduce((acc, p) => acc + (Number(p.probability) || 0), 0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Slices & Prizes Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>قطاعات وجوائز العجلة ({luckyWheelSettings.prizes?.length || 0} قطاع)</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  (تُرتب القطاعات في العجلة بحسب الترتيب التالي)
                </span>
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {(luckyWheelSettings.prizes || []).map((prize, idx) => {
                const totalProb = (luckyWheelSettings.prizes || []).reduce((acc, p) => acc + (Number(p.probability) || 0), 0) || 1;
                const percent = Math.round(((Number(prize.probability) || 0) / totalProb) * 100);

                return (
                  <div
                    key={prize.id || idx}
                    className="bg-white border border-slate-200/90 hover:border-purple-300 rounded-2xl p-4 shadow-2xs hover:shadow-md transition space-y-3 relative overflow-hidden group"
                  >
                    {/* Top Color Accent Bar */}
                    <div
                      className="absolute top-0 left-0 right-0 h-1.5"
                      style={{ backgroundColor: prize.color }}
                    />

                    <div className="flex items-start justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        {/* Slice color indicator bubble */}
                        <div
                          className="w-7 h-7 rounded-xl shadow-xs flex items-center justify-center text-white text-xs font-black shrink-0 border border-white/40 font-mono"
                          style={{ backgroundColor: prize.color }}
                        >
                          #{idx + 1}
                        </div>
                        <div>
                          <h4 className="font-black text-xs text-slate-900 leading-tight">
                            {prize.label}
                          </h4>
                          <span className="text-[10px] text-slate-500 font-bold block">
                            {prize.subLabel}
                          </span>
                        </div>
                      </div>

                      {/* Prize Type Badge */}
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        prize.type === 'cashback'
                          ? 'bg-emerald-100 text-emerald-800'
                          : prize.type === 'coupon'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {prize.type === 'cashback' ? '💰 كاش باك' : prize.type === 'coupon' ? '🎟️ كوبون' : '🍀 حظ أوفر'}
                      </span>
                    </div>

                    {/* Prize Value / Coupon Code Details */}
                    <div className="bg-slate-50 rounded-xl p-2 text-[11px] font-mono flex items-center justify-between border border-slate-100">
                      <span className="text-slate-500 font-bold text-[10px]">القيمة / الكود:</span>
                      {prize.type === 'cashback' && (
                        <span className="font-black text-emerald-700">+{Number(prize.value).toLocaleString()} د.ع</span>
                      )}
                      {prize.type === 'coupon' && (
                        <span className="font-black text-amber-800 bg-amber-200/60 px-1.5 py-0.5 rounded border border-amber-300">
                          {prize.couponCode || prize.value || 'كوبون'}
                        </span>
                      )}
                      {prize.type === 'try_again' && (
                        <span className="text-slate-500 font-bold">بدون جائزة</span>
                      )}
                    </div>

                    {/* Probability / Win Chance Meter */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-slate-500">نسبة فرصة الربح (الوزن):</span>
                        <span className="text-purple-700 font-mono font-black">{prize.probability} ({percent}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, percent)}%`,
                            backgroundColor: prize.color,
                          }}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditPrizeModal(prize)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-700 transition cursor-pointer"
                          title="تعديل تفاصيل الجائزة"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePrize(prize.id)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 transition cursor-pointer"
                          title="حذف الجائزة من العجلة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="text-[10px] font-mono text-slate-400">
                        {prize.color}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: SUGGESTED UPSELL PRODUCTS (أضف لطلبك) */}
      {/* ======================================================== */}
      {activeTab === 'suggested' && (
        <div className="space-y-6">
          {/* Main Overview & Explanation Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-emerald-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-black text-2xl shadow-xs">
                  🛒
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-black text-slate-900">
                      إدارة شريط (أضف إلى طلبك) المقترح في السلة
                    </h2>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-200">
                      زيادة المبيعات والطلب 🚀
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    اختر المنتجات التي تريد عرضها بشكل مميز أسفل السلة وفي نافذة الشراء السريع لتشجيع الزبائن على إضافتها بنقرة واحدة
                  </p>
                </div>
              </div>

              {/* Master Toggle & Save Button */}
              <div className="flex items-center gap-3 self-end sm:self-center flex-wrap sm:flex-nowrap">
                {/* Modern Luxury Toggle Button */}
                <button
                  type="button"
                  onClick={() => setEnableSuggested(!enableSuggested)}
                  className={`py-2 px-3.5 rounded-2xl border transition-all duration-200 flex items-center gap-3 select-none cursor-pointer shadow-xs active:scale-95 ${
                    enableSuggested
                      ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex flex-col text-right leading-tight">
                    <span className="text-[10px] text-slate-500 font-bold">حالة شريط المقترحات:</span>
                    <span className={`text-xs font-black flex items-center gap-1 ${enableSuggested ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {enableSuggested ? 'مفعل ويظهر للزبائن 🟢' : 'معطل ومخفي 🔴'}
                    </span>
                  </div>

                  {/* iOS Style Smooth Toggle Track */}
                  <div
                    className={`w-12 h-6 rounded-full transition-colors duration-300 flex items-center px-0.5 shrink-0 ${
                      enableSuggested ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                    dir="ltr"
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                        enableSuggested ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    >
                      {enableSuggested ? (
                        <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                      ) : (
                        <X className="w-3 h-3 text-slate-400 stroke-[3]" />
                      )}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleSaveSuggestedProducts}
                  disabled={isSavingSuggested}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 px-5 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingSuggested ? 'جاري الحفظ...' : 'حفظ التغييرات 💾'}</span>
                </button>
              </div>
            </div>

            {/* Customization Settings Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
              <div className="space-y-1">
                <label className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                  <span>عنوان القسم كما يظهر للزبون:</span>
                  <span className="text-emerald-600 text-[10px]">(مثال: أضف إلى طلبك ✨ أو منتجات نوصي بها)</span>
                </label>
                <input
                  type="text"
                  value={suggestedTitle}
                  onChange={(e) => setSuggestedTitle(e.target.value)}
                  placeholder="أضف إلى طلبك ✨"
                  className="w-full bg-white border border-emerald-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:border-emerald-600 shadow-2xs"
                />
              </div>

              <div className="space-y-1 flex flex-col justify-center">
                <span className="text-[11px] font-bold text-slate-600">
                  💡 <strong className="text-slate-900">نصيحة تجارية لزيادة الأرباح:</strong>
                </span>
                <p className="text-[11px] text-slate-500 font-medium">
                  اختر منتجات عليها طلب مستمر، أو أصناف ذات مخزون وفير ترغب في تصريفها، أو ملحقات ومنتجات سريعة الإضافة بأسعار مناسبة.
                </p>
              </div>
            </div>
          </div>

          {/* Currently Selected Products (الأصناف المحددة حالياً) */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                  {selectedSuggestedIds.length}
                </span>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900">
                    الأصناف المقترحة المختارة حالياً ({selectedSuggestedIds.length} صنف)
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    هذه المنتجات ستظهر في السلة للشراء السريع بنقرة واحدة
                  </p>
                </div>
              </div>

              {selectedSuggestedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedSuggestedIds([])}
                  className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 font-bold text-[11px] py-1 px-3 rounded-xl transition cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تفريغ القائمة</span>
                </button>
              )}
            </div>

            {selectedSuggestedIds.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                <Package className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="text-xs font-bold text-slate-700">لم تقم باختيار أي منتجات محددة بعد</h4>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                  اختر من قائمة المنتجات بالأسفل بالنقر على زر "+ إضافة للشريط"، أو سيعتمد المتجر تلقائياً على المنتجات المميزة.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {selectedSuggestedIds.map((id, index) => {
                  const prod = products.find((p) => p.id === id);
                  if (!prod) return null;
                  return (
                    <div
                      key={id}
                      className="bg-emerald-50/40 border border-emerald-200 rounded-2xl p-2.5 flex flex-col justify-between space-y-2 relative group hover:shadow-xs transition"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleSuggestedProduct(id)}
                        className="absolute -top-1.5 -left-1.5 z-20 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-black shadow-md hover:scale-110 cursor-pointer transition transform active:scale-95 border-2 border-white"
                        title="إزالة من المقترحات"
                      >
                        ✕
                      </button>

                      <div className="space-y-1.5">
                        <div className="relative aspect-square rounded-xl bg-white p-1 border border-emerald-100 flex items-center justify-center overflow-hidden">
                          <img
                            src={prod.images?.[0] || '/images/placeholder.png'}
                            alt={prod.name}
                            className="w-full h-full object-contain"
                          />
                          <span className="absolute bottom-1 right-1 bg-slate-900/80 text-white text-[9px] font-mono px-1 rounded">
                            #{index + 1}
                          </span>
                        </div>
                        <h4 className="text-[11px] font-black text-slate-900 line-clamp-2 leading-snug">
                          {prod.name}
                        </h4>
                        <span className="text-[9px] text-slate-500 font-bold block truncate">
                          {prod.company || prod.category}
                        </span>
                      </div>

                      <div className="pt-1.5 border-t border-emerald-100 flex items-center justify-between text-[10px]">
                        <span className="font-mono font-black text-emerald-800">
                          {prod.price.toLocaleString()} د.ع
                        </span>
                        <span className={`text-[9px] font-bold ${prod.stock > 0 ? 'text-slate-500' : 'text-red-500'}`}>
                          المخزون: {prod.stock ?? 0}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Product Catalog & Selector Table */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-slate-900">
                  كتالوج المنتجات للاختيار والإضافة
                </h3>
                <p className="text-[10px] text-slate-500 font-bold">
                  ابحث عن المنتجات واضغط على زر الإضافة لتضمينها في شريط المقترحات
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                <div className="relative flex-1 sm:w-64">
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الشركة..."
                    value={suggestedSearch}
                    onChange={(e) => setSuggestedSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-8 text-xs font-bold focus:bg-white focus:border-emerald-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                </div>

                <select
                  value={suggestedCategoryFilter}
                  onChange={(e) => setSuggestedCategoryFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-800 focus:bg-white"
                >
                  <option value="all">جميع الأقسام</option>
                  {Array.from(new Set(products.map((p) => p.category).filter(Boolean))).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[600px] overflow-y-auto p-1">
              {products
                .filter((p) => {
                  const q = suggestedSearch.toLowerCase().trim();
                  const matchesSearch =
                    !q ||
                    p.name.toLowerCase().includes(q) ||
                    (p.company && p.company.toLowerCase().includes(q));
                  const matchesCategory =
                    suggestedCategoryFilter === 'all' || p.category === suggestedCategoryFilter;
                  return matchesSearch && matchesCategory;
                })
                .map((prod) => {
                  const isSelected = selectedSuggestedIds.includes(prod.id);
                  return (
                    <div
                      key={prod.id}
                      onClick={() => handleToggleSuggestedProduct(prod.id)}
                      className={`p-3 rounded-2xl border transition flex items-center justify-between gap-2.5 cursor-pointer select-none ${
                        isSelected
                          ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-200 shadow-xs'
                          : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 p-1 shrink-0 flex items-center justify-center">
                          <img
                            src={prod.images?.[0] || '/images/placeholder.png'}
                            alt={prod.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-black text-xs text-slate-900 truncate">
                            {prod.name}
                          </h4>
                          <span className="text-[10px] text-slate-500 font-bold block truncate">
                            {prod.company || prod.category}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px]">
                            <span className="font-black text-emerald-700">
                              {prod.price.toLocaleString()} د.ع
                            </span>
                            <span className="text-slate-400">|</span>
                            <span className={`font-bold ${prod.stock > 0 ? 'text-slate-600' : 'text-red-500'}`}>
                              المخزون: {prod.stock ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Select Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSuggestedProduct(prod.id);
                        }}
                        className={`py-1.5 px-3 rounded-xl font-black text-xs transition shrink-0 cursor-pointer flex items-center gap-1 ${
                          isSelected
                            ? 'bg-emerald-600 hover:bg-red-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700'
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>مضاف</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>إضافة</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: ADD / EDIT LUCKY WHEEL PRIZE */}
      {/* ======================================================== */}
      {isPrizeModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 text-xs select-none">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setIsPrizeModalOpen(false)} />

          <div className="relative bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl z-10 border border-slate-100 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-base">
                  🎡
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {editingPrize ? 'تعديل شريحة وجائزة العجلة' : 'إضافة شريحة وجائزة جديدة'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    حدد العنوان والنوع وقيمة الجائزة ولون القطاع
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPrizeModalOpen(false)}
                className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePrize} className="space-y-3.5">
              {/* Prize Label & SubLabel */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block text-xs">
                    العنوان الرئيسي <span className="text-red-500">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: 500 د.ع أو خصم 10%"
                    value={prizeLabel}
                    onChange={(e) => setPrizeLabel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block text-xs">
                    العنوان الفرعي:
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: رصيد أرباح 💰"
                    value={prizeSubLabel}
                    onChange={(e) => setPrizeSubLabel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Prize Type */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 block text-xs">
                  نوع الجائزة:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPrizeType('cashback')}
                    className={`py-2 px-2 rounded-xl font-black text-[11px] border transition cursor-pointer flex flex-col items-center gap-1 ${
                      prizeType === 'cashback'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-300'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>💰 كاش باك</span>
                    <span className="text-[9px] font-normal text-slate-500">رصيد أرباح</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrizeType('coupon')}
                    className={`py-2 px-2 rounded-xl font-black text-[11px] border transition cursor-pointer flex flex-col items-center gap-1 ${
                      prizeType === 'coupon'
                        ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-300'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>🎟️ كود كوبون</span>
                    <span className="text-[9px] font-normal text-slate-500">خصم أو شحن</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrizeType('try_again')}
                    className={`py-2 px-2 rounded-xl font-black text-[11px] border transition cursor-pointer flex flex-col items-center gap-1 ${
                      prizeType === 'try_again'
                        ? 'bg-slate-200 border-slate-400 text-slate-900 ring-2 ring-slate-300'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>🍀 حظ أوفر</span>
                    <span className="text-[9px] font-normal text-slate-500">بدون جائزة</span>
                  </button>
                </div>
              </div>

              {/* Conditional Value Fields */}
              {prizeType === 'cashback' && (
                <div className="space-y-1 bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200">
                  <label className="font-black text-emerald-950 block text-xs">
                    مبلغ الكاش باك المضاف لرصيد الزبون (د.ع):
                  </label>
                  <input
                    type="number"
                    min="50"
                    step="50"
                    required
                    value={prizeValue}
                    onChange={(e) => setPrizeValue(Number(e.target.value))}
                    className="w-full bg-white border border-emerald-300 rounded-xl py-2 px-3 text-xs font-bold font-mono text-emerald-950 focus:border-emerald-600"
                    placeholder="مثال: 500"
                  />
                </div>
              )}

              {prizeType === 'coupon' && (
                <div className="space-y-2 bg-amber-50/70 p-3 rounded-2xl border border-amber-200">
                  <label className="font-black text-amber-950 block text-xs">
                    كود الخصم الممنوح للزبون:
                  </label>
                  
                  {/* Select from existing coupons or custom code */}
                  {coupons.length > 0 && (
                    <div className="space-y-1">
                      <select
                        value={prizeCouponCode}
                        onChange={(e) => setPrizeCouponCode(e.target.value)}
                        className="w-full bg-white border border-amber-300 rounded-xl py-2 px-3 text-xs font-bold font-mono text-slate-900 focus:border-amber-600"
                      >
                        <option value="">-- اختر من قائمة الكوبونات المسجلة --</option>
                        {coupons.map((c) => (
                          <option key={c.id || c.code} value={c.code}>
                            {c.code} ({c.discountType === 'percentage' ? `${c.discountValue}%` : `${c.discountValue} د.ع`}) - {c.description || 'كوبون'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <input
                    type="text"
                    required
                    placeholder="أو اكتب الكود يدوياً (مثال: LUCKY5)"
                    value={prizeCouponCode}
                    onChange={(e) => setPrizeCouponCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                    className="w-full bg-white border border-amber-300 rounded-xl py-2 px-3 text-xs font-mono font-black uppercase text-slate-900 focus:border-amber-600"
                  />
                </div>
              )}

              {/* Color Picker & Probability */}
              <div className="grid grid-cols-2 gap-3">
                {/* Sector Color */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block text-xs">
                    لون القطاع في العجلة:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={prizeColor}
                      onChange={(e) => setPrizeColor(e.target.value)}
                      className="w-9 h-9 rounded-xl border border-slate-300 cursor-pointer p-0.5 bg-white"
                    />
                    <div className="flex-1 flex gap-1 flex-wrap">
                      {['#16a34a', '#0284c7', '#7c3aed', '#ea580c', '#d97706', '#e11d48', '#0d9488', '#64748b'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setPrizeColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-4 h-4 rounded-full border transition cursor-pointer ${prizeColor === c ? 'ring-2 ring-slate-900 scale-110' : 'border-white/50'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Probability Weight */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block text-xs">
                    نسبة الاحتمال (الوزن):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={prizeProbability}
                    onChange={(e) => setPrizeProbability(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-black text-slate-900 focus:bg-white focus:border-purple-500"
                    placeholder="مثال: 20"
                  />
                  <span className="text-[10px] text-slate-500">كلما زاد الرقم زادت فرصة الفوز</span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPrizeModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-black py-2.5 rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingPrize ? 'حفظ تعديلات الشريحة' : 'إضافة الشريحة للعجلة 🎡'}</span>
                </button>
              </div>
            </form>
          </div>
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
                            <img src={p.images?.[0] || '/images/placeholder.png'} alt={p.name} className="w-8 h-8 object-contain rounded-lg bg-slate-100 p-0.5" />
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
