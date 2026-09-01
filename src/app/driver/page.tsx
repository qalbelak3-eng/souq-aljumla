'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Truck,
  MapPin,
  Phone,
  MessageCircle,
  CheckCircle,
  XCircle,
  DollarSign,
  Package,
  Clock,
  LogOut,
  Navigation,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileText,
  RefreshCw,
  Wallet,
  Check,
  Star
} from 'lucide-react';
import { Order, Driver, DeliveryCollectionStatus, StoreSettings, DriverRating } from '@/types';
import { generateDeliveryCustomerWhatsAppLink, generateDeliveryAccountantWhatsAppLink } from '@/lib/whatsapp';
import EtihadLogo from '@/components/EtihadLogo';
import { useToast } from '@/context/ToastContext';

export default function DriverDashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [driverRatings, setDriverRatings] = useState<DriverRating[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'ratings'>('active');

  // Delivery Modal State
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [collectionStatus, setCollectionStatus] = useState<DeliveryCollectionStatus>('collected_cash');
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startingDeliveryId, setStartingDeliveryId] = useState<string | null>(null);
  const [notifyingArrivedId, setNotifyingArrivedId] = useState<string | null>(null);
  const [arrivedNotifiedOrders, setArrivedNotifiedOrders] = useState<Record<string, boolean>>({});
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // WhatsApp Post-Delivery Notification Modal
  const [completedDeliveryData, setCompletedDeliveryData] = useState<{
    order: Order;
    customerWhatsAppUrl: string;
    accountantWhatsAppUrl: string;
  } | null>(null);
  const [customerWhatsAppSent, setCustomerWhatsAppSent] = useState<boolean>(false);
  const [accountantWhatsAppSent, setAccountantWhatsAppSent] = useState<boolean>(false);

  // Load Driver Session & Store Settings
  useEffect(() => {
    const session = localStorage.getItem('driver_session');
    if (!session) {
      router.push('/driver/login');
      return;
    }
    let driverId = '';
    try {
      const parsed = JSON.parse(session);
      setDriver(parsed);
      driverId = parsed.id;
      fetchOrders(parsed.id, false);
    } catch (e) {
      router.push('/driver/login');
      return;
    }

    // Fetch store settings for WhatsApp numbers
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) {
          setSettings(data.settings);
        }
      })
      .catch((err) => console.error(err));

    // Smart Background Refresh: only when page is active/visible
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (driverId) fetchOrders(driverId, true);
    }, 15000);

    const handleFocus = () => {
      if (driverId) fetchOrders(driverId, true);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [router]);

  const fetchOrders = async (driverId: string, isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const res = await fetch(`/api/driver/orders?driverId=${driverId}`);
      const data = await res.json();
      if (data.success) {
        setActiveOrders(data.activeOrders || []);
        setHistoryOrders(data.historyOrders || []);
        if (data.ratings) {
          setDriverRatings(data.ratings || []);
        }
        if (data.driver) {
          setDriver((prev) => (prev ? { ...prev, ...data.driver } : data.driver));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('driver_session');
    router.push('/driver/login');
  };

  const handleStartDelivery = async (orderId: string) => {
    if (!driver) return;
    setStartingDeliveryId(orderId);
    try {
      const res = await fetch('/api/driver/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_delivery',
          orderId,
          driverId: driver.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.showToast('تم تحديث حالة الطلبية: خرج مع المندوب للتوصيل 🚚', 'success');
        fetchOrders(driver.id);
      } else {
        toast.showToast(data.error || 'حدث خطأ أثناء التحديث', 'error');
      }
    } catch (e) {
      console.error(e);
      toast.showToast('حدث خطأ في الاتصال بالخادم', 'error');
    }
    setStartingDeliveryId(null);
  };

  const handleNotifyArrived = async (orderId: string) => {
    if (!driver) return;
    setNotifyingArrivedId(orderId);
    try {
      const res = await fetch('/api/driver/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notify_arrived',
          orderId,
          driverId: driver.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setArrivedNotifiedOrders((prev) => ({ ...prev, [orderId]: true }));
        toast.showToast(data.message || 'تم إرسال إشعار وصول المندوب لهاتف الزبون بنجاح 🔔🛵', 'success');
      } else {
        toast.showToast(data.error || 'فشل إرسال الإشعار', 'error');
      }
    } catch (e) {
      console.error(e);
      toast.showToast('حدث خطأ في الاتصال بالخادم', 'error');
    }
    setNotifyingArrivedId(null);
  };

  const openDeliveryModal = (order: Order) => {
    setSelectedOrder(order);
    setCollectionStatus('collected_cash');
    setPartialAmount('');
    setDeliveryNotes('');
  };

  const handleCompleteDelivery = async () => {
    if (!selectedOrder || !driver) return;

    let collectedAmount = 0;
    if (collectionStatus === 'collected_cash') {
      collectedAmount = selectedOrder.total;
    } else if (collectionStatus === 'partial') {
      collectedAmount = Number(partialAmount) || 0;
      if (collectedAmount <= 0 || collectedAmount >= selectedOrder.total) {
        toast.showToast('يرجى إدخال مبلغ جزئي صحيح أقل من إجمالي الفاتورة', 'error');
        return;
      }
    } else if (collectionStatus === 'debt_unpaid') {
      collectedAmount = 0;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/driver/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          driverId: driver.id,
          collectionStatus,
          collectedAmount,
          notes: deliveryNotes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.showToast('تم إتمام تسليم الطلبية وحفظ التحصيل بنجاح 🎉', 'success');
        const finishedOrder = data.order || {
          ...selectedOrder,
          collectionStatus,
          collectedAmount,
          driverNotes: deliveryNotes,
        };

        const activeSettings: StoreSettings = settings || {
          storeName: 'سوق الجملة - سوق الجملة الأكبر في كربلاء 🇮🇶',
          phone: '07700000000',
          accountingWhatsappNumber: '07708020686',
          whatsappNumber: '07708020686',
          email: 'sales@souq-aljumla.iq',
          address: 'كربلاء المقدسة',
          currency: 'د.ع',
        };

        const custUrl = generateDeliveryCustomerWhatsAppLink(finishedOrder, driver.name, activeSettings);
        const acctUrl = generateDeliveryAccountantWhatsAppLink(finishedOrder, driver.name, activeSettings);

        setCustomerWhatsAppSent(false);
        setAccountantWhatsAppSent(false);
        setCompletedDeliveryData({
          order: finishedOrder,
          customerWhatsAppUrl: custUrl,
          accountantWhatsAppUrl: acctUrl,
        });

        setSelectedOrder(null);
        fetchOrders(driver.id);
      } else {
        toast.showToast(data.error || 'حدث خطأ أثناء حفظ التسليم', 'error');
      }
    } catch (e) {
      console.error(e);
      toast.showToast('حدث خطأ في الاتصال بالخادم', 'error');
    }
    setIsSubmitting(false);
  };

  // Helper for GPS / Google Maps Link
  const getGoogleMapsLink = (order: Order) => {
    if (order.customer.mapsUrl) {
      return order.customer.mapsUrl;
    }
    if (order.customer.lat && order.customer.lng) {
      return `https://www.google.com/maps/dir/?api=1&destination=${order.customer.lat},${order.customer.lng}`;
    }
    const query = encodeURIComponent(`${order.customer.city} ${order.customer.address}`);
    return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  };

  if (!driver) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f3f8fc] text-slate-800 pb-20 text-xs" dir="rtl">
      
      {/* Top Driver Header (Light Theme) */}
      <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200 backdrop-blur-md px-4 py-3 shadow-xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center font-black shadow-xs">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="font-black text-sm text-slate-900">{driver.name}</h1>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-md">
                  نشط 🟢
                </span>
                <span className="bg-amber-50 border border-amber-300 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                  <span>⭐ {driver.averageRating ? Number(driver.averageRating).toFixed(1) : '5.0'}</span>
                  <span>({driver.ratingTierLabel || (driver.ratingsCount ? 'ممتاز 🌟' : 'سائق معتمد 🌟')})</span>
                  <span className="text-slate-400 font-normal">({driver.ratingsCount || 0} تقييم)</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold mt-0.5 flex-wrap">
                <span>{driver.vehicleInfo || 'مندوب التوصيل المعتمد'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchOrders(driver.id)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              title="تحديث الطلبيات"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-blue' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 transition"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        
        {/* Cash In Hand Summary Card (Light Theme) */}
        <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 text-white p-5 rounded-3xl shadow-md flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-black text-emerald-100 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" />
              <span>العهدة النقدية بيدك (الكاش المحصّل اليوم):</span>
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight">
              {(driver.currentCashInHand || 0).toLocaleString()} <span className="text-sm font-bold text-emerald-200">د.ع</span>
            </div>
            <p className="text-[10px] text-emerald-100/90 font-medium">
              يتم تسليم هذا المبلغ لإدارة المتجر عند انتهاء جولة التوصيل
            </p>
          </div>

          <div className="text-center bg-white/20 backdrop-blur-xs border border-white/30 p-3 rounded-2xl shrink-0">
            <span className="text-xs font-bold text-emerald-100 block">طلبياتك</span>
            <span className="text-2xl font-black text-white font-mono block">
              {activeOrders.length}
            </span>
            <span className="text-[10px] text-emerald-100 font-bold block">قيد التوصيل</span>
          </div>
        </div>

        {/* Navigation Tabs (Light Theme) */}
        <div className="grid grid-cols-3 gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs">
          <button
            onClick={() => setActiveTab('active')}
            className={`py-2 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>النشطة ({activeOrders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-2 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>المكتمل ({historyOrders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('ratings')}
            className={`py-2 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 ${
              activeTab === 'ratings'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            <span>تقييماتي ({driverRatings.length})</span>
          </button>
        </div>

        {/* Tab 1: ACTIVE ORDERS */}
        {activeTab === 'active' && (
          <div className="space-y-4">
            {isLoading ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-bold">جاري تحميل طلبياتك...</p>
              </div>
            ) : activeOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-xs space-y-3">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl">
                  🎉
                </div>
                <h3 className="font-black text-base text-slate-900">لا توجد طلبيات معلقة حالياً!</h3>
                <p className="text-xs text-slate-500 font-bold">
                  تم تسليم كافة الطلبيات الموكلة إليك بنجاح أو بانتظار إسناد طلبيات جديدة من الإدارة.
                </p>
              </div>
            ) : (
              activeOrders.map((order, idx) => {
                const mapsUrl = getGoogleMapsLink(order);
                const isExpanded = expandedOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="bg-white border-2 border-slate-200 hover:border-amber-400 rounded-3xl p-4 sm:p-5 shadow-sm transition-all space-y-4 relative overflow-hidden"
                  >
                    {/* Badge top */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-amber-100 text-amber-900 text-xs font-mono font-black px-2.5 py-1 rounded-xl border border-amber-200">
                          #{idx + 1} • {order.orderNumber}
                        </span>
                        {order.vehicleName && (
                          <span className="bg-emerald-50 text-emerald-900 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <span>🚗 {order.vehicleName}</span>
                            {order.vehiclePlate && <span className="font-mono opacity-80" dir="ltr">({order.vehiclePlate})</span>}
                          </span>
                        )}
                        {order.customer.locationTitle && (
                          <span className="bg-sky-100 text-sky-900 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-sky-200">
                            {order.customer.locationTitle}
                          </span>
                        )}
                      </div>

                      <div className="text-left font-mono font-black text-red-600 text-base">
                        {order.total.toLocaleString()} د.ع
                      </div>
                    </div>

                    {/* Customer & Location Info */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-black text-base text-slate-900 flex items-center gap-1.5">
                            <span>🏪</span>
                            <span>{order.customer.businessName || order.customer.name}</span>
                          </h3>
                          <p className="text-xs font-bold text-slate-500 mt-0.5 flex items-center gap-1">
                            <span>👤</span>
                            <span>{order.customer.name}</span>
                          </p>
                        </div>

                        {order.customer.storefrontImage && (
                          <button
                            onClick={() => setPhotoModalUrl(order.customer.storefrontImage || null)}
                            className="bg-sky-50 hover:bg-sky-100 border border-sky-200 text-brand-blue text-[10px] font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 shrink-0 shadow-2xs"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>صورة الواجهة 📷</span>
                          </button>
                        )}
                      </div>

                      {/* Address & City */}
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{order.customer.city} - {order.customer.address}</span>
                      </div>

                      {/* Notes if any */}
                      {order.customer.notes && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-2.5 rounded-xl font-medium">
                          <span className="font-black block text-[11px] mb-0.5">ملاحظات الزبون:</span>
                          {order.customer.notes}
                        </div>
                      )}
                    </div>

                    {/* Action buttons (Maps & Call) */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold py-2 px-3 rounded-xl border border-emerald-200 flex items-center justify-center gap-1.5 text-xs transition"
                      >
                        <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                        <span>الخريطة والموقع 🗺️</span>
                      </a>

                      <a
                        href={`tel:${order.customer.phone}`}
                        className="bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold py-2 px-3 rounded-xl border border-sky-200 flex items-center justify-center gap-1.5 text-xs transition"
                      >
                        <Phone className="w-3.5 h-3.5 text-sky-600" />
                        <span>اتصال بالزبون 📞</span>
                      </a>
                    </div>

                    {/* Order Details Accordion Toggle */}
                    <button
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      className="w-full text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 py-1 transition flex items-center justify-center gap-1"
                    >
                      <span>{isExpanded ? 'إخفاء تفاصيل وقائمة المواد ▲' : `عرض قائمة المواد (${order.items.length} أصناف) ▼`}</span>
                    </button>

                    {/* Collapsible Order Items Table */}
                    {isExpanded && (
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2 animate-fadeIn">
                        <span className="text-[11px] font-black text-slate-700 block border-b border-slate-200 pb-1">
                          قائمة المواد والكميات المطلوبة للتسليم:
                        </span>
                        <div className="divide-y divide-slate-200/70 text-xs">
                          {order.items.map((item, i) => (
                            <div key={i} className="py-1.5 flex items-center justify-between">
                              <span className="font-bold text-slate-800">{item.name}</span>
                              <span className="font-mono font-black text-brand-blue bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                {item.quantity} {item.unitLabel || 'قطعة'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Delivery Status & Confirmation Action */}
                    {order.status !== 'shipped' ? (
                      <div className="space-y-2">
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 font-bold p-2.5 rounded-2xl flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-amber-700" />
                            <span>الطلبية مجهزة وجاهزة للانطلاق بالمستودع 📦</span>
                          </span>
                        </div>

                        <button
                          onClick={() => handleStartDelivery(order.id)}
                          disabled={startingDeliveryId === order.id}
                          className="w-full bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-sm py-3.5 rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Truck className="w-5 h-5" />
                          <span>{startingDeliveryId === order.id ? 'جاري التحديث...' : '🚗 خرجت للتوصيل بالطريق للزبون (بدء الانطلاق)'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="bg-indigo-50 border border-indigo-200 text-indigo-950 font-bold p-2.5 rounded-2xl flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 font-black text-indigo-900">
                            <Truck className="w-4 h-4 text-indigo-600 animate-pulse" />
                            <span>الطلبية قيد التوصيل بالطريق للزبون الآن 🚀</span>
                          </span>
                          {order.outForDeliveryAt && (
                            <span className="text-[10px] font-mono font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                              انطلقت: {new Date(order.outForDeliveryAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>

                        {/* زر إشعار الزبون بأن المندوب وصل لموقعه */}
                        <button
                          type="button"
                          onClick={() => handleNotifyArrived(order.id)}
                          disabled={notifyingArrivedId === order.id || arrivedNotifiedOrders[order.id]}
                          className={`w-full py-3 px-4 rounded-2xl font-black text-xs border transition flex items-center justify-center gap-2 cursor-pointer ${
                            arrivedNotifiedOrders[order.id]
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 border-amber-600 shadow-sm'
                          }`}
                        >
                          <span className="text-base">🛵</span>
                          <span>
                            {arrivedNotifiedOrders[order.id]
                              ? '✓ تم إرسال إشعار (المندوب وصل) لهاتف الزبون'
                              : notifyingArrivedId === order.id
                              ? 'جاري إرسال التنبيه لهاتف الزبون...'
                              : '📢 تنبيه الزبون: وصلت لموقعك بالخارج! (إشعار فوري)'}
                          </span>
                        </button>

                        <button
                          onClick={() => openDeliveryModal(order)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-sm py-3.5 rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <CheckCircle className="w-5 h-5" />
                          <span>إتمام تسليم الطلبية وإثبات التحصيل 🚚✨</span>
                        </button>
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: HISTORY COMPLETED ORDERS */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {historyOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-xs text-slate-500">
                <p className="text-xs font-bold">لا توجد طلبيات مكتملة مسجلة لك اليوم بعد</p>
              </div>
            ) : (
              historyOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-400 block mb-0.5">
                        #{order.orderNumber}
                      </span>
                      <h4 className="font-black text-sm text-slate-900 flex items-center gap-1">
                        <span>🏪</span>
                        <span>{order.customer.businessName || order.customer.name}</span>
                      </h4>
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5 flex items-center gap-1">
                        <span>👤</span>
                        <span>{order.customer.name}</span>
                      </p>
                    </div>

                    <div className="text-left">
                      {order.collectionStatus === 'collected_cash' && (
                        <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-1 rounded-xl border border-emerald-200 flex items-center gap-1">
                          💵 تم استلام الكاش ({order.total.toLocaleString()} د.ع)
                        </span>
                      )}
                      {order.collectionStatus === 'debt_unpaid' && (
                        <span className="bg-amber-100 text-amber-900 text-xs font-black px-2.5 py-1 rounded-xl border border-amber-200 flex items-center gap-1">
                          📝 تسليم بالآجل (دين: {order.total.toLocaleString()} د.ع)
                        </span>
                      )}
                      {order.collectionStatus === 'partial' && (
                        <span className="bg-sky-100 text-sky-900 text-xs font-black px-2.5 py-1 rounded-xl border border-sky-200 flex items-center gap-1">
                          💳 جزئي (دفع {order.collectedAmount?.toLocaleString()} • دين {order.remainingDebtAmount?.toLocaleString()})
                        </span>
                      )}
                      {order.collectionStatus === 'returned' && (
                        <span className="bg-red-100 text-red-800 text-xs font-black px-2.5 py-1 rounded-xl border border-red-200 flex items-center gap-1">
                          ❌ تم الإرجاع
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold">
                    <span>{order.customer.city} - {order.customer.address}</span>
                    <span className="font-mono">{order.deliveredAt ? new Date(order.deliveredAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: DRIVER RATINGS & CUSTOMER REVIEWS */}
        {activeTab === 'ratings' && (
          <div className="space-y-4">
            {/* Rating Summary Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs text-slate-500 font-bold">معدل تقييمك العام من الزبائن:</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black text-slate-900 font-mono">
                    ⭐ {driver?.averageRating ? Number(driver.averageRating).toFixed(1) : '5.0'}
                  </span>
                  <span className="bg-amber-100 text-amber-900 font-black text-xs px-2.5 py-1 rounded-xl border border-amber-200">
                    {driver?.ratingTierLabel || (driverRatings.length > 0 ? 'ممتاز 🌟' : 'سائق معتمد 🌟')}
                  </span>
                </div>
              </div>
              <div className="text-center bg-slate-50 border border-slate-200 p-3 rounded-2xl shrink-0">
                <span className="text-[11px] font-bold text-slate-500 block">إجمالي التقييمات</span>
                <span className="text-xl font-black text-slate-900 font-mono block">
                  {driverRatings.length}
                </span>
                <span className="text-[10px] text-amber-700 font-bold block">تقييم زبون</span>
              </div>
            </div>

            {/* List of Reviews */}
            {driverRatings.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-xs space-y-2 text-slate-500">
                <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto text-xl">⭐</div>
                <h4 className="font-black text-slate-800 text-sm">لا توجد تقييمات مسجلة بعد</h4>
                <p className="text-xs">عندما يقوم الزبائن بتقييم خدمتك وسرعة التوصيل، ستظهر تقييماتهم وملاحظاتهم هنا فوراً.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {driverRatings.map((rate) => (
                  <div key={rate.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">{rate.customerName}</span>
                        <span className="text-[10px] text-slate-400 font-mono block">فاتورة #{rate.orderNumber}</span>
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-0.5 justify-end">
                          <span className="text-amber-500 font-bold">{'⭐'.repeat(rate.rating)}</span>
                        </div>
                        <span className="text-[10px] font-black text-slate-600 block">{rate.ratingLabel}</span>
                      </div>
                    </div>
                    {rate.tag && (
                      <span className="inline-block bg-slate-100 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200">
                        {rate.tag}
                      </span>
                    )}
                    {rate.comment && (
                      <p className="text-xs text-slate-700 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100 font-medium">
                        "{rate.comment}"
                      </p>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono block text-left">
                      {new Date(rate.createdAt).toLocaleDateString('ar-IQ')} {new Date(rate.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* DELIVERY CONFIRMATION MODAL (Light Theme) */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl animate-slideUp sm:animate-none">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">
                  إثبات تسليم الطلبية #{selectedOrder.orderNumber}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-bold">
                  المحل: <span className="text-slate-900 font-black">{selectedOrder.customer.businessName || selectedOrder.customer.name}</span> • الزبون: <span className="text-slate-700">{selectedOrder.customer.name}</span> • الإجمالي: <span className="font-mono text-red-600 font-black">{selectedOrder.total.toLocaleString()} د.ع</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-700 p-1 font-bold text-base"
              >
                ✕
              </button>
            </div>

            {/* Collection Method Options */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-800 block">
                كيف تم تحصيل مبلغ الفاتورة عند التسليم؟ *
              </label>

              <div className="space-y-2">
                {/* 1. Full Cash Collected */}
                <label className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  collectionStatus === 'collected_cash'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="collectionStatus"
                    value="collected_cash"
                    checked={collectionStatus === 'collected_cash'}
                    onChange={() => setCollectionStatus('collected_cash')}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-black text-xs text-emerald-800 block">
                      💵 تم استلام المبلغ نقداً بالكامل (كاش)
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                      استلمت مبلغ {selectedOrder.total.toLocaleString()} د.ع ويدخل في عهدتك النقدية.
                    </span>
                  </div>
                </label>

                {/* 2. Debt / Unpaid (يبقى دين مسجل) */}
                <label className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  collectionStatus === 'debt_unpaid'
                    ? 'bg-amber-50 border-amber-500 text-amber-950 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="collectionStatus"
                    value="debt_unpaid"
                    checked={collectionStatus === 'debt_unpaid'}
                    onChange={() => setCollectionStatus('debt_unpaid')}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-black text-xs text-amber-800 block">
                      📝 تسليم بالآجل (لم يُستلم المبلغ - يبقى دين مسجل على الزبون)
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                      تم تسليم البضاعة بدون استلام كاش، ويبقى المبلغ ({selectedOrder.total.toLocaleString()} د.ع) ديناً مسجلاً على حسابه.
                    </span>
                  </div>
                </label>

                {/* 3. Partial Cash Collection */}
                <label className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  collectionStatus === 'partial'
                    ? 'bg-sky-50 border-sky-500 text-sky-950 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="collectionStatus"
                    value="partial"
                    checked={collectionStatus === 'partial'}
                    onChange={() => setCollectionStatus('partial')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <span className="font-black text-xs text-sky-800 block">
                      💳 تحصيل دفعة جزئية (دفع جزء والباقي دين)
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                      استلمت جزءاً من المبلغ، والمتبقي يترحل ديناً على الزبون.
                    </span>

                    {collectionStatus === 'partial' && (
                      <div className="mt-3 space-y-1">
                        <label className="text-[11px] font-bold text-slate-700">
                          المبلغ المستلم كاش الآن (د.ع):
                        </label>
                        <input
                          type="number"
                          value={partialAmount}
                          onChange={(e) => setPartialAmount(e.target.value)}
                          placeholder="مثال: 25000"
                          className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-brand-blue"
                        />
                        {Number(partialAmount) > 0 && Number(partialAmount) < selectedOrder.total && (
                          <p className="text-[10px] text-amber-700 font-bold mt-1">
                            المتبقي كدين على العميل: {(selectedOrder.total - Number(partialAmount)).toLocaleString()} د.ع
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </label>

                {/* 4. Return / Failed */}
                <label className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  collectionStatus === 'returned'
                    ? 'bg-red-50 border-red-500 text-red-950 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="collectionStatus"
                    value="returned"
                    checked={collectionStatus === 'returned'}
                    onChange={() => setCollectionStatus('returned')}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-black text-xs text-red-700 block">
                      ❌ تعذر التسليم / رفض الزبون (إرجاع البضاعة للمخزن)
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                      الزبون مغلق، غير متواجد، أو رفض الاستلام.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Driver Delivery Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                ملاحظات السائق عند التسليم (اختياري):
              </label>
              <input
                type="text"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="مثال: تم التسليم للأخ بالماركت / الاستلام عند الباب..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-brand-blue"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-5 rounded-2xl transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCompleteDelivery}
                className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs py-3 px-6 rounded-2xl shadow-md transition flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? 'جاري الحفظ...' : 'تأكيد وحفظ التسليم ✅'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* POST-DELIVERY WHATSAPP NOTIFICATION MODAL */}
      {completedDeliveryData && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-fadeIn">
            
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner text-2xl font-bold">
                ✓
              </div>
              <h3 className="font-black text-base text-slate-900">
                🎉 تم إتمام تسليم الطلبية بنجاح!
              </h3>
              <p className="text-xs text-slate-500 font-bold">
                فاتورة رقم <span className="font-mono text-slate-900 font-black">#{completedDeliveryData.order.orderNumber}</span> • الزبون: <span className="text-slate-900 font-black">{completedDeliveryData.order.customer.name}</span>
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-1.5 text-xs">
              <div className="flex justify-between font-bold">
                <span className="text-slate-500">إجمالي الفاتورة:</span>
                <span className="font-mono text-slate-900 font-black">{completedDeliveryData.order.total.toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-slate-500">حالة التحصيل:</span>
                <span className="font-black text-emerald-700">
                  {completedDeliveryData.order.collectionStatus === 'collected_cash' && '💵 كاش مستلم بالكامل'}
                  {completedDeliveryData.order.collectionStatus === 'debt_unpaid' && '📝 تسليم بالآجل (دين مسجل)'}
                  {completedDeliveryData.order.collectionStatus === 'partial' && `💳 جزئي (دفع ${completedDeliveryData.order.collectedAmount?.toLocaleString()} د.ع)`}
                </span>
              </div>
            </div>

            {/* Two Big WhatsApp Buttons - يختفي كل زر فور الضغط عليه */}
            <div className="space-y-2.5 pt-1">
              {!customerWhatsAppSent || !accountantWhatsAppSent ? (
                <span className="text-[11px] font-black text-slate-700 block text-center">
                  📢 إرسال إشعارات التسليم والتحصيل فوراً:
                </span>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-center space-y-1">
                  <span className="text-xs font-black text-emerald-800 block">✓ تم إرسال كافة إشعارات الواتساب بنجاح!</span>
                  <span className="text-[10px] text-emerald-600 font-bold block">تم إخطار الزبون والمحاسب بتفاصيل الفاتورة والمبالغ المحصلة.</span>
                </div>
              )}

              {/* 1. Send to Customer */}
              {!customerWhatsAppSent ? (
                <a
                  href={completedDeliveryData.customerWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setCustomerWhatsAppSent(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs sm:text-sm py-3.5 px-4 rounded-2xl shadow-md transition flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>إرسال إشعار للزبون عبر الواتساب 💬</span>
                </a>
              ) : (
                <div className="bg-slate-100 text-emerald-700 text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-slate-200">
                  <span>✓ تم إرسال إشعار الزبون</span>
                </div>
              )}

              {/* 2. Send to Accountant */}
              {!accountantWhatsAppSent ? (
                <a
                  href={completedDeliveryData.accountantWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setAccountantWhatsAppSent(true)}
                  className="w-full bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-xs sm:text-sm py-3.5 px-4 rounded-2xl shadow-md transition flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" />
                  <span>إرسال إشعار للمحاسب المالي عبر الواتساب 💼</span>
                </a>
              ) : (
                <div className="bg-slate-100 text-amber-800 text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-slate-200">
                  <span>✓ تم إرسال إشعار المحاسب المالي</span>
                </div>
              )}
            </div>

            {/* Done / Continue Button */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCompletedDeliveryData(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs py-3 rounded-2xl transition text-center cursor-pointer"
              >
                العودة للطلبيات والمتابعة 🚀
              </button>
            </div>

          </div>
        </div>
      )}

      {/* STOREFRONT PHOTO MODAL */}
      {photoModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-bold text-xs text-slate-900">صورة واجهة الماركت / المحل 🏪</h4>
              <button onClick={() => setPhotoModalUrl(null)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <img
              src={photoModalUrl}
              alt="واجهة الماركت"
              className="w-full max-h-[70vh] object-contain rounded-2xl bg-slate-50 border border-slate-200"
            />
          </div>
        </div>
      )}

    </div>
  );
}
