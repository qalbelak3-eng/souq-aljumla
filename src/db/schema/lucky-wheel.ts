import { check, integer, jsonb, pgTable, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const luckyWheelSettings = pgTable('lucky_wheel_settings', {
  id: integer('id').primaryKey(),
  settings: jsonb('settings').default({}).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('chk_lucky_wheel_settings_singleton', sql`${table.id} = 1`),
]);
