import path from 'path';
import os from 'os';
import fs from 'fs';
import assert from 'assert';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  SESSION_COOKIE_NAME,
  signAdminSession,
  getAuthenticatedAdmin,
} from './src/lib/auth.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54371;
const tempDir = path.join(os.tmpdir(), 'ep_test_auth_mig_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'auth-and-migration-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'auth-and-migration-secret-min-32-chars-long';

let ep = null;
let sql = null;

async function runSqlScript(client, filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes('--> statement-breakpoint')) {
    const stmts = content.split('--> statement-breakpoint');
    for (const stmt of stmts) {
      const trimmed = stmt.trim();
      if (trimmed) {
        await client.unsafe(trimmed);
      }
    }
  } else {
    await client.unsafe(content);
  }
}

async function startDb() {
  console.log('Starting embedded PostgreSQL on port', PORT);
  ep = new Ep({ port: PORT, databaseDir: tempDir });
  await ep.initialise();
  await ep.start();
  sql = postgres(dbUrl, { max: 5 });
}

async function stopDb() {
  if (sql) {
    try { await sql.end(); } catch {}
  }
  if (ep) {
    try { await ep.stop(); } catch {}
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}

async function runAll() {
  await startDb();

  console.log('\n===============================================================');
  console.log('   PART 1: AUTH & POSTGRESQL AUTHORITY HARDENING TESTS        ');
  console.log('===============================================================');

  // Apply migrations up to 0013 first
  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  const allSqlFiles = fs.readdirSync(drizzleDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of allSqlFiles) {
    await runSqlScript(sql, path.join(drizzleDir, f));
  }

  // 1. Create a staff in PostgreSQL with role: 'staff' and limited permissions: ['orders']
  const [staffAuth] = await sql`
    INSERT INTO auth_identities (phone, role, is_active)
    VALUES ('07710001122', 'staff', true)
    RETURNING id;
  `;
  const [staffProfile] = await sql`
    INSERT INTO staff_profiles (auth_identity_id, username, name, role, permissions, job_title)
    VALUES (${staffAuth.id}, 'sales_clerk', 'موظف مبيعات', 'staff', ARRAY['orders'], 'موظف مبيعات')
    RETURNING id;
  `;

  // 2. Generate a forged or old JWT claiming role: 'admin'
  const staleAdminJwt = signAdminSession({
    userId: staffProfile.id,
    username: 'sales_clerk',
    role: 'admin', // Stale or forged claim in JWT
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const reqWithStaleJwt = new Request('http://localhost:3000/api/admin/orders', {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${staleAdminJwt}`,
    },
  });

  const authenticated = await getAuthenticatedAdmin(reqWithStaleJwt);
  assert(authenticated !== null, 'Authenticated admin resolved');
  assert(authenticated.username === 'sales_clerk', 'Username matches staff profile');
  // Crucial invariant: Even though JWT says admin, PostgreSQL says staff -> Result is staff!
  assert(authenticated.role === 'staff', 'Role is strictly "staff" as authoritative in PostgreSQL, NOT "admin" from JWT');
  assert.deepStrictEqual(authenticated.permissions, ['orders'], 'Permissions are strictly staff permissions from PostgreSQL, NOT ["*"]');
  console.log('   ✅ Stale JWT claiming "admin" strictly overridden by PostgreSQL authority: role="staff", permissions=["orders"]');

  // 3. Deactivate the staff in PostgreSQL
  await sql`UPDATE auth_identities SET is_active = false WHERE id = ${staffAuth.id};`;

  const authenticatedDeactivated = await getAuthenticatedAdmin(reqWithStaleJwt);
  assert(authenticatedDeactivated === null, 'Deactivated staff in PostgreSQL rejected immediately (returns null, 401)');
  console.log('   ✅ Deactivated staff in PostgreSQL immediately invalidates session (returns null)');

  // 4. Token with non-existent userId / username in PostgreSQL
  const ghostJwt = signAdminSession({
    userId: '00000000-0000-0000-0000-000000000099',
    username: 'ghost_admin',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const reqGhost = new Request('http://localhost:3000/api/admin/orders', {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${ghostJwt}`,
    },
  });
  const authenticatedGhost = await getAuthenticatedAdmin(reqGhost);
  assert(authenticatedGhost === null, 'Non-existent staff profile in PostgreSQL strictly rejected (returns null)');
  console.log('   ✅ Non-existent staff in PostgreSQL rejected (returns null)');

  console.log('\n===============================================================');
  console.log('   PART 2: DRIVER RATINGS MIGRATION 0014 STRICT BACKFILL TESTS ');
  console.log('===============================================================');

  // Create driver and customer data for migration testing
  const [driverAuth] = await sql`
    INSERT INTO auth_identities (phone, role, is_active)
    VALUES ('07720003344', 'driver', true)
    RETURNING id;
  `;
  const [driverAcc] = await sql`
    INSERT INTO financial_accounts (auth_identity_id, account_code, name, phone, category, is_active)
    VALUES (${driverAuth.id}, 'ACC-DRV-1', 'سائق تجريبي', '07720003344', 'driver', true)
    RETURNING id;
  `;
  const [driverRow] = await sql`
    INSERT INTO drivers (auth_identity_id, financial_account_id, name, phone, is_active)
    VALUES (${driverAuth.id}, ${driverAcc.id}, 'سائق تجريبي', '07720003344', true)
    RETURNING id;
  `;
  const [custAuth] = await sql`
    INSERT INTO auth_identities (phone, role, is_active)
    VALUES ('07730005566', 'customer', true)
    RETURNING id;
  `;
  const [custAccount] = await sql`
    INSERT INTO financial_accounts (auth_identity_id, account_code, name, phone, category, is_active)
    VALUES (${custAuth.id}, 'ACC-MIG-1', 'زبون التقييم', '07730005566', 'customer', true)
    RETURNING id;
  `;
  const [orderRow] = await sql`
    INSERT INTO orders (order_number, account_id, customer_name_snap, customer_phone_snap, delivery_address_snap, subtotal, total, status, payment_method)
    VALUES ('INV-MIG-1', ${custAccount.id}, 'زبون التقييم', '07730005566', 'بغداد', 10000, 10000, 'delivered', 'cod')
    RETURNING id;
  `;

  // Drop table driver_ratings to simulate pre-migration state with legacy columns
  await sql`DROP TABLE IF EXISTS "driver_ratings" CASCADE;`;
  await sql`
    CREATE TABLE "driver_ratings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "driver_id" uuid NOT NULL REFERENCES "drivers"("id"),
      "order_id" uuid NOT NULL REFERENCES "orders"("id"),
      "order_number" varchar(50) NOT NULL,
      "customer_name" varchar(150) NOT NULL,
      "customer_phone" varchar(20) NOT NULL,
      "rating" numeric(2,1) NOT NULL,
      "tag" varchar(100),
      "comment" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `;

  // Insert a backfillable row (matches order + account + auth_identities)
  await sql`
    INSERT INTO "driver_ratings" (driver_id, order_id, order_number, customer_name, customer_phone, rating, comment)
    VALUES (${driverRow.id}, ${orderRow.id}, 'INV-MIG-1', 'زبون التقييم', '07730005566', 5.0, 'خدمة ممتازة');
  `;

  // Run migration 0014
  console.log('   Executing 0014_driver_ratings.sql on backfillable data...');
  const migration0014Path = path.join(drizzleDir, '0014_driver_ratings.sql');
  await runSqlScript(sql, migration0014Path);

  // Verify: customer_auth_identity_id column exists, is NOT NULL, and has correct backfilled value
  const [migratedRow] = await sql`
    SELECT customer_auth_identity_id, rating FROM "driver_ratings" WHERE order_number = 'INV-MIG-1';
  `;
  assert(migratedRow !== undefined, 'Row exists in driver_ratings');
  assert(migratedRow.customer_auth_identity_id === custAuth.id, 'customer_auth_identity_id backfilled accurately to customer auth identity');

  // Verify NOT NULL constraint is enforced on PostgreSQL column
  const [colMeta] = await sql`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'driver_ratings' AND column_name = 'customer_auth_identity_id';
  `;
  assert(colMeta.is_nullable === 'NO', 'customer_auth_identity_id is strictly NOT NULL in PostgreSQL schema');
  console.log('   ✅ Case 1: Backfillable historical data migrated successfully and NOT NULL enforced');

  // Case 2: Unlinkable historical row
  // Reset table to pre-migration nullable state and insert an orphan historical row
  await sql`DROP TABLE IF EXISTS "driver_ratings" CASCADE;`;
  await sql`
    CREATE TABLE "driver_ratings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "driver_id" uuid NOT NULL REFERENCES "drivers"("id"),
      "order_id" uuid NOT NULL REFERENCES "orders"("id"),
      "order_number" varchar(50) NOT NULL,
      "customer_name" varchar(150) NOT NULL,
      "customer_phone" varchar(20) NOT NULL,
      "rating" numeric(2,1) NOT NULL,
      "tag" varchar(100),
      "comment" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `;

  // Create a customer financial account with NO auth identity (auth_identity_id: NULL)
  const [orphanAcc] = await sql`
    INSERT INTO financial_accounts (auth_identity_id, account_code, name, phone, category, is_active)
    VALUES (NULL, 'ACC-ORPHAN', 'حساب يتيم بدون هوية', '07799999999', 'customer', true)
    RETURNING id;
  `;

  // Orphan rating on a guest order where financial account has NULL auth identity and phone has no matching auth identity
  const [orphanGuestOrder] = await sql`
    INSERT INTO orders (order_number, account_id, customer_name_snap, customer_phone_snap, delivery_address_snap, subtotal, total, status, payment_method)
    VALUES ('INV-GUEST-ORPHAN', ${orphanAcc.id}, 'زبون ضيف يتيم', '07799999999', 'بغداد', 10000, 10000, 'delivered', 'cod')
    RETURNING id;
  `;

  await sql`
    INSERT INTO "driver_ratings" (driver_id, order_id, order_number, customer_name, customer_phone, rating, comment)
    VALUES (${driverRow.id}, ${orphanGuestOrder.id}, 'INV-ORPHAN-1', 'زبون غير معروف', '07799999999', 4.0, 'تقييم تاريخي يتيم');
  `;

  console.log('   Executing 0014_driver_ratings.sql on unlinkable orphan row (expecting deliberate failure)...');
  let migrationFailed = false;
  let failureErrorMessage = '';
  try {
    await runSqlScript(sql, migration0014Path);
  } catch (err) {
    migrationFailed = true;
    failureErrorMessage = err.message || String(err);
  }

  assert(migrationFailed === true, 'Migration strictly failed when an unlinkable historical row is encountered');
  assert(failureErrorMessage.includes('MIGRATION_FAILED: Cannot enforce NOT NULL on driver_ratings.customer_auth_identity_id. Found 1 unlinked historical rating row(s)'),
    'Failure error message explicitly reports unlinked count (1) and aborts migration');
  console.log(`   ✅ Case 2: Migration failed fast with explicit error: "${failureErrorMessage.trim().split('\\n')[0]}"`);

  // Ensure data was NOT deleted or mutated
  const [preservedOrphan] = await sql`SELECT count(*)::int as count FROM "driver_ratings" WHERE order_number = 'INV-ORPHAN-1';`;
  assert(preservedOrphan.count === 1, 'Orphan historical row was preserved completely without data loss');
  console.log('   ✅ Zero data loss: Orphan historical row intact in database');

  console.log('\n===============================================================');
  console.log('   ALL AUTH & MIGRATION HARDENING TESTS PASSED SUCCESSFULLY!    ');
  console.log('===============================================================\n');
}

main();

async function main() {
  try {
    await runAll();
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    await stopDb();
  }
}
