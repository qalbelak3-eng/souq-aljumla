import { pgTable, uuid, varchar, numeric, boolean, timestamp, text, index, uniqueIndex, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { financialAccounts } from './accounts';
import { staffProfiles } from './auth';
import { orders } from './orders';

export const vouchers = pgTable('vouchers', {
  id: uuid('id').defaultRandom().primaryKey(),
  receiptNumber: varchar('receipt_number', { length: 50 }).notNull().unique(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => financialAccounts.id, { onDelete: 'restrict' }),
  voucherType: varchar('voucher_type', { length: 20 }).notNull(), // 'receipt' | 'disbursement' | 'reversal'
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 20 }).notNull(), // 'cash' | 'zaincash' | 'qicard' | 'bank_transfer' | 'other'
  
  // Reversal fields (Phase 2B-3 & DB-2A Hardening)
  isReversed: boolean('is_reversed').default(false).notNull(),
  reversalVoucherId: uuid('reversal_voucher_id')
    .references((): AnyPgColumn => vouchers.id, { onDelete: 'restrict' }),
  reversalOfId: uuid('reversal_of_id')
    .references((): AnyPgColumn => vouchers.id, { onDelete: 'restrict' }),
  reversalReason: text('reversal_reason'),
  reversedAt: timestamp('reversed_at', { withTimezone: true }),
  reversedByStaffId: uuid('reversed_by_staff_id')
    .references(() => staffProfiles.id, { onDelete: 'set null' }),
  receivedByStaffId: uuid('received_by_staff_id')
    .references(() => staffProfiles.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_vouchers_account_id').on(table.accountId),
  index('idx_vouchers_receipt_number').on(table.receiptNumber),
  index('idx_vouchers_created_at').on(table.createdAt),
  // Enforce 1-to-1 reversal mapping at database level (DB-2A Item 2)
  uniqueIndex('uq_voucher_reversal_voucher_id').on(table.reversalVoucherId),
  uniqueIndex('uq_voucher_reversal_of_id').on(table.reversalOfId),
  // Enforce no self-reversal (DB-2A Item 2)
  check('chk_voucher_no_self_reversal_voucher', sql`${table.reversalVoucherId} IS NULL OR ${table.reversalVoucherId} != ${table.id}`),
  check('chk_voucher_no_self_reversal_of', sql`${table.reversalOfId} IS NULL OR ${table.reversalOfId} != ${table.id}`),
  // Enforce reversal consistency: is_reversed=true requires reversal_voucher_id
  check('chk_voucher_reversal_consistency', sql`(${table.isReversed} = FALSE) OR (${table.isReversed} = TRUE AND ${table.reversalVoucherId} IS NOT NULL)`),
  // Enforce voucher_type='reversal' requires reversal_of_id
  check('chk_voucher_reversal_type_consistency', sql`(${table.voucherType} != 'reversal') OR (${table.voucherType} = 'reversal' AND ${table.reversalOfId} IS NOT NULL)`),
  // Enforce voucher_type='reversal' cannot itself be reversed or point to another reversal voucher
  check('chk_reversal_voucher_cannot_be_reversed', sql`(${table.voucherType} != 'reversal') OR (${table.isReversed} = FALSE AND ${table.reversalVoucherId} IS NULL)`),
  check('chk_voucher_type', sql`${table.voucherType} IN ('receipt', 'disbursement', 'reversal')`),
  check('chk_voucher_amount_positive', sql`${table.amount} > 0`),
  check('chk_voucher_payment_method', sql`${table.paymentMethod} IN ('cash', 'zaincash', 'qicard', 'bank_transfer', 'other')`),
]);

export const cashVaultMovements = pgTable('cash_vault_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionNumber: varchar('transaction_number', { length: 50 }).notNull().unique(),
  date: timestamp('date', { withTimezone: true }).defaultNow().notNull(),
  type: varchar('type', { length: 10 }).notNull(), // 'inflow' | 'outflow'
  category: varchar('category', { length: 30 }).notNull(), // 'sales_cash' | 'debt_collection' | 'driver_settlement' | 'purchase_payment' | 'expense' | 'owner_withdrawal' | 'deposit_adjustment' | 'adjustment'
  categoryLabel: varchar('category_label', { length: 100 }).notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  referenceType: varchar('reference_type', { length: 30 }), // 'order' | 'voucher' | 'purchase' | 'settlement' | 'manual'
  referenceId: uuid('reference_id'),
  referenceNumber: varchar('reference_number', { length: 50 }),
  partyName: varchar('party_name', { length: 150 }),
  staffId: uuid('staff_id')
    .references(() => staffProfiles.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_vault_date').on(table.date),
  index('idx_vault_number').on(table.transactionNumber),
  check('chk_vault_type', sql`${table.type} IN ('inflow', 'outflow')`),
  check('chk_vault_amount_positive', sql`${table.amount} > 0`),
  check('chk_vault_category', sql`${table.category} IN ('sales_cash', 'debt_collection', 'driver_settlement', 'purchase_payment', 'expense', 'owner_withdrawal', 'deposit_adjustment', 'adjustment')`),
]);

export const cashbackLedger = pgTable('cashback_ledger', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Strict ON DELETE RESTRICT on account_id to protect financial history (DB-2A Item 3)
  accountId: uuid('account_id')
    .notNull()
    .references(() => financialAccounts.id, { onDelete: 'restrict' }),
  type: varchar('type', { length: 20 }).notNull(), // 'earned' | 'redeemed' | 'reversed' | 'expired' | 'adjustment'
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  // Strict Foreign Key with ON DELETE RESTRICT (Addendum #3)
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_cashback_account_id').on(table.accountId),
  index('idx_cashback_order_id').on(table.orderId),
  check('chk_cashback_type', sql`${table.type} IN ('earned', 'redeemed', 'reversed', 'expired', 'adjustment')`),
  check('chk_cashback_amount_positive', sql`${table.amount} > 0`),
]);
