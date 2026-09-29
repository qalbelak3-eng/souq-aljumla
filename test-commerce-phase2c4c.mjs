import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  pgCreateOrder,
  pgGetOrderById,
  pgCancelOrder,
  pgReturnOrder,
  pgUpdateOrderStatus,
} from './src/lib/postgres-orders.ts';
import {
  pgAssignOrderDriver,
  pgStartDriverDelivery,
  pgFailDriverDelivery,
  pgReturnDriverOrder,
  pgConfirmWarehouseReturnReceipt,
  pgDeliverDriverOrder,
} from './src/lib/postgres-delivery.ts';
import { decryptPin } from './src/lib/delivery-pin.ts';
import {
  pgGetDriverCustody,
  pgCreateDriverSettlement,
} from './src/lib/postgres-settlements.ts';
import { pgCreateProduct, pgCreateCategory } from './src/lib/postgres-catalog.ts';
import { getDb } from './src/db/client.ts';
import { orders } from './src/db/schema/orders.ts';
import { products } from './src/db/schema/catalog.ts';
import { inventoryMovements } from './src/db/schema/inventory.ts';
import { financialAccounts } from './src/db/schema/accounts.ts';
import { authIdentities } from './src/db/schema/auth.ts';
import { staffProfiles } from './src/db/schema/auth.ts';
import { drivers } from './src/db/schema/vehicles_drivers.ts';
import { eq, and, sql as dSql } from 'drizzle-orm';

const Ep = EpDefault.default || EpDefault;
const PORT = 54364;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2c4c_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '10';
process.env.DATA_SOURCE_CATALOG_BASE = 'postgres';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2c4c-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2c4c-test-secret-min-32-chars-long';

process.on('unhandledRejection', (reason) => {
  if (reason && reason.code === 'EBUSY') return;
  console.error('Unhandled rejection:', reason);
});

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

  console.log('2. Applying schema and migrations (0000 -> 0020)...');
  const schemaFile = path.resolve(process.cwd(), 'drizzle/0000_magical_warbound.sql');
  await runSqlScript(sql, schemaFile);

  const migrationFiles = fs
    .readdirSync(path.resolve(process.cwd(), 'drizzle'))
    .filter((f) => f.endsWith('.sql') && f !== '0000_magical_warbound.sql')
    .sort();

  for (const m of migrationFiles) {
    const mPath = path.resolve(process.cwd(), 'drizzle', m);
    await runSqlScript(sql, mPath);
  }
  console.log(`   All ${migrationFiles.length} migrations applied successfully.`);
}

async function stopDatabase() {
  console.log('\nCleaning up database...');
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
  await new Promise((r) => setTimeout(r, 1000));
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}
  console.log('Database stopped and temp dir removed.');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`   ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`   ✅ [PASS] ${message}`);
}

async function runTests() {
  await startDatabase();
  const db = getDb();

  console.log('\n======================================================');
  console.log('Running Commerce-2C4C Delivery Custody & Integrity Suite');
  console.log('======================================================\n');

  // Seed baseline catalog, staff, and drivers
  console.log('[Setup] Seeding test catalog, staff, and drivers...');
  const cat = await pgCreateCategory({ name: 'قسم الحلويات 2C4C' });
  const prodA = await pgCreateProduct({
    name: 'شوكولاتة فاخرة 2C4C',
    category: cat.id,
    costPrice: 5000,
    price: 10000,
    wholesalePrice: 8000,
    specialPrice: 7000,
    stock: 500,
    stockPieces: 500,
    boxesPerCarton: 1,
    itemsPerBox: 1,
  });

  // Seed Customer Account
  const [customer] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'CUST-2C4C-01',
      name: 'علي التميمي',
      phone: '07701122334',
      category: 'customer',
      pricingTier: 'retail',
      isActive: true,
    })
    .returning();

  // Seed Staff Profile (Warehouse Keeper / Admin)
  const [adminAuth] = await db
    .insert(authIdentities)
    .values({
      phone: '07709999999',
      role: 'admin',
      passwordHash: 'fake_admin_hash',
    })
    .returning();

  const [staff] = await db
    .insert(staffProfiles)
    .values({
      authIdentityId: adminAuth.id,
      username: 'haider_warehouse',
      name: 'أمين المستودع حيدر',
      jobTitle: 'أمين مستودع',
      role: 'warehouse',
      isActive: true,
    })
    .returning();

  const adminOp = {
    id: staff.id,
    name: staff.name,
    username: staff.username,
    role: 'admin',
  };

  // Seed Driver A
  const [driverAAuth] = await db
    .insert(authIdentities)
    .values({
      phone: '07701234567',
      role: 'driver',
      passwordHash: 'fake_hash_a',
    })
    .returning();

  const [driverAAcc] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'DRV-ACC-2C4C-A',
      name: 'السائق أحمد 2C4C',
      phone: '07701234567',
      category: 'driver',
      pricingTier: 'retail',
      isActive: true,
    })
    .returning();

  const [driverA] = await db
    .insert(drivers)
    .values({
      authIdentityId: driverAAuth.id,
      financialAccountId: driverAAcc.id,
      name: 'السائق أحمد',
      phone: '07701234567',
      isActive: true,
    })
    .returning();

  const driverAOp = {
    id: driverA.id,
    name: driverA.name,
    phone: driverA.phone,
  };

  // Seed Driver B
  const [driverBAuth] = await db
    .insert(authIdentities)
    .values({
      phone: '07707654321',
      role: 'driver',
      passwordHash: 'fake_hash_b',
    })
    .returning();

  const [driverBAcc] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'DRV-ACC-2C4C-B',
      name: 'السائق بلال 2C4C',
      phone: '07707654321',
      category: 'driver',
      pricingTier: 'retail',
      isActive: true,
    })
    .returning();

  const [driverB] = await db
    .insert(drivers)
    .values({
      authIdentityId: driverBAuth.id,
      financialAccountId: driverBAcc.id,
      name: 'السائق بلال',
      phone: '07707654321',
      isActive: true,
    })
    .returning();

  const driverBOp = {
    id: driverB.id,
    name: driverB.name,
    phone: driverB.phone,
  };

  /* =========================================================================
     [Test 1] DB CHECK Constraints Verification (Direct SQL)
     ========================================================================= */
  console.log('\n[Test 1] Testing DB CHECK Constraints for negative amounts and invalid enums...');

  // 1.1: Negative collected_amount
  let rejectedNegCollected = false;
  try {
    await sql`
      INSERT INTO orders (
        order_number, account_id, customer_name_snap, customer_phone_snap, delivery_address_snap,
        subtotal, total, status, payment_method, collected_amount
      ) VALUES (
        'CHK-NEG-COL', ${customer.id}, 'علي', '07701122334', 'بغداد',
        10000, 10000, 'pending', 'cod', -500
      )
    `;
  } catch (err) {
    rejectedNegCollected = err.message.includes('chk_orders_collected_amount_non_negative') || err.code === '23514';
  }
  assert(rejectedNegCollected, 'PostgreSQL rejected negative collected_amount via chk_orders_collected_amount_non_negative');

  // 1.2: Negative remaining_debt_amount
  let rejectedNegDebt = false;
  try {
    await sql`
      INSERT INTO orders (
        order_number, account_id, customer_name_snap, customer_phone_snap, delivery_address_snap,
        subtotal, total, status, payment_method, remaining_debt_amount
      ) VALUES (
        'CHK-NEG-DEBT', ${customer.id}, 'علي', '07701122334', 'بغداد',
        10000, 10000, 'pending', 'cod', -100
      )
    `;
  } catch (err) {
    rejectedNegDebt = err.message.includes('chk_orders_remaining_debt_amount_non_negative') || err.code === '23514';
  }
  assert(rejectedNegDebt, 'PostgreSQL rejected negative remaining_debt_amount via chk_orders_remaining_debt_amount_non_negative');

  // 1.3: Negative delivery_fee
  let rejectedNegFee = false;
  try {
    await sql`
      INSERT INTO orders (
        order_number, account_id, customer_name_snap, customer_phone_snap, delivery_address_snap,
        subtotal, total, status, payment_method, delivery_fee
      ) VALUES (
        'CHK-NEG-FEE', ${customer.id}, 'علي', '07701122334', 'بغداد',
        10000, 10000, 'pending', 'cod', -2500
      )
    `;
  } catch (err) {
    rejectedNegFee = err.message.includes('chk_orders_delivery_fee_non_negative') || err.code === '23514';
  }
  assert(rejectedNegFee, 'PostgreSQL rejected negative delivery_fee via chk_orders_delivery_fee_non_negative');

  // 1.4: Invalid collection_status
  let rejectedBadCollection = false;
  try {
    await sql`
      INSERT INTO orders (
        order_number, account_id, customer_name_snap, customer_phone_snap, delivery_address_snap,
        subtotal, total, status, payment_method, collection_status
      ) VALUES (
        'CHK-BAD-COLL', ${customer.id}, 'علي', '07701122334', 'بغداد',
        10000, 10000, 'pending', 'cod', 'stolen_cash'
      )
    `;
  } catch (err) {
    rejectedBadCollection = err.message.includes('chk_orders_collection_status') || err.code === '23514';
  }
  assert(rejectedBadCollection, 'PostgreSQL rejected invalid collection_status string via chk_orders_collection_status');

  // 1.5: Invalid delivery_sub_state
  let rejectedBadSubState = false;
  try {
    await sql`
      INSERT INTO orders (
        order_number, account_id, customer_name_snap, customer_phone_snap, delivery_address_snap,
        subtotal, total, status, payment_method, delivery_sub_state
      ) VALUES (
        'CHK-BAD-SUB', ${customer.id}, 'علي', '07701122334', 'بغداد',
        10000, 10000, 'pending', 'cod', 'driver_lost_in_space'
      )
    `;
  } catch (err) {
    rejectedBadSubState = err.message.includes('chk_orders_delivery_sub_state') || err.code === '23514';
  }
  assert(rejectedBadSubState, 'PostgreSQL rejected invalid delivery_sub_state via chk_orders_delivery_sub_state');

  /* =========================================================================
     [Test 2] F2: State Machine Transition (pending -> start delivery = REJECTED)
     ========================================================================= */
  console.log('\n[Test 2] Testing F2: pgStartDriverDelivery enforces processing state...');
  const order1 = await pgCreateOrder({
    customer: {
      name: 'علي التميمي',
      phone: '07701122334',
      city: 'بغداد',
      address: 'حي الكرادة - شارع 14',
    },
    items: [{ productId: prodA.id, quantity: 2 }],
    status: 'pending',
  });

  // Assign driver without auto-advancing (or manually keep pending to test guard)
  await db.update(orders).set({ driverId: driverA.id, status: 'pending' }).where(eq(orders.id, order1.id));

  let startPendingRejected = false;
  try {
    await pgStartDriverDelivery(driverA.id, order1.id, driverAOp);
  } catch (err) {
    startPendingRejected = err.message.includes('لا تسمح ببدء التوصيل') && err.message.includes('processing');
  }
  assert(startPendingRejected, 'pgStartDriverDelivery strictly rejected starting delivery from pending status');

  // Advance order to processing
  await db.update(orders).set({ status: 'processing' }).where(eq(orders.id, order1.id));

  // Now start delivery succeeds
  const shippedOrder1 = await pgStartDriverDelivery(driverA.id, order1.id, driverAOp);
  assert(shippedOrder1.status === 'shipped', 'Order transitioned from processing to shipped successfully');
  assert(shippedOrder1.deliverySubState === 'out_for_delivery', 'deliverySubState correctly set to out_for_delivery');

  // Idempotency check: Calling startDelivery again returns current order
  const shippedOrder1Idempotent = await pgStartDriverDelivery(driverA.id, order1.id, driverAOp);
  assert(shippedOrder1Idempotent.status === 'shipped', 'Idempotent call to pgStartDriverDelivery succeeded');

  /* =========================================================================
     [Test 3] F3: Unassigning driver does not downgrade processing to pending
     ========================================================================= */
  console.log('\n[Test 3] Testing F3: Driver unassignment preserves processing state...');
  const order2 = await pgCreateOrder({
    customer: {
      name: 'علي التميمي',
      phone: '07701122334',
      city: 'بغداد',
      address: 'حي الجامعة',
    },
    items: [{ productId: prodA.id, quantity: 3 }],
    status: 'processing',
  });

  // Assign driver A
  await pgAssignOrderDriver({
    orderId: order2.id,
    driverId: driverA.id,
    adminOperator: { username: 'admin', role: 'admin' },
  });

  // Unassign driver A
  const unassignedOrder2 = await pgAssignOrderDriver({
    orderId: order2.id,
    driverId: null,
    adminOperator: { username: 'admin', role: 'admin' },
  });
  assert(unassignedOrder2.status === 'processing', 'Unassigning driver kept status as processing (did NOT revert to pending)');
  assert(unassignedOrder2.driverId === undefined || unassignedOrder2.driverId === null, 'Driver ID cleared successfully');

  // Try to unassign a shipped order -> REJECTED
  let unassignShippedRejected = false;
  try {
    await pgAssignOrderDriver({
      orderId: order1.id,
      driverId: null,
      adminOperator: { username: 'admin', role: 'admin' },
    });
  } catch (err) {
    unassignShippedRejected = err.message.includes('لا يمكن إلغاء الإسناد قبل إرجاعها للمستودع');
  }
  assert(unassignShippedRejected, 'Cannot unassign driver from a shipped order without warehouse return');

  /* =========================================================================
     [Test 4] F1: Failed Delivery Attempt (Remains shipped, zero restock)
     ========================================================================= */
  console.log('\n[Test 4] Testing F1: Failed Delivery Attempt...');
  const [prodBeforeFail] = await db.select().from(products).where(eq(products.id, prodA.id));
  const stockBeforeFail = Number(prodBeforeFail.currentStockPieces);

  const failedOrder1 = await pgFailDriverDelivery(driverA.id, order1.id, driverAOp, {
    reason: 'customer_unreachable',
    notes: 'الهاتف مغلق منذ ساعتين',
  });

  assert(failedOrder1.status === 'shipped', 'Order status remains shipped after delivery failure (NOT processing)');
  assert(failedOrder1.deliverySubState === 'delivery_failed', 'deliverySubState correctly set to delivery_failed');
  assert(failedOrder1.inventoryRestored === false, 'inventoryRestored remains false');
  assert(failedOrder1.collectionStatus === 'pending', 'collectionStatus remains pending (NOT returned)');
  assert(failedOrder1.collectedAmount === 0, 'collectedAmount remains 0.00');

  const [prodAfterFail] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(prodAfterFail.currentStockPieces) === stockBeforeFail, 'Warehouse stock remained unchanged (ZERO phantom restock)');

  /* =========================================================================
     [Test 5] Retry Delivery after failure -> Delivered with PIN
     ========================================================================= */
  console.log('\n[Test 5] Testing Retry Delivery after failure...');
  // Customer calls back, driver delivers with customer PIN
  const [order1Db] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${order1.id}`;
  const pin1 = decryptPin(order1Db.delivery_pin_encrypted);

  const deliveredOrder1 = await pgDeliverDriverOrder(
    driverA.id,
    order1.id,
    driverAOp,
    { collectionStatus: 'collected_cash', deliveryPin: pin1, notes: 'تمت المحاولة الثانية بنجاح' }
  );
  assert(deliveredOrder1.status === 'delivered', 'Order successfully transitioned to delivered upon retry');
  assert(deliveredOrder1.collectedAmount === deliveredOrder1.total, 'Cash collected registered correctly');
  assert(deliveredOrder1.driverCashSettled === false, 'Driver cash custody is active');

  /* =========================================================================
     [Test 6] Driver Return Request (ZERO inventory restock, custody on driver)
     ========================================================================= */
  console.log('\n[Test 6] Testing Driver Return Request...');
  const order3 = await pgCreateOrder({
    customer: {
      name: 'علي التميمي',
      phone: '07701122334',
      city: 'بغداد',
      address: 'حي الكرادة',
    },
    items: [{ productId: prodA.id, quantity: 10 }], // 10 pieces
    status: 'processing',
  });

  await pgAssignOrderDriver({
    orderId: order3.id,
    driverId: driverA.id,
    adminOperator: { username: 'admin', role: 'admin' },
  });
  await pgStartDriverDelivery(driverA.id, order3.id, driverAOp);

  const [prodBeforeRetReq] = await db.select().from(products).where(eq(products.id, prodA.id));
  const stockBeforeRetReq = Number(prodBeforeRetReq.currentStockPieces);

  // Driver taps "Return to Warehouse"
  const returnReqOrder3 = await pgReturnDriverOrder(driverA.id, order3.id, driverAOp, {
    reason: 'العميل رفض استلام الشحنة عند الباب',
  });

  assert(returnReqOrder3.status === 'shipped', 'Order remains shipped (physical custody in transit)');
  assert(returnReqOrder3.deliverySubState === 'return_requested', 'deliverySubState set to return_requested');
  assert(returnReqOrder3.driverId === driverA.id, 'Driver custody preserved on Driver A');
  assert(returnReqOrder3.inventoryRestored === false, 'inventoryRestored is strictly false');

  const [prodAfterRetReq] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(prodAfterRetReq.currentStockPieces) === stockBeforeRetReq, 'Warehouse stock did NOT increase on driver return request');

  // Idempotency: Driver taps return again
  const returnReqOrder3Idempotent = await pgReturnDriverOrder(driverA.id, order3.id, driverAOp);
  assert(returnReqOrder3Idempotent.deliverySubState === 'return_requested', 'Idempotent driver return request returned existing state');

  /* =========================================================================
     [Test 7] Warehouse Physical Check-in (Restock exactly once, driver freed)
     ========================================================================= */
  console.log('\n[Test 7] Testing Physical Warehouse Check-in...');
  const checkedInOrder3 = await pgConfirmWarehouseReturnReceipt(order3.id, adminOp, {
    notes: 'تم فحص الصندوق واستلام 10 قطع سليمة',
  });

  assert(checkedInOrder3.status === 'cancelled', 'Order status moved to cancelled terminal state');
  assert(checkedInOrder3.deliverySubState === 'warehouse_received', 'deliverySubState set to warehouse_received');
  assert(checkedInOrder3.inventoryRestored === true, 'inventoryRestored set to true');
  assert(checkedInOrder3.driverId === undefined || checkedInOrder3.driverId === null, 'Driver custody released upon warehouse receipt');

  const [prodAfterCheckIn] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(prodAfterCheckIn.currentStockPieces) === stockBeforeRetReq + 10, 'Stock restored by exactly 10 pieces');

  // Verify inventory movement
  const [move] = await db
    .select()
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.referenceId, order3.id), eq(inventoryMovements.movementType, 'order_cancellation')));
  assert(move !== undefined && move.quantityPieces === 10, 'Inventory movement created for 10 pieces inflow');

  // Double Check-in (Idempotent test)
  const doubleCheckInOrder3 = await pgConfirmWarehouseReturnReceipt(order3.id, adminOp);
  assert(doubleCheckInOrder3.inventoryRestored === true, 'Double check-in safely handled');
  const [prodAfterDoubleCheckIn] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(prodAfterDoubleCheckIn.currentStockPieces) === stockBeforeRetReq + 10, 'Double check-in caused ZERO duplicate stock addition');

  /* =========================================================================
     [Test 8] Admin Cancellation while Order is with Driver (NO Phantom Restock)
     ========================================================================= */
  console.log('\n[Test 8] Testing Commercial Cancellation while goods are with Driver...');
  const order4 = await pgCreateOrder({
    customer: {
      name: 'علي التميمي',
      phone: '07701122334',
      city: 'بغداد',
      address: 'حي الكرادة',
    },
    items: [{ productId: prodA.id, quantity: 15 }], // 15 pieces
    status: 'processing',
  });

  await pgAssignOrderDriver({
    orderId: order4.id,
    driverId: driverA.id,
    adminOperator: { username: 'admin', role: 'admin' },
  });
  await pgStartDriverDelivery(driverA.id, order4.id, driverAOp);

  const [prodBeforeCancel] = await db.select().from(products).where(eq(products.id, prodA.id));
  const stockBeforeCancel = Number(prodBeforeCancel.currentStockPieces);

  // Admin cancels order while shipped with driver
  const cancelledOrder4 = await pgCancelOrder(order4.id, {
    reason: 'إلغاء الطلب من الإدارة بسبب خطأ تسعير',
    operator: adminOp,
  });

  assert(cancelledOrder4.status === 'cancelled', 'Commercial status moved to cancelled');
  assert(cancelledOrder4.inventoryRestored === false, 'inventoryRestored is strictly false (goods in transit)');
  assert(cancelledOrder4.deliverySubState === 'return_requested', 'deliverySubState flagged as return_requested');
  assert(cancelledOrder4.driverId === driverA.id, 'Driver custody preserved on Driver A until returned');

  const [prodAfterCancel] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(prodAfterCancel.currentStockPieces) === stockBeforeCancel, 'ZERO phantom restock on cancelling shipped order!');

  // Now driver brings goods back to warehouse -> Warehouse Check-in restocks
  const checkedInOrder4 = await pgConfirmWarehouseReturnReceipt(order4.id, adminOp, {
    notes: 'استلام البضاعة بعد إلغاء الإدارة',
  });
  assert(checkedInOrder4.inventoryRestored === true, 'inventoryRestored is now true after warehouse check-in');
  assert(checkedInOrder4.driverId === undefined || checkedInOrder4.driverId === null, 'Driver custody released');
  const [prodFinal4] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(prodFinal4.currentStockPieces) === stockBeforeCancel + 15, 'Stock restored by exactly 15 pieces upon physical warehouse check-in');

  /* =========================================================================
     [Test 9] Driver Isolation (Driver B cannot touch Driver A's order)
     ========================================================================= */
  console.log('\n[Test 9] Testing Driver Isolation...');
  const order5 = await pgCreateOrder({
    customer: {
      name: 'علي التميمي',
      phone: '07701122334',
      city: 'بغداد',
      address: 'حي الكرادة',
    },
    items: [{ productId: prodA.id, quantity: 5 }],
    status: 'processing',
  });

  await pgAssignOrderDriver({
    orderId: order5.id,
    driverId: driverA.id,
    adminOperator: { username: 'admin', role: 'admin' },
  });
  await pgStartDriverDelivery(driverA.id, order5.id, driverAOp);

  let driverBStartRejected = false;
  try {
    await pgStartDriverDelivery(driverB.id, order5.id, driverBOp);
  } catch (err) {
    driverBStartRejected = err.message.includes('غير مسند إليك');
  }
  assert(driverBStartRejected, 'Driver B rejected from starting delivery for Driver A order');

  let driverBFailRejected = false;
  try {
    await pgFailDriverDelivery(driverB.id, order5.id, driverBOp, { reason: 'other' });
  } catch (err) {
    driverBFailRejected = err.message.includes('غير مسند إليك');
  }
  assert(driverBFailRejected, 'Driver B rejected from failing Driver A order');

  let driverBReturnRejected = false;
  try {
    await pgReturnDriverOrder(driverB.id, order5.id, driverBOp);
  } catch (err) {
    driverBReturnRejected = err.message.includes('غير مسند إليك');
  }
  assert(driverBReturnRejected, 'Driver B rejected from requesting return for Driver A order');

  /* =========================================================================
     [Test 10] Concurrency Stress: Double Check-in & Cancel + Check-in
     ========================================================================= */
  console.log('\n[Test 10] Testing Concurrency Stress...');
  const order6 = await pgCreateOrder({
    customer: {
      name: 'علي التميمي',
      phone: '07701122334',
      city: 'بغداد',
      address: 'حي الكرادة',
    },
    items: [{ productId: prodA.id, quantity: 8 }],
    status: 'processing',
  });
  await pgAssignOrderDriver({
    orderId: order6.id,
    driverId: driverA.id,
    adminOperator: { username: 'admin', role: 'admin' },
  });
  await pgStartDriverDelivery(driverA.id, order6.id, driverAOp);
  await pgReturnDriverOrder(driverA.id, order6.id, driverAOp);

  const [prodBeforeConc] = await db.select().from(products).where(eq(products.id, prodA.id));
  const stockBeforeConc = Number(prodBeforeConc.currentStockPieces);

  // Concurrent Double Check-in
  const [res1, res2] = await Promise.all([
    pgConfirmWarehouseReturnReceipt(order6.id, adminOp),
    pgConfirmWarehouseReturnReceipt(order6.id, adminOp),
  ]);
  assert(res1.inventoryRestored && res2.inventoryRestored, 'Both concurrent check-in promises resolved cleanly');
  const [prodAfterConc] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(prodAfterConc.currentStockPieces) === stockBeforeConc + 8, 'Concurrent double check-in restored stock EXACTLY ONCE (8 pieces)');

  // Concurrent Cancel + Check-in
  const order7 = await pgCreateOrder({
    customer: {
      name: 'علي التميمي',
      phone: '07701122334',
      city: 'بغداد',
      address: 'حي الكرادة',
    },
    items: [{ productId: prodA.id, quantity: 12 }],
    status: 'processing',
  });
  await pgAssignOrderDriver({
    orderId: order7.id,
    driverId: driverA.id,
    adminOperator: { username: 'admin', role: 'admin' },
  });
  await pgStartDriverDelivery(driverA.id, order7.id, driverAOp);

  const [prodBeforeConc2] = await db.select().from(products).where(eq(products.id, prodA.id));
  const stockBeforeConc2 = Number(prodBeforeConc2.currentStockPieces);

  await Promise.all([
    pgCancelOrder(order7.id, { operator: adminOp }),
    pgConfirmWarehouseReturnReceipt(order7.id, adminOp),
  ]);

  const [prodAfterConc2] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(prodAfterConc2.currentStockPieces) === stockBeforeConc2 + 12, 'Concurrent cancel + check-in restored stock EXACTLY ONCE (12 pieces)');

  /* =========================================================================
     [Test 11] Post-delivery Customer Return remains intact
     ========================================================================= */
  console.log('\n[Test 11] Testing Post-delivery Customer Return...');
  const order8 = await pgCreateOrder({
    customer: {
      name: 'علي التميمي',
      phone: '07701122334',
      city: 'بغداد',
      address: 'حي الكرادة',
    },
    items: [{ productId: prodA.id, quantity: 4 }],
    status: 'processing',
  });
  await pgAssignOrderDriver({
    orderId: order8.id,
    driverId: driverA.id,
    adminOperator: { username: 'admin', role: 'admin' },
  });
  await pgStartDriverDelivery(driverA.id, order8.id, driverAOp);
  const [order8Db] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${order8.id}`;
  const pin8 = decryptPin(order8Db.delivery_pin_encrypted);

  await pgDeliverDriverOrder(driverA.id, order8.id, driverAOp, {
    collectionStatus: 'collected_cash',
    deliveryPin: pin8,
  });

  const [prodBeforeCustRet] = await db.select().from(products).where(eq(products.id, prodA.id));
  const stockBeforeCustRet = Number(prodBeforeCustRet.currentStockPieces);

  const custRetOrder = await pgReturnOrder(order8.id, {
    reason: 'إرجاع بضاعة من قبل العميل بعد الاستلام لعدم المطابقة',
    operator: adminOp,
  });

  assert(custRetOrder.status === 'returned', 'Order status moved to returned for customer return');
  assert(custRetOrder.collectionStatus === 'returned', 'collectionStatus moved to returned');
  assert(custRetOrder.inventoryRestored === true, 'inventoryRestored set to true');
  assert(custRetOrder.refundStatus === 'pending', 'refundStatus set to pending for refund processing');

  const [prodAfterCustRet] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(prodAfterCustRet.currentStockPieces) === stockBeforeCustRet + 4, 'Stock restored by 4 pieces on post-delivery customer return');

  /* =========================================================================
     [Test 12] Driver Cash Custody & Settlement Non-Regression (2C4B)
     ========================================================================= */
  console.log('\n[Test 12] Testing Driver Cash Custody & Settlement Non-Regression (2C4B)...');
  const custodyA = await pgGetDriverCustody(driverA.id);
  assert(custodyA !== null, 'Driver A custody retrieved');

  // Order 1 and Order 8 were delivered with cash (20,000 + 40,000 = 60,000 IQD).
  // 2C4B Decoupled Guarantee: Customer return after delivery does NOT drop driver cash custody before settlement!
  // Pre-delivery failed/returned orders (order3, order4, order6, order7) had collectedAmount=0, so not in custody.
  const expectedCustody = deliveredOrder1.total + custRetOrder.total;
  assert(custodyA.totalCollectedCash === expectedCustody, `Custody accurately reflects collected cash ($60,000 IQD) and preserves 2C4B decoupled guarantee: ${custodyA.totalCollectedCash} IQD`);

  console.log('\n======================================================');
  console.log('✅ ALL COMMERCE-2C4C TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');

  await stopDatabase();
}

runTests().catch(async (err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  await stopDatabase();
  process.exit(1);
});
