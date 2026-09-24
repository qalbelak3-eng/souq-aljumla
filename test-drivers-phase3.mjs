import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';

const Ep = EpDefault.default || EpDefault;
const PORT = 54335; // Different port to avoid any conflicts
const tempDir = path.join(os.tmpdir(), 'ep_test_drivers_phase3_' + Date.now());
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

async function runDriversPhase3Tests() {
  console.log('===============================================================');
  console.log('       PHASE DRIVERS-3: DRIVER CASH CUSTODY & SETTLEMENTS      ');
  console.log('===============================================================\n');

  // Dynamic Imports
  const {
    pgCreateDriver,
    pgUpdateDriver,
    pgGetDriverById,
    pgCreateVehicle,
  } = await import('./src/lib/postgres-drivers.ts');

  const {
    pgCreateOrder,
    pgGetOrderById,
  } = await import('./src/lib/postgres-orders.ts');

  const {
    pgAssignOrderDriver,
    pgStartDriverDelivery,
    pgDeliverDriverOrder,
  } = await import('./src/lib/postgres-delivery.ts');

  const {
    pgGetDriverCustody,
    pgGetAllDriversCustodySummary,
    pgCreateDriverSettlement,
    pgReverseDriverSettlement,
    pgGetDriverSettlementById,
  } = await import('./src/lib/postgres-settlements.ts');

  const {
    signAdminSession,
    signDriverSession,
    SESSION_COOKIE_NAME,
    DRIVER_SESSION_COOKIE_NAME,
  } = await import('./src/lib/auth.ts');

  const { GET: getAdminDriverCustody, POST: postAdminDriverSettle } = await import(
    './src/app/api/admin/drivers/[id]/settle/route.ts'
  );

  const { POST: postAdminReverseSettlement } = await import(
    './src/app/api/admin/drivers/[id]/settle/[settlementId]/reverse/route.ts'
  );

  const { GET: getAdminSettlementsSummary } = await import(
    './src/app/api/admin/drivers/settlements/route.ts'
  );

  const { GET: getDriverCustodyRoute } = await import(
    './src/app/api/driver/custody/route.ts'
  );

  // --- Step 0: Seed Catalog & Accounts ---
  console.log('--- Step 0: Seeding Reference Catalog & Accounts ---');
  const [cat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم الأغذية والمشروبات', 'food-bev')
    RETURNING id, name;
  `;
  const [comp] = await sql`
    INSERT INTO companies (name)
    VALUES ('شركة الاتحاد للصناعات الغذائية')
    RETURNING id, name;
  `;

  const [prod] = await sql`
    INSERT INTO products (
      name, category_id, company_id,
      boxes_per_carton, items_per_box, pieces_per_carton,
      current_stock_pieces,
      retail_unit, wholesale_unit,
      price, wholesale_price, piece_cost_price, cost_price
    ) VALUES (
      'عصير راني تفاح كرتون 24', ${cat.id}, ${comp.id},
      4, 6, 24,
      1000,
      'قطعة مفردة', 'كرتون 24 قطعة',
      1000.00, 20000.00, 700.0000, 16800.00
    ) RETURNING id, name, current_stock_pieces;
  `;

  const [custAccount] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier, is_active
    ) VALUES (
      'ACC-CUST-301', 'سوبرماركت البركة', '07709998811', 'customer', 'market', true
    ) RETURNING id, name, phone;
  `;

  // Vehicles & Drivers
  const veh1 = await pgCreateVehicle({
    name: 'كيا حمل بيضاء 2024',
    plateNumber: `77112-${Date.now().toString().slice(-4)}`,
    isActive: true,
  });

  const driver1 = await pgCreateDriver({
    name: 'السائق عباس البصري',
    phone: '0771' + Math.floor(1000000 + Math.random() * 9000000),
    password: 'DriverPass123!',
    defaultVehicleId: veh1.id,
    isActive: true,
  });

  const driver2 = await pgCreateDriver({
    name: 'السائق سجاد الكوفي',
    phone: '0772' + Math.floor(1000000 + Math.random() * 9000000),
    password: 'DriverPass456!',
    defaultVehicleId: veh1.id,
    isActive: true,
  });

  // Admin Sessions
  const masterAdminToken = signAdminSession({
    userId: 'admin-master',
    username: 'admin',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const masterAdminCookie = `${SESSION_COOKIE_NAME}=${masterAdminToken}`;

  const staffWithoutAccToken = signAdminSession({
    userId: 'staff-no-acc',
    username: 'warehouse_staff',
    role: 'staff',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const staffWithoutAccCookie = `${SESSION_COOKIE_NAME}=${staffWithoutAccToken}`;

  const { ensureDbExists } = await import('./src/lib/db.ts');
  const memDb = ensureDbExists();
  if (!memDb.staff) memDb.staff = [];
  memDb.staff.push({
    id: 'staff-no-acc',
    name: 'موظف مخزن بدون صلاحية محاسبية',
    username: 'warehouse_staff',
    role: 'staff',
    permissions: ['inventory'], // Missing accounting & drivers
    isActive: true,
  });

  const driver1Token = signDriverSession({
    driverId: driver1.id,
    phone: driver1.phone,
    name: driver1.name,
    role: 'driver',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const driver1Cookie = `${DRIVER_SESSION_COOKIE_NAME}=${driver1Token}`;

  const driver2Token = signDriverSession({
    driverId: driver2.id,
    phone: driver2.phone,
    name: driver2.name,
    role: 'driver',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const driver2Cookie = `${DRIVER_SESSION_COOKIE_NAME}=${driver2Token}`;

  const adminOp = {
    userId: 'admin-master',
    username: 'admin',
    name: 'المدير العام',
    role: 'admin',
  };

  const driverOp1 = { id: driver1.id, name: driver1.name, phone: driver1.phone };

  // =========================================================
  // Test 1: Initial State - Driver with zero custody = 0
  // =========================================================
  console.log('\n--- Test 1: Initial Zero Custody ---');
  const initialCustody = await pgGetDriverCustody(driver1.id);
  assert(initialCustody !== null, 'Driver 1 custody profile exists');
  assert(initialCustody.totalCollectedCash === 0, 'Initial totalCollectedCash is 0');
  assert(initialCustody.totalSettledCash === 0, 'Initial totalSettledCash is 0');
  assert(initialCustody.currentCashInHand === 0, 'Initial currentCashInHand is 0');
  assert(initialCustody.unsettledOrders.length === 0, 'Initial unsettledOrders count is 0');

  // =========================================================
  // Test 2: Full Cash Delivery (100,000) -> Custody = 100,000
  // =========================================================
  console.log('\n--- Test 2: Full Cash Delivery (100,000) ---');
  const orderA = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت البركة',
      phone: '07709998811',
      city: 'بغداد',
      address: 'الكرادة',
      isGuest: false,
      userId: custAccount.id,
    },
    items: [
      {
        productId: prod.id,
        name: 'عصير راني تفاح كرتون 24',
        price: 20000,
        quantity: 5, // 5 cartons * 20,000 = 100,000
        saleType: 'wholesale',
        unitLabel: 'كرتون 24 قطعة',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccount.id,
  });

  await pgAssignOrderDriver({ orderId: orderA.id, driverId: driver1.id, adminOperator: adminOp });
  await pgStartDriverDelivery(driver1.id, orderA.id, driverOp1);
  await pgDeliverDriverOrder(driver1.id, orderA.id, driverOp1, { collectionStatus: 'collected_cash' });

  const custodyAfterA = await pgGetDriverCustody(driver1.id);
  assert(custodyAfterA.totalCollectedCash === 100000, 'Total collected cash increased to 100,000 IQD');
  assert(custodyAfterA.totalSettledCash === 0, 'Total settled cash is still 0');
  assert(custodyAfterA.currentCashInHand === 100000, 'Current cash in hand is exactly 100,000 IQD');
  assert(custodyAfterA.unsettledOrders.length === 1, 'Exactly 1 unsettled order');
  assert(custodyAfterA.unsettledOrders[0].unsettledAmount === 100000, 'Order A unsettledAmount is 100,000 IQD');

  // Verify pgGetDriverById reflects same authoritative cash in hand
  const driver1Profile = await pgGetDriverById(driver1.id);
  assert(driver1Profile.currentCashInHand === 100000, 'pgGetDriverById matches authoritative cash in hand (100,000 IQD)');

  // =========================================================
  // Test 3: Partial Collection (Order 100,000 -> Collected 60,000, Debt 40,000)
  // =========================================================
  console.log('\n--- Test 3: Partial Collection (Collected 60,000, Debt 40,000) ---');
  const orderB = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت البركة',
      phone: '07709998811',
      city: 'بغداد',
      address: 'المنصور',
      isGuest: false,
      userId: custAccount.id,
    },
    items: [
      {
        productId: prod.id,
        name: 'عصير راني تفاح كرتون 24',
        price: 20000,
        quantity: 5, // 100,000 IQD total
        saleType: 'wholesale',
        unitLabel: 'كرتون 24 قطعة',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccount.id,
  });

  await pgAssignOrderDriver({ orderId: orderB.id, driverId: driver1.id, adminOperator: adminOp });
  await pgStartDriverDelivery(driver1.id, orderB.id, driverOp1);
  await pgDeliverDriverOrder(driver1.id, orderB.id, driverOp1, {
    collectionStatus: 'partial',
    collectedAmount: 60000,
  });

  const custodyAfterB = await pgGetDriverCustody(driver1.id);
  // Total collected = 100,000 (A) + 60,000 (B) = 160,000. Debt of 40,000 is NOT in custody!
  assert(
    custodyAfterB.totalCollectedCash === 160000,
    'Total collected cash is 160,000 IQD (Only collectedAmount enters custody, uncollected debt 40,000 excluded!)'
  );
  assert(custodyAfterB.currentCashInHand === 160000, 'Current cash in hand is exactly 160,000 IQD');
  assert(custodyAfterB.unsettledOrders.length === 2, 'Two unsettled orders in custody');

  // =========================================================
  // Test 4: Over-Settlement & Invalid Amount Rejections
  // =========================================================
  console.log('\n--- Test 4: Over-Settlement & Invalid Amount Rejections ---');
  let overSettleCaught = false;
  try {
    await pgCreateDriverSettlement(driver1.id, { amount: 200000 }, adminOp);
  } catch (err) {
    overSettleCaught = true;
    assert(err.message.includes('أكبر من العهدة النقدية'), 'Rejects settlement exceeding current cash custody');
  }
  assert(overSettleCaught, 'Over-settlement strictly blocked');

  let zeroSettleCaught = false;
  try {
    await pgCreateDriverSettlement(driver1.id, { amount: 0 }, adminOp);
  } catch (err) {
    zeroSettleCaught = true;
    assert(err.message.includes('أكبر من صفر'), 'Rejects settlement with amount = 0');
  }
  assert(zeroSettleCaught, 'Zero amount settlement rejected');

  let negativeSettleCaught = false;
  try {
    await pgCreateDriverSettlement(driver1.id, { amount: -50000 }, adminOp);
  } catch (err) {
    negativeSettleCaught = true;
    assert(err.message.includes('أكبر من صفر'), 'Rejects settlement with negative amount');
  }
  assert(negativeSettleCaught, 'Negative amount settlement rejected');

  // =========================================================
  // Test 5: Partial Settlement & FIFO Allocation
  // =========================================================
  console.log('\n--- Test 5: Partial Settlement & FIFO Allocation ---');
  // Custody is 160,000 (Order A: 100,000, Order B: 60,000).
  // Driver settles 120,000:
  // - Order A (100,000) is fully settled -> driverCashSettled = true, settledAmount = 100,000.
  // - Order B (60,000) is partially covered (20,000) -> driverCashSettled = false, settledAmount = 20,000.
  // - Remaining custody = 160,000 - 120,000 = 40,000!
  const settleRes1 = await pgCreateDriverSettlement(
    driver1.id,
    { amount: 120000, notes: 'دفعة تسوية جزئية أولى' },
    adminOp
  );

  assert(settleRes1.settlement && settleRes1.settlement.id, 'Settlement batch 1 created successfully');
  assert(settleRes1.settlement.actualAmount === 120000, 'Settlement 1 actualAmount is 120,000 IQD');
  assert(settleRes1.balanceBefore === 160000, 'Balance before was 160,000 IQD');
  assert(settleRes1.balanceAfter === 40000, 'Balance after is 40,000 IQD');
  assert(settleRes1.allocations.length === 2, 'Allocations cover exactly 2 orders');

  // Check FIFO allocation details
  const allocA = settleRes1.allocations.find((a) => a.orderId === orderA.id);
  const allocB = settleRes1.allocations.find((a) => a.orderId === orderB.id);
  assert(allocA.allocatedAmount === 100000, 'FIFO: Order A fully allocated 100,000 IQD');
  assert(allocB.allocatedAmount === 20000, 'FIFO: Order B partially allocated 20,000 IQD');

  // Verify Order records in PostgreSQL
  const [orderAfterSettleA] = await sql`SELECT settled_amount, driver_cash_settled FROM orders WHERE id = ${orderA.id}`;
  const [orderAfterSettleB] = await sql`SELECT settled_amount, driver_cash_settled FROM orders WHERE id = ${orderB.id}`;

  assert(Number(orderAfterSettleA.settled_amount) === 100000, 'Order A settled_amount is 100,000');
  assert(orderAfterSettleA.driver_cash_settled === true, 'Order A driver_cash_settled is true (fully covered)');

  assert(Number(orderAfterSettleB.settled_amount) === 20000, 'Order B settled_amount is 20,000');
  assert(orderAfterSettleB.driver_cash_settled === false, 'Order B driver_cash_settled is false (partially covered)');

  // Verify Cash Vault Inflow Movement
  const [vaultMove1] = await sql`
    SELECT * FROM cash_vault_movements
    WHERE reference_id = ${settleRes1.settlement.id} AND type = 'inflow'
  `;
  assert(vaultMove1 !== undefined, 'Cash vault movement recorded for settlement 1');
  assert(Number(vaultMove1.amount) === 120000, 'Vault inflow amount matches settlement (120,000 IQD)');
  assert(vaultMove1.category === 'driver_settlement', 'Vault category is driver_settlement');

  // Verify NO second customer voucher created (no double counting!)
  const customerVouchers = await sql`
    SELECT count(*) FROM vouchers WHERE account_id = ${custAccount.id}
  `;
  assert(parseInt(customerVouchers[0].count, 10) === 0, 'No customer voucher generated on driver settlement (No double-counting)');

  // Check custody now: remaining cash in hand = 40,000
  const custodyMid = await pgGetDriverCustody(driver1.id);
  assert(custodyMid.currentCashInHand === 40000, 'Custody currentCashInHand is exactly 40,000 IQD');
  assert(custodyMid.unsettledOrders.length === 1, 'Only Order B remains in unsettled orders');
  assert(custodyMid.unsettledOrders[0].unsettledAmount === 40000, 'Order B unsettledAmount is 40,000 IQD (60,000 - 20,000)');

  // =========================================================
  // Test 6: Completing Second Partial Settlement -> Custody = 0
  // =========================================================
  console.log('\n--- Test 6: Completing Second Partial Settlement (40,000) ---');
  const settleRes2 = await pgCreateDriverSettlement(
    driver1.id,
    { amount: 40000, notes: 'تسوية باقي العهدة' },
    adminOp
  );
  assert(settleRes2.balanceAfter === 0, 'Custody drops to exactly 0 after full settlement');
  assert(settleRes2.allocations.length === 1, 'Settlement 2 allocated to remaining Order B');
  assert(settleRes2.allocations[0].allocatedAmount === 40000, 'Allocated exactly 40,000 to Order B');

  const [orderAfterSettleB2] = await sql`SELECT settled_amount, driver_cash_settled FROM orders WHERE id = ${orderB.id}`;
  assert(Number(orderAfterSettleB2.settled_amount) === 60000, 'Order B settled_amount is now 60,000 (fully covered)');
  assert(orderAfterSettleB2.driver_cash_settled === true, 'Order B driver_cash_settled is now true');

  const custodyZero = await pgGetDriverCustody(driver1.id);
  assert(custodyZero.currentCashInHand === 0, 'Driver custody is exactly 0 IQD');
  assert(custodyZero.unsettledOrders.length === 0, 'Zero unsettled orders remaining');

  // =========================================================
  // Test 7: Formal Reversal Workflow (Immutability & Rollback)
  // =========================================================
  console.log('\n--- Test 7: Formal Reversal Workflow ---');
  // Reversing Settlement 2 (40,000):
  // - Order B settled_amount should revert from 60,000 to 20,000
  // - Order B driverCashSettled should revert to false
  // - Custody cash in hand should revert to 40,000
  // - Outflow vault movement recorded
  const revRes = await pgReverseDriverSettlement(
    settleRes2.settlement.id,
    { reason: 'خطأ محاسبي في إيصال التسوية الثانية' },
    adminOp
  );

  assert(revRes.originalSettlement.isReversed === true, 'Original settlement marked isReversed = true');
  assert(revRes.reversalSettlement.type === 'reversal', 'Reversal settlement record created with type = reversal');
  assert(revRes.revertedAmount === 40000, 'Reverted amount matches 40,000 IQD');
  assert(revRes.newCustodyBalance === 40000, 'Driver custody balance restored to 40,000 IQD');

  const [orderAfterRevB] = await sql`SELECT settled_amount, driver_cash_settled FROM orders WHERE id = ${orderB.id}`;
  assert(Number(orderAfterRevB.settled_amount) === 20000, 'Order B settled_amount reverted to 20,000');
  assert(orderAfterRevB.driver_cash_settled === false, 'Order B driver_cash_settled reverted to false');

  // Verify Cash Vault Outflow Movement
  const [vaultOutflow] = await sql`
    SELECT * FROM cash_vault_movements
    WHERE reference_id = ${settleRes2.settlement.id} AND type = 'outflow'
  `;
  assert(vaultOutflow !== undefined, 'Cash vault outflow movement recorded for reversal');
  assert(Number(vaultOutflow.amount) === 40000, 'Vault outflow amount is 40,000 IQD');

  // 7.2 Prevent Double Reversal
  let doubleRevCaught = false;
  try {
    await pgReverseDriverSettlement(
      settleRes2.settlement.id,
      { reason: 'محاولة عكس ثانية' },
      adminOp
    );
  } catch (err) {
    doubleRevCaught = true;
    assert(err.message.includes('تم عكس هذه التسوية مسبقاً'), 'Rejects double reversal of already reversed settlement');
  }
  assert(doubleRevCaught, 'Double reversal cleanly prevented');

  // 7.3 Prevent Reversal of a Reversal Record
  let revOfRevCaught = false;
  try {
    await pgReverseDriverSettlement(
      revRes.reversalSettlement.id,
      { reason: 'محاولة عكس سجل العكس' },
      adminOp
    );
  } catch (err) {
    revOfRevCaught = true;
    assert(err.message.includes('لا يمكن عكس سجل تسوية عكسية'), 'Rejects reversing a reversal record');
  }
  assert(revOfRevCaught, 'Reversal of reversal record cleanly blocked');

  // 7.4 Database Trigger: Prevent DELETE & UPDATE on driver_settlements
  let deleteSettlementCaught = false;
  try {
    await sql`DELETE FROM driver_settlements WHERE id = ${settleRes1.settlement.id}`;
  } catch (err) {
    deleteSettlementCaught = true;
    assert(err.message.includes('immutable financial records'), 'Trigger blocks DELETE on driver_settlements');
  }
  assert(deleteSettlementCaught, 'Physical DELETE on settlements strictly forbidden by database trigger');

  let updateAmountCaught = false;
  try {
    await sql`UPDATE driver_settlements SET actual_amount = 99999 WHERE id = ${settleRes1.settlement.id}`;
  } catch (err) {
    updateAmountCaught = true;
    assert(err.message.includes('permanently immutable'), 'Trigger blocks direct UPDATE of actual_amount');
  }
  assert(updateAmountCaught, 'Direct UPDATE of settlement amount strictly forbidden by trigger');

  // =========================================================
  // Test 8: Deliver x Settlement Race Condition
  // =========================================================
  console.log('\n--- Test 8: Deliver x Settlement Race Condition ---');
  // Current custody of Driver 1 is 40,000 (from Order B remaining).
  // Driver delivers new Order C (total 80,000 collected).
  // Concurrently, admin settles 40,000.
  // Neither the new delivery cash nor the settlement must be lost or double counted!
  const orderC = await pgCreateOrder({
    customer: {
      name: 'سوبرماركت البركة',
      phone: '07709998811',
      city: 'بغداد',
      address: 'الجادرية',
      isGuest: false,
      userId: custAccount.id,
    },
    items: [
      {
        productId: prod.id,
        name: 'عصير راني تفاح كرتون 24',
        price: 20000,
        quantity: 4, // 80,000 IQD
        saleType: 'wholesale',
        unitLabel: 'كرتون 24 قطعة',
        image: '',
      },
    ],
    paymentMethod: 'cod',
    accountId: custAccount.id,
  });

  await pgAssignOrderDriver({ orderId: orderC.id, driverId: driver1.id, adminOperator: adminOp });
  await pgStartDriverDelivery(driver1.id, orderC.id, driverOp1);

  // Run Deliver and Settlement concurrently
  const [raceDeliver, raceSettle] = await Promise.allSettled([
    pgDeliverDriverOrder(driver1.id, orderC.id, driverOp1, { collectionStatus: 'collected_cash' }),
    pgCreateDriverSettlement(driver1.id, { amount: 40000, notes: 'تسوية في سباق التوصيل' }, adminOp),
  ]);

  assert(raceDeliver.status === 'fulfilled', 'Concurrent deliver completed successfully');
  assert(raceSettle.status === 'fulfilled', 'Concurrent settlement completed successfully');

  // Final custody must be:
  // Initial (40,000) + New Order C (80,000) - Settlement (40,000) = 80,000 IQD exactly!
  const custodyAfterRace = await pgGetDriverCustody(driver1.id);
  assert(
    custodyAfterRace.currentCashInHand === 80000,
    `Deliver x Settlement race: Custody is exactly 80,000 IQD (40k + 80k - 40k), no data lost!`
  );

  // =========================================================
  // Test 9: Concurrent Settlement x Settlement Race Protection
  // =========================================================
  console.log('\n--- Test 9: Concurrent Settlement x Settlement Race ---');
  // Current custody is 80,000.
  // Two admins attempt to settle 60,000 concurrently!
  // Sum = 120,000 > 80,000.
  // Exactly ONE must succeed and the second must be rejected with over-settlement error!
  const [settleRace1, settleRace2] = await Promise.allSettled([
    pgCreateDriverSettlement(driver1.id, { amount: 60000, notes: 'تسوية متزامنة 1' }, adminOp),
    pgCreateDriverSettlement(driver1.id, { amount: 60000, notes: 'تسوية متزامنة 2' }, adminOp),
  ]);

  const fulfilledSettleCount = [settleRace1, settleRace2].filter((r) => r.status === 'fulfilled').length;
  const rejectedSettleCount = [settleRace1, settleRace2].filter((r) => r.status === 'rejected').length;

  assert(fulfilledSettleCount === 1, 'Settlement x Settlement race: Exactly ONE settlement succeeded');
  assert(rejectedSettleCount === 1, 'Settlement x Settlement race: Exactly ONE settlement was rejected');

  const rejectedReason = settleRace1.status === 'rejected' ? settleRace1.reason : settleRace2.reason;
  assert(
    rejectedReason.message.includes('أكبر من العهدة النقدية'),
    'Second concurrent settlement rejected with over-settlement error'
  );

  const custodyAfterSettleRace = await pgGetDriverCustody(driver1.id);
  assert(
    custodyAfterSettleRace.currentCashInHand === 20000,
    'Custody balance after race is exactly 20,000 IQD (80,000 - 60,000)'
  );

  // =========================================================
  // Test 10: Inactive Driver Historical Custody Settlement
  // =========================================================
  console.log('\n--- Test 10: Inactive Driver Historical Custody Settlement ---');
  // Deactivate Driver 1
  await pgUpdateDriver(driver1.id, { isActive: false });
  const deactivatedDriver = await pgGetDriverById(driver1.id);
  assert(deactivatedDriver.isActive === false, 'Driver 1 is now inactive');

  // Inactive driver can still settle their remaining 20,000 custody debt!
  const inactiveSettleRes = await pgCreateDriverSettlement(
    driver1.id,
    { amount: 20000, notes: 'تسوية نهائية لسائق غير فعال' },
    adminOp
  );
  assert(inactiveSettleRes.balanceAfter === 0, 'Inactive driver settled remaining debt cleanly (balance = 0)');

  // Reactivate for further tests
  await pgUpdateDriver(driver1.id, { isActive: true });

  // =========================================================
  // Test 11: Security & API Authorization Tests
  // =========================================================
  console.log('\n--- Test 11: Security & API Authorization ---');

  // 11.1 Driver Custody API (GET /api/driver/custody)
  // Driver 1 requests own custody -> 200
  const driverCustodyReq = new Request('http://localhost:3000/api/driver/custody', {
    headers: { Cookie: driver1Cookie },
  });
  const driverCustodyRes = await getDriverCustodyRoute(driverCustodyReq);
  const driverCustodyData = await driverCustodyRes.json();
  assert(driverCustodyRes.status === 200 && driverCustodyData.success === true, 'Driver 1 successfully fetched own custody');
  assert(driverCustodyData.custody.currentCashInHand === 0, 'Driver 1 sees 0 cash in hand');

  // 11.2 Driver Object-Level Isolation: Driver 1 cannot spoof Driver 2's ID
  const driverSpoofReq = new Request(`http://localhost:3000/api/driver/custody?driverId=${driver2.id}`, {
    headers: { Cookie: driver1Cookie },
  });
  const driverSpoofRes = await getDriverCustodyRoute(driverSpoofReq);
  assert(driverSpoofRes.status === 403, 'Driver 1 spoofing Driver 2 ID rejected with HTTP 403 (Object Isolation PASS)');

  // 11.3 Driver CANNOT create settlement (no POST route allowed for drivers)
  const driverSettleAttemptReq = new Request(`http://localhost:3000/api/admin/drivers/${driver1.id}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: driver1Cookie }, // Driver cookie sent to admin route
    body: JSON.stringify({ amount: 1000 }),
  });
  const driverSettleAttemptRes = await postAdminDriverSettle(driverSettleAttemptReq, { params: { id: driver1.id } });
  assert(driverSettleAttemptRes.status === 401, 'Driver attempting admin settle route rejected with HTTP 401');

  // 11.4 Admin Route Authentication: Missing session -> 401
  const unauthSettleReq = new Request(`http://localhost:3000/api/admin/drivers/${driver1.id}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 1000 }),
  });
  const unauthSettleRes = await postAdminDriverSettle(unauthSettleReq, { params: { id: driver1.id } });
  assert(unauthSettleRes.status === 401, 'Unauthenticated settle request rejected with HTTP 401');

  // 11.5 Admin Route Permission: Staff without accounting/drivers permission -> 403
  const forbiddenSettleReq = new Request(`http://localhost:3000/api/admin/drivers/${driver1.id}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: staffWithoutAccCookie },
    body: JSON.stringify({ amount: 1000 }),
  });
  const forbiddenSettleRes = await postAdminDriverSettle(forbiddenSettleReq, { params: { id: driver1.id } });
  assert(forbiddenSettleRes.status === 403, 'Staff without accounting/drivers permission rejected with HTTP 403');

  // 11.6 Admin Settlements Summary Route (GET /api/admin/drivers/settlements)
  const adminSummaryReq = new Request('http://localhost:3000/api/admin/drivers/settlements', {
    headers: { Cookie: masterAdminCookie },
  });
  const adminSummaryRes = await getAdminSettlementsSummary(adminSummaryReq);
  const adminSummaryData = await adminSummaryRes.json();
  assert(adminSummaryRes.status === 200 && adminSummaryData.success === true, 'Admin settlements summary returned HTTP 200');
  assert(Array.isArray(adminSummaryData.summaries), 'Returns summaries array');
  const d1Summary = adminSummaryData.summaries.find((s) => s.driverId === driver1.id);
  assert(d1Summary !== undefined, 'Driver 1 appears in admin custody summaries');
  assert(d1Summary.currentCashInHand === 0, 'Driver 1 cash in hand matches in summary');

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
    await runDriversPhase3Tests();
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
