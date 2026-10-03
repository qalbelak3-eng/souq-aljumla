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
  validateOrderTransition,
  VALID_ORDER_TRANSITIONS,
} from './src/lib/postgres-orders.ts';
import { pgCreateProduct, pgCreateCategory } from './src/lib/postgres-catalog.ts';
import {
  pgCreateCoupon,
  pgValidateCoupon,
  pgGetCouponByCode,
} from './src/lib/postgres-coupons.ts';
import {
  pgGetAccountCashbackBalance,
  pgGetCustomerCashbackSummary,
  pgResolveCustomerAccount,
} from './src/lib/postgres-cashback.ts';
import { toCanonicalIraqiPhone } from './src/lib/phone-utils.ts';
import { getDb } from './src/db/client.ts';
import { financialAccounts } from './src/db/schema/accounts.ts';
import { cashbackLedger } from './src/db/schema/accounting.ts';
import { eq } from 'drizzle-orm';

const Ep = EpDefault.default || EpDefault;
const PORT = 54361;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2c3_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '10';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2c3-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2c3-test-secret-min-32-chars-long';

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

  console.log('2. Applying schema and migrations (0000 -> 0017)...');
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

async function createTestOrder(input) {
  return pgCreateOrder({
    createAccountIfMissing: true,
    ...input,
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('Running Commerce-2C3 Lifecycle & Reversals Suite');
  console.log('======================================================\n');

  // Seed sample category and products
  const testCat = await pgCreateCategory({
    name: 'قسم اختبار Commerce-2C3',
    orderIndex: 1,
  });

  const prod1 = await pgCreateProduct({
    name: 'منتج تجريبي 2C3 أ',
    category: testCat.id,
    price: 10000,
    costPrice: 6000,
    stock: 500,
    unit: 'piece',
    unitLabel: 'قطعة',
  });

  const prod2 = await pgCreateProduct({
    name: 'منتج تجريبي 2C3 ب',
    category: testCat.id,
    price: 25000,
    costPrice: 15000,
    stock: 200,
    unit: 'box',
    unitLabel: 'علبة',
    itemsPerBox: 12,
  });


  // Test 1: State Machine Valid Transitions (pending -> processing -> shipped -> delivered -> returned)
  console.log('\n[Test 1] Testing Valid State Transitions: pending -> processing -> shipped -> delivered -> returned');
  const order1 = await createTestOrder({
    customer: {
      name: 'علي حسن السعدي',
      phone: '07701234567',
      address: 'بغداد - الكرادة',
      accountType: 'retail',
    },
    items: [
      {
        productId: prod1.id,
        name: prod1.name,
        price: 10000,
        quantity: 2,
        saleType: 'piece',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
  });
  assert(order1.status === 'pending', 'Order created with pending status');

  const afterProcessing = await pgUpdateOrderStatus(order1.id, 'processing');
  assert(afterProcessing.status === 'processing', 'Transitioned pending -> processing');

  const afterShipped = await pgUpdateOrderStatus(order1.id, 'shipped');
  assert(afterShipped.status === 'shipped', 'Transitioned processing -> shipped');

  const afterDelivered = await pgUpdateOrderStatus(order1.id, 'delivered');
  assert(afterDelivered.status === 'delivered', 'Transitioned shipped -> delivered');

  const afterReturned = await pgUpdateOrderStatus(order1.id, 'returned', { cancellationReason: 'طلب الزبون استرجاع المنتج' });
  assert(afterReturned.status === 'returned', 'Transitioned delivered -> returned');
  assert(afterReturned.collectionStatus === 'returned', 'Order collectionStatus marked returned');

  // Test 2: Invalid State Transitions (Backward and Jump Transitions)
  console.log('\n[Test 2] Testing Invalid State Transitions Rejections');
  // Order 1 is now 'returned' (terminal). Try modifying it:
  let errThrown = false;
  try {
    await pgUpdateOrderStatus(order1.id, 'delivered');
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('حالة نهائية'), 'returned -> delivered rejected as terminal state');
  }
  assert(errThrown, 'Modifying returned order was strictly blocked');

  try {
    errThrown = false;
    await pgUpdateOrderStatus(order1.id, 'processing');
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('حالة نهائية'), 'returned -> processing rejected as terminal state');
  }
  assert(errThrown, 'Modifying returned order to processing was blocked');

  // Create a new order to test invalid jumps and backwards transitions
  const order2 = await createTestOrder({
    customer: {
      name: 'حسين جاسم',
      phone: '07801234567',
      address: 'البصرة - العشار',
      accountType: 'retail',
    },
    items: [
      {
        productId: prod1.id,
        name: prod1.name,
        price: 10000,
        quantity: 1,
        saleType: 'piece',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
  });

  // Jump pending -> delivered is forbidden
  try {
    errThrown = false;
    await pgUpdateOrderStatus(order2.id, 'delivered');
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('الانتقال غير مسموح'), 'pending -> delivered jump was rejected');
  }
  assert(errThrown, 'pending -> delivered jump correctly failed');

  // Jump pending -> returned is forbidden
  try {
    errThrown = false;
    await pgUpdateOrderStatus(order2.id, 'returned');
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('الانتقال غير مسموح') || e.message.includes('delivered'), 'pending -> returned jump was rejected');
  }
  assert(errThrown, 'pending -> returned jump correctly failed');

  // Move to processing, then try to jump to delivered
  await pgUpdateOrderStatus(order2.id, 'processing');
  try {
    errThrown = false;
    await pgUpdateOrderStatus(order2.id, 'delivered');
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('الانتقال غير مسموح'), 'processing -> delivered jump was rejected');
  }
  assert(errThrown, 'processing -> delivered jump correctly failed');

  // Move to shipped, then delivered
  await pgUpdateOrderStatus(order2.id, 'shipped');
  await pgUpdateOrderStatus(order2.id, 'delivered');

  // delivered -> processing backwards transition is strictly forbidden
  try {
    errThrown = false;
    await pgUpdateOrderStatus(order2.id, 'processing');
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('الانتقال غير مسموح'), 'delivered -> processing backwards transition was rejected');
  }
  assert(errThrown, 'delivered -> processing backwards transition correctly failed');

  // Test 3: Cancellation from pending / processing / shipped
  console.log('\n[Test 3] Testing Valid Cancellations from pending, processing, shipped');
  const orderCancel1 = await createTestOrder({
    customer: { name: 'عمار ياسر', phone: '07501112233', address: 'أربيل', accountType: 'retail' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  const c1 = await pgCancelOrder(orderCancel1.id, { reason: 'إلغاء من pending' });
  assert(c1.status === 'cancelled', 'Cancelled from pending successfully');

  const orderCancel2 = await createTestOrder({
    customer: { name: 'عمار ياسر 2', phone: '07501112234', address: 'أربيل', accountType: 'retail' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  await pgUpdateOrderStatus(orderCancel2.id, 'processing');
  const c2 = await pgCancelOrder(orderCancel2.id, { reason: 'إلغاء من processing' });
  assert(c2.status === 'cancelled', 'Cancelled from processing successfully');

  const orderCancel3 = await createTestOrder({
    customer: { name: 'عمار ياسر 3', phone: '07501112235', address: 'أربيل', accountType: 'retail' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  await pgUpdateOrderStatus(orderCancel3.id, 'processing');
  await pgUpdateOrderStatus(orderCancel3.id, 'shipped');
  const c3 = await pgCancelOrder(orderCancel3.id, { reason: 'إلغاء من shipped' });
  assert(c3.status === 'cancelled', 'Cancelled from shipped successfully');

  // cancelled -> delivered is strictly forbidden
  try {
    errThrown = false;
    await pgUpdateOrderStatus(orderCancel1.id, 'delivered');
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('حالة نهائية'), 'cancelled -> delivered was rejected');
  }
  assert(errThrown, 'cancelled -> delivered correctly blocked');

  // Test 4: Double Cancel & Double Return Idempotency & Audit Dedup
  console.log('\n[Test 4] Testing Double Cancel & Double Return Idempotency (Zero duplicate audit logs)');
  const auditLogsBeforeCancel = await sql`SELECT count(*) FROM audit_logs WHERE target_id = ${orderCancel1.id} AND action_type = 'order_cancelled'`;
  const doubleCancelResult = await pgCancelOrder(orderCancel1.id, { reason: 'محاولة إلغاء ثانية' });
  assert(doubleCancelResult.status === 'cancelled', 'Double cancel returned cancelled order idempotently');
  const auditLogsAfterCancel = await sql`SELECT count(*) FROM audit_logs WHERE target_id = ${orderCancel1.id} AND action_type = 'order_cancelled'`;
  assert(Number(auditLogsBeforeCancel[0].count) === Number(auditLogsAfterCancel[0].count), 'Zero duplicate audit logs on repeated cancellation');

  const auditLogsBeforeReturn = await sql`SELECT count(*) FROM audit_logs WHERE target_id = ${order1.id} AND action_type = 'order_returned'`;
  const doubleReturnResult = await pgReturnOrder(order1.id, { reason: 'محاولة إرجاع ثانية' });
  assert(doubleReturnResult.status === 'returned', 'Double return returned returned order idempotently');
  const auditLogsAfterReturn = await sql`SELECT count(*) FROM audit_logs WHERE target_id = ${order1.id} AND action_type = 'order_returned'`;
  assert(Number(auditLogsBeforeReturn[0].count) === Number(auditLogsAfterReturn[0].count), 'Zero duplicate audit logs on repeated return');

  // Test 5: Exact Stock Restoration based on Historical baseQuantityDeducted
  console.log('\n[Test 5] Testing Exact Stock Restoration using baseQuantityDeducted');
  const initialStockRow = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod2.id}`;
  const initialStock = Number(initialStockRow[0].current_stock_pieces);

  // Buy 2 boxes of prod2 (each box has 12 items = 24 base pieces deducted)
  const stockOrder = await createTestOrder({
    customer: { name: 'أحمد مخزون', phone: '07709876543', address: 'بغداد' },
    items: [{
      productId: prod2.id,
      name: prod2.name,
      price: 25000,
      quantity: 2,
      saleType: 'box',
      unitLabel: 'علبة',
      image: '',
    }],
  });

  const stockAfterOrder = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod2.id}`;
  assert(Number(stockAfterOrder[0].current_stock_pieces) === initialStock - 24, '24 pieces deducted on order creation');

  // Now cancel the order
  await pgCancelOrder(stockOrder.id, { reason: 'فحص استرجاع المخزون' });
  const stockAfterCancel = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prod2.id}`;
  assert(Number(stockAfterCancel[0].current_stock_pieces) === initialStock, 'Exactly 24 pieces restored using baseQuantityDeducted snapshot');

  // Test 6: Coupon Redemption Release on Cancellation & Reuse
  console.log('\n[Test 6] Testing Coupon Redemption Release on Pre-Delivery Cancellation (perCustomerLimit=1)');
  const couponCode = 'LIFECYCLE-ONE-' + Date.now();
  await pgCreateCoupon({
    code: couponCode,
    discountType: 'fixed',
    discountValue: 5000,
    minOrderAmount: 10000,
    perCustomerLimit: 1,
    isActive: true,
  });

  const customerPhone = '07711223344';
  const couponOrder1 = await createTestOrder({
    customer: { name: 'سعدون جابر', phone: customerPhone, address: 'بغداد' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
    couponCode: couponCode,
  });
  assert(Number(couponOrder1.discount) === 5000, 'Coupon discount applied to order 1');

  // Second order with same coupon must be rejected due to perCustomerLimit=1
  try {
    errThrown = false;
    await createTestOrder({
      customer: { name: 'سعدون جابر', phone: customerPhone, address: 'بغداد' },
      items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
      couponCode: couponCode,
    });
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('الحد الأقصى'), 'Second order with same coupon rejected due to perCustomerLimit=1');
  }
  assert(errThrown, 'perCustomerLimit=1 strictly enforced while order 1 is pending');

  // Cancel order 1 -> coupon redemption must be released
  await pgCancelOrder(couponOrder1.id, { reason: 'إلغاء لإعادة استخدام الكوبون' });

  // Verify redemption record status is 'released'
  const redemptionRows = await sql`SELECT status, released_at FROM coupon_redemptions WHERE order_id = ${couponOrder1.id}`;
  assert(redemptionRows.length === 1, 'Coupon redemption history preserved in DB');
  assert(redemptionRows[0].status === 'released', 'Coupon redemption status changed to released');
  assert(redemptionRows[0].released_at !== null, 'Coupon redemption released_at timestamp recorded');

  // Verify usage_count was decremented
  const couponState = await pgGetCouponByCode(couponCode);
  assert(couponState.usageCount === 0, 'Coupon usage_count decremented to 0');

  // Now create order 2 with the same coupon -> MUST SUCCEED!
  const couponOrder2 = await createTestOrder({
    customer: { name: 'سعدون جابر', phone: customerPhone, address: 'بغداد' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
    couponCode: couponCode,
  });
  assert(couponOrder2.id !== couponOrder1.id, 'Order 2 successfully created with reused coupon');
  assert(Number(couponOrder2.discount) === 5000, 'Coupon discount applied to order 2 after order 1 cancellation');

  // Test 7: Post-Delivery Return Does NOT Release Coupon
  console.log('\n[Test 7] Testing Post-Delivery Return Does NOT Release Coupon');
  await pgUpdateOrderStatus(couponOrder2.id, 'processing');
  await pgUpdateOrderStatus(couponOrder2.id, 'shipped');
  await pgUpdateOrderStatus(couponOrder2.id, 'delivered');
  await pgReturnOrder(couponOrder2.id, { reason: 'إرجاع بعد التسليم' });

  const postDeliveryRedemption = await sql`SELECT status FROM coupon_redemptions WHERE order_id = ${couponOrder2.id}`;
  assert(postDeliveryRedemption[0].status === 'active', 'Post-delivery return does NOT release coupon redemption (remains active)');

  // Test 8: Cashback Reversals (Earned -> Delivered, Reversed -> Cancel, Clawback -> Return)
  console.log('\n[Test 8] Testing Cashback Lifecycle & Financial Reversals');
  // Order with earned cashback
  const cbOrder = await createTestOrder({
    customer: { name: 'مريم كريم', phone: '07812345678', address: 'النجف' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 5, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  // Total = 50,000 IQD. Set earned_cashback for test
  await sql`UPDATE orders SET earned_cashback = '2500.00' WHERE id = ${cbOrder.id}`;
  await pgUpdateOrderStatus(cbOrder.id, 'processing');
  await pgUpdateOrderStatus(cbOrder.id, 'shipped');
  await pgUpdateOrderStatus(cbOrder.id, 'delivered');

  const earnedRows = await sql`SELECT amount FROM cashback_ledger WHERE order_id = ${cbOrder.id} AND type = 'earned'`;
  assert(earnedRows.length === 1, 'Earned cashback recorded upon delivery');
  assert(Number(earnedRows[0].amount) === 2500, 'Earned cashback amount is 2,500 IQD');

  // Return the order
  await pgReturnOrder(cbOrder.id, { reason: 'استرجاع الطلبية كاملة' });
  const clawbackRows = await sql`SELECT amount FROM cashback_ledger WHERE order_id = ${cbOrder.id} AND type = 'clawback'`;
  assert(clawbackRows.length === 1, 'Clawback record created in cashback_ledger');
  assert(Number(clawbackRows[0].amount) === Number(earnedRows[0].amount), 'Clawback amount exactly equals earned amount');

  // DB-Level Unique Index Test: Attempting duplicate clawback violates uq_cashback_ledger_order_clawback
  const [dbOrderRow] = await sql`SELECT account_id FROM orders WHERE id = ${cbOrder.id}`;
  try {
    errThrown = false;
    await sql`INSERT INTO cashback_ledger (account_id, type, amount, order_id) VALUES (${dbOrderRow.account_id}, 'clawback', '1000.00', ${cbOrder.id})`;
  } catch (e) {
    errThrown = true;
    assert(e.code === '23505' || e.message.includes('uq_cashback_ledger_order_clawback'), 'DB-level unique index uq_cashback_ledger_order_clawback prevented duplicate clawback');
  }
  assert(errThrown, 'Double clawback strictly blocked at PostgreSQL engine level');

  // Test 9: Cashback Deficit / Negative Balance Handling (No Phantom Money)
  console.log('\n[Test 9] Testing Cashback Deficit Handling When Balance Already Spent');
  const deficitCustomerPhone = '07733445566';
  // 1. Customer earns 10,000 IQD on Order A
  const orderA = await createTestOrder({
    customer: { name: 'جعفر الصادق', phone: deficitCustomerPhone, address: 'كربلاء' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  // Artificially inject earned cashback for this test
  await sql`UPDATE orders SET earned_cashback = '10000.00' WHERE id = ${orderA.id}`;
  await pgUpdateOrderStatus(orderA.id, 'processing');
  await pgUpdateOrderStatus(orderA.id, 'shipped');
  await pgUpdateOrderStatus(orderA.id, 'delivered');

  const custAccount = await pgResolveCustomerAccount({ phone: deficitCustomerPhone });
  const balAfterA = await pgGetAccountCashbackBalance(custAccount.id);
  assert(balAfterA >= 10000, 'Customer has at least 10,000 IQD available cashback');

  // 2. Customer spends 10,000 IQD on Order B
  const orderB = await createTestOrder({
    customer: { name: 'جعفر الصادق', phone: deficitCustomerPhone, address: 'كربلاء' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
    usedCashbackDiscount: 10000,
  });
  const balAfterB = await pgGetAccountCashbackBalance(custAccount.id);
  assert(balAfterB === 0, 'Customer spent all available cashback (balance = 0)');

  // 3. Now Order A is returned! System claws back 10,000 IQD
  const returnA = await pgReturnOrder(orderA.id, { reason: 'إرجاع بعد صرف الأرباح' });
  assert(returnA.status === 'returned', 'Order A returned successfully');

  // Check spendable balance: Must be 0 (no phantom positive money)
  const spendableBal = await pgGetAccountCashbackBalance(custAccount.id);
  assert(spendableBal === 0, 'Spendable cashback balance is 0 (no phantom cashback)');

  // Check summary: reports deficitBalance and netBalance
  const summary = await pgGetCustomerCashbackSummary({ accountId: custAccount.id });
  assert(summary.availableBalance === 0, 'Summary availableBalance is 0');
  assert(summary.deficitBalance >= 10000, 'Summary accurately reports customer deficit/debt balance');
  assert(summary.totalClawedBack >= 10000, 'Summary accurately reports totalClawedBack');

  // Customer cannot spend cashback while in deficit
  try {
    errThrown = false;
    await createTestOrder({
      customer: { name: 'جعفر الصادق', phone: deficitCustomerPhone, address: 'كربلاء' },
      items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
      usedCashbackDiscount: 2000,
    });
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('رصيد الأرباح'), 'Cannot redeem cashback with deficit balance');
  }
  assert(errThrown, 'Customer cannot redeem cashback while having a deficit');

  // Test 10: Concurrent Delivered vs Cancelled Race (Mutual Exclusivity)
  console.log('\n[Test 10] Testing Concurrent Delivered vs Cancelled Race (Mutual Exclusivity)');
  // Direction 1: Delivered and Cancelled run concurrently on a shipped order
  const raceOrder1 = await createTestOrder({
    customer: { name: 'سباق التزامن 1', phone: '07799887766', address: 'بغداد' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  await pgUpdateOrderStatus(raceOrder1.id, 'processing');
  await pgUpdateOrderStatus(raceOrder1.id, 'shipped');

  const [resDelivered, resCancelled] = await Promise.allSettled([
    pgUpdateOrderStatus(raceOrder1.id, 'delivered'),
    pgCancelOrder(raceOrder1.id, { reason: 'إلغاء متزامن' }),
  ]);

  const deliveredWon1 = resDelivered.status === 'fulfilled';
  const cancelledWon1 = resCancelled.status === 'fulfilled';

  assert(
    (deliveredWon1 && !cancelledWon1) || (!deliveredWon1 && cancelledWon1),
    `Exactly one transaction won the race! (Delivered won: ${deliveredWon1}, Cancelled won: ${cancelledWon1})`
  );

  const finalRace1 = await pgGetOrderById(raceOrder1.id);
  assert(
    finalRace1.status === 'delivered' || finalRace1.status === 'cancelled',
    `Final state is strictly consistent: ${finalRace1.status}`
  );

  // Direction 2: another race with reverse launch order
  const raceOrder2 = await createTestOrder({
    customer: { name: 'سباق التزامن 2', phone: '07799887765', address: 'بغداد' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  await pgUpdateOrderStatus(raceOrder2.id, 'processing');
  await pgUpdateOrderStatus(raceOrder2.id, 'shipped');

  const [resCancelled2, resDelivered2] = await Promise.allSettled([
    pgCancelOrder(raceOrder2.id, { reason: 'إلغاء متزامن 2' }),
    pgUpdateOrderStatus(raceOrder2.id, 'delivered'),
  ]);

  const cancelledWon2 = resCancelled2.status === 'fulfilled';
  const deliveredWon2 = resDelivered2.status === 'fulfilled';

  assert(
    (deliveredWon2 && !cancelledWon2) || (!deliveredWon2 && cancelledWon2),
    `Exactly one transaction won the race in reverse! (Delivered won: ${deliveredWon2}, Cancelled won: ${cancelledWon2})`
  );

  // Test 11: RBAC & Object-Level Authorization Checks
  console.log('\n[Test 11] Testing RBAC & Driver Object-Level Authorization');
  const driverOrder = await createTestOrder({
    customer: { name: 'زبون السائق', phone: '07755667788', address: 'بغداد' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  
  // Create valid driver in DB
  const [authIdent] = await sql`
    INSERT INTO auth_identities (phone, role, password_hash)
    VALUES ('07799990001', 'driver', 'fake_hash')
    RETURNING id;
  `;
  const [finAcc] = await sql`
    INSERT INTO financial_accounts (account_code, name, category, phone)
    VALUES ('DRV-ACC-001', 'السائق الأول', 'driver', '07799990001')
    RETURNING id;
  `;
  const [driverRow] = await sql`
    INSERT INTO drivers (auth_identity_id, financial_account_id, name, phone)
    VALUES (${authIdent.id}, ${finAcc.id}, 'السائق الأول', '07799990001')
    RETURNING id;
  `;

  const fakeDriverId2 = '00000000-0000-0000-0000-000000000002';
  await sql`UPDATE orders SET driver_id = ${driverRow.id}, status = 'shipped' WHERE id = ${driverOrder.id}`;

  // Driver 2 tries to cancel/return driver 1's order
  try {
    errThrown = false;
    await pgCancelOrder(driverOrder.id, { driverId: fakeDriverId2, reason: 'سائق غير مخول' });
  } catch (e) {
    errThrown = true;
    assert(e.message.includes('غير مسند إليك'), 'Driver cannot cancel an order assigned to a different driver');
  }
  assert(errThrown, 'Object-level driver check passed');

  // Test 12: Real PostgreSQL Concurrency Serialization (Return/Clawback vs Redeem on Same Account)
  console.log('\n[Test 12] Testing Concurrency Serialization (Return/Clawback vs Redeem on Same Financial Account)');
  
  // Case 12A: Clawback acquires lock first -> Redeem waits, reads new balance (0), and is rejected
  console.log('\n--- Case 12A: Clawback acquires lock first -> Redeem waits and rejects ---');
  const custPhone12A = '07788112233';
  const order12A = await createTestOrder({
    customer: { name: 'زبون التزامن 12A', phone: custPhone12A, address: 'بغداد' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  await sql`UPDATE orders SET earned_cashback = '10000.00' WHERE id = ${order12A.id}`;
  await pgUpdateOrderStatus(order12A.id, 'processing');
  await pgUpdateOrderStatus(order12A.id, 'shipped');
  await pgUpdateOrderStatus(order12A.id, 'delivered');

  const [db12A] = await sql`SELECT account_id FROM orders WHERE id = ${order12A.id}`;
  const accountId12A = db12A.account_id;

  const bal12ABefore = await pgGetAccountCashbackBalance(accountId12A);
  assert(bal12ABefore === 10000, 'Initial balance is exactly 10,000 IQD');

  const db = getDb();
  let redeemPromise12A = null;

  await db.transaction(async (txA) => {
    // 1. Transaction A starts return & clawback, which locks financial_accounts FOR UPDATE
    await pgReturnOrder(order12A.id, { reason: 'إرجاع واسترداد أولاً', tx: txA });

    // 2. While txA is still active and holding the lock, Transaction B attempts to create an order redeeming 10,000 IQD
    redeemPromise12A = createTestOrder({
      customer: { name: 'زبون التزامن 12A', phone: custPhone12A, address: 'بغداد' },
      items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
      usedCashbackDiscount: 10000,
      accountId: accountId12A,
    });

    // Small delay to ensure Transaction B has started and is waiting on the lock
    await new Promise((r) => setTimeout(r, 100));
  });

  // Now txA has committed. Await Transaction B
  let redeemError12A = null;
  try {
    await redeemPromise12A;
  } catch (err) {
    redeemError12A = err;
  }

  assert(Boolean(redeemError12A), 'Redeem was rejected cleanly because balance dropped to 0 while waiting for lock');
  assert(
    redeemError12A?.message.includes('رصيد الأرباح') || redeemError12A?.message.includes('0 د.ع'),
    'Redeem rejected with insufficient balance error: ' + redeemError12A?.message
  );

  const bal12AAfter = await pgGetAccountCashbackBalance(accountId12A);
  assert(bal12AAfter === 0, 'Final spendable balance is strictly 0 IQD (no double-spend)');
  const summary12A = await pgGetCustomerCashbackSummary({ accountId: accountId12A });
  assert(summary12A.deficitBalance === 0, 'No deficit created because Redeem was blocked');
  assert(summary12A.totalRedeemed === 0, 'Total redeemed is strictly 0');
  assert(summary12A.totalClawedBack === 10000, 'Total clawed back is 10,000');

  // Case 12B: Redeem acquires lock first -> Clawback waits, calculates deficitAmount from updated state, logs warning
  console.log('\n--- Case 12B: Redeem acquires lock first -> Clawback waits and calculates deficit ---');
  const custPhone12B = '07788112244';
  const order12B = await createTestOrder({
    customer: { name: 'زبون التزامن 12B', phone: custPhone12B, address: 'بغداد' },
    items: [{ productId: prod1.id, name: prod1.name, price: 10000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  await sql`UPDATE orders SET earned_cashback = '10000.00' WHERE id = ${order12B.id}`;
  await pgUpdateOrderStatus(order12B.id, 'processing');
  await pgUpdateOrderStatus(order12B.id, 'shipped');
  await pgUpdateOrderStatus(order12B.id, 'delivered');

  const [db12B] = await sql`SELECT account_id FROM orders WHERE id = ${order12B.id}`;
  const accountId12B = db12B.account_id;

  const bal12BBefore = await pgGetAccountCashbackBalance(accountId12B);
  assert(bal12BBefore === 10000, 'Initial balance is exactly 10,000 IQD');

  let clawbackPromise12B = null;

  await db.transaction(async (txB) => {
    // 1. Transaction B starts and locks financial_accounts FOR UPDATE
    await txB
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(eq(financialAccounts.id, accountId12B))
      .for('update');

    // Deduct/redeem 10,000 IQD in txB
    await txB.insert(cashbackLedger).values({
      accountId: accountId12B,
      type: 'redeemed',
      amount: '10000.00',
      notes: 'صرف الأرباح أولاً في معاملة متزامنة',
    });

    // 2. While txB is still holding the lock on financial_accounts, Transaction A attempts to return order12B
    clawbackPromise12B = pgReturnOrder(order12B.id, { reason: 'إرجاع متزامن بعد بدء الشراء' });

    // Small delay to ensure Transaction A has reached and is waiting on the lock
    await new Promise((r) => setTimeout(r, 100));
  });

  // Now txB has committed. Await Transaction A
  const returnRes12B = await clawbackPromise12B;
  assert(returnRes12B.status === 'returned', 'Clawback succeeded after waiting for Redeem lock');

  const bal12BAfter = await pgGetAccountCashbackBalance(accountId12B);
  assert(bal12BAfter === 0, 'Spendable balance is 0 (no phantom positive money)');
  const summary12B = await pgGetCustomerCashbackSummary({ accountId: accountId12B });
  assert(summary12B.netBalance === -10000, 'Summary accurately reflects customer deficit of -10,000 IQD');
  assert(summary12B.deficitBalance === 10000, 'Deficit balance is 10,000 IQD');
  assert(summary12B.totalRedeemed === 10000, 'Total redeemed is 10,000 IQD');
  assert(summary12B.totalClawedBack === 10000, 'Total clawed back is 10,000 IQD');

  // Verify Audit Log records accurate deficit and severity: warning
  const [auditClawbackRow] = await sql`
    SELECT action_type, financial_impact, severity 
    FROM audit_logs 
    WHERE target_id = ${order12B.id} AND action_type LIKE '%clawback%'
  `;
  assert(Boolean(auditClawbackRow), 'Audit log exists for clawback');
  assert(auditClawbackRow.severity === 'warning', 'Audit log severity is warning due to deficit');
  assert(Number(auditClawbackRow.financial_impact?.deficitAmount) === 10000, 'Audit log accurately records deficitAmount: 10,000 IQD');
  assert(auditClawbackRow.action_type === 'cashback_clawback_deficit', 'Audit log action_type is cashback_clawback_deficit');

  console.log('\n======================================================');
  console.log('✅ ALL COMMERCE-2C3 VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

async function main() {
  let exitCode = 0;
  try {
    await startDatabase();
    await runTests();
  } catch (err) {
    console.error('Test suite failed:', err);
    exitCode = 1;
  } finally {
    await stopDatabase();
  }
  process.exit(exitCode);
}

main();
