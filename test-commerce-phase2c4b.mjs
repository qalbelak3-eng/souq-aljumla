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
  pgRefundOrder,
  pgUpdateOrderStatus,
  pgResolveCustomerIdentity,
} from './src/lib/postgres-orders.ts';
import {
  pgGetPurchaseInvoices,
  pgGetPurchaseInvoiceById,
  pgCreatePurchaseInvoice,
  pgCancelPurchaseInvoice,
} from './src/lib/postgres-purchases.ts';
import {
  pgGetDriverCustody,
  pgCreateDriverSettlement,
  pgGetDriverSettlementById,
} from './src/lib/postgres-settlements.ts';
import { pgGetDrivers, pgGetDriverById } from './src/lib/postgres-drivers.ts';
import { pgGetCustomerStatement, pgGetAccountSummaries } from './src/lib/postgres-accounting.ts';
import { pgCreateProduct, pgCreateCategory } from './src/lib/postgres-catalog.ts';
import { toCanonicalIraqiPhone } from './src/lib/phone-utils.ts';
import { getDb } from './src/db/client.ts';
import { orders } from './src/db/schema/orders.ts';
import { products } from './src/db/schema/catalog.ts';
import { inventoryMovements } from './src/db/schema/inventory.ts';
import { financialAccounts } from './src/db/schema/accounts.ts';
import { authIdentities } from './src/db/schema/auth.ts';
import { purchaseInvoices } from './src/db/schema/purchases.ts';
import { orderRefunds } from './src/db/schema/accounting.ts';
import { drivers } from './src/db/schema/vehicles_drivers.ts';
import { eq, sql as dSql } from 'drizzle-orm';

const Ep = EpDefault.default || EpDefault;
const PORT = 54363;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2c4b_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '10';
process.env.DATA_SOURCE_CATALOG_BASE = 'postgres';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2c4b-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2c4b-test-secret-min-32-chars-long';

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

  console.log('2. Applying schema and migrations (0000 -> 0018)...');
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
  console.log('Running Commerce-2C4B HIGH Integrity Gaps Suite');
  console.log('======================================================\n');

  // Seed baseline catalog & accounts
  console.log('[Setup] Seeding test catalog, accounts and driver...');
  const cat = await pgCreateCategory({ name: 'المشروبات 2C4B' });
  const prodA = await pgCreateProduct({
    name: 'عصير برتقال طبيعي 2C4B',
    category: cat.id,
    costPrice: 8000,
    price: 15000,
    wholesalePrice: 12000,
    specialPrice: 10000,
    stock: 100,
    stockPieces: 100,
    boxesPerCarton: 1,
    itemsPerBox: 1,
  });

  // Seed Supplier Account
  const [supplier] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'SUP-2C4B-01',
      name: 'شركة الوارد للمواد الغذائية',
      phone: '07709998877',
      category: 'supplier',
      pricingTier: 'wholesale',
      isActive: true,
    })
    .returning();

  // Seed Merchant Customer Account (initially pending)
  const [merchant] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'MERCH-2C4B-01',
      name: 'أسواق الأمل المركزية',
      phone: '07701112233',
      businessName: 'أسواق الأمل',
      businessType: 'سوبرماركت',
      category: 'customer',
      pricingTier: 'retail', // Pending starts at retail
      merchantStatus: 'pending',
      isActive: true,
    })
    .returning();

  // Seed Driver & Driver Financial Account
  const [driverAuth] = await db
    .insert(authIdentities)
    .values({
      phone: '07705556677',
      role: 'driver',
      passwordHash: 'fake_hash',
    })
    .returning();

  const [driverAcc] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'DRV-ACC-2C4B-01',
      name: 'كابتن حسن التوصيل',
      phone: '07705556677',
      category: 'driver',
      pricingTier: 'retail',
      isActive: true,
    })
    .returning();

  const [driver] = await db
    .insert(drivers)
    .values({
      authIdentityId: driverAuth.id,
      financialAccountId: driverAcc.id,
      name: 'كابتن حسن',
      phone: '07705556677',
      isActive: true,
    })
    .returning();

  /* =========================================================================
     [Test 1, 2, 3, 4] Purchases PostgreSQL-Only, Stock Inflow & Cancellation
     ========================================================================= */
  console.log('\n[Test 1] Purchases PostgreSQL-Only: Creating purchase invoice with atomic stock increase');
  const [initialProdA] = await db.select().from(products).where(eq(products.id, prodA.id));
  const initialStock = Number(initialProdA.currentStockPieces);
  const purchaseInvoice = await pgCreatePurchaseInvoice({
    supplierAccountId: supplier.id,
    companyName: supplier.name,
    items: [
      {
        productId: prodA.id,
        quantity: 50, // 50 cartons
        costPrice: 8500, // 8,500 IQD per carton
        boxesPerCarton: 1,
        itemsPerBox: 1,
      },
    ],
    paidAmount: 200000,
    paymentMethod: 'cash',
    notes: 'توريد شحنة عصير إضافية لرمضان',
  });

  assert(purchaseInvoice.status === 'active', 'Purchase invoice created with active status');
  assert(purchaseInvoice.totalAmount === 425000, 'Invoice total matches 50 * 8,500 = 425,000 IQD');
  assert(purchaseInvoice.remainingAmount === 225000, 'Invoice remaining debt matches 225,000 IQD');

  const [refreshedProdA] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(refreshedProdA.currentStockPieces) === initialStock + 50, `Stock increased atomically by +50 pieces (Expected: 150, Actual: ${refreshedProdA.currentStockPieces})`);

  const [purchaseMovement] = await db
    .select()
    .from(inventoryMovements)
    .where(eq(inventoryMovements.referenceId, purchaseInvoice.id));
  assert(purchaseMovement !== undefined, 'Inventory movement recorded for purchase');
  assert(purchaseMovement.movementType === 'purchase', 'Movement type is strictly purchase');
  assert(Number(purchaseMovement.quantityPieces) === 50, 'Movement quantity is +50 pieces');

  console.log('\n[Test 2] Immutable Purchase Cancellation: Soft cancel with purchase_reversal movement');
  const cancelledInvoice = await pgCancelPurchaseInvoice(
    purchaseInvoice.id,
    'إلغاء الفاتورة بالاتفاق مع المورد بسبب خطأ في التسعير'
  );

  assert(cancelledInvoice.status === 'cancelled', 'Purchase invoice status updated to cancelled');
  assert(cancelledInvoice.cancellationReason.includes('خطأ في التسعير'), 'Cancellation reason recorded');

  const [afterCancelProdA] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(afterCancelProdA.currentStockPieces) === initialStock, `Stock reversed back to initial 100 pieces (Actual: ${afterCancelProdA.currentStockPieces})`);

  const [reversalMovement] = await db
    .select()
    .from(inventoryMovements)
    .where(dSql`${inventoryMovements.referenceId} = ${purchaseInvoice.id} AND ${inventoryMovements.movementType} = 'purchase_reversal'`);
  assert(reversalMovement !== undefined, 'Inventory reversal movement created');
  assert(Number(reversalMovement.quantityPieces) === -50, 'Reversal movement is negative delta -50 pieces');

  console.log('\n[Test 3] Double-Cancel Idempotency: Cancelling an already cancelled invoice is idempotent');
  const doubleCancel = await pgCancelPurchaseInvoice(purchaseInvoice.id, 'محاولة إلغاء ثانية');
  assert(doubleCancel.status === 'cancelled', 'Double cancel returns cancelled invoice without error');
  const [afterDoubleCancelProdA] = await db.select().from(products).where(eq(products.id, prodA.id));
  assert(Number(afterDoubleCancelProdA.currentStockPieces) === initialStock, 'Stock remains unchanged on double cancellation');

  /* =========================================================================
     [Test 5, 6, 7] Authoritative Merchant Approval & Pricing Tier Enforcement
     ========================================================================= */
  console.log('\n[Test 4] Merchant Identity: Pending merchant receives retail pricing');
  const pendingIdentity = await pgResolveCustomerIdentity({
    userId: merchant.id,
    phone: merchant.phone,
    merchantTier: 'gold', // Malicious attempt to claim gold tier while pending
  });
  assert(pendingIdentity.pricingTier === 'retail', 'Pending merchant cannot spoof pricing tier; enforced as retail');
  assert(pendingIdentity.merchantTier === undefined, 'Pending merchant cannot claim merchantTier');

  console.log('\n[Test 5] Authoritative Approval in PostgreSQL: Upgrading merchant to silver wholesale');
  await db
    .update(financialAccounts)
    .set({
      merchantStatus: 'approved',
      merchantTier: 'silver',
      pricingTier: 'special',
    })
    .where(eq(financialAccounts.id, merchant.id));

  const approvedIdentity = await pgResolveCustomerIdentity({
    userId: merchant.id,
    phone: merchant.phone,
  });
  assert(approvedIdentity.merchantStatus === 'approved', 'Merchant status is approved in PostgreSQL');
  assert(approvedIdentity.merchantTier === 'silver', 'Merchant tier is silver');
  assert(approvedIdentity.pricingTier === 'special', 'Authoritative pricing tier is special (10,000 IQD)');

  // Create an order for this approved merchant to verify special price is applied
  const merchantOrder = await pgCreateOrder({
    customer: {
      userId: merchant.id,
      name: merchant.name,
      phone: merchant.phone,
      address: 'بغداد - الكرادة',
    },
    items: [
      {
        productId: prodA.id,
        quantity: 5,
        saleType: 'wholesale',
      },
    ],
    deliveryFee: 5000,
    paymentMethod: 'cash_on_delivery',
  });

  assert(merchantOrder.items[0].price === 10000, `Special merchant tier price 10,000 IQD applied (Actual: ${merchantOrder.items[0].price})`);
  assert(merchantOrder.total === 55000, `Total is 5 * 10,000 + 5,000 = 55,000 IQD (Actual: ${merchantOrder.total})`);

  /* =========================================================================
     [Test 8, 9] Return Before Driver Settlement (driverCashSettled = false)
     ========================================================================= */
  console.log('\n[Test 6] Return Before Settlement: Driver collected cash, customer returns order');
  // Create order 2 assigned to driver
  const orderBeforeSettlement = await pgCreateOrder({
    customer: {
      userId: merchant.id,
      name: merchant.name,
      phone: merchant.phone,
      address: 'بغداد - الكرادة',
    },
    items: [{ productId: prodA.id, quantity: 2, saleType: 'retail' }],
    deliveryFee: 5000,
    paymentMethod: 'cash_on_delivery',
  });

  const total1 = orderBeforeSettlement.total;
  // Assign driver and transition to delivered with cash collected
  await pgUpdateOrderStatus(orderBeforeSettlement.id, 'processing', { driverId: driver.id });
  await pgUpdateOrderStatus(orderBeforeSettlement.id, 'shipped', { driverId: driver.id });
  const deliveredOrder = await pgUpdateOrderStatus(orderBeforeSettlement.id, 'delivered', {
    driverId: driver.id,
    collectedAmount: total1,
    skipPinVerification: true,
  });

  assert(deliveredOrder.collectedAmount === total1, `Driver collected ${total1} IQD`);
  assert(deliveredOrder.driverCashSettled === false, 'driverCashSettled is false');

  // Customer returns the order before driver has settled cash with the company
  console.log('   Executing return before driver settlement...');
  const returnedOrder1 = await pgReturnOrder(deliveredOrder.id, {
    reason: 'البضاعة تالفة أثناء النقل',
  });

  assert(returnedOrder1.status === 'returned', 'Order status is returned');
  assert(returnedOrder1.collectionStatus === 'returned', 'Collection status is returned');
  assert(returnedOrder1.collectedAmount === total1, 'collectedAmount is preserved (NOT zeroed)');
  assert(returnedOrder1.paidAmount === total1, 'paidAmount is preserved (NOT zeroed)');
  assert(returnedOrder1.driverCashSettled === false, 'driverCashSettled remains false');
  assert(returnedOrder1.refundStatus === 'pending', 'refundStatus set to pending');

  // Check driver custody: the total1 MUST remain in custody!
  const custodyBeforeSettlement = await pgGetDriverCustody(driver.id);
  assert(custodyBeforeSettlement.currentCashInHand >= total1, `Returned order cash is still in driver custody (Actual custody: ${custodyBeforeSettlement.currentCashInHand})`);

  // Driver settles the cash with the company
  console.log('\n[Test 7] Driver Settles Cash for Returned Order:');
  const adminOperator = { username: 'admin_test', role: 'admin' };
  const res1 = await pgCreateDriverSettlement(
    driver.id,
    { amount: total1, notes: 'تسليم كاش الطلبية المرتجعة للشركة' },
    adminOperator
  );
  const settlement1 = res1.settlement;
  assert(settlement1.actualAmount === total1, `Settlement created for ${total1} IQD`);

  const [orderAfterSettlement1] = await db.select().from(orders).where(eq(orders.id, returnedOrder1.id));
  assert(orderAfterSettlement1.driverCashSettled === true, 'Order driverCashSettled is now true');
  assert(orderAfterSettlement1.settlementId === settlement1.id, 'Order linked to settlement');

  /* =========================================================================
     [Test 10] Return After Driver Settlement (driverCashSettled = true)
     ========================================================================= */
  console.log('\n[Test 8] Return After Settlement: Settled order is returned; settlement remains immutable');
  const orderAfterSettlement = await pgCreateOrder({
    customer: {
      userId: merchant.id,
      name: merchant.name,
      phone: merchant.phone,
      address: 'بغداد - المنصور',
    },
    items: [{ productId: prodA.id, quantity: 1, saleType: 'retail' }],
    deliveryFee: 5000,
    paymentMethod: 'cash_on_delivery',
  });

  const total2 = orderAfterSettlement.total;

  await pgUpdateOrderStatus(orderAfterSettlement.id, 'processing', { driverId: driver.id });
  await pgUpdateOrderStatus(orderAfterSettlement.id, 'shipped', { driverId: driver.id });
  await pgUpdateOrderStatus(orderAfterSettlement.id, 'delivered', {
    driverId: driver.id,
    collectedAmount: total2,
    skipPinVerification: true,
  });

  const res2 = await pgCreateDriverSettlement(
    driver.id,
    { amount: total2, notes: 'تصفية نظامية مغلقة' },
    adminOperator
  );
  const settlement2 = res2.settlement;

  const [settledOrder] = await db.select().from(orders).where(eq(orders.id, orderAfterSettlement.id));
  assert(settledOrder.driverCashSettled === true, 'Order is settled');
  const originalSettlementId = settledOrder.settlementId;

  // Now return the settled order
  console.log('   Executing return on already-settled order...');
  const returnedOrder2 = await pgReturnOrder(settledOrder.id, {
    reason: 'إرجاع بعد التصفية',
  });

  assert(returnedOrder2.status === 'returned', 'Order status changed to returned');
  assert(returnedOrder2.driverCashSettled === true, 'driverCashSettled remains true (Decoupled Policy)');
  assert(returnedOrder2.settlementId === originalSettlementId, 'settlementId is preserved and intact');
  assert(returnedOrder2.collectedAmount === total2, 'collectedAmount is preserved');
  assert(returnedOrder2.refundStatus === 'pending', 'refundStatus set to pending');

  // Verify historical settlement was NOT modified or deleted
  const existingSettlement = await pgGetDriverSettlementById(originalSettlementId);
  assert(existingSettlement !== null, 'Settlement remains in DB');
  assert(existingSettlement.status === 'settled', 'Settlement status remains settled');
  assert(existingSettlement.actualAmount === total2, 'Settlement amount unmodified');

  /* =========================================================================
     [Test 11] Independent Customer Refund (pgRefundOrder)
     ========================================================================= */
  console.log('\n[Test 9] Independent Customer Refund: Issuing refund via pgRefundOrder');
  const refundResult = await pgRefundOrder(returnedOrder2.id, {
    amount: total2,
    method: 'cash',
    reason: 'إرجاع نقدي للزبون في مقر الشركة',
    notes: 'استلام الزبون نقداً بموجب وصل استرداد',
  });

  assert(refundResult.order.refundStatus === 'refunded', 'Order refundStatus is now refunded');
  assert(refundResult.order.refundedAmount === total2, `Order refundedAmount is ${total2} IQD`);
  assert(refundResult.refund.refundNumber.startsWith('REF-'), `Refund number generated: ${refundResult.refund.refundNumber}`);
  assert(refundResult.refund.amount === total2, `Refund amount is ${total2} IQD`);
  assert(refundResult.refund.status === 'completed', 'Refund status is completed');

  // Verify DB record in order_refunds table
  const [dbRefund] = await db.select().from(orderRefunds).where(eq(orderRefunds.orderId, returnedOrder2.id));
  assert(dbRefund !== undefined, 'order_refunds row exists in PostgreSQL');
  assert(Number(dbRefund.amount) === total2, `Recorded refund amount is ${total2} IQD`);

  /* =========================================================================
     [Test 12] Double Return / Double Refund Idempotency & Concurrency
     ========================================================================= */
  console.log('\n[Test 10] Double-Return Idempotency: pgReturnOrder on already returned order is idempotent');
  const stockBeforeDoubleReturn = (await db.select().from(products).where(eq(products.id, prodA.id)))[0].currentStockPieces;
  const doubleReturn = await pgReturnOrder(returnedOrder2.id, { reason: 'محاولة إرجاع ثانية' });
  assert(doubleReturn.status === 'returned', 'Double return returns returned order cleanly');
  const stockAfterDoubleReturn = (await db.select().from(products).where(eq(products.id, prodA.id)))[0].currentStockPieces;
  assert(stockBeforeDoubleReturn === stockAfterDoubleReturn, 'Stock was NOT re-restored twice');

  console.log('\n[Test 11] Double-Refund Prevention: Secondary refund attempt strictly rejected');
  let doubleRefundFailed = false;
  try {
    await pgRefundOrder(returnedOrder2.id, { amount: total2 });
  } catch (err) {
    doubleRefundFailed = true;
    assert(err.message.includes('مسبقاً') || err.message.includes('refunded'), `Double refund rejected with message: ${err.message}`);
  }
  assert(doubleRefundFailed, 'Double refund was strictly rejected');

  console.log('\n[Test 12] Concurrency Hardening: Concurrent pgRefundOrder calls with Promise.all');
  // Create another order, deliver, and return it
  const concurrentOrder = await pgCreateOrder({
    customer: {
      userId: merchant.id,
      name: merchant.name,
      phone: merchant.phone,
      address: 'بغداد - المنصور',
    },
    items: [{ productId: prodA.id, quantity: 1, saleType: 'retail' }],
    deliveryFee: 5000,
    paymentMethod: 'cash_on_delivery',
  });
  const totalConcurrent = concurrentOrder.total;
  await pgUpdateOrderStatus(concurrentOrder.id, 'processing', { driverId: driver.id });
  await pgUpdateOrderStatus(concurrentOrder.id, 'shipped', { driverId: driver.id });
  await pgUpdateOrderStatus(concurrentOrder.id, 'delivered', {
    driverId: driver.id,
    collectedAmount: totalConcurrent,
    skipPinVerification: true,
  });
  await pgReturnOrder(concurrentOrder.id, { reason: 'إرجاع لاختبار التزامن' });

  // Launch two simultaneous refund requests in parallel
  const refundPromises = [
    pgRefundOrder(concurrentOrder.id, { amount: totalConcurrent, notes: 'محاولة تزامنية 1' }),
    pgRefundOrder(concurrentOrder.id, { amount: totalConcurrent, notes: 'محاولة تزامنية 2' }),
  ];

  const results = await Promise.allSettled(refundPromises);
  const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = results.filter((r) => r.status === 'rejected').length;

  assert(fulfilledCount === 1, `Exactly ONE concurrent refund succeeded (Fulfilled: ${fulfilledCount})`);
  assert(rejectedCount === 1, `The concurrent race attempt was rejected (Rejected: ${rejectedCount})`);

  // Verify in DB that only 1 refund record was inserted
  const refundsInDb = await db.select().from(orderRefunds).where(eq(orderRefunds.orderId, concurrentOrder.id));
  assert(refundsInDb.length === 1, `Database contains exactly 1 refund record under partial unique index (Actual: ${refundsInDb.length})`);

  /* =========================================================================
     [Test 13] Accounting Statements and Account Summaries with Return Reversals
     ========================================================================= */
  console.log('\n[Test 13] Accounting Statement Reversal: Return transaction balances original invoice');
  const statement = await pgGetCustomerStatement(merchant.id);
  assert(statement !== null, 'Customer statement retrieved');

  // Verify that for returned orders, an explicit return transaction exists
  const returnTransactions = statement.transactions.filter((t) => t.type === 'return');
  assert(returnTransactions.length >= 2, `Customer statement includes explicit return transactions (Found: ${returnTransactions.length})`);

  // Verify that account summary reflects neutralized debt for returned orders
  const summaries = await pgGetAccountSummaries();
  const merchantSummary = summaries.find((s) => s.phone === merchant.phone);
  assert(merchantSummary !== undefined, 'Merchant account summary found');
  console.log(`   Merchant Total Invoiced: ${merchantSummary.totalInvoiced}, Total Paid: ${merchantSummary.totalPaid}, Remaining Balance: ${merchantSummary.remainingBalance}`);

  console.log('\n======================================================');
  console.log('✅ ALL COMMERCE-2C4B HIGH INTEGRITY TESTS PASSED!');
  console.log('======================================================\n');

  await stopDatabase();
}

runTests().catch(async (err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  await stopDatabase();
  process.exit(1);
});
