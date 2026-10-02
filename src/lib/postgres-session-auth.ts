import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authIdentities, drivers, financialAccounts, staffProfiles } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/password';
import type { MerchantStatus, MerchantTier, PricingTier } from '@/types';

export interface PgSessionStaff { id: string; authIdentityId: string; name: string; username: string; jobTitle: string; role: string; permissions: string[]; isActive: boolean; }
export interface PgSessionCustomer { id: string; phone: string; name: string; accountType: 'individual' | 'market' | 'wholesale'; merchantStatus?: MerchantStatus; pricingTier?: PricingTier; merchantTier?: MerchantTier; isActive: boolean; }
export interface PgSessionDriver { id: string; authIdentityId: string; financialAccountId: string; name: string; phone: string; isActive: boolean; }
function normalizeUsername(value?: string): string { return (value || '').trim().toLowerCase(); }

export async function pgGetActiveStaffForSession(params: { userId?: string; username?: string }): Promise<PgSessionStaff | null> {
  const db = getDb(); const username = normalizeUsername(params.username); const userId = (params.userId || '').trim(); if (!username && !userId) return null;
  const rows = await db.select({ id: staffProfiles.id, authIdentityId: staffProfiles.authIdentityId, name: staffProfiles.name, username: staffProfiles.username, jobTitle: staffProfiles.jobTitle, role: staffProfiles.role, permissions: staffProfiles.permissions, isActive: authIdentities.isActive }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id)).where(username && userId ? or(eq(staffProfiles.username, username), eq(staffProfiles.id, userId), eq(authIdentities.id, userId)) : username ? eq(staffProfiles.username, username) : or(eq(staffProfiles.id, userId), eq(authIdentities.id, userId))).limit(1);
  const row = rows[0]; if (!row || !row.isActive) return null; return { ...row, permissions: row.permissions || [] };
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
  const rows = await db.select({ authIdentityId: staffProfiles.authIdentityId, isActive: authIdentities.isActive, passwordHash: authIdentities.passwordHash }).from(staffProfiles).innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id)).where(staffId && username ? or(eq(staffProfiles.id, staffId), eq(staffProfiles.username, username)) : staffId ? eq(staffProfiles.id, staffId) : eq(staffProfiles.username, username)).limit(1);
  const row = rows[0]; if (!row || !row.isActive || !row.passwordHash || !verifyPassword(params.currentPassword, row.passwordHash)) return false;
  await db.update(authIdentities).set({ passwordHash: hashPassword(params.newPassword) }).where(eq(authIdentities.id, row.authIdentityId)); return true;
}

export async function pgGetActiveCustomerForSession(userId: string): Promise<PgSessionCustomer | null> {
  const cleanId = (userId || '').trim(); if (!cleanId) return null; const db = getDb();
  const rows = await db.select({ id: financialAccounts.id, phone: financialAccounts.phone, name: financialAccounts.name, pricingTier: financialAccounts.pricingTier, merchantStatus: financialAccounts.merchantStatus, merchantTier: financialAccounts.merchantTier, accountActive: financialAccounts.isActive, identityActive: authIdentities.isActive }).from(financialAccounts).innerJoin(authIdentities, eq(financialAccounts.authIdentityId, authIdentities.id)).where(or(eq(financialAccounts.id, cleanId), eq(authIdentities.id, cleanId))).limit(1);
  const row = rows[0]; if (!row || !row.accountActive || !row.identityActive || !row.phone) return null;
  const accountType: PgSessionCustomer['accountType'] = row.pricingTier === 'wholesale' ? 'wholesale' : row.pricingTier === 'market' ? 'market' : 'individual';
  return { id: row.id, phone: row.phone, name: row.name, accountType, merchantStatus: (row.merchantStatus || undefined) as MerchantStatus | undefined, pricingTier: (row.pricingTier || undefined) as PricingTier | undefined, merchantTier: (row.merchantTier || undefined) as MerchantTier | undefined, isActive: true };
}

export async function pgGetActiveDriverForSession(params: { driverId?: string; authIdentityId?: string }): Promise<PgSessionDriver | null> {
  const driverId = (params.driverId || '').trim(); const authIdentityId = (params.authIdentityId || '').trim(); if (!driverId && !authIdentityId) return null; const db = getDb();
  const rows = await db.select({ id: drivers.id, authIdentityId: drivers.authIdentityId, financialAccountId: drivers.financialAccountId, name: drivers.name, phone: drivers.phone, driverActive: drivers.isActive, identityActive: authIdentities.isActive, accountActive: financialAccounts.isActive }).from(drivers).innerJoin(authIdentities, eq(drivers.authIdentityId, authIdentities.id)).innerJoin(financialAccounts, eq(drivers.financialAccountId, financialAccounts.id)).where(driverId && authIdentityId ? or(eq(drivers.id, driverId), eq(drivers.authIdentityId, authIdentityId)) : driverId ? eq(drivers.id, driverId) : eq(drivers.authIdentityId, authIdentityId)).limit(1);
  const row = rows[0]; if (!row || !row.driverActive || !row.identityActive || !row.accountActive) return null;
  return { id: row.id, authIdentityId: row.authIdentityId, financialAccountId: row.financialAccountId, name: row.name, phone: row.phone, isActive: true };
}
