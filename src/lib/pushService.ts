import webpush from 'web-push';
import { PushSubscriptionRecord, PushNotificationLog } from '@/types';
import { getPushSubscriptions, deletePushSubscription, recordPushNotificationLog } from '@/lib/db';

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BO6OyAqdpwomGLV4HFOXZRjjxzJdh6gcskWb3xCIwbtFzXyGJ3_YJ4ngeI2WbwUH3eHJ0ayA2LwfnKw7M-wrx9o';
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'fZQ4Xv55L1p4q_tYLLjGGe8RFHyAJ-5MyYL-2PCjtcQ';
export const VAPID_SUBJECT = 'mailto:admin@souq-aljumla.iq';

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export interface SendPushPayload {
  title: string;
  body: string;
  image?: string;
  icon?: string;
  badge?: string;
  url?: string;
  targetAudience?: 'all' | 'wholesale' | 'market' | 'retail';
  sentBy?: string;
  expiryHours?: number; // مدة الصلاحية بالساعات (24 ساعة، 48 ساعة، أو 0 = دائم)
  expiresAt?: string;
}

export async function sendWebPushNotification(payload: SendPushPayload): Promise<{
  success: boolean;
  totalTargeted: number;
  successCount: number;
  failureCount: number;
  log?: PushNotificationLog;
}> {
  const audience = payload.targetAudience || 'all';
  const audienceLabels: Record<string, string> = {
    all: 'الجميع (كافة الزبائن والتجار والماركتات)',
    wholesale: 'تجار الجملة والموزعين فقط 👑',
    market: 'أصحاب الماركتات والمحلات فقط 🏪',
    retail: 'زبائن المفرد فقط 🛍️',
  };

  const subscriptions = getPushSubscriptions(audience);
  const totalTargeted = subscriptions.length;

  if (totalTargeted === 0) {
    const log = recordPushNotificationLog({
      title: payload.title,
      body: payload.body,
      image: payload.image,
      icon: payload.icon || '/app-icon.png',
      badge: payload.badge || '/app-icon.png',
      url: payload.url || '/',
      targetAudience: audience,
      targetAudienceLabel: audienceLabels[audience] || audience,
      sentCount: 0,
      successCount: 0,
      failureCount: 0,
      sentBy: payload.sentBy || 'مدير النظام',
      expiryHours: payload.expiryHours,
      expiresAt: payload.expiresAt,
    });

    return {
      success: true,
      totalTargeted: 0,
      successCount: 0,
      failureCount: 0,
      log,
    };
  }

  const notificationData = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/app-icon.png',
    badge: payload.badge || '/app-icon.png',
    image: payload.image,
    data: {
      url: payload.url || '/',
      timestamp: Date.now(),
    },
  });

  let successCount = 0;
  let failureCount = 0;

  const sendPromises = subscriptions.map(async (sub: PushSubscriptionRecord) => {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        },
      };

      await webpush.sendNotification(pushSubscription, notificationData, {
        TTL: 86400,
        urgency: 'high',
      });
      successCount++;
    } catch (err: any) {
      console.error('webpush.sendNotification failed for endpoint:', sub.endpoint, 'Status:', err.statusCode, 'Body:', err.body);
      failureCount++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        deletePushSubscription(sub.endpoint);
      }
    }
  });

  await Promise.allSettled(sendPromises);

  const log = recordPushNotificationLog({
    title: payload.title,
    body: payload.body,
    image: payload.image,
    icon: payload.icon || '/app-icon.png',
    badge: payload.badge || '/app-icon.png',
    url: payload.url || '/',
    targetAudience: audience,
    targetAudienceLabel: audienceLabels[audience] || audience,
    sentCount: totalTargeted,
    successCount,
    failureCount,
    sentBy: payload.sentBy || 'مدير النظام',
    expiryHours: payload.expiryHours,
    expiresAt: payload.expiresAt,
  });

  return {
    success: true,
    totalTargeted,
    successCount,
    failureCount,
    log,
  };
}

/**
 * إرسال تنبيه فوري مباشر لزبون معين (مثل: وصول المندوب لموقع التوصيل)
 * هذا الإشعار يظهر كـ Push Alert عاجل على هاتف الزبون فقط ولا يتم حفظه في سجل جرس التنبيهات الدائم
 */
export async function sendDirectCustomerAlert(params: {
  userId?: string;
  phone?: string;
  title: string;
  body: string;
  url?: string;
}): Promise<{ success: boolean; delivered: boolean }> {
  const db = getPushSubscriptions('all');
  if (!db || db.length === 0) return { success: true, delivered: false };

  const cleanPhone = (params.phone || '').replace(/\D/g, '');

  const targets = db.filter((sub) => {
    if (params.userId && sub.userId === params.userId) return true;
    if (cleanPhone && sub.userPhone && sub.userPhone.replace(/\D/g, '') === cleanPhone) return true;
    return false;
  });

  if (targets.length === 0) return { success: true, delivered: false };

  const notificationData = JSON.stringify({
    title: params.title,
    body: params.body,
    icon: '/app-icon.png',
    badge: '/app-icon.png',
    data: {
      url: params.url || '/',
      timestamp: Date.now(),
      isInstantAlertOnly: true, // علامة لتمييز الإشعار اللحظي
    },
  });

  let delivered = false;

  const promises = targets.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
          },
        },
        notificationData,
        {
          TTL: 3600, // صلاحية ساعة واحدة فقط للتنبيه العاجل
          urgency: 'high',
        }
      );
      delivered = true;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        deletePushSubscription(sub.endpoint);
      }
    }
  });

  await Promise.allSettled(promises);
  return { success: true, delivered };
}
