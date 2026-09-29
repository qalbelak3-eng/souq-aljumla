import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  pgCreateOrder,
  pgGetOrderById,
  computeOrderPayloadFingerprint,
  pgResolveCustomerIdentity,
} from './src/lib/postgres-orders.ts';
import { pgCreateProduct, pgCreateCategory } from './src/lib/postgres-catalog.ts';
import { pgResolveCustomerAccount } from './src/lib/postgres-cashback.ts';
import { toCanonicalIraqiPhone } from './src/lib/phone-utils.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54360;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2c2_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '10';
process.env.DATA_SOURCE_CATALOG_BASE = 'postgres';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2c2-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2c2-test-secret-min-32-chars-long';

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

async function startDatabase() {
  console.log('1. Starting embedded PostgreSQL on port ' + PORT + '...');
  ep = new Ep({
    port: PORT,
    databaseDir: tempDir,
    user: 'postgres',
    password: 'password',
    persistent: false,
  });

  await ep.initialise();
  await ep.start();
  console.log('   PostgreSQL started successfully.');

  sql = postgres(dbUrl, { max: 10 });

  console.log('2. Applying schema and migrations (0000 -> 0016)...');
  const schemaFile = path.resolve(process.cwd(), 'drizzle/0000_magical_warbound.sql');
  await runSqlScript(sql, schemaFile);

  const migrationFiles = fs
    .readdirSync(path.resolve(process.cwd(), 'drizzle'))
    .filter((f) => f.endsWith('.sql') && f !== '0000_magical_warbound.sql')
    .sort();

  for (const m of migrationFiles) {
    const fullPath = path.resolve(process.cwd(), 'drizzle', m);
    await runSqlScript(sql, fullPath);
  }
  console.log(`   All ${migrationFiles.length} migrations applied.`);
}

async function stopDatabase() {
  console.log('Cleaning up database...');
  if (sql) {
    try {
      await sql.end({ timeout: 5 });
    } catch {}
  }
  if (ep) {
    try {
      await ep.stop();
    } catch {}
  }
  // Wait a short moment for Windows file handles to be released
  await new Promise((r) => setTimeout(r, 800));
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}
  console.log('Database stopped and temp dir removed.');
}

function assert(condition, message) {
  if (!condition) {
    console.error('❌ Assertion failed: ' + message);
    throw new Error('Assertion failed: ' + message);
  }
  console.log('   ✅ ' + message);
}

async function runTests() {
  console.log('\n======================================================');
  console.log('Running Commerce-2C2 Hardening Verification Suite');
  console.log('======================================================\n');

  // Seed sample category and products
  const testCat = await pgCreateCategory({
    name: 'قسم اختبار Commerce-2C2',
    orderIndex: 1,
  });

  const prod1 = await pgCreateProduct({
    name: 'شيبس البطل 2C2',
    category: testCat.id,
    price: 1000,
    costPrice: 600,
    stock: 500,
    retailUnit: 'قطعة',
    piecesPerCarton: 20,
    isActive: true,
  });

  const prod2 = await pgCreateProduct({
    name: 'عصير راني 2C2',
    category: testCat.id,
    price: 1500,
    costPrice: 900,
    stock: 300,
    retailUnit: 'قطعة',
    piecesPerCarton: 24,
    isActive: true,
  });

  // ---------------------------------------------------------
  // TEST 1: Migration 0016 Structural Verification
  // ---------------------------------------------------------
  console.log('\n--- TEST 1: Migration 0016 Schema & Index Verification ---');
  const cols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name IN ('idempotency_key', 'request_fingerprint');
  `;
  assert(cols.length === 2, 'Columns idempotency_key and request_fingerprint exist in orders table');

  const orderIndexes = await sql`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'orders' AND indexname = 'uq_orders_idempotency_key';
  `;
  assert(orderIndexes.length === 1, 'Partial unique index uq_orders_idempotency_key exists on orders');
  assert(orderIndexes[0].indexdef.includes('idempotency_key IS NOT NULL'), 'uq_orders_idempotency_key is a partial index');

  const cbIndexes = await sql`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'cashback_ledger' AND indexname IN (
      'uq_cashback_ledger_order_earned', 
      'uq_cashback_ledger_order_redeemed', 
      'uq_cashback_ledger_order_reversed'
    );
  `;
  assert(cbIndexes.length === 3, 'All 3 partial unique indexes exist on cashback_ledger');

  // ---------------------------------------------------------
  // TEST 2: Order Creation Stores Idempotency Key & Fingerprint
  // ---------------------------------------------------------
  console.log('\n--- TEST 2: Order Creation Stores Idempotency Key & Fingerprint ---');
  const testKey1 = 'chk-key-001-' + Date.now();
  const orderInput1 = {
    customer: {
      name: 'علي حسن',
      phone: '07701234567',
      city: 'كربلاء',
      address: 'حي العباس',
    },
    items: [
      {
        productId: prod1.id,
        quantity: 5,
        saleType: 'retail',
        price: 1000,
      },
    ],
    paymentMethod: 'cod',
    idempotencyKey: testKey1,
    createAccountIfMissing: true,
  };

  const expectedFingerprint1 = computeOrderPayloadFingerprint(orderInput1);
  assert(Boolean(expectedFingerprint1) && expectedFingerprint1.length === 64, 'Computed fingerprint is valid 64-char SHA-256');

  const createdOrder1 = await pgCreateOrder(orderInput1);
  assert(Boolean(createdOrder1.id), 'Order created successfully');
  assert(createdOrder1.idempotencyKey === testKey1, 'Order record has idempotencyKey set');
  assert(createdOrder1.requestFingerprint === expectedFingerprint1, 'Order record has requestFingerprint matching expected');

  const [dbOrder1] = await sql`SELECT idempotency_key, request_fingerprint FROM orders WHERE id = ${createdOrder1.id}`;
  assert(dbOrder1.idempotency_key === testKey1, 'DB orders table stores idempotency_key correctly');
  assert(dbOrder1.request_fingerprint === expectedFingerprint1, 'DB orders table stores request_fingerprint correctly');

  // ---------------------------------------------------------
  // TEST 3: Network Retry / Double Submit Idempotency
  // ---------------------------------------------------------
  console.log('\n--- TEST 3: Network Retry / Double Submit Idempotency ---');
  // Capture product stock after order 1
  const [stockBeforeRetry] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod1.id}`;

  // Call pgCreateOrder again with identical payload and key
  const retriedOrder1 = await pgCreateOrder(orderInput1);
  assert(retriedOrder1.id === createdOrder1.id, 'Retried call returns original order ID');
  assert(retriedOrder1.orderNumber === createdOrder1.orderNumber, 'Retried call returns original orderNumber');

  const [orderCountForKey1] = await sql`SELECT count(*)::int as cnt FROM orders WHERE idempotency_key = ${testKey1}`;
  assert(orderCountForKey1.cnt === 1, 'Only 1 order row exists in DB for this idempotency key');

  const [stockAfterRetry] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod1.id}`;
  assert(stockAfterRetry.current_stock_pieces === stockBeforeRetry.current_stock_pieces, 'Stock was NOT deducted again on retry');

  // ---------------------------------------------------------
  // TEST 4: Idempotency Payload Conflict (Different Payload, Same Key)
  // ---------------------------------------------------------
  console.log('\n--- TEST 4: Idempotency Conflict on Payload Mismatch (HTTP 409) ---');
  let conflictPayloadError = null;
  try {
    await pgCreateOrder({
      ...orderInput1,
      items: [
        {
          productId: prod1.id,
          quantity: 10, // Changed quantity!
          saleType: 'retail',
          price: 1000,
        },
      ],
    });
  } catch (err) {
    conflictPayloadError = err;
  }
  assert(conflictPayloadError !== null, 'Reusing key with different payload throws error');
  assert(conflictPayloadError.message.includes('Idempotency Conflict'), 'Error message contains "Idempotency Conflict"');
  assert(conflictPayloadError.message.includes('different order payload'), 'Error mentions payload mismatch');

  // ---------------------------------------------------------
  // TEST 5: Idempotency Ownership Conflict (Different Customer, Same Key)
  // ---------------------------------------------------------
  console.log('\n--- TEST 5: Idempotency Conflict on Customer Identity Mismatch ---');
  let conflictCustomerError = null;
  try {
    await pgCreateOrder({
      ...orderInput1,
      customer: {
        name: 'زبون آخر محتال',
        phone: '07809999999', // Different phone!
        city: 'بغداد',
        address: 'الكرادة',
      },
    });
  } catch (err) {
    conflictCustomerError = err;
  }
  assert(conflictCustomerError !== null, 'Reusing key with different customer phone throws error');
  assert(conflictCustomerError.message.includes('Idempotency Conflict'), 'Error message contains "Idempotency Conflict"');
  assert(conflictCustomerError.message.includes('belongs to another customer'), 'Error mentions ownership mismatch');

  // ---------------------------------------------------------
  // TEST 6: Highly Concurrent Requests (Race Condition Resolution)
  // ---------------------------------------------------------
  console.log('\n--- TEST 6: Highly Concurrent Requests (Race Condition Handling) ---');
  const concurrentKey = 'chk-concurrent-' + Date.now();
  const concurrentPayload = {
    customer: {
      name: 'حيدر الكرار',
      phone: '07705554433',
      city: 'كربلاء',
      address: 'حي المعلمين',
    },
    items: [
      {
        productId: prod2.id,
        quantity: 3,
        saleType: 'retail',
        price: 1500,
      },
    ],
    paymentMethod: 'cod',
    idempotencyKey: concurrentKey,
    createAccountIfMissing: true,
  };

  const [stockBeforeConcurrent] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod2.id}`;

  // Launch two concurrent requests with identical key
  const [resA, resB] = await Promise.all([
    pgCreateOrder(concurrentPayload),
    pgCreateOrder(concurrentPayload),
  ]);

  assert(Boolean(resA?.id) && Boolean(resB?.id), 'Both concurrent calls resolved successfully');
  assert(resA.id === resB.id, 'Both concurrent calls returned the EXACT same order ID');
  assert(resA.orderNumber === resB.orderNumber, 'Both concurrent calls returned the EXACT same orderNumber');

  const [concurrentOrderCount] = await sql`SELECT count(*)::int as cnt FROM orders WHERE idempotency_key = ${concurrentKey}`;
  assert(concurrentOrderCount.cnt === 1, 'Exactly 1 order row exists in PostgreSQL for the concurrent key');

  const [stockAfterConcurrent] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod2.id}`;
  assert(
    Number(stockAfterConcurrent.current_stock_pieces) === Number(stockBeforeConcurrent.current_stock_pieces) - 3,
    'Stock was deducted exactly ONCE (3 pieces) despite concurrent calls'
  );

  // ---------------------------------------------------------
  // TEST 7: Rollback Safety (Key Not Burned on Failure Before Commit)
  // ---------------------------------------------------------
  console.log('\n--- TEST 7: Rollback Safety (Key Not Burned on Pre-Commit Failure) ---');
  const failKey = 'chk-fail-precommit-' + Date.now();
  const failingPayload = {
    customer: {
      name: 'مهدي باقر',
      phone: '07701112233',
      city: 'كربلاء',
      address: 'حي الإسكان',
    },
    items: [
      {
        productId: prod1.id,
        quantity: 999999, // Insufficient stock!
        saleType: 'retail',
        price: 1000,
      },
    ],
    paymentMethod: 'cod',
    idempotencyKey: failKey,
    createAccountIfMissing: true,
  };

  let preCommitError = null;
  try {
    await pgCreateOrder(failingPayload);
  } catch (err) {
    preCommitError = err;
  }
  assert(preCommitError !== null, 'Order creation failed due to insufficient stock');

  const [failedRows] = await sql`SELECT count(*)::int as cnt FROM orders WHERE idempotency_key = ${failKey}`;
  assert(failedRows.cnt === 0, 'No order row was committed for the failed attempt; key remains unburned');

  // Correcting payload and retrying with the same idempotency key
  const correctedPayload = {
    ...failingPayload,
    items: [
      {
        productId: prod1.id,
        quantity: 2, // Valid stock!
        saleType: 'retail',
        price: 1000,
      },
    ],
  };

  const correctedOrder = await pgCreateOrder(correctedPayload);
  assert(Boolean(correctedOrder?.id), 'Corrected retry succeeds with the same idempotency key');
  assert(correctedOrder.idempotencyKey === failKey, 'Saved order has the original idempotency key');

  // ---------------------------------------------------------
  // TEST 8: Cashback Ledger DB Integrity - Earned (Unique per order)
  // ---------------------------------------------------------
  console.log('\n--- TEST 8: Cashback Ledger DB Integrity - Earned (Unique per order) ---');
  const [custAcc] = await sql`
    SELECT id FROM financial_accounts WHERE phone = '9647701234567' LIMIT 1;
  `;
  assert(Boolean(custAcc?.id), 'Resolved customer financial account');

  // Insert first earned ledger row
  await sql`
    INSERT INTO cashback_ledger (account_id, order_id, type, amount, notes)
    VALUES (${custAcc.id}, ${createdOrder1.id}, 'earned', 500, 'أرباح طلبية 1');
  `;
  console.log('   ✅ First earned entry inserted successfully');

  // Attempt duplicate earned entry for the same order_id
  let duplicateEarnedError = null;
  try {
    await sql`
      INSERT INTO cashback_ledger (account_id, order_id, type, amount, notes)
      VALUES (${custAcc.id}, ${createdOrder1.id}, 'earned', 500, 'محاولة مكررة لأرباح نفس الطلبية');
    `;
  } catch (err) {
    duplicateEarnedError = err;
  }
  assert(duplicateEarnedError !== null, 'DB-level constraint rejects duplicate earned entry for same order');
  assert(duplicateEarnedError.code === '23505', 'PostgreSQL error code is 23505 (unique_violation)');
  assert(
    duplicateEarnedError.message.includes('uq_cashback_ledger_order_earned') ||
      duplicateEarnedError.detail?.includes('order_id'),
    'Violates uq_cashback_ledger_order_earned partial unique index'
  );

  // ---------------------------------------------------------
  // TEST 9: Cashback Ledger DB Integrity - Redeemed (Unique per order)
  // ---------------------------------------------------------
  console.log('\n--- TEST 9: Cashback Ledger DB Integrity - Redeemed (Unique per order) ---');
  await sql`
    INSERT INTO cashback_ledger (account_id, order_id, type, amount, notes)
    VALUES (${custAcc.id}, ${createdOrder1.id}, 'redeemed', 250, 'استخدام رصيد في طلبية 1');
  `;
  console.log('   ✅ First redeemed entry inserted successfully');

  let duplicateRedeemedError = null;
  try {
    await sql`
      INSERT INTO cashback_ledger (account_id, order_id, type, amount, notes)
      VALUES (${custAcc.id}, ${createdOrder1.id}, 'redeemed', 250, 'محاولة مكررة لخصم أرباح نفس الطلبية');
    `;
  } catch (err) {
    duplicateRedeemedError = err;
  }
  assert(duplicateRedeemedError !== null, 'DB-level constraint rejects duplicate redeemed entry for same order');
  assert(duplicateRedeemedError.code === '23505', 'PostgreSQL error code is 23505 (unique_violation)');
  assert(
    duplicateRedeemedError.message.includes('uq_cashback_ledger_order_redeemed') ||
      duplicateRedeemedError.detail?.includes('order_id'),
    'Violates uq_cashback_ledger_order_redeemed partial unique index'
  );

  // ---------------------------------------------------------
  // TEST 10: Cashback Ledger DB Integrity - Reversed (Unique per order)
  // ---------------------------------------------------------
  console.log('\n--- TEST 10: Cashback Ledger DB Integrity - Reversed (Unique per order) ---');
  await sql`
    INSERT INTO cashback_ledger (account_id, order_id, type, amount, notes)
    VALUES (${custAcc.id}, ${createdOrder1.id}, 'reversed', 250, 'إرجاع رصيد طلبية ملغاة 1');
  `;
  console.log('   ✅ First reversed entry inserted successfully');

  let duplicateReversedError = null;
  try {
    await sql`
      INSERT INTO cashback_ledger (account_id, order_id, type, amount, notes)
      VALUES (${custAcc.id}, ${createdOrder1.id}, 'reversed', 250, 'محاولة مكررة لإرجاع رصيد نفس الطلبية');
    `;
  } catch (err) {
    duplicateReversedError = err;
  }
  assert(duplicateReversedError !== null, 'DB-level constraint rejects duplicate reversed entry for same order');
  assert(duplicateReversedError.code === '23505', 'PostgreSQL error code is 23505 (unique_violation)');
  assert(
    duplicateReversedError.message.includes('uq_cashback_ledger_order_reversed') ||
      duplicateReversedError.detail?.includes('order_id'),
    'Violates uq_cashback_ledger_order_reversed partial unique index'
  );

  // ---------------------------------------------------------
  // TEST 11: Cashback Ledger Legitimate Repeat Entries Permitted
  // ---------------------------------------------------------
  console.log('\n--- TEST 11: Cashback Ledger Legitimate Repeat Entries Permitted ---');
  // Type 'adjustment' is legitimately allowed to appear multiple times
  await sql`
    INSERT INTO cashback_ledger (account_id, order_id, type, amount, notes)
    VALUES (${custAcc.id}, ${createdOrder1.id}, 'adjustment', 100, 'تسوية إدارية أولى');
  `;
  await sql`
    INSERT INTO cashback_ledger (account_id, order_id, type, amount, notes)
    VALUES (${custAcc.id}, ${createdOrder1.id}, 'adjustment', 50, 'تسوية إدارية ثانية لنفس الطلبية');
  `;
  const [adjustmentCount] = await sql`
    SELECT count(*)::int as cnt FROM cashback_ledger WHERE order_id = ${createdOrder1.id} AND type = 'adjustment';
  `;
  assert(adjustmentCount.cnt === 2, 'Multiple legitimate adjustment entries on the same order succeed without constraint error');

  // ---------------------------------------------------------
  // TEST 12: Static Code Audit & PostgreSQL Customer Identity Resolver
  // ---------------------------------------------------------
  console.log('\n--- TEST 12: Static Code Audit & PostgreSQL Customer Identity Resolver ---');
  const ordersRouteContent = fs.readFileSync(path.resolve(process.cwd(), 'src/app/api/orders/route.ts'), 'utf-8');
  assert(!ordersRouteContent.includes('@/lib/db'), 'src/app/api/orders/route.ts does NOT import @/lib/db');
  assert(!ordersRouteContent.includes('getUsers('), 'src/app/api/orders/route.ts does NOT call getUsers()');
  assert(!ordersRouteContent.includes('store_db.json'), 'src/app/api/orders/route.ts does NOT reference store_db.json');
  assert(!ordersRouteContent.includes('getDomainDataSource'), 'src/app/api/orders/route.ts does NOT reference getDomainDataSource');

  const ordersModuleContent = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/postgres-orders.ts'), 'utf-8');
  assert(!ordersModuleContent.includes('@/lib/db'), 'src/lib/postgres-orders.ts does NOT import @/lib/db');
  assert(!ordersModuleContent.includes('store_db.json'), 'src/lib/postgres-orders.ts does NOT reference store_db.json');

  const cashbackModuleContent = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/postgres-cashback.ts'), 'utf-8');
  assert(!cashbackModuleContent.includes('@/lib/db'), 'src/lib/postgres-cashback.ts does NOT import @/lib/db');

  const couponsModuleContent = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/postgres-coupons.ts'), 'utf-8');
  assert(!couponsModuleContent.includes('@/lib/db'), 'src/lib/postgres-coupons.ts does NOT import @/lib/db');

  // Functional test of pgResolveCustomerIdentity directly from PostgreSQL
  const resolvedIdentity = await pgResolveCustomerIdentity(custAcc.id);
  assert(Boolean(resolvedIdentity), 'pgResolveCustomerIdentity successfully resolved account by ID');
  assert(resolvedIdentity.id === custAcc.id, 'Resolved identity ID matches account ID');
  assert(resolvedIdentity.role === 'customer', 'Resolved identity role is customer');
  assert(resolvedIdentity.accountType === 'individual', 'Resolved identity accountType normalized to individual');
  assert(resolvedIdentity.merchantStatus === 'approved' || resolvedIdentity.merchantStatus === 'none', 'Resolved identity merchantStatus is valid (approved or none)');

  console.log('\n======================================================');
  console.log('🎉 ALL 12 COMMERCE-2C2 HARDENING TESTS PASSED!');
  console.log('======================================================\n');
}

async function main() {
  try {
    await startDatabase();
    await runTests();
  } catch (error) {
    console.error('\n❌ Test suite failed with error:', error);
    process.exitCode = 1;
  } finally {
    await stopDatabase();
  }
}

main();
