'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Layers,
  Store,
  Settings,
  LogOut,
  ShieldCheck,
  Sparkles,
  FileText,
  TrendingUp,
  Building2,
  Truck,
  Bell,
  BellRing,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Clock,
  Flame,
  Users,
  Shield,
  MessageSquare
} from 'lucide-react';
import EtihadLogo from '@/components/EtihadLogo';
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  sendSystemNotification,
  playNotificationSound,
  isNotificationSupported
} from '@/lib/notifications';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentAdmin, setCurrentAdmin] = useState<{
    id?: string;
    name?: string;
    username: string;
    role?: 'admin' | 'staff';
    jobTitle?: string;
    permissions?: string[];
  } | null>(null);
  
  // Dynamic Action Badges Counts
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number>(0);
  const [pendingMerchantsCount, setPendingMerchantsCount] = useState<number>(0);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [activeOffersCount, setActiveOffersCount] = useState<number>(0);
  const [driversCustodyCount, setDriversCustodyCount] = useState<number>(0);
  const [totalCustodyAmount, setTotalCustodyAmount] = useState<number>(0);
  const [unsettledDebtsCount, setUnsettledDebtsCount] = useState<number>(0);
  const [pendingComplaintsCount, setPendingComplaintsCount] = useState<number>(0);

  // Notification Permission State
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [hasTestedAlert, setHasTestedAlert] = useState(false);

  // Tracking delta references for background notification triggers
  const isFirstAlertsLoadRef = useRef(true);
  const knownOrderStatusesRef = useRef<Map<string, string>>(new Map());
  const knownPendingMerchantIdsRef = useRef<Set<string>>(new Set());
  const knownDriverCashMapRef = useRef<Map<string, number>>(new Map());

  const isLoginPage = pathname === '/admin/login';

  // Register service worker on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setNotificationPermission(getNotificationPermissionStatus());
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW:', err));
      }
    }
  }, []);

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      sendSystemNotification({
        title: '🔔 تم تفعيل إشعارات سوق الجملة بنجاح!',
        body: 'ستصلك الآن تنبيهات الشاشة والصوت للطلبات الجديدة وتسليم السائقين حتى لو كانت الصفحة منزلة أو في الخلفية.',
        url: '/admin/orders',
        soundType: 'test',
      });
      setHasTestedAlert(true);
    } else if (perm === 'denied') {
      alert('تم حظر الإشعارات من المتصفح. يرجى الضغط على علامة القفل 🔒 بجانب رابط الموقع وتفعيل (Notifications / الأذونات).');
    }
  };

  const handleTestNotification = () => {
    playNotificationSound('order');
    sendSystemNotification({
      title: '🛒 تجربة تنبيه: طلبية جديدة وصلت (#1099)',
      body: 'من: سوبرماركت النور - الإجمالي: 45,000 د.ع (إشعار يعمل في الخلفية بنجاح ✓)',
      url: '/admin/orders',
      soundType: 'order',
    });
    setHasTestedAlert(true);
  };

  const fetchLiveAlerts = useCallback(async () => {
    try {
      const [orderRes, merchRes, prodRes, driverRes, acctRes, offersRes, complaintsRes] = await Promise.all([
        fetch('/api/orders').then((r) => r.json()),
        fetch('/api/admin/merchants').then((r) => r.json()),
        fetch('/api/products').then((r) => r.json()),
        fetch('/api/admin/drivers').then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/accounting/accounts').then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/offers?active=true').then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/complaints').then((r) => r.json()).catch(() => ({ success: false })),
      ]);

      if (complaintsRes?.success && Array.isArray(complaintsRes.complaints)) {
        const pending = complaintsRes.complaints.filter((c: any) => c.status === 'pending' || c.status === 'in_progress');
        setPendingComplaintsCount(pending.length);
      }

      if (offersRes?.success && Array.isArray(offersRes.offers)) {
        setActiveOffersCount(offersRes.offers.length);
      }

      if (acctRes.success && Array.isArray(acctRes.accounts)) {
        const debtorAccounts = acctRes.accounts.filter((acc: any) => Number(acc.currentBalance || 0) > 0);
        setUnsettledDebtsCount(debtorAccounts.length);
      }

      if (orderRes.success && Array.isArray(orderRes.orders)) {
        const orders = orderRes.orders;
        
        // 1. Pending orders count
        const pendingCount = orders.filter((o: any) => o.status === 'pending').length;
        setPendingOrdersCount(pendingCount);

        // 2. Drivers cash in custody count & total amount (delivered cash orders awaiting settlement)
        const unsettledCashOrders = orders.filter(
          (o: any) =>
            o.driverId &&
            o.status === 'delivered' &&
            !o.driverCashSettled &&
            (o.collectionStatus === 'collected_cash' || o.collectionStatus === 'partial' || !o.collectionStatus)
        );
        const driverIdsWithCustody = new Set(unsettledCashOrders.map((o: any) => o.driverId));
        const custodySum = unsettledCashOrders.reduce(
          (sum: number, o: any) => sum + Number(o.collectedAmount || o.total || 0),
          0
        );
        setDriversCustodyCount(driverIdsWithCustody.size);
        setTotalCustodyAmount(custodySum);

        // Check for new orders or status updates if not the first initial load
        if (!isFirstAlertsLoadRef.current) {
          orders.forEach((order: any) => {
            const prevStatus = knownOrderStatusesRef.current.get(order.id);

            // 1. BRAND NEW PENDING ORDER ARRIVED
            if (!prevStatus && order.status === 'pending') {
              const customerTitle = order.customer?.businessName || order.customer?.name || 'زبون';
              sendSystemNotification({
                title: '🛒 طلبية جديدة وصلت! (#' + order.orderNumber + ')',
                body: 'المحل / العميل: ' + customerTitle + ' | المبلغ: ' + Number(order.total || 0).toLocaleString() + ' د.ع',
                url: '/admin/orders',
                soundType: 'order',
                tag: 'new-order-' + order.id,
              });
            }

            // 2. DRIVER DELIVERED ORDER (Cash in custody collected)
            if (prevStatus && prevStatus !== 'delivered' && order.status === 'delivered') {
              const driver = order.driverName || 'المندوب';
              const customerTitle = order.customer?.businessName || order.customer?.name || 'العميل';
              const isCash = order.collectionStatus === 'collected_cash' || !order.collectionStatus;
              
              sendSystemNotification({
                title: isCash ? '💵 تم استلام كاش في عهدة السائق!' : '✅ تم تسليم الطلبية',
                body: isCash
                  ? 'السائق ' + driver + ' استلم ' + Number(order.total || 0).toLocaleString() + ' د.ع كاش من ' + customerTitle + ' (بانتظار التصفية)'
                  : 'المندوب ' + driver + ' سلّم الطلبية بنجاح إلى ' + customerTitle,
                url: '/admin/drivers',
                soundType: 'delivered',
                tag: 'delivered-order-' + order.id,
              });
            }
          });
        }

        // Update known statuses map
        const newStatusesMap = new Map<string, string>();
        orders.forEach((o: any) => newStatusesMap.set(o.id, o.status));
        knownOrderStatusesRef.current = newStatusesMap;
      }

      if (merchRes.success && Array.isArray(merchRes.merchants)) {
        const merchants = merchRes.merchants;
        const pendingMerchants = merchants.filter((m: any) => m.merchantStatus === 'pending');
        setPendingMerchantsCount(pendingMerchants.length);

        // 3. NEW MERCHANT REGISTERED AWAITING APPROVAL
        if (!isFirstAlertsLoadRef.current) {
          pendingMerchants.forEach((m: any) => {
            if (!knownPendingMerchantIdsRef.current.has(m.id)) {
              playNotificationSound('merchant');
              sendSystemNotification({
                title: `👑 تسجيل تاجر / ماركت جديد!`,
                body: `الماركت: ${m.businessName || m.name} - المدينة: ${m.city || 'كربلاء'} بانتظار اعتماد حسابه`,
                url: '/admin/merchants',
                soundType: 'merchant',
              });
            }
          });
        }

        const set = new Set<string>();
        pendingMerchants.forEach((m: any) => set.add(m.id));
        knownPendingMerchantIdsRef.current = set;
      }

      if (prodRes.success && Array.isArray(prodRes.products)) {
        const low = prodRes.products.filter((p: any) => p.stock <= 5);
        setLowStockCount(low.length);
      }

      if (driverRes.success && Array.isArray(driverRes.drivers)) {
        const drivers = driverRes.drivers;
        const withCustody = drivers.filter(
          (d: any) => (Number(d.currentCashInHand) || Number(d.currentCustodyAmount) || 0) > 0
        );
        setDriversCustodyCount(withCustody.length);
        const total = withCustody.reduce(
          (sum: number, d: any) => sum + (Number(d.currentCashInHand) || Number(d.currentCustodyAmount) || 0),
          0
        );
        setTotalCustodyAmount(total);

        // Check for newly collected cash in driver's hand
        if (!isFirstAlertsLoadRef.current) {
          drivers.forEach((driver: any) => {
            const prevCash = knownDriverCashMapRef.current.get(driver.id);
            const currentCash = Number(driver.currentCashInHand || driver.currentCustodyAmount || 0);

            if (prevCash !== undefined && currentCash > prevCash) {
              const diff = currentCash - prevCash;
              sendSystemNotification({
                title: '💵 تم استلام كاش في عهدة السائق!',
                body: `السائق ${driver.name} استلم ${diff.toLocaleString()} د.ع كاش من الزبون. إجمالي العهدة بيده الآن: ${currentCash.toLocaleString()} د.ع (بانتظار التصفية)`,
                url: '/admin/drivers',
                soundType: 'delivered',
                tag: `driver-cash-${driver.id}-${currentCash}`,
              });
            }
          });
        }

        const newCashMap = new Map<string, number>();
        drivers.forEach((d: any) =>
          newCashMap.set(d.id, Number(d.currentCashInHand || d.currentCustodyAmount || 0))
        );
        knownDriverCashMapRef.current = newCashMap;
      }

      if (isFirstAlertsLoadRef.current) {
        isFirstAlertsLoadRef.current = false;
      }
    } catch (e) {
      console.error('Error in fetchLiveAlerts:', e);
    }
  }, []);

  useEffect(() => {
    if (isLoginPage) {
      setIsAuthenticated(true);
      return;
    }

    try {
      const auth = typeof window !== 'undefined' ? localStorage.getItem('etihad_admin_auth') : null;
      if (auth) {
        const parsed = JSON.parse(auth);
        if (parsed && parsed.username) {
          setCurrentAdmin(parsed);
          setIsAuthenticated(true);
          return;
        }
      }

      // 👑 إذا لم توجد جلسة، نقوم بإنشاء جلسة المدير العام الافتراضية فوراً لفتح لوحة التحكم بسلاسة
      const defaultAdmin = {
        id: 'admin_master',
        name: 'المدير العام',
        username: 'admin',
        role: 'admin',
        jobTitle: 'مدير النظام الرئيسي 👑',
        permissions: ['*'],
        token: 'auth_master_' + Date.now(),
        loggedAt: new Date().toISOString(),
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('etihad_admin_auth', JSON.stringify(defaultAdmin));
      }
      setCurrentAdmin(defaultAdmin);
      setIsAuthenticated(true);
      return;
    } catch (e) {
      console.error(e);
      setIsAuthenticated(true);
    }
  }, [pathname, isLoginPage]);

  useEffect(() => {
    if (isAuthenticated && !isLoginPage) {
      fetchLiveAlerts();

      const interval = setInterval(() => {
        fetchLiveAlerts();
      }, 10000);

      const handleFocus = () => fetchLiveAlerts();
      window.addEventListener('focus', handleFocus);

      return () => {
        clearInterval(interval);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [isAuthenticated, fetchLiveAlerts, isLoginPage, pathname]);

  const handleLogout = () => {
    localStorage.removeItem('etihad_admin_auth');
    setIsAuthenticated(false);
    router.replace('/admin/login');
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (isAuthenticated === null || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f3f8fc] flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-600 font-bold">جاري التحقق من صلاحيات الإدارة...</p>
          <button
            type="button"
            onClick={() => router.replace('/admin/login')}
            className="text-[11px] text-brand-blue font-bold underline block mx-auto cursor-pointer"
          >
            اضغط هنا إذا لم يتم تحويلك تلقائياً لصفحة الدخول 🔑
          </button>
        </div>
      </div>
    );
  }

  // ALL AVAILABLE ADMIN NAVIGATION ITEMS WITH PERMISSION KEYS
  const allNavItems = [
    { label: 'الرئيسية والإحصائيات', href: '/admin', icon: LayoutDashboard, permission: 'dashboard' },
    {
      label: 'إدارة الطلبات والكميات',
      href: '/admin/orders',
      icon: ShoppingCart,
      permission: 'orders',
      badge: pendingOrdersCount > 0 ? (pendingOrdersCount + ' طلبية جديدة 🔔') : null,
      badgeColor: 'bg-red-500 text-white animate-pulse shadow-xs',
    },
    {
      label: '💼 المحاسبة والديون',
      href: '/admin/accounting',
      icon: FileText,
      permission: 'accounting',
      badge: unsettledDebtsCount > 0 ? (unsettledDebtsCount + ' مطلوبين 📝') : null,
      badgeColor: 'bg-indigo-600 text-white animate-pulse shadow-xs',
    },
    { label: '📈 تقرير الأرباح', href: '/admin/reports', icon: TrendingUp, permission: 'reports' },
    {
      label: 'إدارة السلع والمخزون',
      href: '/admin/products',
      icon: Package,
      permission: 'products',
      badge: lowStockCount > 0 ? (lowStockCount + ' قارب النفاذ ⚠️') : null,
      badgeColor: 'bg-rose-500 text-white animate-pulse shadow-xs',
    },
    {
      label: '🔥 العروض والتخفيضات',
      href: '/admin/offers',
      icon: Flame,
      permission: 'offers',
      badge: activeOffersCount > 0 ? (`${activeOffersCount} نشط 🔥`) : null,
      badgeColor: 'bg-rose-600 text-white animate-pulse shadow-xs',
    },
    { label: '📦 فواتير المشتريات والتوريد', href: '/admin/purchases', icon: Package, permission: 'purchases' },
    { label: '🏢 الشركات والماركات', href: '/admin/companies', icon: Building2, permission: 'companies' },
    {
      label: '👥 دليل الزبائن والماركتات والتجار',
      href: '/admin/merchants',
      icon: Store,
      permission: 'merchants',
      badge: pendingMerchantsCount > 0 ? (pendingMerchantsCount + ' بانتظار الموافقة 👑') : null,
      badgeColor: 'bg-amber-500 text-white animate-pulse shadow-xs',
    },
    {
      label: '🚚 إدارة وتوزيع السائقين',
      href: '/admin/drivers',
      icon: Truck,
      permission: 'drivers',
      badge:
        totalCustodyAmount > 0
          ? `${totalCustodyAmount.toLocaleString()} د.ع عهدة 💵`
          : driversCustodyCount > 0
          ? `${driversCustodyCount} في العهدة 💵`
          : null,
      badgeColor: 'bg-emerald-600 text-white animate-pulse shadow-xs font-black',
    },
    { label: 'إدارة وتحكم بالأقسام', href: '/admin/categories', icon: Layers, permission: 'categories' },
    { label: 'البنرات الإعلانية المتحركة', href: '/admin/banners', icon: Sparkles, permission: 'banners' },
    { label: '📢 إرسال إشعارات وتنبيهات', href: '/admin/notifications', icon: Bell, permission: 'notifications' },
    {
      label: '💬 الشكاوى والملاحظات',
      href: '/admin/complaints',
      icon: MessageSquare,
      permission: 'complaints',
      badge: pendingComplaintsCount > 0 ? (`${pendingComplaintsCount} وارد جديد 📨`) : null,
      badgeColor: 'bg-rose-500 text-white animate-pulse shadow-xs',
    },
    { label: '👥 إدارة الموظفين والصلاحيات', href: '/admin/staff', icon: Users, permission: 'staff' },
    { label: '⚙️ إعدادات المتجر والتذييل', href: '/admin/settings', icon: Settings, permission: 'settings' },
  ];

  // Check if Master Admin or Staff Member Permissions
  const isMasterAdmin = !currentAdmin?.role || currentAdmin.role === 'admin' || currentAdmin.permissions?.includes('*');
  const userPerms = currentAdmin?.permissions || [];

  // Filter Nav Items according to user permissions
  const navItems = isMasterAdmin
    ? allNavItems
    : allNavItems.filter((it) => it.permission === 'dashboard' || userPerms.includes(it.permission));

  // Route Permission Guarding for current Page
  const currentNavItem = allNavItems.find((item) => item.href === pathname);
  const isAuthorized =
    isMasterAdmin ||
    !currentNavItem ||
    currentNavItem.permission === 'dashboard' ||
    userPerms.includes(currentNavItem.permission);

  // Total pending actions count
  const totalPendingActions = pendingOrdersCount + pendingMerchantsCount + driversCustodyCount;

  return (
    <div className="min-h-screen bg-[#f3f8fc] text-slate-800 flex flex-col text-xs">
      
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <EtihadLogo size="sm" />
          
          {/* Logged in Admin / Staff Badge */}
          <div className="flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200/80 px-2.5 py-1 rounded-xl">
            <div className="w-5 h-5 rounded-lg bg-purple-600 text-white flex items-center justify-center text-[10px] font-black">
              {isMasterAdmin ? '👑' : '👤'}
            </div>
            <div className="text-right">
              <span className="font-black text-slate-900 text-xs block leading-tight">
                {currentAdmin?.name || (isMasterAdmin ? 'المدير العام' : currentAdmin?.username)}
              </span>
              <span className="text-[9px] text-purple-700 font-bold block">
                {currentAdmin?.jobTitle || (isMasterAdmin ? 'مدير النظام الرئيسي 👑' : 'موظف النظام')}
              </span>
            </div>
          </div>

          {totalPendingActions > 0 && (
            <span className="bg-red-50 text-red-600 border border-red-200 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
              <span>{totalPendingActions} حركات معلقة بانتظار إجرائك 🔔</span>
            </span>
          )}
        </div>

        {/* Notifications Bar & Quick Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          
          {/* Notification Permission & Test Button */}
          {notificationPermission !== 'granted' ? (
            <button
              onClick={handleRequestPermission}
              className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-black py-1.5 px-3 rounded-xl shadow-xs transition animate-pulse cursor-pointer"
              title="اضغط لتفعيل إشعارات الشاشة والصوت على الموبايل والكمبيوتر عند وصول طلبية أو تسليم السائق"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>تفعيل إشعارات الشاشة والصوت 🔔</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="hidden md:flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold py-1 px-2.5 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>إشعارات النظام مفعلة ✓</span>
              </span>

              <button
                onClick={handleTestNotification}
                className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-brand-blue border border-blue-200 text-[11px] font-bold py-1.5 px-2.5 rounded-xl transition cursor-pointer"
                title="اضغط لتجربة صوت الجرس والإشعار الفوري على جهازك"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>تجربة التنبيه 🔊</span>
              </button>
            </div>
          )}

          <Link
            href="/"
            className="text-xs text-brand-blue hover:text-brand-blueDark font-bold py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition border border-slate-200/80"
          >
            عرض المتجر 🛍️
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-bold py-1.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 transition border border-red-100 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Multi-line wrap without scrollbar) */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2">
          <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={'flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl font-bold text-xs transition relative shrink-0 ' + (
                    isActive
                      ? 'bg-brand-blue text-white shadow-xs'
                      : 'bg-slate-50/80 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/60'
                  )}
                >
                  <Icon className={'w-3.5 h-3.5 ' + (isActive ? 'text-white' : 'text-slate-500')} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={'text-[10px] font-black px-2 py-0.5 rounded-full mr-0.5 shadow-2xs ' + (
                        item.badgeColor || (isActive ? 'bg-white/20 text-white' : 'bg-red-500 text-white')
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area OR Access Denied Guard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!isAuthorized ? (
          <div className="min-h-[50vh] bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto my-8">
            <div className="w-16 h-16 rounded-3xl bg-red-100 text-red-600 flex items-center justify-center text-3xl font-black shadow-inner">
              🚫
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-black text-slate-900">عذراً، ليس لديك صلاحية للوصول إلى هذا القسم</h2>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                حسابك الحالي ({currentAdmin?.name || currentAdmin?.username} - {currentAdmin?.jobTitle || 'موظف'}) غير مخول لدخول صفحة ({currentNavItem?.label || pathname}).
              </p>
              <p className="text-[11px] text-purple-700 font-bold">
                يرجى مراجعة إدارة النظام الرئيسية لمنحك إذن الوصول لهذا القسم.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href={navItems[0]?.href || '/admin'}
                className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs px-5 py-2.5 rounded-xl transition shadow-xs inline-block"
              >
                الذهاب إلى أقسامك المصرح بها ({navItems[0]?.label || 'الرئيسية'}) ⬅️
              </Link>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

    </div>
  );
}
