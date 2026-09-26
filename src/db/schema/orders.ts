import { pgTable, uuid, varchar, numeric, integer, boolean, timestamp, text, index, primaryKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { financialAccounts } from './accounts';
import { products } from './catalog';
import { drivers, vehicles, driverSettlements } from './vehicles_drivers';
import { authIdentities } from './auth';
import { coupons } from './operations';

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderNumber: varchar('order_number', { length: 50 }).notNull().unique(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => financialAccounts.id, { onDelete: 'restrict' }),
  
  // Historical Snapshots
  customerNameSnap: varchar('customer_name_snap', { length: 150 }).notNull(),
  customerPhoneSnap: varchar('customer_phone_snap', { length: 20 }).notNull(),
  deliveryAddressSnap: text('delivery_address_snap').notNull(),
  locationTitleSnap: varchar('location_title_snap', { length: 100 }),
  lat: numeric('lat', { precision: 10, scale: 7 }),
  lng: numeric('lng', { precision: 10, scale: 7 }),
  mapsUrl: text('maps_url'),
  storefrontImage: text('storefront_image'),
  
  // Coupon Historical Snapshot
  couponId: uuid('coupon_id')
    .references(() => coupons.id, { onDelete: 'set null' }),
  couponCodeSnap: varchar('coupon_code_snap', { length: 50 }),
  couponDiscountTypeSnap: varchar('coupon_discount_type_snap', { length: 20 }),
  couponDiscountValueSnap: numeric('coupon_discount_value_snap', { precision: 14, scale: 2 }),

  // Financial Totals
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
  deliveryFee: numeric('delivery_fee', { precision: 14, scale: 2 }).default('0.00').notNull(),
  discount: numeric('discount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  usedCashbackDiscount: numeric('used_cashback_discount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  earnedCashback: numeric('earned_cashback', { precision: 14, scale: 2 }).default('0.00').notNull(),
  total: numeric('total', { precision: 14, scale: 2 }).notNull(),
  
  // Status and Payment
  status: varchar('status', { length: 20 }).notNull(), // 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  paymentMethod: varchar('payment_method', { length: 20 }).notNull(), // 'cod' | 'cash' | 'debt' | 'zaincash' | 'qicard' | 'bank_transfer' | 'online'
  
  // Driver and Vehicle Tracking
  driverId: uuid('driver_id')
    .references(() => drivers.id, { onDelete: 'set null' }),
  vehicleId: uuid('vehicle_id')
    .references(() => vehicles.id, { onDelete: 'set null' }),
  collectionStatus: varchar('collection_status', { length: 30 }).default('pending').notNull(), // 'pending' | 'collected_cash' | 'debt_unpaid' | 'partial' | 'returned'
  collectedAmount: numeric('collected_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  remainingDebtAmount: numeric('remaining_debt_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  driverCashSettled: boolean('driver_cash_settled').default(false).notNull(),
  settledAmount: numeric('settled_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  settlementId: uuid('settlement_id')
    .references(() => driverSettlements.id, { onDelete: 'set null' }),
  inventoryRestored: boolean('inventory_restored').default(false).notNull(),

  // Delivery PIN Proof & Verification
  deliveryPinHash: varchar('delivery_pin_hash', { length: 255 }),
  deliveryPinEncrypted: text('delivery_pin_encrypted'),
  deliveryPinAttempts: integer('delivery_pin_attempts').default(0).notNull(),
  deliveryPinLockedUntil: timestamp('delivery_pin_locked_until', { withTimezone: true }),
  deliveryProofMethod: varchar('delivery_proof_method', { length: 30 }), // 'customer_pin' | 'admin_override'
  deliveryVerifiedAt: timestamp('delivery_verified_at', { withTimezone: true }),
  deliveryOverrideReason: text('delivery_override_reason'),
  deliveryOverrideBy: uuid('delivery_override_by')
    .references(() => authIdentities.id, { onDelete: 'set null' }),
  deliveryOverrideByName: varchar('delivery_override_by_name', { length: 150 }),
  
  // Timestamps and Notes
  notes: text('notes'),
  driverNotes: text('driver_notes'),
  driverAssignedAt: timestamp('driver_assigned_at', { withTimezone: true }),
  outForDeliveryAt: timestamp('out_for_delivery_at', { withTimezone: true }),
  driverArrivedAt: timestamp('driver_arrived_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_orders_account_id').on(table.accountId),
  index('idx_orders_status').on(table.status),
  index('idx_orders_driver_id').on(table.driverId),
  index('idx_orders_created_at').on(table.createdAt),
  index('idx_orders_delivery_verified_at').on(table.deliveryVerifiedAt),
  index('idx_orders_coupon_code_snap').on(table.couponCodeSnap),
  check('chk_order_status', sql`${table.status} IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')`),
  check('chk_order_total_non_negative', sql`${table.total} >= 0`),
  check('chk_order_subtotal_non_negative', sql`${table.subtotal} >= 0`),
  check('chk_order_settled_amount_non_negative', sql`${table.settledAmount} >= 0`),
  check('chk_order_delivery_proof_method', sql`${table.deliveryProofMethod} IS NULL OR ${table.deliveryProofMethod} IN ('customer_pin', 'admin_override')`),
  check('chk_order_delivery_pin_attempts_non_negative', sql`${table.deliveryPinAttempts} >= 0`),
]);

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'restrict' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  
  // Historical snapshots & Multi-unit inventory hierarchy (Addendum #5)
  itemNameSnap: varchar('item_name_snap', { length: 200 }).notNull(),
  unitLabelSnap: varchar('unit_label_snap', { length: 50 }).notNull(),
  soldUnit: varchar('sold_unit', { length: 20 }).notNull(), // 'carton' | 'box' | 'piece' | 'wholesale_unit' | 'market_unit'
  soldQuantity: integer('sold_quantity').notNull(),
  conversionFactorSnap: integer('conversion_factor_snap').notNull(), // e.g. 144 for carton, 24 for box, 1 for piece
  baseQuantityDeducted: integer('base_quantity_deducted').notNull(), // soldQuantity * conversionFactorSnap
  unitPriceSnap: numeric('unit_price_snap', { precision: 14, scale: 2 }).notNull(),
  unitCostSnap: numeric('unit_cost_pieces_snap', { precision: 14, scale: 4 }).notNull(),
  earnedCashback: numeric('earned_cashback', { precision: 14, scale: 2 }).default('0.00').notNull(),
  image: text('image'),
}, (table) => [
  index('idx_order_items_order_id').on(table.orderId),
  index('idx_order_items_product_id').on(table.productId),
  check('chk_order_item_sold_qty', sql`${table.soldQuantity} > 0`),
  check('chk_order_item_conversion_factor', sql`${table.conversionFactorSnap} > 0`),
  check('chk_order_item_base_deducted', sql`${table.baseQuantityDeducted} > 0`),
  // Mathematical integrity constraint: base_quantity_deducted = sold_quantity * conversion_factor_snap (DB-2A Item 5)
  check('chk_order_item_math_integrity', sql`${table.baseQuantityDeducted} = ${table.soldQuantity} * ${table.conversionFactorSnap}`),
]);

export const settlementOrders = pgTable('settlement_orders', {
  settlementId: uuid('settlement_id')
    .notNull()
    .references(() => driverSettlements.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'restrict' }),
  allocatedAmount: numeric('allocated_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.settlementId, table.orderId] }),
  index('idx_settlement_orders_order_id').on(table.orderId),
  check('chk_settlement_order_allocated_positive', sql`${table.allocatedAmount} > 0`),
]);
