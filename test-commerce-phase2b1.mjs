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
const PORT = 54354;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2b1_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2b1-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2b1-test-secret-min-32-chars-long';

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
    'drizzle/0011_offer_historical_snapshot.sql',
  ];

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    if (fs.existsSync(fullPath)) {
      await runSqlScript(sql, fullPath);
    }
  }
  console.log('   All migrations applied successfully.');
}

async function runCommercePhase2b1Tests() {
  console.log('\n================================================================');
  console.log('  COMMERCE-2B1: AUTHORITATIVE OFFERS & PRICING INTEGRITY TESTS  ');
  console.log('================================================================\n');

  const {
    pgGetOffers,
    pgGetOfferById,
    pgCreateOffer,
    pgUpdateOffer,
    pgDeleteOffer,
    checkOfferTimeOverlap,
  } = await import('./src/lib/postgres-offers.ts');

  const {
    pgGetProducts,
    pgGetProductById,
  } = await import('./src/lib/postgres-catalog.ts');

  const {
    pgCreateOrder,
    pgGetOrderById,
  } = await import('./src/lib/postgres-orders.ts');

  const {
    pgCreateCoupon,
  } = await import('./src/lib/postgres-coupons.ts');

  const {
    getProductPriceForUser,
    normalizePricingIdentity,
  } = await import('./src/lib/pricing.ts');

  const { POST: offersPostHandler, GET: offersGetHandler } = await import('./src/app/api/offers/route.ts');
  const { GET: offerByIdGetHandler, PUT: offerByIdPutHandler, DELETE: offerByIdDeleteHandler } = await import('./src/app/api/offers/[id]/route.ts');
  const { POST: ordersPostHandler } = await import('./src/app/api/orders/route.ts');

  const { ensureDbExists } = await import('./src/lib/db.ts');

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
  // Pre-seed test data
  // -------------------------------------------------------------------------
  console.log('--- Pre-seeding Test Products and Accounts ---');

  const [testCat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم تجارب العروض', 'test-offers-cat')
    RETURNING id, name;
  `;

  // Product 1: Base retail 10,000, wholesale 80,000
  const [prod1] = await sql`
    INSERT INTO products (
      name, category_id,
      price, wholesale_price, market_price, box_price, special_price, vip_price,
      cost_price, piece_cost_price,
      current_stock_pieces,
      boxes_per_carton, items_per_box, pieces_per_carton,
      retail_unit, wholesale_unit,
      cashback_customer_amount
    ) VALUES (
      'منتج تجربة العروض الأول', ${testCat.id},
      '10000.00', '80000.00', '85000.00', '45000.00', '78000.00', '75000.00',
      '6000.00', '6000.00',
      500,
      2, 5, 10,
      'قطعة', 'كرتون',
      '500.00'
    ) RETURNING *;
  `;

  // Product 2: Base retail 25,000, wholesale 200,000
  const [prod2] = await sql`
    INSERT INTO products (
      name, category_id,
      price, wholesale_price, market_price, box_price, special_price, vip_price,
      cost_price, piece_cost_price,
      current_stock_pieces,
      boxes_per_carton, items_per_box, pieces_per_carton,
      retail_unit, wholesale_unit,
      cashback_customer_amount
    ) VALUES (
      'منتج تجربة العروض الثاني', ${testCat.id},
      '25000.00', '200000.00', '210000.00', '110000.00', '195000.00', '190000.00',
      '15000.00', '15000.00',
      300,
      2, 5, 10,
      'قطعة', 'كرتون',
      '1000.00'
    ) RETURNING *;
  `;

  const [customerAccount] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier, city, address
    ) VALUES (
      'ACC-CUST-OFFER', 'زبون تجربة العروض', '07703333333', 'customer', 'retail', 'كربلاء', 'حي الوفاء'
    ) RETURNING *;
  `;

  const inMemDb = ensureDbExists();
  inMemDb.users = inMemDb.users || [];
  inMemDb.users.push({
    id: customerAccount.id,
    name: customerAccount.name,
    phone: customerAccount.phone,
    role: 'customer',
    accountType: 'individual',
    isActive: true,
  });

  inMemDb.staff = inMemDb.staff || [];
  inMemDb.staff.push({
    id: 'staff-offer-tester',
    name: 'مدير العروض والتسعير',
    username: 'admin_offers',
    role: 'staff',
    permissions: ['offers', 'products', 'orders', 'financial'],
    isActive: true,
  });
  inMemDb.staff.push({
    id: 'staff-no-perm',
    name: 'موظف بدون صلاحية العروض',
    username: 'staff_viewer',
    role: 'staff',
    permissions: ['reports'],
    isActive: true,
  });

  const adminCookie = signAdminSession({
    id: 'staff-offer-tester',
    name: 'مدير العروض والتسعير',
    username: 'admin_offers',
    role: 'staff',
    permissions: ['offers', 'products', 'orders', 'financial'],
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  const staffWithoutOfferPermCookie = signAdminSession({
    id: 'staff-no-perm',
    name: 'موظف بدون صلاحية العروض',
    username: 'staff_viewer',
    role: 'staff',
    permissions: ['reports'],
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  const customerCookie = signCustomerSession({
    userId: customerAccount.id,
    phone: customerAccount.phone,
    name: customerAccount.name,
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  // =========================================================================
  // SCENARIO 1: Future offer does NOT apply (regular price used)
  // =========================================================================
  console.log('\n--- Scenario 1: Future scheduled offer does NOT apply ---');
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const futureOffer = await pgCreateOffer({
    productId: prod1.id,
    offerPrice: 7000,
    startDate: tomorrow.toISOString(),
    endDate: nextWeek.toISOString(),
    badge: 'عرض قادم قريباً',
    isActive: true,
  });

  const fetchedProd1 = await pgGetProductById(prod1.id);
  assert(fetchedProd1 !== null, 'Product 1 fetched from PostgreSQL');
  assert(fetchedProd1.price === 10000, `Future offer did not activate: price is regular ${fetchedProd1.price} (expected 10000)`);
  assert(fetchedProd1.isOnOffer === false, 'Product 1 isOnOffer is false');

  // =========================================================================
  // SCENARIO 2: Active offer applies (offer price used)
  // =========================================================================
  console.log('\n--- Scenario 2: Active promotional offer applies ---');
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const threeDaysLater = new Date(Date.now() + 3 * 24 * 3600 * 1000);

  const activeOffer = await pgCreateOffer({
    productId: prod2.id,
    offerPrice: 20000,
    offerWholesalePrice: 160000,
    startDate: yesterday.toISOString(),
    endDate: threeDaysLater.toISOString(),
    badge: 'عرض خاص محدود',
    isActive: true,
  });

  const fetchedProd2 = await pgGetProductById(prod2.id);
  assert(fetchedProd2 !== null, 'Product 2 fetched from PostgreSQL');
  assert(fetchedProd2.price === 20000, `Active offer applied: price is offer price ${fetchedProd2.price} (expected 20000)`);
  assert(fetchedProd2.originalPrice === 25000, `Active offer original price is preserved: ${fetchedProd2.originalPrice} (expected 25000)`);
  assert(fetchedProd2.isOnOffer === true, 'Product 2 isOnOffer is true');
  assert(fetchedProd2.offerId === activeOffer.id, `Product 2 offerId matches active offer: ${fetchedProd2.offerId}`);
  assert(fetchedProd2.wholesalePrice === 160000, `Active offer wholesale price applied: ${fetchedProd2.wholesalePrice} (expected 160000)`);
  assert(fetchedProd2.originalWholesalePrice === 200000, `Active offer original wholesale price preserved: ${fetchedProd2.originalWholesalePrice}`);

  // =========================================================================
  // SCENARIO 3: Expired offer does NOT apply (regular price used)
  // =========================================================================
  console.log('\n--- Scenario 3: Expired offer does NOT apply ---');
  // Temporarily update active offer to be expired
  await sql`
    UPDATE product_offers
    SET end_date = NOW() - INTERVAL '1 hour'
    WHERE id = ${activeOffer.id}
  `;

  const expiredProd2 = await pgGetProductById(prod2.id);
  assert(expiredProd2.price === 25000, `Expired offer reverted to base price: ${expiredProd2.price} (expected 25000)`);
  assert(expiredProd2.isOnOffer === false, 'Expired offer product isOnOffer is false');

  // Restore active offer endDate
  await sql`
    UPDATE product_offers
    SET end_date = ${threeDaysLater.toISOString()}
    WHERE id = ${activeOffer.id}
  `;

  const restoredProd2 = await pgGetProductById(prod2.id);
  assert(restoredProd2.price === 20000, 'Restored active offer price to 20,000');

  // =========================================================================
  // SCENARIO 4: pgCreateOrder saves offer price & historical snapshots
  // =========================================================================
  console.log('\n--- Scenario 4: pgCreateOrder saves offer price and populates snapshots ---');
  // Customer places order for 2 pieces of Product 2
  const orderRes = await pgCreateOrder({
    customer: {
      name: customerAccount.name,
      phone: customerAccount.phone,
      city: 'كربلاء',
      address: 'حي الوفاء',
    },
    items: [
      {
        productId: prod2.id,
        name: prod2.name,
        price: 20000,
        quantity: 2,
        saleType: 'retail',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
    userAccountType: 'individual',
    operator: { role: 'customer' },
  });

  assert(orderRes.subtotal === 40000, `Order subtotal is based on offer price (2 * 20,000 = 40,000): got ${orderRes.subtotal}`);
  assert(orderRes.total === 40000, `Order total is 40,000: got ${orderRes.total}`);

  // Verify historical snapshots stored in order_items table in PostgreSQL
  const dbOrderItems = await sql`
    SELECT * FROM order_items WHERE order_id = ${orderRes.id};
  `;
  assert(dbOrderItems.length === 1, 'Found 1 order item in PostgreSQL');
  const oi = dbOrderItems[0];
  assert(Number(oi.unit_price_snap) === 20000, `unit_price_snap in DB is 20000: got ${oi.unit_price_snap}`);
  assert(Number(oi.original_price_snap) === 25000, `original_price_snap in DB is 25000: got ${oi.original_price_snap}`);
  assert(oi.offer_id_snap === activeOffer.id, `offer_id_snap in DB is ${activeOffer.id}: got ${oi.offer_id_snap}`);
  assert(Number(oi.offer_discount_snap) === 5000, `offer_discount_snap in DB is 5000 (25000 - 20000): got ${oi.offer_discount_snap}`);

  // =========================================================================
  // SCENARIO 5: Stale cart price detection on checkout
  // =========================================================================
  console.log('\n--- Scenario 5: Stale cart price detection on checkout ---');
  // Client submits order where cart item price was 25,000 (before offer started) but current official price is 20,000
  const staleReq = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${customerCookie}`,
    },
    body: JSON.stringify({
      rejectStaleCartPrice: true,
      customer: {
        name: customerAccount.name,
        phone: customerAccount.phone,
        city: 'كربلاء',
        address: 'حي الوفاء',
      },
      items: [
        {
          productId: prod2.id,
          name: prod2.name,
          price: 25000, // Stale price!
          quantity: 1,
          saleType: 'retail',
        },
      ],
    }),
  });

  const staleRes = await ordersPostHandler(staleReq);
  const staleData = await staleRes.json();
  assert(staleRes.status === 400, `Stale cart price returned HTTP 400: got ${staleRes.status}`);
  assert(staleData.code === 'STALE_CART_PRICE', `Stale cart price error code is STALE_CART_PRICE: got ${staleData.code}`);
  assert(staleData.error.includes('تغير سعر المنتج'), `Arabic error message informs user of price change: "${staleData.error}"`);

  // =========================================================================
  // SCENARIO 6: Price tampering attempt in request body overridden
  // =========================================================================
  console.log('\n--- Scenario 6: Price tampering attempt in request body overridden by authoritative pricing ---');
  const tamperReq = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${customerCookie}`,
    },
    body: JSON.stringify({
      customer: {
        name: customerAccount.name,
        phone: customerAccount.phone,
        city: 'كربلاء',
        address: 'حي الوفاء',
      },
      items: [
        {
          productId: prod2.id,
          name: prod2.name,
          price: 1, // Tampered price: 1 IQD!
          quantity: 1,
          saleType: 'retail',
        },
      ],
    }),
  });

  const tamperRes = await ordersPostHandler(tamperReq);
  const tamperData = await tamperRes.json();
  assert(tamperRes.status === 201, `Order created despite forged price: status ${tamperRes.status}`);
  assert(tamperData.order.items[0].price === 20000, `Item price strictly enforced to official 20,000 (got ${tamperData.order.items[0].price})`);
  assert(tamperData.order.subtotal === 20000, `Subtotal strictly enforced to official 20,000 (got ${tamperData.order.subtotal})`);

  // Defense-in-depth: Even if pgCreateOrder is invoked directly by customer with spoofed price,
  // it enforces official price (20,000)
  const directTamperOrder = await pgCreateOrder({
    customer: {
      name: customerAccount.name,
      phone: customerAccount.phone,
      city: 'كربلاء',
      address: 'حي الوفاء',
    },
    items: [
      {
        productId: prod2.id,
        name: prod2.name,
        price: 50, // Spoofed price
        quantity: 1,
        saleType: 'retail',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
    userAccountType: 'individual',
    operator: { role: 'customer' },
  });
  assert(directTamperOrder.subtotal === 20000, `pgCreateOrder repository enforcement overwrote spoofed price to official 20,000: got ${directTamperOrder.subtotal}`);

  // =========================================================================
  // SCENARIO 7: Overlapping active/scheduled offers rejected
  // =========================================================================
  console.log('\n--- Scenario 7: Overlapping active/scheduled offers rejected ---');
  let overlapCaught = false;
  try {
    // Attempt to create another offer for prod2 overlapping with activeOffer (yesterday to +3 days)
    await pgCreateOffer({
      productId: prod2.id,
      offerPrice: 18000,
      startDate: new Date().toISOString(), // overlapping now!
      endDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      badge: 'عرض متداخل',
      isActive: true,
    });
  } catch (err) {
    if (err.message.includes('يتداخل مع هذه الفترة') || err.message.includes('يوجد عرض')) {
      overlapCaught = true;
    }
  }
  assert(overlapCaught, 'pgCreateOffer rejected overlapping offer for the same product');

  // =========================================================================
  // SCENARIO 8: Non-overlapping future scheduled offer allowed alongside current
  // =========================================================================
  console.log('\n--- Scenario 8: Non-overlapping future scheduled offer allowed ---');
  // activeOffer ends in 3 days. We schedule a new offer starting in 4 days and ending in 8 days
  const futureStart = new Date(Date.now() + 4 * 24 * 3600 * 1000);
  const futureEnd = new Date(Date.now() + 8 * 24 * 3600 * 1000);

  const nonOverlappingFutureOffer = await pgCreateOffer({
    productId: prod2.id,
    offerPrice: 17500,
    startDate: futureStart.toISOString(),
    endDate: futureEnd.toISOString(),
    badge: 'عرض الأسبوع القادم',
    isActive: true,
  });
  assert(nonOverlappingFutureOffer && nonOverlappingFutureOffer.id, 'Non-overlapping future scheduled offer created successfully alongside active offer');

  // =========================================================================
  // SCENARIO 9: RBAC on /api/offers and /api/offers/[id]
  // =========================================================================
  console.log('\n--- Scenario 9: RBAC protection on offers API ---');
  // 1. Unauthenticated request to POST /api/offers -> 401
  const unauthReq = new Request('http://localhost:3000/api/offers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: prod1.id,
      offerPrice: 8500,
      endDate: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  const unauthRes = await offersPostHandler(unauthReq);
  assert(unauthRes.status === 401, `Unauthenticated POST /api/offers rejected with 401: got ${unauthRes.status}`);

  // 2. Staff without 'offers' or 'products' permission -> 403
  const staffNoPermReq = new Request('http://localhost:3000/api/offers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${staffWithoutOfferPermCookie}`,
    },
    body: JSON.stringify({
      productId: prod1.id,
      offerPrice: 8500,
      endDate: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  const staffNoPermRes = await offersPostHandler(staffNoPermReq);
  assert(staffNoPermRes.status === 403, `Staff without offers permission rejected with 403: got ${staffNoPermRes.status}`);

  // 3. Admin with offers permission -> 201
  // We delete futureOffer first to free the time slot for prod1
  await pgDeleteOffer(futureOffer.id);

  const adminCreateReq = new Request('http://localhost:3000/api/offers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${adminCookie}`,
    },
    body: JSON.stringify({
      productId: prod1.id,
      offerPrice: 8500,
      endDate: new Date(Date.now() + 86400000).toISOString(),
      badge: 'عرض حصري للمدير',
    }),
  });
  const adminCreateRes = await offersPostHandler(adminCreateReq);
  const adminCreateData = await adminCreateRes.json();
  assert(adminCreateRes.status === 201 && adminCreateData.success, `Admin with permission successfully created offer: status ${adminCreateRes.status}`);

  // =========================================================================
  // SCENARIO 10: Delete offer with past order usage archives rather than hard deleting
  // =========================================================================
  console.log('\n--- Scenario 10: Delete used offer archives; unused offer hard-deletes ---');
  // activeOffer has past order usage (Scenario 4)
  const deleteUsedResult = await pgDeleteOffer(activeOffer.id, { username: 'admin_offers' });
  assert(deleteUsedResult.archived === true, 'Delete of offer used in past orders automatically archived rather than hard-deleted');

  // Verify DB state: is_archived = true, is_active = false
  const [archivedDbOffer] = await sql`
    SELECT * FROM product_offers WHERE id = ${activeOffer.id};
  `;
  assert(archivedDbOffer.is_archived === true, 'Database row has is_archived = true');
  assert(archivedDbOffer.is_active === false, 'Database row has is_active = false');
  assert(archivedDbOffer.archived_at !== null, 'Database row has archived_at timestamp');

  // Verify that archived offer no longer affects product price
  const prod2AfterArchive = await pgGetProductById(prod2.id);
  assert(prod2AfterArchive.price === 25000, `Product 2 reverted to regular price 25,000 after offer archived: got ${prod2AfterArchive.price}`);
  assert(prod2AfterArchive.isOnOffer === false, 'Product 2 isOnOffer is false');

  // Now delete an UNUSED offer (nonOverlappingFutureOffer)
  const deleteUnusedResult = await pgDeleteOffer(nonOverlappingFutureOffer.id, { username: 'admin_offers' });
  assert(deleteUnusedResult.archived === false, 'Delete of unused offer physically deleted from database');
  const [deletedDbOffer] = await sql`
    SELECT * FROM product_offers WHERE id = ${nonOverlappingFutureOffer.id};
  `;
  assert(deletedDbOffer === undefined, 'Unused offer row no longer exists in PostgreSQL table');

  // =========================================================================
  // SCENARIO 11: Coupon + Offer Stacking
  // =========================================================================
  console.log('\n--- Scenario 11: Coupon + Offer Stacking ---');
  // Re-create an active offer on prod1: regular 10000 -> offer 8000
  await sql`DELETE FROM product_offers WHERE product_id = ${prod1.id}`;
  const stackOffer = await pgCreateOffer({
    productId: prod1.id,
    offerPrice: 8000,
    endDate: new Date(Date.now() + 86400000).toISOString(),
    badge: 'عرض التوفير',
    isActive: true,
  });

  const testCoupon = await pgCreateCoupon({
    code: 'STACK1000',
    discountType: 'fixed',
    discountValue: 1000,
    minOrderAmount: 5000,
    isActive: true,
  });

  const couponOrder = await pgCreateOrder({
    customer: {
      name: customerAccount.name,
      phone: customerAccount.phone,
      city: 'كربلاء',
      address: 'حي الوفاء',
    },
    items: [
      {
        productId: prod1.id,
        name: prod1.name,
        price: 8000,
        quantity: 1,
        saleType: 'retail',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
    couponCode: 'STACK1000',
    userAccountType: 'individual',
    operator: { role: 'customer' },
  });

  assert(couponOrder.subtotal === 8000, `Subtotal before coupon is offer price 8,000: got ${couponOrder.subtotal}`);
  assert(couponOrder.discount === 1000, `Coupon discount is 1,000: got ${couponOrder.discount}`);
  assert(couponOrder.total === 7000, `Final total is 7,000 (8,000 offer - 1,000 coupon): got ${couponOrder.total}`);

  // =========================================================================
  // SCENARIO 12: Cashback + Offer Stacking
  // =========================================================================
  console.log('\n--- Scenario 12: Cashback + Offer Stacking ---');
  // Prod1 has cashback_customer_amount = 500.
  // When purchased at offer price 8000, customer earns 500 cashback.
  const cbOrder = await pgCreateOrder({
    customer: {
      name: customerAccount.name,
      phone: customerAccount.phone,
      city: 'كربلاء',
      address: 'حي الوفاء',
    },
    items: [
      {
        productId: prod1.id,
        name: prod1.name,
        price: 8000,
        quantity: 2,
        saleType: 'retail',
        unitLabel: 'قطعة',
        image: '',
        earnedCashback: 1000,
      },
    ],
    userAccountType: 'individual',
    operator: { role: 'customer' },
  });

  assert(cbOrder.subtotal === 16000, `Subtotal is 16,000: got ${cbOrder.subtotal}`);
  assert(cbOrder.total === 16000, `Total is 16,000: got ${cbOrder.total}`);
  assert(cbOrder.earnedCashback === 1000, `Earned cashback calculated: got ${cbOrder.earnedCashback}`);

  // =========================================================================
  // SCENARIO 13: Tier Pricing Behavior Table Verification
  // =========================================================================
  console.log('\n--- Scenario 13: Tier Pricing Behavior Table Verification ---');
  // Product 1 base pricing:
  // retail: 10,000
  // boxPrice: 45,000 (1 box = 5 items)
  // wholesalePrice: 80,000 (1 carton = 10 items)
  // marketPrice: 85,000
  // specialPrice (silver): 78,000
  // vipPrice (gold): 75,000
  //
  // Currently on stackOffer:
  // offerPrice: 8,000 (retail)
  // offerWholesalePrice: not set (undefined)

  const indUser = { accountType: 'individual' };
  const mktUser = { accountType: 'market' };
  const wsBronzeUser = { accountType: 'wholesale', merchantTier: 'bronze' };
  const wsSilverUser = { accountType: 'wholesale', merchantTier: 'silver' };
  const wsGoldUser = { accountType: 'wholesale', merchantTier: 'gold' };

  const currentProd1 = await pgGetProductById(prod1.id);

  // 1. Retail consumer: gets offer price 8,000
  const pRetail = getProductPriceForUser(currentProd1, 'retail', indUser);
  assert(pRetail.price === 8000, `Retail consumer gets offer price 8,000: got ${pRetail.price}`);

  // 2. Individual carton buyer: gets consumer carton price (boxPrice 45,000 or wholesale 80,000)
  const pIndCarton = getProductPriceForUser(currentProd1, 'wholesale', indUser);
  assert(pIndCarton.price === 45000, `Individual carton buyer gets boxPrice 45,000: got ${pIndCarton.price}`);

  // 3. Market merchant: gets marketPrice 85,000
  const pMkt = getProductPriceForUser(currentProd1, 'wholesale', mktUser);
  assert(pMkt.price === 85000, `Market merchant gets marketPrice 85,000: got ${pMkt.price}`);

  // 4. Wholesale Bronze: gets wholesalePrice 80,000
  const pBronze = getProductPriceForUser(currentProd1, 'wholesale', wsBronzeUser);
  assert(pBronze.price === 80000, `Wholesale Bronze gets wholesalePrice 80,000: got ${pBronze.price}`);

  // 5. Wholesale Silver: gets specialPrice 78,000
  const pSilver = getProductPriceForUser(currentProd1, 'wholesale', wsSilverUser);
  assert(pSilver.price === 78000, `Wholesale Silver gets specialPrice 78,000: got ${pSilver.price}`);

  // 6. Wholesale Gold: gets vipPrice 75,000
  const pGold = getProductPriceForUser(currentProd1, 'wholesale', wsGoldUser);
  assert(pGold.price === 75000, `Wholesale Gold gets vipPrice 75,000: got ${pGold.price}`);

  // Now test with offer_wholesale_price set to 70,000
  await sql`
    UPDATE product_offers
    SET offer_wholesale_price = '70000.00'
    WHERE id = ${stackOffer.id}
  `;
  const prodWithWholesaleOffer = await pgGetProductById(prod1.id);
  const pBronzeWithOffer = getProductPriceForUser(prodWithWholesaleOffer, 'wholesale', wsBronzeUser);
  assert(pBronzeWithOffer.price === 70000, `When offerWholesalePrice is set (70,000), wholesale receives offer wholesale price: got ${pBronzeWithOffer.price}`);

  // =========================================================================
  // SCENARIO 14: Semantic Pricing Identity & Multi-Tier Resolution Test
  // =========================================================================
  console.log('\n--- Scenario 14: Semantic Pricing Identity & Multi-Tier Resolution Test ---');

  // A. Direct semantic normalization matrix tests
  const n1 = normalizePricingIdentity({ accountType: 'individual' });
  assert(n1.accountType === 'individual' && n1.merchantTier === undefined, 'individual -> individual (retail)');

  const n2 = normalizePricingIdentity({ pricingTier: 'retail' });
  assert(n2.accountType === 'individual' && n2.merchantTier === undefined, 'pricingTier=retail -> individual (does NOT turn into wholesale)');

  const n3 = normalizePricingIdentity({ pricingTier: 'general' });
  assert(n3.accountType === 'individual' && n3.merchantTier === undefined, 'pricingTier=general -> individual (does NOT turn into wholesale)');

  const n4 = normalizePricingIdentity({ accountType: 'market' });
  assert(n4.accountType === 'market' && n4.merchantTier === undefined, 'accountType=market -> market');

  const n5 = normalizePricingIdentity({ pricingTier: 'market' });
  assert(n5.accountType === 'market' && n5.merchantTier === undefined, 'pricingTier=market -> market');

  const n6 = normalizePricingIdentity({ accountType: 'wholesale', merchantTier: 'bronze' });
  assert(n6.accountType === 'wholesale' && n6.merchantTier === 'bronze', 'wholesale bronze -> wholesale bronze');

  const n7 = normalizePricingIdentity({ accountType: 'wholesale', merchantTier: 'silver' });
  assert(n7.accountType === 'wholesale' && n7.merchantTier === 'silver', 'wholesale silver -> wholesale silver');

  const n8 = normalizePricingIdentity({ accountType: 'wholesale', merchantTier: 'gold' });
  assert(n8.accountType === 'wholesale' && n8.merchantTier === 'gold', 'wholesale gold -> wholesale gold');

  const n9 = normalizePricingIdentity({ pricingTier: 'special' });
  assert(n9.accountType === 'wholesale' && n9.merchantTier === 'silver', 'Legacy pricingTier=special -> wholesale silver');

  const n10 = normalizePricingIdentity({ accountType: 'individual', merchantTier: 'gold' });
  assert(n10.accountType === 'individual' && n10.merchantTier === undefined, 'Customer spoofing merchantTier=gold does NOT grant wholesale VIP');

  // B. End-to-End: Gold calculated in /api/orders STAYS Gold in pgCreateOrder & Transaction
  // Archive existing offers on prod1 to test baseline tier pricing
  await sql`UPDATE product_offers SET is_active = false, is_archived = true WHERE product_id = ${prod1.id}`;

  const [goldAccount] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier, city, address
    ) VALUES (
      'ACC-GOLD-MERCHANT', 'تاجر ذهبي معتمد', '07704444444', 'customer', 'wholesale', 'كربلاء', 'سوق الجملة'
    ) RETURNING *;
  `;

  inMemDb.users.push({
    id: goldAccount.id,
    name: goldAccount.name,
    phone: goldAccount.phone,
    role: 'customer',
    accountType: 'wholesale',
    merchantStatus: 'approved',
    merchantTier: 'gold',
    isActive: true,
  });

  const goldCookie = signCustomerSession({
    userId: goldAccount.id,
    phone: goldAccount.phone,
    name: goldAccount.name,
    role: 'customer',
    accountType: 'wholesale',
    merchantStatus: 'approved',
    merchantTier: 'gold',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  // Gold user buys 1 carton (10 pieces) of prod1
  const goldOrderReq = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${goldCookie}`,
    },
    body: JSON.stringify({
      customer: {
        name: goldAccount.name,
        phone: goldAccount.phone,
        city: 'كربلاء',
        address: 'سوق الجملة',
      },
      items: [
        {
          productId: prod1.id,
          name: prod1.name,
          quantity: 1,
          saleType: 'wholesale',
          unitLabel: 'كرتون',
        },
      ],
    }),
  });

  const goldOrderRes = await ordersPostHandler(goldOrderReq);
  const goldOrderData = await goldOrderRes.json();
  assert(goldOrderRes.status === 201, `Gold order created: status ${goldOrderRes.status}`);
  assert(goldOrderData.order.subtotal === 75000, `Gold user charged vipPrice 75,000 in /api/orders (got ${goldOrderData.order.subtotal})`);

  // Verify that inside PostgreSQL Transaction, unit_price_snap in order_items is 75,000 NOT 80,000 (did NOT revert to Bronze!)
  const [dbGoldOrderItem] = await sql`
    SELECT * FROM order_items WHERE order_id = ${goldOrderData.order.id};
  `;
  assert(Number(dbGoldOrderItem.unit_price_snap) === 75000, `PostgreSQL Transaction preserved Gold VIP price: unit_price_snap is 75000.00 (got ${dbGoldOrderItem.unit_price_snap})`);

  // C. Customer payload spoofing attempt: individual attempts to inject merchantTier='gold'
  const spoofReq = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${customerCookie}`, // individual customer
    },
    body: JSON.stringify({
      customer: {
        name: customerAccount.name,
        phone: customerAccount.phone,
        city: 'كربلاء',
        address: 'حي الوفاء',
        accountType: 'wholesale', // Spoofed!
        merchantTier: 'gold', // Spoofed!
      },
      items: [
        {
          productId: prod1.id,
          name: prod1.name,
          quantity: 1,
          saleType: 'wholesale',
          unitLabel: 'كرتون',
        },
      ],
    }),
  });

  const spoofRes = await ordersPostHandler(spoofReq);
  const spoofData = await spoofRes.json();
  assert(spoofRes.status === 201, `Spoofed order processed with safe pricing: status ${spoofRes.status}`);
  assert(spoofData.order.subtotal === 45000, `Spoofed customer billed consumer carton price (boxPrice 45,000), not VIP price (got ${spoofData.order.subtotal})`);

  // D. Same verification with Active Offer:
  // Create an active offer on prod1: offerPrice = 8000, offerWholesalePrice = 70000
  const activeOfferForGold = await pgCreateOffer({
    productId: prod1.id,
    offerPrice: 8000,
    offerWholesalePrice: 70000,
    endDate: new Date(Date.now() + 86400000).toISOString(),
    badge: 'عرض التاجر الذهبي',
    isActive: true,
  });

  const goldOfferReq = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${goldCookie}`,
    },
    body: JSON.stringify({
      customer: {
        name: goldAccount.name,
        phone: goldAccount.phone,
        city: 'كربلاء',
        address: 'سوق الجملة',
      },
      items: [
        {
          productId: prod1.id,
          name: prod1.name,
          quantity: 1,
          saleType: 'wholesale',
          unitLabel: 'كرتون',
        },
      ],
    }),
  });

  const goldOfferRes = await ordersPostHandler(goldOfferReq);
  const goldOfferData = await goldOfferRes.json();
  assert(goldOfferRes.status === 201, `Gold order with active offer created: status ${goldOfferRes.status}`);
  assert(goldOfferData.order.subtotal === 70000, `Gold order receives offer wholesale price 70,000 (got ${goldOfferData.order.subtotal})`);

  const [dbGoldOfferItem] = await sql`
    SELECT * FROM order_items WHERE order_id = ${goldOfferData.order.id};
  `;
  assert(Number(dbGoldOfferItem.unit_price_snap) === 70000, `unit_price_snap in DB with active offer is 70,000 (got ${dbGoldOfferItem.unit_price_snap})`);
  assert(dbGoldOfferItem.offer_id_snap === activeOfferForGold.id, `offer_id_snap in DB matches active offer: ${dbGoldOfferItem.offer_id_snap}`);

  console.log('\n================================================================');
  console.log(`  ALL COMMERCE-2B1 TESTS PASSED! (${passed} checks passed, 0 failed)`);
  console.log('================================================================\n');
}

async function cleanup() {
  if (sql) {
    try {
      await sql.end({ timeout: 2 });
    } catch {}
  }
  if (ep) {
    try {
      await ep.stop();
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 1500));
  try {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {}
}

async function main() {
  try {
    await startDatabase();
    await runCommercePhase2b1Tests();
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main();
