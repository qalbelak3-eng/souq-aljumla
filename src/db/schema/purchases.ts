import { pgTable, uuid, varchar, numeric, integer, date, timestamp, text, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { financialAccounts } from './accounts';
import { companies, products } from './catalog';

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
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_purchase_supplier_id').on(table.supplierAccountId),
  index('idx_purchase_invoice_number').on(table.invoiceNumber),
  index('idx_purchase_date').on(table.invoiceDate),
  check('chk_purchase_total_non_negative', sql`${table.totalAmount} >= 0`),
  check('chk_purchase_payment_method', sql`${table.paymentMethod} IN ('cash', 'credit', 'partial')`),
]);

export const purchaseInvoiceItems = pgTable('purchase_invoice_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => purchaseInvoices.id, { onDelete: 'cascade' }),
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
