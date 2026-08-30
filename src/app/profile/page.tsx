'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Package,
  Clock,
  Phone,
  MapPin,
  MessageCircle,
  LogOut,
  ArrowLeft,
  Store,
  Home,
  User as UserIcon,
  FileText,
  Camera,
  Upload,
  Check,
  X,
  Sparkles,
  Crown,
  Building,
  Gift,
  AlertCircle,
  Plus,
  Send,
  Trash2,
  Navigation,
  CheckCircle,
  Wallet,
  ShoppingBag,
  ExternalLink,
  Image as ImageIcon
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Order, SavedAddress, UserComplaint } from '@/types';
import MerchantTierBadge from '@/components/MerchantTierBadge';
import { getUserCashbackRate } from '@/lib/pricing';

const PRESET_AVATARS = [
  { id: 'merchant_1', name: 'تاجر أعمال أنيق 👔', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300' },
  { id: 'merchant_2', name: 'رجل أعمال وتجارة 💼', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=300' },
  { id: 'merchant_3', name: 'سوبرماركت ومحل تجاري 🏪', url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?q=80&w=300' },
  { id: 'merchant_4', name: 'تاج ذهبي VIP 👑', url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?q=80&w=300' },
  { id: 'merchant_5', name: 'أسطول التوريد والتوزيع 🚚', url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=300' },
  { id: 'merchant_6', name: 'مركز تجاري وتسوق 🏬', url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=300' },
  { id: 'merchant_7', name: 'تاجر شاب معاصر 📱', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=300' },
  { id: 'merchant_8', name: 'سيدة أعمال ومتجر 🏬', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=300' },
];

function ProfileContent() {
  const { user, logout, isLoading, isApprovedMerchant, refreshUser, updateProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<'orders' | 'rewards' | 'complaints' | 'locations' | 'account'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isFetchingOrders, setIsFetchingOrders] = useState(true);

  // Modern In-App Toast Notification State
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' | 'info' }>({
    show: false,
    message: '',
    type: 'success',
  });
  const toastTimeoutRef = useRef<any>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ show: true, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 2800);
  };

  // Avatar Modal State
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState('');
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Storefront Image State (صورة واجهة المحل)
  const storefrontFileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdatingStorefront, setIsUpdatingStorefront] = useState(false);

  // Account Edit State
  const [editName, setEditName] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Location Management State
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [isAddLocationModalOpen, setIsAddLocationModalOpen] = useState(false);
  const [newLocationTitle, setNewLocationTitle] = useState('موقع البيت 🏠');
  const [newLocationCity, setNewLocationCity] = useState('كربلاء المقدسة');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [newLocationMapsUrl, setNewLocationMapsUrl] = useState('');
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isDetectingLocationGps, setIsDetectingLocationGps] = useState(false);
  const [gpsLocationStatus, setGpsLocationStatus] = useState('');

  const handleDetectLocationGps = () => {
    if (!navigator.geolocation) {
      showToast('متصفحك لا يدعم تحديد الموقع عبر GPS', 'error');
      return;
    }
    setIsDetectingLocationGps(true);
    setGpsLocationStatus('جاري تحديد موقعك الجغرافي بالأقمار الصناعية GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const url = `https://www.google.com/maps?q=${lat},${lng}`;
        setNewLocationMapsUrl(url);
        setIsDetectingLocationGps(false);
        setGpsLocationStatus(`تم تحديد إحداثياتك بنجاح (${lat.toFixed(4)}, ${lng.toFixed(4)}) ✓`);
        showToast('تم التقاط وتثبيت موقعك الجغرافي بنجاح! 📍✓', 'success');
      },
      () => {
        setIsDetectingLocationGps(false);
        setGpsLocationStatus('تعذر الوصول لموقعك تلقائياً، يمكنك فتح الخريطة واختيار الموقع');
        showToast('تعذر الوصول للموقع الجغرافي تلقائياً', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Complaints State
  const [complaintText, setComplaintText] = useState('');
  const [complaintsList, setComplaintsList] = useState<UserComplaint[]>([]);
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);

  // Set active tab from query param if available
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['orders', 'rewards', 'complaints', 'locations', 'account'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [searchParams]);

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login?redirect=/profile');
    } else if (user) {
      setEditName(user.name || '');
      setEditBusinessName(user.businessName || '');
      setEditCity(user.city || 'كربلاء المقدسة');
      setEditAddress(user.address || '');
      setSavedAddresses(user.savedAddresses || [
        {
          id: 'loc_default_1',
          title: user.accountType === 'market' || user.accountType === 'wholesale' ? 'الماركت / المتجر 🏪' : 'موقع البيت 🏠',
          city: user.city || 'كربلاء المقدسة',
          address: user.address || 'حي الحر - كربلاء',
          isDefault: true,
        }
      ]);

      // Load stored complaints for this user from server API
      const loadComplaints = () => {
        fetch(`/api/complaints?phone=${encodeURIComponent(user.phone)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success && Array.isArray(data.complaints)) {
              setComplaintsList(data.complaints);
              
              // Mark all replied complaints as seen
              data.complaints.forEach((c: any) => {
                if (c.adminReply && typeof window !== 'undefined') {
                  localStorage.setItem('seen_reply_' + c.id, c.repliedAt || 'seen');
                }
              });
            }
          })
          .catch(() => {
            try {
              const stored = localStorage.getItem('complaints_' + user.phone);
              if (stored) setComplaintsList(JSON.parse(stored));
            } catch (e) {}
          });
      };

      loadComplaints();
      const compInterval = setInterval(loadComplaints, 6000);
      return () => clearInterval(compInterval);
    }
  }, [user, isLoading, router]);

  const [cashbackRate, setCashbackRate] = useState<number>(150);

  useEffect(() => {
    if (user) {
      Promise.all([
        fetch('/api/orders').then((res) => res.json()),
        fetch('/api/settings').then((res) => res.json()).catch(() => ({ success: false })),
      ])
        .then(([ordersData, settingsData]) => {
          if (settingsData?.success && settingsData?.settings) {
            const rate = getUserCashbackRate(user, settingsData.settings);
            setCashbackRate(rate);
          }
          if (ordersData?.success && ordersData?.orders) {
            const userOrders = ordersData.orders.filter(
              (o: Order) =>
                (o.customer.userId && o.customer.userId === user.id) ||
                (o.customer.email && user.email && o.customer.email.toLowerCase() === user.email.toLowerCase()) ||
                (o.customer.phone && o.customer.phone === user.phone)
            );
            setOrders(userOrders);
          }
          setIsFetchingOrders(false);
        })
        .catch(() => setIsFetchingOrders(false));
    }
  }, [user]);

  // Handle Avatar File Upload from Device
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 2 ميغابايت', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Storefront Image Upload
  const handleStorefrontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      showToast('حجم صورة واجهة المحل كبير جداً، يرجى اختيار صورة أقل من 4 ميغابايت', 'error');
      return;
    }

    setIsUpdatingStorefront(true);
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        try {
          const res = await updateProfile({ storefrontImage: reader.result });
          if (res.success) {
            const isMerchant = user?.accountType === 'market' || user?.accountType === 'wholesale' || user?.accountType === 'merchant';
            showToast(isMerchant ? 'تم تحديث وحفظ صورة واجهة المحل بنجاح! 🏪✓' : 'تم تحديث وحفظ صورة واجهة البيت بنجاح! 🏠✓', 'success');
          } else {
            showToast(res.error || 'فشل حفظ صورة الواجهة', 'error');
          }
        } catch {
          showToast('حدث خطأ أثناء حفظ صورة الواجهة', 'error');
        } finally {
          setIsUpdatingStorefront(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Save Avatar Selection
  const handleSaveAvatar = async () => {
    if (!selectedAvatarUrl) {
      showToast('يرجى اختيار صورة أولاً', 'error');
      return;
    }
    setIsSavingAvatar(true);
    try {
      const res = await updateProfile({ avatar: selectedAvatarUrl });
      if (res.success) {
        setIsAvatarModalOpen(false);
        showToast('تم حفظ وتحديث صورتك الشخصية بنجاح! 📸✓', 'success');
      } else {
        showToast(res.error || 'فشل حفظ الصورة', 'error');
      }
    } catch {
      showToast('حدث خطأ أثناء حفظ الصورة', 'error');
    } finally {
      setIsSavingAvatar(false);
    }
  };

  // Save Account Profile Changes
  const handleSaveAccountInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      showToast('يرجى إدخال اسم صاحب الحساب', 'error');
      return;
    }
    setIsSavingAccount(true);
    try {
      const res = await updateProfile({
        name: editName.trim(),
        businessName: editBusinessName.trim() || undefined,
        city: editCity.trim(),
        address: editAddress.trim(),
      });
      if (res.success) {
        showToast('تم تحديث معلومات الحساب والمتجر بنجاح! ✓', 'success');
      } else {
        showToast(res.error || 'فشل التحديث', 'error');
      }
    } catch {
      showToast('حدث خطأ في الاتصال', 'error');
    } finally {
      setIsSavingAccount(false);
    }
  };

  // Add New Location
  const handleSaveNewLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationAddress.trim()) {
      showToast('يرجى كتابة عنوان وتفاصيل الموقع', 'error');
      return;
    }
    setIsSavingLocation(true);
    const newLoc: SavedAddress = {
      id: 'loc_' + Date.now(),
      title: newLocationTitle,
      city: newLocationCity,
      address: newLocationAddress.trim(),
      mapsUrl: newLocationMapsUrl.trim() || undefined,
      isDefault: savedAddresses.length === 0,
    };
    const updated = [...savedAddresses, newLoc];
    setSavedAddresses(updated);
    await updateProfile({ savedAddresses: updated });
    setIsSavingLocation(false);
    setIsAddLocationModalOpen(false);
    setNewLocationAddress('');
    setNewLocationMapsUrl('');
    showToast('تم حفظ الموقع الجديد بنجاح! 📍✓', 'success');
  };

  // Delete Location
  const handleDeleteLocation = async (locId: string) => {
    const updated = savedAddresses.filter((l) => l.id !== locId);
    setSavedAddresses(updated);
    await updateProfile({ savedAddresses: updated });
    showToast('تم حذف الموقع بنجاح', 'info');
  };

  // Submit Complaint
  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintText.trim() || !user) {
      showToast('يرجى كتابة الشكوى أو الملاحظة قبل الإرسال', 'error');
      return;
    }
    setIsSubmittingComplaint(true);

    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          customerName: user.name || 'عميل المتجر',
          customerPhone: user.phone || '',
          businessName: user.businessName,
          city: user.city || 'كربلاء المقدسة',
          text: complaintText.trim(),
        }),
      });

      const data = await res.json();
      if (data.success && data.complaint) {
        setComplaintsList((prev) => [data.complaint, ...prev]);
        setComplaintText('');
        showToast('تم إرسال شكواك بنجاح للإدارة ووصلت للوحة التحكم! 📨✓', 'success');
      } else {
        showToast(data.error || 'فشل إرسال الشكوى', 'error');
      }
    } catch {
      showToast('حدث خطأ في الاتصال أثناء إرسال الشكوى', 'error');
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  const openAvatarModal = () => {
    setSelectedAvatarUrl(user?.avatar || '');
    setIsAvatarModalOpen(true);
  };

  if (isLoading || !user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-500 font-bold">جاري تحميل الحساب...</p>
      </div>
    );
  }

  // Calculate Rewards / Pieces
  const validProfileOrders = orders.filter((o) => o.status !== 'cancelled');
  const totalPiecesCount = validProfileOrders.reduce((sum, ord) => {
    return sum + ord.items.reduce((s, it) => s + it.quantity, 0);
  }, 0);
  const totalEarnedRewards = totalPiecesCount * cashbackRate;
  const totalUsedRewards = validProfileOrders.reduce((sum, ord) => sum + Number(ord.usedCashbackDiscount || 0), 0);
  const rewardCashbackAmount = Math.max(0, totalEarnedRewards - totalUsedRewards);

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'قيد المراجعة', color: 'bg-amber-50 text-amber-800 border-amber-200' },
    processing: { label: 'قيد التجهيز بالمستودع', color: 'bg-sky-50 text-brand-blue border-sky-200' },
    shipped: { label: 'خرج مع المندوب للتوصيل 🚚', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    delivered: { label: 'تم التوصيل بنجاح ✅', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'ملغي ❌', color: 'bg-red-50 text-red-700 border-red-200' },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 text-xs select-none relative">
      
      {/* FLOATING IN-APP TOAST NOTIFICATION (No more browser alert popup) */}
      {toast.show && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={'flex items-center gap-2.5 py-3 px-6 rounded-2xl shadow-2xl border text-xs font-black backdrop-blur-md ' + (
              toast.type === 'success'
                ? 'bg-emerald-600/95 text-white border-emerald-400/80 shadow-emerald-950/30'
                : toast.type === 'error'
                ? 'bg-rose-600/95 text-white border-rose-400/80 shadow-rose-950/30'
                : 'bg-slate-900/95 text-white border-slate-700 shadow-black/40'
            )}
          >
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-200 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-200 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* 1. TOP PROFILE HEADER CARD */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-5">
        
        {/* User Info & Avatar */}
        <div className="flex items-center gap-4 text-center sm:text-right flex-col sm:flex-row w-full sm:w-auto">
          
          {/* Avatar with Camera Overlay */}
          <div className="relative group cursor-pointer shrink-0" onClick={openAvatarModal}>
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-brand-blue to-emerald-600 p-0.5 shadow-md flex items-center justify-center border-2 border-white">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-full h-full object-cover rounded-[14px]"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-brand-blue to-emerald-600 rounded-[14px] flex items-center justify-center text-white font-black text-2xl">
                  {user.name.slice(0, 1)}
                </div>
              )}
            </div>

            {/* Camera Change Button Badge */}
            <button
              type="button"
              onClick={openAvatarModal}
              className="absolute -bottom-1.5 -right-1.5 bg-brand-blue hover:bg-brand-blueDark text-white p-1.5 rounded-xl shadow-md transition transform group-hover:scale-110 border-2 border-white cursor-pointer"
              title="تغيير الصورة الشخصية"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <div className="flex items-center gap-2 justify-center sm:justify-start flex-wrap">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span>🏪</span>
                <span>{user.businessName || user.name}</span>
              </h1>
              {(user.accountType === 'wholesale' || user.accountType === 'merchant') && isApprovedMerchant && (
                <MerchantTierBadge tier={user.merchantTier || 'bronze'} size="sm" />
              )}
            </div>
            
            <p className="text-xs text-slate-600 font-bold mt-1 flex items-center gap-2 justify-center sm:justify-start flex-wrap">
              <span className="text-slate-400">صاحب الحساب:</span>
              <span className="font-black text-slate-900">👤 {user.name}</span>
              <span>•</span>
              <span className="font-mono text-slate-500" dir="ltr">{user.phone}</span>
            </p>
            
            <div className="mt-1.5 flex items-center gap-2 justify-center sm:justify-start flex-wrap">
              {user.accountType === 'market' && (
                <span className="bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-lg border border-emerald-200">
                  🏪 ماركت معتمد
                </span>
              )}
              {(user.accountType === 'wholesale' || user.accountType === 'merchant') && (
                <span className="bg-amber-50 text-amber-900 text-[11px] font-bold px-2.5 py-0.5 rounded-lg border border-amber-200">
                  👑 تاجر جملة معتمد
                </span>
              )}
              {(!user.accountType || user.accountType === 'individual') && (
                <span className="bg-sky-50 text-sky-800 text-[11px] font-bold px-2.5 py-0.5 rounded-lg border border-sky-200">
                  👤 زبون عادي (مفرد)
                </span>
              )}
              <button
                onClick={openAvatarModal}
                className="text-[10px] text-brand-blue hover:underline font-black flex items-center gap-1 bg-blue-50/70 px-2 py-0.5 rounded-md cursor-pointer"
              >
                <Camera className="w-3 h-3" />
                <span>تغيير صورتي 📸</span>
              </button>
            </div>
          </div>
        </div>

        {/* Top Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-center sm:justify-end">
          <Link
            href={'/statement?phone=' + encodeURIComponent(user.phone)}
            className="bg-blue-50 hover:bg-blue-100 text-brand-blue font-bold text-xs py-2 px-3 rounded-xl transition flex items-center gap-1.5 border border-blue-200 shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>كشف حسابي والديون 📄</span>
          </Link>

          <button
            onClick={() => {
              logout();
              router.push('/');
            }}
            className="bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-700 font-bold text-xs py-2 px-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* 2. JAMLATY STYLE NAVIGATION TABS BAR */}
      <div className="grid grid-cols-5 gap-1 sm:gap-2 bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <button
          onClick={() => setActiveTab('orders')}
          className={'py-2.5 px-1 sm:px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ' + (activeTab === 'orders' ? 'bg-brand-blue text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50')}
        >
          <Package className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">طلباتي</span>
          <span className="font-mono text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">{orders.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('rewards')}
          className={'py-2.5 px-1 sm:px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ' + (activeTab === 'rewards' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50')}
        >
          <Gift className="w-4 h-4 shrink-0" />
          <span>أرباحي</span>
        </button>

        <button
          onClick={() => setActiveTab('complaints')}
          className={'py-2.5 px-1 sm:px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ' + (activeTab === 'complaints' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50')}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="hidden xs:inline">الشكاوى</span>
        </button>

        <button
          onClick={() => setActiveTab('locations')}
          className={'py-2.5 px-1 sm:px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ' + (activeTab === 'locations' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50')}
        >
          <MapPin className="w-4 h-4 shrink-0" />
          <span>مواقعي</span>
        </button>

        <button
          onClick={() => setActiveTab('account')}
          className={'py-2.5 px-1 sm:px-3 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ' + (activeTab === 'account' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50')}
        >
          <UserIcon className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">إدارة حسابي</span>
          <span className="sm:hidden">حسابي</span>
        </button>
      </div>

      {/* 3. TAB CONTENT VIEWS */}

      {/* TAB 1: ORDERS (طلباتي) */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-brand-blue" />
              <span>سجل طلبياتي ومتابعة الحالات ({orders.length})</span>
            </h2>
            <Link href="/products" className="text-xs font-bold text-brand-coral hover:underline">
              طلب مواد وسناكات جديدة ←
            </Link>
          </div>

          {isFetchingOrders ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-slate-100">
              <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-500">جاري تحميل الطلبات...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
              <div className="text-4xl">📦</div>
              <h3 className="text-sm font-bold text-slate-800">لا توجد طلبيات سابقة</h3>
              <p className="text-xs text-slate-500">ابدأ أول طلبية لك الآن واستفد من أسعار الكراتين والمفرد!</p>
              <Link
                href="/products"
                className="inline-block bg-brand-coral text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md"
              >
                تصفح السناكات والمواد الغذائية
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const statusInfo = statusLabels[order.status] || statusLabels.pending;
                return (
                  <div
                    key={order.id}
                    className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg inline-block" dir="ltr">
                          #{order.orderNumber}
                        </span>
                        <span className="text-[11px] text-slate-500 font-bold flex items-center gap-1 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span dir="ltr">{new Date(order.createdAt).toLocaleDateString('ar-IQ')}</span>
                        </span>
                        {order.customer.locationTitle && (
                          <span className="bg-sky-50 text-sky-900 border border-sky-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            {order.customer.locationTitle}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={'text-[10px] font-black px-3 py-1 rounded-full border ' + statusInfo.color}>
                          {statusInfo.label}
                        </span>
                        <Link
                          href={'/order-success/' + order.id}
                          className="text-xs font-bold text-brand-blue hover:underline flex items-center gap-1"
                        >
                          <span>متابعة الطلبية</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>

                    {order.status === 'shipped' && (
                      <div className="bg-indigo-50/80 border border-indigo-200 text-indigo-950 px-3 py-2 rounded-xl flex items-center justify-between text-xs font-bold">
                        <span className="flex items-center gap-1.5">
                          <span className="animate-pulse">🚚</span>
                          <span>الطلبية في الطريق إليك الآن مع المندوب ({order.driverName || 'مندوب التوصيل'})</span>
                        </span>
                        {order.outForDeliveryAt && (
                          <span className="text-[10px] font-mono text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                            انطلقت: {new Date(order.outForDeliveryAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )}

                    {order.status === 'delivered' && (
                      <div className="bg-emerald-50/80 border border-emerald-200 text-emerald-950 px-3 py-1.5 rounded-xl flex items-center justify-between text-xs font-bold">
                        <span>✅ تم تسليم الطلبية بنجاح</span>
                        {order.collectionStatus === 'collected_cash' && (
                          <span className="text-[10px] text-emerald-800">💵 تم استلام الكاش</span>
                        )}
                        {order.collectionStatus === 'debt_unpaid' && (
                          <span className="text-[10px] text-amber-800">📝 تسليم بالآجل (دين مسجل)</span>
                        )}
                      </div>
                    )}

                    <div className="divide-y divide-slate-100">
                      {order.items.map((item, i) => (
                        <div key={i} className="py-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <img src={item.image} alt={item.name} className="w-10 h-10 object-contain rounded-lg bg-slate-50 p-0.5 border border-slate-100" />
                            <div>
                              <span className="font-bold text-slate-800">{item.name}</span>
                              <span className="text-[10px] text-slate-500 block">
                                {item.quantity} × {item.price.toLocaleString()} د.ع ({item.saleType === 'wholesale' ? 'جملة' : 'مفرد'})
                              </span>
                            </div>
                          </div>
                          <span className="font-black text-slate-900">{((item.price || 0) * item.quantity).toLocaleString()} د.ع</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs">
                      <span className="text-slate-500">الإجمالي الكلي:</span>
                      <span className="font-black text-sm text-[#e0452c] font-mono">{order.total.toLocaleString()} د.ع</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REWARDS / PROFITS (أرباحي - Exact match to screenshot 2) */}
      {activeTab === 'rewards' && (
        <div className="space-y-5">
          {/* Orange Gradient Top Banner */}
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 rounded-3xl p-6 sm:p-7 text-white shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-orange-100 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" />
                <span>رصيد أرباحك الحالي</span>
              </span>
              <span className="text-[11px] font-bold bg-white/20 px-3 py-1 rounded-full backdrop-blur-xs">
                تكسب {cashbackRate.toLocaleString()} د.ع عن كل قطعة تطلبها 🎁
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                {rewardCashbackAmount.toLocaleString()}
              </span>
              <span className="text-sm font-bold text-orange-100">دينار عراقي</span>
            </div>

            <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs font-bold text-orange-100">
              <span>إجمالي القطع المشتراة:</span>
              <span className="font-mono text-white font-black">{totalPiecesCount} قطعة</span>
            </div>
          </div>

          {/* Reward Status & Start Shopping Card */}
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/90 shadow-xs space-y-4">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto text-3xl shadow-2xs">
              🎁
            </div>
            
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">
                {rewardCashbackAmount > 0 ? ('لديك رصيد أرباح بقيمة ' + rewardCashbackAmount.toLocaleString() + ' د.ع!') : 'لا يوجد رصيد أرباح متاح حالياً'}
              </h3>
              <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
                اطلب أي منتج أو كرتون من سوق الجملة لتربح {cashbackRate.toLocaleString()} د.ع نقداً عن كل قطعة، ويمكنك استخدامها لخصم وتخفيض فواتيرك القادمة بنقرة زر عند صفحة الدفع!
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 bg-slate-900 hover:bg-black text-white font-black text-xs py-3 px-8 rounded-2xl shadow-md transition active:scale-98"
              >
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <span>ابدأ التسوق الآن 🛍️</span>
              </Link>
            </div>
          </div>

          {/* Withdrawals History */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-3">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <span>تاريخ السحوبات والمكافآت 📈</span>
            </h3>
            <div className="p-6 text-center text-slate-400 text-xs font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              لا توجد سحوبات سابقة
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COMPLAINTS & FEEDBACK (الشكاوي والملاحظات - Exact match to screenshot 3) */}
      {activeTab === 'complaints' && (
        <div className="space-y-5">
          {/* Red Header Banner */}
          <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white p-4 sm:p-5 rounded-3xl shadow-md flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5" />
              <h2 className="font-black text-sm sm:text-base">الشكاوى والملاحظات</h2>
            </div>
            <span className="text-[10px] bg-white/20 px-2.5 py-1 rounded-full font-bold">
              صوتك يصل للإدارة مباشرة 📣
            </span>
          </div>

          {/* User Attached Info Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-3">
            <span className="text-[11px] font-black text-slate-400 block">معلوماتك المرفقة مع الشكوى:</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block">الاسم</span>
                <span className="font-bold text-slate-900">{user.name}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block">رقم الهاتف</span>
                <span className="font-bold font-mono text-slate-900" dir="ltr">{user.phone}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block">اسم الماركت / المتجر</span>
                <span className="font-bold text-slate-900">{user.businessName || 'ماركت شخصي'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block">المدينة</span>
                <span className="font-bold text-slate-900">{user.city || 'كربلاء المقدسة'}</span>
              </div>
            </div>
          </div>

          {/* Complaint Submission Form */}
          <form onSubmit={handleSubmitComplaint} className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-rose-500" />
                <span>اكتب شكواك أو ملاحظتك للإدارة:</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">{complaintText.length}/2000</span>
            </div>

            <textarea
              rows={4}
              maxLength={2000}
              value={complaintText}
              onChange={(e) => setComplaintText(e.target.value)}
              placeholder="مثال: تأخر التوصيل اليوم، مادة ناقصة، سؤال عن الفاتورة، اقتراح منتج جديد لإضافته للمتجر..."
              className="w-full bg-slate-50 text-slate-800 text-xs sm:text-sm rounded-2xl p-3.5 border border-slate-200 focus:bg-white focus:border-rose-500 focus:outline-none transition leading-relaxed placeholder:text-slate-400"
              required
            />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingComplaint || !complaintText.trim()}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black text-xs py-3 px-6 rounded-2xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-98"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmittingComplaint ? 'جاري الإرسال...' : 'إرسال للإدارة 📨'}</span>
              </button>
            </div>
          </form>

          {/* Past Complaints History */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-3">
            <h3 className="text-xs font-black text-slate-800">سجل الشكاوى السابقة:</h3>
            {complaintsList.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                لا توجد شكاوى أو ملاحظات مسجلة سابقاً
              </div>
            ) : (
              <div className="space-y-3">
                {complaintsList.map((c: any) => (
                  <div key={c.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-slate-400 text-[10px]">
                        {(() => {
                          try {
                            const d = new Date(c.createdAt);
                            return d.toLocaleDateString('ar-IQ') + ' ' + d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                          } catch {
                            return c.createdAt;
                          }
                        })()}
                      </span>
                      <span
                        className={`font-bold px-2.5 py-0.5 rounded-lg text-[10px] ${
                          c.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.status === 'in_progress'
                            ? 'bg-amber-100 text-amber-800'
                            : c.status === 'archived'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {c.status === 'resolved'
                          ? 'تم الحل والرد ✅'
                          : c.status === 'in_progress'
                          ? 'قيد المتابعة والتدقيق ⏳'
                          : c.status === 'archived'
                          ? 'مؤرشف 📁'
                          : 'وصلت للإدارة بانتظار المتابعة ⏳'}
                      </span>
                    </div>

                    <p className="text-slate-800 text-xs font-medium leading-relaxed whitespace-pre-wrap">{c.text}</p>

                    {/* Admin Reply Display */}
                    {c.adminReply && (
                      <div className="bg-emerald-50/90 border border-emerald-200 p-3 rounded-xl space-y-1 text-xs mt-2">
                        <div className="flex items-center justify-between text-emerald-900 font-black text-[11px]">
                          <span>رد الإدارة ({c.repliedBy || 'خدمة العملاء'}):</span>
                          {c.repliedAt && (
                            <span className="text-[10px] text-emerald-600 font-normal">
                              {(() => {
                                try {
                                  const d = new Date(c.repliedAt);
                                  return d.toLocaleDateString('ar-IQ') + ' ' + d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                                } catch {
                                  return c.repliedAt;
                                }
                              })()}
                            </span>
                          )}
                        </div>
                        <p className="text-emerald-950 font-bold">{c.adminReply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: LOCATIONS (مواقعي - Exact match to screenshot 4) */}
      {activeTab === 'locations' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span>مواقعي وعناويني المحفوظة</span>
            </h2>
            <button
              onClick={() => setIsAddLocationModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>موقع جديد</span>
            </button>
          </div>

          {savedAddresses.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/90 shadow-xs space-y-4">
              <div className="w-16 h-16 bg-sky-50 text-sky-600 rounded-full flex items-center justify-center mx-auto text-3xl">
                📍
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900">ما عندك مواقع محفوظة</h3>
                <p className="text-xs text-slate-500 font-medium">
                  احفظ موقع البيت، العمل، الماركت - تختاره عند الطلب بسرعة بدون كتابة كل مرة.
                </p>
              </div>
              <div>
                <button
                  onClick={() => setIsAddLocationModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3 px-8 rounded-2xl shadow-md transition cursor-pointer"
                >
                  + أضف أول موقع
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {savedAddresses.map((loc) => (
                <div
                  key={loc.id}
                  className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-3 relative group"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-sm text-slate-900">{loc.title}</span>
                      {loc.isDefault && (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                          الافتراضي ✓
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteLocation(loc.id)}
                      className="text-slate-400 hover:text-red-600 p-1 transition rounded-lg"
                      title="حذف الموقع"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1 text-xs">
                    <p className="font-bold text-slate-700">{loc.city}</p>
                    <p className="text-slate-500 text-[11px] leading-relaxed">{loc.address}</p>
                  </div>

                  {loc.mapsUrl && (
                    <a
                      href={loc.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-blue hover:underline pt-1"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>عرض على الخريطة 🗺️</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: ACCOUNT SETTINGS (إدارة حسابي + تغيير صورة واجهة المحل) */}
      {activeTab === 'account' && (
        <div className="space-y-5">
          
          {/* STOREFRONT / HOUSE FACADE IMAGE MANAGER CARD */}
          <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                  {user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant' ? (
                    <>
                      <Store className="w-4 h-4 text-emerald-600" />
                      <span>صورة واجهة المحل / الماركت 🏪</span>
                    </>
                  ) : (
                    <>
                      <Home className="w-4 h-4 text-sky-600" />
                      <span>صورة واجهة البيت أو البناية 🏠 (اختياري)</span>
                    </>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  {user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                    ? 'تظهر هذه الصورة للمندوب والإدارة للتعرف على محلك وتسهيل عملية التوصيل والاستلام'
                    : 'صورة اختيارية تساعد السائق والمندوب على الاستدلال السريع على واجهة منزلك لتسليم الطلبية بدقة'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => storefrontFileInputRef.current?.click()}
                disabled={isUpdatingStorefront}
                className={`${
                  user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-sky-600 hover:bg-sky-700'
                } disabled:opacity-50 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-98`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>
                  {isUpdatingStorefront
                    ? 'جاري رفع الصورة...'
                    : user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                    ? 'تغيير صورة واجهة المحل 📸'
                    : 'تغيير صورة واجهة البيت 📸 (اختياري)'}
                </span>
              </button>
              <input
                ref={storefrontFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleStorefrontUpload}
                className="hidden"
              />
            </div>

            {/* Storefront / House Facade Image Preview */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-50 border border-slate-200 min-h-[160px] sm:min-h-[220px] flex items-center justify-center group">
              {user.storefrontImage ? (
                <>
                  <img
                    src={user.storefrontImage}
                    alt={user.businessName || (user.accountType === 'market' || user.accountType === 'wholesale' ? 'واجهة المحل' : 'واجهة البيت')}
                    className="w-full h-48 sm:h-64 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-between p-4 text-white">
                    <div>
                      <span className="font-black text-sm block">
                        {user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                          ? `🏪 ${user.businessName || 'واجهة متجرك'}`
                          : `🏠 ${user.name || 'واجهة البيت'}`}
                      </span>
                      <span className="text-[10px] text-slate-200">{user.address || user.city || 'كربلاء المقدسة'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => storefrontFileInputRef.current?.click()}
                      className="bg-white/90 hover:bg-white text-slate-900 font-black text-[11px] py-1.5 px-3 rounded-lg shadow-md transition flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3 h-3 text-emerald-600" />
                      <span>تحديث الصورة</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center p-6 space-y-2">
                  <div className={`w-14 h-14 rounded-2xl ${
                    user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-sky-50 text-sky-600'
                  } flex items-center justify-center mx-auto text-2xl`}>
                    {user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant' ? '🏪' : '🏠'}
                  </div>
                  <h4 className="font-bold text-slate-800 text-xs">
                    {user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                      ? 'لم يتم تعيين صورة لواجهة المحل بعد'
                      : 'لم يتم تعيين صورة لواجهة البيت بعد (اختياري)'}
                  </h4>
                  <p className="text-[11px] text-slate-400 max-w-sm">
                    {user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                      ? 'التقط صورة واضحة للافتة وواجهة محلك لتظهر للإدارة والسائقين لتسهيل الوصول والتوصيل.'
                      : 'التقط صورة لواجهة منزلك أو مدخل البناية لتسهيل وصول السائق والمندوب إليك، وهي اختيارية وليست إجبارية.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => storefrontFileInputRef.current?.click()}
                    className={`inline-flex items-center gap-1.5 ${
                      user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-sky-600 hover:bg-sky-700'
                    } text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs transition mt-1 cursor-pointer`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>
                      {user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                        ? 'التقاط أو رفع صورة الواجهة الآن'
                        : 'التقاط أو رفع صورة واجهة البيت (اختياري)'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* BASIC INFO FORM */}
          <form onSubmit={handleSaveAccountInfo} className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
            <h2 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserIcon className="w-4 h-4 text-indigo-600" />
              <span>
                {user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant'
                  ? 'إدارة وتعديل بيانات الحساب والمتجر'
                  : 'إدارة وتعديل بيانات الحساب والعنوان'}
              </span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">اسم صاحب الحساب *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 text-xs rounded-xl p-3 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              {user.accountType === 'market' || user.accountType === 'wholesale' || user.accountType === 'merchant' ? (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">اسم المحل / الماركت / المتجر 🏪 *</label>
                  <input
                    type="text"
                    value={editBusinessName}
                    onChange={(e) => setEditBusinessName(e.target.value)}
                    placeholder="مثال: جملة الجبوري أو أسواق المنصور"
                    className="w-full bg-slate-50 text-slate-900 text-xs rounded-xl p-3 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">لقب البيت / العائلة (اختياري) 🏠</label>
                  <input
                    type="text"
                    value={editBusinessName}
                    onChange={(e) => setEditBusinessName(e.target.value)}
                    placeholder="مثال: دار أبو علي أو بيت الحاج"
                    className="w-full bg-slate-50 text-slate-900 text-xs rounded-xl p-3 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">رقم الهاتف (المسجل)</label>
                <input
                  type="text"
                  value={user.phone}
                  disabled
                  className="w-full bg-slate-100 text-slate-500 text-xs rounded-xl p-3 border border-slate-200 font-mono cursor-not-allowed"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">المدينة / المحافظة</label>
                <input
                  type="text"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 text-xs rounded-xl p-3 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">العنوان والتفاصيل (الشارع - أقرب نقطة دالة)</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 text-xs rounded-xl p-3 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingAccount}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs py-3 px-8 rounded-2xl shadow-md transition cursor-pointer"
              >
                {isSavingAccount ? 'جاري الحفظ...' : 'حفظ التعديلات ✓'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AVATAR SELECTION MODAL */}
      {isAvatarModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 text-xs">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setIsAvatarModalOpen(false)}
          />

          <div className="relative bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl z-10 animate-in zoom-in-95 border border-slate-200 overflow-hidden my-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">اختيار وتغيير صورتك الشخصية 📸</h3>
                  <p className="text-[10px] text-slate-500 font-bold">ارفع صورة من جهازك أو اختر من الصور الجاهزة أدناه</p>
                </div>
              </div>

              <button
                onClick={() => setIsAvatarModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Active Preview */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white shadow-sm border-2 border-brand-blue p-0.5">
                  {selectedAvatarUrl ? (
                    <img src={selectedAvatarUrl} alt="Preview" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <div className="w-full h-full bg-slate-200 rounded-xl flex items-center justify-center text-slate-400 font-bold text-xl">
                      👤
                    </div>
                  )}
                </div>
                <div>
                  <span className="font-black text-slate-900 text-xs block">الصورة المختارة حالياً</span>
                  <span className="text-[10px] text-slate-500">ستظهر بجانب اسمك في واجهة المتجر والطلبيات</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-white hover:bg-slate-100 text-slate-800 font-bold px-3 py-2 rounded-xl border border-slate-200 shadow-2xs text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-brand-blue" />
                <span>رفع من الجهاز</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Preset Avatars Grid */}
            <div className="space-y-2">
              <span className="font-bold text-slate-800 text-xs block">أو اختر صورة رمزية سريعة:</span>
              <div className="grid grid-cols-4 gap-2.5 max-h-56 overflow-y-auto p-1 scrollbar-thin">
                {PRESET_AVATARS.map((av) => {
                  const isSelected = selectedAvatarUrl === av.url;
                  return (
                    <div
                      key={av.id}
                      onClick={() => setSelectedAvatarUrl(av.url)}
                      className={'relative aspect-square rounded-2xl overflow-hidden cursor-pointer border-2 transition-all p-0.5 ' + (isSelected ? 'border-brand-blue ring-2 ring-blue-300 scale-95 shadow-md' : 'border-slate-200 hover:border-slate-400 hover:scale-102')}
                    >
                      <img src={av.url} alt={av.name} className="w-full h-full object-cover rounded-[14px]" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-brand-blue/30 backdrop-blur-[1px] flex items-center justify-center">
                          <span className="w-6 h-6 bg-brand-blue text-white rounded-full flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAvatarModalOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={isSavingAvatar || !selectedAvatarUrl}
                onClick={handleSaveAvatar}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black px-5 py-2 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingAvatar ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>حفظ الصورة الشخصية ✓</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ADD LOCATION MODAL */}
      {isAddLocationModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4 text-xs">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setIsAddLocationModalOpen(false)}
          />

          <div className="relative bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl z-10 animate-in zoom-in-95 border border-slate-200 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>إضافة موقع جديد</span>
              </h3>
              <button
                onClick={() => setIsAddLocationModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewLocation} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">تسمية الموقع</label>
                <select
                  value={newLocationTitle}
                  onChange={(e) => setNewLocationTitle(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 text-xs rounded-xl p-2.5 border border-slate-200"
                >
                  <option value="موقع البيت 🏠">موقع البيت 🏠</option>
                  <option value="الماركت / المحل 🏪">الماركت / المحل 🏪</option>
                  <option value="موقع العمل 🏢">موقع العمل 🏢</option>
                  <option value="المستودع / المخزن 📦">المستودع / المخزن 📦</option>
                  <option value="موقع آخر 📍">موقع آخر 📍</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">المدينة</label>
                <input
                  type="text"
                  value={newLocationCity}
                  onChange={(e) => setNewLocationCity(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 text-xs rounded-xl p-2.5 border border-slate-200"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">العنوان التفصيلي (الشارع، أقرب نقطة دالة) *</label>
                <textarea
                  rows={2}
                  value={newLocationAddress}
                  onChange={(e) => setNewLocationAddress(e.target.value)}
                  placeholder="مثال: حي الحر، قرب جامع الإمام علي، مجاور صيدلية الشفاء"
                  className="w-full bg-slate-50 text-slate-900 text-xs rounded-xl p-2.5 border border-slate-200"
                  required
                />
              </div>

              {/* GPS & Google Maps Helper Box */}
              <div className="bg-sky-50/80 border border-sky-200 p-3.5 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-sky-950 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-sky-600" />
                    <span>تحديد الموقع عبر الخريطة أو GPS:</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleDetectLocationGps}
                    disabled={isDetectingLocationGps}
                    className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-black text-xs py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                  >
                    <MapPin className={`w-3.5 h-3.5 ${isDetectingLocationGps ? 'animate-bounce' : ''}`} />
                    <span>{isDetectingLocationGps ? 'جاري تحديد GPS...' : '📍 التقاط موقعي الحالي (GPS)'}</span>
                  </button>

                  <a
                    href="https://www.google.com/maps"
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs py-2 px-3 rounded-xl border border-slate-300 transition flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                    <span>🗺️ فتح الخرائط لاختيار الموقع</span>
                  </a>
                </div>

                {gpsLocationStatus && (
                  <div className="bg-white p-2 rounded-xl border border-sky-200 text-[10px] text-sky-900 font-bold flex items-center justify-between">
                    <span>{gpsLocationStatus}</span>
                    {newLocationMapsUrl && (
                      <a
                        href={newLocationMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-blue underline font-black"
                      >
                        معاينة على الخريطة ↗
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">رابط خرائط جوجل (Google Maps - يمتلئ تلقائياً)</label>
                <input
                  type="url"
                  value={newLocationMapsUrl}
                  onChange={(e) => setNewLocationMapsUrl(e.target.value)}
                  placeholder="https://maps.app.goo.gl/... أو https://www.google.com/maps?q=..."
                  className="w-full bg-slate-50 text-slate-900 text-xs rounded-xl p-2.5 border border-slate-200 text-left font-mono"
                  dir="ltr"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddLocationModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingLocation}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2 rounded-xl shadow-md transition cursor-pointer"
                >
                  {isSavingLocation ? 'جاري الحفظ...' : 'حفظ الموقع ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل الحساب...</p>
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
