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

  const refreshNotifications = useCallback(async () => {
    try {
      // 1. First load from client storage immediately
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem('souq_saved_notifications');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setNotifications(parsed);
              const lastReadTime = Number(localStorage.getItem('etihad_notifications_last_read') || '0');
              const unread = parsed.filter((n: PushNotificationLog) => new Date(n.createdAt).getTime() > lastReadTime).length;
              setUnreadCount(unread);
            }
          }
        } catch {}
      }

      // 2. Fetch fresh logs from server
      const res = await fetch('/api/notifications/send', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.logs) && data.logs.length > 0) {
        const userType = user?.accountType || 'retail';
        const filtered = data.logs.filter((log: PushNotificationLog) => {
          if (!log.targetAudience || log.targetAudience === 'all') return true;
          if (log.targetAudience === 'wholesale') return userType === 'wholesale' || userType === 'merchant';
          if (log.targetAudience === 'market') return userType === 'market';
          if (log.targetAudience === 'retail') return userType === 'individual' || userType === 'retail' || !user;
          return true;
        });

        const freshLogs = filtered.length > 0 ? filtered : data.logs;

        setNotifications((prev) => {
          const merged = [...freshLogs];
          prev.forEach((p) => {
            if (!merged.some((m) => m.id === p.id)) {
              merged.push(p);
            }
          });
          if (typeof window !== 'undefined') {
            localStorage.setItem('souq_saved_notifications', JSON.stringify(merged));
            const lastReadTime = Number(localStorage.getItem('etihad_notifications_last_read') || '0');
            const unread = merged.filter((n: PushNotificationLog) => new Date(n.createdAt).getTime() > lastReadTime).length;
            setUnreadCount(unread);
          }
          return merged;
        });
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [user?.accountType, user]);

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
        alert('🎉 تم ربط هاتفك بالكامل بنظام إشعارات سوق الجملة! ستصلك التنبيهات حتى عند غلق الشاشة 🔔');
      } else {
        throw new Error(subJson.error || 'فشل حفظ الاشتراك');
      }
    } catch (err: any) {
      console.error('Error subscribing to push:', err);
      alert('⚠️ تنبيه: ' + (err.message || 'تعذر ربط الإشعار بالخادم'));
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

      if (supported && 'serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((e) => console.log('SW reg:', e));
      }

      refreshNotifications();
    }
  }, [refreshNotifications]);

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
