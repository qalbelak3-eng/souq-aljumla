import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';

const Ep = EpDefault.default || EpDefault;
const PORT = 54341;
const tempDir = path.join(os.tmpdir(), 'ep_test_delivery_pin_' + Date.now());
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

async function runDeliveryPinTests() {
  console.log('===============================================================');
  console.log('       SECURE CUSTOMER DELIVERY PIN & PROOF OF DELIVERY        ');
  console.log('===============================================================\n');

  // Dynamic Imports
  const {
    pgCreateDriver,
    pgUpdateDriver,
    pgGetDriverById,
  } = await import('./src/lib/postgres-drivers.ts');

  const {
    pgCreateOrder,
    pgGetOrderById,
  } = await import('./src/lib/postgres-orders.ts');

  const {
    pgAssignOrderDriver,
    pgStartDriverDelivery,
    pgDeliverDriverOrder,
    pgAdminOverrideDelivery,
  } = await import('./src/lib/postgres-delivery.ts');

  const {
    decryptPin,
    encryptPin,
    hashPin,
    verifyPin,
    generateOrderPinData,
  } = await import('./src/lib/delivery-pin.ts');

  const {
    signAdminSession,
    signDriverSession,
    signCustomerSession,
    signOrderAccessToken,
    SESSION_COOKIE_NAME,
    DRIVER_SESSION_COOKIE_NAME,
    CUSTOMER_SESSION_COOKIE_NAME,
  } = await import('./src/lib/auth.ts');

  const { GET: getDriverOrders, POST: postDriverOrders } = await import(
    './src/app/api/driver/orders/route.ts'
  );

  const { GET: getOrderRoute, PATCH: patchOrderRoute } = await import(
    './src/app/api/orders/[id]/route.ts'
  );

  // --- Seed Reference Data ---
  console.log('--- Step 0: Seeding Reference Catalog & Accounts ---');
  const [cat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('مواد غذائية أساسية', 'basic-food')
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
      'أرز بسمتي فاخر 10 كغم', ${cat.id},
      1, 1, 1,
      100,
      'كيس', 'كيس',
      30000.00, 30000.00, 24000.0000, 24000.00
    ) RETURNING id;
  `;

  const [custAccountA] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier, is_active
    ) VALUES (
      'ACC-CUST-101', 'سوبرماركت الرشيد', '07701112222', 'customer', 'market', true
    ) RETURNING id;
  `;

  const [custAccountB] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier, is_active
    ) VALUES (
      'ACC-CUST-102', 'سوبرماركت دجلة', '07703334444', 'customer', 'market', true
    ) RETURNING id;
  `;

  // Create Drivers
  const driverA = await pgCreateDriver({
    name: 'حيدر الكرخي',
    phone: '07709990011',
    password: 'Password123!',
    nationalId: '199011122233',
  });

  const driverB = await pgCreateDriver({
    name: 'سامر الرصافي',
    phone: '07709990022',
    password: 'Password123!',
    nationalId: '199122233344',
  });

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

  const [adminAuthIdentity] = await sql`
    INSERT INTO auth_identities (phone, role, is_active)
    VALUES ('07700000000', 'admin', true)
    RETURNING id;
  `;

  const adminToken = signAdminSession({
    userId: adminAuthIdentity.id,
    username: 'ops_admin',
    name: 'مدير العمليات والتوصيل',
    role: 'admin',
    permissions: ['orders', 'drivers'],
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const adminCookie = `${SESSION_COOKIE_NAME}=${adminToken}`;

  const adminNoPermToken = signAdminSession({
    userId: 'admin-2',
    username: 'readonly_admin',
    name: 'مشاهد فقط',
    role: 'staff',
    permissions: ['analytics'],
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const adminNoPermCookie = `${SESSION_COOKIE_NAME}=${adminNoPermToken}`;

  const { ensureDbExists } = await import('./src/lib/db.ts');
  const memDb = ensureDbExists();
  if (!memDb.users) memDb.users = [];
  memDb.users.push(
    {
      id: custAccountA.id,
      name: 'سوبرماركت الرشيد',
      phone: '07701112222',
      role: 'customer',
      isActive: true,
    },
    {
      id: custAccountB.id,
      name: 'سوبرماركت دجلة',
      phone: '07703334444',
      role: 'customer',
      isActive: true,
    }
  );

  if (!memDb.staff) memDb.staff = [];
  memDb.staff.push(
    {
      id: adminAuthIdentity.id,
      username: 'ops_admin',
      name: 'مدير العمليات والتوصيل',
      role: 'staff',
      permissions: ['orders', 'drivers'],
      isActive: true,
    },
    {
      id: 'admin-2',
      username: 'readonly_admin',
      name: 'مشاهد فقط',
      role: 'staff',
      permissions: ['analytics'],
      isActive: true,
    }
  );

  const adminOperator = {
    userId: adminAuthIdentity.id,
    username: 'ops_admin',
    role: 'admin',
    name: 'مدير العمليات والتوصيل',
  };

  const custAToken = signCustomerSession({
    userId: custAccountA.id,
    phone: '07701112222',
    name: 'سوبرماركت الرشيد',
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const custACookie = `${CUSTOMER_SESSION_COOKIE_NAME}=${custAToken}`;

  const custBToken = signCustomerSession({
    userId: custAccountB.id,
    phone: '07703334444',
    name: 'سوبرماركت دجلة',
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const custBCookie = `${CUSTOMER_SESSION_COOKIE_NAME}=${custBToken}`;


  const driverOpA = { id: driverA.id, name: driverA.name, phone: driverA.phone };

  // =========================================================================
  // Test 1: Random 4-digit PIN generated on order creation
  // =========================================================================
  console.log('\n--- Test 1: Random 4-digit PIN generated on order creation ---');
  const order1 = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت الرشيد',
      phone: '07701112222',
      city: 'بغداد',
      address: 'شارع الرشيد',
      isGuest: false,
      userId: custAccountA.id,
    },
    items: [
      {
        productId: prod.id,
        name: 'أرز بسمتي فاخر 10 كغم',
        price: 30000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كيس',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccountA.id,
  });

  const [order1Db] = await sql`SELECT delivery_pin_hash, delivery_pin_encrypted, delivery_pin_attempts FROM orders WHERE id = ${order1.id}`;
  assert(order1Db.delivery_pin_encrypted !== null, 'delivery_pin_encrypted generated and present in DB');
  assert(order1Db.delivery_pin_hash !== null, 'delivery_pin_hash generated and present in DB');
  assert(order1Db.delivery_pin_attempts === 0, 'delivery_pin_attempts initialized to 0');

  const order1Pin = decryptPin(order1Db.delivery_pin_encrypted);
  assert(/^\d{4}$/.test(order1Pin), `Decrypted PIN is a 4-digit numeric string: ${order1Pin}`);

  // Customer A views own order before delivery -> receives PIN
  const custAViewBeforeReq = new Request(`http://localhost:3000/api/orders/${order1.id}`, {
    headers: { Cookie: custACookie },
  });
  const custAViewBeforeRes = await getOrderRoute(custAViewBeforeReq, { params: { id: order1.id } });
  const custABeforeData = await custAViewBeforeRes.json();
  assert(custABeforeData.order.deliveryPin === order1Pin, 'Customer A receives deliveryPin before delivery');

  // Admin views order before delivery -> does NOT receive PIN (Admin isolation)
  const adminViewBeforeReq = new Request(`http://localhost:3000/api/orders/${order1.id}`, {
    headers: { Cookie: adminCookie },
  });
  const adminViewBeforeRes = await getOrderRoute(adminViewBeforeReq, { params: { id: order1.id } });
  const adminBeforeData = await adminViewBeforeRes.json();
  assert(adminBeforeData.order.deliveryPin === undefined, 'Admin NEVER receives deliveryPin (before delivery)');

  // Second order must have different encrypted ciphertext and distinct PIN
  const order2 = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت دجلة',
      phone: '07703334444',
      city: 'بغداد',
      address: 'الكرادة',
      isGuest: false,
      userId: custAccountB.id,
    },
    items: [
      {
        productId: prod.id,
        name: 'أرز بسمتي فاخر 10 كغم',
        price: 30000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كيس',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccountB.id,
  });

  const [order2Db] = await sql`SELECT delivery_pin_encrypted, delivery_pin_hash FROM orders WHERE id = ${order2.id}`;
  assert(order1Db.delivery_pin_encrypted !== order2Db.delivery_pin_encrypted, 'Different orders receive distinct AES-256-GCM ciphertexts');
  const order2Pin = decryptPin(order2Db.delivery_pin_encrypted);
  assert(/^\d{4}$/.test(order2Pin), `Order 2 decrypted PIN is 4 digits: ${order2Pin}`);

  // =========================================================================
  // Test 2: Raw PIN NOT in PostgreSQL (AES-256-GCM authenticated ciphertext + scrypt hash only)
  // =========================================================================
  console.log('\n--- Test 2: Raw PIN NOT in DB (AES-256-GCM ciphertext + scrypt hash only) ---');
  assert(order1Db.delivery_pin_hash.includes(':'), 'delivery_pin_hash contains salt:hash scrypt format');
  assert(order1Db.delivery_pin_hash.length >= 60, 'delivery_pin_hash is strong cryptographic scrypt output');
  assert(order1Db.delivery_pin_hash !== order1Pin, 'DB does NOT contain raw PIN in hash column');
  assert(order1Db.delivery_pin_encrypted !== order1Pin, 'delivery_pin_encrypted is NOT raw PIN');

  // Verify AES-256-GCM format iv:authTag:ciphertext
  const gcmParts = order1Db.delivery_pin_encrypted.split(':');
  assert(gcmParts.length === 3, 'delivery_pin_encrypted follows iv:authTag:ciphertext format');
  assert(gcmParts[0].length >= 16, 'AES-GCM IV is present and encoded');
  assert(gcmParts[1].length >= 20, 'AES-GCM Auth Tag is present and encoded');
  assert(gcmParts[2].length >= 4, 'AES-GCM Ciphertext is present and encoded');

  // Authenticated encryption tampering protection: tampered tag or ciphertext fails decryption
  const tamperedTag = `${gcmParts[0]}:corruptedTag==:${gcmParts[2]}`;
  assert(decryptPin(tamperedTag) === null, 'Tampered Auth Tag causes decryptPin to fail-closed and return null');
  const tamperedCipher = `${gcmParts[0]}:${gcmParts[1]}:corruptedCiphertext==`;
  assert(decryptPin(tamperedCipher) === null, 'Tampered Ciphertext causes decryptPin to fail-closed and return null');

  assert(verifyPin(order1Pin, order1Db.delivery_pin_hash), 'verifyPin validates correct PIN against stored scrypt hash');

  // Verify that raw 'delivery_pin' column does NOT exist in orders table
  const colCheck = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_pin'
  `;
  assert(colCheck.length === 0, 'No plaintext "delivery_pin" column exists in database schema');

  // Verify that legacy 'delivery_pin_seed' column was dropped by migration 0008
  const seedColCheck = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_pin_seed'
  `;
  assert(seedColCheck.length === 0, 'Legacy "delivery_pin_seed" column was dropped from orders table');

  // Dump order row from database and ensure raw PIN is nowhere in the row
  const [order1FullDump] = await sql`SELECT * FROM orders WHERE id = ${order1.id}`;
  const dumpedValues = Object.entries(order1FullDump);
  for (const [col, val] of dumpedValues) {
    if (typeof val === 'string') {
      assert(val !== order1Pin, `Column ${col} does NOT equal plaintext PIN`);
    }
  }

  // =========================================================================
  // Test 3: Successful delivery with correct PIN by assigned driver in 'shipped' state
  // =========================================================================
  console.log('\n--- Test 3: Successful delivery with correct PIN in shipped state ---');
  await pgAssignOrderDriver({
    orderId: order1.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, order1.id, driverOpA);

  const deliverReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      orderId: order1.id,
      collectionStatus: 'collected_cash',
      deliveryPin: order1Pin,
      notes: 'تم التسليم بنجاح مع الزبون',
    }),
  });

  const deliverRes = await postDriverOrders(deliverReq);
  const deliverData = await deliverRes.json();
  assert(deliverRes.status === 200 && deliverData.success === true, 'Driver delivers order with valid PIN (HTTP 200)');
  assert(deliverData.order.status === 'delivered', 'Order status transitioned to delivered');

  const [order1AfterDeliver] = await sql`
    SELECT status, delivery_proof_method, delivery_verified_at, delivery_pin_attempts
    FROM orders WHERE id = ${order1.id}
  `;
  assert(order1AfterDeliver.status === 'delivered', 'Database order status is delivered');
  assert(order1AfterDeliver.delivery_proof_method === 'customer_pin', 'delivery_proof_method is recorded as "customer_pin"');
  assert(order1AfterDeliver.delivery_verified_at !== null, 'delivery_verified_at timestamp is set');
  assert(order1AfterDeliver.delivery_pin_attempts === 0, 'delivery_pin_attempts remains 0 on success');

  const [auditDelivery] = await sql`
    SELECT action_type, details FROM audit_logs
    WHERE target_id = ${order1.id} AND action_type = 'delivery_completed'
  `;
  assert(auditDelivery !== undefined, 'delivery_completed audit log recorded');
  assert(auditDelivery.details.includes('PIN'), 'Audit log explicitly notes customer PIN verification');

  // Verify post-delivery secret erasure in database
  const [order1SecDb] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${order1.id}`;
  assert(order1SecDb.delivery_pin_encrypted === null, 'delivery_pin_encrypted is erased (NULL) in DB immediately upon delivery');

  // Customer A views delivered order: deliveryPin is absent, proof metadata is present
  const custAAfterReq = new Request(`http://localhost:3000/api/orders/${order1.id}`, {
    headers: { Cookie: custACookie },
  });
  const custAAfterRes = await getOrderRoute(custAAfterReq, { params: { id: order1.id } });
  const custAAfterData = await custAAfterRes.json();
  assert(custAAfterData.order.deliveryPin === undefined, 'Customer API NO LONGER returns deliveryPin after order is delivered');
  assert(custAAfterData.order.deliveryProofMethod === 'customer_pin', 'Customer API returns deliveryProofMethod as customer_pin');
  assert(custAAfterData.order.deliveryVerifiedAt !== null, 'Customer API returns deliveryVerifiedAt timestamp');

  // Admin views delivered order: deliveryPin is absent, proof metadata is present
  const adminAfterReq = new Request(`http://localhost:3000/api/orders/${order1.id}`, {
    headers: { Cookie: adminCookie },
  });
  const adminAfterRes = await getOrderRoute(adminAfterReq, { params: { id: order1.id } });
  const adminAfterData = await adminAfterRes.json();
  assert(adminAfterData.order.deliveryPin === undefined, 'Admin API NEVER returns deliveryPin on delivered order');
  assert(adminAfterData.order.deliveryProofMethod === 'customer_pin', 'Admin API returns deliveryProofMethod');
  assert(adminAfterData.order.deliveryVerifiedAt !== null, 'Admin API returns deliveryVerifiedAt');

  // =========================================================================
  // Test 4: Incorrect PIN rejected, order remains shipped, attempt count incremented
  // =========================================================================
  console.log('\n--- Test 4: Incorrect PIN rejected, order remains shipped ---');
  await pgAssignOrderDriver({
    orderId: order2.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, order2.id, driverOpA);

  const wrongPinReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      orderId: order2.id,
      collectionStatus: 'collected_cash',
      deliveryPin: '9999' === order2Pin ? '0000' : '9999', // guaranteed wrong
    }),
  });
  const wrongPinRes = await postDriverOrders(wrongPinReq);
  const wrongPinData = await wrongPinRes.json();
  assert(wrongPinRes.status === 400, 'Incorrect PIN rejected with HTTP 400 Bad Request');
  assert(wrongPinData.success === false, 'Response success is false');
  assert(wrongPinData.error.includes('غير صحيح') || wrongPinData.error.includes('PIN'), 'Descriptive error message returned');

  const [order2AfterWrong] = await sql`
    SELECT status, delivery_pin_attempts FROM orders WHERE id = ${order2.id}
  `;
  assert(order2AfterWrong.status === 'shipped', 'Order remains in shipped status (NOT delivered)');
  assert(order2AfterWrong.delivery_pin_attempts === 1, 'delivery_pin_attempts incremented to 1');

  const [wrongAudit] = await sql`
    SELECT action_type, severity FROM audit_logs
    WHERE target_id = ${order2.id} AND action_type = 'delivery_pin_failed'
  `;
  assert(wrongAudit !== undefined, 'delivery_pin_failed audit log recorded');

  // =========================================================================
  // Test 5: Wrong driver rejected with HTTP 403
  // =========================================================================
  console.log('\n--- Test 5: Wrong driver rejected with HTTP 403 ---');
  const wrongDriverReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverBCookie },
    body: JSON.stringify({
      orderId: order2.id,
      collectionStatus: 'collected_cash',
      deliveryPin: order2Pin,
    }),
  });
  const wrongDriverRes = await postDriverOrders(wrongDriverReq);
  assert(wrongDriverRes.status === 403, 'Driver B attempting to deliver Driver A order rejected with HTTP 403');

  // =========================================================================
  // Test 6: Order-scoped PIN (PIN from Order 1 cannot deliver Order 2)
  // =========================================================================
  console.log('\n--- Test 6: Order-scoped PIN ---');
  const wrongOrderPinReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      orderId: order2.id,
      collectionStatus: 'collected_cash',
      deliveryPin: order1Pin, // Using Order 1's PIN on Order 2
    }),
  });
  const wrongOrderPinRes = await postDriverOrders(wrongOrderPinReq);
  assert(wrongOrderPinRes.status === 400, 'Cross-order PIN rejected with HTTP 400 Bad Request');
  const [order2AfterCross] = await sql`SELECT delivery_pin_attempts FROM orders WHERE id = ${order2.id}`;
  assert(order2AfterCross.delivery_pin_attempts === 2, 'Attempt counter incremented to 2');

  // =========================================================================
  // Test 7: Driver API (/api/driver/orders) NEVER leaks PIN or seed or hash
  // =========================================================================
  console.log('\n--- Test 7: Driver API never leaks PIN ---');
  const driverGetReq = new Request('http://localhost:3000/api/driver/orders', {
    headers: { Cookie: driverACookie },
  });
  const driverGetRes = await getDriverOrders(driverGetReq);
  const driverGetData = await driverGetRes.json();
  const allDriverOrders = [...(driverGetData.activeOrders || []), ...(driverGetData.historyOrders || [])];
  for (const ord of allDriverOrders) {
    assert(ord.deliveryPin === undefined, 'Order in driver view does not leak deliveryPin');
    assert(ord.deliveryPinHash === undefined, 'Order in driver view does not leak deliveryPinHash');
    assert(ord.deliveryPinSeed === undefined, 'Order in driver view does not leak deliveryPinSeed');
    assert(ord.deliveryPinEncrypted === undefined, 'Order in driver view does not leak deliveryPinEncrypted');
  }

  const rawDriverJson = JSON.stringify(driverGetData);
  assert(!rawDriverJson.includes('"deliveryPin"'), 'Driver GET JSON does NOT contain "deliveryPin" key');
  assert(!rawDriverJson.includes('"deliveryPinHash"'), 'Driver GET JSON does NOT contain "deliveryPinHash" key');
  assert(!rawDriverJson.includes('"deliveryPinSeed"'), 'Driver GET JSON does NOT contain "deliveryPinSeed" key');
  assert(!rawDriverJson.includes('"deliveryPinEncrypted"'), 'Driver GET JSON does NOT contain "deliveryPinEncrypted" key');

  // =========================================================================
  // Test 8: Customer A cannot see Customer B PIN (HTTP 403)
  // =========================================================================
  console.log('\n--- Test 8: Customer isolation (Customer A cannot see Customer B PIN) ---');
  // Customer B tries to view Customer A's order (order1)
  const custBViewOrder1Req = new Request(`http://localhost:3000/api/orders/${order1.id}`, {
    headers: { Cookie: custBCookie },
  });
  const custBViewOrder1Res = await getOrderRoute(custBViewOrder1Req, { params: { id: order1.id } });
  assert(custBViewOrder1Res.status === 403, 'Customer B accessing Customer A order is blocked with HTTP 403 Forbidden');

  // Customer A tries to view Customer B's active order (order2)
  const custAViewOrder2Req = new Request(`http://localhost:3000/api/orders/${order2.id}`, {
    headers: { Cookie: custACookie },
  });
  const custAViewOrder2Res = await getOrderRoute(custAViewOrder2Req, { params: { id: order2.id } });
  assert(custAViewOrder2Res.status === 403, 'Customer A accessing Customer B order is blocked with HTTP 403 Forbidden');

  // Customer B views their own active order (order2) before delivery -> receives deliveryPin
  const custBViewOrder2Req = new Request(`http://localhost:3000/api/orders/${order2.id}`, {
    headers: { Cookie: custBCookie },
  });
  const custBViewOrder2Res = await getOrderRoute(custBViewOrder2Req, { params: { id: order2.id } });
  const custBData = await custBViewOrder2Res.json();
  assert(custBViewOrder2Res.status === 200, 'Customer B views their own active order (HTTP 200)');
  assert(custBData.order.deliveryPin === order2Pin, 'Customer B receives their valid delivery PIN before delivery');

  // =========================================================================
  // Test 9: Guest order access token allows viewing PIN; unauthorized blocked
  // =========================================================================
  console.log('\n--- Test 9: Guest order access token allows viewing PIN ---');
  const guestOrder = await pgCreateOrder({
    customer: {
      name: 'زبون ضيف',
      phone: '07705556677',
      city: 'بغداد',
      address: 'حي الجامعة',
      isGuest: true,
    },
    items: [
      {
        productId: prod.id,
        name: 'أرز بسمتي فاخر 10 كغم',
        price: 30000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كيس',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    createAccountIfMissing: true,
  });

  const [guestDb] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${guestOrder.id}`;
  const guestPin = decryptPin(guestDb.delivery_pin_encrypted);

  // Unauthorized access (no token, no customer cookie) -> 401/403
  const noTokenReq = new Request(`http://localhost:3000/api/orders/${guestOrder.id}`);
  const noTokenRes = await getOrderRoute(noTokenReq, { params: { id: guestOrder.id } });
  assert(noTokenRes.status === 401 || noTokenRes.status === 403, 'Unauthenticated guest access without token rejected (HTTP 401/403)');

  // Invalid token -> 401/403
  const badTokenReq = new Request(`http://localhost:3000/api/orders/${guestOrder.id}?token=invalid.tampered.token`);
  const badTokenRes = await getOrderRoute(badTokenReq, { params: { id: guestOrder.id } });
  assert(badTokenRes.status === 401 || badTokenRes.status === 403, 'Tampered guest token rejected');

  // Valid token signed with order access token -> 200 + deliveryPin
  const validGuestToken = signOrderAccessToken({
    orderId: guestOrder.id,
    orderNumber: guestOrder.orderNumber,
    phone: '07705556677',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  const guestReq = new Request(`http://localhost:3000/api/orders/${guestOrder.id}?token=${validGuestToken}`);
  const guestRes = await getOrderRoute(guestReq, { params: { id: guestOrder.id } });
  const guestData = await guestRes.json();
  assert(guestRes.status === 200, 'Valid guest token grants access (HTTP 200)');
  assert(guestData.order.deliveryPin === guestPin, 'Guest order view includes correct deliveryPin');

  // =========================================================================
  // Test 10: Brute-force protection: 5 failed attempts lock PIN verification
  // =========================================================================
  console.log('\n--- Test 10: Brute-force protection (5 failed attempts lock order) ---');
  // Order 2 already has 2 failed attempts. Send 3 more wrong PINs.
  for (let attempt = 3; attempt <= 5; attempt++) {
    const wrongReq = new Request('http://localhost:3000/api/driver/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
      body: JSON.stringify({
        orderId: order2.id,
        collectionStatus: 'collected_cash',
        deliveryPin: `999${attempt}`,
      }),
    });
    const res = await postDriverOrders(wrongReq);
    if (attempt < 5) {
      assert(res.status === 400, `Attempt ${attempt}/5 rejected with 400`);
    } else {
      assert(res.status === 423 || res.status === 400, '5th failed attempt locks verification (HTTP 423 / error)');
      const data = await res.json();
      assert(data.error.includes('قفل'), 'Error message states verification is locked');
    }
  }

  const [order2Locked] = await sql`
    SELECT delivery_pin_attempts, delivery_pin_locked_until FROM orders WHERE id = ${order2.id}
  `;
  assert(order2Locked.delivery_pin_attempts >= 5, 'delivery_pin_attempts is at least 5');
  assert(order2Locked.delivery_pin_locked_until !== null, 'delivery_pin_locked_until is set in database');

  // Submitting correct PIN now MUST still be rejected because order is locked!
  const tryCorrectOnLocked = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      orderId: order2.id,
      collectionStatus: 'collected_cash',
      deliveryPin: order2Pin,
    }),
  });
  const lockedRes = await postDriverOrders(tryCorrectOnLocked);
  assert(lockedRes.status === 423 || lockedRes.status === 400, 'Submitting correct PIN on locked order is rejected');

  // =========================================================================
  // Test 11: Concurrency: race condition cannot deliver twice or duplicate custody
  // =========================================================================
  console.log('\n--- Test 11: Concurrency (race condition protection) ---');
  const orderRace = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت الرشيد',
      phone: '07701112222',
      city: 'بغداد',
      address: 'شارع الرشيد',
      isGuest: false,
      userId: custAccountA.id,
    },
    items: [
      {
        productId: prod.id,
        name: 'أرز بسمتي فاخر 10 كغم',
        price: 30000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كيس',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccountA.id,
  });

  await pgAssignOrderDriver({
    orderId: orderRace.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, orderRace.id, driverOpA);

  const [raceDb] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${orderRace.id}`;
  const racePin = decryptPin(raceDb.delivery_pin_encrypted);

  const driverStatsBefore = await pgGetDriverById(driverA.id);
  const cashBefore = driverStatsBefore.currentCashInHand;

  // Fire 2 concurrent deliveries with valid PIN
  const [race1, race2] = await Promise.all([
    pgDeliverDriverOrder(driverA.id, orderRace.id, driverOpA, {
      collectionStatus: 'collected_cash',
      deliveryPin: racePin,
    }),
    pgDeliverDriverOrder(driverA.id, orderRace.id, driverOpA, {
      collectionStatus: 'collected_cash',
      deliveryPin: racePin,
    }),
  ]);

  assert(race1.status === 'delivered' && race2.status === 'delivered', 'Both concurrent operations resolved with delivered status');

  const driverStatsAfter = await pgGetDriverById(driverA.id);
  assert(
    driverStatsAfter.currentCashInHand === cashBefore + 30000,
    `Cash in hand increased by exactly 30,000 (from ${cashBefore} to ${driverStatsAfter.currentCashInHand}), no double-crediting`
  );

  const [auditRaceCount] = await sql`
    SELECT count(*) FROM audit_logs
    WHERE target_id = ${orderRace.id} AND action_type = 'delivery_completed'
  `;
  assert(parseInt(auditRaceCount.count, 10) === 1, 'Exactly ONE delivery_completed audit log created');

  // =========================================================================
  // Test 12: Idempotent delivery: repeated call with valid PIN returns existing state
  // =========================================================================
  console.log('\n--- Test 12: Idempotent delivery ---');
  const repeatReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      orderId: orderRace.id,
      collectionStatus: 'collected_cash',
      deliveryPin: racePin,
    }),
  });
  const repeatRes = await postDriverOrders(repeatReq);
  const repeatData = await repeatRes.json();
  assert(repeatRes.status === 200 && repeatData.success === true, 'Repeated deliver call succeeds idempotently (HTTP 200)');
  assert(repeatData.order.status === 'delivered', 'Order status is still delivered');

  const driverStatsAfterRepeat = await pgGetDriverById(driverA.id);
  assert(
    driverStatsAfterRepeat.currentCashInHand === cashBefore + 30000,
    'Cash in hand NOT doubled on repeated deliver request'
  );

  // =========================================================================
  // Test 13: Financial compatibility: works with full cash, partial cash, and debt
  // =========================================================================
  console.log('\n--- Test 13: Financial compatibility (partial cash & debt) ---');
  // 13.1 Partial collection with PIN
  const orderPartial = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت الرشيد',
      phone: '07701112222',
      city: 'بغداد',
      address: 'شارع الرشيد',
      isGuest: false,
      userId: custAccountA.id,
    },
    items: [
      {
        productId: prod.id,
        name: 'أرز بسمتي فاخر 10 كغم',
        price: 30000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كيس',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccountA.id,
  });

  await pgAssignOrderDriver({
    orderId: orderPartial.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, orderPartial.id, driverOpA);

  const [partDb] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${orderPartial.id}`;
  const partPin = decryptPin(partDb.delivery_pin_encrypted);

  const partDelivered = await pgDeliverDriverOrder(driverA.id, orderPartial.id, driverOpA, {
    collectionStatus: 'partial',
    collectedAmount: 18000,
    deliveryPin: partPin,
  });
  assert(partDelivered.status === 'delivered', 'Partial collection order delivered successfully');
  assert(partDelivered.collectionStatus === 'partial', 'collectionStatus is partial');
  assert(partDelivered.collectedAmount === 18000, 'collectedAmount is 18000');
  assert(partDelivered.remainingDebtAmount === 12000, 'remainingDebtAmount is 12000');
  assert(partDelivered.deliveryProofMethod === 'customer_pin', 'deliveryProofMethod is customer_pin');

  // 13.2 Full Debt with PIN
  const orderDebt = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت دجلة',
      phone: '07703334444',
      city: 'بغداد',
      address: 'الكرادة',
      isGuest: false,
      userId: custAccountB.id,
    },
    items: [
      {
        productId: prod.id,
        name: 'أرز بسمتي فاخر 10 كغم',
        price: 30000,
        quantity: 1,
        saleType: 'wholesale',
        unitLabel: 'كيس',
        image: '',
      },
    ],
    paymentMethod: 'debt',
    accountId: custAccountB.id,
  });

  await pgAssignOrderDriver({
    orderId: orderDebt.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, orderDebt.id, driverOpA);

  const [debtDb] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${orderDebt.id}`;
  const debtPin = decryptPin(debtDb.delivery_pin_encrypted);

  const debtDelivered = await pgDeliverDriverOrder(driverA.id, orderDebt.id, driverOpA, {
    collectionStatus: 'debt_unpaid',
    deliveryPin: debtPin,
  });
  assert(debtDelivered.status === 'delivered', 'Debt order delivered with valid customer PIN');
  assert(debtDelivered.collectionStatus === 'debt_unpaid', 'collectionStatus is debt_unpaid');
  assert(debtDelivered.remainingDebtAmount === 30000, 'remainingDebtAmount is 30,000');
  assert(debtDelivered.deliveryProofMethod === 'customer_pin', 'deliveryProofMethod is customer_pin');

  // =========================================================================
  // Test 14: Admin override mechanism
  // =========================================================================
  console.log('\n--- Test 14: Admin override mechanism ---');
  // Order 2 was locked due to 5 brute force attempts. Admin overrides it with reason.
  // 14.1 Rejection if reason is too short (< 5 characters)
  const shortReasonReq = new Request(`http://localhost:3000/api/orders/${order2.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      action: 'admin_override_delivery',
      deliveryOverride: true,
      reason: 'قصير', // 4 chars -> reject
    }),
  });
  const shortReasonRes = await patchOrderRoute(shortReasonReq, { params: { id: order2.id } });
  assert(shortReasonRes.status === 400, 'Admin override with reason < 5 chars rejected with HTTP 400');

  // 14.2 Rejection if admin lacks 'orders' permission
  const noPermOverrideReq = new Request(`http://localhost:3000/api/orders/${order2.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminNoPermCookie },
    body: JSON.stringify({
      action: 'admin_override_delivery',
      deliveryOverride: true,
      reason: 'هاتف الزبون نفدت بطاريته وتم التأكد هاتفياً',
    }),
  });
  const noPermOverrideRes = await patchOrderRoute(noPermOverrideReq, { params: { id: order2.id } });
  assert(noPermOverrideRes.status === 403, 'Staff without orders permission rejected with HTTP 403');

  // 14.3 Successful Admin Override
  const validOverrideReq = new Request(`http://localhost:3000/api/orders/${order2.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      action: 'admin_override_delivery',
      deliveryOverride: true,
      reason: 'هاتف الزبون نفدت بطاريته وتم التأكد هاتفياً عبر المتجر مباشرة',
    }),
  });
  const validOverrideRes = await patchOrderRoute(validOverrideReq, { params: { id: order2.id } });
  const validOverrideData = await validOverrideRes.json();
  assert(validOverrideRes.status === 200 && validOverrideData.success === true, 'Admin override succeeded (HTTP 200)');
  assert(validOverrideData.order.status === 'delivered', 'Order status transitioned to delivered via override');
  assert(validOverrideData.order.deliveryProofMethod === 'admin_override', 'deliveryProofMethod is admin_override');
  assert(validOverrideData.order.deliveryOverrideReason.includes('هاتف الزبون نفدت بطاريته'), 'deliveryOverrideReason recorded');
  assert(validOverrideData.order.deliveryPin === undefined, 'Admin override response does not return raw deliveryPin');

  const [order2AfterOverride] = await sql`
    SELECT status, delivery_proof_method, delivery_override_reason, delivery_override_by, delivery_override_by_name, delivery_pin_encrypted
    FROM orders WHERE id = ${order2.id}
  `;
  assert(order2AfterOverride.status === 'delivered', 'Database order status is delivered');
  assert(order2AfterOverride.delivery_proof_method === 'admin_override', 'DB delivery_proof_method is admin_override');
  assert(order2AfterOverride.delivery_override_by === adminAuthIdentity.id, 'delivery_override_by matches admin user ID');
  assert(order2AfterOverride.delivery_override_by_name === 'مدير العمليات والتوصيل', 'delivery_override_by_name matches admin name');
  assert(order2AfterOverride.delivery_pin_encrypted === null, 'delivery_pin_encrypted is erased (NULL) in DB after admin override');

  const [overrideAudit] = await sql`
    SELECT action_type, category, severity, details FROM audit_logs
    WHERE target_id = ${order2.id} AND action_type = 'delivery_admin_override'
  `;
  assert(overrideAudit !== undefined, 'delivery_admin_override audit log recorded');
  assert(overrideAudit.severity === 'warning', 'Audit log has warning severity');
  assert(overrideAudit.details.includes('تجاوز إداري'), 'Audit log details specify administrative override');

  // =========================================================================
  // Test 15: Driver cannot perform admin override
  // =========================================================================
  console.log('\n--- Test 15: Driver cannot perform admin override ---');
  // Driver tries to call PATCH /api/orders/[id] with driver cookie -> 401/403
  const driverTryPatchReq = new Request(`http://localhost:3000/api/orders/${orderDebt.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      action: 'admin_override_delivery',
      deliveryOverride: true,
      reason: 'محاولة سائق لتجاوز الرمز',
    }),
  });
  const driverTryPatchRes = await patchOrderRoute(driverTryPatchReq, { params: { id: orderDebt.id } });
  assert(driverTryPatchRes.status === 401 || driverTryPatchRes.status === 403, 'Driver cannot call admin PATCH endpoint (HTTP 401/403)');

  // Driver tries to pass admin_override via driver API -> rejected because API requires valid PIN
  await pgAssignOrderDriver({
    orderId: guestOrder.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, guestOrder.id, driverOpA);

  const driverTryOverrideApiReq = new Request('http://localhost:3000/api/driver/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driverACookie },
    body: JSON.stringify({
      orderId: guestOrder.id,
      proofMethod: 'admin_override',
      deliveryPin: '', // omitted or fake
    }),
  });
  const driverTryOverrideApiRes = await postDriverOrders(driverTryOverrideApiReq);
  assert(driverTryOverrideApiRes.status === 400, 'Driver API strictly rejects delivery without 4-digit PIN');

  // =========================================================================
  // Test 16: Order cancellation/return restores inventory and blocks delivery
  // =========================================================================
  console.log('\n--- Test 16: Order cancellation restores inventory & blocks delivery ---');
  const [stockBefore16] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod.id}`;
  const stockBeforeNum16 = parseInt(stockBefore16.current_stock_pieces, 10);

  const orderCancel = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت الرشيد',
      phone: '07701112222',
      city: 'بغداد',
      address: 'شارع الرشيد',
      isGuest: false,
      userId: custAccountA.id,
    },
    items: [
      {
        productId: prod.id,
        name: 'أرز بسمتي فاخر 10 كغم',
        price: 30000,
        quantity: 2,
        saleType: 'wholesale',
        unitLabel: 'كيس',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccountA.id,
  });

  const [stockAfterOrder16] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod.id}`;
  assert(parseInt(stockAfterOrder16.current_stock_pieces, 10) === stockBeforeNum16 - 2, 'Stock deducted upon order creation');

  await pgAssignOrderDriver({
    orderId: orderCancel.id,
    driverId: driverA.id,
    adminOperator,
  });
  await pgStartDriverDelivery(driverA.id, orderCancel.id, driverOpA);

  const [cancelDb] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${orderCancel.id}`;
  const cancelPin = decryptPin(cancelDb.delivery_pin_encrypted);

  // Driver marks delivery as returned/failed
  const { pgReturnDriverOrder } = await import('./src/lib/postgres-delivery.ts');
  await pgReturnDriverOrder(driverA.id, orderCancel.id, driverOpA, {
    reason: 'رفض الزبون استلام البضاعة بالكامل',
  });

  const [stockAfterReturn16] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod.id}`;
  assert(parseInt(stockAfterReturn16.current_stock_pieces, 10) === stockBeforeNum16, 'Stock restored to original quantity upon return');

  // Verify secret erasure and customer API behavior on cancelled/returned order
  const [cancelAfterDb] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${orderCancel.id}`;
  assert(cancelAfterDb.delivery_pin_encrypted === null, 'delivery_pin_encrypted is erased (NULL) on cancelled/returned order');

  const custCancelReq = new Request(`http://localhost:3000/api/orders/${orderCancel.id}`, {
    headers: { Cookie: custACookie },
  });
  const custCancelRes = await getOrderRoute(custCancelReq, { params: { id: orderCancel.id } });
  const custCancelData = await custCancelRes.json();
  assert(custCancelData.order.deliveryPin === undefined, 'Customer API does NOT return deliveryPin on cancelled/returned order');

  // Try to deliver returned/cancelled order with correct PIN -> MUST fail
  let deliverReturnedCaught = false;
  try {
    await pgDeliverDriverOrder(driverA.id, orderCancel.id, driverOpA, {
      collectionStatus: 'collected_cash',
      deliveryPin: cancelPin,
    });
  } catch (err) {
    deliverReturnedCaught = true;
    assert(err.message.includes('ملغى') || err.message.includes('راجع'), 'Cannot deliver returned/cancelled order');
  }
  assert(deliverReturnedCaught, 'Delivery on cancelled/returned order blocked');

  console.log('\n===============================================================');
  console.log(`ALL 16 TESTS PASSED: ${passed} assertions passed, ${failed} failed.`);
  console.log('===============================================================\n');
}

async function main() {
  try {
    await setup();
    await runDeliveryPinTests();
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    if (sql) await sql.end({ timeout: 5 });
    if (ep) await ep.stop();
  }
}

main();
