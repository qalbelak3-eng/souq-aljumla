import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authIdentities, staffProfiles } from '@/db/schema';
import { hashPassword } from '@/lib/auth';

export async function pgGetStaffMembers() {
  const db = getDb();
  return db.select({ id: staffProfiles.id, authIdentityId: staffProfiles.authIdentityId, name: staffProfiles.name, username: staffProfiles.username, jobTitle: staffProfiles.jobTitle, role: staffProfiles.role, permissions: staffProfiles.permissions, phone: authIdentities.phone, isActive: authIdentities.isActive, createdAt: staffProfiles.createdAt }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id));
}

export async function pgGetStaffMemberById(id: string) {
  const db = getDb();
  const rows = await db.select({ id: staffProfiles.id, authIdentityId: staffProfiles.authIdentityId, name: staffProfiles.name, username: staffProfiles.username, jobTitle: staffProfiles.jobTitle, role: staffProfiles.role, permissions: staffProfiles.permissions, phone: authIdentities.phone, isActive: authIdentities.isActive, createdAt: staffProfiles.createdAt }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id)).where(eq(staffProfiles.id, id)).limit(1);
  return rows[0] || null;
}

export async function pgCreateStaffMember(input: { name: string; username: string; password: string; phone?: string; jobTitle?: string; role?: string; permissions?: string[]; isActive?: boolean }) {
  const db = getDb();
  const username = input.username.trim().toLowerCase();
  const phone = (input.phone || `staff-${username}`).trim();
  return db.transaction(async (tx) => {
    const duplicate = await tx.select({ id: staffProfiles.id }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id)).where(or(eq(staffProfiles.username, username), eq(authIdentities.phone, phone))).limit(1);
    if (duplicate[0]) throw new Error('اسم المستخدم أو رقم الهاتف مسجل مسبقاً');
    const identities = await tx.insert(authIdentities).values({ phone, passwordHash: hashPassword(input.password), role: 'staff', isActive: input.isActive !== false }).returning({ id: authIdentities.id });
    const rows = await tx.insert(staffProfiles).values({ authIdentityId: identities[0].id, username, name: input.name.trim(), jobTitle: (input.jobTitle || 'موظف').trim(), role: (input.role || 'custom').trim(), permissions: (input.permissions || []).filter((p) => p !== '*') }).returning();
    return rows[0];
  });
}

export async function pgUpdateStaffMember(id: string, input: { name?: string; username?: string; password?: string; phone?: string; jobTitle?: string; role?: string; permissions?: string[]; isActive?: boolean }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select({ authIdentityId: staffProfiles.authIdentityId }).from(staffProfiles).where(eq(staffProfiles.id, id)).limit(1);
    if (!existing[0]) return null;
    const staffValues: Record<string, unknown> = {};
    if (typeof input.name === 'string') staffValues.name = input.name.trim();
    if (typeof input.username === 'string') staffValues.username = input.username.trim().toLowerCase();
    if (typeof input.jobTitle === 'string') staffValues.jobTitle = input.jobTitle.trim();
    if (typeof input.role === 'string') staffValues.role = input.role.trim();
    if (Array.isArray(input.permissions)) staffValues.permissions = input.permissions.filter((p) => typeof p === 'string' && p !== '*');
    if (Object.keys(staffValues).length) await tx.update(staffProfiles).set(staffValues).where(eq(staffProfiles.id, id));
    const identityValues: Record<string, unknown> = {};
    if (typeof input.phone === 'string' && input.phone.trim()) identityValues.phone = input.phone.trim();
    if (typeof input.password === 'string' && input.password.trim()) identityValues.passwordHash = hashPassword(input.password.trim());
    if (typeof input.isActive === 'boolean') identityValues.isActive = input.isActive;
    if (Object.keys(identityValues).length) await tx.update(authIdentities).set(identityValues).where(eq(authIdentities.id, existing[0].authIdentityId));
    const rows = await tx.select({ id: staffProfiles.id, name: staffProfiles.name, username: staffProfiles.username, jobTitle: staffProfiles.jobTitle, role: staffProfiles.role, permissions: staffProfiles.permissions, phone: authIdentities.phone, isActive: authIdentities.isActive }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id)).where(eq(staffProfiles.id, id)).limit(1);
    return rows[0] || null;
  });
}

export async function pgDeleteStaffMember(id: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select({ authIdentityId: staffProfiles.authIdentityId }).from(staffProfiles).where(eq(staffProfiles.id, id)).limit(1);
    if (!existing[0]) return false;
    await tx.delete(staffProfiles).where(eq(staffProfiles.id, id));
    await tx.delete(authIdentities).where(eq(authIdentities.id, existing[0].authIdentityId));
    return true;
  });
}
