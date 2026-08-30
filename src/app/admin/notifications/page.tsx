'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bell,
  Send,
  Users,
  Smartphone,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  MessageCircle,
  Clock,
  ShieldCheck,
  Zap,
  ExternalLink
} from 'lucide-react';
import { PushNotificationLog } from '@/types';
import { useToast } from '@/context/ToastContext';
import { compressImageFile } from '@/lib/imageUtils';

export default function AdminNotificationsPage() {
  const toast = useToast();

  // Stats
  const [stats, setStats] = useState({
    totalSubscribers: 0,
    wholesaleCount: 0,
    marketCount: 0,
    retailCount: 0,
  });
  const [logs, setLogs] = useState<PushNotificationLog[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Form State
  const [title, setTitle] = useState('🔥 عروض وخصومات كبرى في سوق الجملة!');
  const [body, setBody] = useState('تخفيضات حصرية الآن على كراتين الشيبس، السناكات، ومشروبات الطاقة. اطلب الآن واستفد من التوصيل السريع!');
  const [targetAudience, setTargetAudience] = useState<'all' | 'wholesale' | 'market' | 'retail'>('all');
  const [image, setImage] = useState('');
  const [url, setUrl] = useState('/products?filter=offers');
  const [isSending, setIsSending] = useState(false);

  const fetchStatsAndLogs = () => {
    setIsLoadingStats(true);
    Promise.all([
      fetch('/api/notifications/subscribe').then((r) => r.json()),
      fetch('/api/notifications/send').then((r) => r.json()),
    ])
      .then(([subData, sendData]) => {
        if (subData.success) {
          setStats({
            totalSubscribers: subData.totalSubscribers || 0,
            wholesaleCount: subData.wholesaleCount || 0,
            marketCount: subData.marketCount || 0,
            retailCount: subData.retailCount || 0,
          });
        }
        if (sendData.success && Array.isArray(sendData.logs)) {
          setLogs(sendData.logs);
        }
        setIsLoadingStats(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoadingStats(false);
      });
  };

  useEffect(() => {
    fetchStatsAndLogs();
  }, []);

  const [isSentSuccess, setIsSentSuccess] = useState(false);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.showToast('يرجى كتابة عنوان وتفاصيل رسالة التنبيه', 'error');
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          image: image.trim() || undefined,
          url: url.trim() || '/',
          targetAudience,
          sentBy: 'المدير العام',
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.showToast(data.message || 'تم إرسال التنبيه لهواتف المشتركين بنجاح! 🚀🔔', 'success');
        
        // Reset form fields
        setTitle('');
        setBody('');
        setImage('');
        setUrl('/products?filter=offers');
        
        // Show success state on button temporarily
        setIsSentSuccess(true);
        setTimeout(() => setIsSentSuccess(false), 3500);

        // Immediate update of table
        fetchStatsAndLogs();
      } else {
        toast.showToast(data.error || 'حدث خطأ أثناء إرسال الإشعار', 'error');
      }
    } catch (err: any) {
      console.error(err);
      toast.showToast('فشل الاتصال بالخادم', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const getTargetAudienceCount = () => {
    if (targetAudience === 'all') return stats.totalSubscribers;
    if (targetAudience === 'wholesale') return stats.wholesaleCount;
    if (targetAudience === 'market') return stats.marketCount;
    if (targetAudience === 'retail') return stats.retailCount;
    return stats.totalSubscribers;
  };

  return (
    <div className="space-y-6 text-xs select-none" dir="rtl">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-brand-blue text-white p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black">
              <Bell className="w-5 h-5" />
            </div>
            <h1 className="text-base sm:text-lg font-black tracking-tight">
              📢 إرسال إشعارات وتنبيهات مباشرة لهواتف الزبائن والتجار
            </h1>
          </div>
          <p className="text-xs text-sky-100/80 mt-1 max-w-xl leading-relaxed">
            يصل التنبيه بصوت واهتزاز إلى شاشات هواتف الزبائن وأجهزة الكمبيوتر مباشرة حتى عند قفل الشاشة أو إغلاق المتجر!
          </p>
        </div>

        <button
          type="button"
          onClick={fetchStatsAndLogs}
          className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs py-2 px-3 rounded-xl transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin' : ''}`} />
          <span>تحديث الإحصائيات 🔄</span>
        </button>
      </div>

      {/* Audience Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        
        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">👥 إجمالي الأجهزة المشتركة</span>
          <div className="text-xl font-black text-slate-900 font-mono">
            {stats.totalSubscribers.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-emerald-600 font-bold">جاهزون للاستقبال فوراً</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">👑 هواتف تجار الجملة</span>
          <div className="text-xl font-black text-purple-700 font-mono">
            {stats.wholesaleCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-slate-400 font-bold">أصحاب الطلبيات الكبرى</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">🏪 هواتف أصحاب الماركتات</span>
          <div className="text-xl font-black text-brand-blue font-mono">
            {stats.marketCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-slate-400 font-bold">المحلات والمتاجر التجارية</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">🛍️ زبائن المفرد والزوار</span>
          <div className="text-xl font-black text-emerald-600 font-mono">
            {stats.retailCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-slate-400 font-bold">العملاء والطلبات المنزلية</span>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Send Form */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-5">
          
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <span>✍️ إنشاء وإرسال إشعار فوري جديد</span>
              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {getTargetAudienceCount()} جهاز مستهدف
              </span>
            </h2>
          </div>

          <form onSubmit={handleSendNotification} className="space-y-4">
            
            {/* Target Audience Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">الفئة المستهدفة للإشعار *:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                
                <button
                  type="button"
                  onClick={() => setTargetAudience('all')}
                  className={`py-2 px-3 rounded-2xl font-black text-xs transition border cursor-pointer ${
                    targetAudience === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  👥 للجميع ({stats.totalSubscribers})
                </button>

                <button
                  type="button"
                  onClick={() => setTargetAudience('wholesale')}
                  className={`py-2 px-3 rounded-2xl font-black text-xs transition border cursor-pointer ${
                    targetAudience === 'wholesale'
                      ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  👑 تجار الجملة ({stats.wholesaleCount})
                </button>

                <button
                  type="button"
                  onClick={() => setTargetAudience('market')}
                  className={`py-2 px-3 rounded-2xl font-black text-xs transition border cursor-pointer ${
                    targetAudience === 'market'
                      ? 'bg-brand-blue text-white border-brand-blue shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  🏪 الماركتات ({stats.marketCount})
                </button>

                <button
                  type="button"
                  onClick={() => setTargetAudience('retail')}
                  className={`py-2 px-3 rounded-2xl font-black text-xs transition border cursor-pointer ${
                    targetAudience === 'retail'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  🛍️ المفرد ({stats.retailCount})
                </button>

              </div>
            </div>

            {/* Notification Title */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 block">عنوان الإشعار *:</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: 🔥 عروض الجمعة الكبرى - خصم 20% على كراتين الشيبس"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue focus:outline-none"
              />
            </div>

            {/* Notification Body / Message */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 block">نص وتفاصيل الإشعار *:</label>
              <textarea
                required
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="اكتب تفاصيل العرض أو الرسالة التي ستصل للزبون على شاشة هاتفه..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-900 focus:bg-white focus:border-brand-blue focus:outline-none"
              />
            </div>

            {/* Destination URL */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 block">رابط الوجهة عند ضغط الزبون على الإشعار:</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="مثال: /products?filter=offers أو /products?category=مشروبات"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-brand-blue focus:outline-none"
                dir="ltr"
              />
              <span className="text-[10px] text-slate-400 block">
                عند النقر على الإشعار، يفتح المتجر وينقل الزبون مباشرة إلى هذا الرابط
              </span>
            </div>

            {/* Image (Optional) */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">صورة العرض الترويجي المرفقة (اختياري):</label>
                {image && (
                  <button
                    type="button"
                    onClick={() => setImage('')}
                    className="text-red-600 font-bold text-[10px] hover:underline cursor-pointer"
                  >
                    إزالة الصورة
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="bg-brand-blue hover:bg-brand-blueDark text-white px-4 py-2 rounded-xl font-black text-xs cursor-pointer shadow-xs transition flex items-center gap-2 shrink-0">
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
                          const base64 = await compressImageFile(file, 800, 500, 0.85);
                          setImage(base64);
                          toast.showToast('تم رفع صورة الإشعار بنجاح ✅', 'success');
                        } catch {
                          const reader = new FileReader();
                          reader.onload = () => {
                            setImage(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }
                    }}
                  />
                </label>

                <input
                  type="text"
                  value={image.startsWith('data:') ? '✅ تم رفع الصورة من جهازك' : image}
                  onChange={(e) => {
                    if (!image.startsWith('data:')) setImage(e.target.value);
                  }}
                  readOnly={image.startsWith('data:')}
                  placeholder="أو الصق رابط صورة (https://...)"
                  className="flex-1 bg-white border border-slate-200 rounded-xl py-2 px-3 text-[11px] font-mono text-slate-800"
                  dir="ltr"
                />
              </div>

              {image && (
                <div className="relative aspect-[16/9] max-w-[220px] rounded-xl overflow-hidden border border-slate-300 bg-slate-100 shadow-xs mt-2">
                  <img src={image} alt="معاينة" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSending || isSentSuccess}
                className={`w-full text-white font-black py-3.5 px-4 rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer text-xs ${
                  isSentSuccess
                    ? 'bg-emerald-600 scale-[0.99]'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-98 disabled:opacity-50'
                }`}
              >
                {isSentSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white animate-bounce" />
                    <span>تم إرسال التنبيه للأجهزة بنجاح ✅</span>
                  </>
                ) : isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-white animate-spin" />
                    <span>جاري إرسال التنبيهات للأجهزة...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>🚀 إرسال التنبيه الآن لـ ({getTargetAudienceCount()}) جهاز</span>
                  </>
                )}
              </button>
            </div>

          </form>

        </div>

        {/* Live Phone Mockup Preview & Tips */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Phone Lockscreen Preview */}
          <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-sky-400" />
                <span>معاينة الإشعار على شاشة قفل هاتف الزبون</span>
              </span>
              <span className="text-[10px] text-amber-400 font-mono">الآن</span>
            </div>

            {/* Lockscreen Notification Box */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-3.5 shadow-lg backdrop-blur-md space-y-2">
              
              <div className="flex items-center justify-between text-[10px] text-slate-300">
                <div className="flex items-center gap-1.5 font-bold">
                  <img src="/app-icon.png" alt="Icon" className="w-4 h-4 rounded-full" />
                  <span className="text-white">سوق الجملة 🇮🇶</span>
                </div>
                <span>الآن</span>
              </div>

              <div>
                <h4 className="font-black text-xs text-white leading-tight">
                  {title || 'عنوان التنبيه'}
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed line-clamp-2">
                  {body || 'نص رسالة الإشعار وتفاصيل العرض...'}
                </p>
              </div>

              {image && (
                <div className="aspect-[16/9] w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-700 mt-2">
                  <img src={image} alt="صورة الإشعار" className="w-full h-full object-cover" />
                </div>
              )}

            </div>

            <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-3 text-[11px] text-sky-200 leading-relaxed font-bold space-y-1">
              <p>💡 <strong className="text-white">كيف يعمل؟</strong> عند إرسال الإشعار، يرن هاتف الزبون ويهتز ويظهر التنبيه على شاشته حتى لو كان الهاتف مقفلاً أو المتصفح مغلقاً.</p>
            </div>

          </div>

          {/* Quick WhatsApp Broadcast Generator */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-3">
            <h3 className="font-black text-slate-900 text-xs flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>مشاركة نص الإشعار كرسالة واتساب جماعية 💬</span>
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              يمكنك أيضاً نسخ النص ومشاركته مباشرة في مجموعات وقنوات التجار والماركتات على واتساب وتيليجرام.
            </p>
            <button
              type="button"
              onClick={() => {
                const text = `📢 *${title}*\n\n${body}\n\n🛒 *للتسوق ومشاهدة العرض:* https://souq-aljumla.iq${url}`;
                navigator.clipboard.writeText(text);
                toast.showToast('تم نسخ نص الإشعار والروابط بنجاح! جاهز للصق على واتساب 📋✅', 'success');
              }}
              className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-xs py-2.5 px-4 rounded-xl border border-emerald-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>نسخ الرسالة كاملة للواتساب 📋</span>
            </button>
          </div>

        </div>

      </div>

      {/* Previous Notification Logs Table */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4">
        
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
            <span>📜 سجل الإشعارات والتنبيهات المرسلة سابقاً</span>
            <span className="text-xs text-slate-400 font-bold">({logs.length})</span>
          </h3>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs font-bold">
            لم يتم إرسال أي إشعارات سابقة حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                  <th className="py-2.5 px-3">التاريخ والوقت</th>
                  <th className="py-2.5 px-3">عنوان الإشعار</th>
                  <th className="py-2.5 px-3">الفئة المستهدفة</th>
                  <th className="py-2.5 px-3 text-center">الأجهزة المستلمة</th>
                  <th className="py-2.5 px-3">المرسل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('ar-IQ')}
                    </td>
                    <td className="py-3 px-3 font-black text-slate-900 max-w-xs truncate" title={log.title}>
                      {log.title}
                    </td>
                    <td className="py-3 px-3">
                      <span className="bg-slate-100 text-slate-700 font-bold text-[10px] px-2 py-0.5 rounded-full">
                        {log.targetAudienceLabel || log.targetAudience}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-black text-emerald-600">
                      ✅ {log.successCount} / {log.sentCount}
                    </td>
                    <td className="py-3 px-3 text-slate-500 text-[11px]">
                      {log.sentBy || 'المدير'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
}
