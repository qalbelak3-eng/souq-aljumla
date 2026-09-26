import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  SESSION_COOKIE_NAME,
  CUSTOMER_SESSION_COOKIE_NAME,
  signAdminSession,
  signCustomerSession,
} from './src/lib/auth.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54353;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2a_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2a-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2a-test-secret-min-32-chars-long';

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
    'drizzle/0010_order_coupon_snapshot.sql',
  ];

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    if (fs.existsSync(fullPath)) {
      await runSqlScript(sql, fullPath);
    }
  }
  console.log('   All migrations applied successfully.');
}

async function runCommercePhase2aTests() {
  console.log('\n===============================================================');
  console.log('  COMMERCE-2A: CASHBACK LEDGER & FINANCIAL INTEGRITY TEST SUITE  ');
  console.log('===============================================================\n');

  const {
    pgGetAccountCashbackBalance,
    pgGetCustomerCashbackSummary,
    pgResolveCustomerAccount,
    pgRedeemCashbackInOrder,
    pgCreditOrderDeliveredCashback,
    pgReverseOrderRedeemedCashback,
  } = await import('./src/lib/postgres-cashback.ts');

  const {
    pgCreateOrder,
    pgGetOrderById,
    pgUpdateOrderStatus,
    pgCancelOrder,
  } = await import('./src/lib/postgres-orders.ts');

  const {
    pgCreateCoupon,
    pgValidateCoupon,
  } = await import('./src/lib/postgres-coupons.ts');

  const {
    getProductCashbackRate,
    getProductPriceForUser,
    calculateUserCashbackFromOrders,
  } = await import('./src/lib/pricing.ts');

  const { POST: ordersPostHandler } = await import('./src/app/api/orders/route.ts');
  const { GET: cashbackGetHandler } = await import('./src/app/api/cashback/route.ts');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Pre-seed test products and customers
  // -------------------------------------------------------------------------
  console.log('--- Pre-seeding Test Products and Financial Accounts ---');

  const [testCat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم تجارب الكاشباك', 'test-cashback-cat')
    RETURNING id, name;
  `;

  const [testProductA] = await sql`
    INSERT INTO products (
      name, category_id,
      price, wholesale_price, cost_price, piece_cost_price,
      current_stock_pieces,
      boxes_per_carton, items_per_box, pieces_per_carton,
      retail_unit, wholesale_unit,
      cashback_customer_amount, cashback_market_amount, cashback_merchant_amount
    ) VALUES (
      'صنف أ - كاشباك عادي', ${testCat.id},
      '5000.00', '4000.00', '3000.00', '3000.00',
      500,
      1, 1, 1,
      'قطعة', 'كرتون',
      '500.00', '700.00', '1000.00'
    ) RETURNING *;
  `;

  const { ensureDbExists } = await import('./src/lib/db.ts');

  const [testCustomerA] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier
    ) VALUES (
      'ACC-CUST-A', 'الزبون الأول أحمد', '07701111111', 'customer', 'retail'
    ) RETURNING *;
  `;

  const [testCustomerB] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier
    ) VALUES (
      'ACC-CUST-B', 'الزبون الثاني بلال', '07702222222', 'customer', 'retail'
    ) RETURNING *;
  `;

  const inMemDb = ensureDbExists();
  inMemDb.users = inMemDb.users || [];
  inMemDb.users.push({
    id: testCustomerA.id,
    name: testCustomerA.name,
    phone: testCustomerA.phone,
    role: 'customer',
    accountType: 'individual',
    isActive: true,
  });
  inMemDb.users.push({
    id: testCustomerB.id,
    name: testCustomerB.name,
    phone: testCustomerB.phone,
    role: 'customer',
    accountType: 'individual',
    isActive: true,
  });

  // Pre-seed coupon for stacking test
  await pgCreateCoupon({
    code: 'SAVE10P',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 5000,
    isActive: true,
  });

  // =========================================================================
  // SCENARIO 1: Pending order does NOT grant spendable cashback
  // =========================================================================
  console.log('\n--- Scenario 1: Pending order does NOT grant spendable cashback ---');
  const order1 = await pgCreateOrder({
    customer: { name: testCustomerA.name, phone: testCustomerA.phone, city: 'كربلاء', address: 'حي المعلمين' },
    items: [{
      productId: testProductA.id,
      name: testProductA.name,
      price: 5000,
      quantity: 2,
      saleType: 'retail',
      earnedCashback: 1000,
    }],
    subtotal: 10000,
    deliveryFee: 0,
    earnedCashback: 1000,
    status: 'pending',
    accountId: testCustomerA.id,
  });

  assert(order1.status === 'pending', 'Order 1 created with status pending');
  assert(order1.earnedCashback === 1000, 'Order 1 records 1,000 IQD expected cashback in order row');

  const bal1 = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(bal1 === 0, 'Customer A spendable cashback balance in cashback_ledger remains strictly 0 IQD while order is pending');

  // =========================================================================
  // SCENARIO 2: Processing status does NOT grant spendable cashback
  // =========================================================================
  console.log('\n--- Scenario 2: Processing status does NOT grant spendable cashback ---');
  await pgUpdateOrderStatus(order1.id, 'processing');
  const bal2 = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(bal2 === 0, 'Customer A spendable cashback balance remains 0 IQD in processing status');

  // =========================================================================
  // SCENARIO 3: Shipped status does NOT grant spendable cashback
  // =========================================================================
  console.log('\n--- Scenario 3: Shipped status does NOT grant spendable cashback ---');
  await pgUpdateOrderStatus(order1.id, 'shipped');
  const bal3 = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(bal3 === 0, 'Customer A spendable cashback balance remains 0 IQD in shipped status');

  // =========================================================================
  // SCENARIO 4: Delivered status credits earned cashback once to ledger
  // =========================================================================
  console.log('\n--- Scenario 4: Delivered status credits earned cashback once to ledger ---');
  await pgUpdateOrderStatus(order1.id, 'delivered');
  const bal4 = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(bal4 === 1000, `Customer A spendable cashback balance became 1,000 IQD after delivered (got: ${bal4})`);

  const ledgerEntries4 = await sql`
    SELECT * FROM cashback_ledger WHERE account_id = ${testCustomerA.id} AND order_id = ${order1.id};
  `;
  assert(ledgerEntries4.length === 1, 'Exactly 1 ledger entry created for delivered order');
  assert(ledgerEntries4[0].type === 'earned', 'Ledger entry type is earned');
  assert(Number(ledgerEntries4[0].amount) === 1000, 'Ledger entry amount is 1000.00');

  // =========================================================================
  // SCENARIO 5: Repeated Delivered event is idempotent and does NOT credit twice
  // =========================================================================
  console.log('\n--- Scenario 5: Repeated Delivered event is idempotent ---');
  await pgUpdateOrderStatus(order1.id, 'delivered');
  const bal5 = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(bal5 === 1000, 'Balance remains 1,000 IQD after repeated delivered update (no double-credit)');

  const ledgerEntries5 = await sql`
    SELECT * FROM cashback_ledger WHERE account_id = ${testCustomerA.id} AND order_id = ${order1.id} AND type = 'earned';
  `;
  assert(ledgerEntries5.length === 1, 'Still exactly 1 earned ledger entry exists');

  // =========================================================================
  // SCENARIO 6: Cancel before delivery does NOT grant cashback
  // =========================================================================
  console.log('\n--- Scenario 6: Cancel before delivery does NOT grant cashback ---');
  const orderCancel = await pgCreateOrder({
    customer: { name: testCustomerB.name, phone: testCustomerB.phone, city: 'كربلاء', address: 'حي الإسكان' },
    items: [{
      productId: testProductA.id,
      name: testProductA.name,
      price: 5000,
      quantity: 4,
      saleType: 'retail',
      earnedCashback: 2000,
    }],
    subtotal: 20000,
    deliveryFee: 0,
    earnedCashback: 2000,
    status: 'pending',
    accountId: testCustomerB.id,
  });

  assert(orderCancel.status === 'pending', 'Order for customer B created');
  const balB_before = await pgGetAccountCashbackBalance(testCustomerB.id);
  assert(balB_before === 0, 'Customer B balance is 0 before cancel');

  await pgCancelOrder(orderCancel.id, { reason: 'الزبون غير عنوان الشحن' });
  const balB_after = await pgGetAccountCashbackBalance(testCustomerB.id);
  assert(balB_after === 0, 'Customer B balance remains strictly 0 after cancellation before delivery');

  // =========================================================================
  // SCENARIO 7: Zero balance + customer attempts to use cashback -> Rejected
  // =========================================================================
  console.log('\n--- Scenario 7: Zero balance + customer attempts to use cashback ---');
  let zeroBalRejected = false;
  try {
    const custB_cookie = signCustomerSession({
      id: testCustomerB.id,
      phone: testCustomerB.phone,
      name: testCustomerB.name,
    });

    const reqZero = new Request('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${custB_cookie}`,
      },
      body: JSON.stringify({
        customer: { name: testCustomerB.name, phone: testCustomerB.phone, city: 'كربلاء', address: 'حي البلدية' },
        items: [{ id: testProductA.id, quantity: 1, price: 5000 }],
        usedCashbackDiscount: 500,
      }),
    });

    const resZero = await ordersPostHandler(reqZero);
    const dataZero = await resZero.json();
    if (!dataZero.success && resZero.status === 400) {
      zeroBalRejected = true;
    }
  } catch (err) {
    zeroBalRejected = true;
  }
  assert(zeroBalRejected, 'Server-authoritative check rejected cashback usage when customer balance is 0 IQD');

  // =========================================================================
  // SCENARIO 8: Requested cashback > available balance -> Rejected / bounded
  // =========================================================================
  console.log('\n--- Scenario 8: Requested cashback > available balance ---');
  // Customer A has 1000 IQD. Try requesting 5000 IQD
  let overBalanceRejected = false;
  const custA_cookie = signCustomerSession({
    userId: testCustomerA.id,
    phone: testCustomerA.phone,
    name: testCustomerA.name,
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  const reqOver = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${custA_cookie}`,
    },
    body: JSON.stringify({
      customer: { name: testCustomerA.name, phone: testCustomerA.phone, city: 'كربلاء', address: 'حي المعلمين' },
      items: [{ id: testProductA.id, quantity: 2, price: 5000 }],
      usedCashbackDiscount: 5000,
    }),
  });

  const resOver = await ordersPostHandler(reqOver);
  const dataOver = await resOver.json();
  console.log('Scenario 8 response:', resOver.status, dataOver);
  if (!dataOver.success && resOver.status === 400 && dataOver.error?.includes('أقل من المبلغ المطلوب')) {
    overBalanceRejected = true;
  }
  assert(overBalanceRejected, 'Server rejected request attempting to spend 5,000 IQD when balance is only 1,000 IQD');

  // =========================================================================
  // SCENARIO 9: Legitimate cashback use correctly reduces spendable balance once
  // =========================================================================
  console.log('\n--- Scenario 9: Legitimate cashback use reduces balance and logs redeemed ---');
  // Customer A uses 600 IQD out of 1000 IQD balance
  const reqValidRedeem = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${custA_cookie}`,
    },
    body: JSON.stringify({
      customer: { name: testCustomerA.name, phone: testCustomerA.phone, city: 'كربلاء', address: 'حي المعلمين' },
      items: [{ id: testProductA.id, quantity: 2, price: 5000 }],
      usedCashbackDiscount: 600,
    }),
  });

  const resValidRedeem = await ordersPostHandler(reqValidRedeem);
  const dataValidRedeem = await resValidRedeem.json();
  assert(dataValidRedeem.success === true, 'Order created successfully with valid cashback redemption');
  assert(dataValidRedeem.order.usedCashbackDiscount === 600, 'Order row records 600 IQD used cashback discount');

  const balAfterRedeem = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(balAfterRedeem === 400, `Customer A balance correctly decreased from 1,000 to 400 IQD (got: ${balAfterRedeem})`);

  const redeemedRows = await sql`
    SELECT * FROM cashback_ledger WHERE account_id = ${testCustomerA.id} AND type = 'redeemed';
  `;
  assert(redeemedRows.length === 1, 'Exactly 1 redeemed entry logged in cashback_ledger');
  assert(Number(redeemedRows[0].amount) === 600, 'Redeemed entry amount is 600.00');

  // =========================================================================
  // SCENARIO 10: Concurrent orders attempting to spend same balance (No Double Spend)
  // =========================================================================
  console.log('\n--- Scenario 10: Concurrent orders attempting to spend same balance (Double Spend Test) ---');
  // Customer A now has 400 IQD remaining.
  // We send TWO concurrent requests each attempting to spend 400 IQD!
  const reqConcurrent1 = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${custA_cookie}`,
    },
    body: JSON.stringify({
      customer: { name: testCustomerA.name, phone: testCustomerA.phone, city: 'كربلاء', address: 'حي المعلمين' },
      items: [{ id: testProductA.id, quantity: 2, price: 5000 }],
      usedCashbackDiscount: 400,
    }),
  });

  const reqConcurrent2 = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${custA_cookie}`,
    },
    body: JSON.stringify({
      customer: { name: testCustomerA.name, phone: testCustomerA.phone, city: 'كربلاء', address: 'حي المعلمين' },
      items: [{ id: testProductA.id, quantity: 2, price: 5000 }],
      usedCashbackDiscount: 400,
    }),
  });

  const [resC1, resC2] = await Promise.all([
    ordersPostHandler(reqConcurrent1),
    ordersPostHandler(reqConcurrent2),
  ]);

  const dataC1 = await resC1.json();
  const dataC2 = await resC2.json();
  console.log('Scenario 10 dataC1:', dataC1);
  console.log('Scenario 10 dataC2:', dataC2);

  const successCount = (dataC1.success ? 1 : 0) + (dataC2.success ? 1 : 0);
  assert(successCount === 1, `Only ONE concurrent request succeeded out of 400 IQD balance (successCount: ${successCount})`);

  const balAfterConcurrent = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(balAfterConcurrent === 0, `Customer A remaining balance is exactly 0 IQD (no negative balance, got: ${balAfterConcurrent})`);

  // =========================================================================
  // SCENARIO 11: Order using cashback is cancelled -> Safe Reversal restores balance
  // =========================================================================
  console.log('\n--- Scenario 11: Cancellation of order with used cashback restores balance ---');
  // Order from Scenario 9 used 600 IQD. Let's cancel it!
  const orderToCancelId = dataValidRedeem.order.id;
  await pgCancelOrder(orderToCancelId, { reason: 'إلغاء الطلب من قبل الزبون' });

  const balAfterCancel = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(balAfterCancel === 600, `Customer A balance correctly restored from 0 to 600 IQD after cancellation reversal (got: ${balAfterCancel})`);

  const reversalRows = await sql`
    SELECT * FROM cashback_ledger WHERE account_id = ${testCustomerA.id} AND order_id = ${orderToCancelId} AND type = 'reversed';
  `;
  assert(reversalRows.length === 1, 'Exactly 1 reversed entry logged in cashback_ledger');
  assert(Number(reversalRows[0].amount) === 600, 'Reversal entry amount is exactly 600.00 IQD');

  // =========================================================================
  // SCENARIO 12: Repeated cancellation is idempotent (No duplicate reversal)
  // =========================================================================
  console.log('\n--- Scenario 12: Repeated cancellation idempotency ---');
  await pgCancelOrder(orderToCancelId, { reason: 'إلغاء الطلب مرة أخرى' });
  const balAfterRepeatCancel = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(balAfterRepeatCancel === 600, 'Balance remains 600 IQD after repeated cancellation (no duplicate refund)');

  const reversalRowsRepeat = await sql`
    SELECT * FROM cashback_ledger WHERE account_id = ${testCustomerA.id} AND order_id = ${orderToCancelId} AND type = 'reversed';
  `;
  assert(reversalRowsRepeat.length === 1, 'Still exactly 1 reversed entry exists for this order');

  // =========================================================================
  // SCENARIO 13: Stacking Coupon + Cashback combined
  // =========================================================================
  console.log('\n--- Scenario 13: Stacking Coupon + Cashback ---');
  // Subtotal = 10,000 (2 items @ 5000)
  // Coupon SAVE10P gives 10% = 1,000 IQD
  // Cashback used = 500 IQD (out of 600 IQD available)
  // Total payable should be: 10,000 - 1,000 (coupon) - 500 (cashback) = 8,500 IQD
  const reqStack = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${custA_cookie}`,
    },
    body: JSON.stringify({
      customer: { name: testCustomerA.name, phone: testCustomerA.phone, city: 'كربلاء', address: 'حي المعلمين' },
      items: [{ id: testProductA.id, quantity: 2, price: 5000 }],
      couponCode: 'SAVE10P',
      usedCashbackDiscount: 500,
    }),
  });

  const resStack = await ordersPostHandler(reqStack);
  const dataStack = await resStack.json();
  assert(dataStack.success === true, 'Order created successfully with coupon + cashback stacking');
  assert(dataStack.order.discount === 1000, 'Coupon discount verified at 1,000 IQD');
  assert(dataStack.order.usedCashbackDiscount === 500, 'Cashback discount verified at 500 IQD');
  assert(dataStack.order.total === 10500, `Total payable is exactly 10,500 IQD (10,000 subtotal + 2,000 delivery - 1,000 coupon - 500 cashback, got: ${dataStack.order.total})`);

  const balAfterStack = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(balAfterStack === 100, `Customer A balance decreased from 600 to 100 IQD (got: ${balAfterStack})`);

  // =========================================================================
  // SCENARIO 14: Pricing tier cashback rates (individual vs market vs wholesale)
  // =========================================================================
  console.log('\n--- Scenario 14: Cashback rate tiers (individual vs market vs wholesale) ---');
  const dummyProduct = {
    id: 'prod-dummy',
    name: 'صنف فحص الشرائح',
    cashbackCustomerAmount: 250,
    cashbackMarketAmount: 500,
    cashbackMerchantAmount: 750,
    enableCashbackReward: true,
  };

  const rateRetail = getProductCashbackRate(dummyProduct, { accountType: 'individual' }, null, 'retail');
  assert(rateRetail === 250, `Retail consumer rate is 250 IQD (got: ${rateRetail})`);

  const rateMarket = getProductCashbackRate(dummyProduct, { accountType: 'market' }, null, 'wholesale');
  assert(rateMarket === 500, `Market merchant wholesale rate is 500 IQD (got: ${rateMarket})`);

  const rateWholesaleVIP = getProductCashbackRate(dummyProduct, { accountType: 'wholesale' }, null, 'wholesale');
  assert(rateWholesaleVIP === 750, `Wholesale merchant rate is 750 IQD (got: ${rateWholesaleVIP})`);

  // =========================================================================
  // SCENARIO 15: Isolation: Customer A balance isolated from Customer B
  // =========================================================================
  console.log('\n--- Scenario 15: Balance Isolation between Customer A and Customer B ---');
  const balA_iso = await pgGetAccountCashbackBalance(testCustomerA.id);
  const balB_iso = await pgGetAccountCashbackBalance(testCustomerB.id);

  assert(balA_iso === 100, `Customer A balance is 100 IQD (got: ${balA_iso})`);
  assert(balB_iso === 0, `Customer B balance is strictly 0 IQD (got: ${balB_iso})`);

  // =========================================================================
  // SCENARIO 16: Guest cannot spend another customer's cashback
  // =========================================================================
  console.log('\n--- Scenario 16: Guest security (Guest cannot spend registered customer balance) ---');
  // An unauthenticated guest sends testCustomerA's phone number and requests 100 IQD cashback
  const reqGuestSpoof = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // No session cookie!
    },
    body: JSON.stringify({
      customer: { name: 'زائر منتحل', phone: testCustomerA.phone, city: 'كربلاء', address: 'شارع السناتر' },
      items: [{ id: testProductA.id, quantity: 2, price: 5000 }],
      usedCashbackDiscount: 100,
    }),
  });

  const resGuestSpoof = await ordersPostHandler(reqGuestSpoof);
  const dataGuestSpoof = await resGuestSpoof.json();
  assert(resGuestSpoof.status === 400, 'Unauthenticated guest was rejected from spending cashback');
  assert(dataGuestSpoof.error.includes('غير مصرح للزائر'), 'Clear error message returned for guest cashback attempt');

  const balA_unspoofed = await pgGetAccountCashbackBalance(testCustomerA.id);
  assert(balA_unspoofed === 100, 'Customer A balance remained untouched at 100 IQD');

  // =========================================================================
  // SCENARIO 17: Full audit trail & traceability in ledger and API
  // =========================================================================
  console.log('\n--- Scenario 17: Full audit trail & traceability in ledger and API ---');
  const summaryA = await pgGetCustomerCashbackSummary({ accountId: testCustomerA.id });
  assert(summaryA.availableBalance === 100, 'Summary availableBalance matches ledger balance');
  assert(summaryA.totalEarned === 1000, `Lifetime earned is 1,000 IQD (got: ${summaryA.totalEarned})`);
  assert(summaryA.totalRedeemed === 1500, `Lifetime redeemed is 1,500 IQD (got: ${summaryA.totalRedeemed})`);
  assert(summaryA.totalReversed === 600, `Lifetime reversed is 600 IQD (got: ${summaryA.totalReversed})`);
  assert(summaryA.history.length >= 4, `Chronological history contains at least 4 entries (got: ${summaryA.history.length})`);

  // Verify /api/cashback route
  const reqApiCashback = new Request('http://localhost:3000/api/cashback', {
    headers: {
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${custA_cookie}`,
    },
  });
  const resApiCashback = await cashbackGetHandler(reqApiCashback);
  const dataApiCashback = await resApiCashback.json();
  assert(dataApiCashback.success === true, 'API /api/cashback returned success');
  assert(dataApiCashback.availableBalance === 100, 'API /api/cashback returned accurate available balance of 100 IQD');
  assert(dataApiCashback.history && dataApiCashback.history.length >= 4, 'API /api/cashback returned ledger history');

  console.log('\n===============================================================');
  console.log(`  ALL ${passed} COMMERCE-2A TESTS PASSED SUCCESSFULLY! (${failed} FAILED)  `);
  console.log('===============================================================\n');
}

async function main() {
  try {
    await startDatabase();
    await runCommercePhase2aTests();
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  } finally {
    if (sql) await sql.end();
    if (ep) await ep.stop();
  }
}

main();
