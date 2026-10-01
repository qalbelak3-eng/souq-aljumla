import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  auditLogs,
  customerComplaints,
  financialAccounts,
  staffProfiles,
} from '@/db/schema';

export type ComplaintStatus = 'pending' | 'in_progress' | 'resolved' | 'archived';

type ComplaintOperator = {
  id?: string | null;
  name?: string | null;
  username?: string | null;
  role?: string | null;
};

function normalizePhone(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

function mapComplaint(row: {
  complaint: typeof customerComplaints.$inferSelect;
  accountAuthIdentityId: string | null;
}) {
  const c = row.complaint;
  return {
    id: c.id,
    userId: row.accountAuthIdentityId || undefined,
    accountId: c.accountId || undefined,
    customerName: c.customerName,
    customerPhone: c.customerPhone,
    businessName: c.businessName || undefined,
    city: c.city || undefined,
    text: c.text,
    status: c.status,
    adminReply: c.adminReply || undefined,
    repliedByStaffId: c.repliedByStaffId || undefined,
    repliedAt: c.repliedAt?.toISOString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function resolveAccountId(userId?: string | null, phone?: string | null) {
  const db = getDb();

  if (userId) {
    const rows = await db
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(eq(financialAccounts.authIdentityId, userId))
      .limit(1);
    if (rows[0]?.id) return rows[0].id;
  }

  const cleanPhone = normalizePhone(phone);
  if (cleanPhone) {
    const rows = await db
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(eq(financialAccounts.phone, cleanPhone))
      .limit(1);
    if (rows[0]?.id) return rows[0].id;
  }

  return null;
}

async function resolveStaffId(operator?: ComplaintOperator) {
  const db = getDb();
  const username = String(operator?.username || '').trim();
  if (!username) return null;

  const rows = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.username, username))
    .limit(1);

  return rows[0]?.id || null;
}

export async function pgGetComplaints(filters?: {
  phone?: string;
  userId?: string;
  status?: string;
}) {
  const db = getDb();
  const conditions = [];

  if (filters?.phone) {
    conditions.push(eq(customerComplaints.customerPhone, normalizePhone(filters.phone)));
  }
  if (filters?.userId) {
    conditions.push(eq(financialAccounts.authIdentityId, filters.userId));
  }
  if (filters?.status) {
    conditions.push(eq(customerComplaints.status, filters.status));
  }

  const query = db
    .select({
      complaint: customerComplaints,
      accountAuthIdentityId: financialAccounts.authIdentityId,
    })
    .from(customerComplaints)
    .leftJoin(financialAccounts, eq(customerComplaints.accountId, financialAccounts.id));

  const rows = conditions.length
    ? await query.where(and(...conditions)).orderBy(desc(customerComplaints.createdAt))
    : await query.orderBy(desc(customerComplaints.createdAt));

  return rows.map(mapComplaint);
}

export async function pgAddComplaint(data: {
  userId?: string;
  customerName?: string;
  customerPhone?: string;
  businessName?: string;
  city?: string;
  text: string;
}) {
  const db = getDb();
  const text = String(data.text || '').trim();
  if (!text) throw new Error('نص الرسالة مطلوب');

  const phone = normalizePhone(data.customerPhone);
  const accountId = await resolveAccountId(data.userId, phone);

  const [created] = await db
    .insert(customerComplaints)
    .values({
      accountId,
      customerName: String(data.customerName || 'عميل المتجر').trim() || 'عميل المتجر',
      customerPhone: phone,
      businessName: data.businessName?.trim() || null,
      city: data.city?.trim() || null,
      text,
      status: 'pending',
    })
    .returning();

  return mapComplaint({
    complaint: created,
    accountAuthIdentityId: data.userId || null,
  });
}

export async function pgUpdateComplaint(
  id: string,
  updates: {
    status?: string;
    adminReply?: string;
    operator?: ComplaintOperator;
  },
) {
  const db = getDb();
  const currentRows = await db
    .select({
      complaint: customerComplaints,
      accountAuthIdentityId: financialAccounts.authIdentityId,
    })
    .from(customerComplaints)
    .leftJoin(financialAccounts, eq(customerComplaints.accountId, financialAccounts.id))
    .where(eq(customerComplaints.id, id))
    .limit(1);

  if (!currentRows[0]) return null;

  const allowedStatuses: ComplaintStatus[] = ['pending', 'in_progress', 'resolved', 'archived'];
  if (updates.status !== undefined && !allowedStatuses.includes(updates.status as ComplaintStatus)) {
    throw new Error('حالة الشكوى غير صالحة');
  }

  const staffId = await resolveStaffId(updates.operator);
  const fields: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.status !== undefined) fields.status = updates.status;
  if (updates.adminReply !== undefined) {
    fields.adminReply = updates.adminReply.trim() || null;
    fields.repliedByStaffId = staffId;
    fields.repliedAt = updates.adminReply.trim() ? new Date() : null;
  }

  const [updated] = await db
    .update(customerComplaints)
    .set(fields)
    .where(eq(customerComplaints.id, id))
    .returning();

  await db.insert(auditLogs).values({
    actionType: 'complaint_updated',
    actionLabel: 'تحديث شكوى',
    category: 'complaints',
    categoryLabel: 'الشكاوى',
    staffId,
    operatorSnapshot: updates.operator || null,
    targetType: 'complaint',
    targetId: id,
    details: `تحديث الشكوى ${id}${updates.status ? ` إلى الحالة ${updates.status}` : ''}`,
    severity: 'info',
  });

  return mapComplaint({
    complaint: updated,
    accountAuthIdentityId: currentRows[0].accountAuthIdentityId,
  });
}

export async function pgDeleteComplaint(id: string) {
  const db = getDb();
  const deleted = await db
    .delete(customerComplaints)
    .where(eq(customerComplaints.id, id))
    .returning({ id: customerComplaints.id });

  return deleted.length > 0;
}
