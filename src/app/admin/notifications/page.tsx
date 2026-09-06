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
  ExternalLink,
  Trash2,
  Hourglass,
  Calendar
} from 'lucide-react';
import { PushNotificationLog, NotificationTargetAudience } from '@/types';
import { useToast } from '@/context/ToastContext';
import { compressImageFile } from '@/lib/imageUtils';

export default function AdminNotificationsPage() {
  const toast = useToast();

  // Stats for 8 Smart Audience Segments
  const [stats, setStats] = useState({
    totalSubscribers: 0,
    wholesaleCount: 0,
    marketCount: 0,
    retailCount: 0,
    registeredNoOrdersCount: 0,
    inactive30dCount: 0,
    fewOrdersCount: 0,
    activeVipCount: 0,
  });
  const [logs, setLogs] = useState<PushNotificationLog[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Form State
  const [title, setTitle] = useState('🔥 عروض وخصومات كبرى في سوق الجملة!');
  const [body, setBody] = useState('تخفيضات حصرية الآن على كراتين الشيبس، السناكات، ومشروبات الطاقة. اطلب الآن واستفد من التوصيل السريع!');
  const [targetAudience, setTargetAudience] = useState<NotificationTargetAudience>('all');
  const [image, setImage] = useState('');
  const [url, setUrl] = useState('/products?filter=offers');
  const [expiryHours, setExpiryHours] = useState<number>(24); // افتراضياً 24 ساعة للعروض اليومية
  const [expiryMode, setExpiryMode] = useState<'preset' | 'custom_hours' | 'custom_date'>('preset');
  const [customHours, setCustomHours] = useState<string>('12');
  const [customDate, setCustomDate] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
            registeredNoOrdersCount: subData.registeredNoOrdersCount || 0,
            inactive30dCount: subData.inactive30dCount || 0,
            fewOrdersCount: subData.fewOrdersCount || 0,
            activeVipCount: subData.activeVipCount || 0,
          });
        }
        if (sendData.success && Array.isArray(sendData.logs)) {
          setLogs(sendData.logs);
          if (typeof window !== 'undefined') {
            localStorage.setItem('souq_admin_push_logs', JSON.stringify(sendData.logs));
            localStorage.setItem('souq_saved_notifications', JSON.stringify(sendData.logs));
          }
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
      let finalExpiryHours = 0;
      let finalExpiresAt: string | undefined = undefined;

      if (expiryMode === 'preset') {
        finalExpiryHours = Number(expiryHours) || 0;
      } else if (expiryMode === 'custom_hours') {
        finalExpiryHours = Math.max(1, Number(customHours) || 1);
      } else if (expiryMode === 'custom_date' && customDate) {
        const targetDate = new Date(customDate);
        const diffMs = targetDate.getTime() - Date.now();
        if (diffMs > 0) {
          finalExpiryHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
          finalExpiresAt = targetDate.toISOString();
        } else {
          toast.showToast('يرجى اختيار تاريخ ووقت مستقبلي لانتهاء العرض', 'error');
          setIsSending(false);
          return;
        }
      }

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
          expiryHours: finalExpiryHours,
          expiresAt: finalExpiresAt,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.showToast(data.message || 'تم إرسال التنبيه لهواتف المشتركين بنجاح! 🚀🔔', 'success');
        
        // Add log immediately to state & localStorage
        if (data.result?.log) {
          setLogs((prev) => {
            const updated = [data.result.log, ...prev.filter(p => p.id !== data.result.log.id)];
            if (typeof window !== 'undefined') {
              localStorage.setItem('souq_admin_push_logs', JSON.stringify(updated));
              localStorage.setItem('souq_saved_notifications', JSON.stringify(updated));
            }
            return updated;
          });
        }

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

  const [isClearingAll, setIsClearingAll] = useState(false);

  const handleDeleteNotification = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك بحذف هذا الإشعار من السجل؟')) {
      return;
    }

    setDeletingId(id);
    try {
      await fetch(`/api/notifications/send?id=${id}`, {
        method: 'DELETE',
      });
      
      toast.showToast('تم حذف الإشعار من السجل بنجاح 🗑️', 'success');
      setLogs((prev) => {
        const updated = prev.filter((item) => item.id !== id);
        if (typeof window !== 'undefined') {
          localStorage.setItem('souq_admin_push_logs', JSON.stringify(updated));
          localStorage.setItem('souq_saved_notifications', JSON.stringify(updated));
        }
        return updated;
      });
    } catch (err) {
      console.error(err);
      toast.showToast('حدث خطأ أثناء الاتصال بالخادم', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAllNotifications = async () => {
    if (!window.confirm('هل أنت متأكد من مسح وتنظيف سجل الإشعارات بالكامل؟ لا يمكن التراجع عن هذه العملية.')) {
      return;
    }

    setIsClearingAll(true);
    try {
      await fetch('/api/notifications/send?clearAll=true', {
        method: 'DELETE',
      });
      toast.showToast('تم مسح سجل الإشعارات بالكامل بنجاح 🗑️✨', 'success');
      setLogs([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('souq_admin_push_logs');
        localStorage.removeItem('souq_saved_notifications');
      }
    } catch (e) {
      console.error(e);
      toast.showToast('حدث خطأ أثناء مسح السجل', 'error');
    } finally {
      setIsClearingAll(false);
    }
  };

  const getTargetAudienceCount = () => {
    if (targetAudience === 'all') return stats.totalSubscribers;
    if (targetAudience === 'wholesale') return stats.wholesaleCount;
    if (targetAudience === 'market') return stats.marketCount;
    if (targetAudience === 'retail') return stats.retailCount;
    if (targetAudience === 'registered_no_orders') return stats.registeredNoOrdersCount;
    if (targetAudience === 'inactive_30d') return stats.inactive30dCount;
    if (targetAudience === 'few_orders') return stats.fewOrdersCount;
    if (targetAudience === 'active_vip') return stats.activeVipCount;
    return stats.totalSubscribers;
  };

  // Quick Marketing Templates
  const campaignTemplates = [
    {
      id: 'tmpl-abandoned-cart',
      icon: '🛒',
      name: 'تذكير السلة المتروكة',
      desc: 'ناسي المسواك بالسلة',
      targetAudience: 'all' as NotificationTargetAudience,
      title: '🛒 ناسي المسواك بالسّلة ..',
      body: 'كمّل الطلب وخلّي المسواك يوصلك وين متكون 📦✨',
      url: '/cart',
    },
    {
      id: 'tmpl-new',
      icon: '👶',
      name: 'ترحيب بالمسجلين الجدد',
      desc: 'لم يطلبوا بعد (0 طلبات)',
      targetAudience: 'registered_no_orders' as NotificationTargetAudience,
      title: '🎁 أهلاً بك! هدية توصيل مجاني على أول طلبية لك اليوم 🚚',
      body: 'استخدم كود: FIRST عند الشراء واستمتع بأفضل الأسعار والتوصيل السريع لبيتك أو محلك!',
      url: '/products?filter=offers',
    },
    {
      id: 'tmpl-miss-you',
      icon: '💔',
      name: 'حملة اشتقتنا لك',
      desc: 'انقطعوا عن الشراء (14+ يوم)',
      targetAudience: 'inactive_30d' as NotificationTargetAudience,
      title: 'مشتاقين لك يا غالي! أضفنا هدية في رصيد أرباحك ✨',
      body: 'وصلت بضاعة جديدة وتخفيضات جملة ومفرد مميزة بانتظارك. افتح التطبيق واطلب الآن!',
      url: '/products',
    },
    {
      id: 'tmpl-few',
      icon: '📦',
      name: 'تنشيط قليلي الطلبات',
      desc: 'طلبوا 1 أو 2 مرات',
      targetAudience: 'few_orders' as NotificationTargetAudience,
      title: '🔥 عروض كراتين وسناكات حصرية بأسعار الجملة المباشرة!',
      body: 'نوفر لك تشكيلة واسعة من المواد الغذائية والسناكات بهوامش ربح ممتازة مع توصيل فوري.',
      url: '/products?filter=offers',
    },
    {
      id: 'tmpl-wheel',
      icon: '🎡',
      name: 'تذكير چرخ الحظ',
      desc: 'لجميع المشتركين',
      targetAudience: 'all' as NotificationTargetAudience,
      title: '🎡 لفة مجانية بانتظارك اليوم في چرخ الحظ!',
      body: 'دوّر العجلة الآن واربح رصيد أرباح كاش أو كوبونات خصم وتوصيل مجاني فوري 🎁',
      url: '/',
    },
    {
      id: 'tmpl-vip',
      icon: '👑',
      name: 'عروض كبار التجار VIP',
      desc: 'تجار الجملة والموزعين',
      targetAudience: 'wholesale' as NotificationTargetAudience,
      title: '👑 كبار تجار الجملة: عروض أسعار خاصة وتوريد كراتين ضخم',
      body: 'تم تحديث قائمة أسعار VIP وتوفير كميات جديدة بأفضل هوامش ربح لمحلك ومستودعك.',
      url: '/products',
    },
  ];

  const handleApplyTemplate = (tmpl: typeof campaignTemplates[0]) => {
    setTitle(tmpl.title);
    setBody(tmpl.body);
    setTargetAudience(tmpl.targetAudience);
    setUrl(tmpl.url);
    toast.showToast(`تم اختيار نموذج (${tmpl.name}) بنجاح ✨`, 'success');
  };

  return (
    <div className="space-y-6 text-xs select-none" dir="rtl">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-brand-blue text-white p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black">
              🔔
            </div>
            <span className="bg-white/10 text-amber-300 font-bold px-3 py-1 rounded-full text-[10px] border border-white/10">
              إشعارات المتجر وإعادة الاستهداف الذكي 🎯
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-2">نظام الإشعارات اللحظية وحملات الاستهداف الذكية</h1>
          <p className="text-slate-300 text-xs mt-1 max-w-xl">
            أرسل إشعارات مخصصة بحسب سلوك الزبائن (المسجلين الجدد، الخاملين، كبار التجار، أصحاب الماركتات) لتنشيط المبيعات فوراً!
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

      {/* 8 Smart Audience Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        
        <div className="bg-white p-3.5 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">👥 إجمالي الأجهزة المشتركة</span>
          <div className="text-lg font-black text-slate-900 font-mono">
            {stats.totalSubscribers.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-emerald-600 font-bold">جاهزون للاستقبال فوراً</span>
        </div>

        <div className="bg-white p-3.5 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">👶 مسجلين بدون أي طلبية</span>
          <div className="text-lg font-black text-amber-600 font-mono">
            {stats.registeredNoOrdersCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-amber-700 font-bold">فرصة أول طلبية 🎯</span>
        </div>

        <div className="bg-white p-3.5 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">💔 زبائن خاملين (14+ يوم)</span>
          <div className="text-lg font-black text-rose-600 font-mono">
            {stats.inactive30dCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-rose-700 font-bold">بحاجة لتنشيط فوري</span>
        </div>

        <div className="bg-white p-3.5 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">📦 زبائن قليلين (1-2 طلب)</span>
          <div className="text-lg font-black text-indigo-600 font-mono">
            {stats.fewOrdersCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-indigo-700 font-bold">فرصة تكرار الشراء</span>
        </div>

        <div className="bg-white p-3.5 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">🌟 الزبائن النشطين VIP</span>
          <div className="text-lg font-black text-emerald-700 font-mono">
            {stats.activeVipCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-emerald-600 font-bold">الأكثر ولاءً وطلباً</span>
        </div>

        <div className="bg-white p-3.5 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">👑 كبار تجار الجملة</span>
          <div className="text-lg font-black text-purple-700 font-mono">
            {stats.wholesaleCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-purple-600 font-bold">أصحاب طلبيات الكرتون</span>
        </div>

        <div className="bg-white p-3.5 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">🏪 أصحاب الماركتات</span>
          <div className="text-lg font-black text-brand-blue font-mono">
            {stats.marketCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-blue-600 font-bold">المحلات والمتاجر</span>
        </div>

        <div className="bg-white p-3.5 rounded-3xl border border-slate-100 shadow-xs space-y-1">
          <span className="text-[10px] text-slate-400 font-bold block">🛍️ زبائن المفرد والزوار</span>
          <div className="text-lg font-black text-slate-800 font-mono">
            {stats.retailCount.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] text-slate-500 font-bold">العملاء والطلبات المنزلية</span>
        </div>

      </div>

      {/* Quick Marketing Campaign Templates Bar */}
      <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-300/80 p-4 rounded-3xl space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-black text-amber-950 text-xs flex items-center gap-1.5">
            <span>⚡ نماذج حملات تسويقية جاهزة ومجربة (اضغط لتعبئة الإشعار فوراً):</span>
          </span>
          <span className="text-[10px] text-amber-800 font-bold">توفير الوقت وزيادة التفاعل 🚀</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {campaignTemplates.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => handleApplyTemplate(tmpl)}
              className="bg-white hover:bg-amber-50/80 border border-amber-200 p-2.5 rounded-2xl text-right transition shadow-2xs hover:shadow-xs group cursor-pointer space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-base">{tmpl.icon}</span>
                <span className="text-[9px] font-black bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded-md">
                  اختر القالب ✍️
                </span>
              </div>
              <span className="font-black text-slate-900 text-[11px] block line-clamp-1 group-hover:text-amber-800">
                {tmpl.name}
              </span>
              <span className="text-[9px] text-slate-500 font-medium block line-clamp-1">
                {tmpl.desc}
              </span>
            </button>
          ))}
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
            
            {/* Target Audience Selector (8 Smart Segments) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">الفئة والشريحة المستهدفة للإشعار *:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                
                <button
                  type="button"
                  onClick={() => setTargetAudience('all')}
                  className={`py-2 px-2.5 rounded-2xl font-black text-xs transition border cursor-pointer text-center ${
                    targetAudience === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  👥 للجميع ({stats.totalSubscribers})
                </button>

                <button
                  type="button"
                  onClick={() => setTargetAudience('registered_no_orders')}
                  className={`py-2 px-2.5 rounded-2xl font-black text-xs transition border cursor-pointer text-center ${
                    targetAudience === 'registered_no_orders'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  👶 مسجلين جدد ({stats.registeredNoOrdersCount})
                </button>

                <button
                  type="button"
                  onClick={() => setTargetAudience('inactive_30d')}
                  className={`py-2 px-2.5 rounded-2xl font-black text-xs transition border cursor-pointer text-center ${
                    targetAudience === 'inactive_30d'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  💔 خاملين 14+ يوم ({stats.inactive30dCount})
                </button>

                <button
                  type="button"
                  onClick={() => setTargetAudience('few_orders')}
                  className={`py-2 px-2.5 rounded-2xl font-black text-xs transition border cursor-pointer text-center ${
                    targetAudience === 'few_orders'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  📦 قليلي الطلبات ({stats.fewOrdersCount})
                </button>

                <button
                  type="button"
                  onClick={() => setTargetAudience('active_vip')}
                  className={`py-2 px-2.5 rounded-2xl font-black text-xs transition border cursor-pointer text-center ${
                    targetAudience === 'active_vip'
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  🌟 النشطين VIP ({stats.activeVipCount})
                </button>

                <button
                  type="button"
                  onClick={() => setTargetAudience('wholesale')}
                  className={`py-2 px-2.5 rounded-2xl font-black text-xs transition border cursor-pointer text-center ${
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
                  className={`py-2 px-2.5 rounded-2xl font-black text-xs transition border cursor-pointer text-center ${
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
                  className={`py-2 px-2.5 rounded-2xl font-black text-xs transition border cursor-pointer text-center ${
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

            {/* Notification Expiry / Duration Options */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <label className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Hourglass className="w-4 h-4 text-amber-600" />
                  <span>مدة صلاحية الإشعار / وقت انتهاء العرض ⏳</span>
                </label>
                <span className="text-[10px] text-slate-500 font-bold">
                  يختفي تلقائياً من هواتف الزبائن بعد انتهاء المدة
                </span>
              </div>

              {/* Tabs for Expiry Mode: Presets / Custom Hours / Custom Date */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setExpiryMode('preset')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition ${
                    expiryMode === 'preset'
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ⚡ فترات سريعة جاهزة
                </button>
                <button
                  type="button"
                  onClick={() => setExpiryMode('custom_hours')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition ${
                    expiryMode === 'custom_hours'
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ⏱️ كتابة عدد الساعات يدوياً
                </button>
                <button
                  type="button"
                  onClick={() => setExpiryMode('custom_date')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition ${
                    expiryMode === 'custom_date'
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📅 تحديد تاريخ وساعة معينة
                </button>
              </div>

              {/* Option 1: Fast Presets */}
              {expiryMode === 'preset' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 animate-fadeIn">
                  {[
                    { value: 24, label: 'يوم واحد (24 ساعة) 🔥', desc: 'مناسب للعروض اليومية' },
                    { value: 48, label: 'يومان (48 ساعة) ⚡', desc: 'عروض نهاية الأسبوع' },
                    { value: 168, label: 'أسبوع كامل (7 أيام) 📅', desc: 'تخفيضات أسبوعية' },
                    { value: 0, label: 'دائم بدون انتهاء ♾️', desc: 'إعلانات وتحديثات عامة' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setExpiryHours(opt.value)}
                      className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
                        expiryHours === opt.value
                          ? 'border-amber-500 bg-amber-50/80 text-amber-950 font-black ring-2 ring-amber-400/30'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700 font-medium'
                      }`}
                    >
                      <span className="text-xs block leading-tight">{opt.label}</span>
                      <span className="text-[9px] text-slate-500 mt-1">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Option 2: Custom Hours Input */}
              {expiryMode === 'custom_hours' && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 space-y-2 animate-fadeIn">
                  <label className="text-xs font-black text-amber-950 block">
                    ✍️ أدخل عدد الساعات المطلوبة لانتهاء العرض والإشعار:
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="1"
                        max="8760"
                        step="1"
                        value={customHours}
                        onChange={(e) => setCustomHours(e.target.value)}
                        placeholder="مثال: 12 أو 36 أو 72"
                        className="w-full bg-white border-2 border-amber-300 rounded-xl py-2 px-3 text-sm font-mono font-black text-slate-900 focus:border-amber-500 focus:outline-none"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-amber-800">
                        ساعة
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[6, 12, 36, 72].map((quick) => (
                        <button
                          key={quick}
                          type="button"
                          onClick={() => setCustomHours(String(quick))}
                          className="bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-2.5 py-2 rounded-xl transition"
                        >
                          {quick} س
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-amber-800 font-bold">
                    💡 ينتهي الإشعار ويختفي من جرس الزبائن تلقائياً بعد مرور <strong>{customHours || 0} ساعة</strong> من الآن.
                  </p>
                </div>
              )}

              {/* Option 3: Custom Date & Time Picker */}
              {expiryMode === 'custom_date' && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3.5 space-y-2 animate-fadeIn">
                  <label className="text-xs font-black text-blue-950 block">
                    📅 اختر التاريخ والوقت الدقيق لانتهاء العرض والإشعار:
                  </label>
                  <input
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full bg-white border-2 border-blue-300 rounded-xl py-2 px-3 text-sm font-mono font-black text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-blue-800 font-bold">
                    💡 سيتم إخفاء الإشعار فور حلول هذا التاريخ والوقت المحدد.
                  </p>
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
                    <Send className="w-4 h-4 text-white" />
                    <span>إرسال التنبيه الفوري لـ ({getTargetAudienceCount()}) جهاز 🚀</span>
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
        
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <span>📜 سجل الإشعارات والتنبيهات المرسلة سابقاً</span>
              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">({logs.length})</span>
            </h3>
            
            <button
              type="button"
              onClick={fetchStatsAndLogs}
              className="text-xs text-slate-600 hover:text-brand-blue flex items-center gap-1 font-bold bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200 transition cursor-pointer"
              title="تحديث السجل"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingStats ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {logs.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllNotifications}
                disabled={isClearingAll}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isClearingAll ? 'جاري المسح...' : 'مسح السجل بالكامل 🗑️'}</span>
              </button>
            )}
          </div>
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
                  <th className="py-2.5 px-3 text-center">حالة الصلاحية</th>
                  <th className="py-2.5 px-3 text-center">الأجهزة المستلمة</th>
                  <th className="py-2.5 px-3">المرسل</th>
                  <th className="py-2.5 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const isExpired = log.expiresAt ? new Date(log.expiresAt).getTime() <= Date.now() : false;

                  return (
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
                      <td className="py-3 px-3 text-center">
                        {log.expiresAt ? (
                          isExpired ? (
                            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                              ⏳ منتهي الصلاحية
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                              🟢 نشط (ينتهي: {new Date(log.expiresAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })})
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ♾️ دائم
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-black text-emerald-600">
                        ✅ {log.successCount} / {log.sentCount}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-[11px]">
                        {log.sentBy || 'المدير'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteNotification(log.id)}
                          disabled={deletingId === log.id}
                          className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition flex items-center justify-center mx-auto cursor-pointer disabled:opacity-50"
                          title="حذف الإشعار من السجل"
                        >
                          {deletingId === log.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
}
