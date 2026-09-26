import { pgTable, uuid, varchar, numeric, integer, boolean, timestamp, text, jsonb, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { staffProfiles, authIdentities } from './auth';
import { financialAccounts } from './accounts';
import { drivers } from './vehicles_drivers';
import { orders } from './orders';
import { categories } from './catalog';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  actionType: varchar('action_type', { length: 50 }).notNull(),
  actionLabel: varchar('action_label', { length: 150 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  categoryLabel: varchar('category_label', { length: 100 }),
  staffId: uuid('staff_id')
    .references(() => staffProfiles.id, { onDelete: 'set null' }),
  operatorSnapshot: jsonb('operator_snapshot'),
  targetType: varchar('target_type', { length: 50 }),
  targetId: varchar('target_id', { length: 100 }),
  targetReferenceNumber: varchar('target_reference_number', { length: 50 }),
  financialImpact: jsonb('financial_impact'),
  details: text('details').notNull(),
  severity: varchar('severity', { length: 20 }).default('info').notNull(), // 'info' | 'warning' | 'danger'
  ipAddress: varchar('ip_address', { length: 50 }),
}, (table) => [
  index('idx_audit_timestamp').on(table.timestamp),
  index('idx_audit_category').on(table.category),
  index('idx_audit_action').on(table.actionType),
  index('idx_audit_staff').on(table.staffId),
  check('chk_audit_severity', sql`${table.severity} IN ('info', 'warning', 'danger')`),
]);

export const coupons = pgTable('coupons', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  discountType: varchar('discount_type', { length: 20 }).notNull(), // 'percentage' | 'fixed'
  discountValue: numeric('discount_value', { precision: 14, scale: 2 }).notNull(),
  minOrderAmount: numeric('min_order_amount', { precision: 14, scale: 2 }),
  targetAudience: varchar('target_audience', { length: 30 }).default('all').notNull(),
  description: text('description'),
  usageLimit: integer('usage_limit'),
  usageCount: integer('usage_count').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true).notNull(),
  isArchived: boolean('is_archived').default(false).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_coupons_code').on(table.code),
  check('chk_coupon_discount_type', sql`${table.discountType} IN ('percentage', 'fixed')`),
  check('chk_coupon_discount_value', sql`${table.discountValue} > 0`),
  check('chk_coupon_usage_count', sql`${table.usageCount} >= 0`),
]);

export const driverRatings = pgTable('driver_ratings', {
  id: uuid('id').defaultRandom().primaryKey(),
  driverId: uuid('driver_id')
    .notNull()
    .references(() => drivers.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  orderNumber: varchar('order_number', { length: 50 }).notNull(),
  customerName: varchar('customer_name', { length: 150 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
  rating: integer('rating').notNull(), // 1 to 5
  ratingLabel: varchar('rating_label', { length: 50 }).notNull(),
  tag: varchar('tag', { length: 100 }),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_ratings_driver_id').on(table.driverId),
  index('idx_ratings_order_id').on(table.orderId),
  check('chk_rating_range', sql`${table.rating} BETWEEN 1 AND 5`),
]);

export const customerComplaints = pgTable('customer_complaints', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .references(() => financialAccounts.id, { onDelete: 'set null' }),
  customerName: varchar('customer_name', { length: 150 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
  businessName: varchar('business_name', { length: 150 }),
  city: varchar('city', { length: 100 }),
  text: text('text').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending' | 'in_progress' | 'resolved' | 'archived'
  adminReply: text('admin_reply'),
  repliedByStaffId: uuid('replied_by_staff_id')
    .references(() => staffProfiles.id, { onDelete: 'set null' }),
  repliedAt: timestamp('replied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_complaints_status').on(table.status),
  index('idx_complaints_phone').on(table.customerPhone),
  check('chk_complaint_status', sql`${table.status} IN ('pending', 'in_progress', 'resolved', 'archived')`),
]);

export const storeSettings = pgTable('store_settings', {
  id: integer('id').primaryKey().default(1),
  storeName: varchar('store_name', { length: 150 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  whatsapp: varchar('whatsapp', { length: 20 }),
  accountingWhatsapp: varchar('accounting_whatsapp', { length: 20 }),
  supportPhone: varchar('support_phone', { length: 20 }),
  email: varchar('email', { length: 100 }),
  address: text('address'),
  currency: varchar('currency', { length: 20 }).default('IQD').notNull(),
  deliveryConfig: jsonb('delivery_config'),
  cashbackConfig: jsonb('cashback_config'),
  homepageConfig: jsonb('homepage_config'),
  competitionsConfig: jsonb('competitions_config'),
  popupAdsConfig: jsonb('popup_ads_config'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const banners = pgTable('banners', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 150 }).notNull(),
  subtitle: text('subtitle'),
  image: text('image').notNull(),
  linkUrl: text('link_url'),
  badge: varchar('badge', { length: 50 }),
  isActive: boolean('is_active').default(true).notNull(),
  orderIndex: integer('order_index').default(0).notNull(),
  position: varchar('position', { length: 30 }).default('top').notNull(),
  categoryId: uuid('category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  categoryName: varchar('category_name', { length: 100 }),
  isCampaignShowcase: boolean('is_campaign_showcase').default(false).notNull(),
  campaignBgColor: varchar('campaign_bg_color', { length: 30 }),
  campaignProductsTitle: varchar('campaign_products_title', { length: 150 }),
  campaignProductIds: jsonb('campaign_product_ids').default([]),
  isTextShelf: boolean('is_text_shelf').default(false).notNull(),
  isSpriteSlider: boolean('is_sprite_slider').default(false).notNull(),
  bannerBgColor: varchar('banner_bg_color', { length: 30 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  endpoint: text('endpoint').notNull().unique(),
  p256dhKey: text('p256dh_key').notNull(),
  authKey: text('auth_key').notNull(),
  userId: uuid('user_id')
    .references(() => authIdentities.id, { onDelete: 'set null' }),
  userPhone: varchar('user_phone', { length: 20 }),
  userName: varchar('user_name', { length: 150 }),
  accountType: varchar('account_type', { length: 50 }),
  userAgent: text('user_agent'),
  deviceType: varchar('device_type', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
}, (table) => [
  index('idx_push_endpoint').on(table.endpoint),
]);

export const pushNotificationLogs = pgTable('push_notification_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').notNull(),
  image: text('image'),
  icon: text('icon'),
  badge: text('badge'),
  url: text('url'),
  targetAudience: varchar('target_audience', { length: 50 }).notNull(),
  targetAudienceLabel: varchar('target_audience_label', { length: 100 }).notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  successCount: integer('success_count').default(0).notNull(),
  failureCount: integer('failure_count').default(0).notNull(),
  sentByStaffId: uuid('sent_by_staff_id')
    .references(() => staffProfiles.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const luckyWheelPrizes = pgTable('lucky_wheel_prizes', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: varchar('label', { length: 100 }).notNull(),
  subLabel: varchar('sub_label', { length: 100 }),
  type: varchar('type', { length: 30 }).notNull(), // 'cashback' | 'coupon' | 'delivery' | 'try_again'
  value: varchar('value', { length: 100 }).notNull(),
  couponCode: varchar('coupon_code', { length: 50 }),
  color: varchar('color', { length: 30 }).notNull(),
  textColor: varchar('text_color', { length: 30 }).notNull(),
  probability: integer('probability').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
