import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import { initialProducts } from './src/data/initialData.ts';
import {
  validateProductPricing,
  suggestTierPricing,
  auditProductPricing,
  auditAllProductsPricing,
} from './src/lib/pricing.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54355;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2b2_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.DATA_SOURCE_CATALOG_BASE = 'postgres';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2b2-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2b2-test-secret-min-32-chars-long';

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

  console.log('2. Applying schema and migrations (0000 -> 0011)...');
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
    'drizzle/0012_reversal_governance_hardening.sql',
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

async function runCommercePhase2b2Tests() {
  console.log('\n================================================================');
  console.log('  COMMERCE-2B2: PRODUCT PRICING FOUNDATION & SEMANTIC CLEANUP   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`  ✅ PASSED: ${message}`);
      passed++;
    }
  }

  // =========================================================================
  // TEST GROUP 1: Central Pricing Validation Unit Tests (Hard Errors & Warnings)
  // =========================================================================
  console.log('\n--- TEST GROUP 1: Central Pricing Validation (Rules & Hierarchy) ---');

  // 1.1 Negative numbers
  const negCheck = validateProductPricing({
    costPrice: -100,
    price: 500,
    wholesalePrice: 8000,
  });
  assert(negCheck.hardErrors.some(e => e.includes('سعر التكلفة لا يمكن أن يكون رقماً سالباً')), 'Rejects negative costPrice with hard error');

  // 1.2 Zero / missing required values for sellable products
  const zeroCheck = validateProductPricing({
    costPrice: 0,
    price: 0,
    wholesalePrice: 0,
    isSellable: true,
  });
  assert(zeroCheck.hardErrors.length === 3, 'Requires costPrice, price, and wholesalePrice > 0 for sellable products');

  // 1.3 Inverted Tier Hierarchy: Gold VIP > Silver
  const invertedGold = validateProductPricing({
    costPrice: 7000,
    wholesalePrice: 8500,
    specialPrice: 8000, // Silver
    vipPrice: 8200,     // Gold VIP > Silver (Invalid!)
    price: 500,
  });
  assert(invertedGold.hardErrors.some(e => e.includes('تناقض في تسعير الرتب')), 'Blocks Gold VIP > Silver with hard error');

  // 1.4 Inverted Tier Hierarchy: Silver > Bronze Wholesale
  const invertedSilver = validateProductPricing({
    costPrice: 7000,
    wholesalePrice: 8000, // Bronze
    specialPrice: 8200,   // Silver > Bronze (Invalid!)
    vipPrice: 7500,
    price: 500,
  });
  assert(invertedSilver.hardErrors.some(e => e.includes('تناقض في تسعير الرتب')), 'Blocks Silver > Bronze Wholesale with hard error');

  // 1.5 Below-Cost Selling: Wholesale < Cost
  const belowCostWs = validateProductPricing({
    costPrice: 8000,
    wholesalePrice: 7500, // < Cost!
    price: 500,
    boxesPerCarton: 1,
    itemsPerBox: 20,
  });
  assert(belowCostWs.requiresOverride === true, 'Flags below-cost wholesale as requiring administrative override');
  assert(belowCostWs.warnings.some(w => w.includes('أقل من سعر التكلفة')), 'Generates clear warning for wholesale below cost');

  // 1.6 Below-Cost Selling: Piece Price < Piece Cost
  // 10,000 cost / 20 pieces = 500 piece cost. Price = 400 (< 500!)
  const belowCostPiece = validateProductPricing({
    costPrice: 10000,
    wholesalePrice: 11000,
    price: 400,
    boxesPerCarton: 1,
    itemsPerBox: 20,
  });
  assert(belowCostPiece.requiresOverride === true, 'Flags piece price below unit piece cost as requiring override');
  assert(belowCostPiece.warnings.some(w => w.includes('محتويات الكرتون بالمفرد')), 'Generates warning for piece price below piece cost');

  // 1.7 Override Reason Enforcement: Missing or too short reason
  const overrideNoReason = validateProductPricing(
    {
      costPrice: 8000,
      wholesalePrice: 7500,
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 20,
    },
    {
      allowBelowCostOverride: true,
      overrideReason: 'abc', // < 5 chars
    }
  );
  assert(overrideNoReason.hardErrors.some(e => e.includes('5 أحرف')), 'Rejects override without detailed explanation (>= 5 chars)');

  // 1.8 Override Accepted: Valid explanation provided
  const overrideValid = validateProductPricing(
    {
      costPrice: 8000,
      wholesalePrice: 7500,
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 20,
    },
    {
      allowBelowCostOverride: true,
      overrideReason: 'تصفية بضاعة قريبة الانتهاء',
    }
  );
  assert(overrideValid.valid === true, 'Validates successfully when below-cost selling is explicitly approved with explanation');

  // 1.9 Packaging Consistency Warnings: boxPrice < wholesalePrice
  const boxBelowWs = validateProductPricing({
    costPrice: 6000,
    wholesalePrice: 8000,
    boxPrice: 7500, // Consumer carton cheaper than merchant wholesale!
    price: 500,
    boxesPerCarton: 1,
    itemsPerBox: 20,
  });
  assert(boxBelowWs.warnings.some(w => w.includes('سعر كرتون المستهلك') && w.includes('أقل من سعر كرتون الجملة')), 'Warns when consumer carton price is cheaper than merchant wholesale price');

  // =========================================================================
  // TEST GROUP 2: Smart Decoupled Suggestions Unit Tests
  // =========================================================================
  console.log('\n--- TEST GROUP 2: Decoupled Smart Pricing Suggestions ---');

  const suggestions = suggestTierPricing(8250, 7000);
  assert(suggestions.goldPrice <= suggestions.silverPrice, 'Smart suggestion: Gold VIP price <= Silver price');
  assert(suggestions.silverPrice <= 8250, 'Smart suggestion: Silver price <= Bronze wholesale price');
  assert(suggestions.marketPrice >= 8250, 'Smart suggestion: Market price >= Bronze wholesale price');
  assert(suggestions.consumerCartonPrice >= 8250, 'Smart suggestion: Consumer carton price >= Bronze wholesale price');
  assert(suggestions.goldPrice >= 7000, 'Smart suggestion: Gold VIP price respects cost price floor');
  assert(suggestions.goldPrice % 250 === 0, 'Smart suggestion: Gold price rounded to nearest 250 IQD');
  assert(suggestions.silverPrice % 250 === 0, 'Smart suggestion: Silver price rounded to nearest 250 IQD');
  assert(suggestions.marketPrice % 250 === 0, 'Smart suggestion: Market price rounded to nearest 250 IQD');

  // =========================================================================
  // TEST GROUP 3: Legacy Initial Products Pricing & Semantic Audit
  // =========================================================================
  console.log('\n--- TEST GROUP 3: Legacy Initial Products Pricing Audit ---');

  const auditResult = auditAllProductsPricing(initialProducts);
  const legacyAudits = auditResult.reports;
  assert(auditResult.total === initialProducts.length, `Audited all ${initialProducts.length} initial products`);
  assert(legacyAudits.length === initialProducts.length, `Generated reports for all ${initialProducts.length} initial products`);

  const initialErrors = legacyAudits.filter(a => a.hasHardErrors);
  assert(initialErrors.length === 0, 'All initial legacy products pass central hard validation without errors');

  const consumerCartonClassified = legacyAudits.filter(a => a.boxPriceClassification === 'consumer_carton');
  const innerBoxClassified = legacyAudits.filter(a => a.boxPriceClassification === 'inner_box');
  const ambiguousClassified = legacyAudits.filter(a => a.boxPriceClassification === 'ambiguous');

  console.log(`   Initial Products Classification:`);
  console.log(`   - Consumer Carton: ${consumerCartonClassified.length} / ${initialProducts.length}`);
  console.log(`   - Inner Box: ${innerBoxClassified.length} / ${initialProducts.length}`);
  console.log(`   - Ambiguous: ${ambiguousClassified.length} / ${initialProducts.length}`);

  assert(consumerCartonClassified.length === initialProducts.length, '100% of legacy products with boxPrice are verified as Consumer Carton (سعر الكرتون للمستهلك)');
  assert(innerBoxClassified.length === 0, 'Zero legacy products are classified as inner box');
  assert(ambiguousClassified.length === 0, 'Zero legacy products are classified as ambiguous');

  // =========================================================================
  // TEST GROUP 4: Database Integration with pgCreateProduct & pgUpdateProduct
  // =========================================================================
  console.log('\n--- TEST GROUP 4: Database Integration with Central Validation & Audit Logs ---');

  const {
    pgCreateProduct,
    pgUpdateProduct,
    pgGetProductById,
    pgGetProducts,
  } = await import('./src/lib/postgres-catalog.ts');

  // 4.1 Ensure test category exists
  const [testCat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم تجارب التسعير B2', 'b2-pricing-test-cat')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id;
  `;
  const catId = String(testCat.id);

  // 4.2 Hard Error on pgCreateProduct: Inverted Tier (Gold > Silver)
  let createHierarchyBlocked = false;
  try {
    await pgCreateProduct({
      name: 'منتج غير صالح بتسعير مقلوب',
      category: catId,
      costPrice: 5000,
      wholesalePrice: 8000,
      specialPrice: 7500, // Silver
      vipPrice: 7800,     // Gold > Silver!
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 20,
    });
  } catch (err) {
    createHierarchyBlocked = true;
    assert(err.message.includes('تناقض في تسعير الرتب'), 'pgCreateProduct blocks inverted hierarchy (Gold > Silver)');
  }
  assert(createHierarchyBlocked, 'pgCreateProduct threw expected error on inverted tier');

  // 4.3 Below-cost creation blocked without override
  let createBelowCostBlocked = false;
  try {
    await pgCreateProduct({
      name: 'منتج بيع دون التكلفة بدون موافقة',
      category: catId,
      costPrice: 9000,
      wholesalePrice: 8000, // Below cost!
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 20,
    });
  } catch (err) {
    createBelowCostBlocked = true;
    assert(err.message.includes('تحذير تجاري: يتضمن التسعير بيعاً بأقل من التكلفة'), 'pgCreateProduct blocks below-cost creation without override');
  }
  assert(createBelowCostBlocked, 'pgCreateProduct threw expected error on below-cost without override');

  // 4.4 Below-cost creation allowed WITH override + logs audit entry
  const belowCostCreated = await pgCreateProduct(
    {
      name: 'منتج بيع دون التكلفة بموافقة إدارية',
      category: catId,
      costPrice: 9000,
      wholesalePrice: 8000,
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 20,
      stock: 10,
    },
    {
      allowBelowCostOverride: true,
      overrideReason: 'تصفية بضاعة قريبة الانتهاء - موافقة المدير العام',
      operator: {
        name: 'مدير المتجر',
        username: 'admin',
        role: 'super_admin',
      },
    }
  );
  assert(belowCostCreated !== null && belowCostCreated.id, 'pgCreateProduct succeeded with valid override');

  // Verify audit log entry was written
  const auditRows = await sql`
    SELECT * FROM audit_logs
    WHERE action_type = 'pricing_below_cost_override' AND target_id = ${belowCostCreated.id};
  `;
  assert(auditRows.length > 0, 'Audit log correctly recorded pricing_below_cost_override in audit_logs table');
  assert(auditRows[0].details.includes('تصفية بضاعة قريبة الانتهاء'), 'Audit log contains operator override explanation');

  // 4.5 Create standard valid product with full tier hierarchy
  const validProduct = await pgCreateProduct({
    name: 'شيبس كرسبي العائلي الفاخر',
    category: catId,
    costPrice: 7000,
    wholesalePrice: 8250,
    specialPrice: 8000,
    vipPrice: 7500,
    marketPrice: 8500,
    boxPrice: 8000, // Consumer Carton Price
    price: 500,
    boxesPerCarton: 6,
    itemsPerBox: 24,
    stock: 100,
    retailUnit: 'كيس عائلي',
    wholesaleUnit: 'كرتون جملة (6 علب × 24 كيس)',
  });
  assert(validProduct !== null, 'Created standard valid product with all pricing tiers');
  assert(Number(validProduct.costPrice) === 7000, 'costPrice saved correctly');
  assert(Number(validProduct.wholesalePrice) === 8250, 'wholesalePrice saved correctly');
  assert(Number(validProduct.specialPrice) === 8000, 'specialPrice saved correctly');
  assert(Number(validProduct.vipPrice) === 7500, 'vipPrice saved correctly');
  assert(Number(validProduct.marketPrice) === 8500, 'marketPrice saved correctly');
  assert(Number(validProduct.boxPrice) === 8000, 'boxPrice (Consumer carton) saved correctly');

  // 4.6 pgUpdateProduct: Block Inverted Hierarchy on Update
  let updateHierarchyBlocked = false;
  try {
    await pgUpdateProduct(validProduct.id, {
      specialPrice: 9000, // Silver > Bronze (8250)!
    });
  } catch (err) {
    updateHierarchyBlocked = true;
    assert(err.message.includes('تناقض في تسعير الرتب'), 'pgUpdateProduct blocks update with inverted hierarchy (Silver > Bronze)');
  }
  assert(updateHierarchyBlocked, 'pgUpdateProduct threw expected error on inverted tier update');

  // 4.7 pgUpdateProduct: Block Below-cost Update without Override
  let updateBelowCostBlocked = false;
  try {
    await pgUpdateProduct(validProduct.id, {
      wholesalePrice: 6500, // Below cost 7000!
      specialPrice: 6250,
      vipPrice: 6000,
    });
  } catch (err) {
    updateBelowCostBlocked = true;
    assert(err.message.includes('تحذير تجاري: يتضمن التسعير بيعاً بأقل من التكلفة'), 'pgUpdateProduct blocks below-cost price reduction without override');
  }
  assert(updateBelowCostBlocked, 'pgUpdateProduct threw expected error on below-cost update without override');

  // 4.8 pgUpdateProduct: Allow Below-cost Update with Override + Audit Log
  const updatedProduct = await pgUpdateProduct(
    validProduct.id,
    {
      wholesalePrice: 6500,
      specialPrice: 6250,
      vipPrice: 6000,
    },
    {
      allowBelowCostOverride: true,
      overrideReason: 'تنزيلات الجمعة البيضاء الخاصة للكرتون',
      operator: {
        name: 'مدير المبيعات',
        username: 'sales_lead',
        role: 'manager',
      },
    }
  );
  assert(Number(updatedProduct.wholesalePrice) === 6500, 'pgUpdateProduct successfully updated price below cost with override');

  const updateAuditRows = await sql`
    SELECT * FROM audit_logs
    WHERE action_type = 'pricing_below_cost_override' AND target_id = ${validProduct.id};
  `;
  assert(updateAuditRows.length > 0, 'Audit log recorded for below-cost price update');
  assert(updateAuditRows[0].details.includes('الجمعة البيضاء'), 'Audit log details include update override reason');

  // =========================================================================
  // TEST GROUP 5: API Audit Query Param Verification (GET /api/products?audit=true)
  // =========================================================================
  console.log('\n--- TEST GROUP 5: Products API Route Pricing Audit Support ---');

  const allDbProducts = await pgGetProducts();
  const apiAuditReport = auditAllProductsPricing(allDbProducts);
  assert(Array.isArray(apiAuditReport.reports), 'auditAllProductsPricing returns object with reports array');
  assert(apiAuditReport.reports.some(a => a.productId === validProduct.id), 'Audit report correctly contains created test product');

  // =========================================================================
  // TEST GROUP 6: Admin Pricing Override Security Hardening & RBAC Authorization
  // =========================================================================
  console.log('\n--- TEST GROUP 6: Admin Pricing Override Security Hardening & RBAC ---');

  const { SESSION_COOKIE_NAME, signAdminSession } = await import('./src/lib/auth.ts');
  const { ensureDbExists } = await import('./src/lib/db.ts');
  const { POST: productsPostHandler } = await import('./src/app/api/products/route.ts');
  const {
    PUT: productPutHandler,
    DELETE: productDeleteHandler,
  } = await import('./src/app/api/products/[id]/route.ts');

  // Setup staff accounts in inMemDb for session authentication
  const inMemDb = ensureDbExists();
  inMemDb.staff = inMemDb.staff || [];

  const authorizedStaff = {
    id: 'staff-product-mgr-101',
    name: 'مسؤول المنتجات المعتمد',
    username: 'product_mgr',
    role: 'staff',
    permissions: ['products'],
    isActive: true,
  };
  const unauthorizedStaff = {
    id: 'staff-no-products-202',
    name: 'موظف بدون صلاحية المنتجات',
    username: 'unauth_staff',
    role: 'staff',
    permissions: ['reports'],
    isActive: true,
  };
  inMemDb.staff.push(authorizedStaff, unauthorizedStaff);

  const authCookie = signAdminSession({
    userId: authorizedStaff.id,
    username: authorizedStaff.username,
    role: 'staff',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  const unauthCookie = signAdminSession({
    userId: unauthorizedStaff.id,
    username: unauthorizedStaff.username,
    role: 'staff',
    exp: Math.floor(Date.now() / 1000) + 86400,
  });

  // 6.1 Guest cannot POST /api/products (401)
  const guestPostReq = new Request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'منتج ضيف غير مصرح',
      category: catId,
      costPrice: 5000,
      wholesalePrice: 6000,
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 12,
    }),
  });
  const guestPostRes = await productsPostHandler(guestPostReq);
  assert(guestPostRes.status === 401, 'Guest cannot create products (HTTP 401)');

  // 6.2 Guest spoofing operator: { role: 'admin' } in body is rejected (401)
  const guestSpoofReq = new Request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'منتج ضيف ينتحل صفة مدير',
      category: catId,
      costPrice: 5000,
      wholesalePrice: 6000,
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 12,
      operator: {
        id: 'fake-admin-id',
        name: 'انتحال مدير',
        username: 'admin',
        role: 'admin',
        permissions: ['*'],
      },
    }),
  });
  const guestSpoofRes = await productsPostHandler(guestSpoofReq);
  assert(guestSpoofRes.status === 401, 'Guest spoofing admin operator in body rejected with HTTP 401');

  // 6.3 Staff without products permission cannot POST /api/products (403)
  const unauthPostReq = new Request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${unauthCookie}`,
    },
    body: JSON.stringify({
      name: 'منتج موظف غير مخول',
      category: catId,
      costPrice: 5000,
      wholesalePrice: 6000,
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 12,
    }),
  });
  const unauthPostRes = await productsPostHandler(unauthPostReq);
  assert(unauthPostRes.status === 403, 'Staff without products permission rejected with HTTP 403');

  // 6.4 Staff without products permission spoofing operator: { role: 'admin' } in body is rejected (403)
  const unauthSpoofReq = new Request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${unauthCookie}`,
    },
    body: JSON.stringify({
      name: 'منتج موظف غير مخول مع انتحال صلاحية بالـ body',
      category: catId,
      costPrice: 5000,
      wholesalePrice: 6000,
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 12,
      operator: {
        role: 'admin',
        permissions: ['products', 'admin'],
      },
    }),
  });
  const unauthSpoofRes = await productsPostHandler(unauthSpoofReq);
  assert(unauthSpoofRes.status === 403, 'Staff without products permission spoofing admin role in body rejected with HTTP 403');

  // 6.5 Guest attempting below-cost override is rejected (401)
  const guestOverrideReq = new Request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'منتج تجاوز دون تكلفة من ضيف',
      category: catId,
      costPrice: 9000,
      wholesalePrice: 7000, // Below cost!
      price: 500,
      boxesPerCarton: 1,
      itemsPerBox: 12,
      allowBelowCostOverride: true,
      overrideReason: 'تجاوز غير مصرح به من ضيف',
    }),
  });
  const guestOverrideRes = await productsPostHandler(guestOverrideReq);
  assert(guestOverrideRes.status === 401, 'Guest attempting below-cost override rejected with HTTP 401');

  // 6.6 Authorized staff POST below-cost WITHOUT allowBelowCostOverride -> 400
  const authBelowCostNoOverrideReq = new Request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${authCookie}`,
    },
    body: JSON.stringify({
      name: 'منتج دون التكلفة بدون تفعيل التجاوز',
      category: catId,
      costPrice: 10000,
      wholesalePrice: 8500, // Below cost!
      price: 600,
      boxesPerCarton: 1,
      itemsPerBox: 12,
    }),
  });
  const authBelowCostNoOverrideRes = await productsPostHandler(authBelowCostNoOverrideReq);
  assert(authBelowCostNoOverrideRes.status === 400, 'Authorized staff POST below-cost without override rejected with HTTP 400');
  const errData66 = await authBelowCostNoOverrideRes.json();
  assert(errData66.error.includes('أقل من التكلفة'), 'Error message mentions below cost');

  // 6.7 Authorized staff POST below-cost with short reason (< 5 chars) -> 400
  const authBelowCostShortReasonReq = new Request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${authCookie}`,
    },
    body: JSON.stringify({
      name: 'منتج دون التكلفة بسبب قصير',
      category: catId,
      costPrice: 10000,
      wholesalePrice: 8500,
      price: 600,
      boxesPerCarton: 1,
      itemsPerBox: 12,
      allowBelowCostOverride: true,
      overrideReason: 'تخ', // Only 2 chars (< 5 chars required)
    }),
  });
  const authBelowCostShortReasonRes = await productsPostHandler(authBelowCostShortReasonReq);
  assert(authBelowCostShortReasonRes.status === 400, 'Authorized staff with short reason (< 5 chars) rejected with HTTP 400');

  // 6.8 Authorized staff POST below-cost WITH valid reason + spoofed body operator -> 201
  const authValidOverrideReq = new Request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${authCookie}`,
    },
    body: JSON.stringify({
      name: 'منتج مرخص دون التكلفة مع محاولة تزوير المشغل بالـ body',
      category: catId,
      costPrice: 10000,
      wholesalePrice: 8500,
      price: 600,
      boxesPerCarton: 1,
      itemsPerBox: 12,
      stock: 15,
      allowBelowCostOverride: true,
      overrideReason: 'تصفية موسمية معتمدة من الإدارة التجارية',
      operator: {
        id: 'hacker-fake-id',
        name: 'منتحل الهوية المخترق',
        username: 'evil_hacker',
        role: 'super_admin',
      },
    }),
  });
  const authValidOverrideRes = await productsPostHandler(authValidOverrideReq);
  assert(authValidOverrideRes.status === 201, 'Authorized staff with valid override reason created product (HTTP 201)');
  const createdProd68 = (await authValidOverrideRes.json()).product;
  assert(createdProd68 && createdProd68.id, 'Product object returned successfully');

  // 6.9 Verify audit_logs carries TRUSTED session admin identity and NOT spoofed body operator
  const auditLogs68 = await sql`
    SELECT * FROM audit_logs
    WHERE action_type = 'pricing_below_cost_override' AND target_id = ${createdProd68.id}
    ORDER BY timestamp DESC LIMIT 1;
  `;
  assert(auditLogs68.length === 1, 'Audit log entry created for below-cost override');
  const snap68 = typeof auditLogs68[0].operator_snapshot === 'string'
    ? JSON.parse(auditLogs68[0].operator_snapshot)
    : auditLogs68[0].operator_snapshot;
  assert(snap68.username === 'product_mgr', `Audit log recorded trusted session username 'product_mgr' (got '${snap68.username}')`);
  assert(snap68.name === 'مسؤول المنتجات المعتمد', `Audit log recorded trusted session name (got '${snap68.name}')`);
  assert(snap68.username !== 'evil_hacker', 'Audit log completely discarded spoofed body username');
  assert(snap68.name !== 'منتحل الهوية المخترق', 'Audit log completely discarded spoofed body name');

  // 6.10 PUT /api/products/[id] Authorization, Below-cost Override & Spoofing Defense
  // 6.10.1 Guest PUT -> 401
  const guestPutReq = new Request(`http://localhost:3000/api/products/${createdProd68.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'تعديل من ضيف' }),
  });
  const guestPutRes = await productPutHandler(guestPutReq, { params: { id: createdProd68.id } });
  assert(guestPutRes.status === 401, 'Guest PUT /api/products/[id] rejected with HTTP 401');

  // 6.10.2 Unauthorized Staff PUT -> 403
  const unauthPutReq = new Request(`http://localhost:3000/api/products/${createdProd68.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${unauthCookie}`,
    },
    body: JSON.stringify({
      name: 'تعديل موظف غير مخول',
      operator: { role: 'admin' }, // Spoofed body
    }),
  });
  const unauthPutRes = await productPutHandler(unauthPutReq, { params: { id: createdProd68.id } });
  assert(unauthPutRes.status === 403, 'Unauthorized staff PUT /api/products/[id] rejected with HTTP 403');

  // 6.10.3 Authorized Staff PUT further below cost without override -> 400
  const authPutNoOverrideReq = new Request(`http://localhost:3000/api/products/${createdProd68.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${authCookie}`,
    },
    body: JSON.stringify({
      wholesalePrice: 7000, // Even lower below cost 10000!
    }),
  });
  const authPutNoOverrideRes = await productPutHandler(authPutNoOverrideReq, { params: { id: createdProd68.id } });
  assert(authPutNoOverrideRes.status === 400, 'Authorized staff PUT below-cost without override rejected with HTTP 400');

  // 6.10.4 Authorized Staff PUT below-cost WITH override + spoofed body operator -> 200
  const authPutOverrideReq = new Request(`http://localhost:3000/api/products/${createdProd68.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `${SESSION_COOKIE_NAME}=${authCookie}`,
    },
    body: JSON.stringify({
      wholesalePrice: 7000,
      specialPrice: 6800,
      vipPrice: 6500,
      allowBelowCostOverride: true,
      overrideReason: 'تحديث تخفيض التصفية بقرار المدير',
      operator: {
        username: 'spoofed_put_operator',
        name: 'مخترق PUT',
        role: 'admin',
      },
    }),
  });
  const authPutOverrideRes = await productPutHandler(authPutOverrideReq, { params: { id: createdProd68.id } });
  assert(authPutOverrideRes.status === 200, 'Authorized staff PUT below cost with override succeeded (HTTP 200)');

  // 6.10.5 Verify PUT Audit log records trusted session operator
  const putAuditRows = await sql`
    SELECT * FROM audit_logs
    WHERE action_type = 'pricing_below_cost_override' AND target_id = ${createdProd68.id}
    ORDER BY timestamp DESC LIMIT 1;
  `;
  const putSnap = typeof putAuditRows[0].operator_snapshot === 'string'
    ? JSON.parse(putAuditRows[0].operator_snapshot)
    : putAuditRows[0].operator_snapshot;
  assert(putSnap.username === 'product_mgr', `PUT Audit log recorded trusted session username (got '${putSnap.username}')`);
  assert(putSnap.username !== 'spoofed_put_operator', 'PUT Audit log discarded spoofed body username');

  // 6.11 DELETE /api/products/[id] Authorization & Audit Defense
  // 6.11.1 Guest DELETE -> 401
  const guestDelReq = new Request(`http://localhost:3000/api/products/${createdProd68.id}`, {
    method: 'DELETE',
  });
  const guestDelRes = await productDeleteHandler(guestDelReq, { params: { id: createdProd68.id } });
  assert(guestDelRes.status === 401, 'Guest DELETE /api/products/[id] rejected with HTTP 401');

  // 6.11.2 Unauthorized Staff DELETE -> 403
  const unauthDelReq = new Request(`http://localhost:3000/api/products/${createdProd68.id}`, {
    method: 'DELETE',
    headers: {
      'Cookie': `${SESSION_COOKIE_NAME}=${unauthCookie}`,
    },
  });
  const unauthDelRes = await productDeleteHandler(unauthDelReq, { params: { id: createdProd68.id } });
  assert(unauthDelRes.status === 403, 'Unauthorized staff DELETE /api/products/[id] rejected with HTTP 403');

  // 6.11.3 Authorized Staff DELETE -> 200
  const authDelReq = new Request(`http://localhost:3000/api/products/${createdProd68.id}`, {
    method: 'DELETE',
    headers: {
      'Cookie': `${SESSION_COOKIE_NAME}=${authCookie}`,
    },
  });
  const authDelRes = await productDeleteHandler(authDelReq, { params: { id: createdProd68.id } });
  assert(authDelRes.status === 200, 'Authorized staff DELETE /api/products/[id] succeeded (HTTP 200)');

  // 6.11.4 Verify deletion in DB and audit log
  const delCheckRows = await sql`
    SELECT * FROM products WHERE id = ${createdProd68.id};
  `;
  assert(delCheckRows.length === 0, 'Product was permanently removed from database');

  const delAuditRows = await sql`
    SELECT * FROM audit_logs
    WHERE action_type = 'product_deleted' AND target_id = ${createdProd68.id}
    ORDER BY timestamp DESC LIMIT 1;
  `;
  assert(delAuditRows.length === 1, 'Deletion audit log recorded in audit_logs table');
  const delSnap = typeof delAuditRows[0].operator_snapshot === 'string'
    ? JSON.parse(delAuditRows[0].operator_snapshot)
    : delAuditRows[0].operator_snapshot;
  assert(delSnap.username === 'product_mgr', `DELETE Audit log recorded trusted session username (got '${delSnap.username}')`);

  console.log('\n================================================================');
  console.log(`  ALL COMMERCE-2B2 TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED  `);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Phase Commerce-2B2 test suite.`);
  }
}

async function main() {
  try {
    await startDatabase();
    await runCommercePhase2b2Tests();
  } catch (err) {
    console.error('Fatal error during test run:', err);
    process.exitCode = 1;
  } finally {
    if (sql) {
      try {
        await sql.end({ timeout: 5 });
      } catch (e) {}
    }
    if (ep) {
      try {
        await ep.stop();
      } catch (e) {}
    }
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

main();
