import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authIdentities, drivers, financialAccounts, staffProfiles } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/password';
import type { MerchantStatus, MerchantTier, PricingTier } from '@/types';

export interface PgSessionStaff { id: string; authIdentityId: string; name: string; username: string; jobTitle: string; role: string; permissions: string[]; isActive: boolean; }
export interface PgSessionCustomer { id: string; phone: string; name: string; accountType: 'individual' | 'market' | 'wholesale'; merchantStatus?: MerchantStatus; pricingTier?: PricingTier; merchantTier?: MerchantTier; isActive: boolean; }
export interface PgSessionDriver { id: string; authIdentityId: string; financialAccountId: string; name: string; phone: string; isActive: boolean; }
function isUuid(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeUsername(value?: string): string { return (value || '').trim().toLowerCase(); }

export async function pgGetActiveStaffForSession(params: { userId?: string; username?: string }): Promise<PgSessionStaff | null> {
  const db = getDb();
  const username = normalizeUsername(params.username);
  const userId = (params.userId || '').trim();
  if (!username && !userId) return null;

  const conditions = [];
  if (username) {
    conditions.push(eq(staffProfiles.username, username));
  }
  if (userId && isUuid(userId)) {
    conditions.push(eq(staffProfiles.id, userId));
    conditions.push(eq(authIdentities.id, userId));
  } else if (userId && !username) {
    conditions.push(eq(staffProfiles.username, normalizeUsername(userId)));
  }

  if (conditions.length === 0) return null;

  const rows = await db
    .select({
      id: staffProfiles.id,
      authIdentityId: staffProfiles.authIdentityId,
      name: staffProfiles.name,
      username: staffProfiles.username,
      jobTitle: staffProfiles.jobTitle,
      role: staffProfiles.role,
      permissions: staffProfiles.permissions,
      isActive: authIdentities.isActive
    })
    .from(staffProfiles)
    .innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id))
    .where(or(...conditions))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;
  return { ...row, permissions: row.permissions || [] };
}

export async function pgAuthenticateAdminOrStaff(usernameInput: string, password: string): Promise<PgSessionStaff | null> {
  const username = normalizeUsername(usernameInput); if (!username || !password) return null; const db = getDb();
  const rows = await db.select({ id: staffProfiles.id, authIdentityId: staffProfiles.authIdentityId, name: staffProfiles.name, username: staffProfiles.username, jobTitle: staffProfiles.jobTitle, role: staffProfiles.role, permissions: staffProfiles.permissions, isActive: authIdentities.isActive, passwordHash: authIdentities.passwordHash }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id)).where(eq(staffProfiles.username, username)).limit(1);
  const row = rows[0]; if (!row || !row.isActive || !row.passwordHash || !verifyPassword(password, row.passwordHash)) return null;
  await db.update(authIdentities).set({ lastLoginAt: new Date() }).where(eq(authIdentities.id, row.authIdentityId));
  return { id: row.id, authIdentityId: row.authIdentityId, name: row.name, username: row.username, jobTitle: row.jobTitle, role: row.role, permissions: row.permissions || [], isActive: true };
}

export async function pgUpdateStaffPassword(params: { staffId?: string; username?: string; currentPassword: string; newPassword: string }): Promise<boolean> {
  const staffId = (params.staffId || '').trim(); const username = normalizeUsername(params.username); if ((!staffId && !username) || !params.currentPassword || !params.newPassword) return false; const db = getDb();
  const conditions = [];
  if (username) conditions.push(eq(staffProfiles.username, username));
  if (staffId && isUuid(staffId)) conditions.push(eq(staffProfiles.id, staffId));
  if (conditions.length === 0) return false;
  const rows = await db.select({ authIdentityId: staffProfiles.authIdentityId, isActive: authIdentities.isActive, passwordHash: authIdentities.passwordHash }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id)).where(or(...conditions)).limit(1);
  const row = rows[0]; if (!row || !row.isActive || !row.passwordHash || !verifyPassword(params.currentPassword, row.passwordHash)) return false;
  await db.update(authIdentities).set({ passwordHash: hashPassword(params.newPassword) }).where(eq(authIdentities.id, row.authIdentityId)); return true;
}

export async function pgGetActiveCustomerForSession(userId: string): Promise<PgSessionCustomer | null> {
  const cleanId = (userId || '').trim(); if (!cleanId) return null; const db = getDb();
  const conditions = [];
  if (isUuid(cleanId)) {
    conditions.push(eq(financialAccounts.id, cleanId));
    conditions.push(eq(authIdentities.id, cleanId));
  } else {
    conditions.push(eq(financialAccounts.phone, cleanId));
  }
  if (conditions.length === 0) return null;
  const rows = await db.select({ id: financialAccounts.id, phone: financialAccounts.phone, name: financialAccounts.name, pricingTier: financialAccounts.pricingTier, merchantStatus: financialAccounts.merchantStatus, merchantTier: financialAccounts.merchantTier, accountActive: financialAccounts.isActive, identityActive: authIdentities.isActive }).from(financialAccounts).innerJoin(authIdentities, eq(financialAccounts.authIdentityId, authIdentities.id)).where(or(...conditions)).limit(1);
  const row = rows[0]; if (!row || !row.accountActive || !row.identityActive || !row.phone) return null;
  const accountType: PgSessionCustomer['accountType'] = row.pricingTier === 'wholesale' ? 'wholesale' : row.pricingTier === 'market' ? 'market' : 'individual';
  return { id: row.id, phone: row.phone, name: row.name, accountType, merchantStatus: (row.merchantStatus || undefined) as MerchantStatus | undefined, pricingTier: (row.pricingTier || undefined) as PricingTier | undefined, merchantTier: (row.merchantTier || undefined) as MerchantTier | undefined, isActive: true };
}

export async function pgGetActiveDriverForSession(params: { driverId?: string; authIdentityId?: string }): Promise<PgSessionDriver | null> {
  const driverId = (params.driverId || '').trim(); const authIdentityId = (params.authIdentityId || '').trim(); if (!driverId && !authIdentityId) return null; const db = getDb();
  const conditions = [];
  if (driverId && isUuid(driverId)) conditions.push(eq(drivers.id, driverId));
  if (authIdentityId && isUuid(authIdentityId)) conditions.push(eq(drivers.authIdentityId, authIdentityId));
  if (conditions.length === 0) return null;
  const rows = await db.select({ id: drivers.id, authIdentityId: drivers.authIdentityId, financialAccountId: drivers.financialAccountId, name: drivers.name, phone: drivers.phone, driverActive: drivers.isActive, identityActive: authIdentities.isActive, accountActive: financialAccounts.isActive }).from(drivers).innerJoin(authIdentities, eq(drivers.authIdentityId, authIdentities.id)).innerJoin(financialAccounts, eq(drivers.financialAccountId, financialAccounts.id)).where(or(...conditions)).limit(1);
  const row = rows[0]; if (!row || !row.driverActive || !row.identityActive || !row.accountActive) return null;
  return { id: row.id, authIdentityId: row.authIdentityId, financialAccountId: row.financialAccountId, name: row.name, phone: row.phone, isActive: true };
}
