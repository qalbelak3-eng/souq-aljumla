'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { PushNotificationLog } from '@/types';

interface NotificationsContextType {
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  unreadCount: number;
  notifications: PushNotificationLog[];
  permission: NotificationPermission;
  isSupported: boolean;
  isSubscribing: boolean;
  requestPermission: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  clearAllClientNotifications: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [notifications, setNotifications] = useState<PushNotificationLog[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const clearAllClientNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
    if (typeof window !== 'undefined') {
      localStorage.setItem('souq_client_cleared_at', Date.now().toString());
      localStorage.removeItem('souq_saved_notifications');
      localStorage.setItem('etihad_notifications_last_read', Date.now().toString());
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      if (typeof window === 'undefined') return;

      const nowTime = Date.now();
      const userType = user?.accountType || 'visitor';

      // 1. إدارة وقت أول دخول للمتصفح/الزائر:
      // الزائر أو العميل الجديد لا يجب أن يرى إشعارات قديمة تم إرسالها قبل دخوله للمرة الأولى
      let visitorFirstVisit = Number(localStorage.getItem('souq_visitor_first_visit') || '0');
      if (!visitorFirstVisit) {
        visitorFirstVisit = nowTime;
        localStorage.setItem('souq_visitor_first_visit', visitorFirstVisit.toString());
        // تعيين وقت المسح المبدئي لوقت أول دخول بحيث لا تظهر أي إشعارات قديمة سابقة لأول دخول
        const currentCleared = Number(localStorage.getItem('souq_client_cleared_at') || '0');
        if (!currentCleared || currentCleared < visitorFirstVisit) {
          localStorage.setItem('souq_client_cleared_at', visitorFirstVisit.toString());
        }
      }

      // 2. التحقق من الترحيب بالمستخدم الجديد المسجل حديثاً وإضافته إلى سجل إشعاراته
      let localCustomNotifs: PushNotificationLog[] = [];
      try {
        const customSaved = localStorage.getItem('souq_local_custom_notifications');
        if (customSaved) {
          const parsed = JSON.parse(customSaved);
          if (Array.isArray(parsed)) localCustomNotifs = parsed;
        }
      } catch {}

      if (user?.id) {
        const welcomeKey = `souq_welcome_notif_added_${user.id}`;
        if (!localStorage.getItem(welcomeKey)) {
          localStorage.setItem(welcomeKey, 'true');
          const firstName = user.name ? `يا ${user.name.split(' ')[0]}` : 'يا غالي';
          const welcomeNotif: PushNotificationLog = {
            id: `welcome-${user.id}-${nowTime}`,
            title: `🎁 أهلاً وسهلاً بك ${firstName}!`,
            body: 'نورت متجرك يا غالي! حسابك جاهز لتسوّق أفضل المواد الغذائية والسناكات بأسعار الجملة والمفرد مع توصيل فوري لكربلاء 🚚✨',
            url: '/products?filter=offers',
            targetAudience: 'all',
            targetAudienceLabel: 'الترحيب بالزبائن الجدد',
            sentCount: 1,
            successCount: 1,
            failureCount: 0,
            createdAt: new Date().toISOString(),
          };

          localCustomNotifs = [welcomeNotif, ...localCustomNotifs.filter(n => n.id !== welcomeNotif.id)];
          localStorage.setItem('souq_local_custom_notifications', JSON.stringify(localCustomNotifs));
        }
      }

      // 3. جلب سجلات الإشعارات الرسمية من الخادم
      const res = await fetch('/api/notifications/send', { cache: 'no-store' });
      const data = await res.json();
      
      let allLogs: PushNotificationLog[] = [];
      if (data.success && Array.isArray(data.logs)) {
        allLogs = [...localCustomNotifs, ...data.logs];
      } else {
        allLogs = [...localCustomNotifs];
      }

      const clientClearedAt = Number(localStorage.getItem('souq_client_cleared_at') || '0');

      // تطهير الروابط واستبعاد المنتهي الصلاحية والقديمة والفلترة بحسب شريحة الزبون
      const freshLogs = allLogs
        .filter((log: PushNotificationLog) => {
          const logCreatedAt = new Date(log.createdAt).getTime();

          // استبعاد المنتهي الصلاحية
          if (log.expiresAt && new Date(log.expiresAt).getTime() <= nowTime) {
            return false;
          }

          // استبعاد التنبيهات الممسوحة مسبقاً أو التنبيهات التي تم إرسالها قبل أول دخول للمتصفح إذا كان زائر
          if (clientClearedAt > 0 && logCreatedAt < clientClearedAt && !log.id.startsWith('welcome-')) {
            return false;
          }

          // إذا كان زائر (غير مسجل الدخول) لا تظهر له الإشعارات القديمة السابقة لأول زيارة
          if (!user && visitorFirstVisit > 0 && logCreatedAt < visitorFirstVisit) {
            return false;
          }

          if (!log.targetAudience || log.targetAudience === 'all') return true;
          if (log.targetAudience === 'wholesale') return userType === 'wholesale' || userType === 'merchant';
          if (log.targetAudience === 'market') return userType === 'market';
          if (log.targetAudience === 'retail') return userType === 'individual' || userType === 'visitor' || !user;
          return true;
        })
        .map((log: PushNotificationLog) => {
          let safeUrl = log.url || '/products?filter=offers';
          if (safeUrl.startsWith('/admin') || safeUrl.includes('/admin/')) {
            if (safeUrl.includes('offer')) safeUrl = '/products?filter=offers';
            else if (safeUrl.includes('product')) safeUrl = '/products';
            else safeUrl = '/products?filter=offers';
          }
          return {
            ...log,
            url: safeUrl,
          };
        });

      setNotifications(freshLogs);

      if (freshLogs.length === 0) {
        localStorage.removeItem('souq_saved_notifications');
        setUnreadCount(0);
      } else {
        localStorage.setItem('souq_saved_notifications', JSON.stringify(freshLogs));
        const lastReadTime = Number(localStorage.getItem('etihad_notifications_last_read') || '0');
        const unread = freshLogs.filter((n: PushNotificationLog) => new Date(n.createdAt).getTime() > lastReadTime).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [user?.accountType, user?.id, user?.name]);

  const subscribeUserToPush = async (reg?: ServiceWorkerRegistration, showToastAlert = true) => {
    try {
      setIsSubscribing(true);
      const registration = reg || await navigator.serviceWorker.ready;

      const res = await fetch('/api/notifications/subscribe');
      const data = await res.json();
      if (!data.success || !data.vapidPublicKey) {
        throw new Error('VAPID key not available');
      }

      const applicationServerKey = urlBase64ToUint8Array(data.vapidPublicKey);

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isTablet = /iPad|Tablet/i.test(navigator.userAgent);

      const subRes = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          userId: user?.id,
          userPhone: user?.phone,
          userName: user?.name,
          accountType: user?.accountType || 'visitor',
          deviceType: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
        }),
      });

      const subJson = await subRes.json();
      if (subJson.success) {
        setPermission('granted');
        if (showToastAlert) {
          toast.showToast('تم تفعيل إشعارات المتجر على هاتفك بنجاح! 🔔📱', 'success');
        }
      } else {
        throw new Error(subJson.error || 'فشل حفظ الاشتراك');
      }
    } catch (err: any) {
      console.error('Error subscribing to push:', err);
      if (showToastAlert) {
        toast.showToast(err.message || 'تعذر ربط الإشعار بالخادم', 'error');
      }
    } finally {
      setIsSubscribing(false);
    }
  };

  const requestPermission = async () => {
    if (typeof window === 'undefined') return;

    // Check if Notification API exists
    if (!('Notification' in window)) {
      alert('⚠️ متصفحك الحالي لا يدعم ميزة إشعارات الويب المنبثقة (Notification API). يرجى فتح المتجر من متصفح Google Chrome أو Safari الحديث.');
      return;
    }

    // Check if in an insecure origin (HTTP instead of HTTPS or localhost)
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      alert('⚠️ تتطلب إشعارات الويب اتصالاً آمناً (HTTPS) في الهواتف الذكية أو العمل من localhost.');
      return;
    }

    try {
      setIsSubscribing(true);
      
      // Native permission request
      let result: NotificationPermission = 'default';

      if (typeof Notification.requestPermission === 'function') {
        const req = Notification.requestPermission();
        if (req && typeof req.then === 'function') {
          result = await req;
        } else {
          // Callback-based Safari
          result = await new Promise((resolve) => {
            Notification.requestPermission((status) => resolve(status));
          });
        }
      }

      setPermission(result);

      if (result === 'granted') {
        toast.showToast('تم تفعيل إشعارات المتجر على جهازك بنجاح! 🔔✅', 'success');
        
        if ('serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            await subscribeUserToPush(reg, false);
          } catch (swErr) {
            console.error('ServiceWorker subscription error:', swErr);
          }
        }
      } else if (result === 'denied') {
        alert('❌ تم رفض الإذن من المتصفح سابقاً أو تم حظره. يمكنك تفعيله من إعدادات موقع المتصفح بالضغط على علامة القفل / الإعدادات بجانب رابط الموقع ثم اختيار "السماح بالإشعارات".');
      } else {
        toast.showToast('تم إغلاق نافذة الإذن دون تغيير', 'info');
      }
    } catch (err: any) {
      console.error('requestPermission error:', err);
      alert('حدث تنبيه من المتصفح: ' + (err.message || err));
    } finally {
      setIsSubscribing(false);
    }
  };

  const openDrawer = () => {
    setIsDrawerOpen(true);
    refreshNotifications();
    if (typeof window !== 'undefined') {
      localStorage.setItem('etihad_notifications_last_read', String(Date.now()));
      setUnreadCount(0);
    }
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const supported = 'serviceWorker' in navigator && 'Notification' in window;
      setIsSupported(supported);

      if ('Notification' in window) {
        setPermission(Notification.permission);
      }

      const syncAndCheckUpdate = async () => {
        if (supported && 'serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            await reg.update().catch(() => {});
            if (Notification.permission === 'granted') {
              await subscribeUserToPush(reg, false).catch(() => {});
            }
          } catch (e) {
            console.log('SW sync error:', e);
          }
        }
        refreshNotifications();
      };

      // Initial sync on mount
      syncAndCheckUpdate();

      // Background auto-sync on app resume / focus on mobile
      const handleAppResume = () => {
        if (document.visibilityState === 'visible') {
          syncAndCheckUpdate();
        }
      };

      window.addEventListener('focus', handleAppResume);
      document.addEventListener('visibilitychange', handleAppResume);

      // Auto reload on controller change when new PWA version activates
      let refreshing = false;
      const handleControllerChange = () => {
        if (!refreshing) {
          refreshing = true;
          syncAndCheckUpdate();
        }
      };

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      }

      return () => {
        window.removeEventListener('focus', handleAppResume);
        document.removeEventListener('visibilitychange', handleAppResume);
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        }
      };
    }
  }, []);

  // Sync user profile (phone & ID) to push subscription upon login/state change
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'Notification' in window) {
      if (Notification.permission === 'granted' && (user?.id || user?.phone)) {
        navigator.serviceWorker.ready.then((reg) => {
          subscribeUserToPush(reg, false).catch(() => {});
        }).catch(() => {});
      }
    }
  }, [user?.id, user?.phone, user?.accountType]);

  return (
    <NotificationsContext.Provider
      value={{
        isDrawerOpen,
        setIsDrawerOpen,
        openDrawer,
        closeDrawer,
        unreadCount,
        notifications,
        permission,
        isSupported,
        isSubscribing,
        requestPermission,
        refreshNotifications,
        clearAllClientNotifications,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
