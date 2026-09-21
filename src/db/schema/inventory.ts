import { pgTable, uuid, varchar, integer, numeric, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { products } from './catalog';
import { staffProfiles } from './auth';

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  movementType: varchar('movement_type', { length: 30 }).notNull(), // 'purchase' | 'sale' | 'customer_return' | 'order_cancellation' | 'damage_spoilage' | 'manual_adjustment'
  quantityPieces: integer('quantity_pieces').notNull(), // Signed integer: + for inflow, - for outflow
  unitCostPieces: numeric('unit_cost_pieces', { precision: 14, scale: 4 }).notNull(),
  totalCost: numeric('total_cost', { precision: 14, scale: 2 }).notNull(),
  balanceAfterPieces: integer('balance_after_pieces').notNull(),
  referenceType: varchar('reference_type', { length: 30 }).notNull(), // 'order' | 'purchase_invoice' | 'manual'
  referenceId: uuid('reference_id'), // Nullable for manual adjustments
  referenceNumber: varchar('reference_number', { length: 50 }),
  performedByStaffId: uuid('performed_by_staff_id')
    .references(() => staffProfiles.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_inventory_product_id').on(table.productId),
  index('idx_inventory_reference').on(table.referenceType, table.referenceId),
  index('idx_inventory_created_at').on(table.createdAt),
  check('chk_inventory_movement_type', sql`${table.movementType} IN ('purchase', 'sale', 'customer_return', 'order_cancellation', 'damage_spoilage', 'manual_adjustment')`),
  check('chk_inventory_reference_type', sql`${table.referenceType} IN ('order', 'purchase_invoice', 'manual')`),
  check('chk_inventory_reference_consistency', sql`(${table.referenceType} IN ('order', 'purchase_invoice') AND ${table.referenceId} IS NOT NULL) OR (${table.referenceType} = 'manual')`),
]);
