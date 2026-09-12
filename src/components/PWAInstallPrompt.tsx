'use client';

import { useEffect, useState } from 'react';
import { X, Download, Share, Plus } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showDesktopTip, setShowDesktopTip] = useState(false);

  useEffect(() => {
    // تحقق إذا كان التطبيق مثبتاً مسبقاً
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone || localStorage.getItem('pwa_installed') === 'true') {
      setIsInstalled(true);
      return;
    }

    if (sessionStorage.getItem('pwa_dismissed_session') === 'true') {
      return;
    }

    // كشف نوع الجهاز
    const ua = window.navigator.userAgent;
    const isAndroidDevice = /android/i.test(ua);
    setIsAndroid(isAndroidDevice);

    const isWindowsOrPC =
      /windows|win32|win64|linux/i.test(ua) ||
      /Win32|Win64|MacIntel|Linux/i.test(navigator.platform || '') ||
      Boolean((window as any).chrome);

    // كشف iOS: فقط لأجهزة آبل الحقيقية
    const isRealIOS =
      !isWindowsOrPC &&
      /iPad|iPhone|iPod/.test(ua) &&
      !(window as any).MSStream &&
      !('userAgentData' in navigator) &&
      /^((?!chrome|android).)*safari/i.test(ua);

    if (isRealIOS) {
      setIsIOS(true);
      // أظهر النافذة الإرشادية لـ iOS بعد 3.5 ثوانٍ
      const timer = setTimeout(() => setShowPrompt(true), 3500);
      return () => clearTimeout(timer);
    }

    // Android / Chrome / Edge / PC Desktop:
    // 1. تحقق أولاً إذا تم التقاط الحدث مسبقاً في head script
    const existingPrompt = (window as any).deferredPWAInstallPrompt;
    if (existingPrompt) {
      setDeferredPrompt(existingPrompt);
      const timer = setTimeout(() => setShowPrompt(true), 2000);
      return () => clearTimeout(timer);
    }

    // 2. الاستماع لحدث beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPWAInstallPrompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowPrompt(true), 2000);
    };

    // 3. الاستماع للحدث المخصص عند التقاطه عبر head
    const handlePromptReady = () => {
      if ((window as any).deferredPWAInstallPrompt) {
        setDeferredPrompt((window as any).deferredPWAInstallPrompt);
        setTimeout(() => setShowPrompt(true), 2000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('pwa-prompt-ready', handlePromptReady);

    // مراقبة بعد إتمام التثبيت بنجاح
    const handleAppInstalled = () => {
      localStorage.setItem('pwa_installed', 'true');
      setShowPrompt(false);
      setDeferredPrompt(null);
      (window as any).deferredPWAInstallPrompt = null;
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('pwa-prompt-ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const promptEvent = deferredPrompt || (window as any).deferredPWAInstallPrompt;
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choiceResult = await promptEvent.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
          localStorage.setItem('pwa_installed', 'true');
          setShowPrompt(false);
        } else {
          sessionStorage.setItem('pwa_dismissed_session', 'true');
          setShowPrompt(false);
        }
        setDeferredPrompt(null);
        (window as any).deferredPWAInstallPrompt = null;
      } catch (err) {
        console.warn('Install prompt error:', err);
        setShowDesktopTip(true);
      }
    } else {
      setShowDesktopTip(true);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwa_dismissed_session', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt || isInstalled) return null;

  // نافذة iOS
  if (isIOS) {
    return (
      <div className="fixed bottom-20 left-3 right-3 z-[9999] animate-slideUp">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-5 relative">
          {/* زر الإغلاق */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 left-3 w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>

          {/* المحتوى */}
          <div className="flex items-start gap-4">
            {/* أيقونة التطبيق */}
            <img
              src="/app-icon.png"
              alt="سوق الجملة"
              className="w-16 h-16 rounded-2xl shadow-md border border-slate-100 shrink-0"
            />

            <div className="flex-1 min-w-0">
              <h3 className="font-black text-slate-900 text-sm leading-tight">
                📱 ثبّت تطبيق سوق الجملة
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                احصل على تجربة أسرع، إشعارات فورية، وتسوق بلا انقطاع!
              </p>
            </div>
          </div>

          {/* تعليمات iOS */}
          <div className="mt-4 bg-blue-50/80 border border-blue-200/80 rounded-2xl p-3.5 space-y-3">
            <p className="text-xs font-black text-slate-800 text-center">
              طريقة التثبيت على أجهزة iPhone / iPad 🍏:
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
                  ١
                </div>
                <span className="text-slate-800 font-bold flex items-center gap-1.5 flex-wrap">
                  اضغط على زر المشاركة
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-white rounded-lg border border-slate-200 shadow-xs">
                    <Share className="w-3.5 h-3.5 text-blue-600" />
                  </span>
                  في أسفل شاشة المتصفح
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
                  ٢
                </div>
                <div className="space-y-1">
                  <span className="text-slate-800 font-bold flex items-center gap-1.5 flex-wrap">
                    اختر
                    <span className="inline-flex items-center gap-1 bg-white border border-blue-300 text-blue-950 rounded-lg px-2 py-1 text-xs font-black shadow-xs">
                      <Plus className="w-3.5 h-3.5 text-blue-600" />
                      <span>إضافة إلى الصفحة الرئيسية ➕</span>
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium block">
                    (أو إذا كان جهازك بالإنجليزية: <strong>Add to Home Screen</strong>)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0 shadow-xs">
                  ٣
                </div>
                <span className="text-slate-800 font-bold">
                  اضغط <span className="text-blue-700 font-black">إضافة (Add)</span> في الزاوية العلوية ✅
                </span>
              </div>
            </div>
          </div>

          {/* زر الفهم */}
          <button
            onClick={handleDismiss}
            className="w-full mt-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs py-2.5 rounded-2xl transition cursor-pointer"
          >
            فهمت، شكراً! 👍
          </button>
        </div>

        {/* السهم التوجيهي نحو الأسفل */}
        <div className="flex justify-center mt-2">
          <div className="w-5 h-5 bg-white rotate-45 shadow-md border-b border-r border-slate-100" />
        </div>
      </div>
    );
  }

  // نافذة Android / Chrome / Desktop الحديثة الفاخرة
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center sm:items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative animate-slideUp">
        
        {/* خلفية جمالية علوية بتدرج فخم */}
        <div className="bg-gradient-to-br from-brand-blue via-emerald-600 to-teal-700 p-6 text-white text-center relative overflow-hidden">
          {/* زخرفة دائرية في الخلفية */}
          <div className="absolute -right-8 -top-8 w-28 h-28 bg-white/10 rounded-full blur-lg pointer-events-none" />
          <div className="absolute -left-8 -bottom-8 w-28 h-28 bg-black/10 rounded-full blur-lg pointer-events-none" />

          {/* زر الإغلاق */}
          <button
            onClick={handleDismiss}
            className="absolute top-3.5 left-3.5 w-8 h-8 bg-black/20 hover:bg-black/30 text-white rounded-full flex items-center justify-center transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>

          {/* لوجو التطبيق مع تأثير توهج */}
          <div className="relative inline-block mb-3">
            <div className="w-20 h-20 mx-auto bg-white rounded-2xl shadow-xl p-1.5 ring-4 ring-white/20">
              <img
                src="/app-icon.png"
                alt="سوق الجملة"
                className="w-full h-full object-contain rounded-xl"
              />
            </div>
            <span className="absolute -bottom-2 right-1/2 translate-x-1/2 bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
              تطبيق رسمي 🇮🇶
            </span>
          </div>

          <h3 className="font-black text-lg text-white mt-2">
            ثبّت تطبيق سوق الجملة
          </h3>
          <p className="text-xs text-emerald-100 font-medium mt-1">
            تسوق أسرع بالدينار العراقي وبدون الحاجة لفتح المتصفح كل مرة!
          </p>
        </div>

        {/* مميزات التطبيق المباشرة */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xs shrink-0">
                ⚡
              </div>
              <div>
                <span className="text-[11px] font-black text-slate-800 block leading-tight">تصفح فائق السرعة</span>
                <span className="text-[9px] text-slate-500 font-medium">فتح فوري بلمسة واحدة</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xs shrink-0">
                🔔
              </div>
              <div>
                <span className="text-[11px] font-black text-slate-800 block leading-tight">إشعارات لحظية</span>
                <span className="text-[9px] text-slate-500 font-medium">تنبيهات العروض والطلبات</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs shrink-0">
                📍
              </div>
              <div>
                <span className="text-[11px] font-black text-slate-800 block leading-tight">تتبع GPS دقيق</span>
                <span className="text-[9px] text-slate-500 font-medium">حساب كروة دقيق للمندوب</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xs shrink-0">
                💾
              </div>
              <div>
                <span className="text-[11px] font-black text-slate-800 block leading-tight">حجم صغير جداً</span>
                <span className="text-[9px] text-slate-500 font-medium">أقل من 1 ميجابايت</span>
              </div>
            </div>
          </div>

          {/* أزرار الإجراءات */}
          <div className="space-y-2 pt-1">
            {showDesktopTip && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3 text-xs space-y-1.5 animate-fadeIn">
                <div className="font-black flex items-center gap-1.5">
                  <span>{isAndroid ? '📲 طريقة التثبيت على أجهزة أندرويد:' : '💻 طريقة التثبيت على الكمبيوتر:'}</span>
                </div>
                {isAndroid ? (
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    اضغط على قائمة خيارات المتصفح (<strong>⋮ الثلاث نقاط</strong>) في زاوية الشاشة، ثم اختر <strong>&quot;تثبيت التطبيق&quot;</strong> أو <strong>&quot;إضافة إلى الشاشة الرئيسية&quot;</strong> (Add to Home Screen).
                  </p>
                ) : (
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    اضغط على أيقونة التثبيت (🖥️ أو ⬇️) الموجودة في <strong>شريط عنوان المتصفح بالأعلى</strong>، أو من قائمة خيارات المتصفح (⋮) ثم اختر <strong>&quot;تثبيت سوق الجملة&quot;</strong>.
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleInstall}
              className="w-full bg-gradient-to-r from-brand-blue via-emerald-600 to-teal-600 hover:opacity-95 text-white font-black text-xs py-3.5 px-4 rounded-2xl shadow-lg shadow-emerald-700/20 transition flex items-center justify-center gap-2 cursor-pointer transform active:scale-98"
            >
              <Download className="w-4 h-4" />
              <span>تثبيت التطبيق على الجهاز الآن 📲</span>
            </button>

            <button
              onClick={handleDismiss}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2.5 rounded-2xl transition cursor-pointer"
            >
              المتابعة عبر المتصفح مؤقتاً
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
