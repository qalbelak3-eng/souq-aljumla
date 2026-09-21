import { pgTable, uuid, varchar, numeric, boolean, timestamp, text, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { authIdentities, staffProfiles } from './auth';
import { financialAccounts } from './accounts';

export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(), // e.g. "كيا حمل أبيض 2022"
  plateNumber: varchar('plate_number', { length: 50 }).notNull().unique(),
  type: varchar('type', { length: 50 }).notNull(), // "كيا حمل" | "بيك آب" | "ستوتة" | "دراجة" | "أخرى"
  modelYear: varchar('model_year', { length: 10 }),
  isActive: boolean('is_active').default(true).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const drivers = pgTable('drivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  authIdentityId: uuid('auth_identity_id')
    .notNull()
    .unique()
    .references(() => authIdentities.id, { onDelete: 'restrict' }),
  financialAccountId: uuid('financial_account_id')
    .notNull()
    .unique()
    .references(() => financialAccounts.id, { onDelete: 'restrict' }),
  defaultVehicleId: uuid('default_vehicle_id')
    .references(() => vehicles.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 150 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  isActive: boolean('is_active').default(true).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_drivers_phone').on(table.phone),
]);

export const driverSettlements = pgTable('driver_settlements', {
  id: uuid('id').defaultRandom().primaryKey(),
  settlementNumber: varchar('settlement_number', { length: 50 }).notNull().unique(),
  driverId: uuid('driver_id')
    .notNull()
    .references(() => drivers.id, { onDelete: 'restrict' }),
  expectedAmount: numeric('expected_amount', { precision: 14, scale: 2 }).notNull(),
  actualAmount: numeric('actual_amount', { precision: 14, scale: 2 }).notNull(),
  variance: numeric('variance', { precision: 14, scale: 2 }).notNull(), // actualAmount - expectedAmount
  shortageAmount: numeric('shortage_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  overageAmount: numeric('overage_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  type: varchar('type', { length: 30 }).notNull(), // 'normal' | 'shortage' | 'overage' | 'shortage_repayment'
  status: varchar('status', { length: 20 }).default('settled').notNull(), // 'settled' | 'partial' | 'pending'
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staffProfiles.id, { onDelete: 'restrict' }),
  repaymentOfId: uuid('repayment_of_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_settlements_driver_id').on(table.driverId),
  index('idx_settlements_number').on(table.settlementNumber),
  check('chk_settlement_actual_non_negative', sql`${table.actualAmount} >= 0`),
  check('chk_settlement_type', sql`${table.type} IN ('normal', 'shortage', 'overage', 'shortage_repayment')`),
]);
