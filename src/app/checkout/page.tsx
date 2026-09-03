'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingBag,
  Truck,
  CreditCard,
  Banknote,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  Building,
  User,
  Phone,
  MessageCircle,
  FileText,
  Clock,
  Sparkles,
  Gift
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { PaymentMethod, StoreSettings } from '@/types';
import EtihadLogo from '@/components/EtihadLogo';
import { getUserCashbackRate } from '@/lib/pricing';
import { calculateDeliveryFeeByDistance, calculateDistanceKm } from '@/lib/delivery';

interface KarbalaAreaOption {
  name: string;
  tier: 'close' | 'medium' | 'far';
  tierLabel: string;
  zoneId: string;
  defaultFee: number;
}

const KARBALA_AREAS: KarbalaAreaOption[] = [
  // 1. المناطق القريبة والمركز (أقل من 5 كم - 2,000 د.ع)
  { name: 'كربلاء - المركز والمدينة القديمة', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - العباسية (الشرقية / الغربية)', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - حي الحسين (ع)', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - حي المعلمين', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - حي الإسكان والجمعية', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - باب بغداد / باب الخان', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - شارع السناتر وحي البلدية', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },
  { name: 'كربلاء - حي النقيب والمهندسين', tier: 'close', tierLabel: 'منطقة قريبة 🟢', zoneId: 'close', defaultFee: 2000 },

  // 2. المناطق المتوسطة (5 - 12 كم - 3,000 د.ع)
  { name: 'كربلاء - حي الحر', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي رمضان والتحدي', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي الموظفين', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي الغدير والوفاء', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي الميلاد والضباط', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - الإبراهيمية وحي العسكري', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - حي السلام وحي النصر', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },
  { name: 'كربلاء - منطقة التعليب والصناعي', tier: 'medium', tierLabel: 'منطقة متوسطة 🟡', zoneId: 'medium', defaultFee: 3000 },

  // 3. المناطق البعيدة والأطراف (أكثر من 12 كم - 5,000 د.ع)
  { name: 'كربلاء - قضاء الهندية (طويريج)', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - ناحية الجدول الغربي', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - ناحية الخيرات', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - قضاء عين التمر (شثاثة)', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - ناحية الحسينية', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - مجمع درة كربلاء والأطراف', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - منطقة الرزازة والأرياف', tier: 'far', tierLabel: 'أطراف وبعيدة 🔴', zoneId: 'far', defaultFee: 5000 },
  { name: 'كربلاء - منطقة أخرى (حسب الاتفاق)', tier: 'medium', tierLabel: 'منطقة مخصصة 📍', zoneId: 'medium', defaultFee: 3000 },
];

export default function CheckoutPage() {
  const { cart, subtotal, discount, clearCart, minOrderAmount, amountNeededForMinOrder, isBelowMinOrder } = useCart();
  const { user, isApprovedMerchant, isPendingApproval } = useAuth();
  const router = useRouter();

  // Rewards / Cashback state
  const [availableCashback, setAvailableCashback] = useState<number>(0);
  const [useCashback, setUseCashback] = useState<boolean>(false);
  const [cashbackRate, setCashbackRate] = useState<number>(150);

  // Form states
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('كربلاء - حي الحر');
  const [address, setAddress] = useState('');
  const [locationTitle, setLocationTitle] = useState('موقع البيت 🏠');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');

  // GPS & Locations
  const [coords, setCoords] = useState<{ lat?: number; lng?: number; mapsUrl?: string }>({});
  const [liveGps, setLiveGps] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMismatch, setLocationMismatch] = useState<{
    distanceKm: number;
    savedTitle: string;
  } | null>(null);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [savedLocations, setSavedLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('home');
  const [saveThisLocation, setSaveThisLocation] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  // Selected area object matching city
  const selectedAreaObj = KARBALA_AREAS.find((a) => a.name === city) || KARBALA_AREAS[0];


  // Dynamic Free Delivery calculation
  const freeThreshold = storeSettings?.freeDeliveryThreshold ?? 50000;
  const isFreeDeliveryQualified = subtotal >= freeThreshold && subtotal > 0;

  // حساب الكروة: أولاً بالكيلومتر (GPS) إذا متوفر، وإلا بالمنطقة
  let calculatedDeliveryFee = 3000;
  let gpsDeliveryInfo: { distanceKm: number; fee: number } | null = null;

  if (isFreeDeliveryQualified) {
    calculatedDeliveryFee = 0;
  } else if (coords.lat && coords.lng && storeSettings?.warehouseLat && storeSettings?.pricePerKm) {
    // ✅ حساب بالكيلومتر الفعلي من موقع المخزن
    const result = calculateDeliveryFeeByDistance(coords.lat, coords.lng, storeSettings);
    if (result) {
      calculatedDeliveryFee = result.fee;
      gpsDeliveryInfo = { distanceKm: result.distanceKm, fee: result.fee };
    }
  } else if ((storeSettings?.deliveryPricingMode || 'distance_tiered') === 'distance_tiered' && storeSettings?.deliveryZones) {
    // 📍 احتياطي: المناطق المحددة
    const matchedZone = storeSettings.deliveryZones.find((z) => z.id === selectedAreaObj.zoneId);
    if (matchedZone && typeof matchedZone.fee === 'number') {
      calculatedDeliveryFee = matchedZone.fee;
    } else {
      calculatedDeliveryFee = selectedAreaObj.defaultFee;
    }
  } else if (typeof storeSettings?.deliveryFee === 'number') {
    calculatedDeliveryFee = storeSettings.deliveryFee;
  } else {
    calculatedDeliveryFee = selectedAreaObj.defaultFee;
  }


  // Load available rewards/cashback and settings
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.settings) setStoreSettings(data.settings);
      })
      .catch(() => {});

    if (user) {
      Promise.all([
        fetch('/api/orders').then((r) => r.json()),
        fetch('/api/settings').then((r) => r.json()).catch(() => ({ success: false })),
      ])
        .then(([ordersData, settingsData]) => {
          if (settingsData?.success && settingsData?.settings) {
            setStoreSettings(settingsData.settings);
          }
          const rate = getUserCashbackRate(user, settingsData?.settings);
          setCashbackRate(rate);

          if (ordersData?.success && Array.isArray(ordersData.orders)) {
            const userOrders = ordersData.orders.filter(
              (o: any) =>
                o.status !== 'cancelled' &&
                ((o.customer.userId && o.customer.userId === user.id) ||
                  (o.customer.phone && o.customer.phone === user.phone))
            );
            const totalPieces = userOrders.reduce(
              (sum: number, o: any) =>
                sum + (o.items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0),
              0
            );
            const totalEarned = totalPieces * rate;
            const totalUsed = userOrders.reduce(
              (sum: number, o: any) => sum + Number(o.usedCashbackDiscount || 0),
              0
            );
            const netBalance = Math.max(0, totalEarned - totalUsed);
            setAvailableCashback(netBalance);
          }
        })
        .catch(console.error);
    }
  }, [user]);

  // Initial load of user data & saved locations
  useEffect(() => {
    let locs: any[] = [];
    
    // Check saved in localStorage
    try {
      const stored = localStorage.getItem('etihad_saved_addresses');
      if (stored) {
        locs = JSON.parse(stored);
      }
    } catch (e) {}

    // Check user addresses
    if (user?.savedAddresses && user.savedAddresses.length > 0) {
      locs = [...user.savedAddresses];
    }

    // If still empty, provide standard quick presets
    if (locs.length === 0) {
      locs = [
        {
          id: 'home',
          title: 'موقع البيت 🏠',
          city: user?.city || 'كربلاء المقدسة',
          address: user?.address || '',
          lat: user?.lat,
          lng: user?.lng,
          mapsUrl: user?.mapsUrl,
        },
        {
          id: 'work',
          title: 'موقع العمل / الدوام 🏢',
          city: user?.city || 'كربلاء المقدسة',
          address: '',
        },
      ];
    }

    setSavedLocations(locs);

    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      if (user.businessName) setBusinessName(user.businessName);
      if (user.city) setCity(user.city);
      if (user.address) setAddress(user.address);
      if (user.lat && user.lng) {
        setCoords({ lat: user.lat, lng: user.lng, mapsUrl: user.mapsUrl || `https://www.google.com/maps?q=${user.lat},${user.lng}` });
        setGpsStatus('تم تحميل إحداثيات موقعك الجغرافي');
      }
    }

    // Auto-detect live GPS in background with High Accuracy to check if user is at the selected address
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLiveGps({ lat, lng });

          // If no coords set yet, use live GPS
          if (!user?.lat && !coords.lat) {
            setCoords({
              lat,
              lng,
              mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
            });
            setGpsStatus('تم تحديد موقعك الجغرافي تلقائياً عبر GPS 📍');
          } else if (user?.lat && user?.lng) {
            // Check distance between saved address and live position
            const diffKm = calculateDistanceKm(lat, lng, user.lat, user.lng);
            if (diffKm > 0.5) { // إذا كان الفرق أكثر من 500 متر
              setLocationMismatch({
                distanceKm: Math.round(diffKm * 10) / 10,
                savedTitle: user.businessName || 'موقع البيت 🏠',
              });
            }
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, [user]);

  const handleSelectSavedLocation = (loc: any) => {
    setSelectedLocationId(loc.id);
    setLocationTitle(loc.title);
    if (loc.city) setCity(loc.city);
    if (loc.address) setAddress(loc.address);
    if (loc.lat && loc.lng) {
      setCoords({ lat: loc.lat, lng: loc.lng, mapsUrl: loc.mapsUrl || `https://www.google.com/maps?q=${loc.lat},${loc.lng}` });
      setGpsStatus(`تم تفعيل موقع: ${loc.title}`);

      // Check mismatch if live GPS is available
      if (liveGps) {
        const diffKm = calculateDistanceKm(liveGps.lat, liveGps.lng, loc.lat, loc.lng);
        if (diffKm > 0.5) {
          setLocationMismatch({
            distanceKm: Math.round(diffKm * 10) / 10,
            savedTitle: loc.title,
          });
        } else {
          setLocationMismatch(null);
        }
      }
    } else {
      setLocationMismatch(null);
    }
  };

  const handleApplyCurrentLiveLocation = () => {
    if (!liveGps) return;
    const url = `https://www.google.com/maps?q=${liveGps.lat},${liveGps.lng}`;
    setCoords({ lat: liveGps.lat, lng: liveGps.lng, mapsUrl: url });
    setLocationTitle('موقعي الحالي الآن 📍');
    setSelectedLocationId('custom');
    setLocationMismatch(null);
    setGpsStatus('تم تحديث موقع التوصيل إلى موقعك الجغرافي الحالي بنجاح ✓');
  };

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('متصفحك لا يدعم خاصية تحديد الموقع الجغرافي');
      return;
    }

    setIsDetectingGps(true);
    setGpsStatus('جاري تحديد موقعك الجغرافي بالأقمار الصناعية GPS...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const url = `https://www.google.com/maps?q=${lat},${lng}`;
        setCoords({ lat, lng, mapsUrl: url });
        setIsDetectingGps(false);
        setGpsStatus('تم تحديد وإرفاق موقعك الجغرافي بنجاح ✓');
      },
      (err) => {
        setIsDetectingGps(false);
        setGpsStatus('تعذر الوصول للموقع تلقائياً، يمكنك إدخال العنوان كتابةً');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (cart.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-slate-400 mx-auto shadow-sm">
          <ShoppingBag className="w-8 h-8 text-brand-coral" />
        </div>
        <h2 className="text-xl font-black text-slate-800">سلة التسوق فارغة</h2>
        <p className="text-xs text-slate-500">يرجى إضافة أصناف إلى السلة قبل التوجه للدفع.</p>
        <Link
          href="/products"
          className="inline-block bg-brand-coral hover:bg-brand-coralHover text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md transition"
        >
          العودة للتسوق
        </Link>
      </div>
    );
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (isBelowMinOrder) {
      setErrorMessage(`عذراً، الحد الأدنى لقيمة الطلبية في المتجر هو ${minOrderAmount.toLocaleString()} د.ع. مجموع مشترياتك الحالي هو ${subtotal.toLocaleString()} د.ع (متبقي ${amountNeededForMinOrder.toLocaleString()} د.ع).`);
      return;
    }

    if (isPendingApproval) {
      setErrorMessage('حسابك (ماركت/تاجر) قيد المراجعة والتدقيق حالياً من قبل الإدارة. لا يمكن إرسال فاتورة الشراء إلا بعد قيام الإدارة بالاتصال بك والتأكد واعتماد حسابك.');
      return;
    }

    if (!name.trim() || !phone.trim() || !address.trim()) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة (الاسم، الهاتف، العنوان)');
      return;
    }

    setIsSubmitting(true);

    try {
      // Save location to localStorage / user profile if checked
      if (saveThisLocation) {
        const newLoc = {
          id: `loc-${Date.now()}`,
          title: locationTitle.trim() || 'موقع محفوظ 📍',
          city,
          address: address.trim(),
          lat: coords.lat,
          lng: coords.lng,
          mapsUrl: coords.mapsUrl,
        };

        const updated = [...savedLocations.filter(l => l.id !== selectedLocationId && l.title !== newLoc.title), newLoc];
        setSavedLocations(updated);
        try {
          localStorage.setItem('etihad_saved_addresses', JSON.stringify(updated));
        } catch (e) {}
      }

      const appliedCashbackDiscount = useCashback ? Math.min(availableCashback, Math.max(0, subtotal - discount)) : 0;
      const finalPayableTotal = Math.max(0, subtotal - discount - appliedCashbackDiscount) + calculatedDeliveryFee;

      const orderPayload = {
        customer: {
          name: name.trim(),
          businessName: businessName.trim() || undefined,
          phone: phone.trim(),
          email: user?.email || '',
          city,
          address: address.trim(),
          locationTitle: locationTitle.trim() || undefined,
          lat: coords.lat,
          lng: coords.lng,
          mapsUrl: coords.mapsUrl,
          storefrontImage: user?.storefrontImage,
          notes: notes.trim() || undefined,
          isGuest: !user,
          userId: user?.id,
        },
        items: cart.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.pricePerUnit,
          quantity: item.quantity,
          saleType: item.saleType,
          unitLabel: item.unitLabel,
          image: item.product.images[0] || '',
        })),
        subtotal,
        deliveryFee: calculatedDeliveryFee,
        discount,
        usedCashbackDiscount: appliedCashbackDiscount,
        total: finalPayableTotal,
        paymentMethod,
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const data = await res.json();

      if (data.success && data.order) {
        clearCart();
        router.push(`/order-success/${data.order.id}`);
      } else {
        setErrorMessage(data.error || 'حدث خطأ أثناء حفظ الطلبية');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('حدث خطأ في الاتصال بالخادم');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 text-xs">
      
      {/* Checkout Clean Distraction-Free Header */}
      <div className="flex items-center justify-between bg-white px-4 py-3 sm:px-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <Link href="/" className="flex items-center gap-2">
          <EtihadLogo size="sm" />
        </Link>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>طلب آمن وتوصيل مباشر 100% 🔒</span>
          </div>
          <Link
            href="/cart"
            className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>← العودة للسلة</span>
          </Link>
        </div>
      </div>

      {/* Title */}
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
          <Truck className="w-6 h-6 text-brand-blue" />
          <span>تأكيد الطلبية وتفاصيل التوصيل</span>
        </h1>
        <p className="text-xs text-slate-600 mt-1">
          يتم إرسال موقعك الجغرافي وتفاصيل الفاتورة تلقائياً مع الطلبية لتسريع وصول المندوب
        </p>
      </div>

      {isPendingApproval && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 p-5 rounded-3xl space-y-4 text-slate-900 shadow-sm animate-fadeIn">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-2xl shrink-0 shadow-xs">
              ⏳
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-900">
                تنبيه: حساب {user?.accountType === 'market' ? 'الماركت 🏪' : 'التاجر 👑'} الخاص بك ({user?.businessName || user?.name}) قيد المراجعة والتدقيق!
              </h3>
              <p className="text-xs text-slate-700 font-bold mt-1 leading-relaxed">
                أهلاً بك! يمكنك تصفح كافة المنتجات والأسعار بحرية، ولكن لا يمكن إرسال وتأكيد فاتورة الشراء حتى يتم الاتصال بك والتأكد من بيانات المحل واعتماد الحساب رسمياً من قبل الإدارة.
              </p>
            </div>
          </div>

          {/* Direct Support & WhatsApp Contact Block */}
          <div className="bg-white/95 p-3.5 rounded-2xl border border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
            <div className="space-y-0.5">
              <span className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                <span>📞 هل ترغب بتسريع تفعيل واعتماد الحساب؟</span>
              </span>
              <span className="text-[11px] text-slate-600 font-bold block">
                تواصل مع قسم خدمة العملاء والدعم الفني مباشرة:
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {/* WhatsApp Direct Support Button */}
              {(() => {
                let supportWa = (storeSettings?.supportWhatsappNumber || storeSettings?.whatsappNumber || storeSettings?.phone || '07700000000').replace(/\D/g, '');
                if (supportWa.startsWith('07')) supportWa = '964' + supportWa.substring(1);
                const waText = encodeURIComponent(`مرحباً إدارة سوق الجملة 🇮🇶، أود الاستفسار عن تفعيل واعتماد حساب (${user?.businessName || user?.name}) - رقم الهاتف: ${user?.phone}`);
                return (
                  <a
                    href={`https://api.whatsapp.com/send?phone=${supportWa}&text=${waText}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2 px-3.5 rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-100" />
                    <span>مراسلة الدعم الفني عبر واتساب 💬</span>
                  </a>
                );
              })()}

              {/* Phone Direct Call Button */}
              {(() => {
                const phoneNum = storeSettings?.supportPhone || storeSettings?.phone || '07700000000';
                return (
                  <a
                    href={`tel:${phoneNum}`}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs py-2 px-3.5 rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-slate-600" />
                    <span dir="ltr">{phoneNum}</span>
                  </a>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-2xl font-bold">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Form Inputs */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Customer & Address Details */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-brand-blue" />
                <span>بيانات المستلم وتحديد موقع التوصيل</span>
              </h2>

              <button
                type="button"
                onClick={handleDetectGps}
                disabled={isDetectingGps}
                className="bg-blue-50 hover:bg-blue-100 text-brand-blue font-black text-xs py-1.5 px-3 rounded-xl border border-blue-200 transition flex items-center gap-1.5 shadow-2xs"
              >
                <MapPin className={`w-3.5 h-3.5 ${isDetectingGps ? 'animate-bounce text-brand-coral' : 'text-brand-blue'}`} />
                <span>{isDetectingGps ? 'جاري تحديد GPS...' : '📍 تحديث موقعي عبر GPS'}</span>
              </button>
            </div>

            {/* تنبيه ذكي عند اختلاف الموقع الجغرافي الفعلي عن العنوان المختار */}
            {locationMismatch && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-3 animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center text-lg shrink-0">
                    ⚠️
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-black text-xs text-amber-950">
                      تنبيه: أنت لست في ({locationMismatch.savedTitle}) حالياً!
                    </h4>
                    <p className="text-[11px] text-amber-900 leading-relaxed font-bold">
                      أنت اخترت <span className="underline">({locationMismatch.savedTitle})</span>، ولكن موقعك الجغرافي الحالي يبعد مسافة <span className="text-rose-700 font-black">({locationMismatch.distanceKm} كم)</span> عن هذا المكان.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-amber-200/80">
                  <button
                    type="button"
                    onClick={handleApplyCurrentLiveLocation}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white font-black text-xs py-2 px-3 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>📍 إرسال الطلبية لموقعي الحالي الآن</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLocationMismatch(null)}
                    className="bg-white hover:bg-amber-100 text-amber-900 font-bold text-xs py-2 px-3 rounded-xl border border-amber-300 transition cursor-pointer"
                  >
                    <span>إبقاء ({locationMismatch.savedTitle})</span>
                  </button>
                </div>
              </div>
            )}

            {/* Multiple Saved Locations Chips */}
            <div className="space-y-2 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between text-slate-700 font-bold text-xs">
                <span>📍 اختر موقع التوصيل لتذهب إليه الطلبية:</span>
                <span className="text-[11px] text-slate-500">حفظ مواقع متعددة</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-1">
                {savedLocations.map((loc) => {
                  const isSelected = selectedLocationId === loc.id;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => handleSelectSavedLocation(loc)}
                      className={`py-2 px-3 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-brand-blue text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{loc.title}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedLocationId('custom');
                    setLocationTitle('موقع جديد 📍');
                    setAddress('');
                  }}
                  className={`py-2 px-3 rounded-xl font-bold text-xs border border-dashed transition flex items-center gap-1 ${
                    selectedLocationId === 'custom'
                      ? 'border-brand-coral bg-coral-50/30 text-brand-coral'
                      : 'border-slate-300 text-slate-600 hover:bg-white'
                  }`}
                >
                  <span>+ تسمية موقع جديد</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Location Title Name */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>تسمية هذا الموقع (مثال: موقع البيت 🏠، العمل 🏢، الماركت 🏪) *</span>
                </label>
                <input
                  type="text"
                  required
                  value={locationTitle}
                  onChange={(e) => setLocationTitle(e.target.value)}
                  placeholder="مثال: موقع البيت 🏠 أو موقع الدوام 🏢"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:border-brand-blue font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: حيدر علي"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:border-brand-blue"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">اسم الماركت / المحل (اختياري)</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="مثال: أسواق بغداد"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:border-brand-blue"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">رقم الهاتف (الواتساب) *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="077XXXXXXXX"
                  dir="ltr"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-right text-slate-900 focus:outline-none focus:border-brand-blue"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>منطقة التوصيل والحي في كربلاء *</span>
                  <span className="text-[10px] text-emerald-700 font-bold">
                    {isFreeDeliveryQualified ? '🎉 مؤهل للتوصيل المجاني' : `كروة التوصيل: ${calculatedDeliveryFee.toLocaleString()} د.ع`}
                  </span>
                </label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-blue"
                >
                  <optgroup label="🟢 مناطق قريبة والمركز (أقل من 5 كم)">
                    {KARBALA_AREAS.filter(a => a.tier === 'close').map((p) => {
                      const zoneFee = storeSettings?.deliveryZones?.find(z => z.id === p.zoneId)?.fee ?? p.defaultFee;
                      return (
                        <option key={p.name} value={p.name}>
                          {p.name} — {isFreeDeliveryQualified ? 'مجاني ⚡' : `${zoneFee.toLocaleString()} د.ع`}
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="🟡 مناطق متوسطة (5 - 12 كم)">
                    {KARBALA_AREAS.filter(a => a.tier === 'medium').map((p) => {
                      const zoneFee = storeSettings?.deliveryZones?.find(z => z.id === p.zoneId)?.fee ?? p.defaultFee;
                      return (
                        <option key={p.name} value={p.name}>
                          {p.name} — {isFreeDeliveryQualified ? 'مجاني ⚡' : `${zoneFee.toLocaleString()} د.ع`}
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="🔴 أطراف ومناطق بعيدة (أكثر من 12 كم)">
                    {KARBALA_AREAS.filter(a => a.tier === 'far').map((p) => {
                      const zoneFee = storeSettings?.deliveryZones?.find(z => z.id === p.zoneId)?.fee ?? p.defaultFee;
                      return (
                        <option key={p.name} value={p.name}>
                          {p.name} — {isFreeDeliveryQualified ? 'مجاني ⚡' : `${zoneFee.toLocaleString()} د.ع`}
                        </option>
                      );
                    })}
                  </optgroup>
                </select>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700">العنوان التفصيلي (المنطقة، الشارع، أقرب نقطة دالة) *</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="مثال: المنصور، شارع 14 رمضان، قرب جامع الرحمن"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:border-brand-blue"
                />
              </div>

              {/* Automatic GPS Status Banner */}
              <div className="sm:col-span-2 bg-emerald-50/70 border border-emerald-300 rounded-2xl p-3.5 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-black text-emerald-950 block text-xs">
                      {gpsStatus || (coords.lat ? 'تم إرفاق إحداثيات GPS تلقائياً مع الطلبية' : 'الموقع الجغرافي المباشر')}
                    </span>
                    <span className="text-[10px] text-emerald-700">
                      {coords.lat ? `إحداثيات: ${coords.lat.toFixed(4)}, ${coords.lng?.toFixed(4)}` : 'يتم إرسال رابط الخريطة تلقائياً مع الفاتورة'}
                    </span>
                  </div>
                </div>

                {coords.mapsUrl ? (
                  <a
                    href={coords.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white hover:bg-emerald-100 text-emerald-800 font-black text-[11px] py-1.5 px-3 rounded-xl border border-emerald-300 transition shadow-2xs"
                  >
                    عرض على خرائط Google 🗺️
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleDetectGps}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] py-1.5 px-3 rounded-xl transition shadow-2xs"
                  >
                    تحديد موقعي الآن 📍
                  </button>
                )}
              </div>

              {/* بانر المسافة والكروة المحسوبة بالكيلومتر */}
              {gpsDeliveryInfo && !isFreeDeliveryQualified && (
                <div className="sm:col-span-2 bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-base">
                      📐
                    </div>
                    <div>
                      <span className="font-black text-blue-900 block text-xs">
                        المسافة من المخزن: {gpsDeliveryInfo.distanceKm} كم
                      </span>
                      <span className="text-[10px] text-blue-700 font-bold">
                        تم حساب الكروة تلقائياً بناءً على موقعك الجغرافي الفعلي
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-blue-900 text-sm">{gpsDeliveryInfo.fee.toLocaleString()} د.ع</span>
                    <span className="text-[10px] text-blue-600 font-bold block">كروة التوصيل</span>
                  </div>
                </div>
              )}

              {/* Save Address Checkbox */}
              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="saveLocCheck"
                  checked={saveThisLocation}
                  onChange={(e) => setSaveThisLocation(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-blue focus:ring-brand-blue border-slate-300"
                />
                <label htmlFor="saveLocCheck" className="text-xs font-bold text-slate-700 cursor-pointer">
                  حفظ هذا الموقع في حسابي لاستخدامه بسرعة في الطلبيات القادمة 💾
                </label>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700">ملاحظات إضافية للتوصيل (اختياري)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: يرجى الاتصال قبل الوصول بنصف ساعة..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-900 focus:outline-none focus:border-brand-blue resize-none"
                />
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Banknote className="w-4 h-4 text-brand-coral" />
              <span>طريقة الدفع في العراق</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('cod')}
                className={`p-3.5 rounded-2xl border text-right transition flex items-center justify-between ${
                  paymentMethod === 'cod'
                    ? 'border-brand-coral bg-coral-50/20 text-slate-900 font-bold ring-2 ring-brand-coral/30'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="font-bold text-xs block">💵 الدفع عند الاستلام</span>
                  <span className="text-[10px] text-slate-500">كاش بالدينار عند وصول المندوب</span>
                </div>
                <div className={`w-3.5 h-3.5 rounded-full border ${paymentMethod === 'cod' ? 'bg-brand-coral border-brand-coral' : 'border-slate-300'}`} />
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('zaincash')}
                className={`p-3.5 rounded-2xl border text-right transition flex items-center justify-between ${
                  paymentMethod === 'zaincash'
                    ? 'border-brand-blue bg-blue-50/20 text-slate-900 font-bold ring-2 ring-brand-blue/30'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="font-bold text-xs block">📱 زين كاش (ZainCash)</span>
                  <span className="text-[10px] text-slate-500">تحويل سريع عبر المحفظة</span>
                </div>
                <div className={`w-3.5 h-3.5 rounded-full border ${paymentMethod === 'zaincash' ? 'bg-brand-blue border-brand-blue' : 'border-slate-300'}`} />
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('qicard')}
                className={`p-3.5 rounded-2xl border text-right transition flex items-center justify-between ${
                  paymentMethod === 'qicard'
                    ? 'border-emerald-600 bg-emerald-50/20 text-slate-900 font-bold ring-2 ring-emerald-600/30'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="font-bold text-xs block">💳 كي كارد / ماستر كارد</span>
                  <span className="text-[10px] text-slate-500">دفع إلكتروني مباشر</span>
                </div>
                <div className={`w-3.5 h-3.5 rounded-full border ${paymentMethod === 'qicard' ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'}`} />
              </button>
            </div>
          </div>

        </div>

        {/* Order Summary & Submit */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h2 className="text-sm font-black text-slate-900 border-b border-slate-100 pb-3">
              تفاصيل الفاتورة ({cart.length} أصناف)
            </h2>

            <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {cart.map((item, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between text-xs">
                  <div className="truncate max-w-[170px]">
                    <span className="font-bold text-slate-800 block truncate">{item.product.name}</span>
                    <span className="text-[10px] text-slate-500">{item.quantity} × {item.pricePerUnit.toLocaleString()} د.ع ({item.unitLabel})</span>
                  </div>
                  <span className="font-black text-slate-900">{(item.pricePerUnit * item.quantity).toLocaleString()} د.ع</span>
                </div>
              ))}
            </div>

            {/* Rewards / Cashback Deduction Card */}
            {user && availableCashback > 0 && (
              <div
                onClick={() => setUseCashback(!useCashback)}
                className={`border-2 rounded-2xl p-4 space-y-3 shadow-xs transition-all cursor-pointer select-none ${
                  useCashback
                    ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-500/20'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs shrink-0 transition-colors ${
                        useCashback
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      <Gift className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 block text-xs">استخدام رصيد الأرباح</span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            useCashback
                              ? 'bg-emerald-200 text-emerald-900'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {useCashback ? 'مفعّل ✓' : 'غير مفعّل'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-600 font-bold block mt-0.5">
                        رصيدك المتاح: <span className="font-black text-slate-900 font-mono">{availableCashback.toLocaleString()} د.ع</span>
                      </span>
                    </div>
                  </div>

                  {/* Clean Symmetric Toggle Switch Button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div
                      dir="ltr"
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ease-in-out p-0.5 ${
                        useCashback ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out flex items-center justify-center text-[10px] font-bold ${
                          useCashback ? 'translate-x-5 text-emerald-600' : 'translate-x-0 text-slate-400'
                        }`}
                      >
                        {useCashback ? '✓' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {useCashback ? (
                  <div className="bg-white border border-emerald-300 rounded-xl p-2.5 text-[11px] text-emerald-950 font-bold flex items-center justify-between animate-fadeIn shadow-2xs">
                    <span>خصم مطبق من رصيد أرباحك:</span>
                    <span className="font-black text-emerald-700 font-mono text-sm">
                      - {Math.min(availableCashback, Math.max(0, subtotal - discount)).toLocaleString()} د.ع ✓
                    </span>
                  </div>
                ) : (
                  <div className="bg-white/80 border border-slate-200 rounded-xl p-2 text-[10px] text-slate-600 font-bold flex items-center gap-1.5">
                    <span>💡</span>
                    <span>انقر لتفعيل الخصم وتخفيض سعر الطلبية فوراً من رصيد أرباحك.</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>المجموع الفرعي:</span>
                <span className="font-bold text-slate-900">{subtotal.toLocaleString()} د.ع</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>خصم الكوبون:</span>
                  <span className="font-bold">-{discount.toLocaleString()} د.ع</span>
                </div>
              )}
              {useCashback && availableCashback > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200 animate-fadeIn">
                  <span className="flex items-center gap-1">
                    <Gift className="w-3.5 h-3.5 text-emerald-600" />
                    <span>خصم رصيد الأرباح (كاش باك):</span>
                  </span>
                  <span className="font-mono text-xs">
                    -{Math.min(availableCashback, Math.max(0, subtotal - discount)).toLocaleString()} د.ع
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span>كروة التوصيل ({selectedAreaObj.tierLabel}):</span>
                <span className="font-bold text-slate-900">
                  {calculatedDeliveryFee === 0 ? <span className="text-emerald-600 font-black">مجاناً ⚡</span> : `${calculatedDeliveryFee.toLocaleString()} د.ع`}
                </span>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-sm font-black text-slate-900">
                <span>الإجمالي الكلي:</span>
                <span className="text-xl font-black text-brand-coral">
                  {(Math.max(0, subtotal - discount - (useCashback ? Math.min(availableCashback, Math.max(0, subtotal - discount)) : 0)) + calculatedDeliveryFee).toLocaleString()} د.ع
                </span>
              </div>
            </div>

            {isBelowMinOrder ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled
                  className="w-full bg-slate-200 text-slate-500 font-black py-4 px-4 rounded-2xl cursor-not-allowed text-xs flex items-center justify-center gap-2 border border-slate-300 shadow-none"
                >
                  <span>الحد الأدنى للطلب {minOrderAmount.toLocaleString()} د.ع (متبقي {amountNeededForMinOrder.toLocaleString()} د.ع)</span>
                </button>
                <Link
                  href="/products"
                  className="w-full bg-brand-blue hover:bg-blue-700 text-white font-black py-3 px-4 rounded-2xl transition text-xs flex items-center justify-center gap-2 shadow-xs"
                >
                  <span>+ تصفح الأصناف وإكمال الحد الأدنى 🛒</span>
                </Link>
              </div>
            ) : isPendingApproval ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled
                  className="w-full bg-slate-200 text-slate-500 font-black py-4 px-4 rounded-2xl cursor-not-allowed text-xs flex items-center justify-center gap-2 border border-slate-300 shadow-none"
                >
                  <span>بانتظار موافقة واعتماد الإدارة لإرسال فاتورة الشراء ⏳</span>
                </button>
                <p className="text-center text-[11px] text-amber-900 font-bold bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  ⚠️ حساب الماركت/التاجر قيد المراجعة. ستقوم الإدارة بالتواصل معك لاعتماده وتفعيل إرسال الفواتير.
                </p>
              </div>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-brand-coral hover:bg-brand-coralHover text-white font-black py-4 px-4 rounded-2xl shadow-md transition text-xs flex items-center justify-center gap-2 glow-coral cursor-pointer"
              >
                {isSubmitting ? 'جاري تأكيد الطلبية...' : 'تأكيد وإرسال الطلبية الآن 🚀'}
              </button>
            )}

            <div className="bg-slate-50 p-3 rounded-2xl text-[11px] text-slate-500 text-center space-y-1">
              <span>⚡ ستتمكن من إرسال تفاصيل الفاتورة مباشرة للواتساب بعد التأكيد.</span>
            </div>
          </div>
        </div>

      </form>

    </div>
  );
}
