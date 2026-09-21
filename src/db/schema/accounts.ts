import { pgTable, uuid, varchar, numeric, boolean, date, timestamp, text, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { authIdentities } from './auth';

export const financialAccounts = pgTable('financial_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountCode: varchar('account_code', { length: 30 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  businessName: varchar('business_name', { length: 150 }),
  phone: varchar('phone', { length: 20 }), // Nullable as finalized in DB-1 Addendum #1
  category: varchar('category', { length: 20 }).notNull(), // 'customer' | 'supplier' | 'driver' | 'employee'
  pricingTier: varchar('pricing_tier', { length: 20 }).default('retail').notNull(), // 'retail' | 'market' | 'wholesale' | 'special' | 'general'
  fixedDiscountPercent: numeric('fixed_discount_percent', { precision: 5, scale: 2 }).default('0.00'),
  city: varchar('city', { length: 100 }),
  address: text('address'),
  authIdentityId: uuid('auth_identity_id')
    .unique()
    .references(() => authIdentities.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').default(true).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }), // For safe account deactivation without deleting history (DB-2A Item 7)
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_accounts_code').on(table.accountCode),
  index('idx_accounts_category').on(table.category),
  index('idx_accounts_phone').on(table.phone),
  // Partial unique index: phone must be unique only when not null (DB-2A Item 4)
  uniqueIndex('uq_accounts_phone_non_null').on(table.phone).where(sql`${table.phone} IS NOT NULL`),
  check('chk_account_category', sql`${table.category} IN ('customer', 'supplier', 'driver', 'employee')`),
  check('chk_account_pricing_tier', sql`${table.pricingTier} IN ('retail', 'market', 'wholesale', 'special', 'general')`),
  check('chk_account_discount', sql`${table.fixedDiscountPercent} >= 0 AND ${table.fixedDiscountPercent} <= 100`),
]);

export const accountContacts = pgTable('account_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => financialAccounts.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(), // 'mobile' | 'whatsapp' | 'landline' | 'email'
  value: varchar('value', { length: 150 }).notNull(),
  label: varchar('label', { length: 50 }), // e.g. 'المحاسب', 'المبيعات', 'المستودع'
  isPrimary: boolean('is_primary').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_contacts_account_id').on(table.accountId),
  index('idx_contacts_value').on(table.value),
  check('chk_contact_type', sql`${table.type} IN ('mobile', 'whatsapp', 'landline', 'email')`),
]);

export const accountOpeningBalances = pgTable('account_opening_balances', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .unique()
    .references(() => financialAccounts.id, { onDelete: 'restrict' }),
  type: varchar('type', { length: 10 }).notNull(), // 'debit' (لنا) | 'credit' (علينا)
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  entryDate: date('entry_date').defaultNow().notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_opening_account_id').on(table.accountId),
  check('chk_opening_type', sql`${table.type} IN ('debit', 'credit')`),
  check('chk_opening_amount_positive', sql`${table.amount} >= 0`),
]);
