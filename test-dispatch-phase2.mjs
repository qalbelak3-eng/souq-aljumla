import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  SESSION_COOKIE_NAME,
  DRIVER_SESSION_COOKIE_NAME,
  signAdminSession,
  signDriverSession,
} from './src/lib/auth.ts';
import { decryptPin } from './src/lib/delivery-pin.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54347;
const tempDir = path.join(os.tmpdir(), 'ep_test_dispatch_phase2_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'dispatch-phase2-test-secret-min-32-chars-long';
process.env.DRIVER_SESSION_SECRET = 'dispatch-phase2-driver-secret-min-32-chars-long';
process.env.DELIVERY_PIN_ENCRYPTION_KEY = 'test-dedicated-delivery-pin-key-32ch';

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

async function setup() {
  console.log('1. Starting embedded PostgreSQL on port', PORT);
  ep = new Ep({ databaseDir: tempDir, port: PORT });
  await ep.initialise();
  await ep.start();
  console.log('   PostgreSQL started successfully.');

  sql = postgres(dbUrl, { max: 5 });

  console.log('2. Applying schema and migration triggers...');

  const migrations = [
    'drizzle/0000_magical_warbound.sql',
    'drizzle/0001_cheerful_morph.sql',
    'drizzle/0002_voucher_immutability_trigger.sql',
    'drizzle/0003_kind_chimera.sql',
    'drizzle/0004_tiresome_kid_colt.sql',
    'drizzle/0005_audit_hardening_triggers.sql',
    'drizzle/0006_driver_settlement_lifecycle.sql',
    'drizzle/0007_delivery_pin_proof.sql',
    'drizzle/0008_delivery_pin_encrypted.sql',
    'drizzle/0009_driver_operational_status.sql',
  ];

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    if (fs.existsSync(fullPath)) {
      await runSqlScript(sql, fullPath);
    }
  }
  console.log('   All migrations (0000 - 0009) applied successfully.\n');
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passed++;
    console.log(`[PASS] ${message}`);
  }
}

async function runDispatchPhase2Tests() {
  console.log('===============================================================');
  console.log('   PHASE DISPATCH-2: DRIVER OPERATIONAL AVAILABILITY TESTS     ');
  console.log('===============================================================\n');

  // Dynamic Imports
  const {
    computeDriverOperationalStatus,
    rankDriversForOrder,
    driverHasActiveVehicle,
    HIGH_CUSTODY_THRESHOLD,
  } = await import('./src/lib/dispatch-recommender.ts');

  const {
    pgCreateVehicle,
    pgUpdateVehicle,
    pgCreateDriver,
    pgGetDrivers,
    pgGetDriverById,
    pgUpdateDriver,
    pgUpdateDriverOperationalStatus,
  } = await import('./src/lib/postgres-drivers.ts');

  const {
    pgCreateOrder,
    pgCancelOrder,
  } = await import('./src/lib/postgres-orders.ts');

  const {
    pgAssignOrderDriver,
    pgStartDriverDelivery,
    pgDeliverDriverOrder,
    pgFailDriverDelivery,
    pgReturnDriverOrder,
  } = await import('./src/lib/postgres-delivery.ts');

  const { GET: getDriverStatusRoute, PUT: putDriverStatusRoute } = await import(
    './src/app/api/driver/status/route.ts'
  );

  const { PATCH: patchOrderRoute } = await import(
    './src/app/api/orders/[id]/route.ts'
  );

  // =========================================================================
  // Section A: Unit Testing Availability Rules & Smart Recommendation
  // =========================================================================
  console.log('--- Section A: Unit Rules for Availability & Status Derivation ---');

  // A.1: Status derivation (computeDriverOperationalStatus)
  assert(computeDriverOperationalStatus('available', 0) === 'available', 'available + 0 active deliveries = available 🟢');
  assert(computeDriverOperationalStatus('available', 2) === 'busy', 'available + 2 active deliveries = busy 🟠');
  assert(computeDriverOperationalStatus('break', 0) === 'break', 'break + 0 active deliveries = break ☕');
  assert(computeDriverOperationalStatus('break', 1) === 'break', 'break + 1 active delivery = break ☕');
  assert(computeDriverOperationalStatus('off_duty', 0) === 'off_duty', 'off_duty + 0 active deliveries = off_duty ⚫');
  assert(computeDriverOperationalStatus('off_duty', 1) === 'off_duty', 'off_duty + 1 active delivery = off_duty ⚫');
  assert(computeDriverOperationalStatus(undefined, 0) === 'available', 'undefined defaults to available');
  assert(computeDriverOperationalStatus(undefined, 1) === 'busy', 'undefined with 1 active delivery = busy');

  // A.2: Smart Recommendation exclusions: break & off_duty must be excluded
  const mockDrivers = [
    { id: 'd-active-avail', name: 'أحمد المتاح', isActive: true, operationalStatus: 'available', activeDeliveries: 0, currentCashInHand: 0, isVehicleActive: true },
    { id: 'd-active-busy', name: 'بلال المشغول', isActive: true, operationalStatus: 'available', activeDeliveries: 1, currentCashInHand: 0, isVehicleActive: true },
    { id: 'd-break', name: 'جمال المستريح', isActive: true, operationalStatus: 'break', activeDeliveries: 0, currentCashInHand: 0, isVehicleActive: true },
    { id: 'd-offduty', name: 'خالد المنتهي', isActive: true, operationalStatus: 'off_duty', activeDeliveries: 0, currentCashInHand: 0, isVehicleActive: true },
    { id: 'd-inactive', name: 'سعيد المعطل', isActive: false, operationalStatus: 'available', activeDeliveries: 0, currentCashInHand: 0, isVehicleActive: true },
  ];

  const rankedA = rankDriversForOrder(mockDrivers);
  assert(rankedA.length === 2, 'Only eligible drivers (available & busy) are present in ranking');
  assert(!rankedA.some((r) => r.driver.id === 'd-break'), 'Break driver is strictly excluded from recommendation');
  assert(!rankedA.some((r) => r.driver.id === 'd-offduty'), 'Off-duty driver is strictly excluded from recommendation');
  assert(!rankedA.some((r) => r.driver.id === 'd-inactive'), 'Inactive driver is strictly excluded from recommendation');

  // A.3: Preference for available over busy
  assert(rankedA[0].driver.id === 'd-active-avail', 'Available driver is ranked #1 over busy driver');
  assert(rankedA[0].isRecommended === true, 'Available driver is marked as ⭐ Recommended');
  assert(rankedA[0].effectiveStatus === 'available', 'Top driver effectiveStatus is available');
  assert(rankedA[1].driver.id === 'd-active-busy', 'Busy driver is ranked #2');
  assert(rankedA[1].effectiveStatus === 'busy', 'Second driver effectiveStatus is busy');

  // A.4: When both are busy, least loaded wins
  const mockBusyDrivers = [
    { id: 'd-busy-2', name: 'زياد محمل 2', isActive: true, operationalStatus: 'available', activeDeliveries: 2, currentCashInHand: 0, isVehicleActive: true },
    { id: 'd-busy-1', name: 'سالم محمل 1', isActive: true, operationalStatus: 'available', activeDeliveries: 1, currentCashInHand: 0, isVehicleActive: true },
  ];
  const rankedBusy = rankDriversForOrder(mockBusyDrivers);
  assert(rankedBusy[0].driver.id === 'd-busy-1', 'Least loaded busy driver (1 order) ranks ahead of more loaded (2 orders)');
  assert(rankedBusy[0].isRecommended === true, 'Least loaded busy driver is recommended when no available drivers exist');

  // =========================================================================
  // Section B: Database Operations & State Machine Transitions
  // =========================================================================
  console.log('\n--- Section B: Database State Machine & Operational Mutations ---');

  // Seed Reference Data
  const [cat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم العصائر', 'drinks-cat')
    RETURNING id;
  `;

  const [prod] = await sql`
    INSERT INTO products (
      name, category_id,
      boxes_per_carton, items_per_box, pieces_per_carton,
      current_stock_pieces,
      retail_unit, wholesale_unit,
      price, wholesale_price, piece_cost_price, cost_price
    ) VALUES (
      'عصير مانجو طبيعي 1 لتر', ${cat.id},
      1, 1, 1,
      1000,
      'قنينة', 'كرتون',
      20000, 20000, 15000, 15000
    ) RETURNING id;
  `;

  const [custAuth] = await sql`
    INSERT INTO auth_identities (phone, role, is_active)
    VALUES ('07709995544', 'customer', true)
    RETURNING id;
  `;

  const [custAcc] = await sql`
    INSERT INTO financial_accounts (account_code, name, phone, category, pricing_tier, auth_identity_id, is_active)
    VALUES ('CUST-5544', 'ماركت دجلة', '07709995544', 'customer', 'wholesale', ${custAuth.id}, true)
    RETURNING id;
  `;

  const veh1 = await pgCreateVehicle({
    name: 'بيك آب نيسان 2023',
    plateNumber: 'بغداد 77112',
    type: 'pickup',
    isActive: true,
  });

  // Create Driver 1: starts as 'available'
  const driver1 = await pgCreateDriver({
    name: 'عمار عبد الخالق',
    phone: '07707771111',
    password: 'password123',
    defaultVehicleId: veh1.id,
    isActive: true,
  });
  assert(driver1.operationalStatus === 'available', 'New driver operationalStatus defaults to available in DB');
  assert(driver1.effectiveStatus === 'available', 'New driver effectiveStatus is available');

  // Create Driver 2: starts as 'available'
  const driver2 = await pgCreateDriver({
    name: 'فراس كمال',
    phone: '07707772222',
    password: 'password123',
    defaultVehicleId: veh1.id,
    isActive: true,
  });

  // B.1: Transition Available -> Break -> Available
  console.log('\n--- B.1: Transition Available -> Break -> Available ---');
  const d1Break = await pgUpdateDriverOperationalStatus({
    driverId: driver1.id,
    operationalStatus: 'break',
  });
  assert(d1Break.operationalStatus === 'break', 'Driver 1 transitioned to break');
  assert(d1Break.effectiveStatus === 'break', 'Driver 1 effectiveStatus is break ☕');

  const [auditBreak] = await sql`
    SELECT * FROM audit_logs
    WHERE target_id = ${driver1.id} AND action_type = 'driver_status_change'
    ORDER BY timestamp DESC LIMIT 1;
  `;
  assert(auditBreak !== undefined, 'Audit log recorded for status change to break');
  assert(auditBreak.details.includes('break'), 'Audit log records transition to break');

  // Idempotency: setting break again should NOT create a duplicate audit log
  const auditCountBefore = await sql`
    SELECT count(*)::int as count FROM audit_logs
    WHERE target_id = ${driver1.id} AND action_type = 'driver_status_change';
  `;
  const d1BreakRepeat = await pgUpdateDriverOperationalStatus({
    driverId: driver1.id,
    operationalStatus: 'break',
  });
  assert(d1BreakRepeat.operationalStatus === 'break', 'Repeat break call returns break');
  const auditCountAfter = await sql`
    SELECT count(*)::int as count FROM audit_logs
    WHERE target_id = ${driver1.id} AND action_type = 'driver_status_change';
  `;
  assert(auditCountBefore[0].count === auditCountAfter[0].count, 'Idempotent status update creates NO duplicate audit logs');

  // Transition back to Available
  const d1Avail = await pgUpdateDriverOperationalStatus({
    driverId: driver1.id,
    operationalStatus: 'available',
  });
  assert(d1Avail.operationalStatus === 'available', 'Driver 1 transitioned back to available');
  assert(d1Avail.effectiveStatus === 'available', 'Driver 1 effectiveStatus is available 🟢');

  // B.2: Driver cannot manually set 'busy'
  console.log('\n--- B.2: Manual Busy Rejection ---');
  let busyCaught = false;
  try {
    await pgUpdateDriverOperationalStatus({
      driverId: driver1.id,
      operationalStatus: 'busy',
    });
  } catch (err) {
    busyCaught = true;
    assert(err.message.includes('لا يمكن اختيارها يدوياً'), 'Rejection error message states busy is derived and cannot be chosen manually');
  }
  assert(busyCaught, 'Attempt to manually set status to busy is rejected');

  // B.3: Inactive driver rejection
  console.log('\n--- B.3: Inactive Driver Operational Status Protection ---');
  await pgUpdateDriver(driver2.id, { isActive: false });
  let inactiveCaught = false;
  try {
    await pgUpdateDriverOperationalStatus({
      driverId: driver2.id,
      operationalStatus: 'break',
    });
  } catch (err) {
    inactiveCaught = true;
    assert(err.message.includes('حساب السائق معطل'), 'Inactive driver operational change rejected with explicit error');
  }
  assert(inactiveCaught, 'Deactivated driver cannot change operational status');
  // Re-activate driver 2
  await pgUpdateDriver(driver2.id, { isActive: true });

  // =========================================================================
  // Section C: Protection of In-Flight / Shipped Deliveries
  // =========================================================================
  console.log('\n--- Section C: In-Flight Shipped Delivery Protection against Off-Duty ---');
  const adminOp = {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'مشرف العمليات',
    role: 'admin',
    username: 'ops_admin',
  };

  const order1 = await pgCreateOrder({
    customer: { name: 'ماركت دجلة', phone: '07709995544', city: 'بغداد', address: 'المنصور', isGuest: false, userId: custAuth.id },
    items: [{ productId: prod.id, name: 'عصير مانجو', price: 20000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });

  await pgAssignOrderDriver({ orderId: order1.id, driverId: driver1.id, adminOperator: adminOp });
  await pgStartDriverDelivery(driver1.id, order1.id, { id: driver1.id, name: driver1.name, phone: driver1.phone });

  // Driver 1 now has 1 SHIPPED order
  const [shippedOrder] = await sql`SELECT status, driver_id FROM orders WHERE id = ${order1.id}`;
  assert(shippedOrder.status === 'shipped', 'Order transitioned to shipped status');

  // Check driver stats: activeDeliveries should be 1, so effectiveStatus should be 'busy'
  const d1ShippedStats = await pgGetDriverById(driver1.id);
  assert(d1ShippedStats.activeDeliveries === 1, 'Driver 1 has 1 active delivery');
  assert(d1ShippedStats.operationalStatus === 'available', 'Base operationalStatus is available');
  assert(d1ShippedStats.effectiveStatus === 'busy', 'Effective status is busy 🟠 while order is shipped');

  // Driver 1 attempts to go 'off_duty' while holding a shipped order -> MUST FAIL
  let offDutyBlocked = false;
  try {
    await pgUpdateDriverOperationalStatus({
      driverId: driver1.id,
      operationalStatus: 'off_duty',
    });
  } catch (err) {
    offDutyBlocked = true;
    assert(err.message === 'لديك طلب خارج للتوصيل. أكمل الطلب أو أعده قبل إنهاء الدوام.', 'Exact required error message returned when attempting off_duty with shipped order');
  }
  assert(offDutyBlocked, 'Driver with shipped order is strictly blocked from going off_duty');

  // Complete the delivery
  const [pinRow] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${order1.id}`;
  const pin1 = decryptPin(pinRow.delivery_pin_encrypted);
  await pgDeliverDriverOrder(driver1.id, order1.id, { id: driver1.id, name: driver1.name, phone: driver1.phone }, {
    collectionStatus: 'collected_cash',
    deliveryPin: pin1,
  });

  // Order delivered: activeDeliveries is now 0
  const d1DeliveredStats = await pgGetDriverById(driver1.id);
  assert(d1DeliveredStats.activeDeliveries === 0, 'Driver 1 active deliveries back to 0');
  assert(d1DeliveredStats.effectiveStatus === 'available', 'Driver 1 effective status back to available');

  // Now driver 1 can go off_duty cleanly!
  const d1OffDuty = await pgUpdateDriverOperationalStatus({
    driverId: driver1.id,
    operationalStatus: 'off_duty',
  });
  assert(d1OffDuty.operationalStatus === 'off_duty', 'Driver 1 successfully transitioned to off_duty after completing delivery');
  assert(d1OffDuty.effectiveStatus === 'off_duty', 'Driver 1 effectiveStatus is off_duty ⚫');

  // =========================================================================
  // Section D: API Route Security & Session Isolation
  // =========================================================================
  console.log('\n--- Section D: API Route Security & Session Isolation ---');
  const d1Token = signDriverSession({
    driverId: driver1.id,
    authIdentityId: driver1.authIdentityId,
    phone: driver1.phone,
    name: driver1.name,
    role: 'driver',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const d1Cookie = `${DRIVER_SESSION_COOKIE_NAME}=${d1Token}`;

  const d2Token = signDriverSession({
    driverId: driver2.id,
    authIdentityId: driver2.authIdentityId,
    phone: driver2.phone,
    name: driver2.name,
    role: 'driver',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const d2Cookie = `${DRIVER_SESSION_COOKIE_NAME}=${d2Token}`;

  // D.1: Unauthenticated request rejected with HTTP 401
  const unauthReq = new Request('http://localhost:3000/api/driver/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'available' }),
  });
  const unauthRes = await putDriverStatusRoute(unauthReq);
  assert(unauthRes.status === 401, 'Unauthenticated status update rejected with HTTP 401');

  // D.2: Driver A attempts to change Driver B's status -> HTTP 403 Forbidden
  const spoofReq = new Request('http://localhost:3000/api/driver/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: d1Cookie },
    body: JSON.stringify({ driverId: driver2.id, status: 'off_duty' }),
  });
  const spoofRes = await putDriverStatusRoute(spoofReq);
  assert(spoofRes.status === 403, 'Cross-driver tampering attempt rejected with HTTP 403 Forbidden');

  // D.3: Driver 1 legitimately updates own status via API to 'available'
  const validD1Req = new Request('http://localhost:3000/api/driver/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: d1Cookie },
    body: JSON.stringify({ status: 'available' }),
  });
  const validD1Res = await putDriverStatusRoute(validD1Req);
  const validD1Data = await validD1Res.json();
  assert(validD1Res.status === 200 && validD1Data.success === true, 'Driver 1 legitimately updated status to available via API (HTTP 200)');
  assert(validD1Data.operationalStatus === 'available', 'API returned operationalStatus: available');

  // D.4: GET /api/driver/status verifies fresh state
  const getD1Req = new Request('http://localhost:3000/api/driver/status', {
    method: 'GET',
    headers: { Cookie: d1Cookie },
  });
  const getD1Res = await getDriverStatusRoute(getD1Req);
  const getD1Data = await getD1Res.json();
  assert(getD1Res.status === 200, 'GET /api/driver/status returns HTTP 200');
  assert(getD1Data.driverId === driver1.id, 'GET returned correct driver ID');
  assert(getD1Data.operationalStatus === 'available', 'GET returned operationalStatus: available');

  // =========================================================================
  // Section E: Smart Recommendation on Real PostgreSQL Drivers
  // =========================================================================
  console.log('\n--- Section E: Smart Recommendation & Admin Assignment ---');
  // Set Driver 2 to 'break'
  await pgUpdateDriverOperationalStatus({ driverId: driver2.id, operationalStatus: 'break' });

  // Create Driver 3 on 'off_duty'
  const driver3 = await pgCreateDriver({
    name: 'حيدر مهدي',
    phone: '07707773333',
    password: 'password123',
    defaultVehicleId: veh1.id,
    operationalStatus: 'off_duty',
    isActive: true,
  });

  const allDriversDb = await pgGetDrivers();
  const targetOrder = { paymentMethod: 'cod', total: 20000 };
  const rankedDb = rankDriversForOrder(allDriversDb, targetOrder);

  // Driver 2 (break) and Driver 3 (off_duty) must be excluded from recommendation
  assert(!rankedDb.some((r) => r.driver.id === driver2.id), 'Driver on break (Driver 2) is excluded from recommendations');
  assert(!rankedDb.some((r) => r.driver.id === driver3.id), 'Driver off-duty (Driver 3) is excluded from recommendations');
  assert(rankedDb[0].driver.id === driver1.id, 'Available Driver 1 is recommended');
  assert(rankedDb[0].isRecommended === true, 'Driver 1 has ⭐ [مقترح]');

  // Supervisor Manual Assignment to Driver on Break (Allowed by policy without secret status alteration)
  console.log('\n--- E.2: Manual Assignment to Driver on Break ---');
  const adminCookie = `${SESSION_COOKIE_NAME}=${signAdminSession({
    userId: 'a0000000-0000-0000-0000-000000000001',
    username: 'admin',
    name: 'مشرف التوزيع',
    role: 'admin',
    permissions: ['orders', 'drivers', 'accounting'],
    exp: Math.floor(Date.now() / 1000) + 86400,
  })}`;

  const order2 = await pgCreateOrder({
    customer: { name: 'ماركت دجلة', phone: '07709995544', city: 'بغداد', address: 'المنصور', isGuest: false, userId: custAuth.id },
    items: [{ productId: prod.id, name: 'عصير مانجو', price: 20000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });

  const assignBreakReq = new Request(`http://localhost:3000/api/orders/${order2.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ driverId: driver2.id }),
  });
  const assignBreakRes = await patchOrderRoute(assignBreakReq, { params: { id: order2.id } });
  const assignBreakData = await assignBreakRes.json();
  assert(assignBreakRes.status === 200 && assignBreakData.success === true, 'Admin manually assigned order to Driver 2 on break (HTTP 200)');
  assert(assignBreakData.order.driverId === driver2.id, 'Order assigned to Driver 2');

  // Verify that Driver 2's status was NOT secretly altered!
  const d2AfterAssign = await pgGetDriverById(driver2.id);
  assert(d2AfterAssign.operationalStatus === 'break', 'Driver 2 operationalStatus remains break (NOT altered secretly)');
  assert(d2AfterAssign.effectiveStatus === 'break', 'Driver 2 effectiveStatus remains break ☕');

  // =========================================================================
  // Section F: Accounting, Custody & Financial Ledger Invariance
  // =========================================================================
  console.log('\n--- Section F: Financial & Inventory Integrity ---');
  const [vouchersCount] = await sql`SELECT count(*)::int as count FROM vouchers`;
  assert(vouchersCount.count === 0, 'No vouchers created during driver availability operations');

  const [settlementCount] = await sql`SELECT count(*)::int as count FROM driver_settlements`;
  assert(settlementCount.count === 0, 'Driver settlements table unaffected by status operations');

  console.log('\n===============================================================');
  console.log(`ALL DISPATCH-2 TESTS PASSED: ${passed} assertions passed, ${failed} failed.`);
  console.log('===============================================================\n');
}

async function main() {
  try {
    await setup();
    await runDispatchPhase2Tests();
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    if (sql) await sql.end({ timeout: 5 });
    if (ep) await ep.stop();
  }
}

main();
