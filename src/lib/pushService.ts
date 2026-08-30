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
  });

  return {
    success: true,
    totalTargeted,
    successCount,
    failureCount,
    log,
  };
}
