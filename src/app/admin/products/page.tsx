'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, Plus, Edit2, Trash2, Search, X, Check, Star, DollarSign, Sparkles, Building2, AlertTriangle, TrendingDown } from 'lucide-react';
import { Product, Category, Company } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';
import { compressImageFile } from '@/lib/imageUtils';

// Default Iraqi & International Brands/Companies by category
const defaultCompaniesByCategory: Record<string, string[]> = {
  'سناك وشيبس ومقرمشات': ['شركة ليز (Lay\'s)', 'شركة البطل', 'شركة شيبتو (Chipito)', 'شركة دوريتوس (Doritos)', 'شركة بيوقلز (Bugles)', 'شركة ألوان العراقية', 'شركة كرانشي', 'أخرى / شركة جديدة'],
  'كرواسون وسويس رول وكيك': ['شركة سفن دايز (7Days)', 'شركة لوزين (L\'usine)', 'شركة أولكر (Ülker)', 'شركة إيتي (ETI)', 'شركة دريم كيك', 'شركة كراون الفاخرة', 'أخرى / شركة جديدة'],
  'مشروبات طاقة وعصائر': ['شركة وايلد تايجر (Wild Tiger)', 'شركة ريد بول (Red Bull)', 'شركة راني (Rani)', 'شركة سن توب (Sun Top)', 'شركة باربيكان (Barbican)', 'شركة بوم بوم (Boom Boom)', 'أخرى / شركة جديدة'],
  'معجون طماطم وصلصات': ['شركة التونسا (Altunsa)', 'شركة زير (Zergül)', 'شركة لونا (Luna)', 'شركة هاينز (Heinz)', 'شركة كاليون', 'شركة ريم', 'أخرى / شركة جديدة'],
  'بسكويت وحلويات وويفر': ['شركة أولكر (Ülker)', 'شركة تيفاني (Tiffany)', 'شركة كيندر (Kinder)', 'شركة أوريو (Oreo)', 'شركة لوتس (Lotus)', 'شركة غندور', 'أخرى / شركة جديدة'],
};

export default function AdminProductsPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dbCompanies, setDbCompanies] = useState<Company[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('الكل');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('سناك وشيبس ومقرمشات');
  const [company, setCompany] = useState(''); // الشركة المصنعة / الماركة
  const [customCompany, setCustomCompany] = useState('');
  const [isCustomCompany, setIsCustomCompany] = useState(false);
  
  // 6 Pricing Tiers & Offers
  const [costPrice, setCostPrice] = useState<number | ''>(7000); // 1. سعر الشراء / التكلفة
  const [marketPrice, setMarketPrice] = useState<number | ''>(8500); // 2. سعر كرتون الماركت والمحلات 🏪
  const [wholesalePrice, setWholesalePrice] = useState<number | ''>(8250); // 3. سعر الجملة للتاجر البرونزي 🥉
  const [specialPrice, setSpecialPrice] = useState<number | ''>(8000); // 4. سعر الجملة الخاص للتاجر الفضي 🥈
  const [vipPrice, setVipPrice] = useState<number | ''>(7500); // 5. سعر الجملة الذهبي VIP 👑
  const [boxPrice, setBoxPrice] = useState<number | ''>(''); // 6. سعر بيع العلبة المفردة (اختياري)
  const [price, setPrice] = useState<number | ''>(500); // 7. سعر البيع بالمفرد للقطعة (الزبون العادي)
  const [originalPrice, setOriginalPrice] = useState<number | ''>(''); // السعر السابق قبل العرض (مفرد)
  const [originalWholesalePrice, setOriginalWholesalePrice] = useState<number | ''>(''); // السعر السابق للجملة
  const [offerBadge, setOfferBadge] = useState<string>(''); // شارة العرض

  // Wholesale Packaging Breakdown (هيكلية تقسيم الكرتون: علب وقطع)
  const [boxesPerCarton, setBoxesPerCarton] = useState<number | ''>(6); // عدد العلب في الكرتون
  const [itemsPerBox, setItemsPerBox] = useState<number | ''>(24); // عدد القطع في العلبة

  const [retailUnit, setRetailUnit] = useState('قطعة مفردة');
  const [wholesaleUnit, setWholesaleUnit] = useState('كرتون جملة (6 علب × 24 قطعة)');
  const [imageUrl, setImageUrl] = useState('');
  const [stock, setStock] = useState<number | ''>(200);
  const [minStockAlert, setMinStockAlert] = useState<number | ''>(15); // حد التنبيه الأدنى
  const [origin, setOrigin] = useState('العراق');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isBestSeller, setIsBestSeller] = useState(false);
  const [isOnOffer, setIsOnOffer] = useState(false);
  const [isNew, setIsNew] = useState(true);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const [prodRes, compRes] = await Promise.all([
        fetch('/api/products').then((r) => r.json()),
        fetch('/api/companies').then((r) => r.json()),
      ]);

      if (prodRes.success) {
        setProducts(prodRes.products || []);
        setCategories(prodRes.categories || []);
      }
      if (compRes.success) {
        setDbCompanies(compRes.companies || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const getCompaniesForCategory = (catName: string) => {
    const list = dbCompanies
      .filter((c) => (c.categories && c.categories.includes(catName)) || c.category === catName)
      .map((c) => c.name);
    const defaults = defaultCompaniesByCategory[catName] || [];
    const combined = Array.from(new Set([...list, ...defaults]));
    if (!combined.includes('أخرى / شركة جديدة')) {
      combined.push('أخرى / شركة جديدة');
    }
    return combined;
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setCategory(categories[0]?.name || 'سناك وشيبس ومقرمشات');
    
    const availableCompanies = getCompaniesForCategory(categories[0]?.name || 'سناك وشيبس ومقرمشات');
    setCompany(availableCompanies[0] || 'شركة عامة');
    setIsCustomCompany(false);
    setCustomCompany('');

    setCostPrice(7000);
    setMarketPrice(8500);
    setWholesalePrice(8250);
    setSpecialPrice(8000);
    setVipPrice(7500);
    setBoxPrice('');
    setPrice(500);
    setOriginalPrice('');
    setOriginalWholesalePrice('');
    setOfferBadge('');
    setBoxesPerCarton(6);
    setItemsPerBox(24);
    setRetailUnit('قطعة مفردة');
    setWholesaleUnit('كرتون جملة (6 علب × 24 قطعة)');
    setImageUrl('https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=800');
    setStock(150);
    setMinStockAlert(15);
    setOrigin('العراق');
    setIsFeatured(false);
    setIsBestSeller(false);
    setIsOnOffer(false);
    setIsNew(true);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setDescription(p.description);
    setCategory(p.category);
    
    const availableCompanies = getCompaniesForCategory(p.category);
    if (p.company && !availableCompanies.includes(p.company)) {
      setCompany('أخرى / شركة جديدة');
      setIsCustomCompany(true);
      setCustomCompany(p.company);
    } else {
      setCompany(p.company || availableCompanies[0] || 'شركة عامة');
      setIsCustomCompany(false);
      setCustomCompany('');
    }

    const effectiveBasePrice = p.basePrice || (p.isOnOffer && p.originalPrice ? p.originalPrice : p.price);
    const effectiveBaseWholesalePrice = p.baseWholesalePrice || (p.isOnOffer && p.originalWholesalePrice ? p.originalWholesalePrice : p.wholesalePrice);

    setCostPrice(p.costPrice ?? (effectiveBaseWholesalePrice ? Math.round(effectiveBaseWholesalePrice * 0.8) : Math.round(effectiveBasePrice * 0.7)));
    setMarketPrice(p.marketPrice ?? effectiveBaseWholesalePrice ?? 8500);
    setWholesalePrice(effectiveBaseWholesalePrice || effectiveBasePrice * 10);
    setPrice(effectiveBasePrice);
    setSpecialPrice(p.specialPrice ?? (effectiveBaseWholesalePrice ? Math.round(effectiveBaseWholesalePrice * 0.95) : Math.round(effectiveBasePrice * 0.9)));
    setVipPrice(p.vipPrice ?? (effectiveBaseWholesalePrice ? Math.round(effectiveBaseWholesalePrice * 0.9) : Math.round(effectiveBasePrice * 0.85)));
    setBoxPrice(p.boxPrice ?? '');
    setOriginalPrice(p.originalPrice ?? '');
    setOriginalWholesalePrice(p.originalWholesalePrice ?? '');
    setOfferBadge(p.offerBadge ?? '');
    setBoxesPerCarton(p.boxesPerCarton || 6);
    setItemsPerBox(p.itemsPerBox || (p.itemsPerWholesaleUnit ? Math.max(1, Math.round(p.itemsPerWholesaleUnit / (p.boxesPerCarton || 6))) : 24));
    setRetailUnit(p.retailUnit || 'قطعة مفردة');
    setWholesaleUnit(p.wholesaleUnit || `كرتون جملة (${p.boxesPerCarton || 6} علب × ${p.itemsPerBox || 24} قطعة)`);
    setImageUrl(p.images[0] || '');
    setStock(p.stock);
    setMinStockAlert(p.minStockAlert ?? 15);
    setOrigin(p.origin || 'العراق');
    setIsFeatured(Boolean(p.isFeatured || p.isBestSeller));
    setIsBestSeller(Boolean(p.isBestSeller || p.isFeatured));
    setIsOnOffer(Boolean(p.isOnOffer || (p.originalPrice && Number(p.originalPrice) > Number(p.price)) || (p.originalWholesalePrice && Number(p.originalWholesalePrice) > Number(p.wholesalePrice)) || p.offerBadge));
    setIsNew(Boolean(p.isNew));
    setIsModalOpen(true);
  };

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    const availableCompanies = getCompaniesForCategory(newCat);
    if (!isCustomCompany) {
      setCompany(availableCompanies[0] || 'شركة عامة');
    }
  };

  const handleCompanySelectChange = (val: string) => {
    setCompany(val);
    if (val === 'أخرى / شركة جديدة') {
      setIsCustomCompany(true);
    } else {
      setIsCustomCompany(false);
      setCustomCompany('');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalCompanyName = isCustomCompany ? (customCompany.trim() || 'شركة عامة') : company;
    const boxes = Number(boxesPerCarton) || 6;
    const piecesPerBox = Number(itemsPerBox) || 24;
    const totalPieces = boxes * piecesPerBox;
    const cPrice = Number(costPrice) || 0;

    const hasOffer = Boolean(
      isOnOffer || 
      (originalPrice !== '' && Number(originalPrice) > Number(price)) || 
      (originalWholesalePrice !== '' && Number(originalWholesalePrice) > Number(wholesalePrice)) ||
      offerBadge.trim()
    );

    const productPayload = {
      name: name.trim(),
      description: description.trim(),
      category,
      company: finalCompanyName,
      costPrice: cPrice,
      marketPrice: Number(marketPrice) || Number(wholesalePrice) || 0,
      wholesalePrice: Number(wholesalePrice) || 0,
      price: Number(price) || 0,
      originalPrice: originalPrice !== '' ? Number(originalPrice) : undefined,
      originalWholesalePrice: originalWholesalePrice !== '' ? Number(originalWholesalePrice) : undefined,
      offerBadge: offerBadge.trim() || undefined,
      isOnOffer: hasOffer,
      specialPrice: Number(specialPrice) || 0,
      vipPrice: Number(vipPrice) || 0,
      boxPrice: boxPrice !== '' ? Number(boxPrice) : undefined,
      boxesPerCarton: boxes,
      itemsPerBox: piecesPerBox,
      itemsPerWholesaleUnit: totalPieces,
      boxCostPrice: Math.round((cPrice / boxes) * 10) / 10,
      pieceCostPrice: Math.round((cPrice / totalPieces) * 10) / 10,
      retailUnit: retailUnit.trim() || 'قطعة مفردة',
      wholesaleUnit: wholesaleUnit.trim() || `كرتون جملة (${boxes} علب × ${piecesPerBox} قطعة)`,
      images: [imageUrl.trim() || 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=800'],
      stock: Number(stock),
      minStockAlert: Number(minStockAlert) || 15,
      origin: origin.trim(),
      isFeatured: Boolean(isFeatured || isBestSeller),
      isBestSeller: Boolean(isBestSeller || isFeatured),
      isNew: Boolean(isNew),
    };

    try {
      if (editingProduct) {
        const res = await fetch(`/api/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productPayload),
        });
        const data = await res.json();
        if (data.success) {
          setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? data.product : p)));
          setIsModalOpen(false);
          toast.success('تم حفظ وتحديث أسعار وبيانات الصنف بنجاح ✨');
          fetchProducts();
        } else {
          toast.error(data.error || 'حدث خطأ أثناء حفظ التعديلات');
        }
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productPayload),
        });
        const data = await res.json();
        if (data.success) {
          setProducts((prev) => [data.product, ...prev]);
          setIsModalOpen(false);
          toast.success('تمت إضافة الصنف الجديد بنجاح 🚀');
          fetchProducts();
        } else {
          toast.error(data.error || 'حدث خطأ أثناء إضافة الصنف');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('تعذر الاتصال بالسيرفر لحفظ التعديلات');
    }
  };

  const handleDeleteProduct = async (id: string, prodName?: string) => {
    const isConfirmed = await confirm({
      title: 'حذف الصنف / المنتج',
      message: `هل أنت متأكد من حذف ${prodName ? `"${prodName}"` : 'هذا الصنف'} نهائياً من المتجر والمخزون؟`,
      confirmText: 'نعم، احذف الصنف',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setProducts((prev) => prev.filter((p) => p.id !== id));
        toast.info('تم حذف المنتج بنجاح');
      }
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء حذف الصنف');
    }
  };

  const lowStockCount = products.filter(p => p.stock <= (p.minStockAlert ?? 15)).length;

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.company && p.company.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (categoryFilter !== 'الكل' && p.category !== categoryFilter) return false;
    if (showLowStockOnly && p.stock > (p.minStockAlert ?? 15)) return false;
    return true;
  });

  const formatStockDisplay = (stockVal: number, p: Product) => {
    if (stockVal <= 0) return '0';
    const fullCartons = Math.floor(stockVal);
    const remainder = stockVal - fullCartons;
    const piecesPerCarton = p.itemsPerWholesaleUnit || ((p.boxesPerCarton || 1) * (p.itemsPerBox || 1)) || 1;
    
    if (remainder <= 0.001) {
      return `${fullCartons} ${p.wholesaleUnit || 'كرتون'}`;
    }
    
    const remainingPieces = Math.round(remainder * piecesPerCarton);
    if (remainingPieces === 0) {
      return `${fullCartons} ${p.wholesaleUnit || 'كرتون'}`;
    }
    if (fullCartons === 0) {
      return `${remainingPieces} ${p.retailUnit || 'قطعة'}`;
    }
    return `${fullCartons} كرتون + ${remainingPieces} ${p.retailUnit || 'قطعة'}`;
  };

  return (
    <div className="space-y-6 text-xs">

      {/* Top Low Stock Alert Notification Banner */}
      {lowStockCount > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0 animate-bounce">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm">
                تنبيه المخزون: يوجد {lowStockCount} أصناف وصلت إلى حد النفاذ أو قرب نفاذ الكمية! ⚠️
              </h3>
              <p className="text-xs text-slate-600 font-bold mt-0.5">
                يرجى تسجيل فاتورة شراء وتوريد جديدة لتعبئة المستودع قبل نفاذ الأصناف
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              className={`font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5 ${
                showLowStockOnly
                  ? 'bg-slate-900 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              <span>{showLowStockOnly ? 'عرض كافة الأصناف' : `عرض الأصناف المنخفضة (${lowStockCount}) ⚠️`}</span>
            </button>
            <Link
              href="/admin/purchases"
              className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>فاتورة شراء 📦</span>
            </Link>
          </div>
        </div>
      )}
      
      {/* Header Action Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-blue" />
            <span>إدارة وتسعير المنتجات (حسب القسم والشركة) 🏷️</span>
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-0.5">
            تنسيب كل منتج لشركته وتحديد أسعار الشراء، الجملة، المفرد، والخاص بالدينار العراقي (د.ع)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/purchases"
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-xs py-3 px-4 rounded-2xl shadow-xs transition flex items-center gap-1.5"
          >
            <Package className="w-4 h-4 text-emerald-600" />
            <span>فواتير المشتريات والتوريد 📦</span>
          </Link>

          <button
            onClick={openAddModal}
            className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد ⚡</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Card */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
        {/* Top: Large Clear Search Input */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم الصنف أو المنتج، الشركة، المنشأ، أو القسم..."
            className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-2xl py-3 pr-11 pl-10 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-brand-blue transition shadow-2xs placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 bg-slate-200 hover:bg-slate-300 text-slate-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black transition"
              title="مسح البحث"
            >
              ✕
            </button>
          )}
        </div>

        {/* Bottom: Category Filters (Multi-row Responsive flex-wrap without scrollbars) */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => {
              setCategoryFilter('الكل');
              setShowLowStockOnly(false);
            }}
            className={`px-3.5 py-2 rounded-xl font-black text-xs transition whitespace-nowrap ${
              categoryFilter === 'الكل' && !showLowStockOnly ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            جميع الأقسام ({products.length})
          </button>
          
          {lowStockCount > 0 && (
            <button
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              className={`px-3.5 py-2 rounded-xl font-black text-xs transition whitespace-nowrap flex items-center gap-1.5 ${
                showLowStockOnly
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 animate-pulse'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>قاربت على النفاذ ({lowStockCount})</span>
            </button>
          )}

          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCategoryFilter(c.name);
                setShowLowStockOnly(false);
              }}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition whitespace-nowrap ${
                categoryFilter === c.name && !showLowStockOnly ? 'bg-brand-blue text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden space-y-3">
        {isLoading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-bold">جاري تحميل الأصناف...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Package className="w-12 h-12 mx-auto text-slate-300" />
            <p className="text-xs font-bold text-slate-700">لا توجد سلع مسجلة تطابق البحث</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-black text-[11px]">
                <tr className="divide-x divide-x-reverse divide-slate-200">
                  <th className="py-3 px-4 w-[30%] min-w-[240px]">الصنف والشركة</th>
                  <th className="py-3 px-3 w-[14%] min-w-[120px] text-center">القسم</th>
                  <th className="py-3 px-3 w-[11%] min-w-[90px] text-center">سعر التكلفة</th>
                  <th className="py-3 px-3 w-[18%] min-w-[140px] text-center">سعر كرتون الجملة</th>
                  <th className="py-3 px-3 w-[13%] min-w-[110px] text-center">سعر المفرد 🛒</th>
                  <th className="py-3 px-3 w-[9%] min-w-[80px] text-center">المخزون</th>
                  <th className="py-3 px-3 w-[8%] min-w-[70px] text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                    
                    {/* Name & Company */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.images[0]}
                          alt={p.name}
                          className="w-12 h-12 object-contain rounded-2xl bg-slate-50 border border-slate-200 p-1 shrink-0"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-slate-900 text-xs sm:text-sm leading-snug">{p.name}</span>
                            {Boolean(p.originalPrice && p.originalPrice > p.price) && (
                              <span className="bg-red-100 text-red-700 text-[10px] font-black px-1.5 py-0.2 rounded-md">
                                🔥 {p.offerBadge || 'عرض خاص'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-[10px]">
                            {p.company && (
                              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                🏢 {p.company}
                              </span>
                            )}
                            <span className="text-slate-400 font-bold">منشأ: {p.origin || 'العراق'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-3 text-center">
                      <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-xl text-[11px] inline-block">
                        {p.category}
                      </span>
                    </td>

                    {/* Cost Price */}
                    <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-600">
                      <span>{(p.costPrice ?? 0).toLocaleString()} د.ع</span>
                    </td>

                    {/* Wholesale Price (Bronze, Silver, Gold) */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="space-y-0.5">
                        <span className="font-black font-mono text-amber-900 text-xs block">
                          {(p.baseWholesalePrice || (p.isOnOffer && p.originalWholesalePrice ? p.originalWholesalePrice : p.wholesalePrice)).toLocaleString()} د.ع
                        </span>
                        {Boolean(p.isOnOffer && p.wholesalePrice && p.wholesalePrice < (p.baseWholesalePrice || p.originalWholesalePrice || p.wholesalePrice)) && (
                          <span className="text-[10px] text-red-600 font-bold bg-red-50 border border-red-200 px-1 py-0.2 rounded block w-fit mx-auto">
                            🔥 بالعرض: {p.wholesalePrice.toLocaleString()} د.ع
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {p.wholesaleUnit}
                        </span>
                        {(p.specialPrice || p.vipPrice) && (
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono font-bold pt-0.5">
                            <span title="سعر التاجر الفضي">🥈 {(p.specialPrice || p.wholesalePrice).toLocaleString()}</span>
                            <span>•</span>
                            <span title="سعر التاجر الذهبي VIP">🥇 {(p.vipPrice || p.specialPrice || p.wholesalePrice).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Retail Price */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="space-y-0.5">
                        <span className="font-black font-mono text-slate-900 text-xs block">
                          {(p.basePrice || (p.isOnOffer && p.originalPrice ? p.originalPrice : p.price)).toLocaleString()} د.ع
                        </span>
                        {Boolean(p.isOnOffer && p.price < (p.basePrice || p.originalPrice || p.price)) && (
                          <span className="text-[10px] text-red-600 font-bold bg-red-50 border border-red-200 px-1 py-0.2 rounded block w-fit mx-auto">
                            🔥 بالعرض: {p.price.toLocaleString()} د.ع
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {p.retailUnit}
                        </span>
                      </div>
                    </td>

                    {/* Stock */}
                    <td className="py-3.5 px-3 text-center">
                      {p.stock <= (p.minStockAlert ?? 15) ? (
                        <span className="font-mono font-black px-2 py-1 rounded-xl text-[10px] bg-red-100 text-red-800 border border-red-300 inline-flex items-center gap-1 animate-pulse whitespace-nowrap">
                          <AlertTriangle className="w-3 h-3 text-red-600" />
                          <span>{formatStockDisplay(p.stock, p)} (نفاذ ⚠️)</span>
                        </span>
                      ) : (
                        <span className="font-mono font-bold px-2.5 py-1 rounded-xl text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap inline-block">
                          {formatStockDisplay(p.stock, p)}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEditModal(p)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl border border-slate-200 transition shadow-2xs"
                          title="تعديل الصنف والأسعار والشركة"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-brand-blue" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl border border-red-200 transition shadow-2xs"
                          title="حذف الصنف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden text-xs my-auto animate-in fade-in zoom-in-95 duration-200">
            
            {/* Sticky Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-white z-10">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-brand-blue" />
                <span>{editingProduct ? 'تعديل الصنف والشركة والأسعار' : 'إضافة صنف جديد'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                
                {/* Product Name */}
                <div className="space-y-1">
                  <label className="font-black text-slate-800 block">اسم الصنف أو المنتج *:</label>
                  <input
                    type="text"
                    required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: شيبس بطاطا مقرمش نكهة الجبن"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                />
              </div>

              {/* Category & Company (القسم والشركة المصنعة) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-blue-50/50 p-3.5 rounded-2xl border border-blue-100">
                
                {/* 1. Category */}
                <div className="space-y-1">
                  <label className="font-black text-slate-800 block">القسم والتصنيف الرئيسي *:</label>
                  <select
                    value={category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-brand-blue"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Company / Brand */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-slate-800 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-brand-blue" />
                      <span>الشركة / الماركة التابع لها *:</span>
                    </label>
                    <Link href="/admin/companies" target="_blank" className="text-[10px] font-bold text-brand-blue hover:underline">
                      + إدارة الشركات 🏢
                    </Link>
                  </div>
                  <select
                    value={company}
                    onChange={(e) => handleCompanySelectChange(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-brand-blue"
                  >
                    {getCompaniesForCategory(category).map((comp, i) => (
                      <option key={i} value={comp}>{comp}</option>
                    ))}
                  </select>

                  {isCustomCompany && (
                    <input
                      type="text"
                      required
                      value={customCompany}
                      onChange={(e) => setCustomCompany(e.target.value)}
                      placeholder="اكتب اسم الشركة الجديدة هنا..."
                      className="w-full mt-2 bg-white border border-indigo-300 rounded-xl py-2 px-3 text-xs font-bold text-indigo-900 focus:border-indigo-600 animate-fadeIn"
                    />
                  )}
                </div>

              </div>

              {/* WHOLESALE PACKAGING HIERARCHY (تقسيم التعبئة والتجزئة: كرتون -> علب -> قطع) */}
              <div className="bg-gradient-to-r from-blue-50/90 to-indigo-50/90 p-4 rounded-2xl border-2 border-blue-200 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-900 flex items-center gap-1.5 text-xs text-brand-blue">
                    <Package className="w-4 h-4 text-brand-blue" />
                    <span>هيكلية وتفصيل التعبئة للمستودع (كرتون ⬅️ علب ⬅️ قطع):</span>
                  </h4>
                  <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded-md">
                    حساب التكلفة الدقيقة
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Boxes per Carton */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-800 block">
                      عدد العلب / التجزئة داخل الكرتون أو الشليف *:
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={boxesPerCarton}
                      onChange={(e) => setBoxesPerCarton(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="مثال: 6 أو 1"
                      className="w-full bg-white border-2 border-blue-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-slate-900 focus:border-brand-blue"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      ضع <strong>1</strong> إذا كان شليف رز أو كرتون شيبس مباشر (بدون علب وسطية).
                    </span>
                  </div>

                  {/* Items per Box */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-800 block">
                      عدد القطع / الأكياس في كل علبة أو كرتون *:
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={itemsPerBox}
                      onChange={(e) => setItemsPerBox(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="مثال: 24 أو 40 أو 4"
                      className="w-full bg-white border-2 border-blue-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-slate-900 focus:border-brand-blue"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      مثال: <strong>40</strong> لشيبس، أو <strong>4</strong> لشليف الرز (4 أكياس × 10 كغم).
                    </span>
                  </div>
                </div>

                {/* Packaging Examples Bar */}
                <div className="bg-blue-50/70 p-2.5 rounded-xl border border-blue-200 text-[11px] text-blue-950 font-bold space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-blue-800">💡 أمثلة سريعة:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setBoxesPerCarton(1);
                        setItemsPerBox(4);
                        setWholesaleUnit('شليف رز (4 أكياس × 10 كغم)');
                        setRetailUnit('كيس 10 كغم مفرد');
                      }}
                      className="bg-white hover:bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md border border-blue-300 text-[10px] transition"
                    >
                      🌾 شليف رز (4 أكياس)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBoxesPerCarton(1);
                        setItemsPerBox(40);
                        setWholesaleUnit('كرتون شيبس (40 كيس)');
                        setRetailUnit('كيس عائلي مفرد');
                      }}
                      className="bg-white hover:bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md border border-blue-300 text-[10px] transition"
                    >
                      🥔 كرتون شيبس (40 قطعة)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBoxesPerCarton(6);
                        setItemsPerBox(24);
                        setWholesaleUnit('كرتون كيك (6 علب × 24 قطعة)');
                        setRetailUnit('قطعة مفردة');
                      }}
                      className="bg-white hover:bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md border border-blue-300 text-[10px] transition"
                    >
                      🥐 كرتون كيك (6 علب × 24)
                    </button>
                  </div>
                </div>

                {/* Auto-Calculated Unit Breakdown Box */}
                <div className="bg-white/95 p-3 rounded-xl border border-blue-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-slate-700">
                    <span>📦 إجمالي محتويات الكرتون / الشليف الواحد:</span>
                    <span className="font-mono font-black text-brand-blue text-sm">
                      {(Number(boxesPerCarton) || 1) * (Number(itemsPerBox) || 1)} {(Number(boxesPerCarton) || 1) === 1 ? 'قطعة / كيس' : 'قطعة إجمالية'}
                    </span>
                  </div>
                  {(Number(boxesPerCarton) || 1) > 1 && (
                    <div className="flex items-center justify-between font-bold text-slate-600 text-[11px] pt-1.5 border-t border-slate-100">
                      <span>💰 تكلفة العلبة الواحدة:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {Math.round(((Number(costPrice) || 0) / Math.max(1, (Number(boxesPerCarton) || 1)))).toLocaleString()} د.ع
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-bold text-slate-600 text-[11px]">
                    <span>🏷️ تكلفة القطعة / الكيس المفرد:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {((Number(costPrice) || 0) / Math.max(1, (Number(boxesPerCarton) || 1) * (Number(itemsPerBox) || 1))).toFixed(1)} د.ع
                    </span>
                  </div>
                </div>
              </div>

              {/* PRICING TIERS: COST, MARKET, MERCHANTS, BOX, RETAIL */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-900 flex items-center gap-1.5 text-xs text-brand-blue">
                    <DollarSign className="w-4 h-4" />
                    <span>هيكل تسعير رتب الزبائن والماركت والتجار (د.ع):</span>
                  </h4>
                  <span className="text-[10px] bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-md">
                    حساب الأرباح بدقة 💹
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  
                  {/* 1. Cost Price */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-800 block flex items-center justify-between">
                      <span>1. سعر التكلفة والشراء *:</span>
                      <span className="text-[10px] text-slate-500 font-normal">للكرتون / الشليف</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="7000"
                      className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-slate-900 focus:border-brand-blue"
                    />
                    <span className="text-[10px] text-slate-500 block">لحساب أرباح المتجر الصافية بدقة</span>
                  </div>

                  {/* 2. Market Price (سعر الماركت والمحلات) */}
                  <div className="space-y-1 bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-200">
                    <label className="font-black text-emerald-950 block flex items-center justify-between">
                      <span>2. سعر الماركت والمحلات 🏪 *:</span>
                      <span className="text-[10px] text-emerald-800 font-bold">للكرتون / الشليف</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={marketPrice}
                      onChange={(e) => setMarketPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="8500"
                      className="w-full bg-white border-2 border-emerald-400 rounded-xl py-1.5 px-3 text-xs font-black font-mono text-emerald-900 focus:border-emerald-600"
                    />
                    <span className="text-[10px] text-emerald-700 block">السعر المعتمد لأصحاب الماركتات والسوبرماركت</span>
                  </div>

                  {/* 3. Bronze Wholesale Price (التاجر البرونزي) */}
                  <div className="space-y-1">
                    <label className="font-bold text-amber-900 block flex items-center justify-between">
                      <span>3. سعر التاجر العام (البرونزي 🥉) *:</span>
                      <span className="text-[10px] text-amber-800">للكرتون</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={wholesalePrice}
                      onChange={(e) => setWholesalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="8250"
                      className="w-full bg-white border border-amber-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-amber-900 focus:border-amber-600"
                    />
                    <span className="text-[10px] text-amber-700 block">سعر كرتون الجملة الأساسي</span>
                  </div>

                  {/* 4. Silver Special Price (التاجر الفضي) */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-800 block flex items-center justify-between">
                      <span>4. سعر التاجر الفضي 🥈:</span>
                      <span className="text-[10px] text-slate-500">للكرتون</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={specialPrice}
                      onChange={(e) => setSpecialPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="8000"
                      className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-slate-800 focus:border-brand-blue"
                    />
                    <span className="text-[10px] text-slate-500 block">للتجار ذوي السحب المستمر</span>
                  </div>

                  {/* 5. Gold VIP Price (التاجر الذهبي) */}
                  <div className="space-y-1">
                    <label className="font-bold text-amber-800 block flex items-center justify-between">
                      <span>5. سعر التاجر الذهبي VIP 👑:</span>
                      <span className="text-[10px] text-amber-700">للكرتون</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={vipPrice}
                      onChange={(e) => setVipPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="7500"
                      className="w-full bg-white border border-amber-400 rounded-xl py-2 px-3 text-xs font-black font-mono text-amber-700 focus:border-amber-600"
                    />
                    <span className="text-[10px] text-amber-600 block">لكبار التجار والموزعين المميزين</span>
                  </div>

                  {/* 6. Consumer Carton / Box Price (سعر كرتون الزبون العادي) */}
                  <div className="space-y-1 bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-200">
                    <label className="font-black text-indigo-950 block flex items-center justify-between">
                      <span>6. سعر كرتون المستهلك (الزبون العادي) 📦:</span>
                      <span className="text-[10px] text-indigo-700 font-bold">للكرتون الكامل</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={boxPrice}
                      onChange={(e) => setBoxPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="مثال: 8000"
                      className="w-full bg-white border-2 border-indigo-400 rounded-xl py-1.5 px-3 text-xs font-black font-mono text-indigo-950 focus:border-indigo-600"
                    />
                    <span className="text-[10px] text-indigo-800 font-bold block">
                      💡 السعر الذي يدفعه الزبون العادي عند شراء كرتون كامل (أنسب له من المفرد وأعلى من سعر التاجر).
                    </span>
                  </div>

                  {/* 7. Retail Price (سعر القطعة المفردة) */}
                  <div className="space-y-1 sm:col-span-2 bg-blue-50/60 p-2.5 rounded-xl border border-blue-200">
                    <label className="font-black text-blue-950 block flex items-center justify-between">
                      <span>7. سعر البيع بالمفرد للزبون العادي (للقطعة / الكيس) 👤 *:</span>
                      <span className="text-[10px] text-blue-700 font-bold">للقطعة المفردة</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="500"
                      className="w-full bg-white border-2 border-blue-400 rounded-xl py-2 px-3 text-xs font-black font-mono text-blue-950 focus:border-brand-blue"
                    />
                    <span className="text-[10px] text-blue-700 block">سعر القطعة الواحدة أو كيس المفرد للمستهلكين في التطبيق</span>
                  </div>

                </div>
              </div>

              {/* Units Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">وصف عبوة الجملة:</label>
                  <input
                    type="text"
                    value={wholesaleUnit}
                    onChange={(e) => setWholesaleUnit(e.target.value)}
                    placeholder="مثال: كرتون جملة (24 كيس)"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">وصف عبوة المفرد:</label>
                  <input
                    type="text"
                    value={retailUnit}
                    onChange={(e) => setRetailUnit(e.target.value)}
                    placeholder="مثال: كيس عائلي (85 جم)"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                  />
                </div>
              </div>

              {/* Stock, Low Stock Alert, & Origin */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-amber-50/40 p-3 rounded-2xl border border-amber-200">
                <div className="space-y-1">
                  <label className="font-black text-slate-800 block">الكمية المتوفرة بالمخزن *:</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-slate-900 focus:border-brand-blue"
                  />
                  <span className="text-[10px] text-slate-500 font-bold block">الرصيد الحالي بالمستودع</span>
                </div>

                <div className="space-y-1">
                  <label className="font-black text-amber-900 block flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>حد التنبيه الأدنى *:</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={minStockAlert}
                    onChange={(e) => setMinStockAlert(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="15"
                    className="w-full bg-white border border-amber-300 rounded-xl py-2 px-3 text-xs font-black font-mono text-amber-800 focus:border-amber-600"
                  />
                  <span className="text-[10px] text-amber-700 font-bold block">تنبيه عند بقاء هذا العدد</span>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">بلد المنشأ:</label>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="العراق"
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:border-brand-blue"
                  />
                  <span className="text-[10px] text-slate-400 block">العراق / تركيا / أردني...</span>
                </div>
              </div>

              {/* Product Image Upload & Preview */}
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <label className="font-black text-slate-800 block text-xs flex items-center justify-between">
                  <span>صورة المنتج:</span>
                  <span className="text-[10px] text-slate-400 font-normal">رفع من الجهاز أو رابط إنترنت</span>
                </label>

                <div className="flex items-center gap-3">
                  {/* Image Preview */}
                  <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shrink-0 shadow-xs relative">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Product Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-6 h-6 text-slate-300" />
                    )}
                  </div>

                  {/* Upload from Device Button & URL Input */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="bg-brand-blue hover:bg-brand-blueDark text-white text-xs font-black py-2 px-3.5 rounded-xl cursor-pointer transition shadow-xs flex items-center gap-1.5 active:scale-95">
                        <span>📁 رفع صورة من جهازك</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const compressedDataUrl = await compressImageFile(file);
                                setImageUrl(compressedDataUrl);
                                toast.success('تم رفع وتجهيز صورة المنتج بنجاح ✨');
                              } catch (err) {
                                toast.error('تعذر معالجة الصورة، يرجى اختيار ملف صورة صالح');
                              }
                            }
                          }}
                        />
                      </label>

                      {imageUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setImageUrl('');
                            toast.info('تمت إزالة صورة المنتج');
                          }}
                          className="text-red-500 hover:text-red-700 text-[11px] font-bold py-1.5 px-2.5 rounded-xl bg-red-50 border border-red-200 transition"
                        >
                          ✕ حذف الصورة
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={imageUrl.startsWith('data:') ? '✅ تم رفع صورة المنتج من جهازك بنجاح' : imageUrl}
                      onChange={(e) => {
                        if (!imageUrl.startsWith('data:')) {
                          setImageUrl(e.target.value);
                        }
                      }}
                      readOnly={imageUrl.startsWith('data:')}
                      placeholder="أو الصق رابط صورة إنترنت هنا (https://...)"
                      className="w-full bg-white border border-slate-300 rounded-xl py-1.5 px-3 text-[11px] font-mono text-slate-800 focus:border-brand-blue"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* Homepage Sections & Display Flags */}
              <div className="bg-indigo-50/70 border-2 border-indigo-200/80 p-3.5 rounded-2xl space-y-2.5">
                <span className="font-black text-indigo-950 text-xs block flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>تصنيف ظهور الصنف في أقسام الصفحة الرئيسية:</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* 1. Best Seller */}
                  <label className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    isBestSeller || isFeatured ? 'bg-amber-50 border-amber-400 shadow-xs' : 'bg-white border-slate-200 hover:border-amber-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={isBestSeller || isFeatured}
                      onChange={(e) => {
                        setIsBestSeller(e.target.checked);
                        setIsFeatured(e.target.checked);
                      }}
                      className="w-4 h-4 text-amber-500 rounded focus:ring-amber-400"
                    />
                    <div>
                      <span className="font-black text-slate-900 text-xs block">🏆 الأكثر طلباً ومبيعاً</span>
                      <span className="text-[10px] text-slate-500 block">يظهر بقسم الأكثر طلباً</span>
                    </div>
                  </label>

                  {/* 2. New Arrival */}
                  <label className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    isNew ? 'bg-sky-50 border-sky-400 shadow-xs' : 'bg-white border-slate-200 hover:border-sky-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={isNew}
                      onChange={(e) => setIsNew(e.target.checked)}
                      className="w-4 h-4 text-sky-500 rounded focus:ring-sky-400"
                    />
                    <div>
                      <span className="font-black text-slate-900 text-xs block">✨ وصل حديثاً</span>
                      <span className="text-[10px] text-slate-500 block">يظهر بقسم أحدث المنتجات</span>
                    </div>
                  </label>
                </div>

                <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100 flex items-center justify-between text-[11px] text-indigo-900 font-bold">
                  <span className="flex items-center gap-1">
                    <span>🔥 لإطلاق عرض تخفيض موقوت بسعر خاص:</span>
                  </span>
                  <Link href="/admin/offers" className="text-rose-600 hover:text-rose-700 underline font-black">
                    قسم إدارة العروض والتخفيضات 🏷️ ←
                  </Link>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">وصف الصنف والمميزات:</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="اكتب وصفاً جذاباً للصنف..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                />
              </div>

              </div>

              {/* Sticky Submit Buttons Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-blue hover:bg-brand-blueDark text-white font-black py-2.5 rounded-xl shadow-md transition"
                >
                  {editingProduct ? 'حفظ التعديلات ✅' : 'إضافة الصنف الآن 🚀'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
