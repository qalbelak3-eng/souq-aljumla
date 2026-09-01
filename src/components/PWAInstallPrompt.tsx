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
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // تحقق إذا كان التطبيق مثبتاً مسبقاً
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // تحقق إذا كان المستخدم ثبّت التطبيق مسبقاً فقط
    const installed = localStorage.getItem('pwa_installed');
    if (installed) return;

    // كشف iOS
    const ua = window.navigator.userAgent;
    const iosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

    if (iosDevice && isSafari) {
      setIsIOS(true);
      // أظهر النافذة بعد 4 ثوانٍ على iOS
      const timer = setTimeout(() => setShowPrompt(true), 4000);
      return () => clearTimeout(timer);
    }

    // Android / Chrome - انتظر حدث beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // أظهر النافذة بعد 3 ثوانٍ
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // كشف بعد التثبيت
    window.addEventListener('appinstalled', () => {
      localStorage.setItem('pwa_installed', 'true');
      setShowPrompt(false);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('pwa_installed', 'true');
    } else {
      localStorage.setItem('pwa_install_dismissed', 'true');
    }
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
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
          <div className="mt-4 bg-blue-50 rounded-2xl p-3.5 space-y-2.5">
            <p className="text-xs font-black text-slate-800 text-center">
              كيفية التثبيت على iPhone / iPad:
            </p>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0">
                  ١
                </div>
                <span className="text-xs text-slate-700 font-bold flex items-center gap-1.5">
                  اضغط على أيقونة المشاركة
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <Share className="w-3.5 h-3.5 text-blue-500" />
                  </span>
                  في الأسفل
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0">
                  ٢
                </div>
                <span className="text-xs text-slate-700 font-bold flex items-center gap-1.5">
                  اختر
                  <span className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[11px] font-black shadow-sm">
                    <Plus className="w-3 h-3" />
                    Add to Home Screen
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0">
                  ٣
                </div>
                <span className="text-xs text-slate-700 font-bold">
                  اضغط <span className="text-blue-600">Add</span> للتأكيد ✅
                </span>
              </div>
            </div>
          </div>

          {/* زر الفهم */}
          <button
            onClick={handleDismiss}
            className="w-full mt-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs py-2.5 rounded-2xl transition"
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
