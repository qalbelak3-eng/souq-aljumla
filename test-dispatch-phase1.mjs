import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';

const Ep = EpDefault.default || EpDefault;
const PORT = 54345;
const tempDir = path.join(os.tmpdir(), 'ep_test_dispatch_phase1_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'super-secret-admin-session-token-for-test-32chars';
process.env.DRIVER_SESSION_SECRET = 'super-secret-driver-session-token-for-test-32chars';
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

async function runDispatchPhase1Tests() {
  console.log('===============================================================');
  console.log('       PHASE DISPATCH-1: SMART DRIVER ASSIGNMENT TESTS         ');
  console.log('===============================================================\n');

  // Dynamic Imports
  const {
    rankDriversForOrder,
    isOrderCashCollection,
    HIGH_CUSTODY_THRESHOLD,
    HIGH_CUSTODY_WARNING,
  } = await import('./src/lib/dispatch-recommender.ts');

  const {
    pgCreateVehicle,
    pgUpdateVehicle,
    pgCreateDriver,
    pgGetDrivers,
    pgGetDriverById,
  } = await import('./src/lib/postgres-drivers.ts');

  const {
    pgCreateOrder,
    pgGetOrderById,
    pgCancelOrder,
  } = await import('./src/lib/postgres-orders.ts');

  const {
    pgAssignOrderDriver,
    pgStartDriverDelivery,
    pgDeliverDriverOrder,
  } = await import('./src/lib/postgres-delivery.ts');

  const { decryptPin } = await import('./src/lib/delivery-pin.ts');

  const {
    signAdminSession,
    signDriverSession,
    SESSION_COOKIE_NAME,
    DRIVER_SESSION_COOKIE_NAME,
  } = await import('./src/lib/auth.ts');

  const { PATCH: patchOrderRoute, GET: getOrderRoute } = await import(
    './src/app/api/orders/[id]/route.ts'
  );

  // =========================================================================
  // Section A: Pure Algorithm Tests (Unit Behavior)
  // =========================================================================
  console.log('--- Section A: Smart Recommendation Algorithm (Unit Rules) ---');

  // A.1: Exclusion of Inactive Drivers
  const mockDrivers = [
    { id: 'd-1', name: 'أحمد', isActive: true, activeDeliveries: 1, currentCashInHand: 0, defaultVehicleId: 'v1', isVehicleActive: true },
    { id: 'd-2', name: 'سامر', isActive: false, activeDeliveries: 0, currentCashInHand: 0, defaultVehicleId: 'v1', isVehicleActive: true },
  ];
  const rankedA1 = rankDriversForOrder(mockDrivers);
  assert(rankedA1.length === 1, 'Inactive driver is strictly excluded from ranking');
  assert(rankedA1[0].driver.id === 'd-1', 'Only active driver is returned');

  // A.2: Preference for Active Vehicle
  const mockVehicleDrivers = [
    { id: 'd-no-veh', name: 'سائق بدون سيارة', isActive: true, activeDeliveries: 0, currentCashInHand: 0, defaultVehicleId: undefined, isVehicleActive: false },
    { id: 'd-with-veh', name: 'سائق مع سيارة فعالة', isActive: true, activeDeliveries: 0, currentCashInHand: 0, defaultVehicleId: 'v-act', isVehicleActive: true },
  ];
  const rankedA2 = rankDriversForOrder(mockVehicleDrivers);
  assert(rankedA2[0].driver.id === 'd-with-veh', 'Driver with active vehicle preferred over driver without active vehicle');
  assert(rankedA2[0].isRecommended === true, 'Driver with active vehicle is recommended');

  // A.3: Inactive Vehicle Penalty
  const mockVehiclesList = [
    { id: 'v-active', name: 'سيارة فعالة', plateNumber: '111', isActive: true },
    { id: 'v-disabled', name: 'سيارة معطلة', plateNumber: '222', isActive: false },
  ];
  const mockDriverDisabledVeh = [
    { id: 'd-dis-veh', name: 'سائق سيارته معطلة', isActive: true, activeDeliveries: 0, currentCashInHand: 0, defaultVehicleId: 'v-disabled' },
    { id: 'd-act-veh', name: 'سائق سيارته شغالة', isActive: true, activeDeliveries: 0, currentCashInHand: 0, defaultVehicleId: 'v-active' },
  ];
  const rankedA3 = rankDriversForOrder(mockDriverDisabledVeh, null, mockVehiclesList);
  assert(rankedA3[0].driver.id === 'd-act-veh', 'Driver with active vehicle ranked ahead of driver with disabled vehicle');
  assert(rankedA3[0].hasActiveVehicle === true, 'Top driver marked hasActiveVehicle: true');
  assert(rankedA3[1].hasActiveVehicle === false, 'Driver with disabled vehicle marked hasActiveVehicle: false');

  // A.4: Ranking by Load (activeDeliveries: lower is better)
  const mockLoadDrivers = [
    { id: 'd-busy', name: 'سائق مشغول', isActive: true, activeDeliveries: 3, currentCashInHand: 0, isVehicleActive: true },
    { id: 'd-medium', name: 'سائق متوسط', isActive: true, activeDeliveries: 1, currentCashInHand: 0, isVehicleActive: true },
    { id: 'd-free', name: 'سائق متفرغ', isActive: true, activeDeliveries: 0, currentCashInHand: 0, isVehicleActive: true },
  ];
  const rankedA4 = rankDriversForOrder(mockLoadDrivers);
  assert(rankedA4[0].driver.id === 'd-free', 'Driver with 0 active orders ranked #1');
  assert(rankedA4[1].driver.id === 'd-medium', 'Driver with 1 active order ranked #2');
  assert(rankedA4[2].driver.id === 'd-busy', 'Driver with 3 active orders ranked #3');

  // A.5: Cash in Hand Tiebreaker for Cash Orders (COD)
  const mockCashTieDrivers = [
    { id: 'd-high-cash', name: 'سائق عهدة عالية', isActive: true, activeDeliveries: 1, currentCashInHand: 400000, isVehicleActive: true },
    { id: 'd-low-cash', name: 'سائق عهدة منخفضة', isActive: true, activeDeliveries: 1, currentCashInHand: 50000, isVehicleActive: true },
  ];
  const rankedA5 = rankDriversForOrder(mockCashTieDrivers, { paymentMethod: 'cod' });
  assert(rankedA5[0].driver.id === 'd-low-cash', 'On load tie, driver with lower cash in hand is ranked first for cash orders');
  assert(rankedA5[0].isRecommended === true, 'Lower cash driver is ⭐ recommended');

  // A.6: Non-Cash Order Rule: High cash does NOT penalize driver
  const mockNonCashDrivers = [
    { id: 'd-exp-cash', name: 'سائق خبير مع كاش', isActive: true, activeDeliveries: 1, currentCashInHand: 400000, completedDeliveries: 50, isVehicleActive: true },
    { id: 'd-novice-nocash', name: 'سائق مبتدئ بدون كاش', isActive: true, activeDeliveries: 1, currentCashInHand: 10000, completedDeliveries: 2, isVehicleActive: true },
  ];
  const rankedA6 = rankDriversForOrder(mockNonCashDrivers, { paymentMethod: 'zaincash' });
  assert(rankedA6[0].driver.id === 'd-exp-cash', 'For non-cash order (ZainCash), experienced driver is NOT penalized by high cash in hand');

  const rankedA6Debt = rankDriversForOrder(mockNonCashDrivers, { paymentMethod: 'debt' });
  assert(rankedA6Debt[0].driver.id === 'd-exp-cash', 'For debt order, experienced driver is NOT penalized by cash custody');

  // A.7: High Custody Warning Trigger (>= 500,000 IQD)
  const mockCustodyDrivers = [
    { id: 'd-under', name: 'سائق عهدة طبيعية', isActive: true, currentCashInHand: 499999, isVehicleActive: true },
    { id: 'd-over', name: 'سائق عهدة حرجة', isActive: true, currentCashInHand: 500000, isVehicleActive: true },
  ];
  const rankedA7 = rankDriversForOrder(mockCustodyDrivers);
  const underItem = rankedA7.find((r) => r.driver.id === 'd-under');
  const overItem = rankedA7.find((r) => r.driver.id === 'd-over');
  assert(underItem.isHighCustody === false, 'Under 500k IQD is NOT high custody');
  assert(overItem.isHighCustody === true, 'Exactly 500,000 IQD triggers isHighCustody: true');
  assert(HIGH_CUSTODY_THRESHOLD === 500000, 'HIGH_CUSTODY_THRESHOLD is exactly 500,000 IQD');
  assert(HIGH_CUSTODY_WARNING.includes('عهدة مرتفعة'), 'Warning text matches specification');

  // A.8: Deterministic Tiebreaker (Alphabetical Arabic Name / ID)
  const mockIdenticalDrivers = [
    { id: 'd-z', name: 'يوسف التاجر', isActive: true, activeDeliveries: 0, currentCashInHand: 0, isVehicleActive: true },
    { id: 'd-a', name: 'إبراهيم علي', isActive: true, activeDeliveries: 0, currentCashInHand: 0, isVehicleActive: true },
  ];
  const rankedA8Run1 = rankDriversForOrder(mockIdenticalDrivers);
  const rankedA8Run2 = rankDriversForOrder(mockIdenticalDrivers);
  assert(rankedA8Run1[0].driver.name === 'إبراهيم علي', 'Deterministic tiebreaker ranks "إبراهيم" before "يوسف"');
  assert(rankedA8Run1[0].driver.id === rankedA8Run2[0].driver.id, 'Output is completely deterministic across repeated executions');

  // =========================================================================
  // Section B: Database Integration & End-to-End Workflow Tests
  // =========================================================================
  console.log('\n--- Section B: Database Integration & PostgreSQL API Workflow ---');

  // Seed Reference Data
  const [cat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم الأغذية', 'food-cat')
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
      'زيت طعام نقي 1 لتر', ${cat.id},
      1, 1, 1,
      1000,
      'كيس', 'كرتون',
      25000, 25000, 20000, 20000
    ) RETURNING id;
  `;

  const [custAuth] = await sql`
    INSERT INTO auth_identities (phone, role, is_active)
    VALUES ('07709991122', 'customer', true)
    RETURNING id;
  `;

  const [custAcc] = await sql`
    INSERT INTO financial_accounts (
      auth_identity_id, account_code, category, name, phone,
      city, address, pricing_tier, is_active
    ) VALUES (
      ${custAuth.id}, 'CUST-DSP-01', 'customer', 'ماركت بغداد المركزي', '07709991122',
      'بغداد', 'حي المنصور', 'market', true
    ) RETURNING id;
  `;

  const adminAuthIdentity = {
    userId: 'a0000000-0000-0000-0000-000000000001',
    username: 'admin',
    name: 'مشرف التوزيع والإسناد',
    role: 'admin',
    permissions: ['orders', 'drivers', 'accounting'],
    exp: Math.floor(Date.now() / 1000) + 86400,
  };

  const adminCookie = `${SESSION_COOKIE_NAME}=${signAdminSession(adminAuthIdentity)}`;

  // B.1: Create Test Vehicles (One Active, One Inactive)
  console.log('\n--- B.1: Creating Vehicles in PostgreSQL ---');
  const vehActive = await pgCreateVehicle({
    name: 'تويوتا بيك آب هيلوكس',
    plateNumber: 'بغداد 10101',
    type: 'pickup',
    isActive: true,
  });
  assert(vehActive.isActive === true, 'Vehicle 1 created as active');

  const vehDisabled = await pgCreateVehicle({
    name: 'كيا فريزر معطلة',
    plateNumber: 'بغداد 90909',
    type: 'van',
    isActive: true,
  });

  // B.2: Create Drivers in PostgreSQL
  console.log('\n--- B.2: Creating 5 Drivers with Varied Attributes ---');

  // Driver 1: Active, linked to active vehicle, 0 active, 0 cash
  const driver1 = await pgCreateDriver({
    name: 'أحمد جاسم النجار',
    phone: '07708881111',
    password: 'password123',
    defaultVehicleId: vehActive.id,
    isActive: true,
  });
  assert(driver1.isActive === true, 'Driver 1 created active with active vehicle');

  // Driver 2: Active, linked to active vehicle, will receive orders (busy)
  const driver2 = await pgCreateDriver({
    name: 'عمر فاروق البغدادي',
    phone: '07708882222',
    password: 'password123',
    defaultVehicleId: vehActive.id,
    isActive: true,
  });

  // Driver 3: Active, linked to active vehicle, will accumulate high custody
  const driver3 = await pgCreateDriver({
    name: 'علي صباح الكرخي',
    phone: '07708883333',
    password: 'password123',
    defaultVehicleId: vehActive.id,
    isActive: true,
  });

  // Driver 4: Inactive driver
  const driver4 = await pgCreateDriver({
    name: 'مصطفى كمال التميمي',
    phone: '07708884444',
    password: 'password123',
    defaultVehicleId: vehActive.id,
    isActive: false,
  });
  assert(driver4.isActive === false, 'Driver 4 created as inactive');

  // Driver 5: Active driver, linked to vehicle 2
  const driver5 = await pgCreateDriver({
    name: 'حيدر حميد الربيعي',
    phone: '07708885555',
    password: 'password123',
    defaultVehicleId: vehDisabled.id,
    isActive: true,
  });
  assert(driver5.defaultVehicleId === vehDisabled.id, 'Driver 5 linked to vehicle 2');

  // Now deactivate Vehicle 2 to simulate vehicle becoming disabled/in maintenance
  const vehDisabledUpdated = await pgUpdateVehicle(vehDisabled.id, { isActive: false });
  assert(vehDisabledUpdated.isActive === false, 'Vehicle 2 deactivated after driver assignment (isActive: false)');

  // B.3: Set up loads and cash balances in PostgreSQL
  console.log('\n--- B.3: Setting Up Operational Loads & Custody in DB ---');
  const adminOp = {
    userId: adminAuthIdentity.id,
    username: adminAuthIdentity.username,
    role: adminAuthIdentity.role,
    name: adminAuthIdentity.name,
  };

  // Give Driver 2 two active orders
  const d2Order1 = await pgCreateOrder({
    customer: { name: 'زبون 1', phone: '07701111111', city: 'بغداد', address: 'المنصور', isGuest: false, userId: custAuth.id },
    items: [{ productId: prod.id, name: 'زيت طعام', price: 25000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });
  await pgAssignOrderDriver({ orderId: d2Order1.id, driverId: driver2.id, adminOperator: adminOp });

  const d2Order2 = await pgCreateOrder({
    customer: { name: 'زبون 2', phone: '07702222222', city: 'بغداد', address: 'الكرادة', isGuest: false, userId: custAuth.id },
    items: [{ productId: prod.id, name: 'زيت طعام', price: 25000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });
  await pgAssignOrderDriver({ orderId: d2Order2.id, driverId: driver2.id, adminOperator: adminOp });

  // Give Driver 3 a large delivered cash order to accumulate high cash custody (600,000 IQD >= 500,000)
  const d3OrderLarge = await pgCreateOrder({
    customer: { name: 'زبون جملة كبير', phone: '07703333333', city: 'بغداد', address: 'جميلة', isGuest: false, userId: custAuth.id },
    items: [{ productId: prod.id, name: 'زيت طعام', price: 600000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });
  await pgAssignOrderDriver({ orderId: d3OrderLarge.id, driverId: driver3.id, adminOperator: adminOp });
  await pgStartDriverDelivery(driver3.id, d3OrderLarge.id, { id: driver3.id, name: driver3.name, phone: driver3.phone });
  const [d3Row] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${d3OrderLarge.id}`;
  const d3Pin = decryptPin(d3Row.delivery_pin_encrypted);
  await pgDeliverDriverOrder(driver3.id, d3OrderLarge.id, { id: driver3.id, name: driver3.name, phone: driver3.phone }, {
    collectionStatus: 'collected_cash',
    deliveryPin: d3Pin,
  });

  const d3Stats = await pgGetDriverById(driver3.id);
  assert(d3Stats.currentCashInHand === 600000, 'Driver 3 has 600,000 IQD cash custody in PostgreSQL');
  assert(d3Stats.activeDeliveries === 0, 'Driver 3 has 0 active deliveries');

  const d2Stats = await pgGetDriverById(driver2.id);
  assert(d2Stats.activeDeliveries === 2, 'Driver 2 has 2 active deliveries in PostgreSQL');

  const d1Stats = await pgGetDriverById(driver1.id);
  assert(d1Stats.activeDeliveries === 0, 'Driver 1 has 0 active deliveries in PostgreSQL');
  assert(d1Stats.currentCashInHand === 0, 'Driver 1 has 0 cash in hand in PostgreSQL');

  // B.4: Recommendation Engine on Real PostgreSQL Drivers
  console.log('\n--- B.4: Smart Recommendation on Real DB Drivers ---');
  const allDriversFromDb = await pgGetDrivers();

  // Test for a cash order:
  const targetOrderCash = { paymentMethod: 'cod', total: 50000 };
  const rankedForCash = rankDriversForOrder(allDriversFromDb, targetOrderCash);

  // Inactive driver (Driver 4) must be excluded
  assert(!rankedForCash.some((r) => r.driver.id === driver4.id), 'Driver 4 (inactive) is NOT present in ranking');

  // Driver 1 vs Driver 3: both 0 active orders, but Driver 1 has 0 cash vs Driver 3 has 600,000 cash!
  assert(rankedForCash[0].driver.id === driver1.id, 'Driver 1 is top ranked for cash order (0 active orders, 0 cash custody)');
  assert(rankedForCash[0].isRecommended === true, 'Driver 1 is marked as ⭐ Recommended');

  // Driver 3 must have high custody warning
  const d3RankedItem = rankedForCash.find((r) => r.driver.id === driver3.id);
  assert(d3RankedItem.isHighCustody === true, 'Driver 3 is marked isHighCustody: true (600,000 IQD >= 500,000)');

  // Driver 5 (inactive vehicle) must be ranked after drivers with active vehicles
  const d5RankedItem = rankedForCash.find((r) => r.driver.id === driver5.id);
  assert(d5RankedItem.hasActiveVehicle === false, 'Driver 5 hasActiveVehicle is false');
  const d5Index = rankedForCash.findIndex((r) => r.driver.id === driver5.id);
  const d1Index = rankedForCash.findIndex((r) => r.driver.id === driver1.id);
  assert(d5Index > d1Index, 'Driver with inactive vehicle is ranked lower than drivers with active vehicles');

  // B.5: Non-Cash Order Smart Recommendation
  console.log('\n--- B.5: Smart Recommendation for Non-Cash Order ---');
  const targetOrderOnline = { paymentMethod: 'online', total: 50000 };
  const rankedForOnline = rankDriversForOrder(allDriversFromDb, targetOrderOnline);
  // Driver 3 (completed 1 delivery) vs Driver 1 (0 completed deliveries):
  // For online order, Driver 3 has completed 1 order and 0 active orders, so high cash does NOT penalize him!
  assert(rankedForOnline[0].driver.id === driver3.id, 'For online order, high cash does not demote Driver 3; experience leads recommendation');

  // =========================================================================
  // Section C: Verification of No Auto-Assignment & Manual Confirmation
  // =========================================================================
  console.log('\n--- Section C: Non-Auto Assignment & Manual Confirmation ---');
  const newOrder = await pgCreateOrder({
    customer: { name: 'متجر الأنوار', phone: '07704445555', city: 'بغداد', address: 'الدورة', isGuest: false, userId: custAuth.id },
    items: [{ productId: prod.id, name: 'زيت طعام', price: 25000, quantity: 2, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });

  // Verify No Auto-Assignment
  assert(newOrder.driverId === null || newOrder.driverId === undefined, 'Order created with driverId: null (NO auto-assignment)');
  assert(newOrder.status === 'pending', 'Initial order status is pending');

  // C.1: Manual Assignment of Recommended Driver (Driver 1)
  console.log('\n--- C.1: Manual Assignment of Recommended Driver ---');
  const assignD1Req = new Request(`http://localhost:3000/api/orders/${newOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ driverId: driver1.id }),
  });
  const assignD1Res = await patchOrderRoute(assignD1Req, { params: { id: newOrder.id } });
  const assignD1Data = await assignD1Res.json();
  console.log('assignD1Data:', assignD1Res.status, assignD1Data);
  assert(assignD1Res.status === 200 && assignD1Data.success === true, 'Admin successfully assigned recommended Driver 1 (HTTP 200)');
  assert(assignD1Data.order.driverId === driver1.id, 'Order driverId matches Driver 1');
  assert(assignD1Data.order.vehicleId === vehActive.id, 'Order assigned with Driver 1 default active vehicle');
  assert(assignD1Data.order.status === 'processing', 'Order status moved from pending to processing');

  // C.2: Manual Assignment of Non-Recommended Driver (Supervisor Choice - Driver 3 with High Custody)
  console.log('\n--- C.2: Manual Assignment of High Custody Driver (Allowed by Policy) ---');
  const newOrder2 = await pgCreateOrder({
    customer: { name: 'متجر الوفاء', phone: '07705556666', city: 'بغداد', address: 'حي العامل', isGuest: false, userId: custAuth.id },
    items: [{ productId: prod.id, name: 'زيت طعام', price: 25000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });

  const assignD3Req = new Request(`http://localhost:3000/api/orders/${newOrder2.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ driverId: driver3.id }),
  });
  const assignD3Res = await patchOrderRoute(assignD3Req, { params: { id: newOrder2.id } });
  const assignD3Data = await assignD3Res.json();
  assert(assignD3Res.status === 200 && assignD3Data.success === true, 'Supervisor can assign Driver 3 despite high custody warning (Warning is non-blocking)');
  assert(assignD3Data.order.driverId === driver3.id, 'Order assigned to Driver 3');

  // =========================================================================
  // Section D: Preservation of Security Rules & Error Handling
  // =========================================================================
  console.log('\n--- Section D: Preserving pgAssignOrderDriver Rules & Error Handling ---');

  // D.1: Inactive Vehicle Rejection
  const newOrder3 = await pgCreateOrder({
    customer: { name: 'متجر النصر', phone: '07706667777', city: 'بغداد', address: 'الشعب', isGuest: false, userId: custAuth.id },
    items: [{ productId: prod.id, name: 'زيت طعام', price: 25000, quantity: 1, saleType: 'wholesale', unitLabel: 'كرتون', image: '' }],
    paymentMethod: 'cod',
    accountId: custAcc.id,
  });

  const assignD5Req = new Request(`http://localhost:3000/api/orders/${newOrder3.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ driverId: driver5.id }),
  });
  const assignD5Res = await patchOrderRoute(assignD5Req, { params: { id: newOrder3.id } });
  const assignD5Data = await assignD5Res.json();
  assert(assignD5Res.status === 400, 'Assigning driver with inactive default vehicle rejected with HTTP 400');
  assert(assignD5Data.error.includes('المركبة المحددة معطلة'), 'Error states vehicle is disabled');

  // D.2: Inactive Driver Rejection
  const assignD4Req = new Request(`http://localhost:3000/api/orders/${newOrder3.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ driverId: driver4.id }),
  });
  const assignD4Res = await patchOrderRoute(assignD4Req, { params: { id: newOrder3.id } });
  const assignD4Data = await assignD4Res.json();
  assert(assignD4Res.status === 400, 'Assigning inactive driver rejected with HTTP 400');
  assert(assignD4Data.error.includes('معطل'), 'Error states driver account is disabled');

  // D.3: Reassignment Protection on Shipped Orders
  console.log('\n--- D.3: Reassignment Blocked when Order is Shipped ---');
  // Order 1 is assigned to Driver 1. Start delivery:
  await pgStartDriverDelivery(driver1.id, newOrder.id, { id: driver1.id, name: driver1.name, phone: driver1.phone });
  const [shippedOrder] = await sql`SELECT status, driver_id FROM orders WHERE id = ${newOrder.id}`;
  assert(shippedOrder.status === 'shipped', 'Order transitioned to shipped status');

  // Try to reassign shipped order to Driver 2 -> MUST be rejected
  const reassignReq = new Request(`http://localhost:3000/api/orders/${newOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ driverId: driver2.id }),
  });
  const reassignRes = await patchOrderRoute(reassignReq, { params: { id: newOrder.id } });
  const reassignData = await reassignRes.json();
  assert(reassignRes.status === 400, 'Reassignment of shipped order rejected with HTTP 400');
  assert(reassignData.error.includes('خرجت للتوصيل بالفعل'), 'Explicit error message returned to supervisor');

  // D.4: Terminal State Protection (Delivered Order Cannot be Reassigned)
  console.log('\n--- D.4: Delivered Order Terminal State Protection ---');
  const [pinRow1] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${newOrder.id}`;
  const pin1 = decryptPin(pinRow1.delivery_pin_encrypted);
  await pgDeliverDriverOrder(driver1.id, newOrder.id, { id: driver1.id, name: driver1.name, phone: driver1.phone }, {
    collectionStatus: 'collected_cash',
    deliveryPin: pin1,
  });

  const reassignDeliveredReq = new Request(`http://localhost:3000/api/orders/${newOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ driverId: driver2.id }),
  });
  const reassignDeliveredRes = await patchOrderRoute(reassignDeliveredReq, { params: { id: newOrder.id } });
  const reassignDeliveredData = await reassignDeliveredRes.json();
  assert(reassignDeliveredRes.status === 400, 'Reassigning delivered order rejected with HTTP 400');
  assert(reassignDeliveredData.error.includes('تسليمها بالفعل'), 'Terminal state delivered error returned');

  // D.5: Terminal State Protection (Cancelled Order Cannot be Assigned)
  console.log('\n--- D.5: Cancelled Order Terminal State Protection ---');
  await pgCancelOrder(newOrder3.id, { reason: 'إلغاء لاختبار الإسناد', operator: adminOp });
  const assignCancelledReq = new Request(`http://localhost:3000/api/orders/${newOrder3.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ driverId: driver1.id }),
  });
  const assignCancelledRes = await patchOrderRoute(assignCancelledReq, { params: { id: newOrder3.id } });
  const assignCancelledData = await assignCancelledRes.json();
  assert(assignCancelledRes.status === 400, 'Assigning cancelled order rejected with HTTP 400');
  assert(assignCancelledData.error.includes('ملغاة أو راجعة'), 'Terminal state cancelled error returned');

  // D.6: Accounting & Financial Ledger Integrity
  console.log('\n--- D.6: Accounting & Financial Ledger Integrity ---');
  const [voucherCount] = await sql`SELECT count(*) FROM vouchers WHERE account_id = ${custAcc.id}`;
  assert(parseInt(voucherCount.count, 10) === 0, 'No customer vouchers created during driver dispatch/assignment');

  const [settlementCount] = await sql`SELECT count(*) FROM driver_settlements`;
  assert(parseInt(settlementCount.count, 10) === 0, 'No driver settlements created during driver dispatch/assignment');

  console.log('\n===============================================================');
  console.log(`ALL DISPATCH-1 TESTS PASSED: ${passed} assertions passed, ${failed} failed.`);
  console.log('===============================================================\n');
}

async function main() {
  try {
    await setup();
    await runDispatchPhase1Tests();
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    if (sql) await sql.end({ timeout: 5 });
    if (ep) await ep.stop();
  }
}

main();
