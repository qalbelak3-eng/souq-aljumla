import { pgTable, uuid, varchar, numeric, integer, boolean, date, timestamp, text, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  image: text('image'),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 30 }),
  orderIndex: integer('order_index').default(0).notNull(),
  hideFromHome: boolean('hide_from_home').default(false).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_categories_slug').on(table.slug),
]);

export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  logo: text('logo'),
  color: varchar('color', { length: 30 }),
  icon: varchar('icon', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  barcode: varchar('barcode', { length: 100 }).unique(),
  description: text('description'),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  companyId: uuid('company_id')
    .references(() => companies.id, { onDelete: 'set null' }),
  
  // Base Stock Unit = Piece (القطعة المفردة) as approved in Addendum #5
  currentStockPieces: integer('current_stock_pieces').default(0).notNull(),
  minStockAlert: integer('min_stock_alert').default(5).notNull(),
  
  // Packaging Breakdown Hierarchy
  boxesPerCarton: integer('boxes_per_carton').default(1).notNull(),
  itemsPerBox: integer('items_per_box').default(1).notNull(),
  piecesPerCarton: integer('pieces_per_carton').default(1).notNull(),
  
  // Units labels
  retailUnit: varchar('retail_unit', { length: 50 }).notNull(), // e.g. "قطعة مفردة"
  wholesaleUnit: varchar('wholesale_unit', { length: 50 }).notNull(), // e.g. "كرتون جملة"
  marketUnit: varchar('market_unit', { length: 50 }),
  
  // Cost Prices (High precision for fractions as approved in Addendum)
  pieceCostPrice: numeric('piece_cost_price', { precision: 14, scale: 4 }).default('0.0000').notNull(),
  boxCostPrice: numeric('box_cost_price', { precision: 14, scale: 4 }).default('0.0000').notNull(),
  costPrice: numeric('cost_price', { precision: 14, scale: 2 }).default('0.00').notNull(), // سعر تكلفة الكرتون
  
  // Selling Prices
  price: numeric('price', { precision: 14, scale: 2 }).notNull(), // سعر البيع بالمفرد
  wholesalePrice: numeric('wholesale_price', { precision: 14, scale: 2 }).notNull(), // سعر كرتون الجملة
  marketPrice: numeric('market_price', { precision: 14, scale: 2 }), // سعر الماركت
  boxPrice: numeric('box_price', { precision: 14, scale: 2 }), // سعر بيع العلبة
  specialPrice: numeric('special_price', { precision: 14, scale: 2 }),
  vipPrice: numeric('vip_price', { precision: 14, scale: 2 }),
  wholesaleMinQuantity: integer('wholesale_min_quantity').default(1),
  
  // Dates and Shelf Life
  productionDate: date('production_date'),
  expiryDate: date('expiry_date'),
  expiryAlertDays: integer('expiry_alert_days').default(30),
  
  // Merchandising flags
  isFeatured: boolean('is_featured').default(false).notNull(),
  isBestSeller: boolean('is_best_seller').default(false).notNull(),
  isNew: boolean('is_new').default(false).notNull(),
  images: text('images').array().notNull().default([]),
  
  // Cashback incentives per piece
  cashbackCustomerAmount: numeric('cashback_customer_amount', { precision: 14, scale: 2 }),
  cashbackMarketAmount: numeric('cashback_market_amount', { precision: 14, scale: 2 }),
  cashbackMerchantAmount: numeric('cashback_merchant_amount', { precision: 14, scale: 2 }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_products_category').on(table.categoryId),
  index('idx_products_company').on(table.companyId),
  index('idx_products_barcode').on(table.barcode),
  check('chk_product_stock_non_negative', sql`${table.currentStockPieces} >= 0`),
  check('chk_product_boxes_carton', sql`${table.boxesPerCarton} > 0`),
  check('chk_product_items_box', sql`${table.itemsPerBox} > 0`),
  check('chk_product_price_non_negative', sql`${table.price} >= 0`),
  check('chk_product_wholesale_price_non_negative', sql`${table.wholesalePrice} >= 0`),
  check('chk_product_packaging_math', sql`${table.piecesPerCarton} = ${table.boxesPerCarton} * ${table.itemsPerBox}`),
]);

export const productOffers = pgTable('product_offers', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  originalPrice: numeric('original_price', { precision: 14, scale: 2 }).notNull(),
  originalWholesalePrice: numeric('original_wholesale_price', { precision: 14, scale: 2 }),
  offerPrice: numeric('offer_price', { precision: 14, scale: 2 }).notNull(),
  offerWholesalePrice: numeric('offer_wholesale_price', { precision: 14, scale: 2 }),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
  badge: varchar('badge', { length: 50 }),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isArchived: boolean('is_archived').default(false).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_offers_product_id').on(table.productId),
  index('idx_offers_is_archived').on(table.isArchived),
  check('chk_offer_price_lower', sql`${table.offerPrice} < ${table.originalPrice}`),
]);
