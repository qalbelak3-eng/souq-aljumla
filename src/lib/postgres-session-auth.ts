import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authIdentities, financialAccounts, staffProfiles } from '@/db/schema';
import type { MerchantTier } from '@/types';

export interface PgSessionStaff {
  id: string;
  authIdentityId: string;
  name: string;
  username: string;
  jobTitle: string;
  permissions: string[];
  isActive: boolean;
}

export interface PgSessionCustomer {
  id: string;
  phone: string;
  name: string;
  accountType: string;
  merchantStatus?: string;
  pricingTier?: string;
  merchantTier?: MerchantTier;
  isActive: boolean;
}

/**
 * Trusted server-side lookup for a staff session.
 * A valid signed cookie is not enough: the identity must still be active in PostgreSQL.
 */
export async function pgGetActiveStaffForSession(params: { userId?: string; username?: string }): Promise<PgSessionStaff | null> {
  const db = getDb();
  const username = (params.username || '').trim();
  const userId = (params.userId || '').trim();
  if (!username && !userId) return null;

  const rows = await db
    .select({
      id: staffProfiles.id,
      authIdentityId: staffProfiles.authIdentityId,
      name: staffProfiles.name,
      username: staffProfiles.username,
      jobTitle: staffProfiles.jobTitle,
      permissions: staffProfiles.permissions,
      isActive: authIdentities.isActive,
    })
    .from(staffProfiles)
    .innerJoin(authIdentities, eq(staffProfiles.authIdentityId, authIdentities.id))
    .where(
      username && userId
        ? or(eq(staffProfiles.username, username), eq(staffProfiles.id, userId), eq(authIdentities.id, userId))
        : username
          ? eq(staffProfiles.username, username)
          : or(eq(staffProfiles.id, userId), eq(authIdentities.id, userId)),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;
  return { ...row, permissions: row.permissions || [] };
}

/**
 * Trusted server-side lookup for a customer session.
 * Reads the current account state instead of trusting stale cookie profile fields.
 */
export async function pgGetActiveCustomerForSession(userId: string): Promise<PgSessionCustomer | null> {
  const cleanId = (userId || '').trim();
  if (!cleanId) return null;
  const db = getDb();
  const rows = await db
    .select({
      id: financialAccounts.id,
      phone: financialAccounts.phone,
      name: financialAccounts.name,
      category: financialAccounts.category,
      pricingTier: financialAccounts.pricingTier,
      merchantStatus: financialAccounts.merchantStatus,
      merchantTier: financialAccounts.merchantTier,
      accountActive: financialAccounts.isActive,
      identityActive: authIdentities.isActive,
    })
    .from(financialAccounts)
    .innerJoin(authIdentities, eq(financialAccounts.authIdentityId, authIdentities.id))
    .where(or(eq(financialAccounts.id, cleanId), eq(authIdentities.id, cleanId)))
    .limit(1);

  const row = rows[0];
  if (!row || !row.accountActive || !row.identityActive || !row.phone) return null;
  const accountType = row.pricingTier === 'wholesale' ? 'wholesale' : row.pricingTier === 'market' ? 'market' : 'individual';
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    accountType,
    merchantStatus: row.merchantStatus || undefined,
    pricingTier: row.pricingTier || undefined,
    merchantTier: (row.merchantTier || undefined) as MerchantTier | undefined,
    isActive: true,
  };
}
