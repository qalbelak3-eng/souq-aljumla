import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import { getPostgresClient, isDatabaseConfigured, getAllDomainDataSources } from '@/db/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const REQUIRED_MIGRATION_COUNT = 6;
const EXPECTED_LATEST_MIGRATION_TIMESTAMP = '1789999000000';
const EXPECTED_LATEST_MIGRATION_TAG = '0005_audit_hardening_triggers';

interface CheckItem { name: string; passed: boolean; details?: any; error?: string; }

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
  const admin = await pgGetActiveStaffForSession({ userId: session.userId, username: session.username });
  if (!admin) return NextResponse.json({ success: false, error: 'الجلسة غير صالحة أو الحساب غير فعال' }, { status: 401 });
  const isAuthorizedAdmin = session.role === 'admin' || admin.role === 'admin' || admin.role === 'master' || (admin.permissions || []).includes('*');
  if (!isAuthorizedAdmin) return NextResponse.json({ success: false, error: 'هذه العملية محصورة بصلاحيات المدير العام فقط (Master Admin)' }, { status: 403 });

  const domainRouting = getAllDomainDataSources();
  const checks: Record<string, CheckItem> = {};
  const timestamp = new Date().toISOString();
  if (!isDatabaseConfigured()) return NextResponse.json({ success: false, status: 'UNHEALTHY', timestamp, error: 'DATABASE_URL environment variable is not configured', domains: domainRouting }, { status: 503 });

  let sqlClient;
  try { sqlClient = getPostgresClient(); }
  catch (err: any) { console.error('[DB-HEALTH] Database connection initialization error:', err?.message); return NextResponse.json({ success: false, status: 'UNHEALTHY', timestamp, error: 'PostgreSQL connection unavailable', domains: domainRouting }, { status: 503 }); }

  try {
    const pingStart = Date.now();
    const pingResult = await sqlClient`SELECT 1 as ping, version(), current_database() as database;`;
    checks.connectivity = { name: 'Connectivity & Ping (SELECT 1)', passed: pingResult.length > 0 && pingResult[0].ping === 1, details: { latencyMs: Date.now() - pingStart, database: pingResult[0].database, version: pingResult[0].version?.split(',')[0] || 'Unknown' } };

    const requiredTables = ['vouchers','orders','order_items','products','financial_accounts','inventory_movements','driver_settlements','cash_vault_movements','categories','staff_profiles'];
    const tablesInDb = await sqlClient`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`;
    const existingTableSet = new Set(tablesInDb.map((t: any) => String(t.table_name)));
    const missingTables = requiredTables.filter(t => !existingTableSet.has(t));
    checks.coreTables = { name: 'Core Database Tables', passed: missingTables.length === 0, details: { totalFound: existingTableSet.size, missingRequired: missingTables } };

    const trackingTableCheck = await sqlClient`SELECT table_name FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations';`;
    const trackingTableExists = trackingTableCheck.length > 0;
    let appliedMigrations: any[] = [];
    if (trackingTableExists) appliedMigrations = await sqlClient`SELECT id, hash, created_at::text as created_at FROM "drizzle"."__drizzle_migrations" ORDER BY id ASC;`;
    const appliedCount = appliedMigrations.length;
    const latestMigration = appliedCount > 0 ? appliedMigrations[appliedCount - 1] : null;
    const latestCreatedAt = latestMigration ? String(latestMigration.created_at) : null;
    const allHashesValid = appliedMigrations.length === REQUIRED_MIGRATION_COUNT && appliedMigrations.every(m => typeof m.hash === 'string' && m.hash.length === 64);
    const allRequiredMigrationsApplied = trackingTableExists && appliedCount === REQUIRED_MIGRATION_COUNT && latestCreatedAt === EXPECTED_LATEST_MIGRATION_TIMESTAMP && allHashesValid;
    checks.migrations = { name: 'Drizzle Migrations History Tracking', passed: allRequiredMigrationsApplied, details: { trackingTableExists, trackingTablePath: '"drizzle"."__drizzle_migrations"', appliedCount, requiredCount: REQUIRED_MIGRATION_COUNT, allHashesVerified: allHashesValid, latestAppliedTimestamp: latestCreatedAt, expectedLatestTimestamp: EXPECTED_LATEST_MIGRATION_TIMESTAMP, expectedLatestTag: EXPECTED_LATEST_MIGRATION_TAG } };

    const requiredFunctions = ['enforce_voucher_immutability','enforce_order_archive_only','verify_driver_repayment_integrity','enforce_inventory_movement_immutability','verify_inventory_movement_reference'];
    const functionsInDb = await sqlClient`SELECT proname FROM pg_proc WHERE proname = ANY(${requiredFunctions});`;
    const existingFunctionSet = new Set(functionsInDb.map((f: any) => String(f.proname)));
    const missingFunctions = requiredFunctions.filter(f => !existingFunctionSet.has(f));
    const requiredConstraints = ['uq_voucher_reversal_of_id','chk_product_packaging_math','chk_settlement_variance_math'];
    const constraintsInDb = await sqlClient`SELECT conname as name FROM pg_constraint WHERE conname = ANY(${requiredConstraints}) UNION SELECT indexname as name FROM pg_indexes WHERE indexname = ANY(${requiredConstraints});`;
    const existingConstraintSet = new Set(constraintsInDb.map((c: any) => String(c.name)));
    const missingConstraints = requiredConstraints.filter(c => !existingConstraintSet.has(c));
    checks.hardening = { name: 'DB-2 Critical Hardening Triggers & Constraints', passed: missingFunctions.length === 0 && missingConstraints.length === 0, details: { missingFunctions, missingConstraints } };

    const poolTestStart = Date.now();
    const poolResults = await Promise.all(Array.from({ length: 3 }, (_, i) => sqlClient`SELECT ${i}::int as query_id;`));
    checks.poolLifecycle = { name: 'Connection Pool Acquire & Release Lifecycle', passed: poolResults.every((res, i) => Number(res[0]?.query_id) === i), details: { concurrentQueriesRun: 3, lifecycleDurationMs: Date.now() - poolTestStart } };
    const allPassed = Object.values(checks).every(c => c.passed);
    return NextResponse.json({ success: allPassed, status: allPassed ? 'HEALTHY' : 'UNHEALTHY', timestamp, operator: { username: admin.username, role: admin.role }, checks, domains: domainRouting }, { status: allPassed ? 200 : 503 });
  } catch (err: any) {
    console.error('[DB-HEALTH] Database query execution failure:', err?.message);
    return NextResponse.json({ success: false, status: 'UNHEALTHY', timestamp, error: 'PostgreSQL connection unavailable', domains: domainRouting }, { status: 503 });
  }
}
