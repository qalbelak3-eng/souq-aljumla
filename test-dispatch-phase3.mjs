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
import {
  buildDriverDeliveryQueue,
  resolveDeliveryQueueOrigin,
} from './src/lib/dispatch-recommender.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54348;
const tempDir = path.join(os.tmpdir(), 'ep_test_dispatch_phase3_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'dispatch-phase3-test-secret-min-32-chars-long';
process.env.DRIVER_SESSION_SECRET = 'dispatch-phase3-driver-secret-min-32-chars-long';
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
  ep = new Ep({ databaseDir: tempDir, port: PORT, initdbFlags: ['-E', 'UTF8', '--locale=C'] });
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
    const p = path.resolve(process.cwd(), m);
    if (fs.existsSync(p)) {
      await runSqlScript(sql, p);
    }
  }
  console.log('   All migrations applied.');
}

async function teardown() {
  if (sql) {
    await sql.end();
  }
  if (ep) {
    console.log('Stopping embedded PostgreSQL...');
    await ep.stop();
    console.log('Embedded PostgreSQL stopped.');
  }
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function runDispatchPhase3Tests() {
  console.log('\n===============================================================');
  console.log('     PHASE DISPATCH-3: MULTI-ORDER SMART DELIVERY QUEUE TESTS    ');
  console.log('===============================================================\n');

  // =========================================================================
  // SECTION A: Pure Algorithm Unit Tests (buildDriverDeliveryQueue)
  // =========================================================================
  console.log('--- Section A: Nearest Neighbor & Delivery Queue Algorithm ---');

  const warehouse = { lat: 32.6068, lng: 44.0186 }; // Karbala warehouse

  // Test A.1: 3 orders with different GPS coordinates
  // Order 1 is ~0.4 km from warehouse
  // Order 2 is ~5.7 km from warehouse
  // Order 3 is ~1.8 km from warehouse, and ~1.4 km from Order 1
  const order1 = {
    id: 'ord-001',
    orderNumber: 'INV-1001',
    status: 'shipped',
    customer: { name: 'زبون 1', phone: '07701111111', lat: 32.6100, lng: 44.0200, address: 'حي الحسين\nمقابل جامع الرسول' },
  };
  const order2 = {
    id: 'ord-002',
    orderNumber: 'INV-1002',
    status: 'shipped',
    customer: { name: 'زبون 2', phone: '07702222222', lat: 32.6500, lng: 44.0500, address: 'حي الحر' },
  };
  const order3 = {
    id: 'ord-003',
    orderNumber: 'INV-1003',
    status: 'shipped',
    customer: { name: 'زبون 3', phone: '07703333333', lat: 32.6200, lng: 44.0300, address: 'حي المعلمين\nقرب مدرسة النور' },
  };

  const resA1 = buildDriverDeliveryQueue([order2, order1, order3], { warehouseLocation: warehouse });
  assert(resA1.queue.length === 3, 'A.1: Queue contains all 3 orders');
  assert(resA1.nextSuggestedOrder !== null, 'A.1: Next suggested order is identified');
  assert(resA1.nextSuggestedOrder.order.id === 'ord-001', 'A.1: Order 1 is suggested next ⭐ (closest to warehouse ~0.4 km)');
  assert(resA1.queue[0].sequence === 1 && resA1.queue[0].isNextSuggested === true, 'A.1: Stop 1 marked sequence=1 and isNextSuggested=true');
  assert(resA1.queue[1].order.id === 'ord-003', 'A.1: Order 3 is stop 2 (closest from Order 1)');
  assert(resA1.queue[1].sequence === 2 && resA1.queue[1].isNextSuggested === false, 'A.1: Stop 2 marked sequence=2 and isNextSuggested=false');
  assert(resA1.queue[2].order.id === 'ord-002', 'A.1: Order 2 is stop 3');
  assert(resA1.queue[2].sequence === 3, 'A.1: Stop 3 marked sequence=3');
  assert(resA1.originUsed?.type === 'warehouse', 'A.1: Warehouse used as initial origin');
  assert(resA1.totalDistanceKm > 0, 'A.1: Total distance calculated > 0');
  assert(resA1.queue[0].locationDesc === 'مقابل جامع الرسول', 'A.1: locationDesc extracted correctly from snapshot');
  assert(resA1.queue[0].baseAddress === 'حي الحسين', 'A.1: baseAddress extracted correctly');

  // Test A.2: Recalculating next order after completing first order (Dynamic Origin)
  // Driver completes Order 1 at (32.6100, 44.0200).
  // Now history contains completed Order 1.
  // Remaining active orders: Order 2 and Order 3.
  const historyA2 = [
    {
      ...order1,
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
    },
  ];
  const resA2 = buildDriverDeliveryQueue([order2, order3], {
    warehouseLocation: warehouse,
    historyOrders: historyA2,
  });

  assert(resA2.queue.length === 2, 'A.2: Remaining queue has 2 orders');
  assert(resA2.originUsed?.type === 'last_delivered', 'A.2: Origin is last delivered order, NOT warehouse');
  assert(resA2.nextSuggestedOrder.order.id === 'ord-003', 'A.2: Next suggested order is Order 3 ⭐ (closest to completed Order 1)');
  assert(resA2.queue[0].sequence === 1, 'A.2: Sequence 1 is Order 3');
  assert(resA2.queue[1].sequence === 2, 'A.2: Sequence 2 is Order 2');

  // Test A.3: Order without GPS coordinates
  const orderNoGps = {
    id: 'ord-004',
    orderNumber: 'INV-1004',
    status: 'shipped',
    customer: { name: 'زبون بدون موقع', phone: '07704444444', address: 'بغداد - الكرخ' },
  };

  const resA3 = buildDriverDeliveryQueue([orderNoGps, order2, order1], { warehouseLocation: warehouse });
  assert(resA3.queue.length === 3, 'A.3: Order without GPS is NOT excluded from queue');
  assert(resA3.ordersWithoutGpsCount === 1, 'A.3: ordersWithoutGpsCount is 1');
  assert(resA3.ordersWithGpsCount === 2, 'A.3: ordersWithGpsCount is 2');
  const lastItem = resA3.queue[resA3.queue.length - 1];
  assert(lastItem.order.id === 'ord-004', 'A.3: Order without GPS is placed AFTER orders with GPS');
  assert(lastItem.hasGps === false, 'A.3: Order without GPS has hasGps === false');
  assert(lastItem.distanceKm === null, 'A.3: Order without GPS has distanceKm === null (clearly indicated)');
  assert(lastItem.cumulativeDistanceKm === null, 'A.3: Order without GPS has cumulativeDistanceKm === null');

  // Test A.4: Deterministic Tie-breaking for Equal Distances
  // Two orders at exact same coordinates / distance
  const orderTieA = {
    id: 'ord-aaa',
    orderNumber: 'INV-2001',
    status: 'shipped',
    customer: { name: 'زبون أ', phone: '07700000001', lat: 32.6200, lng: 44.0300, address: 'حي البلدية' },
  };
  const orderTieB = {
    id: 'ord-bbb',
    orderNumber: 'INV-2002',
    status: 'shipped',
    customer: { name: 'زبون ب', phone: '07700000002', lat: 32.6200, lng: 44.0300, address: 'حي البلدية' },
  };

  const run1 = buildDriverDeliveryQueue([orderTieA, orderTieB], { warehouseLocation: warehouse });
  const run2 = buildDriverDeliveryQueue([orderTieB, orderTieA], { warehouseLocation: warehouse });
  assert(
    run1.queue[0].order.id === run2.queue[0].order.id && run1.queue[1].order.id === run2.queue[1].order.id,
    'A.4: Deterministic tie-breaker produces identical order regardless of input array ordering'
  );
  assert(run1.queue[0].order.orderNumber === 'INV-2001', 'A.4: INV-2001 deterministically precedes INV-2002');

  // Test A.5: Priority of 'shipped' over 'processing'
  // Driver has 1 shipped order (in vehicle) and 1 processing order (still in warehouse)
  const orderProcessing = {
    id: 'ord-proc',
    orderNumber: 'INV-1005',
    status: 'processing',
    customer: { name: 'زبون تجهيز', phone: '07705555555', lat: 32.6070, lng: 44.0190, address: 'قريب جداً من المخزن' },
  };
  // Even though orderProcessing is geographically closer to warehouse, order1 is shipped (in vehicle)
  const resA5 = buildDriverDeliveryQueue([orderProcessing, order1], { warehouseLocation: warehouse });
  assert(resA5.queue[0].order.id === 'ord-001', 'A.5: Shipped order in vehicle has priority over processing order');
  assert(resA5.queue[0].statusGroup === 'shipped', 'A.5: First queue item statusGroup is shipped');
  assert(resA5.queue[1].order.id === 'ord-proc', 'A.5: Processing order placed after shipped orders');
  assert(resA5.queue[1].statusGroup === 'processing', 'A.5: Second queue item statusGroup is processing');

  // Test A.6: Pure Function Verification (No Side Effects)
  const originalStatus1 = order1.status;
  const originalStatus2 = order2.status;
  buildDriverDeliveryQueue([order1, order2]);
  assert(order1.status === originalStatus1, 'A.6: Order 1 status is completely unchanged');
  assert(order2.status === originalStatus2, 'A.6: Order 2 status is completely unchanged');

  // Test A.7: Strict No-Fake-Coordinates Policy
  const originNone = resolveDeliveryQueueOrigin({ warehouseLocation: null, lastDeliveredLocation: null, historyOrders: [] });
  assert(originNone.coords === null, 'A.7: Coords are strictly null when no warehouse is configured (No fake fallback)');
  assert(originNone.type === 'none', 'A.7: Origin type is none');
  assert(originNone.label === 'موقع المخزن غير محدد في الإعدادات', 'A.7: Informative Arabic label indicates warehouse not configured');

  const resA7 = buildDriverDeliveryQueue([order2, order1], { warehouseLocation: null, historyOrders: [] });
  assert(resA7.originUsed === null, 'A.7: originUsed is strictly null');
  assert(resA7.totalDistanceKm === 0, 'A.7: totalDistanceKm is 0 when no origin');
  assert(resA7.queue[0].distanceKm === null, 'A.7: First order distanceKm is null (not invented)');
  assert(resA7.queue[0].cumulativeDistanceKm === null, 'A.7: First order cumulativeDistanceKm is null');
  assert(resA7.queue[1].distanceKm === null, 'A.7: Second order distanceKm is null');

  // =========================================================================
  // SECTION B: Database & API Integration Tests
  // =========================================================================
  console.log('\n--- Section B: PostgreSQL Database & API Integration ---');

  const {
    pgCreateDriver,
    pgGetDriverById,
  } = await import('./src/lib/postgres-drivers.ts');
  const {
    pgCreateOrder,
    pgCancelOrder,
  } = await import('./src/lib/postgres-orders.ts');
  const {
    pgAssignOrderDriver,
    pgStartDriverDelivery,
    pgDeliverDriverOrder,
    pgGetDriverOrders,
  } = await import('./src/lib/postgres-delivery.ts');
  const { GET: getDriverOrdersRoute } = await import('./src/app/api/driver/orders/route.ts');
  const { pgGetStoreSettings, pgUpdateStoreSettings } = await import('./src/lib/postgres-settings.ts');
  const { GET: getSettingsRoute, POST: postSettingsRoute } = await import('./src/app/api/settings/route.ts');

  // Seed Admin Operator
  const adminOp = {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'المشرف الرئيسي',
    phone: '07700000000',
    role: 'admin',
  };

  // Seed Reference Data: Category, Product, Customer Auth & Account
  const [cat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم العصائر', 'drinks-phase3')
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
      'عصير برتقال طبيعي', ${cat.id},
      1, 1, 1,
      1000,
      'قنينة', 'كرتون',
      25000, 20000, 15000, 15000
    ) RETURNING id;
  `;

  const [custAuth] = await sql`
    INSERT INTO auth_identities (phone, role, is_active)
    VALUES ('07709998811', 'customer', true)
    RETURNING id;
  `;

  const [custAcc] = await sql`
    INSERT INTO financial_accounts (account_code, name, phone, category, pricing_tier, auth_identity_id, is_active)
    VALUES ('CUST-8811', 'ماركت الكوثر', '07709998811', 'customer', 'wholesale', ${custAuth.id}, true)
    RETURNING id;
  `;

  // Seed Driver A and Driver B
  const driverA = await pgCreateDriver({
    name: 'كابتن علي المساري',
    phone: '07708881122',
    password: 'password123',
    vehicleInfo: 'كيا حمل بيضاء',
  });
  const driverB = await pgCreateDriver({
    name: 'كابتن حسن المنافس',
    phone: '07708883344',
    password: 'password123',
    vehicleInfo: 'سايبا صفراء',
  });
  assert(driverA.id && driverB.id, 'B.0: Drivers A and B seeded successfully');

  // Create 3 orders for Driver A
  // Order A1: lat: 32.6100, lng: 44.0200 (~0.4 km from warehouse)
  const dbOrderA1 = await pgCreateOrder({
    customer: {
      name: 'متجر الأنوار',
      phone: '07701112233',
      city: 'كربلاء',
      address: 'حي الحسين\nمقابل حسينية القصابين',
      lat: 32.6100,
      lng: 44.0200,
      isGuest: false,
      userId: custAuth.id,
    },
    items: [{ productId: prod.id, name: 'عصير برتقال', price: 20000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });

  // Order A2: lat: 32.6500, lng: 44.0500 (~5.7 km from warehouse)
  const dbOrderA2 = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت الأمل',
      phone: '07702223344',
      city: 'كربلاء',
      address: 'حي الحر\nقرب فلكة الحر',
      lat: 32.6500,
      lng: 44.0500,
      isGuest: false,
      userId: custAuth.id,
    },
    items: [{ productId: prod.id, name: 'عصير برتقال', price: 20000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });

  // Order A3: lat: 32.6200, lng: 44.0300 (~1.8 km from warehouse, ~1.4 km from Order A1)
  const dbOrderA3 = await pgCreateOrder({
    customer: {
      name: 'ماركت الفردوس',
      phone: '07703334455',
      city: 'كربلاء',
      address: 'حي المعلمين\nشارع المعارض',
      lat: 32.6200,
      lng: 44.0300,
      isGuest: false,
      userId: custAuth.id,
    },
    items: [{ productId: prod.id, name: 'عصير برتقال', price: 20000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });

  // Create Order B for Driver B
  const dbOrderB = await pgCreateOrder({
    customer: {
      name: 'ماركت خاص بسائق آخر',
      phone: '07709990000',
      city: 'كربلاء',
      address: 'شارع ميثم التمار',
      lat: 32.6300,
      lng: 44.0400,
      isGuest: false,
      userId: custAuth.id,
    },
    items: [{ productId: prod.id, name: 'عصير برتقال', price: 20000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });

  // Assign Orders
  await pgAssignOrderDriver({ orderId: dbOrderA1.id, driverId: driverA.id, adminOperator: adminOp });
  await pgAssignOrderDriver({ orderId: dbOrderA2.id, driverId: driverA.id, adminOperator: adminOp });
  await pgAssignOrderDriver({ orderId: dbOrderA3.id, driverId: driverA.id, adminOperator: adminOp });
  await pgAssignOrderDriver({ orderId: dbOrderB.id, driverId: driverB.id, adminOperator: adminOp });

  // Driver A starts delivery for all 3 orders -> status becomes 'shipped'
  const driverOpA = { id: driverA.id, name: driverA.name, phone: driverA.phone };
  await pgStartDriverDelivery(driverA.id, dbOrderA1.id, driverOpA);
  await pgStartDriverDelivery(driverA.id, dbOrderA2.id, driverOpA);
  await pgStartDriverDelivery(driverA.id, dbOrderA3.id, driverOpA);

  // Check Driver A stats
  const driverAStats = await pgGetDriverById(driverA.id);
  assert(driverAStats.activeDeliveries === 3, 'B.1: Driver A has activeDeliveries=3');
  assert(driverAStats.inFlightDeliveries === 3, 'B.1: Driver A has inFlightDeliveries=3');
  assert(driverAStats.effectiveStatus === 'busy', 'B.1: Driver A effectiveStatus is busy 🟠');

  const tokenA = signDriverSession({
    driverId: driverA.id,
    authIdentityId: driverA.authIdentityId,
    phone: driverA.phone,
    name: driverA.name,
    role: 'driver',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  // Test B.1b: Initial PostgreSQL store settings (Warehouse coords are strictly null/undefined, no fake fallback)
  const initialPgSettings = await pgGetStoreSettings();
  assert(
    initialPgSettings.warehouseLat === undefined || initialPgSettings.warehouseLat === null,
    'B.1b: Initial PostgreSQL warehouseLat is null/undefined (strictly no placeholder)'
  );
  assert(
    initialPgSettings.warehouseLng === undefined || initialPgSettings.warehouseLng === null,
    'B.1b: Initial PostgreSQL warehouseLng is null/undefined (strictly no placeholder)'
  );

  // Before warehouse is configured, driver orders route returns deliveryQueue with originUsed = null
  const reqABefore = new Request(`http://localhost:3000/api/driver/orders?driverId=${driverA.id}`, {
    headers: { cookie: `${DRIVER_SESSION_COOKIE_NAME}=${tokenA}` },
  });
  const apiResABefore = await getDriverOrdersRoute(reqABefore);
  const dataABefore = await apiResABefore.json();
  assert(dataABefore.success === true, 'B.1b: GET /api/driver/orders succeeded before warehouse configured');
  assert(dataABefore.deliveryQueue.originUsed === null, 'B.1b: deliveryQueue.originUsed is null (no fake warehouse used)');
  assert(dataABefore.deliveryQueue.totalDistanceKm === 0, 'B.1b: totalDistanceKm is 0 when warehouse not configured');

  // Test B.1c: Admin configures real warehouse in PostgreSQL via POST /api/settings
  const updateSettingsReq = new Request('http://localhost:3000/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      warehouseLat: 32.6068,
      warehouseLng: 44.0186,
      warehouseName: 'مستودع كربلاء المركزي المعتمد',
      pricePerKm: 500,
    }),
  });
  const updateRes = await postSettingsRoute(updateSettingsReq);
  const updateData = await updateRes.json();
  assert(updateData.success === true, 'B.1c: POST /api/settings succeeded updating warehouse in PostgreSQL');
  assert(updateData.settings.warehouseLat === 32.6068, 'B.1c: PostgreSQL saved real warehouseLat (32.6068)');
  assert(updateData.settings.warehouseLng === 44.0186, 'B.1c: PostgreSQL saved real warehouseLng (44.0186)');

  // Verify GET /api/settings reads persisted settings from PostgreSQL
  const getSettingsReq = new Request('http://localhost:3000/api/settings');
  const getSettingsRes = await getSettingsRoute(getSettingsReq);
  const getSettingsData = await getSettingsRes.json();
  assert(getSettingsData.settings.warehouseLat === 32.6068, 'B.1c: GET /api/settings confirms persisted warehouseLat');
  assert(getSettingsData.settings.warehouseLng === 44.0186, 'B.1c: GET /api/settings confirms persisted warehouseLng');

  // Test B.2: Call GET /api/driver/orders for Driver A with configured warehouse
  const reqA = new Request(`http://localhost:3000/api/driver/orders?driverId=${driverA.id}`, {
    headers: {
      cookie: `${DRIVER_SESSION_COOKIE_NAME}=${tokenA}`,
    },
  });

  const apiResA = await getDriverOrdersRoute(reqA);
  const dataA = await apiResA.json();
  if (!dataA.success) {
    console.error('DEBUG apiResA status:', apiResA.status, dataA);
  }
  assert(dataA.success === true, 'B.2: GET /api/driver/orders succeeded for Driver A');
  assert(dataA.deliveryQueue !== undefined, 'B.2: deliveryQueue returned in API response');
  assert(dataA.deliveryQueue.originUsed !== null, 'B.2: deliveryQueue has originUsed after warehouse configured in PostgreSQL');
  assert(dataA.deliveryQueue.originUsed.type === 'warehouse', 'B.2: originUsed.type is warehouse');
  assert(dataA.deliveryQueue.originUsed.lat === 32.6068, 'B.2: originUsed.lat matches PostgreSQL warehouse');
  assert(dataA.deliveryQueue.originUsed.lng === 44.0186, 'B.2: originUsed.lng matches PostgreSQL warehouse');
  assert(dataA.deliveryQueue.queue.length === 3, 'B.2: deliveryQueue contains exactly Driver A 3 orders');
  assert(dataA.deliveryQueue.nextSuggestedOrder.order.id === dbOrderA1.id, 'B.2: Order A1 is suggested next ⭐');
  assert(dataA.deliveryQueue.queue[0].order.id === dbOrderA1.id, 'B.2: Queue sequence 1 is Order A1');
  assert(dataA.deliveryQueue.queue[1].order.id === dbOrderA3.id, 'B.2: Queue sequence 2 is Order A3');
  assert(dataA.deliveryQueue.queue[2].order.id === dbOrderA2.id, 'B.2: Queue sequence 3 is Order A2');
  assert(dataA.deliveryQueue.queue[0].locationDesc === 'مقابل حسينية القصابين', 'B.2: locationDesc returned in queue stop 1');

  // Test B.3: Driver Isolation - Driver B orders NOT in Driver A's queue
  const hasOrderB = dataA.deliveryQueue.queue.some((q) => q.order.id === dbOrderB.id);
  assert(!hasOrderB, 'B.3: Driver B order is strictly absent from Driver A deliveryQueue (Isolation guaranteed)');

  // Test B.4: Driver A cannot query Driver B's orders
  const reqSpoofed = new Request(`http://localhost:3000/api/driver/orders?driverId=${driverB.id}`, {
    headers: {
      cookie: `${DRIVER_SESSION_COOKIE_NAME}=${tokenA}`,
    },
  });
  const spoofRes = await getDriverOrdersRoute(reqSpoofed);
  assert(spoofRes.status === 403, 'B.4: Driver A attempting to access Driver B orders rejected with HTTP 403 Forbidden');

  // Test B.5: Delivering Order A1 and dynamic origin re-calculation
  const [pinRow] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${dbOrderA1.id}`;
  const pinA1 = decryptPin(pinRow.delivery_pin_encrypted);
  await pgDeliverDriverOrder(driverA.id, dbOrderA1.id, driverOpA, {
    collectionStatus: 'collected_cash',
    deliveryPin: pinA1,
  });

  // Call API again after delivery
  const reqAAfterDelivery = new Request(`http://localhost:3000/api/driver/orders?driverId=${driverA.id}`, {
    headers: {
      cookie: `${DRIVER_SESSION_COOKIE_NAME}=${tokenA}`,
    },
  });
  const apiResAfter = await getDriverOrdersRoute(reqAAfterDelivery);
  const dataAfter = await apiResAfter.json();

  assert(dataAfter.activeOrders.length === 2, 'B.5: Active orders reduced to 2');
  assert(dataAfter.historyOrders.length === 1, 'B.5: History orders has 1 delivered order');
  assert(dataAfter.deliveryQueue.queue.length === 2, 'B.5: deliveryQueue now has 2 orders');
  assert(dataAfter.deliveryQueue.originUsed.type === 'last_delivered', 'B.5: Origin dynamically updated to last_delivered 📍');
  assert(
    dataAfter.deliveryQueue.nextSuggestedOrder.order.id === dbOrderA3.id,
    'B.5: Next suggested order is now Order A3 ⭐ (closest to dropped off Order A1 location)'
  );

  // Test B.6: activeDeliveries and inFlightDeliveries remain accurate
  assert(dataAfter.driver.activeDeliveries === 2, 'B.6: Driver activeDeliveries=2');
  assert(dataAfter.driver.inFlightDeliveries === 2, 'B.6: Driver inFlightDeliveries=2');

  // Test B.7: Clean up active orders
  await pgCancelOrder(dbOrderA2.id, { reason: 'تنظيف الاختبار' });
  await pgCancelOrder(dbOrderA3.id, { reason: 'تنظيف الاختبار' });
  await pgCancelOrder(dbOrderB.id, { reason: 'تنظيف الاختبار' });

  console.log('\n===============================================================');
  console.log(`  PHASE DISPATCH-3 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

async function main() {
  try {
    await setup();
    await runDispatchPhase3Tests();
  } catch (err) {
    console.error('Test execution failed with exception:', err);
    process.exit(1);
  } finally {
    await teardown();
  }
}

main();
