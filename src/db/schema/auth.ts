import { pgTable, uuid, varchar, boolean, timestamp, text, index } from 'drizzle-orm/pg-core';

export const authIdentities = pgTable('auth_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  role: varchar('role', { length: 20 }).notNull().default('customer'), // 'customer' | 'staff' | 'driver'
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
}, (table) => [
  index('idx_auth_phone').on(table.phone),
  index('idx_auth_role').on(table.role),
]);

export const staffProfiles = pgTable('staff_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  authIdentityId: uuid('auth_identity_id')
    .notNull()
    .unique()
    .references(() => authIdentities.id, { onDelete: 'restrict' }),
  username: varchar('username', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  jobTitle: varchar('job_title', { length: 100 }).notNull(),
  role: varchar('role', { length: 30 }).notNull(), // 'accountant' | 'warehouse' | 'purchasing' | 'supervisor' | 'marketing' | 'custom'
  permissions: text('permissions').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_staff_username').on(table.username),
]);
