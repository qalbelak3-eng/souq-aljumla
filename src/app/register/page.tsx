'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, Store, Crown, MapPin, ArrowLeft, ArrowRight, Clock, Camera, Trash2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import EtihadLogo from '@/components/EtihadLogo';
import { AccountType } from '@/types';

function RegisterForm() {
  const searchParams = useSearchParams();
  const initialType = (searchParams.get('type') as AccountType) || null;
  const redirect = searchParams.get('redirect') || '/';

  const [step, setStep] = useState<'choose_type' | 'form'>(initialType ? 'form' : 'choose_type');
  const [accountType, setAccountType] = useState<AccountType>(initialType || 'individual');

  // Fields
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('تجارة مواد غذائية وسناكات جملة');
  const [city, setCity] = useState('كربلاء المقدسة');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [storefrontImage, setStorefrontImage] = useState<string>('');
  const [coords, setCoords] = useState<{ lat?: number; lng?: number; mapsUrl?: string }>({});
  const [locationCaptured, setLocationCaptured] = useState(false);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { registerIndividual, registerMarket, registerWholesale } = useAuth();
  const router = useRouter();

  const handleSelectType = (type: AccountType) => {
    setAccountType(type);
    setStep('form');
  };

  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 5 ميغابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setStorefrontImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCaptureLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setCoords({
            lat,
            lng,
            mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
          });
          setLocationCaptured(true);
        },
        () => {
          setLocationCaptured(true);
        }
      );
    } else {
      setLocationCaptured(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!name.trim() || !phone.trim()) {
      setError('يرجى إدخال الاسم ورقم الموبايل');
      return;
    }

    if ((accountType === 'market' || accountType === 'wholesale') && !businessName.trim()) {
      setError(accountType === 'market' ? 'يرجى إدخال اسم الماركت / المحل' : 'يرجى إدخال اسم النشاط التجاري للتاجر');
      return;
    }

    if (accountType === 'market' && !storefrontImage) {
      setError('يرجى التقاط أو رفع صورة واجهة الماركت (إجباري لتحديد موقع محلك)');
      return;
    }

    if (!password || !password.trim()) {
      setError('يرجى إدخال كلمة السر لحماية وتأمين حسابك');
      return;
    }

    if (password && confirmPassword && password !== confirmPassword) {
      setError('كلمات المرور غير متطابقة');
      return;
    }

    setIsLoading(true);

    if (accountType === 'individual') {
      const res = await registerIndividual(name.trim(), phone.trim(), password.trim());
      setIsLoading(false);
      if (res.success) {
        router.push(redirect);
      } else {
        setError(res.error || 'فشل إنشاء الحساب');
      }
    } else if (accountType === 'market') {
      const res = await registerMarket({
        name: name.trim(),
        phone: phone.trim(),
        password: password ? password.trim() : undefined,
        businessName: businessName.trim(),
        address: address.trim(),
        city: city.trim(),
        storefrontImage,
        lat: coords.lat,
        lng: coords.lng,
        mapsUrl: coords.mapsUrl,
      });
      setIsLoading(false);
      if (res.success) {
        router.push(redirect);
      } else {
        setError(res.error || 'فشل تسجيل حساب الماركت');
      }
    } else {
      // wholesale merchant
      const res = await registerWholesale({
        name: name.trim(),
        phone: phone.trim(),
        password: password ? password.trim() : undefined,
        businessName: businessName.trim(),
        businessType: businessType.trim(),
        city: city.trim(),
        address: address.trim(),
      });
      setIsLoading(false);

      if (res.success) {
        setSuccessMessage(res.message || 'تم تقديم طلب تاجر الجملة بنجاح!');
      } else {
        setError(res.error || 'فشل تقديم طلب تاجر الجملة');
      }
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 sm:py-12 space-y-6 text-xs w-full">
      
      {/* Top Logo */}
      <div className="text-center space-y-2 flex flex-col items-center">
        <EtihadLogo size="lg" />
      </div>

      {/* STEP 1: CHOOSE ACCOUNT TYPE (3 Options: Regular Customer / Market Owner / Wholesale Merchant) */}
      {step === 'choose_type' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_25px_rgba(0,0,0,0.04)] space-y-6">
          
          <div className="text-center space-y-1">
            <h2 className="text-base font-black text-slate-800">اختر نوع الحساب</h2>
            <p className="text-xs text-slate-500">حدد كيف ستستخدم سوق الجملة للبدء فوراً</p>
          </div>

          <div className="space-y-3">
            
            {/* 1. Blue Card: Individual Customer */}
            <button
              type="button"
              onClick={() => handleSelectType('individual')}
              className="w-full bg-[#0284c7] hover:bg-[#0369a1] text-white p-4 rounded-2xl shadow-sm transition text-right flex items-center justify-between group transform active:scale-98"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-black text-sm">
                  <User className="w-4 h-4" />
                  <span>زبون عادي</span>
                </div>
                <p className="text-[11px] text-sky-100 opacity-90">
                  للأفراد والعوائل - تسوق مباشر فوري بأسعار المفرد.
                </p>
              </div>
              <ArrowLeft className="w-5 h-5 text-white/80 group-hover:-translate-x-1 transition-transform shrink-0" />
            </button>

            {/* 2. Green Card: Market Owner */}
            <button
              type="button"
              onClick={() => handleSelectType('market')}
              className="w-full bg-[#1b4332] hover:bg-[#143628] text-white p-4 rounded-2xl shadow-sm transition text-right flex items-center justify-between group transform active:scale-98"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-black text-sm">
                  <Store className="w-4 h-4" />
                  <span>لدي ماركت</span>
                </div>
                <p className="text-[11px] text-emerald-200 opacity-90">
                  لأصحاب المحلات والماركتات - تسجيل مباشر للتسوق بأسعار المفرد.
                </p>
              </div>
              <ArrowLeft className="w-5 h-5 text-white/80 group-hover:-translate-x-1 transition-transform shrink-0" />
            </button>

            {/* 3. Gold/Amber Card: Wholesale Merchant */}
            <button
              type="button"
              onClick={() => handleSelectType('wholesale')}
              className="w-full bg-[#b45309] hover:bg-[#92400e] text-white p-4 rounded-2xl shadow-sm transition text-right flex items-center justify-between group transform active:scale-98"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-black text-sm">
                  <Crown className="w-4 h-4 text-amber-300" />
                  <span>تاجر ( جملة )</span>
                </div>
                <p className="text-[11px] text-amber-100 opacity-90">
                  لتجار الجملة والوكلاء - يتطلب موافقة الإدارة للحصول على أسعار كراتين الجملة والتصنيفات.
                </p>
              </div>
              <ArrowLeft className="w-5 h-5 text-white/80 group-hover:-translate-x-1 transition-transform shrink-0" />
            </button>

          </div>

          <div className="text-center text-xs text-slate-600 pt-2 border-t border-slate-100">
            لديك حساب بالفعل؟{' '}
            <Link href={`/login?redirect=${redirect}`} className="text-brand-blue font-bold hover:underline">
              تسجيل الدخول
            </Link>
          </div>

        </div>
      )}

      {/* STEP 2: FORM */}
      {step === 'form' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-[0_4px_25px_rgba(0,0,0,0.04)] space-y-5">
          
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <button
              type="button"
              onClick={() => setStep('choose_type')}
              className="text-brand-blue text-xs font-bold hover:underline flex items-center gap-1"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>تغيير نوع الحساب</span>
            </button>

            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
              accountType === 'wholesale'
                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                : accountType === 'market'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                : 'bg-sky-100 text-sky-900 border border-sky-200'
            }`}>
              {accountType === 'wholesale'
                ? 'حساب تاجر جملة 👑'
                : accountType === 'market'
                ? 'حساب ماركت 🏪'
                : 'حساب زبون عادي 👤'}
            </span>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs p-3 rounded-xl font-bold text-center">
              {error}
            </div>
          )}

          {successMessage ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-6 rounded-2xl text-center space-y-4">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 mx-auto">
                <Clock className="w-7 h-7 animate-pulse" />
              </div>
              <h3 className="font-black text-sm text-slate-900">تم استلام طلب اعتماد تاجر الجملة بنجاح!</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                طلبك الآن <span className="font-bold text-amber-800">قيد المراجعة والتدقيق</span> من قبل الإدارة. سيتم تفعيل حسابك وتطبيق تصنيف التاجر وأسعار كراتين الجملة فور الاعتماد.
              </p>
              <Link
                href="/"
                className="inline-block bg-brand-coral hover:bg-brand-coralHover text-white font-bold text-xs py-2.5 px-6 rounded-xl transition shadow-xs"
              >
                تصفح المتجر بالمفرد ريثما يتم الاعتماد
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  {accountType === 'wholesale' ? 'اسم التاجر / المفوض *' : 'الاسم الكامل *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: علي حسن الجبوري"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-xs text-slate-900 focus:outline-none focus:border-brand-blue placeholder:text-slate-400"
                />
              </div>

              {/* Market Name if Market */}
              {accountType === 'market' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">اسم الماركت / الأسواق *</label>
                    <input
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="مثال: أسواق الكرادة المركزية"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-xs text-slate-900 focus:outline-none focus:border-brand-blue placeholder:text-slate-400"
                    />
                  </div>

                  {/* Mandatory Storefront Image Capture */}
                  <div className="bg-emerald-50/80 border border-emerald-300/90 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-emerald-700" />
                        <span>صورة واجهة الماركت (إجباري) 📸 *</span>
                      </label>
                      <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-md border border-red-200">
                        مطلوب إجباري
                      </span>
                    </div>

                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      التقط صورة واضحة لواجهة المحل أو الماركت لتسهيل التعرف عليه والوصول إليه في حال عدم وجود لافتة أو إعلان بارز.
                    </p>

                    {storefrontImage ? (
                      <div className="relative rounded-xl overflow-hidden border-2 border-emerald-500 bg-black aspect-video max-h-48 flex items-center justify-center group shadow-sm">
                        <img
                          src={storefrontImage}
                          alt="واجهة الماركت"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <label className="bg-white text-slate-900 hover:bg-slate-100 py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition shadow-md flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5" />
                            <span>تغيير الصورة</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={handleImageCapture}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setStorefrontImage('')}
                            className="bg-red-600 hover:bg-red-700 text-white py-1.5 px-3 rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-emerald-400 hover:border-emerald-600 bg-white rounded-2xl p-5 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition text-center hover:bg-emerald-50/50 group shadow-2xs">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
                          <Camera className="w-6 h-6" />
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-xs font-black text-emerald-900 block">اضغط لالتقاط أو رفع صورة الواجهة 📷</span>
                          <span className="text-[10px] text-slate-500 font-bold block">يدعم الكاميرا المباشرة أو الاختيار من المعرض</span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleImageCapture}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </>
              )}

              {/* Wholesale Business Name if Wholesale */}
              {accountType === 'wholesale' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">اسم النشاط التجاري / متجر الجملة *</label>
                    <input
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="مثال: شركة ومذخر الجملة للمواد الغذائية"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-xs text-slate-900 focus:outline-none focus:border-brand-blue placeholder:text-slate-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">نوع النشاط التجاري</label>
                    <input
                      type="text"
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      placeholder="مثال: تجارة مواد غذائية وسناكات / موزع"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-xs text-slate-900 focus:outline-none focus:border-brand-blue placeholder:text-slate-400"
                    />
                  </div>
                </>
              )}

              {/* City */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">المحافظة / المدينة</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="مثال: كربلاء المقدسة / بغداد"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-xs text-slate-900 focus:outline-none focus:border-brand-blue placeholder:text-slate-400"
                />
              </div>

              {/* Address */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">العنوان والتفاصيل</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="المنطقة، الحي، الشارع، أقرب نقطة دالة..."
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-xs text-slate-900 focus:outline-none focus:border-brand-blue placeholder:text-slate-400"
                />
              </div>

              {/* Yellow Location GPS Box for Market */}
              {accountType === 'market' && (
                <div className="bg-[#fffbeb] border border-amber-300/80 rounded-2xl p-3.5 text-center space-y-2">
                  <div className="flex items-center justify-center gap-1.5 font-black text-xs text-amber-900">
                    <MapPin className="w-4 h-4 text-amber-600" />
                    <span>موقع الماركت على الخريطة (اختياري)</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    لتسهيل وصول كادر التوصيل وسيارات النقل إلى محلك مباشرة
                  </p>
                  <button
                    type="button"
                    onClick={handleCaptureLocation}
                    className={`w-full py-2 px-4 rounded-xl text-xs font-black shadow-xs transition flex items-center justify-center gap-1.5 ${
                      locationCaptured
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#2563eb] hover:bg-blue-700 text-white'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{locationCaptured ? 'تم حفظ الإحداثيات بنجاح ✓' : 'تحديد الموقع الحالي 📍'}</span>
                  </button>
                </div>
              )}

              {/* Mobile Phone */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">رقم الموبايل *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XXXXXXXXX"
                  dir="ltr"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-xs text-right text-slate-900 focus:outline-none focus:border-brand-blue placeholder:text-slate-400"
                />
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">كلمة السر *</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة سر قوية لحسابك"
                  dir="ltr"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-xs text-right text-slate-900 focus:outline-none focus:border-brand-blue placeholder:text-slate-400 font-mono"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brand-coral hover:bg-brand-coralHover text-white font-black py-3.5 px-4 rounded-xl shadow-md transition text-xs flex items-center justify-center gap-2 mt-2 glow-coral"
              >
                {isLoading
                  ? 'جاري المعالجة...'
                  : accountType === 'wholesale'
                  ? 'تقديم طلب تاجر الجملة 👑'
                  : 'إنشاء الحساب وبدء التسوق 🛍️'}
              </button>
            </form>
          )}

          <div className="text-center text-xs text-slate-600 pt-2 border-t border-slate-100">
            لديك حساب بالفعل؟{' '}
            <Link href={`/login?redirect=${redirect}`} className="text-brand-blue font-bold hover:underline">
              تسجيل الدخول
            </Link>
          </div>

        </div>
      )}

    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-xs text-slate-400">جاري التحميل...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
