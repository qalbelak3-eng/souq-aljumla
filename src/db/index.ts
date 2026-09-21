import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

// Lazy / safe client to allow building and running without DATABASE_URL during foundation setup
export const queryClient = connectionString ? postgres(connectionString, { max: 10 }) : null;
export const db = queryClient ? drizzle(queryClient, { schema }) : null;

export function getDb() {
  if (!db) {
    throw new Error('DATABASE_URL environment variable is not configured.');
  }
  return db;
}

export * from './schema';
