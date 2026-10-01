import { count, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { pushNotificationLogs, pushSubscriptions } from '@/db/schema';
import type { AccountType, NotificationTargetAudience, PushNotificationLog, PushSubscriptionRecord } from '@/types';

function toRecord(row: typeof pushSubscriptions.$inferSelect): PushSubscriptionRecord {
  return { id: row.id, endpoint: row.endpoint, keys: { p256dh: row.p256dhKey, auth: row.authKey }, userId: row.userId || undefined, userPhone: row.userPhone || undefined, userName: row.userName || undefined, accountType: (row.accountType || 'visitor') as AccountType, userAgent: row.userAgent || undefined, deviceType: (row.deviceType || 'mobile') as any, createdAt: row.createdAt.toISOString(), lastActiveAt: row.lastActiveAt?.toISOString() } as PushSubscriptionRecord;
}

export async function pgSavePushSubscription(input: { endpoint: string; keys: { p256dh: string; auth: string }; userId?: string; userPhone?: string; userName?: string; accountType?: string; userAgent?: string; deviceType?: string }) {
  const db = getDb(); const now = new Date();
  const [row] = await db.insert(pushSubscriptions).values({ endpoint: input.endpoint, p256dhKey: input.keys.p256dh, authKey: input.keys.auth, userId: input.userId || null, userPhone: input.userPhone || null, userName: input.userName || null, accountType: input.accountType || 'visitor', userAgent: input.userAgent || null, deviceType: input.deviceType || 'mobile', lastActiveAt: now }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dhKey: input.keys.p256dh, authKey: input.keys.auth, userId: input.userId || null, userPhone: input.userPhone || null, userName: input.userName || null, accountType: input.accountType || 'visitor', userAgent: input.userAgent || null, deviceType: input.deviceType || 'mobile', lastActiveAt: now } }).returning();
  return toRecord(row);
}
export async function pgDeletePushSubscription(endpoint: string) { await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)); }
export async function pgGetPushSubscriptions(audience: NotificationTargetAudience = 'all') {
  const db = getDb();
  const rows = audience === 'all' ? await db.select().from(pushSubscriptions) : audience === 'wholesale' ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.accountType, 'wholesale')) : audience === 'market' ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.accountType, 'market')) : audience === 'retail' ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.accountType, 'individual')) : await db.select().from(pushSubscriptions);
  return rows.map(toRecord);
}
export async function pgGetPushAudienceStats() {
  const rows = await getDb().select({ total: count(), wholesale: sql<number>`count(*) filter (where ${pushSubscriptions.accountType} = 'wholesale')`, market: sql<number>`count(*) filter (where ${pushSubscriptions.accountType} = 'market')`, retail: sql<number>`count(*) filter (where ${pushSubscriptions.accountType} = 'individual')`, visitors: sql<number>`count(*) filter (where ${pushSubscriptions.accountType} is null or ${pushSubscriptions.accountType} = 'visitor')` }).from(pushSubscriptions);
  const row = rows[0] || { total: 0, wholesale: 0, market: 0, retail: 0, visitors: 0 };
  return { totalSubscriptions: Number(row.total || 0), wholesaleCount: Number(row.wholesale || 0), marketCount: Number(row.market || 0), retailCount: Number(row.retail || 0), visitorCount: Number(row.visitors || 0) };
}

function toLog(row: typeof pushNotificationLogs.$inferSelect): PushNotificationLog {
  return { id: row.id, title: row.title, body: row.body, image: row.image || undefined, icon: row.icon || undefined, badge: row.badge || undefined, url: row.url || undefined, targetAudience: row.targetAudience as NotificationTargetAudience, targetAudienceLabel: row.targetAudienceLabel, sentCount: row.sentCount, successCount: row.successCount, failureCount: row.failureCount, expiresAt: row.expiresAt?.toISOString(), createdAt: row.createdAt.toISOString() };
}
export async function pgRecordPushNotificationLog(input: { title: string; body: string; image?: string; icon?: string; badge?: string; url?: string; targetAudience: NotificationTargetAudience; targetAudienceLabel: string; sentCount: number; successCount: number; failureCount: number; sentByStaffId?: string; expiresAt?: string }) {
  const [row] = await getDb().insert(pushNotificationLogs).values({ title: input.title, body: input.body, image: input.image || null, icon: input.icon || null, badge: input.badge || null, url: input.url || null, targetAudience: input.targetAudience, targetAudienceLabel: input.targetAudienceLabel, sentCount: input.sentCount, successCount: input.successCount, failureCount: input.failureCount, sentByStaffId: input.sentByStaffId || null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }).returning();
  return toLog(row);
}
export async function pgGetPushNotificationLogs() { return (await getDb().select().from(pushNotificationLogs).orderBy(desc(pushNotificationLogs.createdAt))).map(toLog); }
export async function pgDeletePushNotificationLog(id: string) { await getDb().delete(pushNotificationLogs).where(eq(pushNotificationLogs.id, id)); }
export async function pgClearAllPushNotificationLogs() { await getDb().delete(pushNotificationLogs); }
