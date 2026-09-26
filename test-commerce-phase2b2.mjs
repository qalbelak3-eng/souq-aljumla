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
