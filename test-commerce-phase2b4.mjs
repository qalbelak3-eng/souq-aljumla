import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  pgGetCategories,
  pgCreateCategory,
  pgUpdateCategory,
  pgDeleteCategory,
  pgGetProducts,
  pgGetProductById,
  pgCreateProduct,
  pgUpdateProduct,
  pgDeleteProduct,
  pgArchiveProduct,
  pgReactivateProduct,
} from './src/lib/postgres-catalog.ts';
import { pgCreateOrder } from './src/lib/postgres-orders.ts';
import { pgSeedInitialCoupons } from './src/lib/postgres-coupons.ts';
import { resolveAuthoritativeProductPrice } from './src/lib/pricing.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54358;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2b4_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.DATA_SOURCE_CATALOG_BASE = 'postgres';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2b4-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2b4-test-secret-min-32-chars-long';

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

  console.log('2. Applying schema and migrations (0000 -> 0013)...');
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
  ];

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    if (fs.existsSync(fullPath)) {
      await runSqlScript(sql, fullPath);
    }
  }
  console.log('   All 14 migrations applied successfully.');
}

async function runCommercePhase2b4Tests() {
  console.log('\n--- Starting Commerce-2B4 Integrity Test Suite ---\n');
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
  // Section 1: Static Code Integrity (No db.ts imports in migrated routes)
  // =========================================================================
  console.log('=== Section 1: Static Code Architecture Integrity ===');

  const productDetailPageCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/product/[id]/page.tsx'),
    'utf-8'
  );
  assert(
    !productDetailPageCode.includes('@/lib/db') && !productDetailPageCode.includes('store_db.json'),
    'Product Detail Page (src/app/product/[id]/page.tsx) has 0 imports of db.ts or store_db.json'
  );
  assert(
    productDetailPageCode.includes('pgGetProductById') &&
      productDetailPageCode.includes('resolveAuthoritativeProductPrice'),
    'Product Detail Page uses pgGetProductById and resolveAuthoritativeProductPrice'
  );

  const categoriesRouteCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/api/categories/route.ts'),
    'utf-8'
  );
  assert(
    !categoriesRouteCode.includes('@/lib/db'),
    'Categories route (src/app/api/categories/route.ts) has 0 imports of db.ts'
  );

  const categoryIdRouteCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/api/categories/[id]/route.ts'),
    'utf-8'
  );
  assert(
    !categoryIdRouteCode.includes('@/lib/db'),
    'Category [id] route (src/app/api/categories/[id]/route.ts) has 0 imports of db.ts'
  );

  const productsRouteCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/api/products/route.ts'),
    'utf-8'
  );
  assert(
    !productsRouteCode.includes('@/lib/db') && !productsRouteCode.includes('getDomainDataSource'),
    'Products route (src/app/api/products/route.ts) has 0 imports of db.ts or getDomainDataSource'
  );
  assert(
    productsRouteCode.includes('pgGetProducts') && productsRouteCode.includes('pgCreateProduct'),
    'Products route directly uses PostgreSQL pgGetProducts and pgCreateProduct'
  );

  const productIdRouteCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/api/products/[id]/route.ts'),
    'utf-8'
  );
  assert(
    !productIdRouteCode.includes('@/lib/db') && !productIdRouteCode.includes('getDomainDataSource'),
    'Product [id] route (src/app/api/products/[id]/route.ts) has 0 imports of db.ts or getDomainDataSource'
  );
  assert(
    productIdRouteCode.includes('pgGetProductById') && productIdRouteCode.includes('pgUpdateProduct') && productIdRouteCode.includes('pgDeleteProduct'),
    'Product [id] route directly uses PostgreSQL pgGetProductById, pgUpdateProduct, and pgDeleteProduct'
  );

  const sitemapCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/sitemap.ts'),
    'utf-8'
  );
  assert(
    !sitemapCode.includes('@/lib/db'),
    'Sitemap (src/app/sitemap.ts) has 0 imports of db.ts'
  );
  assert(
    sitemapCode.includes('pgGetProducts'),
    'Sitemap uses PostgreSQL pgGetProducts directly'
  );

  const checkoutPageCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/checkout/page.tsx'),
    'utf-8'
  );
  assert(
    checkoutPageCode.includes('couponCode: appliedCoupon?.code || undefined'),
    'Checkout Page sends actual appliedCoupon.code in orderPayload'
  );

  // Runtime DDL Check
  const ordersCode = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/postgres-orders.ts'), 'utf-8');
  assert(
    !ordersCode.includes('ALTER TABLE') && !ordersCode.includes('CREATE TABLE'),
    'postgres-orders.ts contains ZERO Runtime DDL'
  );
  const couponsCode = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/postgres-coupons.ts'), 'utf-8');
  assert(
    !couponsCode.includes('ALTER TABLE') && !couponsCode.includes('CREATE TABLE'),
    'postgres-coupons.ts contains ZERO Runtime DDL'
  );

  // =========================================================================
  // Section 2: Categories PostgreSQL Migration & Integrity
  // =========================================================================
  console.log('\n=== Section 2: Categories PostgreSQL Lifecycle & Relational Safety ===');

  // 1. Create a category
  const testCat = await pgCreateCategory({
    name: 'قسم بسكويت 2B4',
    orderIndex: 42,
    hideFromHome: true,
    description: 'قسم لاختبارات مرحلة 2B4',
  });
  assert(testCat && testCat.id, 'pgCreateCategory succeeds and returns an ID');
  assert(testCat.order === 42, 'Category has orderIndex 42');
  assert(testCat.hideFromHome === true, 'Category has hideFromHome true');

  // 2. Fetch categories and verify ordering and fields
  const allCats = await pgGetCategories();
  const fetchedCat = allCats.find((c) => c.id === testCat.id);
  assert(fetchedCat !== undefined, 'pgGetCategories includes the created category');
  assert(fetchedCat?.order === 42 && fetchedCat?.hideFromHome === true, 'Fetched category preserves order and hideFromHome');

  // 3. Update category
  const updatedCat = await pgUpdateCategory(testCat.id, {
    name: 'قسم بسكويت ومقرمشات 2B4',
    orderIndex: 1,
    hideFromHome: false,
  });
  assert(updatedCat && updatedCat.order === 1, 'pgUpdateCategory updates orderIndex to 1');
  assert(updatedCat?.hideFromHome === false, 'pgUpdateCategory updates hideFromHome to false');

  // 4. Create a product associated with this category
  const prodInCat = await pgCreateProduct({
    name: 'بسكويت مالح 2B4',
    category: updatedCat ? updatedCat.name : 'قسم بسكويت ومقرمشات 2B4',
    costPrice: 5000,
    price: 8000,
    wholesalePrice: 7000,
    stock: 50,
  });
  assert(prodInCat && prodInCat.id, 'Product created associated with category');

  // 5. Attempt to delete category when products reference it -> MUST BE REJECTED
  const blockedDelete = await pgDeleteCategory(testCat.id);
  assert(blockedDelete.success === false, 'pgDeleteCategory is rejected when products exist in category');
  assert(
    blockedDelete.error && blockedDelete.error.includes('لا يمكن حذف هذا القسم لأنه مرتبط بـ (1) منتج'),
    'pgDeleteCategory returns exact required Arabic rejection message'
  );

  // Verify category still exists in PostgreSQL
  const checkCatStillExists = await pgGetCategories();
  assert(
    checkCatStillExists.some((c) => c.id === testCat.id),
    'Category was NOT deleted from PostgreSQL and products are NOT orphaned'
  );

  // Clean up product to allow category deletion test
  await sql`DELETE FROM products WHERE id = ${prodInCat.id};`;

  // 6. Delete category when zero products reference it -> MUST SUCCEED
  const allowedDelete = await pgDeleteCategory(testCat.id);
  assert(allowedDelete.success === true, 'pgDeleteCategory succeeds when zero products reference it');
  const verifyCatDeleted = await pgGetCategories();
  assert(!verifyCatDeleted.some((c) => c.id === testCat.id), 'Category successfully removed from PostgreSQL');

  // =========================================================================
  // Section 3: Product Active/Archived Lifecycle & Order Integrity
  // =========================================================================
  console.log('\n=== Section 3: Product Active/Archived Lifecycle ===');

  // Re-create category for products
  const activeCat = await pgCreateCategory({ name: 'قسم الحلويات 2B4' });

  // 1. Create Active Product
  const prodActive = await pgCreateProduct({
    name: 'شوكولاتة بندق نشطة 2B4',
    category: activeCat.name,
    costPrice: 10000,
    price: 15000,
    wholesalePrice: 13000,
    stock: 100,
    isActive: true,
  });
  assert(prodActive.isActive === true && prodActive.isArchived === false, 'Product created with isActive: true, isArchived: false');

  // 2. Create Inactive Product
  const prodInactive = await pgCreateProduct({
    name: 'شوكولاتة معطلة 2B4',
    category: activeCat.name,
    costPrice: 10000,
    price: 15000,
    wholesalePrice: 13000,
    stock: 100,
    isActive: false,
  });
  assert(prodInactive.isActive === false, 'Product created with isActive: false');

  // 3. Customer catalog filtering
  const storefrontProducts = await pgGetProducts({ category: activeCat.name });
  assert(
    storefrontProducts.some((p) => p.id === prodActive.id),
    'Storefront catalog includes active product'
  );
  assert(
    !storefrontProducts.some((p) => p.id === prodInactive.id),
    'Storefront catalog hides inactive product by default'
  );

  // Admin catalog filtering
  const adminProducts = await pgGetProducts({ category: activeCat.name, includeInactive: true });
  assert(
    adminProducts.some((p) => p.id === prodInactive.id),
    'Admin catalog includes inactive products when includeInactive: true'
  );

  // 4. Order creation rejection for Inactive Product
  let inactiveOrderFailed = false;
  try {
    await pgCreateOrder({
      createAccountIfMissing: true,
      customer: {
        name: 'زبون تجريبي',
        phone: '07700000001',
        city: 'المركز',
        address: 'حي المعلمين',
      },
      orderNotes: 'طلب تجربة صنف معطل',
      items: [
        {
          productId: prodInactive.id,
          name: prodInactive.name,
          quantity: 2,
          saleType: 'retail',
          unitPrice: 15000,
          totalPrice: 30000,
        },
      ],
    });
  } catch (e) {
    inactiveOrderFailed = true;
    assert(
      e.message.includes('غير متاح للطلب') || e.message.includes('غير نشط'),
      `Order with inactive product rejected server-side: "${e.message}"`
    );
  }
  assert(inactiveOrderFailed, 'pgCreateOrder fails fast when an inactive product is submitted');

  // 5. Successful order with Active Product -> creates order_items history
  const activeOrder = await pgCreateOrder({
    createAccountIfMissing: true,
    customer: {
      name: 'علي الكربلائي',
      phone: '07700000002',
      city: 'المركز',
      address: 'شارع السناتر',
    },
    items: [
      {
        productId: prodActive.id,
        name: prodActive.name,
        quantity: 3,
        saleType: 'retail',
        unitPrice: 15000,
        totalPrice: 45000,
      },
    ],
  });
  assert(activeOrder && activeOrder.id, 'Active product ordered successfully, establishing sales history');

  // 6. Delete Product with Order History -> Soft-delete / Archive (NEVER hard delete)
  const archiveResult = await pgDeleteProduct(prodActive.id, {
    id: 'admin-1',
    name: 'المشرف العام',
    username: 'admin',
    role: 'admin',
  });
  assert(archiveResult.success === true, 'pgDeleteProduct succeeds on product with order history');
  assert(archiveResult.action === 'archived', 'pgDeleteProduct soft-deletes/archives product due to order history');

  // Verify in DB that product row exists and is archived
  const [archivedDbRow] = await sql`
    SELECT id, name, is_active, is_archived, archived_at FROM products WHERE id = ${prodActive.id};
  `;
  assert(archivedDbRow !== undefined, 'Product row physically preserved in PostgreSQL table');
  assert(archivedDbRow.is_archived === true, 'Product is_archived is set to true');
  assert(archivedDbRow.is_active === false, 'Product is_active is set to false');
  assert(archivedDbRow.archived_at !== null, 'Product archived_at timestamp is populated');

  // Verify historical order and order_items are completely intact
  const [persistedOrderItem] = await sql`
    SELECT id, product_id, item_name_snap, unit_price_snap, sold_quantity FROM order_items WHERE order_id = ${activeOrder.id};
  `;
  assert(
    persistedOrderItem && persistedOrderItem.product_id === prodActive.id,
    'Historical order_items row is intact and fully preserved'
  );

  // 7. Attempt to order an Archived product -> MUST FAIL
  let archivedOrderFailed = false;
  try {
    await pgCreateOrder({
      createAccountIfMissing: true,
      customer: {
        name: 'زبون تجريبي',
        phone: '07700000003',
        city: 'المركز',
        address: 'حي الوفاء',
      },
      items: [
        {
          productId: prodActive.id,
          name: prodActive.name,
          quantity: 1,
          saleType: 'retail',
          unitPrice: 15000,
          totalPrice: 15000,
        },
      ],
    });
  } catch (e) {
    archivedOrderFailed = true;
    assert(
      e.message.includes('غير متاح') || e.message.includes('مؤرشف'),
      `Order with archived product rejected server-side: "${e.message}"`
    );
  }
  assert(archivedOrderFailed, 'pgCreateOrder fails fast when an archived product is submitted');

  // 8. Test Product Reactivation
  const reactivated = await pgReactivateProduct(prodActive.id, {
    id: 'admin-1',
    name: 'المشرف العام',
    username: 'admin',
    role: 'admin',
  });
  assert(reactivated === true, 'pgReactivateProduct returns true');
  const [reactivatedDbRow] = await sql`
    SELECT id, is_active, is_archived, archived_at FROM products WHERE id = ${prodActive.id};
  `;
  assert(
    reactivatedDbRow.is_active === true && reactivatedDbRow.is_archived === false && reactivatedDbRow.archived_at === null,
    'Product row restored: is_active=true, is_archived=false, archived_at=null'
  );

  // 9. Physical Delete when zero order history
  const prodNoOrders = await pgCreateProduct({
    name: 'صنف بدون طلبات 2B4',
    category: activeCat.name,
    costPrice: 2000,
    price: 3000,
    wholesalePrice: 2500,
    stock: 10,
  });
  const hardDeleteResult = await pgDeleteProduct(prodNoOrders.id);
  assert(hardDeleteResult.success === true && hardDeleteResult.action === 'deleted', 'Product with 0 orders is physically deleted');
  const [checkDeletedRow] = await sql`SELECT id FROM products WHERE id = ${prodNoOrders.id};`;
  assert(checkDeletedRow === undefined, 'Product row physically removed from database');

  // =========================================================================
  // Section 4: Critical Coupon Checkout & Server-Side Atomic Consumption
  // =========================================================================
  console.log('\n=== Section 4: Critical Coupon Checkout & PostgreSQL Server-Side Snapshot ===');

  // 1. Seed coupon directly into PostgreSQL
  const couponCode = 'COUPON2B4';
  await sql`
    INSERT INTO coupons (
      code, discount_type, discount_value, min_order_amount,
      usage_limit, usage_count, is_active, expires_at
    ) VALUES (
      ${couponCode},
      'percentage',
      10,
      30000,
      2,
      0,
      true,
      NOW() + INTERVAL '30 days'
    );
  `;
  console.log(`   Seeded test coupon "${couponCode}" (10% off, min order 30k, max uses 2)`);

  // 2. Client sends order with couponCode and a TAMPERED client discount of 99,999
  // Server must calculate discount authoritatively from PostgreSQL:
  // Item: 3 units @ 15,000 = 45,000 IQD.
  // 10% coupon discount on 45,000 = 4,500 IQD.
  // Total after coupon = 40,500 IQD + delivery (5,000) = 45,500 IQD.
  const couponOrder1 = await pgCreateOrder({
    createAccountIfMissing: true,
    customer: {
      name: 'أحمد التميمي',
      phone: '07800000001',
      city: 'المركز',
      address: 'حي الحسين',
    },
    couponCode: couponCode,
    discount: 99999, // Tampered client-side discount to verify server ignores it!
    deliveryFee: 5000,
    items: [
      {
        productId: prodActive.id,
        name: prodActive.name,
        quantity: 3,
        saleType: 'retail',
        unitPrice: 15000,
        totalPrice: 45000,
      },
    ],
  });

  assert(couponOrder1 && couponOrder1.id, 'Order created successfully with couponCode');
  assert(couponOrder1.couponCode === couponCode, 'Order snapshot records correct couponCode');
  assert(
    couponOrder1.discount === 4500,
    `Server calculated coupon discount (4,500 IQD), ignoring tampered client discount (99,999). Actual: ${couponOrder1.discount}`
  );
  assert(
    couponOrder1.total === 45500,
    `Total amount is authoritative (45,000 - 4,500 + 5,000 = 45,500 IQD). Actual: ${couponOrder1.total}`
  );

  // 3. Verify atomic coupon consumption in PostgreSQL
  const [couponUsage1] = await sql`SELECT usage_count, usage_limit FROM coupons WHERE code = ${couponCode};`;
  assert(couponUsage1.usage_count === 1, 'Coupon usage_count atomically incremented from 0 to 1 in PostgreSQL');

  // 4. Second order consuming remaining usage
  const couponOrder2 = await pgCreateOrder({
    createAccountIfMissing: true,
    customer: {
      name: 'محمد مهدي',
      phone: '07800000002',
      city: 'المركز',
      address: 'شارع العباس',
    },
    couponCode: couponCode,
    deliveryFee: 0,
    items: [
      {
        productId: prodActive.id,
        name: prodActive.name,
        quantity: 3,
        saleType: 'retail',
        unitPrice: 15000,
        totalPrice: 45000,
      },
    ],
  });
  assert(couponOrder2 && couponOrder2.id, 'Second order with coupon succeeds');
  const [couponUsage2] = await sql`SELECT usage_count, usage_limit FROM coupons WHERE code = ${couponCode};`;
  assert(couponUsage2.usage_count === 2, 'Coupon usage_count atomically incremented to 2 (limit reached)');

  // 5. Third order: usage limit exceeded -> MUST BE REJECTED
  let usageLimitFailed = false;
  try {
    await pgCreateOrder({
      createAccountIfMissing: true,
      customer: {
        name: 'كرار حسين',
        phone: '07800000003',
        city: 'المركز',
        address: 'حي الغدير',
      },
      couponCode: couponCode,
      items: [
        {
          productId: prodActive.id,
          name: prodActive.name,
          quantity: 3,
          saleType: 'retail',
          unitPrice: 15000,
          totalPrice: 45000,
        },
      ],
    });
  } catch (e) {
    usageLimitFailed = true;
    assert(
      e.message.includes('الحد الأقصى') || e.message.includes('حد الاستخدام') || e.message.includes('تجاوز'),
      `Coupon with exceeded usage limit rejected server-side: "${e.message}"`
    );
  }
  assert(usageLimitFailed, 'pgCreateOrder fails fast when coupon usage limit is exceeded');

  // 6. Test invalid coupon code -> MUST BE REJECTED
  let invalidCodeFailed = false;
  try {
    await pgCreateOrder({
      createAccountIfMissing: true,
      customer: {
        name: 'فهد هادي',
        phone: '07800000004',
        city: 'المركز',
        address: 'حي المعلمين',
      },
      couponCode: 'INVALID_CODE_999',
      items: [
        {
          productId: prodActive.id,
          name: prodActive.name,
          quantity: 3,
          saleType: 'retail',
          unitPrice: 15000,
          totalPrice: 45000,
        },
      ],
    });
  } catch (e) {
    invalidCodeFailed = true;
    assert(
      e.message.includes('غير صالح') || e.message.includes('غير موجود'),
      `Invalid coupon code rejected server-side: "${e.message}"`
    );
  }
  assert(invalidCodeFailed, 'pgCreateOrder fails fast when coupon code is invalid');

  // 7. Test expired coupon -> MUST BE REJECTED
  const expiredCode = 'EXPIRED_2B4';
  await sql`
    INSERT INTO coupons (
      code, discount_type, discount_value, min_order_amount,
      usage_limit, usage_count, is_active, expires_at
    ) VALUES (
      ${expiredCode}, 'percentage', 20, 10000, 10, 0, true, NOW() - INTERVAL '1 day'
    );
  `;
  let expiredCouponFailed = false;
  try {
    await pgCreateOrder({
      createAccountIfMissing: true,
      customer: {
        name: 'حيدر جاسم',
        phone: '07800000005',
        city: 'المركز',
        address: 'حي النصر',
      },
      couponCode: expiredCode,
      items: [
        {
          productId: prodActive.id,
          name: prodActive.name,
          quantity: 3,
          saleType: 'retail',
          unitPrice: 15000,
          totalPrice: 45000,
        },
      ],
    });
  } catch (e) {
    expiredCouponFailed = true;
    assert(
      e.message.includes('منتهي') || e.message.includes('الصلاحية'),
      `Expired coupon rejected server-side: "${e.message}"`
    );
  }
  assert(expiredCouponFailed, 'pgCreateOrder fails fast when coupon has expired');

  // 8. Test minimum order value not met -> MUST BE REJECTED
  const minOrderCode = 'HIGHMIN_2B4';
  await sql`
    INSERT INTO coupons (
      code, discount_type, discount_value, min_order_amount,
      usage_limit, usage_count, is_active, expires_at
    ) VALUES (
      ${minOrderCode}, 'fixed', 5000, 100000, 10, 0, true, NOW() + INTERVAL '10 days'
    );
  `;
  let minOrderFailed = false;
  try {
    await pgCreateOrder({
      createAccountIfMissing: true,
      customer: {
        name: 'ياسر عمار',
        phone: '07800000006',
        city: 'المركز',
        address: 'حي الإصلاح',
      },
      couponCode: minOrderCode,
      items: [
        {
          productId: prodActive.id,
          name: prodActive.name,
          quantity: 1,
          saleType: 'retail',
          unitPrice: 15000,
          totalPrice: 15000, // 15,000 < 100,000 min order
        },
      ],
    });
  } catch (e) {
    minOrderFailed = true;
    assert(
      e.message.includes('الحد الأدنى') || e.message.includes('أقل من'),
      `Below minimum order coupon rejected server-side: "${e.message}"`
    );
  }
  assert(minOrderFailed, 'pgCreateOrder fails fast when order value is below coupon min_order_value');

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n=========================================');
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('=========================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

async function main() {
  try {
    await startDatabase();
    await runCommercePhase2b4Tests();
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
