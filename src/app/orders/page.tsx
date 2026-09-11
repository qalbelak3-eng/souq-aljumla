'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  Clock,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  Truck,
  CheckCircle2,
  AlertCircle,
  ShoppingBag
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { Order } from '@/types';
import EtihadLogo from '@/components/EtihadLogo';
import MerchantStatsCard from '@/components/MerchantStatsCard';

export default function OrdersPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { addToCart, setIsCartDrawerOpen } = useCart();
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'pending' | 'shipped' | 'delivered' | 'cancelled'>('all');

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'قيد المراجعة ⏳', color: 'bg-amber-50 text-amber-800 border-amber-200' },
    processing: { label: 'قيد التجهيز بالمستودع 📦', color: 'bg-sky-50 text-brand-blue border-sky-200' },
    shipped: { label: 'خرج مع المندوب للتوصيل 🚚', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    delivered: { label: 'تم التوصيل بنجاح ✅', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelled: { label: 'ملغي ❌', color: 'bg-red-50 text-red-700 border-red-200' },
  };

  useEffect(() => {
    if (!user) {
      if (!isAuthLoading) setIsLoading(false);
      return;
    }

    const fetchOrders = async () => {
      try {
        const res = await fetch('/api/orders', { cache: 'no-store' });
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          const userPhoneClean = user.phone ? user.phone.replace(/\D/g, '') : '';
          const userOrders = data.orders.filter((o: Order) => {
            const oPhoneClean = o.customer.phone ? o.customer.phone.replace(/\D/g, '') : '';
            return (
              (o.customer.userId && o.customer.userId === user.id) ||
              (userPhoneClean && oPhoneClean && (oPhoneClean === userPhoneClean || oPhoneClean.endsWith(userPhoneClean) || userPhoneClean.endsWith(oPhoneClean)))
            );
          });
          // Sort newest first
          userOrders.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setOrders(userOrders);
        }
      } catch (err) {
        console.error('Failed to fetch orders:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [user, isAuthLoading]);

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'pending') return order.status === 'pending' || order.status === 'processing';
    if (selectedFilter === 'shipped') return order.status === 'shipped';
    if (selectedFilter === 'delivered') return order.status === 'delivered';
    if (selectedFilter === 'cancelled') return order.status === 'cancelled';
    return true;
  });

  // Re-order items
  const handleReorder = (order: Order) => {
    order.items.forEach((item) => {
      addToCart(
        {
          id: item.productId,
          name: item.name,
          price: item.price,
          wholesalePrice: item.price,
          marketPrice: item.price,
          unit: 'قطعة',
          category: 'عام',
          image: item.image || '/placeholder.png',
          barcode: '',
          sku: '',
          stock: 999,
          packageCount: 1,
        } as any,
        item.quantity,
        item.saleType || 'retail'
      );
    });
    setIsCartDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-28 select-none">
      
      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <EtihadLogo size="md" />
          </Link>

          <Link
            href="/"
            className="text-xs font-black text-slate-700 hover:text-brand-blue flex items-center gap-1.5 bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-blue-200 transition active:scale-95 shadow-2xs"
          >
            <ArrowRight className="w-3.5 h-3.5 text-brand-blue" />
            <span>العودة للرئيسية</span>
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-5">
        
        {/* Page Title & Breadcrumb */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              <Package className="w-6 h-6 text-brand-blue" />
              <span>الطلبات</span>
            </h1>
            <p className="text-xs text-slate-500 font-bold mt-0.5">
              متابعة حالة الطلبات النشطة وسجل الطلبيات السابقة
            </p>
          </div>

          <Link
            href="/products"
            className="bg-brand-coral hover:bg-[#e0452c] text-white text-xs font-black px-3.5 py-2 rounded-xl transition shadow-xs flex items-center gap-1.5 active:scale-95"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>طلب جديد</span>
          </Link>
        </div>

        {/* Not Logged In State (Hungerstation Style) */}
        {!user && !isAuthLoading && (
          <div className="bg-white rounded-3xl p-8 sm:p-14 text-center border border-slate-200/80 shadow-xs space-y-5 max-w-md mx-auto my-8">
            <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto text-4xl shadow-2xs border border-amber-200/60 relative">
              📦
              <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-black border-2 border-white">!</span>
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base sm:text-lg font-black text-slate-900">طلباتك ستظهر هنا</h2>
              <p className="text-xs text-slate-500 font-bold max-w-xs mx-auto">
                سجل الدخول لعرض طلباتك السابقة والحالية.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-block w-full bg-[#fed000] hover:bg-[#eec400] text-slate-950 font-black text-sm py-3 px-6 rounded-2xl shadow-sm transition active:scale-95"
            >
              تسجيل الدخول
            </Link>
          </div>
        )}

        {/* Logged in Content */}
        {user && (
          <>
            {/* Live Order Stats Card */}
            <MerchantStatsCard />

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {[
                { key: 'all', label: 'الكل', count: orders.length },
                {
                  key: 'pending',
                  label: 'قيد التجهيز',
                  count: orders.filter((o) => o.status === 'pending' || o.status === 'processing').length,
                },
                {
                  key: 'shipped',
                  label: 'خرج للتوصيل 🚚',
                  count: orders.filter((o) => o.status === 'shipped').length,
                },
                {
                  key: 'delivered',
                  label: 'المكتملة ✅',
                  count: orders.filter((o) => o.status === 'delivered').length,
                },
                {
                  key: 'cancelled',
                  label: 'الملغية ❌',
                  count: orders.filter((o) => o.status === 'cancelled').length,
                },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSelectedFilter(tab.key as any)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    selectedFilter === tab.key
                      ? 'bg-[#0c2444] text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedFilter === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Orders List */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white p-5 rounded-3xl border border-slate-200/80 animate-pulse space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="h-4 bg-slate-200 rounded-md w-28" />
                      <div className="h-4 bg-slate-200 rounded-md w-20" />
                    </div>
                    <div className="h-14 bg-slate-100 rounded-2xl w-full" />
                  </div>
                ))}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-slate-200/80 shadow-xs space-y-3">
                <div className="text-4xl">📦</div>
                <h3 className="text-sm font-black text-slate-800">
                  {selectedFilter === 'all' ? 'لا توجد طلبات سابقة' : 'لا توجد طلبات في هذا القسم'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  اطلب الآن واستفد من عروض وأسعار جملة الماركت مع توصيل سريع لموقعك!
                </p>
                <Link
                  href="/products"
                  className="inline-block bg-brand-coral hover:bg-[#e0452c] text-white font-black text-xs py-2.5 px-6 rounded-xl shadow-md transition"
                >
                  تصفح المنتجات والسناكات
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => {
                  const statusInfo = statusLabels[order.status] || statusLabels.pending;
                  return (
                    <div
                      key={order.id}
                      className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-3 transition hover:shadow-xs"
                    >
                      {/* Top Order Row: Order ID + Status */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-mono font-black text-xs text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg inline-block"
                            dir="ltr"
                          >
                            #{order.orderNumber}
                          </span>
                          <span className="text-[11px] text-slate-500 font-bold flex items-center gap-1 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span dir="ltr">{new Date(order.createdAt).toLocaleDateString('ar-IQ')}</span>
                          </span>
                          {order.customer.locationTitle && (
                            <span className="bg-sky-50 text-sky-900 border border-sky-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              📍 {order.customer.locationTitle}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={'text-[10px] font-black px-3 py-1 rounded-full border ' + statusInfo.color}>
                            {statusInfo.label}
                          </span>
                          <Link
                            href={'/order-success/' + order.id}
                            className="text-xs font-black text-brand-blue hover:underline flex items-center gap-1 bg-blue-50/70 hover:bg-blue-100/70 px-2.5 py-1 rounded-lg transition"
                          >
                            <span>تفاصيل</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      </div>

                      {/* Live Delivery Notification Banner */}
                      {order.status === 'shipped' && (
                        <div className="bg-indigo-50/90 border border-indigo-200 text-indigo-950 p-3 rounded-2xl flex items-center justify-between text-xs font-bold">
                          <span className="flex items-center gap-2">
                            <span className="text-base animate-bounce">🚚</span>
                            <span>الطلبية مع المندوب ({order.driverName || 'المندوب'}) في الطريق للتسليم</span>
                          </span>
                          {order.outForDeliveryAt && (
                            <span className="text-[10px] font-mono text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                              {new Date(order.outForDeliveryAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}

                      {order.status === 'delivered' && (
                        <div className="bg-emerald-50/80 border border-emerald-200 text-emerald-950 px-3 py-2 rounded-2xl flex items-center justify-between text-xs font-bold">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>تم تسليم الطلبية بنجاح</span>
                          </span>
                          {order.collectionStatus === 'collected_cash' && (
                            <span className="text-[10px] text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                              💵 تم استلام الكاش
                            </span>
                          )}
                          {order.collectionStatus === 'debt_unpaid' && (
                            <span className="text-[10px] text-amber-800 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                              📝 تسليم بالآجل (دين مسجل)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Items Preview */}
                      <div className="divide-y divide-slate-100 bg-slate-50/60 rounded-2xl p-2.5">
                        {order.items.map((item, i) => (
                          <div key={i} className="py-2 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={item.image || '/placeholder.png'}
                                alt={item.name}
                                className="w-10 h-10 object-contain rounded-xl bg-white p-0.5 border border-slate-200 shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="font-black text-slate-800 truncate block">{item.name}</span>
                                <span className="text-[10px] text-slate-500 font-bold block">
                                  {item.quantity} × {item.price.toLocaleString()} د.ع ({item.saleType === 'wholesale' ? 'كرتون/جملة' : 'مفرد'})
                                </span>
                              </div>
                            </div>
                            <span className="font-mono font-black text-slate-900 shrink-0">
                              {((item.price || 0) * item.quantity).toLocaleString()} د.ع
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Order Footer: Total & Actions */}
                      <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-baseline gap-2">
                          <span className="text-slate-500 font-bold">الإجمالي:</span>
                          <span className="font-mono font-black text-base text-[#e0452c]">
                            {order.total.toLocaleString()} د.ع
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleReorder(order)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-900 font-black text-xs py-1.5 px-3 rounded-xl border border-amber-200 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                            title="إعادة طلب نفس المنتجات"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>إعادة الطلب 🔄</span>
                          </button>

                          <Link
                            href={'/order-success/' + order.id}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-1.5 px-3 rounded-xl transition"
                          >
                            الفاتورة 📄
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
