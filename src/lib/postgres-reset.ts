import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

const TABLE_GROUPS: Record<string, string[]> = {
  products: ['inventory_movements', 'inventory_lots', 'product_offers', 'products'],
  categories: ['categories'],
  companies: ['companies'],
  purchases: ['purchase_payments', 'purchase_items', 'purchases'],
  merchants: ['financial_accounts'],
  staff: ['staff_profiles'],
  drivers: ['driver_settlements', 'driver_ledger_entries', 'driver_ledger_accounts', 'drivers'],
  banners: ['banners'],
  offers: ['product_offers'],
};

const ALL_TABLES = [
  'customer_refunds', 'customer_refund_claims', 'order_refunds', 'cashback_ledger', 'cash_vault_movements', 'vouchers',
  'driver_settlements', 'driver_ledger_entries', 'driver_ledger_accounts', 'purchase_payments', 'purchase_items', 'purchases',
  'order_status_history', 'order_items', 'orders', 'customer_complaints', 'product_offers', 'inventory_movements', 'inventory_lots',
  'products', 'categories', 'companies', 'drivers', 'vehicles', 'financial_accounts', 'audit_logs', 'banners',
];

const ACCOUNTING_TABLES = ['customer_refunds', 'customer_refund_claims', 'order_refunds', 'cashback_ledger', 'cash_vault_movements', 'vouchers', 'driver_settlements', 'driver_ledger_entries', 'driver_ledger_accounts'];
const ORDER_TABLES = ['customer_refunds', 'customer_refund_claims', 'order_refunds', 'cashback_ledger', 'order_status_history', 'order_items', 'orders'];

async function existingTables(tx: any, names: string[]) {
  if (!names.length) return [];
  const rows = await tx.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY(${names})`);
  const found = new Set((rows.rows || rows).map((r: any) => r.tablename));
  return names.filter((n) => found.has(n));
}

async function truncateTables(tx: any, names: string[]) {
  const existing = await existingTables(tx, names);
  if (!existing.length) return [];
  const identifiers = existing.map((name) => `"${name.replace(/"/g, '""')}"`).join(', ');
  await tx.execute(sql.raw(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE`));
  return existing;
}

export async function pgGetDatabaseStats() {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT tablename, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename), false, true, '')))[1]::text::bigint AS count
    FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  const tables = Object.fromEntries((rows.rows || rows).map((r: any) => [r.tablename, Number(r.count || 0)]));
  return { engine: 'postgresql', tables, totalRows: Object.values(tables).reduce((a: number, b: any) => a + Number(b || 0), 0) };
}

export async function pgResetDatabaseSection(target: string, currentStaffId: string) {
  const db = getDb();
  const normalized = target.trim().toLowerCase();
  const allowed = new Set([...Object.keys(TABLE_GROUPS), 'orders', 'accounting', 'all']);
  if (!allowed.has(normalized)) throw new Error('قسم التصفير غير معروف');

  return db.transaction(async (tx) => {
    let tables: string[] = [];
    if (normalized === 'orders') tables = await truncateTables(tx, ORDER_TABLES);
    else if (normalized === 'accounting') tables = await truncateTables(tx, ACCOUNTING_TABLES);
    else if (normalized === 'all') tables = await truncateTables(tx, ALL_TABLES);
    else if (normalized === 'staff') {
      // Preserve the currently authenticated master account. Remove other staff profiles first;
      // auth identities are cleaned only when they are no longer referenced by a profile.
      await tx.execute(sql`DELETE FROM staff_profiles WHERE id <> ${currentStaffId}::uuid`);
      await tx.execute(sql`DELETE FROM auth_identities ai WHERE ai.role = 'staff' AND NOT EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.auth_identity_id = ai.id)`);
      tables = ['staff_profiles', 'auth_identities'];
    } else tables = await truncateTables(tx, TABLE_GROUPS[normalized]);
    return { success: true, target: normalized, tables, message: 'تم تصفير القسم المحدد في PostgreSQL بنجاح' };
  });
}
