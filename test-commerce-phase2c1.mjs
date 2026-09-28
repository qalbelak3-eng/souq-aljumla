import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  pgGetCoupons,
  pgGetCouponByCode,
  pgCreateCoupon,
  pgUpdateCoupon,
  pgValidateCoupon,
  pgConsumeCoupon,
  calculateCouponDiscount,
  getCustomerCouponRedemptionCount,
} from './src/lib/postgres-coupons.ts';
import { pgCreateOrder, pgGetOrderById } from './src/lib/postgres-orders.ts';
import { pgCreateProduct, pgCreateCategory } from './src/lib/postgres-catalog.ts';
import { pgCreateOffer } from './src/lib/postgres-offers.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54359;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2c1_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '10';
process.env.DATA_SOURCE_CATALOG_BASE = 'postgres';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2c1-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2c1-test-secret-min-32-chars-long';

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

  console.log('2. Applying schema and migrations (0000 -> 0014)...');
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
    'drizzle/0012_pricing_tier_snapshots.sql',
    'drizzle/0013_product_active_archived.sql',
    'drizzle/0014_coupon_financial_hardening.sql',
  ];

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    if (fs.existsSync(fullPath)) {
      await runSqlScript(sql, fullPath);
    }
  }
  console.log('   All 15 migrations applied successfully.');
}

async function runCommercePhase2c1Tests() {
  console.log('\n--- Starting Commerce-2C1 Coupon Financial Hardening Test Suite ---\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // =========================================================================
  // Section 0: Static Architecture & Cleanliness
  // =========================================================================
  console.log('=== Section 0: Static Code & Security Verification ===');
  const couponsLibCode = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/postgres-coupons.ts'), 'utf-8');
  assert(!couponsLibCode.includes('@/lib/db') && !couponsLibCode.includes('store_db.json'), 'postgres-coupons.ts has 0 imports of db.ts or store_db.json');

  const couponsValidateCode = fs.readFileSync(path.resolve(process.cwd(), 'src/app/api/coupons/validate/route.ts'), 'utf-8');
  assert(!couponsValidateCode.includes('@/lib/db'), 'coupons/validate route has 0 imports of db.ts');

  // Setup seed products
  console.log('\n=== Creating Baseline Catalog Products & Offers ===');
  const testCat = await pgCreateCategory({
    name: 'قسم اختبارات الكوبونات',
    orderIndex: 1,
  });

  const prodRegular = await pgCreateProduct({
    name: 'منتج عادي للتجربة',
    category: testCat.id,
    price: 20000,
    stock: 100,
    costPrice: 15000,
  });

  const prodWithOffer = await pgCreateProduct({
    name: 'منتج عليه عرض ترويجي',
    category: testCat.id,
    price: 30000,
    stock: 100,
    costPrice: 20000,
  });

  // Create an active product offer for prodWithOffer
  const activeOffer = await pgCreateOffer({
    productId: prodWithOffer.id,
    offerPrice: 24000, // 6000 discount
    startDate: new Date(Date.now() - 3600000).toISOString(),
    endDate: new Date(Date.now() + 86400000).toISOString(),
    isActive: true,
  });
  console.log(`   Created regular product: ${prodRegular.id} (Price: 20,000)`);
  console.log(`   Created offer product: ${prodWithOffer.id} (Original: 30,000, Offer: 24,000)`);

  // =========================================================================
  // Scenario 1: Percentage Coupon without Cap preserves legacy behavior
  // =========================================================================
  console.log('\n=== Scenario 1: Percentage Coupon without Cap (Legacy Compatibility) ===');
  const couponNoCap = await pgCreateCoupon({
    code: 'NOCAP20',
    discountType: 'percentage',
    discountValue: 20,
    // maxDiscountAmount is omitted / null
  });
  assert(couponNoCap.maxDiscountAmount === undefined, 'Coupon created without cap has undefined/null maxDiscountAmount');

  const valNoCap = await pgValidateCoupon('NOCAP20', 100000);
  assert(valNoCap.valid === true, 'Coupon is valid');
  assert(valNoCap.discount === 20000, `20% of 100,000 IQD without cap gives exactly 20,000 IQD (actual: ${valNoCap.discount})`);

  // =========================================================================
  // Scenario 2: Percentage Coupon with Cap does not exceed cap
  // =========================================================================
  console.log('\n=== Scenario 2: Percentage Coupon with Max Discount Cap ===');
  const couponWithCap = await pgCreateCoupon({
    code: 'CAP20K',
    discountType: 'percentage',
    discountValue: 20,
    maxDiscountAmount: 15000, // Cap at 15,000 IQD
  });
  assert(couponWithCap.maxDiscountAmount === 15000, 'Coupon created with cap of 15,000 IQD');

  const valWithCap = await pgValidateCoupon('CAP20K', 100000);
  assert(valWithCap.discount === 15000, `20% of 100,000 would be 20,000, but cap strictly restricts discount to 15,000 IQD (actual: ${valWithCap.discount})`);

  // Subtotal where 20% is below cap
  const valBelowCap = await pgValidateCoupon('CAP20K', 50000);
  assert(valBelowCap.discount === 10000, `20% of 50,000 is 10,000 (below cap), discount is 10,000 IQD (actual: ${valBelowCap.discount})`);

  // =========================================================================
  // Scenario 3: Fixed Coupon does not exceed eligibleSubtotal
  // =========================================================================
  console.log('\n=== Scenario 3: Fixed Coupon cannot exceed eligibleSubtotal ===');
  const couponFixed = await pgCreateCoupon({
    code: 'FIXED25K',
    discountType: 'fixed',
    discountValue: 25000,
  });

  const valFixedOver = await pgValidateCoupon('FIXED25K', 10000);
  assert(valFixedOver.discount === 10000, `Fixed coupon of 25,000 on subtotal of 10,000 is bounded to 10,000 IQD (actual: ${valFixedOver.discount})`);

  const directCalc = calculateCouponDiscount({ discountType: 'fixed', discountValue: 25000 }, 7000);
  assert(directCalc === 7000, `calculateCouponDiscount bounds fixed coupon to eligibleSubtotal (actual: ${directCalc})`);

  // =========================================================================
  // Scenario 4: perCustomerLimit=1 allows first order and rejects second order
  // =========================================================================
  console.log('\n=== Scenario 4: perCustomerLimit=1 First Use vs Second Use ===');
  const couponPerCust = await pgCreateCoupon({
    code: 'ONCEPERUSER',
    discountType: 'fixed',
    discountValue: 5000,
    perCustomerLimit: 1,
    minOrderAmount: 10000,
  });
  assert(couponPerCust.perCustomerLimit === 1, 'Coupon configured with perCustomerLimit = 1');

  const customerPhoneA = '07701112233';
  const order1 = await pgCreateOrder({
    customer: {
      name: 'علي الكربلائي',
      phone: customerPhoneA,
      city: 'كربلاء',
      address: 'شارع العباس',
    },
    items: [
      {
        productId: prodRegular.id,
        quantity: 1,
        saleType: 'retail',
      },
    ],
    couponCode: 'ONCEPERUSER',
    createAccountIfMissing: true,
  });
  assert(Boolean(order1?.id), 'First order with coupon ONCEPERUSER created successfully');
  assert(order1.discount === 5000, `Order 1 received 5,000 IQD discount (actual: ${order1.discount})`);

  // Attempt second order with same customer phone
  let order2Error = null;
  try {
    await pgCreateOrder({
      customer: {
        name: 'علي الكربلائي (محاولة ثانية)',
        phone: customerPhoneA,
        city: 'كربلاء',
        address: 'شارع العباس',
      },
      items: [
        {
          productId: prodRegular.id,
          quantity: 1,
          saleType: 'retail',
        },
      ],
      couponCode: 'ONCEPERUSER',
      createAccountIfMissing: true,
    });
  } catch (err) {
    order2Error = err.message;
  }
  assert(
    order2Error && (order2Error.includes('استنفاد') || order2Error.includes('الحد الأقصى')),
    `Second order by same customer was strictly rejected: ${order2Error}`
  );

  // =========================================================================
  // Scenario 5: Another customer can use the same coupon if global limit permits
  // =========================================================================
  console.log('\n=== Scenario 5: Distinct Customer can use the same coupon ===');
  const customerPhoneB = '07804445566';
  const orderCustomerB = await pgCreateOrder({
    customer: {
      name: 'حيدر البصري',
      phone: customerPhoneB,
      city: 'البصرة',
      address: 'العشار',
    },
    items: [
      {
        productId: prodRegular.id,
        quantity: 1,
        saleType: 'retail',
      },
    ],
    couponCode: 'ONCEPERUSER',
    createAccountIfMissing: true,
  });
  assert(Boolean(orderCustomerB?.id), 'Distinct customer B used ONCEPERUSER successfully');
  assert(orderCustomerB.discount === 5000, 'Customer B received 5,000 IQD discount');

  // =========================================================================
  // Scenario 6: Concurrent requests by same customer do not exceed perCustomerLimit
  // =========================================================================
  console.log('\n=== Scenario 6: Concurrent Requests under perCustomerLimit=1 ===');
  const couponConcurrent = await pgCreateCoupon({
    code: 'RACECUST',
    discountType: 'fixed',
    discountValue: 4000,
    perCustomerLimit: 1,
    minOrderAmount: 10000,
  });

  const customerPhoneC = '07509998877';
  const concurrentPromises = [
    pgCreateOrder({
      customer: { name: 'زبون متزامن 1', phone: customerPhoneC, city: 'بغداد', address: 'الكرادة' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'RACECUST',
      createAccountIfMissing: true,
    }),
    pgCreateOrder({
      customer: { name: 'زبون متزامن 2', phone: customerPhoneC, city: 'بغداد', address: 'الكرادة' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'RACECUST',
      createAccountIfMissing: true,
    }),
  ];

  const results = await Promise.allSettled(concurrentPromises);
  const successes = results.filter((r) => r.status === 'fulfilled');
  const rejections = results.filter((r) => r.status === 'rejected');

  assert(successes.length === 1, `Exactly 1 concurrent request succeeded (actual: ${successes.length})`);
  assert(rejections.length === 1, `Exactly 1 concurrent request was rejected (actual: ${rejections.length})`);

  // Verify redemption count in database
  const countInDb = await getCustomerCouponRedemptionCount(
    couponConcurrent.id,
    { customerPhone: customerPhoneC },
    sql
  );
  assert(countInDb === 1, `Database confirms exactly 1 redemption recorded (actual: ${countInDb})`);

  // =========================================================================
  // Scenario 7: Global usageLimit continues to function alongside perCustomerLimit
  // =========================================================================
  console.log('\n=== Scenario 7: Global usageLimit + perCustomerLimit ===');
  const couponDualLimits = await pgCreateCoupon({
    code: 'DUALLIMIT',
    discountType: 'fixed',
    discountValue: 3000,
    usageLimit: 2, // Only 2 orders allowed globally in store
    perCustomerLimit: 1,
  });

  // Order 1: Customer D
  await pgCreateOrder({
    customer: { name: 'زبون 1', phone: '07700000001', city: 'النجف', address: 'الكوفة' },
    items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
    couponCode: 'DUALLIMIT',
    createAccountIfMissing: true,
  });

  // Order 2: Customer E
  await pgCreateOrder({
    customer: { name: 'زبون 2', phone: '07700000002', city: 'النجف', address: 'الكوفة' },
    items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
    couponCode: 'DUALLIMIT',
    createAccountIfMissing: true,
  });

  // Order 3: Customer F (New customer, but global limit is exhausted)
  let orderGlobalError = null;
  try {
    await pgCreateOrder({
      customer: { name: 'زبون 3', phone: '07700000003', city: 'النجف', address: 'الكوفة' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'DUALLIMIT',
      createAccountIfMissing: true,
    });
  } catch (err) {
    orderGlobalError = err.message;
  }
  assert(
    orderGlobalError && orderGlobalError.includes('الحد الأقصى لاستخدام هذا الكوبون'),
    `Order 3 blocked by global usage limit exhaustion: ${orderGlobalError}`
  );

  // =========================================================================
  // Scenario 8: excludeDiscountedItems=false maintains existing stacking
  // =========================================================================
  console.log('\n=== Scenario 8: excludeDiscountedItems=false (Allows Stacking on Offers) ===');
  const couponStackingAllowed = await pgCreateCoupon({
    code: 'STACKOK10',
    discountType: 'percentage',
    discountValue: 10,
    excludeDiscountedItems: false,
  });

  // Order with product that has active offer (24,000 instead of 30,000)
  const orderStacking = await pgCreateOrder({
    customer: { name: 'زبون التراكم', phone: '07712345678', city: 'كربلاء', address: 'البلدية' },
    items: [{ productId: prodWithOffer.id, quantity: 1, saleType: 'retail' }],
    couponCode: 'STACKOK10',
    createAccountIfMissing: true,
  });
  // 10% of 24,000 = 2,400 IQD
  assert(orderStacking.subtotal === 24000, `Subtotal uses offer price 24,000 (actual: ${orderStacking.subtotal})`);
  assert(orderStacking.discount === 2400, `Coupon discount applied on offer price: 2,400 IQD (actual: ${orderStacking.discount})`);

  // =========================================================================
  // Scenario 9: excludeDiscountedItems=true excludes items with offers
  // =========================================================================
  console.log('\n=== Scenario 9: excludeDiscountedItems=true Excludes Offer Items ===');
  const couponExcludeOffers = await pgCreateCoupon({
    code: 'NOOFFERS10',
    discountType: 'percentage',
    discountValue: 10,
    excludeDiscountedItems: true,
  });
  assert(couponExcludeOffers.excludeDiscountedItems === true, 'Coupon has excludeDiscountedItems=true');

  // =========================================================================
  // Scenario 10: Mixed cart (Offer item + Regular item)
  // =========================================================================
  console.log('\n=== Scenario 10: Mixed Cart with excludeDiscountedItems=true ===');
  // Regular: 20,000 IQD (qty 1) -> Eligible: 20,000
  // Offer item: 24,000 IQD (qty 1) -> Ineligible for coupon: 0
  // Total subtotal: 44,000 IQD.
  // 10% coupon on eligible 20,000 = 2,000 IQD (NOT 4,400 IQD!)
  const orderMixed = await pgCreateOrder({
    customer: { name: 'سلة مختلطة', phone: '07799887766', city: 'كربلاء', address: 'حي المعلمين' },
    items: [
      { productId: prodRegular.id, quantity: 1, saleType: 'retail' },
      { productId: prodWithOffer.id, quantity: 1, saleType: 'retail' },
    ],
    couponCode: 'NOOFFERS10',
    createAccountIfMissing: true,
  });

  assert(orderMixed.subtotal === 44000, `Total subtotal is 44,000 IQD (actual: ${orderMixed.subtotal})`);
  assert(orderMixed.discount === 2000, `Coupon discount strictly restricted to eligible regular item: 2,000 IQD (actual: ${orderMixed.discount})`);
  assert(orderMixed.couponEligibleSubtotalSnap === 20000, `Snapshot records eligible subtotal: 20,000 IQD (actual: ${orderMixed.couponEligibleSubtotalSnap})`);

  // =========================================================================
  // Scenario 11: Cart with only offers + excludeDiscountedItems produces 0 illicit discount
  // =========================================================================
  console.log('\n=== Scenario 11: Cart with Only Offers and Exclusion Policy ===');
  let onlyOffersError = null;
  try {
    await pgCreateOrder({
      customer: { name: 'عروض فقط', phone: '07755667788', city: 'كربلاء', address: 'حي الوفاء' },
      items: [{ productId: prodWithOffer.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'NOOFFERS10',
      createAccountIfMissing: true,
    });
  } catch (err) {
    onlyOffersError = err.message;
  }
  assert(
    onlyOffersError && onlyOffersError.includes('مستثناة من تطبيق هذا الكوبون'),
    `Order with only discounted items strictly rejected with clear message: ${onlyOffersError}`
  );

  // Validate API response as well
  const valOnlyOffers = await pgValidateCoupon('NOOFFERS10', 24000, 'individual', { eligibleSubtotal: 0 });
  assert(valOnlyOffers.valid === false && valOnlyOffers.discount === 0, 'pgValidateCoupon returns valid=false and discount=0 when eligibleSubtotal is 0');

  // =========================================================================
  // Scenario 12: Client cannot tamper with subtotal, discount, or customer identity
  // =========================================================================
  console.log('\n=== Scenario 12: Defense-in-Depth Against Client Tampering ===');
  const orderTamper = await pgCreateOrder({
    customer: { name: 'مهاجم تزوير', phone: '07733221100', city: 'كربلاء', address: 'حي الإصلاح' },
    items: [
      {
        productId: prodRegular.id,
        quantity: 1,
        price: 100, // Attempted price tampering (official is 20,000)
        saleType: 'retail',
      },
    ],
    subtotal: 100, // Attempted subtotal tampering
    discount: 50000, // Attempted arbitrary discount by customer
    operator: { role: 'customer' },
    createAccountIfMissing: true,
  });

  assert(orderTamper.subtotal === 20000, `Client-submitted subtotal 100 was overridden by official 20,000 IQD (actual: ${orderTamper.subtotal})`);
  assert(orderTamper.discount === 0, `Unprivileged customer discount of 50,000 was stripped to 0 IQD (actual: ${orderTamper.discount})`);

  // =========================================================================
  // Scenario 13: Order failure does NOT consume coupon or create redemption
  // =========================================================================
  console.log('\n=== Scenario 13: Atomicity - Order Failure Rollback ===');
  const couponAtomic = await pgCreateCoupon({
    code: 'ATOMICROLLBACK',
    discountType: 'fixed',
    discountValue: 5000,
    usageLimit: 10,
    perCustomerLimit: 1,
  });

  const countBefore = await sql`SELECT usage_count FROM coupons WHERE id = ${couponAtomic.id}`;
  const usageBefore = Number(countBefore[0].usage_count);

  let atomicOrderFailed = false;
  try {
    await pgCreateOrder({
      customer: { name: 'فشل ذري', phone: '07709876543', city: 'كربلاء', address: 'شارع ميثم' },
      items: [
        {
          productId: prodRegular.id,
          quantity: 999999, // Exceeds available stock, guaranteed to fail!
          saleType: 'retail',
        },
      ],
      couponCode: 'ATOMICROLLBACK',
      createAccountIfMissing: true,
    });
  } catch (err) {
    atomicOrderFailed = true;
  }
  assert(atomicOrderFailed, 'Order failed due to insufficient stock as expected');

  const countAfter = await sql`SELECT usage_count FROM coupons WHERE id = ${couponAtomic.id}`;
  const usageAfter = Number(countAfter[0].usage_count);
  assert(usageAfter === usageBefore, `Coupon usage_count was NOT incremented on failure (${usageBefore} -> ${usageAfter})`);

  const redemptionsAfter = await sql`SELECT count(*) FROM coupon_redemptions WHERE coupon_id = ${couponAtomic.id}`;
  assert(Number(redemptionsAfter[0].count) === 0, 'No coupon_redemption row was created on failed order');

  // =========================================================================
  // Scenario 14: Historical snapshot remains intact after modifying coupon
  // =========================================================================
  console.log('\n=== Scenario 14: Historical Snapshot Immutability ===');
  const couponSnapshotTest = await pgCreateCoupon({
    code: 'SNAPTEST',
    discountType: 'percentage',
    discountValue: 15,
    maxDiscountAmount: 8000,
  });

  const orderSnap = await pgCreateOrder({
    customer: { name: 'سجل تاريخي', phone: '07788990011', city: 'كربلاء', address: 'المخيم' },
    items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
    couponCode: 'SNAPTEST',
    createAccountIfMissing: true,
  });

  const fetchedOrderBefore = await pgGetOrderById(orderSnap.id);
  assert(fetchedOrderBefore.couponCode === 'SNAPTEST', 'Order recorded couponCode SNAPTEST');
  assert(fetchedOrderBefore.couponDiscountType === 'percentage', 'Order recorded type percentage');
  assert(fetchedOrderBefore.couponDiscountValue === 15, 'Order recorded discount value 15');
  assert(fetchedOrderBefore.couponMaxDiscountSnap === 8000, 'Order recorded max discount snapshot 8,000');
  assert(fetchedOrderBefore.couponEligibleSubtotalSnap === 20000, 'Order recorded eligible subtotal 20,000');
  assert(fetchedOrderBefore.discount === 3000, 'Order discount is 3,000 IQD');

  // Now, modify the coupon heavily in PostgreSQL (change to 50% fixed 1,000 IQD or deactivate)
  await pgUpdateCoupon(couponSnapshotTest.id, {
    discountType: 'fixed',
    discountValue: 1000,
    maxDiscountAmount: null,
    isActive: false,
  });

  const fetchedOrderAfter = await pgGetOrderById(orderSnap.id);
  assert(fetchedOrderAfter.couponDiscountType === 'percentage', 'Historical order discount type remains percentage after coupon update');
  assert(fetchedOrderAfter.couponDiscountValue === 15, 'Historical order discount value remains 15 after coupon update');
  assert(fetchedOrderAfter.couponMaxDiscountSnap === 8000, 'Historical order max discount snapshot remains 8,000');
  assert(fetchedOrderAfter.discount === 3000, 'Historical order discount remains 3,000 IQD');

  // =========================================================================
  // Scenario 15: Full Regression - Offers + Coupon + Cashback + Free Delivery
  // =========================================================================
  console.log('\n=== Scenario 15: Full Regression (Offers + Coupon + Cashback + Free Delivery) ===');
  // Store settings: freeDeliveryThreshold is 50,000
  // Buy 3 regular items: 3 * 20,000 = 60,000 IQD -> Qualifies for Free Delivery!
  // Coupon: 10% with cap 4,000 IQD -> Discount = 4,000 IQD
  // Subtotal = 60,000 IQD
  // Delivery Fee = 0 IQD (Free delivery threshold >= 50,000 met)
  // Final Net Total = 60,000 - 4,000 = 56,000 IQD
  const couponRegression = await pgCreateCoupon({
    code: 'REGR10',
    discountType: 'percentage',
    discountValue: 10,
    maxDiscountAmount: 4000,
  });

  const orderRegression = await pgCreateOrder({
    customer: { name: 'زبون التراجع الشامل', phone: '07766554433', city: 'كربلاء', address: 'حي الحسين' },
    items: [{ productId: prodRegular.id, quantity: 3, saleType: 'retail' }],
    couponCode: 'REGR10',
    createAccountIfMissing: true,
  });

  assert(orderRegression.subtotal === 60000, `Subtotal is 60,000 IQD (actual: ${orderRegression.subtotal})`);
  assert(orderRegression.discount === 4000, `Coupon discount capped at 4,000 IQD (actual: ${orderRegression.discount})`);
  assert(orderRegression.deliveryFee === 0, `Free delivery applied because subtotal 60,000 >= 50,000 (actual: ${orderRegression.deliveryFee})`);
  assert(orderRegression.total === 56000, `Final total = 60,000 - 4,000 + 0 = 56,000 IQD (actual: ${orderRegression.total})`);

  console.log(`\n=================================================================`);
  console.log(`Test Summary: Passed: ${passed}, Failed: ${failed}`);
  console.log(`=================================================================\n`);

  if (failed > 0) {
    throw new Error(`Commerce-2C1 tests failed: ${failed} failures.`);
  }
}

async function main() {
  try {
    await startDatabase();
    await runCommercePhase2c1Tests();
    console.log('✅ ALL COMMERCE-2C1 TESTS COMPLETED SUCCESSFULLY.');
    process.exit(0);
  } catch (err) {
    console.error('❌ TEST SUITE FAILED:', err);
    process.exit(1);
  } finally {
    if (sql) {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
    if (ep) {
      await ep.stop().catch(() => {});
    }
  }
}

main();
