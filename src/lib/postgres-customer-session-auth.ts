import { and, eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authIdentities, financialAccounts } from '@/db/schema';
import type { MerchantTier } from '@/types';

export interface PgSessionCustomer {
  id: string;
  authIdentityId: string;
  phone: string;
  name: string;
  accountType: string;
  role: string;
  merchantStatus: string;
  pricingTier: string;
  merchantTier?: MerchantTier;
  isActive: boolean;
}

export async function pgGetActiveCustomerForSession(params: {
  userId?: string;
  phone?: string;
}): Promise<PgSessionCustomer | null> {
  const userId = (params.userId || '').trim();
  const phone = (params.phone || '').trim();
  if (!userId && !phone) return null;

  const db = getDb();
  const identityMatch = userId && phone
    ? or(eq(authIdentities.id, userId), eq(authIdentities.phone, phone))
    : userId
      ? eq(authIdentities.id, userId)
      : eq(authIdentities.phone, phone);

  const rows = await db
    .select({
      id: financialAccounts.id,
      authIdentityId: authIdentities.id,
      phone: authIdentities.phone,
      name: financialAccounts.name,
      category: financialAccounts.category,
      role: authIdentities.role,
      merchantStatus: financialAccounts.merchantStatus,
      pricingTier: financialAccounts.pricingTier,
      merchantTier: financialAccounts.merchantTier,
      accountIsActive: financialAccounts.isActive,
      identityIsActive: authIdentities.isActive,
    })
    .from(authIdentities)
    .innerJoin(financialAccounts, eq(financialAccounts.authIdentityId, authIdentities.id))
    .where(and(identityMatch, eq(financialAccounts.category, 'customer')))
    .limit(1);

  const row = rows[0];
  if (!row || !row.identityIsActive || !row.accountIsActive) return null;

  return {
    id: row.id,
    authIdentityId: row.authIdentityId,
    phone: row.phone,
    name: row.name,
    accountType: 'individual',
    role: row.role,
    merchantStatus: row.merchantStatus,
    pricingTier: row.pricingTier,
    merchantTier: (row.merchantTier || undefined) as MerchantTier | undefined,
    isActive: true,
  };
}
