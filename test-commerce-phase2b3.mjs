import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  resolveAuthoritativeProductPrice,
  getProductPriceForUser,
  normalizePricingIdentity,
} from './src/lib/pricing.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54356;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2b3_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.DATA_SOURCE_CATALOG_BASE = 'postgres';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2b3-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2b3-test-secret-min-32-chars-long';

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

  console.log('2. Applying schema and migrations (0000 -> 0012)...');
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
    'drizzle/0016_order_idempotency_cashback_integrity.sql',
    'drizzle/0017_order_lifecycle_reversals.sql',
    'drizzle/0018_commerce_phase2c4b_hardening.sql',
  ];

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    if (fs.existsSync(fullPath)) {
      await runSqlScript(sql, fullPath);
    }
  }
  console.log('   All migrations applied successfully.');
}

async function runCommercePhase2b3Tests() {
  console.log('\n================================================================');
  console.log('  COMMERCE-2B3: FINAL PRICING AUTHORITY & BEST ELIGIBLE PRICE   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Part 1: Pure Unit Tests for resolveAuthoritativeProductPrice (Scenarios 1-20 & 30)
  // -------------------------------------------------------------------------
  console.log('\n--- Part 1: resolveAuthoritativeProductPrice Unit Verification ---');

  const baseProduct = {
    id: 'prod-test-01',
    name: 'منتج تجربة التسعير المرجعي',
    price: 10000,
    wholesalePrice: 80000,
    marketPrice: 85000,
    boxPrice: 90000,
    specialPrice: 78000,
    vipPrice: 75000,
    costPrice: 60000,
    pieceCostPrice: 6000,
  };

  // Scenario 1: Individual retail without offer
  const res1 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'retail',
    user: { accountType: 'individual' },
  });
  assert(res1.finalUnitPrice === 10000, 'Scenario 1: Individual retail without offer returns retail price (10,000)');
  assert(res1.pricingTierApplied === 'retail', 'Scenario 1: Pricing tier is retail');
  assert(res1.isOfferApplied === false, 'Scenario 1: No offer applied');

  // Scenario 2: Individual retail with lower active offer
  const res2 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'retail',
    user: { accountType: 'individual' },
    activeOffer: { id: 'offer-1', offerPrice: 8000, originalPrice: 10000 },
  });
  assert(res2.finalUnitPrice === 8000, 'Scenario 2: Individual retail with lower offer returns offerPrice (8,000)');
  assert(res2.isOfferApplied === true, 'Scenario 2: isOfferApplied is true');
  assert(res2.offerSavingsPerUnit === 2000, 'Scenario 2: offerSavingsPerUnit is 2,000');

  // Scenario 3: Individual retail with higher active offer (offer never increases price)
  const res3 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'retail',
    user: { accountType: 'individual' },
    activeOffer: { id: 'offer-bad', offerPrice: 12000, originalPrice: 10000 },
  });
  assert(res3.finalUnitPrice === 10000, 'Scenario 3: Individual retail with higher offer returns base price 10,000');
  assert(res3.isOfferApplied === false, 'Scenario 3: Higher offer is not applied');

  // Scenario 4: Individual carton without boxPrice (boxPrice <= 0) falls back to wholesalePrice
  const res4 = resolveAuthoritativeProductPrice({
    product: { ...baseProduct, boxPrice: 0 },
    saleType: 'wholesale',
    user: { accountType: 'individual' },
  });
  assert(res4.finalUnitPrice === 80000, 'Scenario 4: Individual carton with boxPrice=0 falls back to wholesalePrice');
  assert(res4.pricingTierApplied === 'consumer_carton', 'Scenario 4: Pricing tier is consumer_carton');

  // Scenario 5: Individual carton with boxPrice > 0 returns boxPrice
  const res5 = resolveAuthoritativeProductPrice({
    product: baseProduct, // boxPrice = 90000
    saleType: 'wholesale',
    user: { accountType: 'individual' },
  });
  assert(res5.finalUnitPrice === 90000, 'Scenario 5: Individual carton with boxPrice > 0 returns boxPrice (90,000)');
  assert(res5.pricingTierApplied === 'consumer_carton', 'Scenario 5: Pricing tier is consumer_carton');

  // Scenario 6: Individual carton with boxPrice > wholesalePrice strictly gets boxPrice (never merchant wholesale)
  assert(res5.finalUnitPrice > baseProduct.wholesalePrice, 'Scenario 6: Individual boxPrice (90k) > wholesalePrice (80k)');
  assert(res5.finalUnitPrice === 90000, 'Scenario 6: Individual is strictly charged boxPrice, not merchant wholesale');

  // Scenario 7: Individual customer never gets marketPrice, specialPrice, or vipPrice even if lower
  const lowTierProduct = { ...baseProduct, boxPrice: 90000, marketPrice: 50000, specialPrice: 40000, vipPrice: 30000 };
  const res7 = resolveAuthoritativeProductPrice({
    product: lowTierProduct,
    saleType: 'wholesale',
    user: { accountType: 'individual' },
  });
  assert(res7.finalUnitPrice === 90000, 'Scenario 7: Individual never gets merchant tiers (market/special/vip) even if lower');

  // Scenario 8: Market merchant wholesale without offer returns marketPrice (85,000)
  const res8 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'market' },
  });
  assert(res8.finalUnitPrice === 85000, 'Scenario 8: Market merchant wholesale without offer returns marketPrice (85,000)');
  assert(res8.pricingTierApplied === 'market', 'Scenario 8: Pricing tier is market');

  // Scenario 9: Market merchant wholesale with wholesale offer lower than market -> gets offerWholesalePrice (Closing Market+Offer Gap!)
  const res9 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'market' },
    activeOffer: { id: 'offer-ws', offerPrice: 8500, offerWholesalePrice: 70000, originalWholesalePrice: 80000 },
  });
  assert(res9.finalUnitPrice === 70000, 'Scenario 9: Market merchant gets lower wholesale offer (70,000 < 85,000)');
  assert(res9.isOfferApplied === true, 'Scenario 9: isOfferApplied is true');
  assert(res9.offerSavingsPerUnit === 15000, 'Scenario 9: Savings per unit is 15,000 (85k - 70k)');

  // Scenario 10: Market merchant wholesale with wholesale offer higher than market (offerWholesalePrice 90k > market 85k)
  const res10 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'market' },
    activeOffer: { id: 'offer-high-ws', offerPrice: 8500, offerWholesalePrice: 90000, originalWholesalePrice: 80000 },
  });
  assert(res10.finalUnitPrice === 85000, 'Scenario 10: Market merchant with higher wholesale offer gets marketPrice (85,000)');
  assert(res10.isOfferApplied === false, 'Scenario 10: Higher wholesale offer is not applied');

  // Scenario 11: Market merchant wholesale with retail-only offer (no wholesale offer)
  const res11 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'market' },
    activeOffer: { id: 'offer-retail-only', offerPrice: 7000 },
  });
  assert(res11.finalUnitPrice === 85000, 'Scenario 11: Market merchant wholesale with retail-only offer gets marketPrice (85,000)');

  // Scenario 12: Bronze merchant wholesale without offer returns wholesalePrice (80,000)
  const res12 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'bronze' },
  });
  assert(res12.finalUnitPrice === 80000, 'Scenario 12: Bronze merchant wholesale without offer returns wholesalePrice (80,000)');
  assert(res12.pricingTierApplied === 'wholesale_bronze', 'Scenario 12: Pricing tier is wholesale_bronze');

  // Scenario 13: Bronze merchant wholesale with lower offer returns offerWholesalePrice (72,000)
  const res13 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'bronze' },
    activeOffer: { id: 'offer-b', offerPrice: 8000, offerWholesalePrice: 72000, originalWholesalePrice: 80000 },
  });
  assert(res13.finalUnitPrice === 72000, 'Scenario 13: Bronze merchant wholesale with offer gets offerWholesalePrice (72,000)');
  assert(res13.isOfferApplied === true, 'Scenario 13: isOfferApplied is true');

  // Scenario 14: Silver merchant wholesale without offer returns specialPrice (78,000)
  const res14 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'silver' },
  });
  assert(res14.finalUnitPrice === 78000, 'Scenario 14: Silver merchant wholesale without offer returns specialPrice (78,000)');
  assert(res14.pricingTierApplied === 'wholesale_silver', 'Scenario 14: Pricing tier is wholesale_silver');

  // Scenario 15: Silver merchant wholesale with lower offer (72,000 < 78,000)
  const res15 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'silver' },
    activeOffer: { id: 'offer-s', offerPrice: 8000, offerWholesalePrice: 72000, originalWholesalePrice: 80000 },
  });
  assert(res15.finalUnitPrice === 72000, 'Scenario 15: Silver merchant with offer gets offerWholesalePrice (72,000)');

  // Scenario 16: Gold merchant wholesale without offer returns vipPrice (75,000)
  const res16 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'gold' },
  });
  assert(res16.finalUnitPrice === 75000, 'Scenario 16: Gold merchant wholesale without offer returns vipPrice (75,000)');
  assert(res16.pricingTierApplied === 'wholesale_gold', 'Scenario 16: Pricing tier is wholesale_gold');

  // Scenario 17: Gold merchant wholesale with lower offer (70,000 < 75,000)
  const res17 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'wholesale',
    user: { accountType: 'merchant', merchantTier: 'gold' },
    activeOffer: { id: 'offer-g', offerPrice: 8000, offerWholesalePrice: 70000, originalWholesalePrice: 80000 },
  });
  assert(res17.finalUnitPrice === 70000, 'Scenario 17: Gold merchant with offer gets offerWholesalePrice (70,000)');

  // Scenario 18: Expired offer (endDate in the past) is ignored
  const pastDate = new Date(Date.now() - 3600000);
  const res18 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'retail',
    user: { accountType: 'individual' },
    activeOffer: { id: 'offer-exp', offerPrice: 6000, endDate: pastDate },
  });
  assert(res18.finalUnitPrice === 10000, 'Scenario 18: Expired offer is ignored');
  assert(res18.isOfferApplied === false, 'Scenario 18: isOfferApplied is false');

  // Scenario 19: Future offer (startDate in the future) is ignored
  const futureDate = new Date(Date.now() + 3600000);
  const res19 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'retail',
    user: { accountType: 'individual' },
    activeOffer: { id: 'offer-fut', offerPrice: 6000, startDate: futureDate },
  });
  assert(res19.finalUnitPrice === 10000, 'Scenario 19: Future offer is ignored');

  // Scenario 20: Inactive offer (isActive: false) is ignored
  const res20 = resolveAuthoritativeProductPrice({
    product: baseProduct,
    saleType: 'retail',
    user: { accountType: 'individual' },
    activeOffer: { id: 'offer-inact', offerPrice: 6000, isActive: false },
  });
  assert(res20.finalUnitPrice === 10000, 'Scenario 20: Inactive offer is ignored');

  // Scenario 30: Audit & Explanation metrics verification
  assert(typeof res9.explanation === 'string' && res9.explanation.length > 0, 'Scenario 30: Structured explanation returned');
  assert(res9.tierSavingsPerUnit === 0, 'Scenario 9 tierSavingsPerUnit is 0 relative to market');
  assert(res9.totalSavingsPerUnit === 15000, 'Scenario 30: totalSavingsPerUnit is 15,000');


  // -------------------------------------------------------------------------
  // Part 2: Database & PostgreSQL Transactions Integration Tests
  // -------------------------------------------------------------------------
  console.log('\n--- Part 2: Database & Transactional Order Processing ---');

  const { pgCreateOrder, pgGetOrderById } = await import('./src/lib/postgres-orders.ts');
  const { pgCreateCoupon, pgGetCoupons, pgGetCouponByCode } = await import('./src/lib/postgres-coupons.ts');
  const { POST: ordersPostHandler } = await import('./src/app/api/orders/route.ts');

  // Pre-seed test category and product
  const [testCat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم تجارب التسعير المرجعي', 'test-pricing-cat')
    RETURNING id, name;
  `;

  const [dbProduct] = await sql`
    INSERT INTO products (
      name, category_id,
      price, wholesale_price, market_price, box_price, special_price, vip_price,
      cost_price, piece_cost_price,
      current_stock_pieces,
      boxes_per_carton, items_per_box, pieces_per_carton,
      retail_unit, wholesale_unit,
      cashback_customer_amount
    ) VALUES (
      'منتج مرجعي معتمد', ${testCat.id},
      '10000.00', '80000.00', '85000.00', '90000.00', '78000.00', '75000.00',
      '6000.00', '6000.00',
      1000,
      2, 5, 10,
      'قطعة', 'كرتون',
      '500.00'
    ) RETURNING *;
  `;

  // Pre-seed an active wholesale offer for dbProduct: wholesale offer 70,000 (below market 85,000 and wholesale 80,000)
  const tomorrow = new Date(Date.now() + 86400000);
  const [dbOffer] = await sql`
    INSERT INTO product_offers (
      product_id, offer_price, offer_wholesale_price, original_price, original_wholesale_price,
      start_date, end_date, is_active
    ) VALUES (
      ${dbProduct.id}, '8000.00', '70000.00', '10000.00', '80000.00',
      NOW() - INTERVAL '1 hour', ${tomorrow}, true
    ) RETURNING *;
  `;

  // Pre-seed financial accounts
  await sql`
    INSERT INTO financial_accounts (account_code, name, phone, category, pricing_tier, city, address)
    VALUES
      ('ACC-TEST-01', 'عميل يحاول التلاعب بالسعر', '07700000001', 'customer', 'retail', 'بغداد', 'المنصور'),
      ('ACC-TEST-02', 'عميل تفاوضي معتمد من الإدارة', '07700000002', 'customer', 'retail', 'كربلاء', 'شارع ميثم'),
      ('ACC-TEST-03', 'عميل يستخدم كوبون بعد العرض', '07700000003', 'customer', 'retail', 'كربلاء', 'كربلاء'),
      ('ACC-TEST-04', 'عميل لديه أرباح كاشباك', '07700000004', 'customer', 'retail', 'كربلاء', 'كربلاء'),
      ('ACC-TEST-05', 'تاجر جملة سوق', '07700000005', 'customer', 'market', 'كربلاء', 'سوق الجملة'),
      ('ACC-TEST-06', 'عميل فحص الـ API', '07700000006', 'customer', 'market', 'بغداد', 'بغداد'),
      ('ACC-TEST-07', 'عميل سلة قديمة', '07700000007', 'customer', 'market', 'بغداد', 'بغداد'),
      ('ACC-TEST-08', 'عميل سلة قديمة 2', '07700000008', 'customer', 'market', 'بغداد', 'بغداد'),
      ('ACC-TEST-09', 'عميل ترقية رتبة', '07700000009', 'customer', 'retail', 'بغداد', 'بغداد')
    ON CONFLICT DO NOTHING;
  `;

  const [cbAcc] = await sql`SELECT id FROM financial_accounts WHERE phone = '07700000004' LIMIT 1;`;
  await sql`
    INSERT INTO cashback_ledger (account_id, type, amount)
    VALUES (${cbAcc.id}, 'earned', '50000.00');
  `;

  // Scenario 21: Privilege separation: Unprivileged customer spoofing a price (e.g. 500 instead of official)
  console.log('\n--- Scenario 21: Spoofed Price Protection ---');
  const spoofedOrder = await pgCreateOrder({
    customer: {
      name: 'عميل يحاول التلاعب بالسعر',
      phone: '07700000001',
      address: 'بغداد - المنصور',
    },
    items: [
      {
        productId: dbProduct.id,
        quantity: 2,
        price: 500, // Client attempts to buy at 500
        saleType: 'retail',
      },
    ],
    userAccountType: 'individual',
    deliveryFee: 5000,
    createAccountIfMissing: true,
    operator: { role: 'customer' },
  });

  const verifiedSpoofed = await pgGetOrderById(spoofedOrder.id);
  assert(verifiedSpoofed !== null, 'Scenario 21: Order created');
  assert(Number(verifiedSpoofed.items[0].price) === 8000, 'Scenario 21: Spoofed price 500 overwritten with official offer price 8000');
  assert(verifiedSpoofed.subtotal === 16000, 'Scenario 21: Subtotal is 16,000 (8000 * 2)');

  // Scenario 22: Privileged Staff with trustSuppliedPrices: true can apply custom negotiated price
  console.log('\n--- Scenario 22: Privileged Staff Custom Price Override ---');
  const staffOrder = await pgCreateOrder({
    customer: {
      name: 'عميل تفاوضي معتمد من الإدارة',
      phone: '07700000002',
      address: 'كربلاء - شارع ميثم',
    },
    items: [
      {
        productId: dbProduct.id,
        quantity: 1,
        price: 6500, // Custom negotiated price
        saleType: 'retail',
        pricingTierSnap: 'negotiated_custom',
      },
    ],
    userAccountType: 'individual',
    deliveryFee: 5000,
    trustSuppliedPrices: true,
    operator: { id: 'admin-1', role: 'admin', name: 'المدير العام' },
  });

  const verifiedStaffOrder = await pgGetOrderById(staffOrder.id);
  assert(Number(verifiedStaffOrder.items[0].price) === 6500, 'Scenario 22: Privileged staff custom price 6,500 honored');

  // Scenario 23: Stacking: Unit Price / Offer -> Subtotal -> Coupon discount
  console.log('\n--- Scenario 23: Stacking Order (Unit Price -> Coupon) ---');
  const coupon = await pgCreateCoupon({
    code: 'TIERDISC10',
    discountType: 'percentage',
    discountValue: 10, // 10%
    targetAudience: 'all',
  });

  const couponOrder = await pgCreateOrder({
    customer: {
      name: 'عميل يستخدم كوبون بعد العرض',
      phone: '07700000003',
      address: 'كربلاء',
    },
    items: [
      {
        productId: dbProduct.id,
        quantity: 2,
        saleType: 'retail', // 8000 each -> subtotal 16,000
      },
    ],
    userAccountType: 'individual',
    couponCode: 'TIERDISC10',
    deliveryFee: 5000,
    operator: { role: 'customer' },
  });

  const verifiedCouponOrder = await pgGetOrderById(couponOrder.id);
  assert(verifiedCouponOrder.subtotal === 16000, 'Scenario 23: Subtotal is 16,000 (after unit offer)');
  assert(verifiedCouponOrder.discount === 1600, 'Scenario 23: 10% coupon applied on 16,000 is 1,600');
  assert(verifiedCouponOrder.total === 19400, 'Scenario 23: Total = 16,000 + 5,000 - 1,600 = 19,400');

  // Scenario 24 & 25: Stacking: Cashback capped at remaining subtotal, never covers delivery fee, total never negative
  console.log('\n--- Scenario 24 & 25: Cashback & Delivery Fee Defense ---');
  const [cashbackAccount] = await sql`
    SELECT * FROM financial_accounts WHERE phone = '07700000004' LIMIT 1;
  `;

  // Subtotal = 16,000. Delivery = 5,000. Customer tries to redeem 25,000 cashback.
  // Maximum allowable cashback is subtotal (16,000). Remaining total must be at least delivery fee (5,000).
  const cashbackOrder = await pgCreateOrder({
    customer: {
      name: cashbackAccount.name,
      phone: cashbackAccount.phone,
      address: 'كربلاء',
    },
    items: [
      {
        productId: dbProduct.id,
        quantity: 2,
        saleType: 'retail',
      },
    ],
    accountId: cashbackAccount.id,
    userAccountType: 'individual',
    deliveryFee: 5000,
    usedCashbackDiscount: 25000, // Attempts to cover delivery fee and exceed subtotal
    operator: { role: 'customer' },
  });

  const verifiedCbOrder = await pgGetOrderById(cashbackOrder.id);
  assert(verifiedCbOrder.usedCashbackDiscount === 16000, 'Scenario 24: Cashback capped at subtotal (16,000), not requested 25,000');
  assert(verifiedCbOrder.total === 5000, 'Scenario 25: Final total is strictly 5,000 (delivery fee protected)');
  assert(verifiedCbOrder.total >= 0, 'Scenario 25: Total is not negative');

  // Scenario 26: Orders table snapshot: customer_account_type_snap and customer_merchant_tier_snap
  console.log('\n--- Scenario 26: Orders Snapshot Verification ---');
  const marketOrder = await pgCreateOrder({
    customer: {
      name: 'تاجر جملة سوق',
      phone: '07700000005',
      address: 'سوق الجملة',
    },
    items: [
      {
        productId: dbProduct.id,
        quantity: 1,
        saleType: 'wholesale',
      },
    ],
    userAccountType: 'merchant',
    userMerchantTier: 'market',
    deliveryFee: 10000,
    operator: { role: 'customer' },
  });

  const verifiedMarketOrder = await pgGetOrderById(marketOrder.id);
  assert(verifiedMarketOrder.customerAccountTypeSnap === 'market', 'Scenario 26: customerAccountTypeSnap is market');

  // Also verify Gold merchant snapshots
  const goldOrder = await pgCreateOrder({
    customer: {
      name: 'تاجر جملة ذهبي',
      phone: '07700000010',
      address: 'سوق الجملة - كربلاء',
    },
    items: [
      {
        productId: dbProduct.id,
        quantity: 1,
        saleType: 'wholesale',
      },
    ],
    userAccountType: 'wholesale',
    userMerchantTier: 'gold',
    deliveryFee: 10000,
    createAccountIfMissing: true,
    operator: { role: 'customer' },
  });

  const verifiedGoldOrder = await pgGetOrderById(goldOrder.id);
  assert(verifiedGoldOrder.customerAccountTypeSnap === 'wholesale', 'Scenario 26: customerAccountTypeSnap for Gold is wholesale');
  assert(verifiedGoldOrder.customerMerchantTierSnap === 'gold', 'Scenario 26: customerMerchantTierSnap for Gold is gold');

  // Scenario 27: Order items table snapshot: pricing_tier_snap
  console.log('\n--- Scenario 27: Order Items Snapshot Verification ---');
  assert(verifiedMarketOrder.items[0].pricingTierSnap === 'market', 'Scenario 27: pricingTierSnap on order item is market');
  assert(Number(verifiedMarketOrder.items[0].price) === 70000, 'Scenario 27: Market customer got active wholesale offer price 70,000');
  assert(verifiedGoldOrder.items[0].pricingTierSnap === 'wholesale_gold', 'Scenario 27: pricingTierSnap for Gold is wholesale_gold');

  // Scenario 28: Parity: POST /api/orders authoritative pricing matches pgCreateOrder
  console.log('\n--- Scenario 28: API / Route Parity ---');
  const apiReq = new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'عميل فحص الـ API',
        phone: '07700000006',
        city: 'بغداد',
        address: 'المنصور',
      },
      items: [
        {
          productId: dbProduct.id,
          quantity: 1,
          saleType: 'wholesale',
          price: 70000,
        },
      ],
      userAccountType: 'market',
      deliveryFee: 5000,
    }),
  });

  const apiRes = await ordersPostHandler(apiReq);
  const apiData = await apiRes.json();
  assert(apiData.success === true, 'Scenario 28: POST /api/orders succeeded');
  assert(apiData.order.subtotal === 70000, 'Scenario 28: API calculated subtotal 70,000 matching pgCreateOrder');
  assert(apiData.order.items[0].pricingTierSnap === 'market', 'Scenario 28: API populated pricingTierSnap market');

  // Scenario 29: Stale Cart Detection (price increase, price decrease, offer expired, tier change)
  console.log('\n--- Scenario 29: Stale Cart Detection ---');
  // 29a: Cart price lower than authoritative price (rejectStaleCartPrice: true)
  const staleReqLower = new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { name: 'عميل سلة قديمة', phone: '07700000007', city: 'بغداد', address: 'بغداد' },
      items: [
        {
          productId: dbProduct.id,
          quantity: 1,
          saleType: 'wholesale',
          price: 60000, // Stale price: client thinks it is 60k, official is 70k
        },
      ],
      userAccountType: 'merchant',
      userMerchantTier: 'market',
      rejectStaleCartPrice: true,
    }),
  });
  const staleResLower = await ordersPostHandler(staleReqLower);
  const staleDataLower = await staleResLower.json();
  assert(staleResLower.status === 400, 'Scenario 29a: Returns 400 status for stale cart price increase');
  assert(staleDataLower.code === 'STALE_CART_PRICE', 'Scenario 29a: Returns code STALE_CART_PRICE');

  // 29b: Cart price higher than authoritative price (price decrease: client thinks it is 85k, now 70k)
  const staleReqHigher = new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { name: 'عميل سلة قديمة 2', phone: '07700000008', city: 'بغداد', address: 'بغداد' },
      items: [
        {
          productId: dbProduct.id,
          quantity: 1,
          saleType: 'wholesale',
          price: 85000, // Stale price: client had 85k before offer started
        },
      ],
      userAccountType: 'merchant',
      userMerchantTier: 'market',
      rejectStaleCartPrice: true,
    }),
  });
  const staleResHigher = await ordersPostHandler(staleReqHigher);
  const staleDataHigher = await staleResHigher.json();
  assert(staleResHigher.status === 400, 'Scenario 29b: Returns 400 for stale cart price decrease (protect customer from overpaying)');
  assert(staleDataHigher.code === 'STALE_CART_PRICE', 'Scenario 29b: Returns code STALE_CART_PRICE');

  // 29c: Customer tier changed (client had individual retail 10,000, but now authenticated as Gold merchant getting 75,000 wholesale or retail offer)
  const staleReqTier = new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { name: 'عميل ترقية رتبة', phone: '07700000009', city: 'بغداد', address: 'بغداد' },
      items: [
        {
          productId: dbProduct.id,
          quantity: 1,
          saleType: 'retail',
          price: 10000, // Client cart has 10,000, but active offer is 8,000
        },
      ],
      userAccountType: 'individual',
      rejectStaleCartPrice: true,
    }),
  });
  const staleResTier = await ordersPostHandler(staleReqTier);
  const staleDataTier = await staleResTier.json();
  assert(staleResTier.status === 400, 'Scenario 29c: Returns 400 when client cart retail price (10k) differs from active offer (8k)');
  assert(staleDataTier.code === 'STALE_CART_PRICE', 'Scenario 29c: Returns code STALE_CART_PRICE');

  // Scenario 31: Pure DML Verification: Coupon Read & Order Creation without runtime DDL
  console.log('\n--- Scenario 31: Pure DML Verification (Coupons & Orders) ---');
  const allCoupons = await pgGetCoupons();
  assert(Array.isArray(allCoupons) && allCoupons.length > 0, 'Scenario 31: pgGetCoupons succeeds via pure DML');
  const foundCoupon = await pgGetCouponByCode('TIERDISC10');
  assert(foundCoupon !== null && foundCoupon.code === 'TIERDISC10', 'Scenario 31: pgGetCouponByCode succeeds via pure DML');

  // Scenario 32: Fail-Fast Architecture on Unmigrated Database (Missing 0012)
  console.log('\n--- Scenario 32: Fail-Fast Architecture on Unmigrated Database ---');
  // Intentionally drop the columns added by migration 0012 to simulate an unmigrated database state
  await sql`ALTER TABLE "orders" DROP COLUMN IF EXISTS "customer_account_type_snap";`;
  await sql`ALTER TABLE "orders" DROP COLUMN IF EXISTS "customer_merchant_tier_snap";`;
  await sql`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "pricing_tier_snap";`;

  let unmigratedFailedAsExpected = false;
  let unmigratedErrorMessage = '';
  try {
    await pgCreateOrder({
      customer: {
        name: 'عميل تجربة قاعدة غير مهاجرة',
        phone: '07700000099',
        address: 'كربلاء',
      },
      items: [
        {
          productId: dbProduct.id,
          quantity: 1,
          saleType: 'retail',
        },
      ],
      userAccountType: 'individual',
      deliveryFee: 5000,
      createAccountIfMissing: true,
      operator: { role: 'customer' },
    });
  } catch (err) {
    unmigratedFailedAsExpected = true;
    unmigratedErrorMessage = err.message || '';
  }

  assert(unmigratedFailedAsExpected, 'Scenario 32: pgCreateOrder fails fast when migration 0012 is missing');
  assert(
    unmigratedErrorMessage.includes('customer_account_type_snap') || unmigratedErrorMessage.includes('does not exist'),
    `Scenario 32: Error explicitly cites missing column without attempting runtime self-healing DDL: "${unmigratedErrorMessage}"`
  );

  // Check that the column was NOT automatically created (no self-healing occurred)
  const colCheck = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'customer_account_type_snap';
  `;
  assert(colCheck.length === 0, 'Scenario 32: No runtime DDL self-healing occurred; column remains absent');

  // Re-apply migration 0012 to prove that applying the formal migration restores order creation
  console.log('   Re-applying migration 0012 to restore database schema...');
  await runSqlScript(sql, path.resolve(process.cwd(), 'drizzle/0012_pricing_tier_snapshots.sql'));

  const restoredOrder = await pgCreateOrder({
    customer: {
      name: 'عميل تجربة بعد تطبيق الميجريشن',
      phone: '07700000099',
      address: 'كربلاء',
    },
    items: [
      {
        productId: dbProduct.id,
        quantity: 1,
        saleType: 'retail',
      },
    ],
    userAccountType: 'individual',
    deliveryFee: 5000,
    createAccountIfMissing: true,
    operator: { role: 'customer' },
  });
  assert(restoredOrder && restoredOrder.id, 'Scenario 32: Order creation succeeds once formal migration 0012 is applied');

  console.log('\n================================================================');
  console.log(`  ALL COMMERCE-2B3 TESTS COMPLETE: ${passed} passed, ${failed} failed `);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

async function main() {
  try {
    await startDatabase();
    await runCommercePhase2b3Tests();
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    if (sql) {
      await sql.end({ timeout: 5 });
    }
    if (ep) {
      try {
        await ep.stop();
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 800));
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {}
  }
}

main();
