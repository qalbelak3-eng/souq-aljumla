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
  pgRecordCouponRedemption,
} from './src/lib/postgres-coupons.ts';
import {
  toCanonicalIraqiPhone,
  toLocalIraqiPhone,
  validateIraqiPhone,
  isValidIraqiPhone,
  normalizePhoneForFinancialIdentity,
  extractDigitsLegacy,
} from './src/lib/phone-utils.ts';
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
    'drizzle/0015_coupon_redemption_idempotency.sql',
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

  // =========================================================================
  // Scenario 16: Central Phone Normalization & Validation Unit Tests
  // =========================================================================
  console.log('\n=== Scenario 16: Canonical Iraqi Phone Normalization Unit Tests ===');
  const validIraqiCases = [
    { input: '07701234567', expected: '9647701234567' },
    { input: '+9647701234567', expected: '9647701234567' },
    { input: '9647701234567', expected: '9647701234567' },
    { input: '009647701234567', expected: '9647701234567' },
    { input: '0770-123-4567', expected: '9647701234567' },
    { input: '0770 123 4567', expected: '9647701234567' },
    { input: '+964 770 123 4567', expected: '9647701234567' },
    { input: '٠٧٧٠١٢٣٤٥٦٧', expected: '9647701234567' },
    { input: '۰۷۷۰۱۲۳۴۵۶۷', expected: '9647701234567' }, // Persian / Farsi digits
    { input: '+۹۶۴۷۷۰۱۲۳۴۵۶۷', expected: '9647701234567' }, // Persian with +964
  ];

  for (const c of validIraqiCases) {
    const canonical = toCanonicalIraqiPhone(c.input);
    assert(canonical === c.expected, `Phone ${c.input} normalized to ${c.expected} (actual: ${canonical})`);
    assert(isValidIraqiPhone(c.input) === true, `Phone ${c.input} is recognized as valid Iraqi phone`);
  }

  const invalidIraqiCases = ['12345', '08801234567', '0770123', '07701234567890', 'abcdef', ''];
  for (const inv of invalidIraqiCases) {
    const res = validateIraqiPhone(inv);
    assert(res.isValid === false, `Invalid phone "${inv}" rejected by validation`);
    assert(toCanonicalIraqiPhone(inv) === null, `Invalid phone "${inv}" returns null canonical`);
    // Verify fail-closed behavior of normalizePhoneForFinancialIdentity
    assert(normalizePhoneForFinancialIdentity(inv) === null, `Financial identity normalizer strictly returns null for invalid phone "${inv}" (fail-closed, no stripped-digits fallback)`);
  }

  // Verify normalizePhoneForFinancialIdentity works for valid Persian and Arabic phones
  assert(normalizePhoneForFinancialIdentity('۰۷۷۰۱۲۳۴۵۶۷') === '9647701234567', 'Financial identity normalizer converts Persian numerals to canonical');
  assert(normalizePhoneForFinancialIdentity('٠٧٧٠١٢٣٤٥٦٧') === '9647701234567', 'Financial identity normalizer converts Arabic numerals to canonical');

  // Verify extractDigitsLegacy operates as legacy fallback outside coupon financial identity
  assert(extractDigitsLegacy('12345-abc') === '12345', 'extractDigitsLegacy strips non-digits without validation');
  assert(extractDigitsLegacy('+964-770') === '964770', 'extractDigitsLegacy strips non-digits');

  // =========================================================================
  // Scenario 17: Multi-Format Phone Bypass Prevention (0770... vs +964770... vs 00964...)
  // =========================================================================
  console.log('\n=== Scenario 17: Multi-Format Phone Bypass Prevention ===');
  const couponMultiFormat = await pgCreateCoupon({
    code: 'MULTI1',
    discountType: 'fixed',
    discountValue: 3000,
    perCustomerLimit: 1,
    minOrderAmount: 10000,
  });

  // Order 1: local format 07709990001
  const orderMF1 = await pgCreateOrder({
    customer: { name: 'زبون الصيغ 1', phone: '07709990001', city: 'بغداد', address: 'المنصور' },
    items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
    couponCode: 'MULTI1',
    createAccountIfMissing: true,
  });
  assert(Boolean(orderMF1?.id), 'First order with 07709990001 succeeded');

  // Attempt Order 2: same phone with +964 international prefix
  let errMF2 = null;
  try {
    await pgCreateOrder({
      customer: { name: 'زبون الصيغ 2 (+964)', phone: '+9647709990001', city: 'بغداد', address: 'المنصور' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'MULTI1',
      createAccountIfMissing: true,
    });
  } catch (e) {
    errMF2 = e.message;
  }
  assert(errMF2 && (errMF2.includes('استنفاد') || errMF2.includes('الحد الأقصى')), `Attempt with +964 format strictly blocked: ${errMF2}`);

  // Attempt Order 3: same phone with 00964 prefix
  let errMF3 = null;
  try {
    await pgCreateOrder({
      customer: { name: 'زبون الصيغ 3 (00964)', phone: '009647709990001', city: 'بغداد', address: 'المنصور' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'MULTI1',
      createAccountIfMissing: true,
    });
  } catch (e) {
    errMF3 = e.message;
  }
  assert(errMF3 && (errMF3.includes('استنفاد') || errMF3.includes('الحد الأقصى')), `Attempt with 00964 format strictly blocked: ${errMF3}`);

  // Attempt Order 4: same phone with dashes
  let errMF4 = null;
  try {
    await pgCreateOrder({
      customer: { name: 'زبون الصيغ 4 (dashes)', phone: '0770-999-0001', city: 'بغداد', address: 'المنصور' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'MULTI1',
      createAccountIfMissing: true,
    });
  } catch (e) {
    errMF4 = e.message;
  }
  assert(errMF4 && (errMF4.includes('استنفاد') || errMF4.includes('الحد الأقصى')), `Attempt with dashes format strictly blocked: ${errMF4}`);

  // =========================================================================
  // Scenario 18: Guest uses coupon then registers with different format
  // =========================================================================
  console.log('\n=== Scenario 18: Guest then Register with Different Format ===');
  const couponGuestReg = await pgCreateCoupon({
    code: 'GUESTREG1',
    discountType: 'fixed',
    discountValue: 2000,
    perCustomerLimit: 1,
    minOrderAmount: 10000,
  });

  // Guest order with local format
  await pgCreateOrder({
    customer: { name: 'زائر تجريبي', phone: '07801112233', city: 'النجف', address: 'الغري' },
    items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
    couponCode: 'GUESTREG1',
    createAccountIfMissing: true,
  });

  // Customer now logs in / submits with international format +9647801112233
  let errGuestReg = null;
  try {
    await pgCreateOrder({
      customer: { name: 'مسجل جديد', phone: '+9647801112233', city: 'النجف', address: 'الغري' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'GUESTREG1',
      createAccountIfMissing: true,
    });
  } catch (e) {
    errGuestReg = e.message;
  }
  assert(errGuestReg && (errGuestReg.includes('استنفاد') || errGuestReg.includes('الحد الأقصى')), `Registered order with different format strictly blocked: ${errGuestReg}`);

  // =========================================================================
  // Scenario 19: Registered customer then Guest with different format
  // =========================================================================
  console.log('\n=== Scenario 19: Registered Customer then Guest with Different Format ===');
  const couponRegGuest = await pgCreateCoupon({
    code: 'REGGUEST1',
    discountType: 'fixed',
    discountValue: 2000,
    perCustomerLimit: 1,
    minOrderAmount: 10000,
  });

  // Registered order with +964
  await pgCreateOrder({
    customer: { name: 'عميل معتمد', phone: '+9647503334455', city: 'أربيل', address: 'عينكاوة' },
    items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
    couponCode: 'REGGUEST1',
    createAccountIfMissing: true,
  });

  // Logged out guest with local dashes 0750-333-4455
  let errRegGuest = null;
  try {
    await pgCreateOrder({
      customer: { name: 'زائر لنفس العميل', phone: '0750-333-4455', city: 'أربيل', address: 'عينكاوة' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'REGGUEST1',
      createAccountIfMissing: true,
    });
  } catch (e) {
    errRegGuest = e.message;
  }
  assert(errRegGuest && (errRegGuest.includes('استنفاد') || errRegGuest.includes('الحد الأقصى')), `Guest order with local format strictly blocked: ${errRegGuest}`);

  // =========================================================================
  // Scenario 20: Concurrent Requests with 2 Different Phone Formats
  // =========================================================================
  console.log('\n=== Scenario 20: Concurrent Requests with 2 Different Phone Formats ===');
  const couponRaceFormats = await pgCreateCoupon({
    code: 'RACEDIFF1',
    discountType: 'fixed',
    discountValue: 5000,
    perCustomerLimit: 1,
    minOrderAmount: 10000,
  });

  const concurrentDiffPromises = [
    pgCreateOrder({
      customer: { name: 'تزامن صيغة 1', phone: '07707778899', city: 'بابل', address: 'الحلة' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'RACEDIFF1',
      createAccountIfMissing: true,
    }),
    pgCreateOrder({
      customer: { name: 'تزامن صيغة 2', phone: '+9647707778899', city: 'بابل', address: 'الحلة' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'RACEDIFF1',
      createAccountIfMissing: true,
    }),
  ];

  const resultsDiff = await Promise.allSettled(concurrentDiffPromises);
  const successDiff = resultsDiff.filter((r) => r.status === 'fulfilled');
  const rejectedDiff = resultsDiff.filter((r) => r.status === 'rejected');

  assert(successDiff.length === 1, `Exactly 1 concurrent request with different format succeeded (actual: ${successDiff.length})`);
  assert(rejectedDiff.length === 1, `Exactly 1 concurrent request was rejected by advisory lock & limit (actual: ${rejectedDiff.length})`);

  // Verify DB recorded exactly 1 redemption
  const countCanonicalDb = await getCustomerCouponRedemptionCount(
    couponRaceFormats.id,
    { customerPhone: '9647707778899' },
    sql
  );
  assert(countCanonicalDb === 1, `DB recorded exactly 1 redemption under canonical phone: ${countCanonicalDb}`);

  // =========================================================================
  // Scenario 21: DB-Level UNIQUE Constraint & Redemption Idempotency
  // =========================================================================
  console.log('\n=== Scenario 21: DB-Level UNIQUE Constraint & Idempotent Redemption ===');
  const couponIdempotency = await pgCreateCoupon({
    code: 'IDEMP1',
    discountType: 'fixed',
    discountValue: 1000,
    minOrderAmount: 10000,
  });

  const orderIdemp = await pgCreateOrder({
    customer: { name: 'زبون التحقق من التكرار', phone: '07701239876', city: 'بغداد', address: 'الدورة' },
    items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
    couponCode: 'IDEMP1',
    createAccountIfMissing: true,
  });

  // Call pgRecordCouponRedemption a second time for the SAME order with the SAME coupon (Idempotent)
  const secondCallRedemptionId = await pgRecordCouponRedemption(sql, {
    couponId: couponIdempotency.id,
    orderId: orderIdemp.id,
    orderNumber: orderIdemp.orderNumber,
    customerPhone: '07701239876',
    discountAmount: 1000,
  });
  assert(Boolean(secondCallRedemptionId), 'Second call to pgRecordCouponRedemption safely returned redemption ID');

  // Attempt pgRecordCouponRedemption for the SAME order with a DIFFERENT coupon (Integrity Violation)
  let diffCouponError = null;
  try {
    await pgRecordCouponRedemption(sql, {
      couponId: '00000000-0000-0000-0000-000000000099', // Different coupon ID
      orderId: orderIdemp.id,
      orderNumber: orderIdemp.orderNumber,
      customerPhone: '07701239876',
      discountAmount: 1000,
    });
  } catch (err) {
    diffCouponError = err;
  }
  assert(
    diffCouponError && diffCouponError.message.includes('تعارض في سلامة البيانات'),
    `pgRecordCouponRedemption strictly rejects different coupon for same order: ${diffCouponError?.message}`
  );

  // Attempt pgRecordCouponRedemption with an invalid phone (Fail-closed)
  let invPhoneRedempError = null;
  try {
    await pgRecordCouponRedemption(sql, {
      couponId: couponIdempotency.id,
      orderId: '00000000-0000-0000-0000-000000000098',
      orderNumber: 'ORD-TEST-FAIL-CLOSED',
      customerPhone: '12345',
      discountAmount: 1000,
    });
  } catch (err) {
    invPhoneRedempError = err;
  }
  assert(
    invPhoneRedempError && invPhoneRedempError.message.includes('غير صالح'),
    `pgRecordCouponRedemption fails closed on invalid phone: ${invPhoneRedempError?.message}`
  );

  // Test pgValidateCoupon fails closed with invalid phone when perCustomerLimit > 0
  const valInvRes = await pgValidateCoupon(couponIdempotency.code, 20000, 'individual', {
    customerPhone: '08801234567', // invalid prefix
  });
  // Note: couponIdempotency has perCustomerLimit null, let's test against couponMultiFormat
  const valInvMulti = await pgValidateCoupon(couponMultiFormat.code, 20000, 'individual', {
    customerPhone: '12345',
  });
  assert(valInvMulti.valid === false, 'pgValidateCoupon rejects invalid phone under perCustomerLimit');
  assert(valInvMulti.message.includes('غير صالح'), `pgValidateCoupon returns fail-closed message: ${valInvMulti.message}`);

  // Test pgConsumeCoupon fails closed with invalid phone when perCustomerLimit > 0
  let consumeInvError = null;
  try {
    await pgConsumeCoupon(couponMultiFormat.code, 20000, 'individual', {
      customerPhone: '077012', // incomplete phone
    });
  } catch (err) {
    consumeInvError = err;
  }
  assert(consumeInvError && consumeInvError.message.includes('غير صالح'), `pgConsumeCoupon fails closed on invalid phone: ${consumeInvError?.message}`);

  // Verify directly from PostgreSQL that table has strictly 1 redemption for this order
  const dbRedemptions = await sql`SELECT count(*)::int as cnt FROM coupon_redemptions WHERE order_id = ${orderIdemp.id}`;
  assert(dbRedemptions[0].cnt === 1, `PostgreSQL has strictly 1 redemption row for this order (actual: ${dbRedemptions[0].cnt})`);

  // Directly attempt raw duplicate insert in PostgreSQL to verify engine-level UNIQUE constraint
  let rawDbError = null;
  try {
    await sql`
      INSERT INTO coupon_redemptions (coupon_id, order_id, order_number, customer_phone, discount_amount)
      VALUES (${couponIdempotency.id}, ${orderIdemp.id}, ${orderIdemp.orderNumber}, '9647701239876', 1000.00);
    `;
  } catch (err) {
    rawDbError = err;
  }
  assert(
    rawDbError && (rawDbError.code === '23505' || rawDbError.message.includes('unique')),
    `PostgreSQL engine strictly blocked duplicate insert with 23505 unique violation: ${rawDbError?.message}`
  );

  // =========================================================================
  // Scenario 22: Coupons without perCustomerLimit (Unlimited) Function Freely
  // =========================================================================
  console.log('\n=== Scenario 22: Coupons without perCustomerLimit Function Freely ===');
  const couponUnlimited = await pgCreateCoupon({
    code: 'UNLIMITED1',
    discountType: 'fixed',
    discountValue: 1000,
    perCustomerLimit: null, // Unlimited per customer
    usageLimit: 10,
    minOrderAmount: 10000,
  });

  const phoneRepeat = '07705551212';
  for (let i = 1; i <= 3; i++) {
    const repOrder = await pgCreateOrder({
      customer: { name: `طلب تكرار ${i}`, phone: phoneRepeat, city: 'بغداد', address: 'الكاظمية' },
      items: [{ productId: prodRegular.id, quantity: 1, saleType: 'retail' }],
      couponCode: 'UNLIMITED1',
      createAccountIfMissing: true,
    });
    assert(Boolean(repOrder?.id), `Order ${i} for unlimited coupon succeeded`);
  }
  const repCount = await getCustomerCouponRedemptionCount(couponUnlimited.id, { customerPhone: phoneRepeat }, sql);
  assert(repCount === 3, `Customer placed 3 orders successfully under unlimited coupon (actual: ${repCount})`);

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
