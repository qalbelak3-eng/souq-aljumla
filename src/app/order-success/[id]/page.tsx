'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  MessageCircle,
  Printer,
  ArrowRight,
  Package,
  Clock,
  Phone,
  MapPin,
  ExternalLink,
  Truck,
  CheckCircle,
  Radio,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Order, OrderStatus } from '@/types';
import EtihadLogo from '@/components/EtihadLogo';

const TRACKING_STEPS: { status: OrderStatus; title: string; subtitle: string; icon: any }[] = [
  { status: 'pending', title: 'تم استلام الطلبية بنجاح', subtitle: 'الطلبية بانتظار مراجعة الكادر', icon: FileCheck },
  { status: 'processing', title: 'قيد التجهيز والتعبئة بالمستودع', subtitle: 'يتم الآن تجميع الكراتين وتغليفها', icon: Package },
  { status: 'shipped', title: 'خرجت مع المندوب للتوصيل', subtitle: 'الطلبية في الطريق إلى عنوانك', icon: Truck },
  { status: 'delivered', title: 'تم التوصيل والاستلام بنجاح', subtitle: 'تم تسليم الطلبية للزبون بالكامل', icon: CheckCircle },
];

export default function OrderSuccessPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');

  const prevStatusRef = useRef<string | null>(null);

  const fetchOrderLive = async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (data.success && data.order) {
        const newOrder: Order = data.order;
        
        if (prevStatusRef.current && prevStatusRef.current !== newOrder.status) {
          if (newOrder.status === 'delivered') {
            try {
              confetti({
                particleCount: 100,
                spread: 80,
                origin: { y: 0.5 },
                colors: ['#0284c7', '#f05138', '#16a34a']
              });
            } catch (e) {}
          }
        }

        prevStatusRef.current = newOrder.status;
        setOrder(newOrder);
        if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl);
        setLastUpdatedTime(new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.error('Live polling error', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#0284c7', '#f05138', '#16a34a']
      });
    } catch (e) {}

    fetchOrderLive();
    const interval = setInterval(() => {
      fetchOrderLive();
    }, 2500);

    return () => clearInterval(interval);
  }, [orderId]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-bold text-slate-500">جاري تحميل بيانات وتتبع الطلبية...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="text-4xl">📦</div>
        <h2 className="text-xl font-black text-slate-800">تعذر العثور على الطلبية</h2>
        <Link href="/" className="inline-block bg-brand-blue text-white font-bold text-xs py-2 px-6 rounded-xl">
          العودة للرئيسية
        </Link>
      </div>
    );
  }

  const paymentLabels: Record<string, string> = {
    cod: '💵 الدفع عند الاستلام (كاش بالدينار العراقي)',
    zaincash: '📱 زين كاش (ZainCash العراق)',
    qicard: '💳 بطاقة كي كارد / ماستر كارد (Qi Card)',
    bank_transfer: '🏦 تحويل مصرفي عراقي',
    online: '💳 دفع إلكتروني مباشر',
  };

  const stepIndexMap: Record<OrderStatus, number> = {
    pending: 0,
    processing: 1,
    shipped: 2,
    delivered: 3,
    cancelled: -1,
  };

  const currentStepIndex = stepIndexMap[order.status] ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6 text-xs">
      
      {/* Top Banner with Real-Time Indicator */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-md space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-brand-blue via-brand-coral to-emerald-500" />
        
        {/* Live Badge */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-black text-emerald-700">
              تتبع مباشر ولحظي لحالة الطلبية ⚡
            </span>
          </div>

          {lastUpdatedTime && (
            <span className="text-[10px] text-slate-400 font-mono">
              آخر فحص: {lastUpdatedTime}
            </span>
          )}
        </div>

        {/* Order Number & Stepper */}
        <div className="space-y-4">
          <div className="text-center sm:text-right">
            <span className="text-xs text-slate-500">رقم الفاتورة والطلبية:</span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 font-mono">#{order.orderNumber}</h1>
          </div>

          {order.status === 'cancelled' ? (
            <div className="bg-rose-50 border-2 border-rose-200 p-4 sm:p-5 rounded-3xl text-rose-900 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-rose-950">تم إرجاع / إلغاء هذه الطلبية 📦❌</h4>
                  <p className="text-xs text-rose-700 font-bold mt-0.5">
                    {order.driverName ? `المندوب: ${order.driverName}` : 'بواسطة إدارة المتجر'}
                    {order.deliveredAt && ` • بتاريخ: ${new Date(order.deliveredAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
              </div>

              {/* ملاحظة سبب الإلغاء أو الإرجاع المسجلة من السائق */}
              {order.driverNotes && (
                <div className="pt-2 border-t border-rose-200/80 flex items-center gap-2 text-xs">
                  <span className="font-black text-rose-950 shrink-0">💬 سبب الإرجاع / ملاحظة السائق:</span>
                  <span className="font-bold text-slate-800 bg-white/90 px-3 py-1 rounded-xl border border-rose-200 shadow-2xs">
                    "{order.driverNotes}"
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              {TRACKING_STEPS.map((step, idx) => {
                const Icon = step.icon;
                const isCompleted = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;

                return (
                  <div
                    key={step.status}
                    className={`p-3.5 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                      isCurrent
                        ? 'bg-sky-50 border-brand-blue ring-2 ring-brand-blue/30 shadow-xs'
                        : isCompleted
                        ? 'bg-emerald-50/70 border-emerald-300 text-emerald-800'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isCurrent
                          ? 'bg-brand-blue text-white animate-bounce'
                          : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-400'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                        isCurrent ? 'bg-brand-blue text-white' : isCompleted ? 'text-emerald-700' : 'text-slate-400'
                      }`}>
                        {isCurrent ? 'الحالة الحالية' : isCompleted ? 'تمت ✓' : `خطوة ${idx + 1}`}
                      </span>
                    </div>

                    <div>
                      <h4 className={`text-xs font-bold ${isCurrent || isCompleted ? 'text-slate-900' : 'text-slate-500'}`}>
                        {step.title}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                        {step.subtitle}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Live In-Transit Driver Tracking Banner */}
          {order.status === 'shipped' && (
            <div className="bg-gradient-to-r from-indigo-50 to-sky-50 border-2 border-indigo-200 p-4 sm:p-5 rounded-3xl shadow-sm space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md animate-pulse">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-indigo-950">
                      🚚 طلبيتك خرجت مع المندوب وهي في الطريق إليك الآن!
                    </h4>
                    <p className="text-xs text-indigo-800 font-bold mt-0.5">
                      المندوب المكلف: <span className="text-slate-900 font-black">{order.driverName || 'مندوب التوصيل'}</span> {order.driverPhone ? `• ${order.driverPhone}` : ''}
                    </p>
                  </div>
                </div>

                {order.outForDeliveryAt && (
                  <span className="text-xs font-mono font-bold bg-white text-indigo-900 border border-indigo-200 px-3 py-1 rounded-xl">
                    انطلقت الساعة: {new Date(order.outForDeliveryAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              {order.driverPhone && (
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <a
                    href={`tel:${order.driverPhone}`}
                    className="bg-white hover:bg-sky-50 text-sky-800 border border-sky-200 font-black text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition shadow-2xs"
                  >
                    <Phone className="w-3.5 h-3.5 text-sky-600" />
                    <span>اتصال بالمندوب ({order.driverPhone}) 📞</span>
                  </a>
                  <a
                    href={`https://api.whatsapp.com/send?phone=${order.driverPhone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 font-black text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition shadow-2xs"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>واتساب المندوب 💬</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Delivered Success Banner */}
          {order.status === 'delivered' && (
            <div className="bg-gradient-to-r from-emerald-50 to-emerald-100/60 border-2 border-emerald-300 p-4 sm:p-5 rounded-3xl shadow-sm space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-emerald-950">
                      🎉 تم تسليم الطلبية بنجاح!
                    </h4>
                    <p className="text-xs text-emerald-800 font-bold mt-0.5">
                      المندوب: {order.driverName || 'مندوب التوصيل'}
                      {order.deliveredAt && ` • تم التسليم في ${new Date(order.deliveredAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                </div>

                <div className="text-left font-bold text-xs">
                  {order.collectionStatus === 'collected_cash' && (
                    <span className="bg-emerald-200/80 text-emerald-900 px-3 py-1 rounded-xl border border-emerald-300 font-black">
                      💵 تم استلام المبلغ نقداً ({order.total.toLocaleString()} د.ع)
                    </span>
                  )}
                  {order.collectionStatus === 'debt_unpaid' && (
                    <span className="bg-amber-100 text-amber-900 px-3 py-1 rounded-xl border border-amber-300 font-black">
                      📝 تسليم بالآجل (دين مسجل: {order.total.toLocaleString()} د.ع)
                    </span>
                  )}
                  {order.collectionStatus === 'partial' && (
                    <span className="bg-sky-100 text-sky-900 px-3 py-1 rounded-xl border border-sky-300 font-black">
                      💳 تحصيل جزئي (دفع {order.collectedAmount?.toLocaleString()} • دين {order.remainingDebtAmount?.toLocaleString()})
                    </span>
                  )}
                </div>
              </div>

              {/* ملاحظة السائق المختصرة */}
              {order.driverNotes && (
                <div className="pt-2 border-t border-emerald-200/80 flex items-center gap-2 text-xs">
                  <span className="font-black text-emerald-950 shrink-0">💬 ملاحظة السائق:</span>
                  <span className="font-bold text-slate-800 bg-white/90 px-3 py-1 rounded-xl border border-emerald-200 shadow-2xs">
                    "{order.driverNotes}"
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* WhatsApp Call to Action */}
        {whatsappUrl && (
          <div className="pt-2 max-w-md mx-auto">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 px-6 rounded-2xl shadow-md transition flex items-center justify-center gap-3 text-xs sm:text-sm"
            >
              <MessageCircle className="w-5 h-5" />
              <span>إرسال تفاصيل الفاتورة إلى واتساب المؤسسة</span>
              <ExternalLink className="w-4 h-4 opacity-75" />
            </a>
          </div>
        )}

      </div>

      {/* Invoice Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-md space-y-6">
        
        {/* Invoice Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <EtihadLogo size="md" />

          <button
            onClick={handlePrint}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-xl transition flex items-center gap-1.5 print:hidden"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>طباعة الفاتورة</span>
          </button>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl text-xs text-slate-700">
          <div>
            <span className="text-slate-500 block mb-0.5">تاريخ الطلبية:</span>
            <span className="font-bold">{new Date(order.createdAt).toLocaleDateString('ar-IQ')}</span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">الحالة اللحظية:</span>
            <span className="font-bold text-brand-blue">{TRACKING_STEPS[currentStepIndex]?.title || order.status}</span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">طريقة الدفع:</span>
            <span className="font-bold">{paymentLabels[order.paymentMethod] || order.paymentMethod}</span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">نوع المشتري:</span>
            <span className="font-bold">{order.customer.isGuest ? 'طلب مباشر (كزائر)' : 'زبون مسجل'}</span>
          </div>
        </div>

        {/* Customer Address */}
        <div className="p-4 bg-slate-50 rounded-2xl space-y-3 text-xs text-slate-700">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span>بيانات الشحن وموقع الاستلام في العراق:</span>
            </h4>

            {order.customer.locationTitle && (
              <span className="bg-emerald-100 text-emerald-900 text-[11px] font-bold px-2.5 py-0.5 rounded-lg border border-emerald-200">
                📍 {order.customer.locationTitle}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
            <div><strong>اسم المستلم:</strong> {order.customer.name}</div>
            {order.customer.businessName && <div><strong>اسم الماركت:</strong> {order.customer.businessName}</div>}
            <div><strong>الهاتف:</strong> <span dir="ltr">{order.customer.phone}</span></div>
            <div><strong>المحافظة:</strong> {order.customer.city}</div>
            <div className="sm:col-span-2"><strong>العنوان:</strong> {order.customer.address}</div>
          </div>

          {order.customer.mapsUrl && (
            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>إحداثيات الموقع الجغرافي مرفقة مع الطلبية</span>
              </span>
              <a
                href={order.customer.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="bg-white hover:bg-emerald-50 text-emerald-800 font-black text-[11px] py-1.5 px-3 rounded-xl border border-emerald-300 transition shadow-2xs inline-flex items-center gap-1"
              >
                <span>فتح الموقع في خرائط Google 🗺️</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {order.customer.storefrontImage && (
            <div className="pt-2 border-t border-slate-200/60 space-y-1">
              <span className="text-[11px] font-bold text-slate-700 block">صورة واجهة الماركت الملتقطة:</span>
              <img
                src={order.customer.storefrontImage}
                alt="واجهة الماركت"
                className="w-36 h-24 object-cover rounded-xl border border-slate-200 shadow-2xs"
              />
            </div>
          )}
        </div>

        {/* Items Table */}
        <div className="space-y-3">
          <h4 className="font-bold text-xs text-slate-900">الأصناف المسجلة بالفاتورة:</h4>
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
            {order.items.map((item, idx) => (
              <div key={idx} className="p-3 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <img src={item.image} alt={item.name} className="w-12 h-12 object-contain rounded-xl bg-slate-50 p-1 shrink-0" />
                  <div>
                    <h5 className="font-bold text-slate-900">{item.name}</h5>
                    <span className="text-[11px] text-slate-500">
                      {item.saleType === 'wholesale' ? '📦 جملة' : '🛒 مفرد'} ({item.unitLabel}) • الكمية: {item.quantity}
                    </span>
                  </div>
                </div>
                <div className="text-left">
                  <span className="font-black text-slate-900 block">{(item.price * item.quantity).toLocaleString()} د.ع</span>
                  <span className="text-[10px] text-slate-400">({item.quantity} × {item.price.toLocaleString()} د.ع)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="bg-slate-50 p-4 rounded-2xl space-y-2 text-xs max-w-sm mr-auto text-slate-700">
          <div className="flex justify-between">
            <span>المجموع الفرعي:</span>
            <span className="font-bold text-slate-900">{order.subtotal.toLocaleString()} د.ع</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>خصم الكوبون:</span>
              <span className="font-bold">-{order.discount.toLocaleString()} د.ع</span>
            </div>
          )}
          {Number(order.usedCashbackDiscount || 0) > 0 && (
            <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
              <span>خصم رصيد الأرباح (كاش باك 🎁):</span>
              <span>-{Number(order.usedCashbackDiscount).toLocaleString()} د.ع</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>كروة التوصيل:</span>
            <span className="font-bold text-slate-900">{!order.deliveryFee ? 'مجاناً' : `${(order.deliveryFee || 0).toLocaleString()} د.ع`}</span>
          </div>
          <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-sm font-black text-slate-900">
            <span>الإجمالي النهائي:</span>
            <span className="text-lg font-black text-brand-coral">{order.total.toLocaleString()} د.ع</span>
          </div>

          {/* تفاصيل المتبقي كدين إن وجد */}
          {order.remainingDebtAmount && order.remainingDebtAmount > 0 ? (
            <div className="border-t border-dashed border-amber-300 pt-2 flex justify-between items-center text-xs font-black text-amber-900 bg-amber-50/70 p-2 rounded-xl">
              <span>المتبقي بذمة الزبون (دين مسجل):</span>
              <span className="font-mono text-sm text-rose-700">{order.remainingDebtAmount.toLocaleString()} د.ع</span>
            </div>
          ) : null}
        </div>

        {/* ملاحظة السائق أسفل الفاتورة */}
        {order.driverNotes && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800">💬 ملاحظة السائق:</span>
              <span className="font-bold text-slate-700 font-sans">"{order.driverNotes}"</span>
            </div>
            {order.deliveredAt && (
              <span className="text-[10px] text-slate-400 font-mono">
                {new Date(order.deliveredAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
