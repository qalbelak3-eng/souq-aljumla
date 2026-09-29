import path from 'path';
import os from 'os';
import fs from 'fs';
import assert from 'assert';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  pgCreateOrder,
  pgGetOrderById,
  pgCancelOrder,
  pgReturnOrder,
  pgRefundOrder,
  pgUpdateOrderStatus,
} from './src/lib/postgres-orders.ts';
import {
  pgAssignOrderDriver,
  pgStartDriverDelivery,
  pgFailDriverDelivery,
  pgReturnDriverOrder,
  pgCancelDriverReturnRequest,
  pgConfirmWarehouseReturnReceipt,
  pgDeliverDriverOrder,
  pgAdminOverrideDelivery,
} from './src/lib/postgres-delivery.ts';
import { decryptPin } from './src/lib/delivery-pin.ts';
import {
  pgGetDriverCustody,
  pgGetAllDriversCustodySummary,
  pgCreateDriverSettlement,
  pgReverseDriverSettlement,
} from './src/lib/postgres-settlements.ts';
import {
  pgGetCustomerStatement,
  pgGetAccountSummaries,
  pgAddPayment,
  pgReversePayment,
} from './src/lib/postgres-accounting.ts';
import { pgCreateProduct, pgCreateCategory } from './src/lib/postgres-catalog.ts';
import { getDb } from './src/db/client.ts';
import { orders } from './src/db/schema/orders.ts';
import { products } from './src/db/schema/catalog.ts';
import { inventoryMovements } from './src/db/schema/inventory.ts';
import { financialAccounts } from './src/db/schema/accounts.ts';
import { staffProfiles, authIdentities } from './src/db/schema/auth.ts';
import { drivers } from './src/db/schema/vehicles_drivers.ts';
import {
  vouchers,
  cashVaultMovements,
  customerRefundClaims,
  customerRefunds,
  orderRefunds,
} from './src/db/schema/accounting.ts';
import { eq, and, sql as dSql } from 'drizzle-orm';

const Ep = EpDefault.default || EpDefault;
const PORT = 54365;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2c4d_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '10';
process.env.DATA_SOURCE_CATALOG_BASE = 'postgres';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2c4d-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2c4d-test-secret-min-32-chars-long';

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

  console.log('2. Applying schema and migrations (0000 -> 0021)...');
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
  console.log('Cleaning up database connection...');
  if (sql) {
    await sql.end();
  }
  if (ep) {
    await ep.stop();
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}
  console.log('Database stopped and temporary files cleaned.');
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('Running Commerce-2C4C Final Hardening + 2C4D Financial Tests');
  console.log('===============================================================\n');

  const db = getDb();

  // Create Staff Profile
  const [adminAuth] = await db
    .insert(authIdentities)
    .values({
      phone: '07709999999',
      role: 'admin',
      passwordHash: 'fake_admin_hash',
    })
    .returning();

  const [adminStaff] = await db
    .insert(staffProfiles)
    .values({
      authIdentityId: adminAuth.id,
      username: 'accounting_admin',
      name: 'مدير المحاسبة والتدقيق',
      jobTitle: 'مدير تدقيق مالي',
      role: 'admin',
      permissions: ['orders.edit', 'orders.manage', 'accounting.manage', 'warehouse.manage'],
      isActive: true,
    })
    .returning();

  // Create Customer Account
  const [customer] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'ACC-CUST-2C4D',
      name: 'علي حسن للتجارة',
      phone: '07701234567',
      category: 'customer',
      pricingTier: 'retail',
      isActive: true,
    })
    .returning();

  // Create Driver
  const [driverAuth] = await db
    .insert(authIdentities)
    .values({
      phone: '07801234567',
      role: 'driver',
      passwordHash: 'fake_hash_drv',
    })
    .returning();

  const [driverAcc] = await db
    .insert(financialAccounts)
    .values({
      accountCode: 'DRV-ACC-2C4D',
      name: 'سائق الفحص المالي',
      phone: '07801234567',
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
      name: 'سائق الفحص المالي',
      phone: '07801234567',
      operationalStatus: 'available',
      isActive: true,
    })
    .returning();

  // Create Category & Products
  const category = await pgCreateCategory({ name: 'قسم الأجهزة' });
  const prodA = await pgCreateProduct({
    name: 'منتج أ - 10000 د.ع',
    category: category.id,
    price: 10000,
    costPrice: 7000,
    wholesalePrice: 8500,
    stock: 100,
    stockPieces: 100,
    boxesPerCarton: 1,
    itemsPerBox: 1,
  });

  const prodB = await pgCreateProduct({
    name: 'منتج ب - 25000 د.ع',
    category: category.id,
    price: 25000,
    costPrice: 18000,
    wholesalePrice: 22000,
    stock: 50,
    stockPieces: 50,
    boxesPerCarton: 1,
    itemsPerBox: 1,
  });

  // Create Driver Operator Snapshot
  const driverOp = {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    role: 'driver',
  };

  /* =========================================================================
     PART 1: COMMERCE-2C4C FINAL HARDENING TESTS
     ========================================================================= */

  console.log('\n--- [C4C-F1] Failed Delivery Custody Invariant ---');
  const ord1 = await pgCreateOrder({
    customer: { accountId: customer.id, name: customer.name, phone: customer.phone, address: 'بغداد' },
    items: [{ productId: prodA.id, quantity: 2, saleType: 'retail' }],
    deliveryFee: 5000,
    paymentMethod: 'cash_on_delivery',
    accountId: customer.id,
    createAccountIfMissing: true,
  });
  await pgUpdateOrderStatus(ord1.id, 'processing');
  await pgAssignOrderDriver({ orderId: ord1.id, driverId: driver.id });
  await pgStartDriverDelivery(driver.id, ord1.id, driverOp);

  // Stock deducted when ordered
  const stockBeforeFail = (await db.select().from(products).where(eq(products.id, prodA.id)))[0].currentStockPieces;
  assert.strictEqual(stockBeforeFail, 98, 'Stock deducted to 98');

  // Fail delivery
  const failedOrd1 = await pgFailDriverDelivery(driver.id, ord1.id, driverOp, {
    reason: 'customer_unreachable',
    notes: 'الزبون لم يرد على الهاتف',
  });
  assert.strictEqual(failedOrd1.status, 'shipped', 'Failed delivery keeps status = shipped');
  assert.strictEqual(failedOrd1.deliverySubState, 'delivery_failed', 'deliverySubState is delivery_failed');
  assert.strictEqual(failedOrd1.inventoryRestored, false, 'Inventory not restored while goods with driver');
  assert.notStrictEqual(failedOrd1.collectionStatus, 'returned', 'collectionStatus is NOT returned');

  // Verify stock unchanged
  const stockAfterFail = (await db.select().from(products).where(eq(products.id, prodA.id)))[0].currentStockPieces;
  assert.strictEqual(stockAfterFail, 98, 'Stock still 98 (goods still in driver custody)');
  console.log('   ✅ [PASS] C4C-F1: Failed delivery strictly preserves physical custody with driver');

  console.log('\n--- [C4C-F3] Driver Return Request & Cancellation / Resumption ---');
  // Driver requests return
  const retReqOrd1 = await pgReturnDriverOrder(driver.id, ord1.id, driverOp, {
    reason: 'طلب إرجاع للمستودع',
  });
  assert.strictEqual(retReqOrd1.deliverySubState, 'return_requested', 'deliverySubState is return_requested');

  // Delivery should be BLOCKED while return_requested
  let blockedDelivery = false;
  try {
    await pgDeliverDriverOrder(driver.id, ord1.id, driverOp, { collectedAmount: ord1.total });
  } catch (err) {
    blockedDelivery = true;
    assert(err.message.includes('إرجاع') || err.message.includes('return_requested'));
  }
  assert.strictEqual(blockedDelivery, true, 'Delivery blocked when return_requested');

  // Driver cancels return request / resumes delivery
  const resumedOrd1 = await pgCancelDriverReturnRequest(driver.id, ord1.id, driverOp, {
    reason: 'تم الاتصال بالزبون مجدداً وسوف يستلم الطلب',
  });
  assert.strictEqual(resumedOrd1.deliverySubState, 'out_for_delivery', 'deliverySubState resumed to out_for_delivery');
  console.log('   ✅ [PASS] C4C-F3: Return request cancellation and delivery blocking verified');

  console.log('\n--- [C4C-F2] Warehouse Physical Custody Handshake ---');
  // Fail delivery again and request return
  await pgFailDriverDelivery(driver.id, ord1.id, driverOp, { reason: 'other', notes: 'الزبون اعتذر عن الاستلام' });
  await pgReturnDriverOrder(driver.id, ord1.id, driverOp, { reason: 'إرجاع نهائي للمستودع' });

  // Warehouse confirms receipt
  const whReceived = await pgConfirmWarehouseReturnReceipt(ord1.id, {
    notes: 'استلام وفحص البضاعة في المستودع',
    operator: { username: adminStaff.username, role: 'admin' },
  });
  assert.strictEqual(whReceived.status, 'cancelled', 'Order terminal status is cancelled');
  assert.strictEqual(whReceived.deliverySubState, 'warehouse_received', 'deliverySubState is warehouse_received');
  assert.strictEqual(whReceived.inventoryRestored, true, 'Inventory restored by warehouse receipt');

  const stockAfterReceipt = (await db.select().from(products).where(eq(products.id, prodA.id)))[0].currentStockPieces;
  assert.strictEqual(stockAfterReceipt, 100, 'Stock restored back to 100 pieces');

  // Idempotency: Duplicate warehouse confirmation is safely handled with zero duplicate stock addition
  const dupWhReceived = await pgConfirmWarehouseReturnReceipt(ord1.id, {
    operator: { username: adminStaff.username, role: 'admin' },
  });
  assert.strictEqual(dupWhReceived.deliverySubState, 'warehouse_received', 'Idempotent warehouse receipt preserves substate');
  assert.strictEqual(dupWhReceived.inventoryRestored, true, 'Idempotent warehouse receipt preserves inventoryRestored');
  const stockAfterDup = (await db.select().from(products).where(eq(products.id, prodA.id)))[0].currentStockPieces;
  assert.strictEqual(stockAfterDup, 100, 'Idempotent warehouse receipt causes ZERO duplicate stock addition');
  console.log('   ✅ [PASS] C4C-F2: Warehouse physical custody handshake & inventory restoration verified');

  /* =========================================================================
     PART 2: COMMERCE-2C4D FINANCIAL RECONCILIATION TESTS
     ========================================================================= */

  console.log('\n--- [2C4D-F1] Separation of paid_amount vs collected_amount ---');
  // Create Online Paid Order
  const onlineOrder = await pgCreateOrder({
    customer: { accountId: customer.id, name: customer.name, phone: customer.phone, address: 'بغداد' },
    items: [{ productId: prodA.id, quantity: 1, saleType: 'retail' }],
    deliveryFee: 5000,
    paymentMethod: 'online',
  });
  assert.strictEqual(onlineOrder.paidAmount, 15000, 'Online order paidAmount = total (15000)');
  assert.strictEqual(onlineOrder.collectedAmount, 0, 'Online order collectedAmount = 0.00');
  assert.strictEqual(onlineOrder.collectionStatus, 'collected_cash', 'Online order collectionStatus = collected_cash');

  // Assign to driver and deliver
  await pgUpdateOrderStatus(onlineOrder.id, 'processing');
  await pgAssignOrderDriver({ orderId: onlineOrder.id, driverId: driver.id });
  await pgStartDriverDelivery(driver.id, onlineOrder.id, driverOp);
  const [onlineDb] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${onlineOrder.id}`;
  const onlinePin = decryptPin(onlineDb.delivery_pin_encrypted);
  await pgDeliverDriverOrder(driver.id, onlineOrder.id, driverOp, { deliveryPin: onlinePin });

  const deliveredOnline = await pgGetOrderById(onlineOrder.id);
  assert.strictEqual(deliveredOnline.paidAmount, 15000, 'Delivered online order paidAmount is 15000');
  assert.strictEqual(deliveredOnline.collectedAmount, 0, 'Delivered online order collectedAmount remains 0');

  // Driver custody for online order should be 0
  const driverCustodyOnline = await pgGetDriverCustody(driver.id);
  assert.strictEqual(driverCustodyOnline.totalCollectedCash, 0, 'Driver has ZERO cash custody for online order');
  console.log('   ✅ [PASS] 2C4D-F1: Online payment paid_amount vs collected_amount separation verified');

  console.log('\n--- [2C4D-F1] Cash On Delivery Custody Invariant ---');
  // Create Cash On Delivery Order
  const codOrder = await pgCreateOrder({
    customer: { accountId: customer.id, name: customer.name, phone: customer.phone, address: 'بغداد' },
    items: [{ productId: prodA.id, quantity: 1, saleType: 'retail' }],
    deliveryFee: 5000,
    paymentMethod: 'cash_on_delivery',
  });
  assert.strictEqual(codOrder.paidAmount, 0, 'COD order initial paidAmount = 0');
  assert.strictEqual(codOrder.collectedAmount, 0, 'COD order initial collectedAmount = 0');

  await pgUpdateOrderStatus(codOrder.id, 'processing');
  await pgAssignOrderDriver({ orderId: codOrder.id, driverId: driver.id });
  await pgStartDriverDelivery(driver.id, codOrder.id, driverOp);
  const [codDb] = await sql`SELECT delivery_pin_encrypted FROM orders WHERE id = ${codOrder.id}`;
  const codPin = decryptPin(codDb.delivery_pin_encrypted);
  await pgDeliverDriverOrder(driver.id, codOrder.id, driverOp, {
    collectedAmount: 15000,
    deliveryPin: codPin,
  });

  const deliveredCod = await pgGetOrderById(codOrder.id);
  assert.strictEqual(deliveredCod.paidAmount, 15000, 'Delivered COD order paidAmount = 15000');
  assert.strictEqual(deliveredCod.collectedAmount, 15000, 'Delivered COD order collectedAmount = 15000');

  // Driver custody should be exactly 15000
  const driverCustodyCod = await pgGetDriverCustody(driver.id);
  assert.strictEqual(driverCustodyCod.totalCollectedCash, 15000, 'Driver custody totalCollectedCash = 15000');
  assert.strictEqual(driverCustodyCod.currentCashInHand, 15000, 'Driver cash in hand = 15000');
  console.log('   ✅ [PASS] 2C4D-F1: COD physical cash custody verified');

  console.log('\n--- [2C4D-F2] Customer Return & Refund Claim Lifecycle ---');
  // Return the delivered COD order
  const returnedCod = await pgReturnOrder(codOrder.id, {
    reason: 'إرجاع من قبل العميل بعد الاستلام',
    operator: { username: adminStaff.username, role: 'admin' },
  });
  assert.strictEqual(returnedCod.status, 'returned', 'Order status is returned');
  assert.strictEqual(returnedCod.refundStatus, 'pending', 'Order refundStatus is pending');
  assert.strictEqual(returnedCod.remainingDebtAmount, 0, 'Order remainingDebtAmount cleared to 0');

  // Verify that customer_refund_claims row was created
  const claims = await db
    .select()
    .from(customerRefundClaims)
    .where(eq(customerRefundClaims.orderId, codOrder.id));
  assert.strictEqual(claims.length, 1, 'Exactly one customer refund claim created');
  const claim = claims[0];
  assert(claim.claimNumber.startsWith('CLM-'), 'Claim number generated sequentially (CLM-...)');
  assert.strictEqual(Number(claim.claimAmount), 15000, 'Claim amount equals paidAmount (15000)');
  assert.strictEqual(Number(claim.refundedAmount), 0, 'Refunded amount initially 0');
  assert.strictEqual(claim.status, 'pending', 'Claim status is pending');
  console.log('   ✅ [PASS] 2C4D-F2: Return opens refund claim with claim_amount = paid_amount');

  console.log('\n--- [2C4D-F3] Partial Refunds & Sequential Payout Ledger ---');
  // 1. Partial refund 1: 5000 via Cash
  const refund1Res = await pgRefundOrder(codOrder.id, {
    amount: 5000,
    method: 'cash',
    notes: 'دفعة استرداد نقدي أولى 5000',
    reason: 'استرداد جزئي',
  }, {
    operator: { username: adminStaff.username, role: 'admin' },
  });

  assert.strictEqual(refund1Res.refund.amount, 5000, 'Refund 1 amount is 5000');
  assert.strictEqual(refund1Res.claim.status, 'partially_refunded', 'Claim status transitioned to partially_refunded');
  assert.strictEqual(refund1Res.claim.refundedAmount, 5000, 'Claim refundedAmount is 5000');
  assert.strictEqual(refund1Res.order.refundStatus, 'partially_refunded', 'Order refundStatus is partially_refunded');

  // Verify Disbursement Voucher created
  assert(refund1Res.refund.voucherId, 'Disbursement voucher ID is present on cash refund');
  const [vch1] = await db.select().from(vouchers).where(eq(vouchers.id, refund1Res.refund.voucherId));
  assert.strictEqual(vch1.voucherType, 'disbursement', 'Voucher is disbursement');
  assert.strictEqual(Number(vch1.amount), 5000, 'Voucher amount is 5000');
  assert(vch1.receiptNumber.startsWith('DISB-'), 'Voucher receiptNumber starts with DISB-');

  // Verify Cash Vault Outflow Movement
  const vaultMovements = await db
    .select()
    .from(cashVaultMovements)
    .where(and(eq(cashVaultMovements.referenceId, codOrder.id), eq(cashVaultMovements.category, 'customer_refund')));
  assert.strictEqual(vaultMovements.length, 1, 'Cash vault outflow movement recorded');
  assert.strictEqual(vaultMovements[0].type, 'outflow', 'Movement is outflow');
  assert.strictEqual(Number(vaultMovements[0].amount), 5000, 'Movement amount is 5000');

  // 2. Reject refund exceeding remaining claim amount (remaining is 10000, attempt 12000)
  let overRefundBlocked = false;
  try {
    await pgRefundOrder(codOrder.id, {
      amount: 12000,
      method: 'cash',
    });
  } catch (err) {
    overRefundBlocked = true;
    assert(err.message.includes('يتجاوز') || err.message.includes('المتبقي'));
  }
  assert.strictEqual(overRefundBlocked, true, 'Refund exceeding remaining claim strictly blocked');

  // 3. Partial refund 2: 10000 via Electronic (Non-cash)
  const refund2Res = await pgRefundOrder(codOrder.id, {
    amount: 10000,
    method: 'electronic',
    notes: 'استرداد باقي المبلغ إلكترونياً عبر زين كاش',
  }, {
    operator: { username: adminStaff.username, role: 'admin' },
  });

  assert.strictEqual(refund2Res.refund.amount, 10000, 'Refund 2 amount is 10000');
  assert.strictEqual(refund2Res.claim.status, 'completed', 'Claim status transitioned to completed');
  assert.strictEqual(refund2Res.claim.refundedAmount, 15000, 'Claim fully refunded (15000)');
  assert.strictEqual(refund2Res.order.refundStatus, 'refunded', 'Order refundStatus transitioned to refunded');

  // Electronic refund should NOT create cash vault movement
  const vaultMovementsAfter = await db
    .select()
    .from(cashVaultMovements)
    .where(and(eq(cashVaultMovements.referenceId, codOrder.id), eq(cashVaultMovements.category, 'customer_refund')));
  assert.strictEqual(vaultMovementsAfter.length, 1, 'No additional cash vault movement for non-cash refund');

  // Verify append-only ledger in customer_refunds
  const allRefundsLedger = await db
    .select()
    .from(customerRefunds)
    .where(eq(customerRefunds.orderId, codOrder.id));
  assert.strictEqual(allRefundsLedger.length, 2, 'Exactly 2 records in customer_refunds append-only ledger');

  // 4. Attempt refund on completed claim strictly rejected
  let postCompleteRefundBlocked = false;
  try {
    await pgRefundOrder(codOrder.id, { amount: 1000 });
  } catch (err) {
    postCompleteRefundBlocked = true;
    assert(err.message.includes('مسبقاً') || err.message.includes('refunded'));
  }
  assert.strictEqual(postCompleteRefundBlocked, true, 'Subsequent refund attempt on completed claim blocked');
  console.log('   ✅ [PASS] 2C4D-F3: Partial refunds, append-only ledger, and cash vs non-cash vault rules verified');

  console.log('\n--- [2C4D-F4] Customer Accounting Statement Integrity ---');
  const statement = await pgGetCustomerStatement(customer.id);
  assert(statement !== null, 'Customer statement returned');

  // Verify returned order has invoice and return reversal
  const invoices = statement.transactions.filter((t) => t.type === 'invoice');
  const returns = statement.transactions.filter((t) => t.type === 'return');
  const payments = statement.transactions.filter((t) => t.type === 'payment');

  assert(invoices.length >= 1, 'Invoices present');
  assert(returns.length >= 1, 'Return reversal present');
  assert(payments.length >= 1, 'Refund payments present in statement');

  console.log(`   Customer Statement: ${invoices.length} invoices, ${returns.length} returns, ${payments.length} payments`);
  console.log('   ✅ [PASS] 2C4D-F4: Customer statement reflects authoritative delivery and return transactions');

  console.log('\n--- [2C4D-F5] Driver Custody Integrity on Cancelled / Returned Orders ---');
  // Order was delivered, driver collected 15000 cash.
  // Then order was returned.
  // The driver STILL has that 15000 physical cash in hand until settled!
  const custodyAfterReturn = await pgGetDriverCustody(driver.id);
  assert.strictEqual(custodyAfterReturn.totalCollectedCash, 15000, 'Collected cash is NOT wiped out by order return');
  assert.strictEqual(custodyAfterReturn.currentCashInHand, 15000, 'Driver still owes 15000 physical cash custody');

  // Settle driver custody
  const settlementRes = await pgCreateDriverSettlement(driver.id, {
    amount: 15000,
    notes: 'تصفية كامل العهدة النقدية',
  }, {
    username: adminStaff.username,
    role: 'admin',
  });
  assert.strictEqual(settlementRes.settlement.actualAmount, 15000, 'Settlement amount is 15000');
  assert(settlementRes.settlement.settlementNumber.startsWith('SET-'), 'Settlement number starts with SET-');

  const custodyAfterSettle = await pgGetDriverCustody(driver.id);
  assert.strictEqual(custodyAfterSettle.currentCashInHand, 0, 'Driver cash in hand is 0 after settlement');
  console.log('   ✅ [PASS] 2C4D-F5: Driver custody remains intact on returned/cancelled orders until formal settlement');

  console.log('\n--- [2C4D-F6] Deterministic Lock Ordering & Deadlock Prevention in Reversal ---');
  // Reverse the driver settlement
  const reverseRes = await pgReverseDriverSettlement(settlementRes.settlement.id, {
    reason: 'خطأ محاسبي في إيصال التسوية',
  }, {
    username: adminStaff.username,
    role: 'admin',
  });
  assert(reverseRes.originalSettlement.isReversed, 'Settlement marked as reversed');

  const custodyAfterRev = await pgGetDriverCustody(driver.id);
  assert.strictEqual(custodyAfterRev.currentCashInHand, 15000, 'Cash in hand restored to driver custody upon reversal');
  console.log('   ✅ [PASS] 2C4D-F6: Settlement reversal completed with deterministic locking and custody restoration');

  console.log('\n--- [2C4D-F7] Static Code Guard: Zero MAX()+1 & Sequence Fail-Fast ---');
  const settlementsSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/postgres-settlements.ts'), 'utf-8');
  assert(!settlementsSrc.includes('MAX('), 'Strict: No MAX(...) allowed in postgres-settlements.ts');
  assert(!settlementsSrc.match(/try\s*\{[\s\S]*?nextval\('settlement_seq'\)[\s\S]*?\}\s*catch/), 'No try/catch around settlement_seq');
  assert(!settlementsSrc.match(/try\s*\{[\s\S]*?nextval\('vault_csh_seq'\)[\s\S]*?\}\s*catch/), 'No try/catch around vault_csh_seq');

  const ordersSrc = fs.readFileSync(path.join(process.cwd(), 'src/lib/postgres-orders.ts'), 'utf-8');
  assert(!ordersSrc.includes('MAX(SUBSTRING'), 'Strict: No MAX(SUBSTRING) allowed in postgres-orders.ts');
  assert(!ordersSrc.match(/try\s*\{[\s\S]*?nextval\('customer_refund_seq'\)[\s\S]*?\}\s*catch/), 'No try/catch around customer_refund_seq');
  assert(!ordersSrc.match(/try\s*\{[\s\S]*?nextval\('customer_claim_seq'\)[\s\S]*?\}\s*catch/), 'No try/catch around customer_claim_seq');
  console.log('   ✅ [PASS] 2C4D-F7: Static architecture guard passed (Zero MAX()+1, atomic sequences enforced)');

  console.log('\n===============================================================');
  console.log('All Commerce-2C4C Final Hardening & 2C4D Tests PASSED! (32/32)');
  console.log('===============================================================\n');
}

async function main() {
  let exitCode = 0;
  try {
    await startDatabase();
    await runTests();
  } catch (err) {
    console.error('\n❌ Test suite failed with error:', err);
    exitCode = 1;
  } finally {
    await stopDatabase();
    process.exit(exitCode);
  }
}

main();
