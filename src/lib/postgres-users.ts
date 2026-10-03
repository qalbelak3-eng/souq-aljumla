import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authIdentities, financialAccounts } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/password';
import type { SavedAddress } from '@/types';

export interface PgCustomerUser {
  id: string;
  authIdentityId: string;
  name: string;
  phone: string;
  accountType: 'individual' | 'market' | 'wholesale';
  businessName?: string;
  businessType?: string;
  city?: string;
  address?: string;
  storefrontImage?: string;
  avatar?: string;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
  savedAddresses?: SavedAddress[];
  merchantStatus?: string;
  pricingTier?: string;
  merchantTier?: string;
  isActive: boolean;
  createdAt: string;
}

function normalizePhone(value: string) { return value.trim().replace(/\D/g, ''); }
function accountTypeFromTier(tier?: string | null): PgCustomerUser['accountType'] { return tier === 'wholesale' ? 'wholesale' : tier === 'market' ? 'market' : 'individual'; }
function toUser(row: any): PgCustomerUser {
  return {
    id: row.id, authIdentityId: row.authIdentityId, name: row.name, phone: row.phone,
    accountType: accountTypeFromTier(row.pricingTier), businessName: row.businessName || undefined,
    businessType: row.businessType || undefined, city: row.city || undefined, address: row.address || undefined,
    storefrontImage: row.storefrontImage || undefined, avatar: row.avatar || undefined,
    lat: row.latitude ?? undefined, lng: row.longitude ?? undefined, mapsUrl: row.mapsUrl || undefined,
    savedAddresses: Array.isArray(row.savedAddresses) ? row.savedAddresses : [], merchantStatus: row.merchantStatus || undefined,
    pricingTier: row.pricingTier || undefined, merchantTier: row.merchantTier || undefined,
    isActive: Boolean(row.accountActive && row.identityActive), createdAt: new Date(row.createdAt).toISOString(),
  };
}

const selection = {
  id: financialAccounts.id, authIdentityId: authIdentities.id, name: financialAccounts.name,
  phone: authIdentities.phone, pricingTier: financialAccounts.pricingTier, businessName: financialAccounts.businessName,
  businessType: financialAccounts.businessType, city: financialAccounts.city, address: financialAccounts.address,
  storefrontImage: financialAccounts.storefrontImage, avatar: financialAccounts.avatar, latitude: financialAccounts.latitude,
  longitude: financialAccounts.longitude, mapsUrl: financialAccounts.mapsUrl, savedAddresses: financialAccounts.savedAddresses,
  merchantStatus: financialAccounts.merchantStatus, merchantTier: financialAccounts.merchantTier,
  accountActive: financialAccounts.isActive, identityActive: authIdentities.isActive, createdAt: financialAccounts.createdAt,
};

function isUuid(value?: string | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export async function pgFindCustomer(identifier: string): Promise<PgCustomerUser | null> {
  const value = identifier.trim();
  if (!value) return null;
  const db = getDb();
  const phone = normalizePhone(value);
  const conditions = [];
  if (isUuid(value)) {
    conditions.push(eq(financialAccounts.id, value));
  }
  if (phone) {
    conditions.push(eq(authIdentities.phone, phone));
  }
  if (conditions.length === 0) return null;

  const rows = await db.select(selection).from(financialAccounts)
    .innerJoin(authIdentities, eq(financialAccounts.authIdentityId, authIdentities.id))
    .where(conditions.length === 1 ? conditions[0] : or(...conditions)).limit(1);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function pgAuthenticateCustomer(identifier: string, password: string): Promise<PgCustomerUser | null> {
  const value = identifier.trim(); const phone = normalizePhone(value); if (!phone || !password) return null; const db = getDb();
  const rows = await db.select({ ...selection, passwordHash: authIdentities.passwordHash }).from(financialAccounts)
    .innerJoin(authIdentities, eq(financialAccounts.authIdentityId, authIdentities.id)).where(eq(authIdentities.phone, phone)).limit(1);
  const row = rows[0]; if (!row || !row.accountActive || !row.identityActive || !row.passwordHash || !verifyPassword(password, row.passwordHash)) return null;
  await db.update(authIdentities).set({ lastLoginAt: new Date() }).where(eq(authIdentities.id, row.authIdentityId));
  return toUser(row);
}

export async function pgCreateCustomer(input: { name: string; phone: string; password: string; accountType?: string; businessName?: string; businessType?: string; city?: string; address?: string; storefrontImage?: string; lat?: number; lng?: number; mapsUrl?: string; }): Promise<PgCustomerUser> {
  const db = getDb(); const phone = normalizePhone(input.phone); if (!phone) throw new Error('INVALID_PHONE');
  const existing = await db.select({ id: authIdentities.id }).from(authIdentities).where(eq(authIdentities.phone, phone)).limit(1); if (existing[0]) throw new Error('PHONE_EXISTS');
  const tier = input.accountType === 'wholesale' || input.accountType === 'merchant' ? 'wholesale' : input.accountType === 'market' ? 'market' : 'retail';
  const merchantStatus = tier === 'retail' ? 'none' : 'pending';
  const created = await db.transaction(async tx => {
    const [identity] = await tx.insert(authIdentities).values({ phone, passwordHash: hashPassword(input.password), role: 'customer', isActive: true }).returning({ id: authIdentities.id });
    const [account] = await tx.insert(financialAccounts).values({ accountCode: `CUST-${Date.now()}-${phone.slice(-4)}`, name: input.name, phone, category: 'customer', pricingTier: tier, authIdentityId: identity.id, merchantStatus, businessName: input.businessName || null, businessType: input.businessType || null, city: input.city || null, address: input.address || null, storefrontImage: input.storefrontImage || null, latitude: input.lat ?? null, longitude: input.lng ?? null, mapsUrl: input.mapsUrl || null }).returning({ id: financialAccounts.id });
    return account.id;
  });
  const user = await pgFindCustomer(created); if (!user) throw new Error('CUSTOMER_CREATE_FAILED'); return user;
}

export async function pgUpdateCustomer(id: string, updates: { name?: string; phone?: string; password?: string; businessName?: string; businessType?: string; city?: string; address?: string; avatar?: string; storefrontImage?: string; mapsUrl?: string; savedAddresses?: SavedAddress[]; lat?: number | null; lng?: number | null; }): Promise<PgCustomerUser | null> {
  const db = getDb(); const current = await pgFindCustomer(id); if (!current) return null;
  const accountPatch: any = {}; const identityPatch: any = {};
  for (const key of ['name','businessName','businessType','city','address','avatar','storefrontImage','mapsUrl'] as const) if (updates[key] !== undefined) accountPatch[key] = updates[key] || null;
  if (updates.savedAddresses !== undefined) accountPatch.savedAddresses = updates.savedAddresses;
  if (updates.lat !== undefined) accountPatch.latitude = updates.lat; if (updates.lng !== undefined) accountPatch.longitude = updates.lng;
  if (updates.phone !== undefined) { const phone = normalizePhone(updates.phone); const other = await db.select({ id: authIdentities.id }).from(authIdentities).where(eq(authIdentities.phone, phone)).limit(1); if (other[0] && other[0].id !== current.authIdentityId) throw new Error('PHONE_EXISTS'); identityPatch.phone = phone; accountPatch.phone = phone; }
  if (updates.password) identityPatch.passwordHash = hashPassword(updates.password);
  await db.transaction(async tx => { if (Object.keys(accountPatch).length) await tx.update(financialAccounts).set(accountPatch).where(eq(financialAccounts.id, current.id)); if (Object.keys(identityPatch).length) await tx.update(authIdentities).set(identityPatch).where(eq(authIdentities.id, current.authIdentityId)); });
  return pgFindCustomer(current.id);
}
