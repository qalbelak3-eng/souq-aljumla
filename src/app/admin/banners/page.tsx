'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Trash2, Edit2, Check, X, ExternalLink, RefreshCw, Eye, EyeOff, Image as ImageIcon, Layers, Tag, Search, ShoppingBag } from 'lucide-react';
import { Banner, PopupAdSettings, Category, Product } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';
import { compressImageFile } from '@/lib/imageUtils';

export default function AdminBannersPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'slider' | 'popup'>('slider');

  // Slider Banners State
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);

  // Form State for Slider Banners & Campaigns
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [image, setImage] = useState('');
  const [linkUrl, setLinkUrl] = useState('/products');
  const [badge, setBadge] = useState('عرض خاص ✦');
  const [position, setPosition] = useState<'top' | 'middle' | 'bottom' | 'category' | 'all'>('top');
  const [category, setCategory] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Showcase Campaign Specific State
  const [isCampaignShowcase, setIsCampaignShowcase] = useState(false);
  const [campaignBgColor, setCampaignBgColor] = useState('#15803d');
  const [campaignProductsTitle, setCampaignProductsTitle] = useState('منتجاتنا الطازجة');
  const [campaignProductIds, setCampaignProductIds] = useState<string[]>([]);
  const [productSearchFilter, setProductSearchFilter] = useState('');

  // Popup Ads Multi-List State
  const [popupAds, setPopupAds] = useState<PopupAdSettings[]>([]);
  const [isPopupModalOpen, setIsPopupModalOpen] = useState(false);
  const [editingPopupAd, setEditingPopupAd] = useState<PopupAdSettings | null>(null);

  // Popup Form State
  const [popupTitle, setPopupTitle] = useState('');
  const [popupImage, setPopupImage] = useState('');
  const [popupLinkUrl, setPopupLinkUrl] = useState('/products?filter=offers');
  const [popupEnabled, setPopupEnabled] = useState(true);
  const [popupShowOnce, setPopupShowOnce] = useState(true);
  const [popupOrder, setPopupOrder] = useState(1);
  const [isSavingPopup, setIsSavingPopup] = useState(false);
  const [previewPopupImage, setPreviewPopupImage] = useState<string | null>(null);

  const fetchSettings = () => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) {
          const list: PopupAdSettings[] = Array.isArray(data.settings.popupAds) && data.settings.popupAds.length > 0
            ? data.settings.popupAds
            : (data.settings.popupAd ? [data.settings.popupAd] : []);
          
          setPopupAds(list.sort((a, b) => (a.order || 0) - (b.order || 0)));
        }
      })
      .catch((err) => console.error(err));
  };

  const fetchBannersAndData = () => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/banners?all=true').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
    ])
      .then(([bannersData, catData, prodData]) => {
        if (bannersData.success && Array.isArray(bannersData.banners)) {
          setBanners(bannersData.banners);
        }
        if (catData.success && Array.isArray(catData.categories)) {
          setCategories(catData.categories);
        }
        if (prodData.success && Array.isArray(prodData.products)) {
          setProducts(prodData.products);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchBannersAndData();
    fetchSettings();
  }, []);

  const handleOpenAdd = () => {
    setEditingBanner(null);
    setTitle('');
    setSubtitle('');
    setImage('https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200&auto=format&fit=crop');
    setLinkUrl('/products');
    setBadge('توصيل سريع 🚚');
    setPosition('top');
    setCategory(categories[0]?.name || '');
    setIsActive(true);
    setIsCampaignShowcase(false);
    setCampaignBgColor('#15803d');
    setCampaignProductsTitle('منتجاتنا الطازجة');
    setCampaignProductIds([]);
    setProductSearchFilter('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setTitle(banner.title);
    setSubtitle(banner.subtitle || '');
    setImage(banner.image);
    setLinkUrl(banner.linkUrl || '/products');
    setBadge(banner.badge || '');
    setPosition(banner.position || 'top');
    setCategory(banner.category || (categories[0]?.name || ''));
    setIsActive(banner.isActive);
    setIsCampaignShowcase(Boolean(banner.isCampaignShowcase));
    setCampaignBgColor(banner.campaignBgColor || '#15803d');
    setCampaignProductsTitle(banner.campaignProductsTitle || 'منتجاتنا الطازجة');
    setCampaignProductIds(Array.isArray(banner.campaignProductIds) ? banner.campaignProductIds : []);
    setProductSearchFilter('');
    setIsModalOpen(true);
  };

  const toggleProductInCampaign = (productId: string) => {
    setCampaignProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const payload = {
      title: title.trim(),
      subtitle: subtitle.trim(),
      image: image.trim(),
      linkUrl: linkUrl.trim(),
      badge: badge.trim(),
      position,
      category: position === 'category' || category ? category.trim() : '',
      isCampaignShowcase,
      campaignBgColor: isCampaignShowcase ? campaignBgColor : undefined,
      campaignProductsTitle: isCampaignShowcase ? campaignProductsTitle.trim() : undefined,
      campaignProductIds: isCampaignShowcase ? campaignProductIds : undefined,
      isActive,
    };

    try {
      if (editingBanner) {
        const res = await fetch('/api/banners', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingBanner.id, ...payload }),
        });
        const data = await res.json();
        if (data.success && data.banner) {
          setBanners((prev) => prev.map((b) => (b.id === editingBanner.id ? data.banner : b)));
          toast.success('تم تحديث بيانات البنر الإعلاني بنجاح ✨');
        }
      } else {
        const res = await fetch('/api/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success && data.banner) {
          setBanners((prev) => [...prev, data.banner]);
          toast.success('تمت إضافة البنر الإعلاني الجديد بنجاح ✨');
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حفظ البنر');
    }
    setIsSaving(false);
  };

  const handleToggleActive = async (banner: Banner) => {
    try {
      const res = await fetch('/api/banners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: banner.id, isActive: !banner.isActive }),
      });
      const data = await res.json();
      if (data.success && data.banner) {
        setBanners((prev) => prev.map((b) => (b.id === banner.id ? data.banner : b)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteBanner = async (id: string, bannerTitle?: string) => {
    const isConfirmed = await confirm({
      title: 'حذف البنر الإعلاني',
      message: `هل أنت متأكد من حذف ${bannerTitle ? `"${bannerTitle}"` : 'هذا البنر'} نهائياً من المتجر؟`,
      confirmText: 'نعم، احذف البنر',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/banners?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setBanners((prev) => prev.filter((b) => b.id !== id));
        toast.success('تم حذف البنر الإعلاني بنجاح');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حذف البنر');
    }
  };

  const handleOpenAddPopup = () => {
    setEditingPopupAd(null);
    setPopupTitle('');
    setPopupImage('');
    setPopupLinkUrl('/products?filter=offers');
    setPopupEnabled(true);
    setPopupShowOnce(true);
    setPopupOrder(popupAds.length + 1);
    setIsPopupModalOpen(true);
  };

  const handleOpenEditPopup = (ad: PopupAdSettings) => {
    setEditingPopupAd(ad);
    setPopupTitle(ad.title || '');
    setPopupImage(ad.image || '');
    setPopupLinkUrl(ad.linkUrl || '/products?filter=offers');
    setPopupEnabled(ad.isEnabled ?? true);
    setPopupShowOnce(ad.showOncePerUser ?? true);
    setPopupOrder(ad.order || 1);
    setIsPopupModalOpen(true);
  };

  const handleTogglePopupActive = async (ad: PopupAdSettings) => {
    const updated = popupAds.map((item) =>
      item.id === ad.id ? { ...item, isEnabled: !item.isEnabled } : item
    );
    await savePopupAdsList(updated);
  };

  const handleDeletePopupAd = async (id: string, adTitle?: string) => {
    const isConfirmed = await confirm({
      title: 'حذف الإعلان المنبثق',
      message: `هل أنت متأكد من حذف ${adTitle ? `"${adTitle}"` : 'هذا البوستر المنبثق'} نهائياً؟`,
      confirmText: 'نعم، احذف الإعلان',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    const updated = popupAds.filter((item) => item.id !== id);
    await savePopupAdsList(updated);
    toast.showToast('تم حذف البوستر المنبثق بنجاح ✅', 'success');
  };

  const savePopupAdsList = async (list: PopupAdSettings[]) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          popupAds: list,
          popupAd: list[0] || null, // backward compatibility
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPopupAds(list.sort((a, b) => (a.order || 0) - (b.order || 0)));
      }
    } catch (err) {
      console.error(err);
      toast.showToast('حدث خطأ أثناء الحفظ', 'error');
    }
  };

  const handleSavePopupAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!popupImage.trim()) {
      toast.showToast('يرجى رفع أو إضافة صورة للبوستر الإعلاني', 'error');
      return;
    }

    setIsSavingPopup(true);
    try {
      const newAdData: PopupAdSettings = {
        id: editingPopupAd ? editingPopupAd.id : 'popup-' + Date.now(),
        title: popupTitle.trim() || 'بوستر إعلاني',
        image: popupImage.trim(),
        linkUrl: popupLinkUrl.trim() || '/products',
        isEnabled: popupEnabled,
        showOncePerUser: popupShowOnce,
        order: Number(popupOrder) || 1,
      };

      let updatedList: PopupAdSettings[];
      if (editingPopupAd) {
        updatedList = popupAds.map((item) =>
          item.id === editingPopupAd.id ? newAdData : item
        );
      } else {
        updatedList = [...popupAds, newAdData];
      }

      await savePopupAdsList(updatedList);
      toast.showToast(
        editingPopupAd ? 'تم تعديل البوستر الإعلاني بنجاح ✅' : 'تم إضافة البوستر الإعلاني الجديد بنجاح ✅',
        'success'
      );
      setIsPopupModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.showToast('فشل الاتصال بالخادم', 'error');
    }
    setIsSavingPopup(false);
  };

  const handleResetSeenAd = () => {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('etihad_popup_ad_seen')) {
          localStorage.removeItem(key);
        }
      });
      toast.showToast('تمت إعادة تعيين سجل الظهور لجميع البوسترات! ستظهر متتابعة عند دخولك المتجر مجدداً 🔄', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 text-xs select-none">
      
      {/* Top Tabs Switcher */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('slider')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'slider'
              ? 'bg-brand-blue text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>🖼️ البنرات الإعلانية المتحركة (السلايدر)</span>
          <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
            {banners.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('popup')}
          className={`flex-1 py-2.5 px-4 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'popup'
              ? 'bg-brand-coral text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
          }`}
        >
          <span>📢 الإعلان المنبثق الترويجي (Popup Modal Ad)</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
            popupEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {popupEnabled ? 'مفعل ✓' : 'معطل ✕'}
          </span>
        </button>
      </div>

      {activeTab === 'slider' ? (
        <>
          {/* Header Banner for Slider */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h2 className="text-base font-black text-slate-900">إدارة البنرات الإعلانية وحملات العروض المميزة</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                إضافة وتعديل البنرات الترويجية المتحركة (السلايدر) وحملات العروض المميزة المدمجة مع منتجات (Showcase Campaigns) في أعلى، وسط، أسفل الرئيسية أو داخل أقسام محددة
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenAdd}
                className="bg-brand-coral hover:bg-brand-coralHover text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة بنر أو حملة جديدة</span>
              </button>

              <button
                onClick={fetchBannersAndData}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-3 rounded-xl transition cursor-pointer"
                title="تحديث"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Banners List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoading ? (
              <div className="col-span-full py-16 text-center">
                <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">جاري تحميل البنرات وحملات العروض...</p>
              </div>
            ) : banners.length === 0 ? (
              <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
                <ImageIcon className="w-12 h-12 mx-auto text-slate-300" />
                <h3 className="text-sm font-black text-slate-800">لا توجد بنرات إعلانية حالياً</h3>
                <button
                  onClick={handleOpenAdd}
                  className="bg-brand-blue text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                >
                  أضف أول بنر إعلاني الآن
                </button>
              </div>
            ) : (
              banners.map((banner) => (
                <div
                  key={banner.id}
                  className={`bg-white rounded-3xl overflow-hidden border shadow-sm transition-all duration-300 flex flex-col justify-between ${
                    banner.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
                  }`}
                >
              {/* Banner Image Preview */}
              <div className="relative aspect-[21/9] w-full bg-slate-100 overflow-hidden">
                <img
                  src={banner.image}
                  alt={banner.title}
                  className="w-full h-full object-cover"
                />
                
                {/* Badge Overlay */}
                {banner.badge && (
                  <span className="absolute top-3 right-3 bg-amber-400 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-xs">
                    {banner.badge}
                  </span>
                )}

                {/* Campaign Showcase Badge */}
                {banner.isCampaignShowcase && (
                  <span 
                    className="absolute top-3 left-3 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-white/30 backdrop-blur-xs"
                    style={{ backgroundColor: banner.campaignBgColor || '#15803d' }}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>حملة مميزة مع منتجات ({banner.campaignProductIds?.length || 0})</span>
                  </span>
                )}

                {/* Position Badge */}
                <span className="absolute bottom-3 right-3 bg-slate-900/85 text-white font-bold text-[10px] px-2.5 py-1 rounded-full shadow-xs backdrop-blur-xs flex items-center gap-1">
                  {(!banner.position || banner.position === 'top')
                    ? '🔝 البنر الرئيسي بالأعلى'
                    : banner.position === 'middle'
                    ? ' البنر الإعلاني الأوسط'
                    : banner.position === 'bottom'
                    ? '🔽 البنر الإعلاني بالأسفل'
                    : banner.position === 'category'
                    ? `📂 داخل قسم: ${banner.category || 'عام'}`
                    : '🌐 في كل الأماكن'}
                </span>

                {/* Status Overlay if not campaign badge */}
                {!banner.isCampaignShowcase && (
                  <span
                    className={`absolute top-3 left-3 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs ${
                      banner.isActive
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-700 text-white'
                    }`}
                  >
                    {banner.isActive ? 'نشط ويظهر بالمتجر ✓' : 'معطل مخفي ✕'}
                  </span>
                )}
              </div>

              {/* Banner Content Details */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900 leading-snug">
                    {banner.title}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                    {(!banner.position || banner.position === 'top')
                      ? 'أعلى الصفحة'
                      : banner.position === 'middle'
                      ? 'وسط الصفحة'
                      : banner.position === 'bottom'
                      ? 'أسفل الصفحة'
                      : banner.position === 'category'
                      ? banner.category
                      : 'الكل'}
                  </span>
                </div>
                {banner.subtitle && (
                  <p className="text-[11px] text-slate-500 line-clamp-2">
                    {banner.subtitle}
                  </p>
                )}
                {banner.linkUrl && (
                  <span className="text-[10px] text-brand-blue font-mono block truncate">
                    الرابط: {banner.linkUrl}
                  </span>
                )}
                {banner.isCampaignShowcase && (
                  <div className="pt-1 flex items-center gap-2 text-[11px] font-bold text-slate-600">
                    <span 
                      className="w-3 h-3 rounded-full inline-block shrink-0 border border-slate-300"
                      style={{ backgroundColor: banner.campaignBgColor || '#15803d' }}
                    />
                    <span>عنوان شريط المنتجات: &quot;{banner.campaignProductsTitle || 'منتجاتنا الطازجة'}&quot;</span>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleToggleActive(banner)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition flex items-center gap-1 ${
                    banner.isActive
                      ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {banner.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{banner.isActive ? 'إخفاء مؤقت' : 'تفعيل ونشر'}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(banner)}
                    className="bg-slate-100 hover:bg-slate-200 text-brand-blue p-2 rounded-xl transition"
                    title="تعديل البنر"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteBanner(banner.id)}
                    className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl transition"
                    title="حذف البنر"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          ))
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-coral" />
                <span>{editingBanner ? 'تعديل بيانات البنر / الحملة' : 'إضافة بنر إعلاني أو حملة مميزة'}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBanner} className="space-y-4">
              
              {/* Title & Subtitle */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">عنوان البنر الرئيسي:</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: سبرايت حمضيات ونعناع | أو منتجاتنا الطازجة"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">الوصف الفرعي (اختياري):</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="مثال: انتعاش يدوم طويلاً | أفضل المنتجات بأسعار الجملة المباشرة"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue"
                />
              </div>

              {/* Banner Image Upload & Preview */}
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <label className="font-black text-slate-800 block text-xs flex items-center justify-between">
                  <span>صورة البنر الإعلاني *:</span>
                  <span className="text-[10px] text-slate-400 font-normal">رفع من الجهاز أو رابط صورة</span>
                </label>

                <div className="space-y-3">
                  {/* Banner Preview */}
                  {image && (
                    <div className="w-full h-32 rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs relative">
                      <img
                        src={image}
                        alt="Banner Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Upload from Device Button & URL Input */}
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
                              const compressedDataUrl = await compressImageFile(file, 1920, 1080, 0.88);
                              setImage(compressedDataUrl);
                              toast.success('تم رفع وتجهيز صورة البنر بنجاح ✨');
                            } catch (err) {
                              toast.error('تعذر معالجة الصورة، يرجى اختيار ملف صورة صالح');
                            }
                          }
                        }}
                      />
                    </label>

                    {image && (
                      <button
                        type="button"
                        onClick={() => setImage('')}
                        className="text-red-500 hover:text-red-700 text-[11px] font-bold py-1.5 px-2.5 rounded-xl bg-red-50 border border-red-200 transition cursor-pointer"
                      >
                        ✕ حذف الصورة
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    value={image.startsWith('data:') ? '✅ تم رفع صورة البنر من جهازك بنجاح' : image}
                    onChange={(e) => {
                      if (!image.startsWith('data:')) {
                        setImage(e.target.value);
                      }
                    }}
                    readOnly={image.startsWith('data:')}
                    placeholder="أو الصق رابط صورة إنترنت هنا (https://...)"
                    className="w-full bg-white border border-slate-300 rounded-xl py-1.5 px-3 text-[11px] font-mono text-slate-800 focus:border-brand-blue"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Banner Placement & Category Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">موقع عرض البنر الإعلاني:</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-bold cursor-pointer"
                  >
                    <option value="top">🔝 البنر الرئيسي في أعلى الصفحة الرئيسية</option>
                    <option value="middle"> البنر الإعلاني الأوسط (وسط الرئيسية)</option>
                    <option value="bottom">🔽 البنر الإعلاني في أسفل الصفحة الرئيسية</option>
                    <option value="category">📂 داخل قسم محدد بالمتجر (مخصص للقسم)</option>
                    <option value="all">🌐 يظهر في جميع الأماكن</option>
                  </select>
                </div>

                {position === 'category' && (
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">القسم المستهدف:</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-bold cursor-pointer"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Badge & Link */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">شارة البنر (Badge):</label>
                  <input
                    type="text"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    placeholder="مثال: توصيل سريع 🚚 أو عرض حصري 🔥"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">رابط الوجهة عند النقر:</label>
                  <input
                    type="text"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="/products"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* THEMED SHOWCASE CAMPAIGN SECTION (منتجات معروضة داخل الحملة) */}
              <div className="border border-emerald-200 bg-emerald-50/50 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isCampaignShowcase}
                      onChange={(e) => setIsCampaignShowcase(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <span>🏷️ تحويل البنر إلى حملة ترويجية مدمجة مع منتجات معروضة</span>
                      <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.2 rounded-full font-bold">
                        مثل &quot;منتجاتنا الطازجة&quot;
                      </span>
                    </span>
                  </label>
                </div>

                {isCampaignShowcase && (
                  <div className="space-y-3 pt-2 border-t border-emerald-200/60">
                    
                    {/* Theme Color Selector */}
                    <div>
                      <label className="block text-slate-800 font-bold mb-1.5 text-xs">
                        لون ثيم خلفية الحملة:
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[
                          { name: 'أخضر طازج', color: '#15803d' },
                          { name: 'برتقالي', color: '#ea580c' },
                          { name: 'أزرق', color: '#0284c7' },
                          { name: 'بنفسجي', color: '#7c3aed' },
                          { name: 'عنبري', color: '#d97706' },
                          { name: 'رمادي داكن', color: '#1e293b' },
                        ].map((item) => (
                          <button
                            key={item.color}
                            type="button"
                            onClick={() => setCampaignBgColor(item.color)}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition ${
                              campaignBgColor === item.color ? 'ring-2 ring-slate-900 scale-105' : 'opacity-85 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: item.color }}
                          >
                            <span>{item.name}</span>
                            {campaignBgColor === item.color && <Check className="w-3 h-3 stroke-[3]" />}
                          </button>
                        ))}

                        <input
                          type="color"
                          value={campaignBgColor}
                          onChange={(e) => setCampaignBgColor(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                          title="اختر لون مخصص"
                        />
                      </div>
                    </div>

                    {/* Products Section Title */}
                    <div>
                      <label className="block text-slate-800 font-bold mb-1 text-xs">
                        عنوان قسم المنتجات المعروضة:
                      </label>
                      <input
                        type="text"
                        value={campaignProductsTitle}
                        onChange={(e) => setCampaignProductsTitle(e.target.value)}
                        placeholder="مثال: منتجاتنا الطازجة | تشكيلة المشروبات المميزة"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 font-bold"
                      />
                    </div>

                    {/* Search & Select Products for this Campaign */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-800 font-bold text-xs">
                          اختر المنتجات المعروضة في شريط الحملة ({campaignProductIds.length} منتج محدد):
                        </label>
                        {campaignProductIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setCampaignProductIds([])}
                            className="text-[10px] text-red-600 hover:underline font-bold cursor-pointer"
                          >
                            إلغاء تحديد الكل
                          </button>
                        )}
                      </div>

                      {/* Search box for products */}
                      <div className="relative">
                        <input
                          type="text"
                          value={productSearchFilter}
                          onChange={(e) => setProductSearchFilter(e.target.value)}
                          placeholder="ابحث عن منتج لإضافته للحملة..."
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 pr-8 pl-3 text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                      </div>

                      {/* Products Multi-Select Scrollable Box */}
                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white p-2 space-y-1">
                        {products
                          .filter((p) =>
                            !productSearchFilter.trim() ||
                            p.name.toLowerCase().includes(productSearchFilter.toLowerCase()) ||
                            (p.category && p.category.toLowerCase().includes(productSearchFilter.toLowerCase()))
                          )
                          .map((p) => {
                            const isSelected = campaignProductIds.includes(p.id);
                            return (
                              <div
                                key={p.id}
                                onClick={() => toggleProductInCampaign(p.id)}
                                className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition ${
                                  isSelected
                                    ? 'bg-emerald-50 border border-emerald-300 font-bold text-emerald-950'
                                    : 'hover:bg-slate-50 border border-transparent text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                                    {p.images && p.images[0] ? (
                                      <img src={p.images[0]} alt={p.name} className="w-full h-full object-contain" />
                                    ) : (
                                      <span>📦</span>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-[11px] font-bold">{p.name}</p>
                                    <span className="text-[10px] text-slate-400 block font-mono">
                                      {p.price.toLocaleString()} د.ع • {p.category}
                                    </span>
                                  </div>
                                </div>

                                <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                  isSelected ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white'
                                }`}>
                                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-brand-blue rounded border-slate-300 focus:ring-brand-blue"
                />
                <label htmlFor="isActiveCheck" className="text-slate-800 font-bold cursor-pointer">
                  تفعيل ونشر البنر / الحملة فوراً في المتجر
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-brand-coral hover:bg-brand-coralHover text-white font-black py-2 px-5 rounded-xl shadow-xs transition cursor-pointer"
                >
                  {isSaving ? 'جاري الحفظ...' : 'حفظ ونشر البنر'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}
      </>
      ) : (
        /* MULTI POPUP ADVERTISEMENT TAB */
        <div className="space-y-6">
          
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>📢 إدارة البوسترات المنبثقة المتتابعة (Sequential Popups)</span>
                <span className="bg-brand-coral/10 text-brand-coral font-bold text-[10px] px-2 py-0.5 rounded-full">
                  {popupAds.length} بوستر
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                تظهر للزبون عند فتح المتجر بصورة متتابعة (عندما يغلق الزبون الإعلان الأول يظهر له الإعلان التالي بسلاسة)
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleOpenAddPopup}
                className="bg-brand-coral hover:bg-brand-coralHover text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>➕ إضافة بوستر منبثق جديد</span>
              </button>

              <button
                type="button"
                onClick={handleResetSeenAd}
                className="bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs py-2.5 px-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-amber-200"
                title="إعادة تعيين الذاكرة لتجربة الظهور المتتابع في متصفحك مجدداً"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة تجربة الظهور 🔄</span>
              </button>
            </div>
          </div>

          {/* POPUP ADS LIST GRID */}
          {popupAds.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center text-2xl font-black">
                📢
              </div>
              <h3 className="font-black text-slate-800 text-sm">لا يوجد بوسترات منبثقة مضافة حالياً</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                أضف بوسترات وإعلانات لمنتجاتك وعروضك المميزة لتظهر للزبائن عند دخولهم المتجر بصورة متتابعة.
              </p>
              <button
                type="button"
                onClick={handleOpenAddPopup}
                className="bg-brand-coral hover:bg-brand-coralHover text-white font-black text-xs py-2.5 px-5 rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة أول بوستر منبثق</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {popupAds.map((ad, idx) => (
                <div
                  key={ad.id || idx}
                  className={`bg-white rounded-3xl border overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between ${
                    ad.isEnabled ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
                  }`}
                >
                  {/* Poster Image Container */}
                  <div className="relative aspect-[3/4] bg-slate-900 group">
                    <img
                      src={ad.image || '/sample-iraq-banner.jpg'}
                      alt={ad.title || 'بوستر'}
                      className="w-full h-full object-cover"
                    />

                    {/* Sequence Badge */}
                    <div className="absolute top-3 right-3 bg-slate-950/80 text-white font-black text-[10px] px-2.5 py-1 rounded-full border border-white/20 backdrop-blur-xs flex items-center gap-1">
                      <span>ترتيب العرض: #{ad.order || idx + 1}</span>
                    </div>

                    {/* Quick Preview Button */}
                    <button
                      type="button"
                      onClick={() => setPreviewPopupImage(ad.image || '')}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-black gap-1 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>معاينة بالحجم الكامل</span>
                    </button>
                  </div>

                  {/* Details and Actions */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h4 className="font-black text-slate-900 text-xs truncate" title={ad.title}>
                        {ad.title || 'بوستر إعلاني'}
                      </h4>
                      <p className="text-[10px] font-mono text-slate-500 truncate mt-0.5" dir="ltr" title={ad.linkUrl}>
                        {ad.linkUrl}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                      <span className={`font-bold px-2 py-0.5 rounded-md ${
                        ad.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {ad.isEnabled ? '🟢 نشط ومفعل' : '⚪ معطل'}
                      </span>

                      <span className="text-[10px] text-slate-500">
                        {ad.showOncePerUser ? 'مرة واحدة للزبون' : 'في كل زيارة'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleTogglePopupActive(ad)}
                        className={`flex-1 py-1.5 px-2 rounded-xl font-bold text-[11px] transition flex items-center justify-center gap-1 cursor-pointer ${
                          ad.isEnabled
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-900'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {ad.isEnabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{ad.isEnabled ? 'تعطيل' : 'تفعيل'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditPopup(ad)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-xl font-bold transition cursor-pointer"
                        title="تعديل البوستر"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePopupAd(ad.id || '', ad.title)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl font-bold transition cursor-pointer"
                        title="حذف البوستر"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* POPUP AD ADD / EDIT MODAL */}
      {isPopupModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <span>{editingPopupAd ? '✏️ تعديل البوستر المنبثق' : '➕ إضافة بوستر منبثق جديد'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsPopupModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePopupAd} className="space-y-4">
              
              {/* Title */}
              <div>
                <label className="block text-slate-800 font-bold mb-1">اسم / عنوان البوستر (للإدارة):</label>
                <input
                  type="text"
                  value={popupTitle}
                  onChange={(e) => setPopupTitle(e.target.value)}
                  placeholder="مثال: بوستر عروض مشروبات الطاقة / كراتين السناكات"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-coral font-bold"
                />
              </div>

              {/* Order and Display Setting */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-800 font-bold mb-1">ترتيب الظهور المتتابع:</label>
                  <input
                    type="number"
                    min="1"
                    value={popupOrder}
                    onChange={(e) => setPopupOrder(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-coral font-bold font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">1 = يظهر أولاً، 2 = يظهر ثانياً</span>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="text-slate-800 font-bold mb-1 block">خيارات الظهور:</label>
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      checked={popupShowOnce}
                      onChange={(e) => setPopupShowOnce(e.target.checked)}
                      className="w-4 h-4 text-brand-blue rounded border-slate-300"
                    />
                    <span className="text-[11px] font-bold text-slate-700">مرة واحدة فقط للزبون</span>
                  </label>
                </div>
              </div>

              {/* Vertical Image Upload */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-800 font-bold">صورة البوستر العامودي (3:4 أو 4:5) *:</label>
                  <span className="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    تناسب الهاتف والكمبيوتر
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="bg-brand-coral hover:bg-brand-coralHover text-white px-4 py-2 rounded-xl font-black text-xs cursor-pointer shadow-xs transition flex items-center gap-2 shrink-0">
                    <ImageIcon className="w-4 h-4" />
                    <span>📁 رفع صورة من جهازك</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const base64 = await compressImageFile(file, 1000, 1400, 0.85);
                            setPopupImage(base64);
                            toast.showToast('تم رفع وضغط صورة البوستر بنجاح ✅', 'success');
                          } catch {
                            const reader = new FileReader();
                            reader.onload = () => {
                              setPopupImage(reader.result as string);
                              toast.showToast('تم رفع صورة البوستر بنجاح ✅', 'success');
                            };
                            reader.readAsDataURL(file);
                          }
                        }
                      }}
                    />
                  </label>

                  {popupImage && (
                    <button
                      type="button"
                      onClick={() => setPopupImage('')}
                      className="bg-slate-200 hover:bg-red-100 hover:text-red-600 text-slate-700 font-bold text-xs py-2 px-3 rounded-xl transition flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>إزالة</span>
                    </button>
                  )}
                </div>

                {popupImage && (
                  <div className="relative aspect-[3/4] max-w-[150px] rounded-2xl overflow-hidden border-2 border-slate-300 bg-slate-100 shadow-md">
                    <img
                      src={popupImage}
                      alt="معاينة"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <input
                  type="text"
                  value={popupImage.startsWith('data:') ? '✅ تم رفع صورة البوستر من جهازك' : popupImage}
                  onChange={(e) => {
                    if (!popupImage.startsWith('data:')) {
                      setPopupImage(e.target.value);
                    }
                  }}
                  readOnly={popupImage.startsWith('data:')}
                  placeholder="أو الصق رابط صورة إنترنت هنا (https://...)"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-[11px] font-mono text-slate-800 focus:border-brand-coral"
                  dir="ltr"
                />
              </div>

              {/* Link URL */}
              <div>
                <label className="block text-slate-800 font-bold mb-1">
                  رابط الوجهة عند النقر على البوستر:
                </label>
                <input
                  type="text"
                  value={popupLinkUrl}
                  onChange={(e) => setPopupLinkUrl(e.target.value)}
                  placeholder="مثال: /products?filter=offers أو /products?category=سناك وشيبس ومقرمشات"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-coral font-mono font-bold"
                  dir="ltr"
                />
              </div>

              {/* Activation Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="popupEnabledCheck"
                  checked={popupEnabled}
                  onChange={(e) => setPopupEnabled(e.target.checked)}
                  className="w-4 h-4 text-brand-coral rounded border-slate-300"
                />
                <label htmlFor="popupEnabledCheck" className="text-slate-800 font-bold cursor-pointer text-xs">
                  تفعيل ونشر البوستر المنبثق فوراً في المتجر
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPopupModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl cursor-pointer text-xs"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSavingPopup}
                  className="bg-brand-coral hover:bg-brand-coralHover text-white font-black py-2 px-6 rounded-xl shadow-xs transition cursor-pointer text-xs"
                >
                  {isSavingPopup ? 'جاري الحفظ...' : editingPopupAd ? 'حفظ التعديلات' : 'إضافة ونشر البوستر'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* FULLSCREEN IMAGE PREVIEW */}
      {previewPopupImage && (
        <div
          onClick={() => setPreviewPopupImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-150"
        >
          <div className="relative max-w-xs w-full my-auto" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewPopupImage(null)}
              className="absolute -top-3.5 -left-3.5 z-30 w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center border-2 border-white shadow-xl cursor-pointer"
            >
              ✕
            </button>
            <div className="rounded-3xl overflow-hidden shadow-2xl border-2 border-white/40 bg-slate-900 aspect-[3/4]">
              <img
                src={previewPopupImage}
                alt="معاينة"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
