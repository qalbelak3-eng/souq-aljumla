'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Trash2, Edit2, Check, X, ExternalLink, RefreshCw, Eye, EyeOff, Image as ImageIcon, Layers, Tag, Search, ShoppingBag, Info } from 'lucide-react';
import { Banner, PopupAdSettings, Category, Product } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';
import { compressImageFile } from '@/lib/imageUtils';

export default function AdminBannersPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'slider' | 'sprite' | 'campaigns' | 'popup'>('slider');

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
  const [position, setPosition] = useState<'top' | 'below_categories' | 'middle' | 'bottom' | 'category' | 'all'>('top');
  const [category, setCategory] = useState('');
  const [order, setOrder] = useState<number>(1);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Showcase Campaign & Sprite Slider Specific State
  const [isCampaignShowcase, setIsCampaignShowcase] = useState(false);
  const [isTextShelf, setIsTextShelf] = useState(false);
  const [isSpriteSlider, setIsSpriteSlider] = useState(false);
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
    setOrder(banners.filter((b) => !b.isCampaignShowcase && !b.isSpriteSlider && b.position !== 'below_categories').length + 1);
    setIsActive(true);
    setIsCampaignShowcase(false);
    setIsTextShelf(false);
    setIsSpriteSlider(false);
    setCampaignBgColor('#15803d');
    setCampaignProductsTitle('منتجاتنا الطازجة');
    setCampaignProductIds([]);
    setProductSearchFilter('');
    setIsModalOpen(true);
  };

  const handleOpenAddSprite = () => {
    setEditingBanner(null);
    setTitle('');
    setSubtitle('');
    setImage('');
    setLinkUrl('/products');
    setBadge('جديد ✦');
    setPosition('below_categories');
    setCategory(categories[0]?.name || '');
    setOrder(banners.filter((b) => !b.isCampaignShowcase && (b.isSpriteSlider || b.position === 'below_categories')).length + 1);
    setIsActive(true);
    setIsCampaignShowcase(false);
    setIsTextShelf(false);
    setIsSpriteSlider(true);
    setCampaignBgColor('#15803d');
    setCampaignProductsTitle('');
    setCampaignProductIds([]);
    setProductSearchFilter('');
    setIsModalOpen(true);
  };

  const handleOpenAddCampaign = () => {
    setEditingBanner(null);
    setTitle('');
    setSubtitle('');
    setImage('');
    setLinkUrl('');
    setBadge('');
    setPosition('bottom');
    setCategory(categories[0]?.name || '');
    setOrder(banners.filter((b) => b.isCampaignShowcase).length + 1);
    setIsActive(true);
    setIsCampaignShowcase(true);
    setIsTextShelf(false);
    setIsSpriteSlider(false);
    setCampaignBgColor('#15803d');
    setCampaignProductsTitle('');
    setCampaignProductIds([]);
    setProductSearchFilter('');
    setIsModalOpen(true);
  };

  const handleOpenAddTextShelf = () => {
    setEditingBanner(null);
    setTitle('');
    setSubtitle('');
    setImage('');
    setLinkUrl('');
    setBadge('');
    setPosition('bottom');
    setCategory(categories[0]?.name || '');
    setOrder(banners.filter((b) => b.isCampaignShowcase).length + 1);
    setIsActive(true);
    setIsCampaignShowcase(true);
    setIsTextShelf(true);
    setIsSpriteSlider(false);
    setCampaignBgColor('');
    setCampaignProductsTitle('');
    setCampaignProductIds([]);
    setProductSearchFilter('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setTitle(banner.title);
    setSubtitle(banner.subtitle || '');
    setImage(banner.image || '');
    setLinkUrl(banner.linkUrl || '');
    setBadge(banner.badge || '');
    setPosition(banner.position || 'top');
    setCategory(banner.category || (categories[0]?.name || ''));
    setOrder(banner.order || 1);
    setIsActive(banner.isActive);
    setIsCampaignShowcase(Boolean(banner.isCampaignShowcase));
    setIsTextShelf(Boolean(banner.isTextShelf));
    setIsSpriteSlider(Boolean(banner.isSpriteSlider) || banner.position === 'below_categories');
    setCampaignBgColor(banner.campaignBgColor || '#15803d');
    setCampaignProductsTitle(banner.campaignProductsTitle || banner.title || '');
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

    if (!title.trim()) {
      toast.error('يرجى كتابة عنوان للقسم أو البنر');
      return;
    }

    if (!isCampaignShowcase && !image.trim()) {
      toast.error('يرجى إضافة صورة للبنر');
      return;
    }

    if (isCampaignShowcase && !isTextShelf && !image.trim()) {
      toast.error('يرجى رفع أو إضافة صورة التصميم الإعلاني الكامل للحملة');
      return;
    }

    setIsSaving(true);

    const payload = {
      title: title.trim(),
      subtitle: subtitle.trim(),
      image: image.trim(),
      linkUrl: linkUrl.trim(),
      badge: badge.trim(),
      position,
      category: position === 'category' || category ? category.trim() : '',
      order: Number(order) || 1,
      isCampaignShowcase,
      isTextShelf,
      isSpriteSlider: isSpriteSlider || position === 'below_categories',
      campaignBgColor: isCampaignShowcase ? campaignBgColor : undefined,
      campaignProductsTitle: isCampaignShowcase ? (campaignProductsTitle.trim() || title.trim()) : undefined,
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
          toast.success('تم تحديث البيانات بنجاح ✨');
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
          toast.success(isTextShelf ? 'تمت إضافة القسم الكتابي الفاصل بنجاح ✨' : 'تمت إضافة الحملة بنجاح ✨');
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حفظ البيانات');
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

  const sliderBanners = banners
    .filter((b) => !b.isCampaignShowcase && !b.isSpriteSlider && b.position !== 'below_categories')
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const spriteBanners = banners
    .filter((b) => !b.isCampaignShowcase && (b.isSpriteSlider || b.position === 'below_categories'))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const campaignBanners = banners
    .filter((b) => b.isCampaignShowcase)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-6 text-xs select-none">
      
      {/* Top Tabs Switcher */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-2 lg:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('slider')}
          className={`py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'slider'
              ? 'bg-brand-blue text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>🖼️ البنرات المتحركة (الرئيسية)</span>
          <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
            {sliderBanners.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sprite')}
          className={`py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'sprite'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
          }`}
        >
          <span>🎯 سلايدر إعلانات ثانوي</span>
          <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
            {spriteBanners.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('campaigns')}
          className={`py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'campaigns'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
          }`}
        >
          <span>🍏 حملات العروض والأقسام الفاصلة</span>
          <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
            {campaignBanners.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('popup')}
          className={`py-2.5 px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'popup'
              ? 'bg-brand-coral text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
          }`}
        >
          <span>📢 الإعلان المنبثق (Popup)</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
            popupEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {popupAds.length} بوستر
          </span>
        </button>
      </div>

      {/* TAB 1: SLIDER BANNERS (ORIGINAL / STANDARD) */}
      {activeTab === 'slider' && (
        <>
          {/* Header for Slider */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-blue" />
                <h2 className="text-base font-black text-slate-900">إدارة البنرات الإعلانية المتحركة (الرئيسية القديمة)</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                البنرات الترويجية المتحركة بالقياسات الأصلية التي تظهر في السلايدر الرئيسي بالأعلى أو وسط وأسفل الصفحة
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenAdd}
                className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة بنر متحرك جديد</span>
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

          {/* Dimension Guide Card for Tab 1 */}
          <div className="bg-gradient-to-l from-blue-50 via-indigo-50/40 to-white border border-blue-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-blue-950 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                <Info className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-xs text-slate-900">📐 دليل أبعاد البنرات الرئيسية:</span>
                  <span className="bg-blue-600 text-white font-mono font-black text-[11px] px-2.5 py-0.5 rounded-lg shadow-xs">
                    1920 × 1080 px (أو 1200 × 675 px)
                  </span>
                  <span className="bg-blue-100 text-blue-800 font-bold text-[10px] px-2 py-0.5 rounded-md font-mono border border-blue-200">
                    نسبة 16:9 عريض قياسي
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  الأنسب للسلايدر الرئيسي الكبير في أعلى أو وسط الصفحة. ⚡ <strong>نظام الضغط الذكي:</strong> يقوم المتجر آلياً بضغط الصورة وتحسين كفاءتها لضمان سرعة تحميل فائقة وتوفير باقة الإنترنت للزبائن.
                </p>
              </div>
            </div>
          </div>

          {/* Slider Banners List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoading ? (
              <div className="col-span-full py-16 text-center">
                <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">جاري تحميل البنرات...</p>
              </div>
            ) : sliderBanners.length === 0 ? (
              <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
                <ImageIcon className="w-12 h-12 mx-auto text-slate-300" />
                <h3 className="text-sm font-black text-slate-800">لا توجد بنرات إعلانية متحركة حالياً</h3>
                <button
                  onClick={handleOpenAdd}
                  className="bg-brand-blue text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                >
                  أضف أول بنر متحرك الآن
                </button>
              </div>
            ) : (
              sliderBanners.map((banner) => (
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

                    {/* Status Overlay */}
                    <span
                      className={`absolute top-3 left-3 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs ${
                        banner.isActive
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-700 text-white'
                      }`}
                    >
                      {banner.isActive ? 'نشط ويظهر بالمتجر ✓' : 'معطل مخفي ✕'}
                    </span>
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
                  </div>

                  {/* Actions Footer */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleToggleActive(banner)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition flex items-center gap-1 cursor-pointer ${
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
                        className="bg-slate-100 hover:bg-slate-200 text-brand-blue p-2 rounded-xl transition cursor-pointer"
                        title="تعديل البنر"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteBanner(banner.id, banner.title)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl transition cursor-pointer"
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
        </>
      )}

      {/* TAB 2: SPRITE / SECONDARY SLIDER BANNERS (سلايدر إعلانات ثانوي) */}
      {activeTab === 'sprite' && (
        <>
          {/* Header for Secondary Slider */}
          <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-950 text-white p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🎯</span>
                <h2 className="text-base font-black">سلايدر إعلانات ثانوي (مدمج ومتعدد الشرائح)</h2>
              </div>
              <p className="text-xs text-emerald-100 mt-1 max-w-2xl leading-relaxed">
                سلايدر إعلاني متحرك مدمج وأنيق، يظهر أسفل الأقسام مباشرة أو بأي مكان تختاره مع دعم الشرائح المتعددة بنقاط التنقل.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleOpenAddSprite}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-2.5 px-4 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>➕ إضافة سلايد إعلاني ثانوي جديد</span>
              </button>

              <button
                onClick={fetchBannersAndData}
                className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold py-2.5 px-3 rounded-xl transition cursor-pointer"
                title="تحديث"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Dimension Guide Card for Tab 2 */}
          <div className="bg-gradient-to-l from-emerald-50 via-teal-50/40 to-white border border-emerald-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-emerald-950 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                <Info className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-xs text-slate-900">📐 دليل أبعاد سلايدر الإعلانات الثانوي:</span>
                  <span className="bg-emerald-700 text-white font-mono font-black text-[11px] px-2.5 py-0.5 rounded-lg shadow-xs">
                    1200 × 450 px (أو 1080 × 400 px)
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded-md font-mono border border-emerald-200">
                    نسبة 21:8 مدمج ونحيف (ستايل سبرايت هنقرستيشن)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  مخصص للسلايدرات الإعلانية الأنيقة (مثل إعلان سبرايت في تطبيق هنقرستيشن) بارتفاع متناسق يظهر كامل تفاصيل التصميم دون قص الأطراف. ⚡ <strong>ضغط فوري:</strong> يتم ضغط الصورة آلياً بأعلى جودة.
                </p>
              </div>
            </div>
          </div>

          {/* Secondary Banners List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoading ? (
              <div className="col-span-full py-16 text-center">
                <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">جاري تحميل سلايدات الإعلانات الثانوية...</p>
              </div>
            ) : spriteBanners.length === 0 ? (
              <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-2xl font-black">
                  🎯
                </div>
                <h3 className="text-sm font-black text-slate-800">لا توجد سلايدات إعلانات ثانوية حالياً</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  أضف سلايدات إعلانية لتظهر أسفل الأقسام مباشرة بشكل متعدد السلايدات وبقياس مدمج أنيق
                </p>
                <button
                  onClick={handleOpenAddSprite}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer shadow-xs transition inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>أضف أول سلايد إعلاني ثانوي الآن</span>
                </button>
              </div>
            ) : (
              spriteBanners.map((banner) => (
                <div
                  key={banner.id}
                  className={`bg-white rounded-3xl overflow-hidden border shadow-sm transition-all duration-300 flex flex-col justify-between ${
                    banner.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
                  }`}
                >
                  {/* Banner Image Preview in Sleek Sprite Aspect Ratio */}
                  <div className="relative aspect-[22/9] w-full bg-slate-100 overflow-hidden">
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

                    {/* Order Badge */}
                    <span className="absolute top-3 left-3 bg-slate-900/90 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full shadow-md font-mono border border-white/20">
                      الترتيب: #{banner.order || 1}
                    </span>

                    {/* Position Badge */}
                    <span className="absolute bottom-3 right-3 bg-slate-900/85 text-white font-bold text-[10px] px-2.5 py-1 rounded-full shadow-xs backdrop-blur-xs flex items-center gap-1">
                      {(!banner.position || banner.position === 'below_categories')
                        ? '🎯 أسفل الأقسام مباشرة'
                        : banner.position === 'top'
                        ? '🔝 أعلى الصفحة الرئيسية'
                        : banner.position === 'middle'
                        ? ' وسط الصفحة الرئيسية'
                        : banner.position === 'bottom'
                        ? '🔽 أسفل الصفحة الرئيسية'
                        : banner.position === 'category'
                        ? `📂 داخل قسم: ${banner.category || 'عام'}`
                        : '🌐 في كل الأماكن'}
                    </span>
                  </div>

                  {/* Banner Content Details */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-black text-slate-900 leading-snug">
                        {banner.title}
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        banner.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {banner.isActive ? '🟢 نشط ويظهر' : '⚪ معطل'}
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
                  </div>

                  {/* Actions Footer */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleToggleActive(banner)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition flex items-center gap-1 cursor-pointer ${
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
                        className="bg-slate-100 hover:bg-slate-200 text-brand-blue p-2 rounded-xl transition cursor-pointer"
                        title="تعديل السلايد"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteBanner(banner.id, banner.title)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl transition cursor-pointer"
                        title="حذف السلايد"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* TAB 2: SHOWCASE CAMPAIGNS & TEXT SHELVES (حملات العروض وأشرطة المنتجات الفاصلة) */}
      {activeTab === 'campaigns' && (
        <>
          {/* Header for Showcase Campaigns & Text Shelves */}
          <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 text-white p-6 rounded-3xl shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🍏</span>
                <h2 className="text-base font-black">حملات العروض والأقسام الكتابية الفاصلة (Showcases & Text Shelves)</h2>
              </div>
              <p className="text-xs text-emerald-100 mt-1 max-w-2xl leading-relaxed">
                يمكنك إنشاء بنرات حملات مصممة كاملة (مع منتجات متداخلة)، أو إنشاء <strong>أقسام وأشرطة منتجات كتابية فاصلة</strong> (مثل: "الآيس كريم والحلويات") بدون صورة بنر لتفصل بين البنرات برتابة وجمالية متناسقة.
              </p>
            </div>

            <div className="flex items-center flex-wrap gap-2 shrink-0">
              <button
                onClick={handleOpenAddCampaign}
                className="bg-white hover:bg-emerald-50 text-emerald-800 font-black text-xs py-2.5 px-3.5 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>➕ بنر حملة مصمم</span>
              </button>

              <button
                onClick={handleOpenAddTextShelf}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-2.5 px-3.5 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>📝 قسم كتابي فاصل</span>
              </button>

              <button
                onClick={fetchBannersAndData}
                className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold py-2.5 px-3 rounded-xl transition cursor-pointer"
                title="تحديث"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Dimension Guide Card for Tab 3 */}
          <div className="bg-gradient-to-l from-teal-50 via-emerald-50/40 to-white border border-teal-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-teal-950 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-teal-700 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                <Info className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-xs text-slate-900">📐 أبعاد حملات العروض والأقسام:</span>
                  <span className="bg-teal-700 text-white font-mono font-black text-[11px] px-2.5 py-0.5 rounded-lg shadow-xs">
                    🎨 بنر مصمم: 1200 × 400 px إلى 1200 × 450 px (نسبة 24:8 أو 18:6)
                  </span>
                  <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-md shadow-xs">
                    📝 القسم الكتابي الفاصل: لا يحتاج صورة نهائياً (عنوان وألوان وشريط منتجات)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  صورة الحملة المصممة تمتد في الخلفية وتتداخل المنتجات فوقها في شريط أفقي. ⚡ <strong>ضغط ذكي:</strong> يقوم النظام بتحسين وضغط الصور فوراً عند الرفع.
                </p>
              </div>
            </div>
          </div>

          {/* Campaign Banners & Text Shelves List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoading ? (
              <div className="col-span-full py-16 text-center">
                <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">جاري تحميل حملات العروض والأقسام الفاصلة...</p>
              </div>
            ) : campaignBanners.length === 0 ? (
              <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-2xl font-black">
                  🍏
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-800">لا توجد حملات عروض أو أقسام فاصلة حالياً</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    قم بإنشاء بنر حملة مصمم أو قسم كتابي فاصل (مثل الآيس كريم والحلويات) يظهر مع شريط منتجات في الرئيسية
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={handleOpenAddCampaign}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer shadow-xs transition inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إنشاء بنر مصمم</span>
                  </button>
                  <button
                    onClick={handleOpenAddTextShelf}
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer shadow-xs transition inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إنشاء قسم كتابي فاصل</span>
                  </button>
                </div>
              </div>
            ) : (
              campaignBanners.map((banner) => (
                <div
                  key={banner.id}
                  className={`bg-white rounded-3xl overflow-hidden border shadow-sm transition-all duration-300 flex flex-col justify-between ${
                    banner.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
                  }`}
                >
                  {/* Top Preview */}
                  {banner.isTextShelf ? (
                    <div className="p-4 bg-gradient-to-r from-slate-50 to-amber-50/50 border-b border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="bg-amber-500 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                          <span>📝 قسم كتابي فاصل</span>
                        </span>

                        <span className="bg-slate-800 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full font-mono">
                          الترتيب: #{banner.order || 1}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <h3 className="text-base font-black text-slate-900 leading-tight">
                          {banner.title || banner.campaignProductsTitle || 'قسم كتابي'}
                        </h3>
                        <div className="w-7 h-7 rounded-full bg-slate-200/80 text-slate-700 flex items-center justify-center font-bold text-xs">
                          ←
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative aspect-[21/9] w-full overflow-hidden bg-slate-100">
                      <img
                        src={banner.image}
                        alt={banner.title}
                        className="w-full h-full object-cover"
                      />

                      {/* Designer Badge */}
                      <span className="absolute top-3 right-3 bg-emerald-700/90 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-white/30 backdrop-blur-xs">
                        <span>🎨 بنر مصمم</span>
                      </span>

                      {/* Order Badge */}
                      <span className="absolute top-3 left-3 bg-slate-900/90 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full shadow-md font-mono border border-white/20">
                        الترتيب: #{banner.order || 1}
                      </span>

                      {/* Position Badge */}
                      <span className="absolute bottom-3 right-3 bg-slate-900/85 text-white font-bold text-[10px] px-2.5 py-1 rounded-full shadow-xs backdrop-blur-xs flex items-center gap-1">
                        {(!banner.position || banner.position === 'top')
                          ? '🔝 في أعلى الرئيسية'
                          : banner.position === 'below_categories'
                          ? '🎯 أسفل الأقسام مباشرة'
                          : banner.position === 'middle'
                          ? ' وسط الصفحة الرئيسية'
                          : banner.position === 'bottom'
                          ? '🔽 أسفل الصفحة الرئيسية'
                          : banner.position === 'category'
                          ? `📂 داخل قسم: ${banner.category || 'عام'}`
                          : '🌐 في كل الأماكن'}
                      </span>
                    </div>
                  )}

                  {/* Campaign Content Details */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-black text-slate-900 leading-snug">
                        {banner.title}
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        banner.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {banner.isActive ? '🟢 نشط ويظهر' : '⚪ معطل'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 font-bold text-slate-700">
                        <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                        <span>المنتجات المحددة للشريط:</span>
                      </div>
                      <span className="font-mono text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        {banner.campaignProductIds?.length || 0} منتجات
                      </span>
                    </div>

                    {banner.linkUrl && (
                      <span className="text-[10px] text-slate-400 font-mono block truncate">
                        الرابط: {banner.linkUrl}
                      </span>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleToggleActive(banner)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition flex items-center gap-1 cursor-pointer ${
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
                        className="bg-slate-100 hover:bg-slate-200 text-brand-blue p-2 rounded-xl transition cursor-pointer"
                        title="تعديل"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteBanner(banner.id, banner.title)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl transition cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                {isCampaignShowcase ? (
                  isTextShelf ? (
                    <>
                      <span className="text-base">📝</span>
                      <span>{editingBanner ? 'تعديل القسم الكتابي الفاصل' : 'إضافة قسم كتابي فاصل (شريط منتجات)'}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-base">🎨</span>
                      <span>{editingBanner ? 'تعديل بنر الحملة المصمم' : 'إضافة بنر حملة ترويجية مصممة'}</span>
                    </>
                  )
                ) : isSpriteSlider || position === 'below_categories' ? (
                  <>
                    <span className="text-base">🎯</span>
                    <span>{editingBanner ? 'تعديل سلايد إعلانات ثانوي' : 'إضافة سلايد إعلانات ثانوي جديد'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-brand-blue" />
                    <span>{editingBanner ? 'تعديل البنر الإعلاني المتحرك' : 'إضافة بنر إعلاني متحرك جديد'}</span>
                  </>
                )}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBanner} className="space-y-4">
              
              {/* Secondary Slider Tip */}
              {!isCampaignShowcase && (isSpriteSlider || position === 'below_categories') && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-[11px] text-emerald-900 space-y-1">
                  <span className="font-black flex items-center gap-1">🎯 ميزة سلايدر الإعلانات الثانوي:</span>
                  <p className="leading-relaxed">
                    يتم عرض هذا الإعلان بالقياس العريض والمدمج، ويمكنك إضافة عدة شرائح بنفس الموقع ليتحول تلقائياً إلى سلايدر متعدد الشرائح بنقاط تنقل أسفل الأقسام مباشرة أو بالمكان الذي تحدده.
                  </p>
                </div>
              )}
              
              {/* Type Switcher for Campaigns/Shelves */}
              {isCampaignShowcase && (
                <div className="bg-slate-100 p-1 rounded-2xl grid grid-cols-2 gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setIsTextShelf(false)}
                    className={`py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      !isTextShelf
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    <span>🎨 بنر مصمم كامل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTextShelf(true)}
                    className={`py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      isTextShelf
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    <span>📝 قسم كتابي فاصل</span>
                  </button>
                </div>
              )}

              {/* Guidance note */}
              {isCampaignShowcase && (
                <div className={`p-3 rounded-2xl text-[11px] space-y-1 border ${
                  isTextShelf 
                    ? 'bg-amber-50/80 border-amber-200 text-amber-950' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}>
                  <div className="font-black flex items-center gap-1.5">
                    <span>{isTextShelf ? '📝 ميزة القسم الكتابي الفاصل:' : '🎨 معلومة للمصمم والإدارة:'}</span>
                  </div>
                  <p className="leading-relaxed font-medium">
                    {isTextShelf
                      ? 'هذا القسم يظهر كعنوان كتابي فاصل وأنيق (مثل: "الآيس كريم والحلويات") مع سهم الانتقال للقسم وشريط المنتجات، بدون صورة بنر، ليفصل بين البنرات المصممة بسلاسة واحترافية مثل تطبيق هنقرستيشن.'
                      : 'صورة الحملة هي عبارة عن تصميم إعلاني كامل ومصمم جاهز من الجرافيك دزاين (يحتوي على النصوص والرسومات والعنوان والشعار)، وتحته يتم عرض شريط المنتجات المحددة أدناه بأسعارها وزر الإضافة.'}
                  </p>
                </div>
              )}

              {/* Title / Name */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  {isCampaignShowcase
                    ? (isTextShelf ? 'عنوان القسم الكتابي (يظهر كعنوان رئيسي للشريط): *' : 'اسم الحملة (للإدارة والتنظيم): *')
                    : 'عنوان البنر الرئيسي: *'}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    isCampaignShowcase
                      ? (isTextShelf ? 'مثال: الآيس كريم والحلويات | أو معجنات ومخبوزات' : 'مثال: حملة منتجاتنا الطازجة | أو بسيط SNACKS')
                      : 'مثال: سبرايت حمضيات ونعناع'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-bold"
                />
              </div>

              {!isCampaignShowcase && (
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
              )}

              {/* Banner Image Upload & Preview (Only for normal banners or designer showcase banners) */}
              {(!isCampaignShowcase || !isTextShelf) && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-slate-900 block text-xs">
                      {isCampaignShowcase ? 'صورة التصميم الإعلاني الكامل للحملة *:' : 'صورة البنر الإعلاني *:'}
                    </label>
                    <span className="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      رفع من جهازك أو رابط مباشر
                    </span>
                  </div>

                  {/* Dynamic Dimension & Compression Hint Box */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap font-bold text-[11px]">
                      <span className="text-slate-800 flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                        <span>القياس والأبعاد الموصى بها:</span>
                      </span>
                      <span className="bg-slate-900 text-white px-2.5 py-0.5 rounded-lg font-mono text-[10px] font-black">
                        {isSpriteSlider || position === 'below_categories'
                          ? '1200 × 450 px أو 1080 × 400 px (نسبة 21:8 ستايل سبرايت)'
                          : isCampaignShowcase
                          ? '1200 × 400 px إلى 1200 × 450 px (نسبة 24:8)'
                          : '1920 × 1080 px أو 1200 × 675 px (نسبة 16:9 قياسي)'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      ⚡ <strong>الضغط التلقائي:</strong> لا تقلق بشأن حجم ملف الصورة؛ يتم ضغط الصورة وتحسين حجمها آلياً بنظام ذكي لسرعة التصفح.
                    </p>
                  </div>

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
                      <label className={`${isCampaignShowcase ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-brand-blue hover:bg-brand-blueDark'} text-white text-xs font-black py-2 px-3.5 rounded-xl cursor-pointer transition shadow-xs flex items-center gap-1.5 active:scale-95`}>
                        <span>📁 رفع صورة التصميم من جهازك</span>
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
                                toast.success('تم رفع وتجهيز صورة التصميم بنجاح ✨');
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
                      value={image.startsWith('data:') ? '✅ تم رفع صورة التصميم من جهازك بنجاح' : image}
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
              )}

              {/* Placement & Order Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">موقع عرض {isCampaignShowcase ? 'السكشن' : 'البنر'}:</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-bold cursor-pointer"
                  >
                    <option value="top">🔝 أعلى الصفحة الرئيسية</option>
                    <option value="below_categories">🎯 أسفل الأقسام مباشرة (مثل سبرايت)</option>
                    <option value="middle"> وسط الصفحة الرئيسية</option>
                    <option value="bottom">🔽 أسفل الصفحة الرئيسية</option>
                    <option value="category">📂 داخل قسم محدد بالمتجر</option>
                    <option value="all">🌐 يظهر في جميع الأماكن</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">ترتيب الظهور التسلسلي (Order):</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-bold font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    الرقم الأصغر يظهر أولاً (مثال: 1 للبنر الأول، 2 للقسم الفاصل، 3 للبنر الثاني)
                  </span>
                </div>
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

              {/* Badge for normal banners or text shelves */}
              {(!isCampaignShowcase || isTextShelf) && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">شارة جانبية اختيارية (Badge):</label>
                  <input
                    type="text"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    placeholder="مثال: مميز ✨ أو جديد 🔥"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-bold"
                  />
                </div>
              )}

              {/* Link */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  رابط الوجهة عند النقر على السهم أو البنر (اتركه فارغاً ليفتح الصفحة المخصصة تلقائياً):
                </label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="تلقائي (/campaigns/...) أو مخصص"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-mono"
                  dir="ltr"
                />
              </div>

              {/* PRODUCTS SELECTOR FOR CAMPAIGN */}
              {isCampaignShowcase && (
                <div className="space-y-2.5 bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200/80">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-900 font-black text-xs flex items-center gap-1.5">
                      <span>🛍️ المنتجات المعروضة في الشريط أسفل التصميم:</span>
                      <span className="bg-emerald-700 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
                        {campaignProductIds.length} محدد
                      </span>
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
                      placeholder="ابحث عن اسم منتج أو قسم لإضافته لشريط الحملة..."
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 pr-8 pl-3 text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>

                  {/* Products Multi-Select Scrollable Box */}
                  <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl bg-white p-2 space-y-1">
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
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="isActiveCheck" className="text-slate-800 font-bold cursor-pointer">
                  تفعيل ونشر {isCampaignShowcase ? 'الحملة' : 'البنر'} فوراً في المتجر
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
                  className={`${isCampaignShowcase ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-brand-blue hover:bg-brand-blueDark'} text-white font-black py-2 px-5 rounded-xl shadow-xs transition cursor-pointer`}
                >
                  {isSaving ? 'جاري الحفظ...' : (isCampaignShowcase ? 'حفظ ونشر الحملة ✨' : 'حفظ ونشر البنر ✨')}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* TAB 3: MULTI POPUP ADVERTISEMENT TAB */}
      {activeTab === 'popup' && (
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

          {/* Dimension Guide Card for Tab 4 */}
          <div className="bg-gradient-to-l from-rose-50 via-orange-50/40 to-white border border-rose-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-rose-950 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-brand-coral text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                <Info className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-xs text-slate-900">📐 دليل أبعاد البوستر المنبثق (Popup):</span>
                  <span className="bg-brand-coral text-white font-mono font-black text-[11px] px-2.5 py-0.5 rounded-lg shadow-xs">
                    1080 × 1350 px (طولي 4:5 احترافي)
                  </span>
                  <span className="bg-rose-100 text-rose-900 font-bold text-[10px] px-2 py-0.5 rounded-md font-mono border border-rose-200">
                    أو 1080 × 1080 px (مربع 1:1)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  هذا القياس يعرض البوستر كاملاً بوضوح وجمالية تامة على الهواتف والشاشات الكبيرة دون أي قص. ⚡ <strong>نظام الضغط الذكي:</strong> يتم تحسين وضغط الصورة فوراً لتظهر بلحظة دخول الزبون للمتجر.
                </p>
              </div>
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
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-800 font-bold">صورة البوستر الإعلاني *:</label>
                  <span className="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    رفع من جهازك أو رابط مباشر
                  </span>
                </div>

                {/* Dimension & Compression Hint Box for Popup */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap font-bold text-[11px]">
                    <span className="text-slate-800 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-brand-coral shrink-0" />
                      <span>القياس والأبعاد الموصى بها للبوستر:</span>
                    </span>
                    <span className="bg-brand-coral text-white px-2.5 py-0.5 rounded-lg font-mono text-[10px] font-black">
                      1080 × 1350 px (طولي 4:5) أو 1080 × 1080 px (مربع 1:1)
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    ⚡ <strong>ضغط ذكي تلقائي:</strong> يتم تحجيم وضغط صورة البوستر تلقائياً لسرعة الظهور الفوري دون أي بطء في تجربة الزبون.
                  </p>
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
