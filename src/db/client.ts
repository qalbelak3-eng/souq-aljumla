import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Domain-Level Data Source Routing Types
 * Every domain has exactly ONE authoritative write source at any time.
 * Wave 1 Default: All domains are set to 'json'.
 */
export type DomainName =
  | 'METADATA'
  | 'CATALOG_BASE'
  | 'ACCOUNTS'
  | 'COMMERCE'
  | 'FINANCE';

export type DataSourceType = 'json' | 'postgres';

export function getDomainDataSource(domain: DomainName): DataSourceType {
  const envVar = `DATA_SOURCE_${domain}`;
  const val = (process.env[envVar] || 'json').trim().toLowerCase();
  return val === 'postgres' ? 'postgres' : 'json';
}

export function getAllDomainDataSources(): Record<DomainName, DataSourceType> {
  return {
    METADATA: getDomainDataSource('METADATA'),
    CATALOG_BASE: getDomainDataSource('CATALOG_BASE'),
    ACCOUNTS: getDomainDataSource('ACCOUNTS'),
    COMMERCE: getDomainDataSource('COMMERCE'),
    FINANCE: getDomainDataSource('FINANCE'),
  };
}

/**
 * Helper to sanitize database connection strings so passwords or tokens
 * are never exposed in logs, diagnostics, or error responses.
 */
export function sanitizeDatabaseUrl(url?: string): string {
  if (!url) return '[NOT_SET]';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '******';
    }
    return parsed.toString();
  } catch {
    // If not a standard URL, mask characters between colon and @
    return url.replace(/(:[^:@]+@)/, ':******@');
  }
}

/**
 * Global singleton reference container to prevent creating multiple Connection Pools
 * on every Next.js route request or Fast Refresh / Hot Reload cycle in development.
 */
interface GlobalDbContainer {
  __postgresClient?: postgres.Sql;
  __drizzleDb?: ReturnType<typeof drizzle<typeof schema>>;
}

const globalContainer = globalThis as unknown as GlobalDbContainer;

/**
 * Returns whether DATABASE_URL is present in the current environment.
 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Creates or retrieves the singleton postgres-js client.
 * Pool settings are tuned for production resilience and connection reuse.
 */
export function getPostgresClient(): postgres.Sql {
  if (!globalContainer.__postgresClient) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString || !connectionString.trim()) {
      throw new Error('DATABASE_URL environment variable is missing.');
    }

    const maxPoolSize = parseInt(process.env.DB_POOL_MAX || '10', 10);
    const connectTimeoutSec = parseInt(process.env.DB_CONNECT_TIMEOUT_SEC || '5', 10);

    globalContainer.__postgresClient = postgres(connectionString.trim(), {
      max: maxPoolSize,
      idle_timeout: 20,
      connect_timeout: connectTimeoutSec,
      prepare: false, // Disables prepared statements for full compatibility with connection poolers
      onnotice: () => {}, // Suppress notice noise in console
    });
  }

  return globalContainer.__postgresClient;
}

/**
 * Creates or retrieves the singleton Drizzle ORM instance wrapping the postgres client.
 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!globalContainer.__drizzleDb) {
    const client = getPostgresClient();
    globalContainer.__drizzleDb = drizzle(client, { schema });
  }

  return globalContainer.__drizzleDb;
}

/**
 * Helper to gracefully close the connection pool during shutdown or teardown.
 */
export async function closePostgresClient(): Promise<void> {
  if (globalContainer.__postgresClient) {
    await globalContainer.__postgresClient.end();
    globalContainer.__postgresClient = undefined;
    globalContainer.__drizzleDb = undefined;
  }
}
