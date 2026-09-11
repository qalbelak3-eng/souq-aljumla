import webpush from 'web-push';
import { PushSubscriptionRecord, PushNotificationLog, NotificationTargetAudience } from '@/types';
import { getPushSubscriptions, deletePushSubscription, recordPushNotificationLog } from '@/lib/db';

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BCemmhMkVO3oWHVRJkLIsaTBbBq6yV_be5pZQR7PREU-nbbYzIcMExgpYlkq5uJREvytFXHCMtYaI--BKuXDG2E';
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'ZjoxCbfjm0gNP6x6IU0OYZgAIUsFa1_ibgXzrV11aoc';
export const VAPID_SUBJECT = 'mailto:qalbelak3@gmail.com';

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
  targetAudience?: NotificationTargetAudience;
  sentBy?: string;
  expiryHours?: number; // مدة الصلاحية بالساعات (24 ساعة، 48 ساعة، أو 0 = دائم)
  expiresAt?: string;
}

export function sanitizeCustomerUrl(rawUrl?: string): string {
  if (!rawUrl) return '/products?filter=offers';
  const trimmed = rawUrl.trim();
  // حماية أمنية صارمة: منع أي إشعار موجه للزبائن من فتح لوحة تحكم الإدارة
  if (trimmed.startsWith('/admin') || trimmed.includes('/admin/')) {
    if (trimmed.includes('offer')) return '/products?filter=offers';
    if (trimmed.includes('product')) return '/products';
    return '/products?filter=offers';
  }
  return trimmed;
}

export async function sendWebPushNotification(payload: SendPushPayload): Promise<{
  success: boolean;
  totalTargeted: number;
  successCount: number;
  failureCount: number;
  log?: PushNotificationLog;
}> {
  const safeUrl = sanitizeCustomerUrl(payload.url);
  const audience = payload.targetAudience || 'all';
  const audienceLabels: Record<NotificationTargetAudience, string> = {
    all: 'الجميع (كافة الزبائن والتجار والماركتات) 🌍',
    wholesale: 'كبار تجار الجملة والموزعين فقط 👑',
    market: 'أصحاب الماركتات والمحلات فقط 🏪',
    retail: 'زبائن المفرد فقط 🛍️',
    registered_no_orders: 'مسجلين جدد بدون أي طلبية 👶',
    inactive_30d: 'زبائن خاملين (انقطعوا عن الطلب) 💔',
    few_orders: 'زبائن قليلين الطلبات (طلبوا 1-2 مرة) 📦',
    active_vip: 'الزبائن النشطين والمميزين VIP 🌟',
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
      url: safeUrl,
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
      url: safeUrl,
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
    url: safeUrl,
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

function normalizePhone(phone?: string): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00964')) digits = digits.slice(5);
  else if (digits.startsWith('964')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/**
 * إرسال تنبيه فوري مباشر لزبون معين فقط (مثل: استلام الطلبية، خروج المندوب، وصول المندوب، التسليم)
 * هذا الإشعار يرسل حصراً لهاتف الزبون صاحب الطلبية ولا يُرسل أبداً لبقية المشتركين.
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

  const targetCorePhone = normalizePhone(params.phone);
  const targetUserId = params.userId?.trim();

  // إذا لم يتوفر أي معرف للزبون (لا رقم ولا معرف حساب)، لا يتم إرسال أي إشعار منعاً للإزعاج
  if (!targetCorePhone && !targetUserId) {
    return { success: true, delivered: false };
  }

  // البحث عن اشتراكات هاتف الزبون المعني حصراً (بالمعرف أو برقم الهاتف المطابق)
  const targets = db.filter((sub) => {
    if (targetUserId && sub.userId && sub.userId === targetUserId) return true;
    if (targetCorePhone && sub.userPhone) {
      const subCorePhone = normalizePhone(sub.userPhone);
      if (subCorePhone === targetCorePhone || subCorePhone.endsWith(targetCorePhone) || targetCorePhone.endsWith(subCorePhone)) {
        return true;
      }
    }
    return false;
  });

  // حماية صارمة: إذا لم يكن هاتف الزبون مفعلاً للإشعارات، لا نرسل لأي جهاز آخر
  if (targets.length === 0) {
    return { success: true, delivered: false };
  }

  const safeUrl = sanitizeCustomerUrl(params.url);

  const notificationData = JSON.stringify({
    title: params.title,
    body: params.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: safeUrl,
      timestamp: Date.now(),
      isInstantAlertOnly: true,
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
          TTL: 86400,
          urgency: 'high',
        }
      );
      delivered = true;
    } catch (err: any) {
      console.warn('Push delivery to customer endpoint failed:', err?.statusCode, err?.message);
      if (err.statusCode === 410 || err.statusCode === 404) {
        deletePushSubscription(sub.endpoint);
      }
    }
  });

  await Promise.allSettled(promises);
  return { success: true, delivered };
}
