import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { auditLogs } from '@/db/schema';

export type AuditFilters = { category?: string; actionType?: string; operator?: string; search?: string; dateFrom?: string; dateTo?: string; limit?: number };

export async function pgGetAuditLogs(filters: AuditFilters = {}) {
  const db = getDb();
  const conditions: any[] = [];
  if (filters.category) conditions.push(eq(auditLogs.category, filters.category));
  if (filters.actionType) conditions.push(eq(auditLogs.actionType, filters.actionType));
  if (filters.operator) conditions.push(sql`${auditLogs.operatorSnapshot}->>'name' ILIKE ${`%${filters.operator}%`} OR ${auditLogs.operatorSnapshot}->>'username' ILIKE ${`%${filters.operator}%`}`);
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push(or(ilike(auditLogs.actionLabel, q), ilike(auditLogs.details, q), ilike(auditLogs.targetReferenceNumber, q), ilike(auditLogs.targetId, q))!);
  }
  if (filters.dateFrom) {
    const d = new Date(filters.dateFrom);
    if (!Number.isNaN(d.getTime())) conditions.push(gte(auditLogs.timestamp, d));
  }
  if (filters.dateTo) {
    const d = new Date(filters.dateTo);
    if (!Number.isNaN(d.getTime())) { if (/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)) d.setUTCHours(23, 59, 59, 999); conditions.push(lte(auditLogs.timestamp, d)); }
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const limit = Math.min(Math.max(Math.trunc(filters.limit || 200), 1), 500);
  const [rows, countRows] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.timestamp)).limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where),
  ]);
  return { logs: rows, total: Number(countRows[0]?.count || 0) };
}

export async function pgLogAuditEvent(input: { actionType: string; actionLabel?: string; category?: string; categoryLabel?: string; staffId?: string | null; operatorSnapshot?: unknown; targetType?: string; targetId?: string; targetReferenceNumber?: string; financialImpact?: unknown; details?: string; severity?: string; ipAddress?: string }) {
  const db = getDb();
  const rows = await db.insert(auditLogs).values({
    actionType: input.actionType.trim(), actionLabel: (input.actionLabel || input.actionType).trim(), category: (input.category || 'general').trim(), categoryLabel: input.categoryLabel || null,
    staffId: input.staffId || null, operatorSnapshot: input.operatorSnapshot as any, targetType: input.targetType || null, targetId: input.targetId || null,
    targetReferenceNumber: input.targetReferenceNumber || null, financialImpact: input.financialImpact as any, details: (input.details || input.actionLabel || input.actionType).trim(),
    severity: ['info', 'warning', 'danger'].includes(input.severity || '') ? input.severity! : 'info', ipAddress: input.ipAddress || null,
  }).returning();
  return rows[0];
}
