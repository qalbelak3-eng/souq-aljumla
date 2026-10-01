import webpush from 'web-push';
import { PushSubscriptionRecord, PushNotificationLog, NotificationTargetAudience } from '@/types';
import { getPushSubscriptions, deletePushSubscription, recordPushNotificationLog } from '@/lib/db';
import { toCanonicalIraqiPhone } from '@/lib/phone-utils';

// The public VAPID key is safe to expose to browsers. The private key must only
// exist in the server environment and must never have a source-code fallback.
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BCemmhMkVO3oWHVRJkLIsaTBbBq6yV_be5pZQR7PREU-nbbYzIcMExgpYlkq5uJREvytFXHCMtYaI--BKuXDG2E';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:qalbelak3@gmail.com';

let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('PUSH_NOT_CONFIGURED');
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

export interface SendPushPayload {
  title: string;
  body: string;
  image?: string;
  icon?: string;
  badge?: string;
  url?: string;
  targetAudience?: NotificationTargetAudience;
  sentBy?: string;
  expiryHours?: number;
  expiresAt?: string;
}

export function sanitizeCustomerUrl(rawUrl?: string): string {
  if (!rawUrl) return '/products?filter=offers';
  const trimmed = rawUrl.trim();
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
  ensureVapidConfigured();
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
    return { success: true, totalTargeted: 0, successCount: 0, failureCount: 0, log };
  }

  const notificationData = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/app-icon.png',
    badge: payload.badge || '/app-icon.png',
    image: payload.image,
    data: { url: safeUrl, timestamp: Date.now() },
  });

  let successCount = 0;
  let failureCount = 0;
  const sendPromises = subscriptions.map(async (sub: PushSubscriptionRecord) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      }, notificationData, { TTL: 86400, urgency: 'high' });
      successCount++;
    } catch (err: any) {
      console.error('webpush.sendNotification failed. Status:', err.statusCode);
      failureCount++;
      if (err.statusCode === 410 || err.statusCode === 404) deletePushSubscription(sub.endpoint);
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
  return { success: true, totalTargeted, successCount, failureCount, log };
}

function normalizePhone(phone?: string): string {
  if (!phone) return '';
  return toCanonicalIraqiPhone(phone) || phone.replace(/\D/g, '');
}

export async function sendDirectCustomerAlert(params: {
  userId?: string;
  phone?: string;
  title: string;
  body: string;
  url?: string;
}): Promise<{ success: boolean; delivered: boolean }> {
  ensureVapidConfigured();
  const db = getPushSubscriptions('all');
  if (!db || db.length === 0) return { success: true, delivered: false };

  const targetCorePhone = normalizePhone(params.phone);
  const targetUserId = params.userId?.trim();
  if (!targetCorePhone && !targetUserId) return { success: true, delivered: false };

  const targets = db.filter((sub) => {
    if (targetUserId && sub.userId && sub.userId === targetUserId) return true;
    if (targetCorePhone && sub.userPhone) {
      const subCorePhone = normalizePhone(sub.userPhone);
      return subCorePhone === targetCorePhone || subCorePhone.endsWith(targetCorePhone) || targetCorePhone.endsWith(subCorePhone);
    }
    return false;
  });
  if (targets.length === 0) return { success: true, delivered: false };

  const safeUrl = sanitizeCustomerUrl(params.url);
  const notificationData = JSON.stringify({
    title: params.title,
    body: params.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: safeUrl, timestamp: Date.now(), isInstantAlertOnly: true },
  });

  let delivered = false;
  const promises = targets.map(async (sub) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      }, notificationData, { TTL: 86400, urgency: 'high' });
      delivered = true;
    } catch (err: any) {
      console.warn('Push delivery to customer endpoint failed:', err?.statusCode);
      if (err.statusCode === 410 || err.statusCode === 404) deletePushSubscription(sub.endpoint);
    }
  });
  await Promise.allSettled(promises);
  return { success: true, delivered };
}
