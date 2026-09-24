import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';

const Ep = EpDefault.default || EpDefault;
const PORT = 54334; // Different port from phase 1 to avoid conflicts
const tempDir = path.join(os.tmpdir(), 'ep_test_drivers_phase2_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'super-secret-admin-session-token-for-test-32chars';

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
  ];

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    if (fs.existsSync(fullPath)) {
      await runSqlScript(sql, fullPath);
    }
  }
  console.log('   All migrations applied successfully.\n');
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

async function runDriversPhase2Tests() {
  console.log('===============================================================');
  console.log('       PHASE DRIVERS-2: DELIVERY LIFECYCLE & SECURITY TESTS    ');
  console.log('===============================================================\n');

  // Dynamic Imports
  const {
    pgCreateDriver,
    pgUpdateDriver,
    pgGetDriverById,
    pgCreateVehicle,
    pgUpdateVehicle,
  } = await import('./src/lib/postgres-drivers.ts');

  const {
    pgCreateOrder,
    pgGetOrderById,
  } = await import('./src/lib/postgres-orders.ts');

  const {
    pgAssignOrderDriver,
    pgGetDriverOrders,
    pgGetDriverOrderById,
    pgStartDriverDelivery,
    pgNotifyDriverArrived,
    pgDeliverDriverOrder,
    pgFailDriverDelivery,
    pgReturnDriverOrder,
  } = await import('./src/lib/postgres-delivery.ts');

  const {
    signAdminSession,
    signDriverSession,
    SESSION_COOKIE_NAME,
    DRIVER_SESSION_COOKIE_NAME,
  } = await import('./src/lib/auth.ts');

  const { GET: getDriverOrders, POST: postDriverOrders } = await import(
    './src/app/api/driver/orders/route.ts'
  );
  const { PATCH: patchAdminOrder } = await import('./src/app/api/orders/[id]/route.ts');
  const { GET: getAdminDriverOrders } = await import('./src/app/api/admin/drivers/[id]/orders/route.ts');

  // --- Seed Reference Data ---
  console.log('--- Step 0: Seeding Reference Catalog & Accounts ---');
  const [cat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم الألبان والعصائر', 'dairy-juice')
    RETURNING id, name;
  `;
  const [comp] = await sql`
    INSERT INTO companies (name)
    VALUES ('شركة المراعي الدولية')
    RETURNING id, name;
  `;

  // Product A: 4 boxes/carton, 6 items/box -> 24 pieces/carton. Initial stock: 100 pieces
  const [prodA] = await sql`
    INSERT INTO products (
      name, category_id, company_id,
      boxes_per_carton, items_per_box, pieces_per_carton,
      current_stock_pieces,
      retail_unit, wholesale_unit,
      price, wholesale_price, piece_cost_price, cost_price
    ) VALUES (
      'عصير راني برتقال حبيبات كرتون 24', ${cat.id}, ${comp.id},
      4, 6, 24,
      100,
      'قطعة مفردة', 'كرتون 24 قطعة',
      1000.00, 20000.00, 700.0000, 16800.00
    ) RETURNING id, name, current_stock_pieces;
  `;
  assert(parseInt(prodA.current_stock_pieces, 10) === 100, 'Product A created with 100 pieces initial stock');

  // Customer financial account
  const [custAccount] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier, is_active
    ) VALUES (
      'ACC-CUST-101', 'سوبرماركت النور', '07701112233', 'customer', 'market', true
    ) RETURNING id, name, phone;
  `;
  assert(custAccount && custAccount.id, 'Customer financial account created');

  // Vehicles: V1 (Active), V_Disabled (Inactive)
  const veh1 = await pgCreateVehicle({
    name: 'كيا حمل بيضاء 2023',
    plateNumber: `45001-${Date.now().toString().slice(-4)}`,
    isActive: true,
  });
  const vehDisabled = await pgCreateVehicle({
    name: 'ستوتة معطلة',
    plateNumber: `99001-${Date.now().toString().slice(-4)}`,
    isActive: false,
  });

  // Drivers: Driver A and Driver B
  const driverAPhone = '0770' + Math.floor(1000000 + Math.random() * 9000000);
  const driverA = await pgCreateDriver({
    name: 'السائق حيدر الكرخي',
    phone: driverAPhone,
    password: 'DriverPass123!',
    defaultVehicleId: veh1.id,
    isActive: true,
  });

  const driverBPhone = '0770' + Math.floor(1000000 + Math.random() * 9000000);
  const driverB = await pgCreateDriver({
    name: 'السائق عمار الرصافي',
    phone: driverBPhone,
    password: 'DriverPass456!',
    isActive: true,
  });

  // Sessions
  const masterAdminToken = signAdminSession({
    userId: 'admin-master-id',
    username: 'admin',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const masterAdminCookie = `${SESSION_COOKIE_NAME}=${masterAdminToken}`;

  const driverAToken = signDriverSession({
    driverId: driverA.id,
    authIdentityId: driverA.authIdentityId,
    phone: driverA.phone,
    name: driverA.name,
    role: 'driver',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const driverACookie = `${DRIVER_SESSION_COOKIE_NAME}=${driverAToken}`;

  const driverBToken = signDriverSession({
    driverId: driverB.id,
    authIdentityId: driverB.authIdentityId,
    phone: driverB.phone,
    name: driverB.name,
    role: 'driver',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const driverBCookie = `${DRIVER_SESSION_COOKIE_NAME}=${driverBToken}`;

  const adminOperator = {
    userId: 'admin-master-id',
    username: 'admin',
    role: 'admin',
    name: 'مدير النظام',
  };

  // =========================================================
  // Test 1: Driver Assignment & Re-assignment (Server-Side)
  // =========================================================
  console.log('\n--- Test 1: Driver Assignment & Re-assignment ---');

  // 1.1 Create Order 1 (2 cartons = 48 pieces -> stock should drop from 100 to 52)
  const order1 = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت النور',
      phone: '07701112233',
      city: 'بغداد',
      address: 'الكرادة خارج',
      isGuest: false,
      userId: custAccount.id,
    },
    items: [
      {
        productId: prodA.id,
        name: 'عصير راني برتقال حبيبات كرتون 24',
        price: 20000,
        quantity: 2,
        saleType: 'wholesale',
        unitLabel: 'كرتون 24 قطعة',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccount.id,
  });

  assert(order1 && order1.id, 'Order 1 created successfully');
  assert(order1.status === 'pending', 'Order 1 initial status is pending');
  assert(order1.total === 40000, 'Order 1 total is 40,000 IQD');

  const [stockCheck1] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(parseInt(stockCheck1.current_stock_pieces, 10) === 52, 'Product stock accurately deducted upon order creation (100 -> 52)');

  // 1.2 Reject assignment to non-existent driver
  let badDriverCaught = false;
  try {
    await pgAssignOrderDriver({
      orderId: order1.id,
      driverId: '00000000-0000-0000-0000-000000000000',
      adminOperator,
    });
  } catch (err) {
    badDriverCaught = true;
    assert(err.message === 'السائق المحدد غير موجود', 'Rejects non-existent driver');
  }
  assert(badDriverCaught, 'Non-existent driver assignment rejected');

  // 1.3 Reject assignment to inactive driver
  await pgUpdateDriver(driverB.id, { isActive: false });
  let inactiveDriverCaught = false;
  try {
    await pgAssignOrderDriver({
      orderId: order1.id,
      driverId: driverB.id,
      adminOperator,
    });
  } catch (err) {
    inactiveDriverCaught = true;
    assert(err.message.includes('معطل'), 'Rejects inactive driver');
  }
  assert(inactiveDriverCaught, 'Inactive driver assignment rejected');
  await pgUpdateDriver(driverB.id, { isActive: true }); // restore

  // 1.4 Reject assignment with inactive vehicle
  let inactiveVehCaught = false;
  try {
    await pgAssignOrderDriver({
      orderId: order1.id,
      driverId: driverA.id,
      vehicleId: vehDisabled.id,
      adminOperator,
    });
  } catch (err) {
    inactiveVehCaught = true;
    assert(err.message.includes('المركبة المحددة معطلة'), 'Rejects inactive vehicle assignment');
  }
  assert(inactiveVehCaught, 'Inactive vehicle assignment cleanly rejected');

  // 1.5 Assign Order 1 to Driver A via PATCH /api/orders/[id]
  const assignReq = new Request(`http://localhost:3000/api/orders/${order1.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: masterAdminCookie,
    },
    body: JSON.stringify({
      driverId: driverA.id,
      vehicleId: veh1.id,
    }),
  });
  const assignRes = await patchAdminOrder(assignReq, { params: { id: order1.id } });
  const assignData = await assignRes.json();
  assert(assignRes.status === 200 && assignData.success === true, 'Admin successfully assigned driver via API');
  assert(assignData.order.driverId === driverA.id, 'Order driverId set to Driver A');
  assert(assignData.order.status === 'processing', 'Order status moved to processing upon assignment');
  assert(assignData.order.driverAssignedAt !== undefined, 'driverAssignedAt recorded');

  // Verify Audit log in PostgreSQL
  const [assignAudit] = await sql`
    SELECT * FROM audit_logs
    WHERE target_id = ${order1.id} AND action_type = 'order_assigned_to_driver'
  `;
  assert(assignAudit !== undefined, 'order_assigned_to_driver audit log row exists in PostgreSQL');
  assert(assignAudit.operator_snapshot.username === 'admin', 'Actor identity strictly recorded from admin session');

  // 1.5.1 Validate pgNotifyDriverArrived rejection when order is processing
  let arriveProcessingCaught = false;
  try {
    await pgNotifyDriverArrived(driverA.id, order1.id, { id: driverA.id, name: driverA.name, phone: driverA.phone });
  } catch (err) {
    arriveProcessingCaught = true;
    assert(err.message.includes('قبل بدء التوصيل وخروج الطلبية'), 'Rejects arrival notification when order is processing');
    assert(err.message.includes('حالة الطلب: processing'), 'Explicitly notes processing status in error message');
  }
  assert(arriveProcessingCaught, 'Arrival notification cleanly rejected for processing order');

  // 1.5.2 Validate pgNotifyDriverArrived rejection when order is pending
  await sql`UPDATE orders SET status = 'pending' WHERE id = ${order1.id}`;
  let arrivePendingCaught = false;
  try {
    await pgNotifyDriverArrived(driverA.id, order1.id, { id: driverA.id, name: driverA.name, phone: driverA.phone });
  } catch (err) {
    arrivePendingCaught = true;
    assert(err.message.includes('قبل بدء التوصيل وخروج الطلبية'), 'Rejects arrival notification when order is pending');
    assert(err.message.includes('حالة الطلب: pending'), 'Explicitly notes pending status in error message');
  }
  assert(arrivePendingCaught, 'Arrival notification cleanly rejected for pending order');
  await sql`UPDATE orders SET status = 'processing' WHERE id = ${order1.id}`;

  // 1.6 Re-assign from Driver A to Driver B while in processing
  const reassignReq = new Request(`http://localhost:3000/api/orders/${order1.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: masterAdminCookie,
    },
    body: JSON.stringify({
      driverId: driverB.id,
    }),
  });
  const reassignRes = await patchAdminOrder(reassignReq, { params: { id: order1.id } });
  const reassignData = await reassignRes.json();
  assert(reassignRes.status === 200, 'Re-assignment succeeded with HTTP 200');
  assert(reassignData.order.driverId === driverB.id, 'Driver reassigned to Driver B');

  const [reassignAudit] = await sql`
    SELECT * FROM audit_logs
    WHERE target_id = ${order1.id} AND action_type = 'order_reassigned'
  `;
  assert(reassignAudit !== undefined, 'order_reassigned audit log row recorded');

  // Re-assign back to Driver A for the full lifecycle tests
  await pgAssignOrderDriver({
    orderId: order1.id,
    driverId: driverA.id,
    vehicleId: veh1.id,
    adminOperator,
  });

  // =========================================================
  // Test 2: Driver My Deliveries API & Isolation
  // =========================================================
  console.log('\n--- Test 2: Driver My Deliveries API & Isolation ---');

  // 2.1 Driver A views their deliveries
  const driverAGetReq = new Request('http://localhost:3000/api/driver/orders', {
    headers: { Cookie: driverACookie },
  });
  const driverAGetRes = await getDriverOrders(driverAGetReq);
  const driverAGetData = await driverAGetRes.json();
  assert(driverAGetRes.status === 200 && driverAGetData.success === true, 'Driver A fetched deliveries (HTTP 200)');
  assert(Array.isArray(driverAGetData.activeOrders), 'Returns activeOrders array');
  assert(driverAGetData.activeOrders.some((o) => o.id === order1.id), 'Driver A sees Order 1 in active deliveries');

  // 2.2 Verify sensitive wholesale fields are NOT leaked to driver
  const order1View = driverAGetData.activeOrders.find((o) => o.id === order1.id);
  assert(order1View.items[0].costPrice === undefined, 'Wholesale costPrice is NOT leaked to driver');
  assert(order1View.items[0].unitCostSnap === undefined, 'unitCostSnap is NOT leaked to driver');

  // 2.3 Driver B CANNOT see Driver A orders
  const driverBGetReq = new Request('http://localhost:3000/api/driver/orders', {
    headers: { Cookie: driverBCookie },
  });
  const driverBGetData = await (await getDriverOrders(driverBGetReq)).json();
  assert(!driverBGetData.activeOrders.some((o) => o.id === order1.id), 'Driver B CANNOT see Driver A order (Object Isolation PASS)');

  // 2.4 Driver B cannot spoof query ?driverId=driverA.id
  const spoofReq = new Request(`http://localhost:3000/api/driver/orders?driverId=${driverA.id}`, {
    headers: { Cookie: driverBCookie },
  });
  const spoofRes = await getDriverOrders(spoofReq);
  assert(spoofRes.status === 403, 'Driver B spoofing driverId query parameter rejected with HTTP 403');

  // 2.5 Unauthenticated request rejected
  const unauthReq = new Request('http://localhost:3000/api/driver/orders');
  assert((await getDriverOrders(unauthReq)).status === 401, 'Unauthenticated request rejected with HTTP 401');

  // =========================================================
  // Test 3: Start Delivery / Confirm Pickup
  // =========================================================
  console.log('\n--- Test 3: Start Delivery / Confirm Pickup ---');

  // 3.1 Driver B attempts to start Driver A's order -> 403
  const badStartReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverBCookie },
    body: JSON.stringify({ action: 'start_delivery', orderId: order1.id }),
  });
  const badStartRes = await postDriverOrders(badStartReq);
  assert(badStartRes.status === 403, 'Driver B unauthorized start rejected with HTTP 403');

  // 3.2 Driver A starts delivery
  const validStartReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({ action: 'start_delivery', orderId: order1.id }),
  });
  const validStartRes = await postDriverOrders(validStartReq);
  const validStartData = await validStartRes.json();
  assert(validStartRes.status === 200 && validStartData.success === true, 'Driver A successfully started delivery');
  assert(validStartData.order.status === 'shipped', 'Order status transitioned to shipped (Out for delivery)');
  assert(validStartData.order.outForDeliveryAt !== undefined, 'outForDeliveryAt recorded');

  // 3.3 Verify stock NOT deducted again!
  const [stockCheck2] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(parseInt(stockCheck2.current_stock_pieces, 10) === 52, 'Stock remains unchanged at 52 (NOT double-deducted!)');

  // 3.4 Verify idempotency of start_delivery
  const repeatStartReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({ action: 'start_delivery', orderId: order1.id }),
  });
  const repeatStartRes = await postDriverOrders(repeatStartReq);
  assert(repeatStartRes.status === 200, 'Re-submitting start_delivery succeeds idempotently');

  // 3.5 Prevent reassignment when order is shipped
  let shippedReassignCaught = false;
  try {
    await pgAssignOrderDriver({
      orderId: order1.id,
      driverId: driverB.id,
      adminOperator,
    });
  } catch (err) {
    shippedReassignCaught = true;
    assert(err.message.includes('خرجت للتوصيل بالفعل'), 'Reassignment blocked when order is already out for delivery');
  }
  assert(shippedReassignCaught, 'Reassignment of shipped order safely blocked');

  // 3.6 Driver A registers arrival at customer location (Order is shipped)
  const arriveReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({ action: 'notify_arrived', orderId: order1.id }),
  });
  const arriveRes = await postDriverOrders(arriveReq);
  const arriveData = await arriveRes.json();
  assert(arriveRes.status === 200 && arriveData.success === true, 'Driver A successfully registered arrival (HTTP 200)');
  assert(arriveData.arrivedAt !== undefined, 'Arrival timestamp returned');
  assert(arriveData.alreadyArrived === false, 'First arrival registration has alreadyArrived: false');

  // Verify driver_arrived_at and audit log in PostgreSQL
  const [orderAfterArrive] = await sql`SELECT driver_arrived_at, updated_at FROM orders WHERE id = ${order1.id}`;
  assert(orderAfterArrive.driver_arrived_at !== null, 'driver_arrived_at column populated in PostgreSQL');

  const [arriveAudit] = await sql`
    SELECT * FROM audit_logs
    WHERE target_id = ${order1.id} AND action_type = 'delivery_arrived'
  `;
  assert(arriveAudit !== undefined, 'delivery_arrived audit log created in PostgreSQL');

  // 3.7 Idempotency: Duplicate arrival registration must NOT create a new audit log or alter updated_at
  const repeatArriveReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({ action: 'notify_arrived', orderId: order1.id }),
  });
  const repeatArriveRes = await postDriverOrders(repeatArriveReq);
  const repeatArriveData = await repeatArriveRes.json();
  assert(repeatArriveRes.status === 200 && repeatArriveData.success === true, 'Duplicate arrival registration succeeds idempotently');
  assert(repeatArriveData.alreadyArrived === true, 'Duplicate arrival has alreadyArrived: true');
  assert(repeatArriveData.arrivedAt === arriveData.arrivedAt, 'Returns exact same arrivedAt timestamp');

  const arriveAuditCount = await sql`
    SELECT count(*) FROM audit_logs
    WHERE target_id = ${order1.id} AND action_type = 'delivery_arrived'
  `;
  assert(parseInt(arriveAuditCount[0].count, 10) === 1, 'Exactly ONE delivery_arrived audit log exists (no duplicate audit logs)');

  const [orderAfterRepeatArrive] = await sql`SELECT updated_at FROM orders WHERE id = ${order1.id}`;
  assert(
    new Date(orderAfterRepeatArrive.updated_at).getTime() === new Date(orderAfterArrive.updated_at).getTime(),
    'updated_at was NOT modified on duplicate arrival registration'
  );

  // =========================================================
  // Test 4: Deliver & Cash Collection (Idempotent)
  // =========================================================
  console.log('\n--- Test 4: Deliver & Cash Collection ---');

  // 4.1 Driver B attempts to deliver Driver A's order -> 403
  const badDeliverReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverBCookie },
    body: JSON.stringify({
      orderId: order1.id,
      collectionStatus: 'collected_cash',
    }),
  });
  assert((await postDriverOrders(badDeliverReq)).status === 403, 'Driver B delivery attempt on Driver A order rejected with HTTP 403');

  // 4.2 Driver A delivers Order 1 with cash collection
  const validDeliverReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      orderId: order1.id,
      collectionStatus: 'collected_cash',
      collectedAmount: 1, // Driver app sends arbitrary 1 IQD, Server MUST use real total (40,000)!
      notes: 'تم التسليم ليد صاحب الماركت مباشرة',
    }),
  });
  const validDeliverRes = await postDriverOrders(validDeliverReq);
  const validDeliverData = await validDeliverRes.json();
  assert(validDeliverRes.status === 200 && validDeliverData.success === true, 'Driver A successfully delivered order (HTTP 200)');
  assert(validDeliverData.order.status === 'delivered', 'Order status is delivered');
  assert(validDeliverData.order.collectionStatus === 'collected_cash', 'collectionStatus is collected_cash');
  assert(validDeliverData.order.collectedAmount === 40000, 'Server-side total 40,000 used, NOT client 1 IQD!');
  assert(validDeliverData.order.driverCashSettled === false, 'driverCashSettled is false (stays in driver custody until settlement)');

  // Check Driver A stats: currentCashInHand = 40000
  const driverAStats = await pgGetDriverById(driverA.id);
  assert(driverAStats.currentCashInHand === 40000, 'Driver A cash in hand accurately computed as 40,000 IQD');

  // 4.3 Idempotent Delivery: Re-sending deliver request MUST NOT duplicate cash!
  const repeatDeliverReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      orderId: order1.id,
      collectionStatus: 'collected_cash',
    }),
  });
  const repeatDeliverRes = await postDriverOrders(repeatDeliverReq);
  assert(repeatDeliverRes.status === 200, 'Re-sending deliver succeeds idempotently');
  const driverAStatsAfterRepeat = await pgGetDriverById(driverA.id);
  assert(
    driverAStatsAfterRepeat.currentCashInHand === 40000,
    'Cash in hand NOT doubled on repeated delivery (remains exactly 40,000 IQD)'
  );

  // 4.4 Terminal State Protection: Delivered order cannot be restarted
  let restartDeliveredCaught = false;
  try {
    await pgStartDriverDelivery(driverA.id, order1.id, {
      id: driverA.id,
      name: driverA.name,
      phone: driverA.phone,
    });
  } catch (err) {
    restartDeliveredCaught = true;
    assert(err.message.includes('تم تسليمه بالفعل'), 'Blocked restarting delivered order');
  }
  assert(restartDeliveredCaught, 'Restarting delivered order cleanly prevented');

  // 4.5 Arrival notification rejected for delivered order
  let arriveDeliveredCaught = false;
  try {
    await pgNotifyDriverArrived(driverA.id, order1.id, { id: driverA.id, name: driverA.name, phone: driverA.phone });
  } catch (err) {
    arriveDeliveredCaught = true;
    assert(err.message.includes('تم تسليمها بالفعل'), 'Rejects arrival notification for delivered order');
  }
  assert(arriveDeliveredCaught, 'Arrival notification cleanly rejected for delivered order');

  // =========================================================
  // Test 5: Scenario 2 — Failed Delivery & Return to Warehouse
  // =========================================================
  console.log('\n--- Test 5: Scenario 2 — Failed Delivery & Return to Warehouse ---');

  // 5.1 Create Order 2 (1 carton = 24 pieces -> stock drops from 52 to 28)
  const order2 = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت النور',
      phone: '07701112233',
      city: 'بغداد',
      address: 'الكرادة داخل',
      isGuest: false,
      userId: custAccount.id,
    },
    items: [
      {
        productId: prodA.id,
        name: 'عصير راني برتقال حبيبات كرتون 24',
        price: 20000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كرتون 24 قطعة',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccount.id,
  });

  const [stockCheck3] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(parseInt(stockCheck3.current_stock_pieces, 10) === 28, 'Stock deducted for Order 2 (52 -> 28)');

  // Assign Order 2 to Driver A and start delivery
  await pgAssignOrderDriver({
    orderId: order2.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, order2.id, {
    id: driverA.id,
    name: driverA.name,
    phone: driverA.phone,
  });

  // 5.2 Driver B attempts to record failure -> 403
  const badFailReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverBCookie },
    body: JSON.stringify({
      action: 'fail_delivery',
      orderId: order2.id,
      reason: 'customer_unreachable',
    }),
  });
  assert((await postDriverOrders(badFailReq)).status === 403, 'Driver B failed delivery attempt rejected with HTTP 403');

  // 5.3 Driver A records delivery failure (customer_unreachable)
  const validFailReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      action: 'fail_delivery',
      orderId: order2.id,
      reason: 'customer_unreachable',
      notes: 'الهاتف مغلق والمحل مقفل',
    }),
  });
  const validFailRes = await postDriverOrders(validFailReq);
  const validFailData = await validFailRes.json();
  assert(validFailRes.status === 200 && validFailData.success === true, 'Failed delivery recorded successfully');
  assert(validFailData.order.status === 'processing', 'Order status moved to processing for rescheduling');
  assert(validFailData.order.driverNotes.includes('customer_unreachable'), 'Structured failure reason recorded in driverNotes');

  // Verify inventory is NOT restored upon delivery failure (items still with driver)
  const [stockCheck4] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(parseInt(stockCheck4.current_stock_pieces, 10) === 28, 'Stock remains at 28 (Goods still with driver, NOT restored yet)');

  // 5.4 Driver B attempts return -> 403
  const badReturnReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverBCookie },
    body: JSON.stringify({
      action: 'return_delivery',
      orderId: order2.id,
    }),
  });
  assert((await postDriverOrders(badReturnReq)).status === 403, 'Driver B return attempt rejected with HTTP 403');

  // 5.5 Driver A returns Order 2 to warehouse
  const validReturnReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      action: 'return_delivery',
      orderId: order2.id,
      notes: 'إرجاع البضاعة لمستودع كربلاء',
    }),
  });
  const validReturnRes = await postDriverOrders(validReturnReq);
  const validReturnData = await validReturnRes.json();
  assert(validReturnRes.status === 200 && validReturnData.success === true, 'Order returned to warehouse successfully');
  assert(validReturnData.order.status === 'cancelled', 'Order status is cancelled');
  assert(validReturnData.order.collectionStatus === 'returned', 'collectionStatus is returned');
  assert(validReturnData.order.inventoryRestored === true, 'inventoryRestored is true');

  // 5.6 Verify inventory restored exactly once (28 + 24 = 52)
  const [stockCheck5] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(parseInt(stockCheck5.current_stock_pieces, 10) === 52, 'Stock restored to warehouse exactly once (28 + 24 = 52 pieces)');

  // Verify inventory_movements record exists
  const [returnMove] = await sql`
    SELECT * FROM inventory_movements
    WHERE reference_id = ${order2.id} AND movement_type = 'customer_return'
  `;
  assert(returnMove !== undefined, 'inventory_movements row exists with movement_type = customer_return');
  assert(returnMove.quantity_pieces === 24, '24 pieces credited to inventory');

  // 5.7 Duplicate Return Idempotency Protection
  const repeatReturnReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      action: 'return_delivery',
      orderId: order2.id,
      notes: 'إرجاع مكرر للبضاعة للمستودع',
    }),
  });
  const repeatReturnRes = await postDriverOrders(repeatReturnReq);
  assert(repeatReturnRes.status === 200, 'Re-submitting return succeeds idempotently');
  const [stockCheck6] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(parseInt(stockCheck6.current_stock_pieces, 10) === 52, 'Stock NOT double restored on repeat return (remains 52)');

  const returnMoveCount = await sql`
    SELECT count(*) FROM inventory_movements
    WHERE reference_id = ${order2.id} AND movement_type = 'customer_return'
  `;
  assert(parseInt(returnMoveCount[0].count, 10) === 1, 'Exactly 1 return movement exists in inventory_movements (no duplicate movements)');

  // 5.8 Arrival notification rejected for cancelled / returned order
  let arriveReturnedCaught = false;
  try {
    await pgNotifyDriverArrived(driverA.id, order2.id, { id: driverA.id, name: driverA.name, phone: driverA.phone });
  } catch (err) {
    arriveReturnedCaught = true;
    assert(err.message.includes('ملغاة أو راجعة'), 'Rejects arrival notification for cancelled/returned order');
  }
  assert(arriveReturnedCaught, 'Arrival notification cleanly rejected for returned order');

  // =========================================================
  // Test 6: Concurrency & Race Conditions Protection
  // =========================================================
  console.log('\n--- Test 6: Concurrency & Race Conditions Protection ---');

  // 6.1 Create Order 3
  const order3 = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت النور',
      phone: '07701112233',
      city: 'بغداد',
      address: 'المنصور',
      isGuest: false,
      userId: custAccount.id,
    },
    items: [
      {
        productId: prodA.id,
        name: 'عصير راني برتقال حبيبات كرتون 24',
        price: 20000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كرتون 24 قطعة',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccount.id,
  });

  await pgAssignOrderDriver({
    orderId: order3.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, order3.id, {
    id: driverA.id,
    name: driverA.name,
    phone: driverA.phone,
  });

  // 6.2 Execute two parallel deliver operations concurrently
  const driverOpA = { id: driverA.id, name: driverA.name, phone: driverA.phone };
  const [resConcurrent1, resConcurrent2] = await Promise.all([
    pgDeliverDriverOrder(driverA.id, order3.id, driverOpA, { collectionStatus: 'collected_cash' }),
    pgDeliverDriverOrder(driverA.id, order3.id, driverOpA, { collectionStatus: 'collected_cash' }),
  ]);

  assert(resConcurrent1.status === 'delivered', 'First concurrent deliver completed');
  assert(resConcurrent2.status === 'delivered', 'Second concurrent deliver completed safely');

  // Verify exactly 1 delivery_completed audit log was logged
  const auditDeliveryCount = await sql`
    SELECT count(*) FROM audit_logs
    WHERE target_id = ${order3.id} AND action_type = 'delivery_completed'
  `;
  assert(parseInt(auditDeliveryCount[0].count, 10) === 1, 'Exactly ONE delivery_completed audit row logged under race condition');

  // Total cash in hand should be Order 1 (40000) + Order 3 (20000) = 60000
  const driverAStatsFinal = await pgGetDriverById(driverA.id);
  assert(
    driverAStatsFinal.currentCashInHand === 60000,
    'Driver A final cash in hand is exactly 60,000 IQD (no double-crediting in race condition)'
  );

  // 6.3 Concurrency Test: Deliver x Return on the same order (Order 5)
  console.log('\n--- 6.3 Concurrency Test: Deliver x Return on the same order ---');
  const order5 = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت النور',
      phone: '07701112233',
      city: 'بغداد',
      address: 'حي اليرموك',
      isGuest: false,
      userId: custAccount.id,
    },
    items: [
      {
        productId: prodA.id,
        name: 'عصير راني برتقال حبيبات كرتون 24',
        price: 20000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كرتون 24 قطعة',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccount.id,
  });

  await pgAssignOrderDriver({
    orderId: order5.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, order5.id, driverOpA);

  const [stockBefore5] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  const stockBeforeNum5 = parseInt(stockBefore5.current_stock_pieces, 10);

  // Fire Deliver and Return concurrently
  const [raceDeliverRes, raceReturnRes] = await Promise.allSettled([
    pgDeliverDriverOrder(driverA.id, order5.id, driverOpA, { collectionStatus: 'collected_cash' }),
    pgReturnDriverOrder(driverA.id, order5.id, driverOpA, { reason: 'إرجاع متزامن في السباق' }),
  ]);

  const fulfilledCount5 = [raceDeliverRes, raceReturnRes].filter((r) => r.status === 'fulfilled').length;
  const rejectedCount5 = [raceDeliverRes, raceReturnRes].filter((r) => r.status === 'rejected').length;

  assert(fulfilledCount5 === 1, 'Deliver x Return race: Exactly ONE operation succeeded');
  assert(rejectedCount5 === 1, 'Deliver x Return race: Exactly ONE operation was rejected');

  const [finalOrder5] = await sql`SELECT status, collection_status, inventory_restored FROM orders WHERE id = ${order5.id}`;
  const [stockAfter5] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  const stockAfterNum5 = parseInt(stockAfter5.current_stock_pieces, 10);

  if (raceDeliverRes.status === 'fulfilled') {
    assert(finalOrder5.status === 'delivered', 'Deliver won: Final status is delivered');
    assert(stockAfterNum5 === stockBeforeNum5, 'Deliver won: Stock was NOT restored after delivery');
    assert(
      raceReturnRes.reason.message.includes('تم تسليمه بالفعل'),
      'Deliver won: Return rejected with explicit delivered error'
    );
  } else {
    assert(finalOrder5.status === 'cancelled' && finalOrder5.collection_status === 'returned', 'Return won: Final status is returned');
    assert(stockAfterNum5 === stockBeforeNum5 + 24, 'Return won: Stock was restored exactly once');
    assert(
      raceDeliverRes.reason.message.includes('ملغى أو راجع'),
      'Return won: Deliver rejected with explicit returned error'
    );
  }

  // 6.4 Concurrency Test: Return x Return on the same order (Order 6)
  console.log('\n--- 6.4 Concurrency Test: Return x Return on the same order ---');
  const order6 = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت النور',
      phone: '07701112233',
      city: 'بغداد',
      address: 'الدورة',
      isGuest: false,
      userId: custAccount.id,
    },
    items: [
      {
        productId: prodA.id,
        name: 'عصير راني برتقال حبيبات كرتون 24',
        price: 20000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كرتون 24 قطعة',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccount.id,
  });

  await pgAssignOrderDriver({
    orderId: order6.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, order6.id, driverOpA);

  const [stockBefore6] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  const stockBeforeNum6 = parseInt(stockBefore6.current_stock_pieces, 10);

  // Fire two Return operations concurrently
  await Promise.allSettled([
    pgReturnDriverOrder(driverA.id, order6.id, driverOpA, { reason: 'إرجاع متزامن 1' }),
    pgReturnDriverOrder(driverA.id, order6.id, driverOpA, { reason: 'إرجاع متزامن 2' }),
  ]);

  const [stockAfter6] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  const stockAfterNum6 = parseInt(stockAfter6.current_stock_pieces, 10);

  assert(
    stockAfterNum6 === stockBeforeNum6 + 24,
    `Return x Return race: Stock restored exactly once (${stockBeforeNum6} -> ${stockAfterNum6})`
  );

  const [returnMoveCount6] = await sql`
    SELECT count(*) FROM inventory_movements
    WHERE reference_id = ${order6.id} AND movement_type = 'customer_return'
  `;
  assert(parseInt(returnMoveCount6.count, 10) === 1, 'Return x Return race: Exactly 1 customer_return inventory movement recorded');

  const [returnAuditCount6] = await sql`
    SELECT count(*) FROM audit_logs
    WHERE target_id = ${order6.id} AND action_type = 'order_cancelled'
  `;
  assert(parseInt(returnAuditCount6.count, 10) === 1, 'Return x Return race: Exactly 1 order_cancelled audit log recorded');

  // =========================================================
  // Test 7: Authentication & Session Dropping Edge Cases
  // =========================================================
  console.log('\n--- Test 7: Authentication & Session Dropping Edge Cases ---');

  // 7.1 Deactivating driver drops session immediately
  await sql`UPDATE drivers SET is_active = false WHERE id = ${driverA.id}`;
  const inactiveDriverReq = new Request('http://localhost:3000/api/driver/orders', {
    headers: { Cookie: driverACookie },
  });
  assert((await getDriverOrders(inactiveDriverReq)).status === 401, 'Deactivated driver returns HTTP 401');

  // 7.2 Deactivating auth_identity drops session immediately
  await sql`UPDATE drivers SET is_active = true WHERE id = ${driverA.id}`;
  await sql`UPDATE auth_identities SET is_active = false WHERE id = ${driverA.authIdentityId}`;
  assert((await getDriverOrders(inactiveDriverReq)).status === 401, 'Deactivated auth_identity returns HTTP 401');

  // Restore
  await sql`UPDATE auth_identities SET is_active = true WHERE id = ${driverA.authIdentityId}`;
  assert((await getDriverOrders(inactiveDriverReq)).status === 200, 'Session restored successfully upon reactivation');

  // 7.3 Unassigned Order Protection
  const order4 = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت النور',
      phone: '07701112233',
      city: 'بغداد',
      address: 'حي الجامعة',
      isGuest: false,
      userId: custAccount.id,
    },
    items: [
      {
        productId: prodA.id,
        name: 'عصير راني برتقال حبيبات كرتون 24',
        price: 20000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كرتون 24 قطعة',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccount.id,
  });

  const unassignedReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({ action: 'start_delivery', orderId: order4.id }),
  });
  assert((await postDriverOrders(unassignedReq)).status === 403, 'Unassigned order cannot be grabbed by arbitrary driver (HTTP 403)');

  // 7.4 Admin driver orders API check
  const adminDriverOrdersReq = new Request(`http://localhost:3000/api/admin/drivers/${driverA.id}/orders`, {
    headers: { Cookie: masterAdminCookie },
  });
  const adminDriverOrdersRes = await getAdminDriverOrders(adminDriverOrdersReq, { params: { id: driverA.id } });
  const adminDriverOrdersData = await adminDriverOrdersRes.json();
  const expectedDelivered = finalOrder5.status === 'delivered' ? 3 : 2;
  const expectedCash = finalOrder5.status === 'delivered' ? 80000 : 60000;
  assert(adminDriverOrdersData.stats.totalDelivered === expectedDelivered, `Admin stats totalDelivered matches (${expectedDelivered} delivered)`);
  assert(adminDriverOrdersData.stats.currentCashInHand === expectedCash, `Admin stats cash in hand matches ${expectedCash} IQD`);

  console.log('\n===============================================================');
  console.log(` ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED `);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

async function main() {
  try {
    await setup();
    await runDriversPhase2Tests();
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    if (sql) await sql.end();
    if (ep) {
      console.log('Stopping embedded PostgreSQL...');
      await ep.stop();
      console.log('Embedded PostgreSQL stopped.');
    }
    process.exit(0);
  }
}

main();
