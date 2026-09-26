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
const PORT = 54352;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase1_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase1-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase1-test-secret-min-32-chars-long';

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
  console.log('   All migrations applied successfully.');
}

async function runCommercePhase1Tests() {
  console.log('\n===============================================================');
  console.log('  COMMERCE-1: TRUSTED SERVER-SIDE PRICING & COUPONS TEST SUITE  ');
  console.log('===============================================================\n');

  const {
    pgGetCoupons,
    pgGetCouponByCode,
    pgGetCouponById,
    pgCreateCoupon,
    pgUpdateCoupon,
    pgDeleteCoupon,
    pgValidateCoupon,
    pgConsumeCoupon,
  } = await import('./src/lib/postgres-coupons.ts');

  const { pgCreateOrder } = await import('./src/lib/postgres-orders.ts');
  const { pgGetStoreSettings, pgUpdateStoreSettings } = await import('./src/lib/postgres-settings.ts');
  const { pgGetProductById } = await import('./src/lib/postgres-catalog.ts');
  const { POST: ordersPostHandler } = await import('./src/app/api/orders/route.ts');
  const {
    GET: couponsGetHandler,
    POST: couponsPostHandler,
    PUT: couponsPutHandler,
    DELETE: couponsDeleteHandler,
  } = await import('./src/app/api/coupons/route.ts');
  const { POST: couponsValidateHandler } = await import('./src/app/api/coupons/validate/route.ts');
  const { getProductPriceForUser } = await import('./src/lib/pricing.ts');

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

  // Helper to create synthetic Request
  function createJsonRequest(url, method, body, cookieHeader = '') {
    const headers = new Headers();
    headers.set('content-type', 'application/json');
    if (cookieHeader) {
      headers.set('cookie', cookieHeader);
    }
    return new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // Configure store settings with valid warehouse and pricing
  await pgUpdateStoreSettings({
    deliveryPricingMode: 'fixed',
    deliveryFee: 5000,
    freeDeliveryThreshold: 100000,
    minOrderAmount: 10000,
    warehouseLat: 32.6160,
    warehouseLng: 44.0249,
    pricePerKm: 500,
  });

  // Seed test categories and products
  console.log('--- Setting up Test Data ---');
  const [testCat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم تجارب التسعير', 'test-pricing-cat')
    RETURNING id, name;
  `;

  const [testComp] = await sql`
    INSERT INTO companies (name)
    VALUES ('شركة الاتحاد للتجارة')
    RETURNING id, name;
  `;

  // Active Product 1: Normal Product
  const [prodActive] = await sql`
    INSERT INTO products (
      name, category_id, company_id,
      boxes_per_carton, items_per_box, pieces_per_carton,
      current_stock_pieces,
      retail_unit, wholesale_unit,
      price, wholesale_price, market_price, box_price, special_price, vip_price,
      piece_cost_price, cost_price
    ) VALUES (
      'شاي الاتحاد الفاخر 500 غم', ${testCat.id}, ${testComp.id},
      2, 12, 24,
      500,
      'باكيت مفرد', 'كرتون جملة',
      5000, 96000, 100000, 50000, 92000, 88000,
      3500, 80000
    ) RETURNING id, name, price, wholesale_price, market_price;
  `;

  // Active Product 2: Lower Price Product
  const [prodActive2] = await sql`
    INSERT INTO products (
      name, category_id, company_id,
      boxes_per_carton, items_per_box, pieces_per_carton,
      current_stock_pieces,
      retail_unit, wholesale_unit,
      price, wholesale_price, piece_cost_price, cost_price
    ) VALUES (
      'سكر الكريستال 1 كغم', ${testCat.id}, ${testComp.id},
      1, 20, 20,
      400,
      'كيس مفرد', 'شوال جملة',
      2000, 36000, 1500, 30000
    ) RETURNING id, name, price, wholesale_price;
  `;

  // Create test auth tokens
  const adminCookie = `${SESSION_COOKIE_NAME}=${signAdminSession({
    userId: 'admin-master',
    username: 'admin',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;

  const staffCookieNoOffers = `${SESSION_COOKIE_NAME}=${signAdminSession({
    userId: 'staff-driver',
    username: 'driver_mgr',
    role: 'staff',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;

  // Customer session tokens
  const individualCustomerCookie = `${CUSTOMER_SESSION_COOKIE_NAME}=${signCustomerSession({
    userId: 'cust-indiv-1',
    phone: '07801111111',
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;

  console.log('\n--- Scenario 1: Non-Existent (Fake) Product ID Rejected ---');
  {
    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'علي حسن', phone: '07801111111', city: 'كربلاء', address: 'حي الحسين' },
      items: [
        { productId: '00000000-0000-0000-0000-000000000099', quantity: 2, price: 5000, saleType: 'retail' },
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 400, 'Orders endpoint returned 400 for fake product ID');
    assert(json.success === false, 'Result success is false');
    assert(json.error.includes('غير موجود أو غير متوفر حالياً'), 'Clear error message indicating non-existent product');
  }

  console.log('\n--- Scenario 2: Forged Client Item Price Overridden / Enforced Server-Side ---');
  {
    // Client tries to pass price: 100 instead of 5000
    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'علي حسن', phone: '07801111111', city: 'كربلاء', address: 'حي الحسين' },
      items: [
        { productId: prodActive.id, quantity: 3, price: 100, saleType: 'retail' },
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 201, 'Order successfully created with server pricing');
    assert(json.success === true, 'Order created');
    assert(Number(json.order.subtotal) === 15000, `Subtotal strictly computed as 3 * 5000 = 15000 (was ${json.order.subtotal})`);
    assert(Number(json.order.items[0].price) === 5000, `Item price strictly 5000, forged 100 rejected`);
    assert(Number(json.order.total) === 20000, `Total is 15000 + 5000 delivery = 20000`);
  }

  console.log('\n--- Scenario 3: Forged Client Arbitrary Discount Forbidden for Customer/Guest ---');
  {
    // Customer tries to inject discount: 8000 without coupon
    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'زبون متلاعب', phone: '07802222222', city: 'كربلاء', address: 'حي المعلمين' },
      discount: 8000,
      items: [
        { productId: prodActive.id, quantity: 4, saleType: 'retail' },
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 400, 'Order rejected with 400 when client injects unauthorized discount');
    assert(json.success === false, 'Order rejected');
    assert(json.error.includes('غير مصرح للعميل بتحديد خصم مباشر'), 'Clear security rejection message');
  }

  console.log('\n--- Scenario 4: Forged Client Delivery Fee Overridden by Server Calculation ---');
  {
    // Store settings has default delivery fee = 5000. Customer passes deliveryFee = 0 or 250
    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'حيدر كريم', phone: '07803333333', city: 'كربلاء', address: 'حي العباس' },
      deliveryFee: 250,
      items: [
        { productId: prodActive.id, quantity: 3, saleType: 'retail' }, // 15000 < 100000 threshold
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 201, 'Order created successfully');
    assert(Number(json.order.deliveryFee) === 5000, `Delivery fee strictly enforced at 5000, forged 250 ignored`);
    assert(Number(json.order.total) === 20000, `Total strictly includes 5000 delivery fee`);
  }

  console.log('\n--- Scenario 5: Expired Coupon Rejected ---');
  {
    const expiredCoupon = await pgCreateCoupon({
      code: 'EXPIRED10',
      discountType: 'percentage',
      discountValue: 10,
      expiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), // yesterday
    });

    const valRes = await pgValidateCoupon('EXPIRED10', 25000);
    assert(valRes.valid === false, 'Validation rejected expired coupon');
    assert(valRes.message.includes('منتهي الصلاحية'), 'Error indicates expired coupon');

    // Also verify rejection via POST /api/orders
    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'عمار ياسر', phone: '07804444444', city: 'كربلاء', address: 'حي رمضان' },
      couponCode: 'EXPIRED10',
      items: [
        { productId: prodActive.id, quantity: 3, saleType: 'retail' },
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 400, 'Order rejected due to expired coupon');
    assert(json.error.includes('منتهي الصلاحية'), 'Order error indicates expired coupon');
  }

  console.log('\n--- Scenario 6: Inactive / Disabled Coupon Rejected ---');
  {
    const disabledCoupon = await pgCreateCoupon({
      code: 'DISABLED20',
      discountType: 'percentage',
      discountValue: 20,
      isActive: false,
    });

    const valRes = await pgValidateCoupon('DISABLED20', 25000);
    assert(valRes.valid === false, 'Validation rejected inactive coupon');
    assert(valRes.message.includes('غير مفعّل'), 'Error indicates inactive coupon');

    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'عمار ياسر', phone: '07804444444', city: 'كربلاء', address: 'حي رمضان' },
      couponCode: 'DISABLED20',
      items: [
        { productId: prodActive.id, quantity: 3, saleType: 'retail' },
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 400, 'Order rejected due to inactive coupon');
    assert(json.error.includes('غير مفعّل'), 'Order error indicates inactive coupon');
  }

  console.log('\n--- Scenario 7: Coupon Target Audience Mismatch Rejected ---');
  {
    const marketCoupon = await pgCreateCoupon({
      code: 'MARKETONLY',
      discountType: 'fixed',
      discountValue: 4000,
      targetAudience: 'market',
      minOrderAmount: 10000,
    });

    // Individual user attempts to use market coupon
    const valRes = await pgValidateCoupon('MARKETONLY', 25000, 'individual');
    assert(valRes.valid === false, 'Validation rejected market coupon for individual');
    assert(valRes.message.includes('أصحاب الماركتات والمحلات فقط'), 'Error indicates target audience mismatch');

    // Customer places order without market account
    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'زبون عادي', phone: '07805555555', city: 'كربلاء', address: 'حي البلدية' },
      couponCode: 'MARKETONLY',
      items: [
        { productId: prodActive.id, quantity: 3, saleType: 'retail' },
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 400, 'Order creation rejected due to audience mismatch');
    assert(json.error.includes('الماركتات'), 'Order error indicates audience restriction');
  }

  console.log('\n--- Scenario 8: Subtotal Below Minimum Order Amount Rejected ---');
  {
    const minOrderCoupon = await pgCreateCoupon({
      code: 'BIGORDER50',
      discountType: 'fixed',
      discountValue: 10000,
      minOrderAmount: 50000,
    });

    // Subtotal 15000 < minOrderAmount 50000
    const valRes = await pgValidateCoupon('BIGORDER50', 15000);
    assert(valRes.valid === false, 'Validation rejected subtotal below minimum');
    assert(valRes.message.includes('الحد الأدنى لتطبيق هذا الكوبون'), 'Error specifies min order requirement');

    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'سعد كريم', phone: '07806666666', city: 'كربلاء', address: 'حي المعلمين' },
      couponCode: 'BIGORDER50',
      items: [
        { productId: prodActive.id, quantity: 3, saleType: 'retail' }, // subtotal = 15000
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 400, 'Order creation rejected due to subtotal below coupon minimum');
    assert(json.error.includes('الحد الأدنى'), 'Order error specifies min order amount');
  }

  console.log('\n--- Scenario 9: Usage Limit Reached Rejected ---');
  {
    const limitedCoupon = await pgCreateCoupon({
      code: 'ONETIMEONLY',
      discountType: 'fixed',
      discountValue: 3000,
      usageLimit: 1,
    });

    // Manually increment count to limit
    await sql`UPDATE coupons SET usage_count = 1 WHERE code = 'ONETIMEONLY'`;

    const valRes = await pgValidateCoupon('ONETIMEONLY', 20000);
    assert(valRes.valid === false, 'Validation rejected coupon at usage limit');
    assert(valRes.message.includes('الحد الأقصى لاستخدام'), 'Error indicates usage limit reached');

    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'سعد كريم', phone: '07806666666', city: 'كربلاء', address: 'حي المعلمين' },
      couponCode: 'ONETIMEONLY',
      items: [
        { productId: prodActive.id, quantity: 3, saleType: 'retail' },
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 400, 'Order rejected because usage limit was reached');
    assert(json.error.includes('الحد الأقصى'), 'Order error indicates usage limit');
  }

  console.log('\n--- Scenario 10: Concurrent Race Condition Atomic Protection ---');
  {
    // Create coupon with limit = 1 and usageCount = 0
    await pgCreateCoupon({
      code: 'RACETEST',
      discountType: 'fixed',
      discountValue: 2000,
      usageLimit: 1,
    });

    // Launch two simultaneous atomic consume attempts
    const [res1, res2] = await Promise.allSettled([
      pgConsumeCoupon('RACETEST', 20000, 'individual'),
      pgConsumeCoupon('RACETEST', 20000, 'individual'),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const failures = [res1, res2].filter((r) => r.status === 'rejected');

    assert(successes.length === 1, `Exactly 1 concurrent consume succeeded (got ${successes.length})`);
    assert(failures.length === 1, `Exactly 1 concurrent consume failed with race condition protection (got ${failures.length})`);
    assert(failures[0].reason.message.includes('الحد الأقصى'), 'Rejected promise error specifically mentions usage limit');

    // Verify usageCount in PostgreSQL is exactly 1 (not 2!)
    const [cRow] = await sql`SELECT usage_count FROM coupons WHERE code = 'RACETEST'`;
    assert(Number(cRow.usage_count) === 1, `usage_count in PostgreSQL is exactly 1 (got ${cRow.usage_count})`);
  }

  console.log('\n--- Scenario 11: Valid Coupon Applied & Atomic UsageCount Incremented ---');
  {
    await pgCreateCoupon({
      code: 'WELCOME10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 10000,
    });

    const beforeRows = await sql`SELECT usage_count FROM coupons WHERE code = 'WELCOME10'`;
    const initialUsage = Number(beforeRows[0].usage_count);

    const req = createJsonRequest('http://localhost/api/orders', 'POST', {
      customer: { name: 'عمر التميمي', phone: '07807777777', city: 'كربلاء', address: 'حي الحسين' },
      couponCode: 'WELCOME10',
      items: [
        { productId: prodActive.id, quantity: 4, saleType: 'retail' }, // subtotal = 20000
      ],
    });
    const res = await ordersPostHandler(req);
    const json = await res.json();
    assert(res.status === 201, 'Order successfully created with valid coupon');
    assert(json.success === true, 'Order created');
    assert(Number(json.order.discount) === 2000, `10% discount on 20000 is 2000 (got ${json.order.discount})`);
    assert(Number(json.order.total) === 23000, `Total is 20000 subtotal + 5000 delivery - 2000 discount = 23000 (got ${json.order.total})`);

    const afterRows = await sql`SELECT usage_count FROM coupons WHERE code = 'WELCOME10'`;
    const afterUsage = Number(afterRows[0].usage_count);
    assert(afterUsage === initialUsage + 1, `usage_count atomically incremented from ${initialUsage} to ${afterUsage}`);
  }

  console.log('\n--- Scenario 12: Tiered Pricing Verified (Retail / Market / Wholesale Gold/Silver/Bronze) ---');
  {
    // Fetch properly mapped product from PostgreSQL
    const prodActiveMapped = await pgGetProductById(prodActive.id);
    assert(prodActiveMapped !== null, 'Product found in catalog');

    // prodActive prices:
    // retail: 5000, wholesale carton: 96000, market: 100000, special (silver): 92000, vip (gold): 88000

    // 1. Retail user buying retail
    const priceRetail = getProductPriceForUser(prodActiveMapped, 'retail', { accountType: 'individual' });
    assert(Number(priceRetail.price) === 5000, `Retail piece price is 5000 (got ${priceRetail.price})`);

    // 2. Market user buying wholesale
    const priceMarket = getProductPriceForUser(prodActiveMapped, 'wholesale', { accountType: 'market' });
    assert(Number(priceMarket.price) === 100000, `Market carton price is 100000 (got ${priceMarket.price})`);

    // 3. Wholesale Bronze user buying wholesale
    const priceBronze = getProductPriceForUser(prodActiveMapped, 'wholesale', { accountType: 'wholesale', merchantTier: 'bronze' });
    assert(Number(priceBronze.price) === 96000, `Wholesale Bronze carton price is 96000 (got ${priceBronze.price})`);

    // 4. Wholesale Silver user buying wholesale
    const priceSilver = getProductPriceForUser(prodActiveMapped, 'wholesale', { accountType: 'wholesale', merchantTier: 'silver' });
    assert(Number(priceSilver.price) === 92000, `Wholesale Silver carton price is 92000 (got ${priceSilver.price})`);

    // 5. Wholesale Gold user buying wholesale
    const priceGold = getProductPriceForUser(prodActiveMapped, 'wholesale', { accountType: 'wholesale', merchantTier: 'gold' });
    assert(Number(priceGold.price) === 88000, `Wholesale Gold VIP carton price is 88000 (got ${priceGold.price})`);
  }

  console.log('\n--- Scenario 13: Coupons CRUD Admin Authentication & Authorization Protection ---');
  {
    // Unauthenticated request to GET /api/coupons -> 401
    const unauthGetReq = createJsonRequest('http://localhost/api/coupons', 'GET');
    const unauthGetRes = await couponsGetHandler(unauthGetReq);
    assert(unauthGetRes.status === 401, 'Unauthenticated GET /api/coupons returned 401');

    // Customer request to POST /api/coupons -> 401 (not an admin)
    const custPostReq = createJsonRequest('http://localhost/api/coupons', 'POST', {
      code: 'HACKCOUPON',
      discountType: 'percentage',
      discountValue: 90,
    }, individualCustomerCookie);
    const custPostRes = await couponsPostHandler(custPostReq);
    assert(custPostRes.status === 401, 'Customer POST /api/coupons returned 401 (Customer cannot manage coupons)');

    // Admin with offers permission creating coupon -> 200
    const adminPostReq = createJsonRequest('http://localhost/api/coupons', 'POST', {
      code: 'ADMINCREATED',
      discountType: 'fixed',
      discountValue: 7500,
      description: 'كوبون تم إنشاؤه من الإدارة',
    }, adminCookie);
    const adminPostRes = await couponsPostHandler(adminPostReq);
    const adminPostJson = await adminPostRes.json();
    assert(adminPostRes.status === 200, 'Admin POST /api/coupons returned 200');
    assert(adminPostJson.coupon.code === 'ADMINCREATED', 'Coupon created in DB');

    // Admin updating coupon -> 200
    const adminPutReq = createJsonRequest('http://localhost/api/coupons', 'PUT', {
      code: 'ADMINCREATED',
      discountValue: 8000,
    }, adminCookie);
    const adminPutRes = await couponsPutHandler(adminPutReq);
    const adminPutJson = await adminPutRes.json();
    assert(adminPutRes.status === 200, 'Admin PUT /api/coupons returned 200');
    assert(Number(adminPutJson.coupon.discountValue) === 8000, 'Coupon discount updated to 8000');

    // Admin deleting coupon -> 200
    const adminDelReq = createJsonRequest('http://localhost/api/coupons?code=ADMINCREATED', 'DELETE', null, adminCookie);
    const adminDelRes = await couponsDeleteHandler(adminDelReq);
    const adminDelJson = await adminDelRes.json();
    assert(adminDelRes.status === 200, 'Admin DELETE /api/coupons returned 200');
    assert(adminDelJson.success === true, 'Coupon deleted from DB');

    // Verify Audit Logs recorded in PostgreSQL
    const auditRows = await sql`
      SELECT action_type, category, target_type, target_reference_number
      FROM audit_logs
      WHERE target_reference_number = 'ADMINCREATED'
      ORDER BY timestamp ASC;
    `;
    assert(auditRows.length >= 3, `PostgreSQL recorded ${auditRows.length} audit logs for coupon operations`);
    assert(auditRows[0].action_type === 'coupon_created', 'Audit logged coupon_created');
    assert(auditRows[1].action_type === 'coupon_updated', 'Audit logged coupon_updated');
    assert(auditRows[2].action_type === 'coupon_deleted', 'Audit logged coupon_deleted');
  }

  console.log('\n===============================================================');
  console.log(`ALL COMMERCE-1 TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

async function main() {
  try {
    await setup();
    await runCommercePhase1Tests();
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    if (sql) {
      await sql.end();
    }
    if (ep) {
      try {
        await ep.stop();
      } catch {}
    }
  }
}

main();
