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
  pgRecordSupplierRefund,
  pgGetSupplierRefundClaims,
} from './src/lib/postgres-purchases.ts';
import {
  pgGetDriverCustody,
  pgCreateDriverSettlement,
  pgGetDriverSettlementById,
} from './src/lib/postgres-settlements.ts';
import { pgGetDrivers, pgGetDriverById } from './src/lib/postgres-drivers.ts';
import {
  pgGetCustomerStatement,
  pgGetAccountSummaries,
  pgAddPayment,
} from './src/lib/postgres-accounting.ts';
import { pgCreateProduct, pgCreateCategory } from './src/lib/postgres-catalog.ts';
import { toCanonicalIraqiPhone } from './src/lib/phone-utils.ts';
import { getDb } from './src/db/client.ts';
import { orders } from './src/db/schema/orders.ts';
import { products } from './src/db/schema/catalog.ts';
import { inventoryMovements } from './src/db/schema/inventory.ts';
import { financialAccounts } from './src/db/schema/accounts.ts';
import { authIdentities } from './src/db/schema/auth.ts';
import { purchaseInvoices, supplierRefundClaims, supplierRefunds } from './src/db/schema/purchases.ts';
import { orderRefunds, cashVaultMovements, vouchers } from './src/db/schema/accounting.ts';
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
  assert(cancelledInvoice.totalAmount === 425000, 'Original totalAmount is preserved (NOT zeroed)');
  assert(cancelledInvoice.paidAmount === 200000, 'Original paidAmount is preserved (NOT zeroed)');
  assert(cancelledInvoice.remainingAmount === 225000, 'Original remainingAmount is preserved (NOT zeroed)');

  const [claim] = await db
    .select()
    .from(supplierRefundClaims)
    .where(eq(supplierRefundClaims.purchaseInvoiceId, purchaseInvoice.id));
  assert(claim !== undefined, 'Supplier refund claim created for paid amount');
  assert(Number(claim.claimAmount) === 200000, 'Claim amount equals paid amount (200,000 IQD)');
  assert(claim.status === 'pending', 'Claim status is initially pending');

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

  const allClaims = await db
    .select()
    .from(supplierRefundClaims)
    .where(eq(supplierRefundClaims.purchaseInvoiceId, purchaseInvoice.id));
  assert(allClaims.length === 1, 'Double cancel does not create duplicate claims (idempotent)');

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

  /* =========================================================================
     [Test 14] Static Architecture Guard: Ban MAX()+1 & Sequence Fallbacks
     ========================================================================= */
  console.log('\n[Test 14] Static Architecture Guard: Verifying purchases numbering uses Fail-Fast sequence');
  const purchasesCode = fs.readFileSync(path.join(process.cwd(), 'src/lib/postgres-purchases.ts'), 'utf-8');
  assert(!purchasesCode.includes('MAX('), 'Strict: No MAX(...) aggregation query allowed in postgres-purchases.ts');
  assert(!purchasesCode.includes('MAX(SUBSTRING'), 'Strict: No MAX(SUBSTRING) pattern allowed in postgres-purchases.ts');
  assert(!purchasesCode.match(/try\s*\{[\s\S]*?nextval\('purchase_seq'\)[\s\S]*?\}\s*catch/), 'Strict: No try/catch wrapping sequence generation');
  assert(purchasesCode.includes("nextval('purchase_seq')"), 'Strict: Direct nextval(\'purchase_seq\') is present');
  console.log('   ✅ [PASS] Static guard verified: zero MAX()+1 fallbacks, direct atomic nextval enforced');

  /* =========================================================================
     [Test 15] Concurrency Safety: Creating Simultaneous Purchase Invoices
     ========================================================================= */
  console.log('\n[Test 15] Concurrency Safety: Creating simultaneous purchase invoices without collision');
  const [invA, invB] = await Promise.all([
    pgCreatePurchaseInvoice({
      supplierName: 'مورد متزامن أ',
      items: [{ productId: prodA.id, quantity: 2, purchasePrice: 8500 }],
      paidAmount: 0,
    }),
    pgCreatePurchaseInvoice({
      supplierName: 'مورد متزامن ب',
      items: [{ productId: prodA.id, quantity: 3, purchasePrice: 8500 }],
      paidAmount: 0,
    }),
  ]);

  assert(invA && invA.id, 'Invoice A created successfully');
  assert(invB && invB.id, 'Invoice B created successfully');
  assert(invA.invoiceNumber !== invB.invoiceNumber, `Concurrent invoice numbers are strictly unique: ${invA.invoiceNumber} vs ${invB.invoiceNumber}`);
  const numA = parseInt(invA.invoiceNumber.replace('PUR-', ''), 10);
  const numB = parseInt(invB.invoiceNumber.replace('PUR-', ''), 10);
  assert(!isNaN(numA) && !isNaN(numB), 'Invoice numbers parse to valid sequential integers');
  assert(Math.abs(numA - numB) === 1, `Invoice sequence incremented consecutively: ${numA} and ${numB}`);
  console.log(`   ✅ [PASS] Concurrent purchase invoices created safely: ${invA.invoiceNumber}, ${invB.invoiceNumber}`);

  /* =========================================================================
     [Test 16] Fail-Fast on Missing Sequence (No Fallback / No 25P02)
     ========================================================================= */
  console.log('\n[Test 16] Fail-Fast on Missing Sequence: System aborts directly without silent fallback');
  await sql`DROP SEQUENCE purchase_seq;`;

  let failFastError = null;
  try {
    await pgCreatePurchaseInvoice({
      supplierName: 'مورد اختبار الفشل السريع',
      items: [{ productId: prodA.id, quantity: 1, purchasePrice: 8500 }],
      paidAmount: 0,
    });
  } catch (err) {
    failFastError = err;
  }

  assert(failFastError !== null, 'Operation failed fast when purchase_seq was missing');
  const errorMsg = String(failFastError.message || failFastError);
  const errorCode = failFastError.code || '';
  assert(
    errorCode === '42P01' || errorMsg.includes('purchase_seq'),
    `Error explicitly identifies missing sequence: code=${errorCode}, message=${errorMsg}`
  );
  // Re-create the sequence for subsequent runs or operations
  await sql`CREATE SEQUENCE purchase_seq START WITH 3001;`;
  const restoredInv = await pgCreatePurchaseInvoice({
    supplierName: 'مورد بعد استعادة السلسلة',
    items: [{ productId: prodA.id, quantity: 1, purchasePrice: 8500 }],
    paidAmount: 0,
  });
  assert(restoredInv.invoiceNumber === 'PUR-3001', `Sequence restored and functioning: ${restoredInv.invoiceNumber}`);
  console.log('   ✅ [PASS] Fail-fast behavior verified: missing sequence rejected cleanly, no corrupted fallback');

  /* =========================================================================
     [Test 17] Scenario 1: Credit Purchase (1M total, 0 paid) -> Cancel -> Net Zero
     ========================================================================= */
  console.log('\n[Test 17] Scenario 1: Credit purchase cancellation -> Net zero liability');
  const [sup17] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'SUP-TEST-17',
      name: 'مورد آجل تجريبي 17',
      phone: '07701110017',
      category: 'supplier',
      isActive: true,
    })
    .returning();

  const creditInv = await pgCreatePurchaseInvoice({
    supplierAccountId: sup17.id,
    companyName: sup17.name,
    items: [{ productId: prodA.id, quantity: 100, costPrice: 10000, boxesPerCarton: 1, itemsPerBox: 1 }],
    paidAmount: 0,
    paymentMethod: 'credit',
  });
  assert(creditInv.totalAmount === 1000000, 'Credit invoice total is 1,000,000 IQD');
  assert(creditInv.paidAmount === 0, 'Paid amount is 0 IQD');
  assert(creditInv.remainingAmount === 1000000, 'Remaining debt is 1,000,000 IQD');

  // Verify statement before cancel
  const stmtBefore17 = await pgGetCustomerStatement(sup17.id);
  assert(stmtBefore17.transactions.length === 1, 'Statement has 1 invoice transaction');
  assert(stmtBefore17.transactions[0].debit === 1000000, 'Debit is 1,000,000');
  assert(stmtBefore17.transactions[0].balance === 1000000, 'Balance is 1,000,000 liability');

  // Cancel credit invoice
  const cancelledCreditInv = await pgCancelPurchaseInvoice(creditInv.id, 'إلغاء فاتورة آجلة بالكامل');
  assert(cancelledCreditInv.status === 'cancelled', 'Status is cancelled');
  assert(cancelledCreditInv.totalAmount === 1000000, 'Historical totalAmount preserved (NOT zeroed)');
  assert(cancelledCreditInv.paidAmount === 0, 'Historical paidAmount preserved');
  assert(cancelledCreditInv.remainingAmount === 1000000, 'Historical remainingAmount preserved');

  // Check no claim created since paidAmount is 0
  const claims17 = await pgGetSupplierRefundClaims(creditInv.id);
  assert(claims17.length === 0, 'No refund claim created for unpaid invoice');

  // Verify statement after cancel: PUR debit 1M, REV-PUR credit 1M -> Balance = 0!
  const stmtAfter17 = await pgGetCustomerStatement(sup17.id);
  assert(stmtAfter17.transactions[1].type === 'return', 'Second transaction is return (cancellation reversal)');
  assert(stmtAfter17.transactions[1].reference === `REV-${creditInv.invoiceNumber}`, 'Reference is REV-PUR');
  assert(stmtAfter17.transactions[1].credit === 1000000, 'Cancellation reversal credits 1,000,000');
  assert(stmtAfter17.transactions[1].balance === 0, 'Net running balance is exactly 0 IQD (Net Zero)!');

  const summaries17 = await pgGetAccountSummaries();
  const summary17 = summaries17.find((s) => s.phone === sup17.phone);
  assert(summary17.totalInvoiced === 0, 'Account summary invoiced is net 0');
  assert(summary17.totalPaid === 0, 'Account summary paid is 0');
  assert(summary17.remainingBalance === 0, 'Account summary balance is 0');

  /* =========================================================================
     [Test 18] Scenario 2: Cash Purchase (1M total, 1M paid) -> Cancel -> Supplier owes 1M
     ========================================================================= */
  console.log('\n[Test 18] Scenario 2: Cash purchase cancellation -> Supplier owes company 1,000,000 IQD');
  const [sup18] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'SUP-TEST-18',
      name: 'مورد نقدي تجريبي 18',
      phone: '07701110018',
      category: 'supplier',
      isActive: true,
    })
    .returning();

  const cashInv = await pgCreatePurchaseInvoice({
    supplierAccountId: sup18.id,
    companyName: sup18.name,
    items: [{ productId: prodA.id, quantity: 100, costPrice: 10000, boxesPerCarton: 1, itemsPerBox: 1 }],
    paidAmount: 1000000,
    paymentMethod: 'cash',
  });
  assert(cashInv.totalAmount === 1000000, 'Cash invoice total 1,000,000 IQD');
  assert(cashInv.paidAmount === 1000000, 'Paid amount 1,000,000 IQD');
  assert(cashInv.remainingAmount === 0, 'Remaining debt 0 IQD');

  const cancelledCashInv = await pgCancelPurchaseInvoice(cashInv.id, 'إلغاء فاتورة نقدية بالكامل');
  assert(cancelledCashInv.status === 'cancelled', 'Status is cancelled');
  assert(cancelledCashInv.paidAmount === 1000000, 'Historical paid preserved');

  // Supplier refund claim created for 1,000,000
  const claims18 = await pgGetSupplierRefundClaims(cashInv.id);
  assert(claims18.length === 1, 'Supplier refund claim created');
  assert(Number(claims18[0].claimAmount) === 1000000, 'Claim amount is 1,000,000 IQD');
  assert(claims18[0].status === 'pending', 'Claim status is pending');
  assert(Number(claims18[0].refundedAmount) === 0, 'Refunded amount is initially 0');

  // Check statement: PUR (debit 1M, credit 1M -> 0), REV-PUR (debit 0, credit 1M -> -1M)
  const stmtAfter18 = await pgGetCustomerStatement(sup18.id);
  assert(stmtAfter18.transactions.length === 2, 'Statement has PUR + REV-PUR');
  assert(stmtAfter18.transactions[1].balance === -1000000, 'Supplier statement balance is -1,000,000 IQD (Supplier owes company)');

  const summaries18 = await pgGetAccountSummaries();
  const summary18 = summaries18.find((s) => s.phone === sup18.phone);
  assert(summary18.remainingBalance === -1000000, 'Account summary reflects -1,000,000 IQD owed by supplier');

  /* =========================================================================
     [Test 19] Scenario 3: Partial Purchase (1M total, 400k paid, 600k remaining) -> Cancel
     ========================================================================= */
  console.log('\n[Test 19] Scenario 3: Partial purchase cancellation -> 600k debt cleared, 400k claim created');
  const [sup19] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'SUP-TEST-19',
      name: 'مورد دفع جزئي تجريبي 19',
      phone: '07701110019',
      category: 'supplier',
      isActive: true,
    })
    .returning();

  const partialInv = await pgCreatePurchaseInvoice({
    supplierAccountId: sup19.id,
    companyName: sup19.name,
    items: [{ productId: prodA.id, quantity: 100, costPrice: 10000, boxesPerCarton: 1, itemsPerBox: 1 }],
    paidAmount: 400000,
    paymentMethod: 'cash',
  });
  assert(partialInv.totalAmount === 1000000, 'Total 1,000,000');
  assert(partialInv.paidAmount === 400000, 'Paid 400,000');
  assert(partialInv.remainingAmount === 600000, 'Remaining 600,000');

  const cancelledPartialInv = await pgCancelPurchaseInvoice(partialInv.id, 'إلغاء فاتورة ذات دفعة جزئية');
  assert(cancelledPartialInv.status === 'cancelled', 'Status is cancelled');
  assert(cancelledPartialInv.totalAmount === 1000000, 'Total preserved');
  assert(cancelledPartialInv.paidAmount === 400000, 'Paid preserved');
  assert(cancelledPartialInv.remainingAmount === 600000, 'Remaining preserved');

  const claims19 = await pgGetSupplierRefundClaims(partialInv.id);
  assert(claims19.length === 1, 'Supplier refund claim created for 400k');
  const claim19 = claims19[0];
  assert(Number(claim19.claimAmount) === 400000, 'Claim amount is exactly 400,000 IQD');
  assert(claim19.status === 'pending', 'Claim status is pending');

  const stmtAfter19 = await pgGetCustomerStatement(sup19.id);
  assert(stmtAfter19.transactions[1].balance === -400000, 'Running balance after cancellation is -400,000 IQD');

  /* =========================================================================
     [Test 20] Scenario 4: Partial Supplier Refund (150k out of 400k)
     ========================================================================= */
  console.log('\n[Test 20] Scenario 4: Partial supplier refund (150,000 IQD)');
  const refund1 = await pgRecordSupplierRefund(claim19.id, {
    amount: 150000,
    paymentMethod: 'cash',
    notes: 'استرداد نقدي جزئي من المورد إلى صندوق الشركة',
  });

  assert(refund1.claim.status === 'partially_refunded', 'Claim status updated to partially_refunded');
  assert(Number(refund1.claim.refundedAmount) === 150000, 'Claim refundedAmount is 150,000 IQD');
  assert(Number(refund1.refund.amount) === 150000, 'Supplier refund record amount is 150,000 IQD');
  assert(refund1.voucher.voucherType === 'receipt', 'Voucher created is receipt voucher');
  assert(refund1.vaultMovement.category === 'supplier_refund', 'Cash vault movement category is supplier_refund');
  assert(refund1.vaultMovement.type === 'inflow', 'Cash vault movement is inflow');
  assert(Number(refund1.vaultMovement.amount) === 150000, 'Cash vault movement amount is +150,000');

  // Verify statement: -400k + 150k = -250,000 IQD
  const stmtRefund1 = await pgGetCustomerStatement(sup19.id);
  const lastTx1 = stmtRefund1.transactions[stmtRefund1.transactions.length - 1];
  assert(lastTx1.balance === -250000, `Running balance updated accurately to -250,000 IQD (Actual: ${lastTx1.balance})`);

  /* =========================================================================
     [Test 21] Scenario 5: Full Remaining Refund (250k out of 250k) -> Net Zero
     ========================================================================= */
  console.log('\n[Test 21] Scenario 5: Full remaining refund (250,000 IQD) -> Net Zero');
  const refund2 = await pgRecordSupplierRefund(claim19.id, {
    amount: 250000,
    paymentMethod: 'cash',
    notes: 'استرداد باقي المبلغ وإغلاق المطالبة بالكامل',
  });

  assert(refund2.claim.status === 'completed', 'Claim status updated to completed');
  assert(Number(refund2.claim.refundedAmount) === 400000, 'Claim refundedAmount is now 400,000 IQD');

  // Verify statement: -250k + 250k = 0 IQD (Net Zero!)
  const stmtRefund2 = await pgGetCustomerStatement(sup19.id);
  const lastTx2 = stmtRefund2.transactions[stmtRefund2.transactions.length - 1];
  assert(lastTx2.balance === 0, `Running balance fully reconciled to 0 IQD (Actual: ${lastTx2.balance})`);

  // Verify attempting another refund fails
  let completedClaimError = null;
  try {
    await pgRecordSupplierRefund(claim19.id, { amount: 50000 });
  } catch (err) {
    completedClaimError = err;
  }
  assert(completedClaimError !== null, 'Attempting further refund on completed claim rejected');

  /* =========================================================================
     [Test 22] Over-refund Attempt Rejection
     ========================================================================= */
  console.log('\n[Test 22] Over-refund Attempt Rejection: Exceeding remaining claim rejected');
  const overInv = await pgCreatePurchaseInvoice({
    supplierAccountId: sup19.id,
    companyName: sup19.name,
    items: [{ productId: prodA.id, quantity: 10, costPrice: 10000, boxesPerCarton: 1, itemsPerBox: 1 }],
    paidAmount: 100000,
    paymentMethod: 'cash',
  });
  await pgCancelPurchaseInvoice(overInv.id, 'إلغاء لاختبار تجاوز الاسترداد');
  const [overClaim] = await pgGetSupplierRefundClaims(overInv.id);

  let overRefundError = null;
  try {
    await pgRecordSupplierRefund(overClaim.id, { amount: 150000 });
  } catch (err) {
    overRefundError = err;
  }
  assert(overRefundError !== null, 'Over-refund strictly rejected');
  assert(overRefundError.message.includes('يتجاوز الرصيد المتبقي'), `Error message: ${overRefundError.message}`);

  /* =========================================================================
     [Test 23] Concurrent Double Cancellation (Promise.all)
     ========================================================================= */
  console.log('\n[Test 23] Concurrency: Concurrent double cancellation via Promise.all');
  const concInv = await pgCreatePurchaseInvoice({
    supplierAccountId: sup19.id,
    companyName: sup19.name,
    items: [{ productId: prodA.id, quantity: 20, costPrice: 10000, boxesPerCarton: 1, itemsPerBox: 1 }],
    paidAmount: 200000,
    paymentMethod: 'cash',
  });

  const [resCancel1, resCancel2] = await Promise.all([
    pgCancelPurchaseInvoice(concInv.id, 'إلغاء متزامن 1'),
    pgCancelPurchaseInvoice(concInv.id, 'إلغاء متزامن 2'),
  ]);

  assert(resCancel1.status === 'cancelled', 'First cancel call returned cancelled');
  assert(resCancel2.status === 'cancelled', 'Second cancel call returned cancelled');

  const claimsConc = await pgGetSupplierRefundClaims(concInv.id);
  assert(claimsConc.length === 1, `Exactly ONE refund claim exists under unique constraint (Actual: ${claimsConc.length})`);

  /* =========================================================================
     [Test 24] Concurrent Cancellation vs Payment (Promise.all)
     ========================================================================= */
  console.log('\n[Test 24] Concurrency: Concurrent cancellation vs supplier payment');
  const [sup24] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'SUP-TEST-24',
      name: 'مورد تضارب متزامن 24',
      phone: '07701110024',
      category: 'supplier',
      isActive: true,
    })
    .returning();

  const concPayInv = await pgCreatePurchaseInvoice({
    supplierAccountId: sup24.id,
    companyName: sup24.name,
    items: [{ productId: prodA.id, quantity: 50, costPrice: 10000, boxesPerCarton: 1, itemsPerBox: 1 }],
    paidAmount: 100000,
    paymentMethod: 'cash',
  });

  // Concurrently run cancellation and payment
  const concResults = await Promise.allSettled([
    pgCancelPurchaseInvoice(concPayInv.id, 'إلغاء أثناء محاولة تسديد'),
    pgAddPayment({
      accountId: sup24.id,
      customerPhone: sup24.phone,
      amount: 100000,
      paymentMethod: 'cash',
      voucherType: 'disbursement',
      notes: 'تسديد متزامن مع الإلغاء',
    }),
  ]);

  // Both complete serialized by Level 1 financialAccounts lock
  const allSucceeded = concResults.every((r) => r.status === 'fulfilled');
  if (!allSucceeded) {
    console.error('Test 24 failure details:', concResults.map((r) => (r.status === 'rejected' ? r.reason : 'OK')));
  }
  assert(allSucceeded, 'Both operations completed serialized without deadlocks');

  // Verify database consistency
  const [refreshedInv24] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, concPayInv.id));
  assert(refreshedInv24.status === 'cancelled', 'Invoice status is definitively cancelled');

  /* =========================================================================
     [Test 25] Concurrent Refunds Exceeding Claim (Promise.all)
     ========================================================================= */
  console.log('\n[Test 25] Concurrency: Concurrent refunds exceeding claim amount');
  const concClaimInv = await pgCreatePurchaseInvoice({
    supplierAccountId: sup24.id,
    companyName: sup24.name,
    items: [{ productId: prodA.id, quantity: 30, costPrice: 10000, boxesPerCarton: 1, itemsPerBox: 1 }],
    paidAmount: 300000,
    paymentMethod: 'cash',
  });
  await pgCancelPurchaseInvoice(concClaimInv.id, 'إلغاء لاختبار تنازع الاسترداد');
  const [concClaim] = await pgGetSupplierRefundClaims(concClaimInv.id);

  // Attempt two simultaneous refunds of 200,000 each (total 400,000 > claim 300,000)
  const refundRaceResults = await Promise.allSettled([
    pgRecordSupplierRefund(concClaim.id, { amount: 200000, notes: 'استرداد سباق 1' }),
    pgRecordSupplierRefund(concClaim.id, { amount: 200000, notes: 'استرداد سباق 2' }),
  ]);

  const refundSuccesses = refundRaceResults.filter((r) => r.status === 'fulfilled');
  const refundFailures = refundRaceResults.filter((r) => r.status === 'rejected');

  assert(refundSuccesses.length === 1, `Exactly ONE refund succeeded in race (Actual: ${refundSuccesses.length})`);
  assert(refundFailures.length === 1, `The second refund was rejected because it exceeds claim balance (Actual: ${refundFailures.length})`);

  const [finalClaim25] = await db.select().from(supplierRefundClaims).where(eq(supplierRefundClaims.id, concClaim.id));
  assert(Number(finalClaim25.refundedAmount) === 200000, `Claim recorded exactly 200,000 IQD refunded`);
  assert(finalClaim25.status === 'partially_refunded', 'Claim is partially_refunded');

  /* =========================================================================
     [Test 26] DB Check Constraints on purchase_invoices (Direct SQL Fail-Fast)
     ========================================================================= */
  console.log('\n[Test 26] Database Check Constraints: Rejection of corrupted purchase rows');

  // 1. Negative paid_amount
  let chkPaidErr = null;
  try {
    await sql`
      INSERT INTO purchase_invoices (invoice_number, supplier_account_id, supplier_name_snap, total_amount, paid_amount, remaining_amount, payment_method)
      VALUES ('PUR-TEST-CHK-1', ${sup24.id}, 'مورد فحص', 10000, -500, 10500, 'cash');
    `;
  } catch (err) {
    chkPaidErr = err;
  }
  assert(chkPaidErr !== null && chkPaidErr.message.includes('chk_purchase_paid_non_negative'), 'DB rejected negative paid_amount');

  // 2. Negative remaining_amount
  let chkRemErr = null;
  try {
    await sql`
      INSERT INTO purchase_invoices (invoice_number, supplier_account_id, supplier_name_snap, total_amount, paid_amount, remaining_amount, payment_method)
      VALUES ('PUR-TEST-CHK-2', ${sup24.id}, 'مورد فحص', 10000, 11000, -1000, 'cash');
    `;
  } catch (err) {
    chkRemErr = err;
  }
  assert(chkRemErr !== null && (chkRemErr.message.includes('chk_purchase_remaining_non_negative') || chkRemErr.message.includes('chk_purchase_paid_le_total')), 'DB rejected negative remaining_amount / paid > total');

  // 3. Paid > Total
  let chkPaidLeTotalErr = null;
  try {
    await sql`
      INSERT INTO purchase_invoices (invoice_number, supplier_account_id, supplier_name_snap, total_amount, paid_amount, remaining_amount, payment_method)
      VALUES ('PUR-TEST-CHK-3', ${sup24.id}, 'مورد فحص', 10000, 15000, 0, 'cash');
    `;
  } catch (err) {
    chkPaidLeTotalErr = err;
  }
  assert(chkPaidLeTotalErr !== null && (chkPaidLeTotalErr.message.includes('chk_purchase_paid_le_total') || chkPaidLeTotalErr.message.includes('chk_purchase_amounts_balance')), 'DB rejected paid_amount > total_amount');

  // 4. Paid + Remaining != Total
  let chkBalanceErr = null;
  try {
    await sql`
      INSERT INTO purchase_invoices (invoice_number, supplier_account_id, supplier_name_snap, total_amount, paid_amount, remaining_amount, payment_method)
      VALUES ('PUR-TEST-CHK-4', ${sup24.id}, 'مورد فحص', 10000, 3000, 4000, 'cash');
    `;
  } catch (err) {
    chkBalanceErr = err;
  }
  assert(chkBalanceErr !== null && chkBalanceErr.message.includes('chk_purchase_amounts_balance'), 'DB rejected unbalanced amounts (paid + remaining != total)');

  console.log('   ✅ [PASS] All database check constraints strictly enforced by PostgreSQL engine');

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
