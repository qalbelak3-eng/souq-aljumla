import { pgTable, uuid, varchar, numeric, integer, date, timestamp, text, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { financialAccounts } from './accounts';
import { companies, products } from './catalog';
import { staffProfiles } from './auth';
import { vouchers } from './accounting';

export const purchaseInvoices = pgTable('purchase_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(),
  supplierAccountId: uuid('supplier_account_id')
    .notNull()
    .references(() => financialAccounts.id, { onDelete: 'restrict' }),
  companyId: uuid('company_id')
    .references(() => companies.id, { onDelete: 'set null' }),
  supplierNameSnap: varchar('supplier_name_snap', { length: 150 }).notNull(),
  invoiceDate: date('invoice_date').defaultNow().notNull(),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 20 }).notNull(), // 'cash' | 'credit' | 'partial'
  paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  remainingAmount: numeric('remaining_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(), // 'active' | 'cancelled'
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelledByStaffId: uuid('cancelled_by_staff_id')
    .references(() => staffProfiles.id, { onDelete: 'set null' }),
  cancellationReason: text('cancellation_reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_purchase_supplier_id').on(table.supplierAccountId),
  index('idx_purchase_invoice_number').on(table.invoiceNumber),
  index('idx_purchase_date').on(table.invoiceDate),
  index('idx_purchase_invoices_status').on(table.status),
  check('chk_purchase_total_non_negative', sql`${table.totalAmount} >= 0`),
  check('chk_purchase_payment_method', sql`${table.paymentMethod} IN ('cash', 'credit', 'partial')`),
  check('chk_purchase_invoice_status', sql`${table.status} IN ('active', 'cancelled')`),
  check('chk_purchase_paid_non_negative', sql`${table.paidAmount} >= 0`),
  check('chk_purchase_remaining_non_negative', sql`${table.remainingAmount} >= 0`),
  check('chk_purchase_paid_le_total', sql`${table.paidAmount} <= ${table.totalAmount}`),
  check('chk_purchase_amounts_balance', sql`${table.paidAmount} + ${table.remainingAmount} = ${table.totalAmount}`),
]);

export const purchaseInvoiceItems = pgTable('purchase_invoice_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => purchaseInvoices.id, { onDelete: 'restrict' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(), // عدد الكراتين المشتراة
  costPrice: numeric('cost_price', { precision: 14, scale: 2 }).notNull(), // سعر شراء الكرتون
  total: numeric('total', { precision: 14, scale: 2 }).notNull(),
  boxesPerCarton: integer('boxes_per_carton').default(1).notNull(),
  itemsPerBox: integer('items_per_box').default(1).notNull(),
  totalPieces: integer('total_pieces').notNull(),
  pieceCostPrice: numeric('piece_cost_price', { precision: 14, scale: 4 }).notNull(),
  expiryDate: date('expiry_date'),
}, (table) => [
  index('idx_purchase_items_invoice_id').on(table.invoiceId),
  index('idx_purchase_items_product_id').on(table.productId),
  check('chk_purchase_item_qty', sql`${table.quantity} > 0`),
]);

export const supplierRefundClaims = pgTable('supplier_refund_claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  claimNumber: varchar('claim_number', { length: 50 }).notNull().unique(),
  purchaseInvoiceId: uuid('purchase_invoice_id')
    .notNull()
    .references(() => purchaseInvoices.id, { onDelete: 'restrict' }),
  supplierAccountId: uuid('supplier_account_id')
    .notNull()
    .references(() => financialAccounts.id, { onDelete: 'restrict' }),
  claimAmount: numeric('claim_amount', { precision: 14, scale: 2 }).notNull(),
  refundedAmount: numeric('refunded_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending' | 'partially_refunded' | 'completed' | 'cancelled'
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_supplier_refund_claims_purchase_invoice_id').on(table.purchaseInvoiceId),
  index('idx_supplier_claims_supplier_id').on(table.supplierAccountId),
  index('idx_supplier_claims_status').on(table.status),
  check('chk_claim_amount_positive', sql`${table.claimAmount} > 0`),
  check('chk_claim_refunded_non_negative', sql`${table.refundedAmount} >= 0`),
  check('chk_claim_refunded_le_claim', sql`${table.refundedAmount} <= ${table.claimAmount}`),
  check('chk_claim_status', sql`${table.status} IN ('pending', 'partially_refunded', 'completed', 'cancelled')`),
]);

export const supplierRefunds = pgTable('supplier_refunds', {
  id: uuid('id').defaultRandom().primaryKey(),
  refundNumber: varchar('refund_number', { length: 50 }).notNull().unique(),
  claimId: uuid('claim_id')
    .notNull()
    .references(() => supplierRefundClaims.id, { onDelete: 'restrict' }),
  supplierAccountId: uuid('supplier_account_id')
    .notNull()
    .references(() => financialAccounts.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 20 }).default('cash').notNull(),
  voucherId: uuid('voucher_id')
    .references(() => vouchers.id, { onDelete: 'set null' }),
  processedByStaffId: uuid('processed_by_staff_id')
    .references(() => staffProfiles.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_supplier_refunds_claim_id').on(table.claimId),
  index('idx_supplier_refunds_account_id').on(table.supplierAccountId),
  check('chk_srefund_amount_positive', sql`${table.amount} > 0`),
]);
