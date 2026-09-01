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

    // تحقق إذا كان المستخدم رفض أو ثبّت مسبقاً
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    const installed = localStorage.getItem('pwa_installed');
    if (dismissed || installed) return;

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
    localStorage.setItem('pwa_install_dismissed', 'true');
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

  // نافذة Android / Chrome
  return (
    <div className="fixed bottom-20 left-3 right-3 z-[9999] animate-slideUp">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* شريط علوي ملوّن */}
        <div className="bg-gradient-to-r from-brand-blue to-emerald-600 px-5 py-3 flex items-center justify-between">
          <span className="text-white font-black text-xs">
            🛒 سوق الجملة — التطبيق
          </span>
          <button
            onClick={handleDismiss}
            className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* المحتوى */}
        <div className="p-5 flex items-center gap-4">
          <img
            src="/app-icon.png"
            alt="سوق الجملة"
            className="w-16 h-16 rounded-2xl shadow-md border border-slate-100 shrink-0"
          />

          <div className="flex-1 min-w-0">
            <h3 className="font-black text-slate-900 text-sm">
              📱 ثبّت التطبيق على موبايلك
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              تسوق أسرع • إشعارات فورية • بلا إنترنت
            </p>

            {/* مميزات */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['⚡ سريع', '🔔 إشعارات', '📦 طلباتي', '💾 بدون متجر'].map((f) => (
                <span
                  key={f}
                  className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* أزرار */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 bg-gradient-to-r from-brand-blue to-emerald-600 text-white font-black text-xs py-3 rounded-2xl shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            ثبّت الآن مجاناً
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-3 rounded-2xl transition"
          >
            لاحقاً
          </button>
        </div>
      </div>
    </div>
  );
}
