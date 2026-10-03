import path from 'path';
import os from 'os';
import fs from 'fs';
import assert from 'assert';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  pgGetProfitReport,
  pgGetInventoryReport,
  pgGetDailyReconciliationReport,
} from './src/lib/postgres-reports.ts';
import { pgCreateOrder } from './src/lib/postgres-orders.ts';
import { pgCreateProduct, pgCreateCategory, pgCreateCompany } from './src/lib/postgres-catalog.ts';
import { pgAddPayment, pgAddCashVaultMovement } from './src/lib/postgres-accounting.ts';
import { pgCreatePurchaseInvoice } from './src/lib/postgres-purchases.ts';
import { GET as getInventoryReportRoute } from './src/app/api/reports/inventory/route.ts';
import { GET as getProfitReportRoute } from './src/app/api/reports/profits/route.ts';
import { GET as getReconciliationReportRoute } from './src/app/api/reports/reconciliation/route.ts';

const Ep = EpDefault.default || EpDefault;
const PORT = 54378;
const tempDir = path.join(os.tmpdir(), 'ep_test_reports_pg_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '10';
process.env.ADMIN_SESSION_SECRET = 'reports-test-secret-min-32-chars-long-12345';
process.env.CUSTOMER_SESSION_SECRET = 'reports-test-secret-min-32-chars-long-12345';

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
  });

  await ep.initialise();
  await ep.start();
  console.log('   PostgreSQL started successfully.');

  sql = postgres(dbUrl, { max: 10 });

  console.log('2. Applying schema and migrations (0000 -> 0023)...');
  const schemaFile = path.resolve(process.cwd(), 'drizzle/0000_magical_warbound.sql');
  await runSqlScript(sql, schemaFile);

  const migrationFiles = fs
    .readdirSync(path.resolve(process.cwd(), 'drizzle'))
    .filter((f) => f.endsWith('.sql') && f !== '0000_magical_warbound.sql')
    .sort();

  for (const m of migrationFiles) {
    await runSqlScript(sql, path.resolve(process.cwd(), 'drizzle', m));
  }
  console.log('   All migrations applied successfully.');
}

async function runReportsTests() {
  console.log('\n===============================================================');
  console.log('       POSTGRESQL FINANCIAL & INVENTORY REPORTS TESTS          ');
  console.log('===============================================================\n');

  // 1. Seed Category and Company
  const cat = await pgCreateCategory({ name: 'مشروبات وعصائر', slug: 'beverages' });
  const comp = await pgCreateCompany({ name: 'شركة الفرات الصناعية' });

  // 2. Seed Products
  const prodA = await pgCreateProduct({
    name: 'عصير برتقال طبيعي 1 لتر',
    category: cat.name,
    company: comp.name,
    price: 3000,
    costPrice: 2000,
    wholesalePrice: 48000,
    boxesPerCarton: 1,
    itemsPerBox: 24,
    stock: 50,
  });

  const prodB = await pgCreateProduct({
    name: 'شاي ممتاز كرتون',
    category: cat.name,
    company: comp.name,
    price: 5000,
    costPrice: 3500,
    wholesalePrice: 70000,
    boxesPerCarton: 1,
    itemsPerBox: 20,
    stock: 10,
    minStockAlert: 15,
  });

  // 3. Create Orders
  const order1 = await pgCreateOrder({
    customer: {
      name: 'علي الكرخي',
      phone: '07701122334',
      city: 'بغداد',
      address: 'الكرخ',
      isGuest: true,
    },
    items: [
      {
        productId: prodA.id,
        name: prodA.name,
        price: 3000,
        costPrice: 2000,
        quantity: 2,
        saleType: 'retail',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
    deliveryFee: 2000,
    paymentMethod: 'cod',
    createAccountIfMissing: true,
  });

  assert(order1.id, 'Order 1 created');

  // Seed Product with Unknown Cost (no catalog cost, no snapshot cost)
  const prodUnknown = await pgCreateProduct({
    name: 'منتج تجريبي بدون تكلفة مسجلة',
    category: cat.name,
    company: comp.name,
    price: 15000,
    wholesalePrice: 15000,
    boxesPerCarton: 1,
    itemsPerBox: 1,
    stock: 20,
  });

  const orderUnknownCost = await pgCreateOrder({
    customer: {
      name: 'زبون تجربة التكلفة المجهولة',
      phone: '07709988776',
      city: 'بغداد',
      address: 'المنصور',
      isGuest: true,
    },
    items: [
      {
        productId: prodUnknown.id,
        name: prodUnknown.name,
        price: 15000,
        quantity: 1,
        saleType: 'retail',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
    deliveryFee: 0,
    paymentMethod: 'cod',
    createAccountIfMissing: true,
  });

  assert(orderUnknownCost.id, 'Order with unknown product cost created');

  // Explicitly reset cost on product and order item to 0 to simulate missing/unknown historical cost
  await sql`
    UPDATE products
    SET cost_price = 0, piece_cost_price = 0, box_cost_price = 0
    WHERE id = ${prodUnknown.id};
  `;
  await sql`
    UPDATE order_items
    SET unit_cost_pieces_snap = 0
    WHERE order_id = ${orderUnknownCost.id};
  `;

  // --- Test 1: Profit Report & Unknown Cost Handling ---
  console.log('\n--- Testing Profit Report & Unknown Cost Handling ---');
  const profitReport = await pgGetProfitReport();
  assert(profitReport.totalOrders >= 2, 'Profit report has at least 2 orders');
  assert(profitReport.totalRevenue > 0, 'Profit report total revenue > 0');
  assert(profitReport.ordersBreakdown.length >= 2, 'Profit report orders breakdown populated');
  assert(profitReport.productsBreakdown.length >= 2, 'Profit report products breakdown populated');

  // Specific Unknown Cost Invariants:
  const unknownOrderInReport = profitReport.ordersBreakdown.find((o) => o.id === orderUnknownCost.id);
  assert(unknownOrderInReport, 'Unknown cost order found in report');
  assert(unknownOrderInReport.hasIncompleteCostData === true, 'Order flagged with hasIncompleteCostData === true');
  assert(unknownOrderInReport.unknownCostItemsCount === 1, 'Order has unknownCostItemsCount === 1');
  assert(unknownOrderInReport.totalRevenue === 15000, 'Order total revenue is 15000');
  assert(unknownOrderInReport.grossProfit === 0, 'Order grossProfit is 0 (NOT claimed as 15000 confirmed profit)');
  assert(profitReport.hasIncompleteCostData === true, 'Summary report hasIncompleteCostData is true');
  assert(profitReport.unknownCostItemsCount >= 1, 'Summary report tracks unknownCostItemsCount');
  console.log('   ✅ Profit report calculation & unknown cost protection validated');

  // --- Test 2: Inventory Report ---
  console.log('\n--- Testing Inventory Report ---');
  const invReport = await pgGetInventoryReport();
  assert(invReport.totalProductsCount >= 2, 'Inventory report counts all products');
  assert(invReport.totalStockUnits > 0, 'Inventory report has stock units');
  assert(invReport.lowStockCount >= 1, 'Low stock item detected');
  assert(invReport.allInventory.length >= 2, 'All inventory items present');
  console.log('   ✅ Inventory report movements and stock levels validated');

  // --- Test 3: Daily Reconciliation Report ---
  console.log('\n--- Testing Daily Reconciliation Report ---');
  const today = new Date().toISOString().split('T')[0];
  const reconReport = await pgGetDailyReconciliationReport(today);
  assert(reconReport.date === today, 'Reconciliation report target date matched');
  assert(reconReport.ordersCount >= 1, 'Orders counted in daily reconciliation');
  assert(Array.isArray(reconReport.orders), 'Orders list returned');
  assert(Array.isArray(reconReport.payments), 'Payments list returned');
  assert(Array.isArray(reconReport.purchases), 'Purchases list returned');
  assert(Array.isArray(reconReport.vaultMovements), 'Vault movements list returned');
  console.log('   ✅ Daily reconciliation report validated');

  // --- Test 4: API Route Handlers ---
  console.log('\n--- Testing API Route Handlers ---');
  // 4a. Inventory Route
  const invReq = new Request('http://localhost:3000/api/reports/inventory');
  const invRes = await getInventoryReportRoute(invReq);
  const invJson = await invRes.json();
  assert(invRes.status === 200, 'GET /api/reports/inventory returned 200');
  assert(invJson.success === true, 'GET /api/reports/inventory success is true');
  assert(invJson.report.totalProductsCount >= 2, 'Route returns populated report');
  console.log('   ✅ GET /api/reports/inventory HTTP 200 OK');

  // 4b. Profits Route
  const profReq = new Request('http://localhost:3000/api/reports/profits');
  const profRes = await getProfitReportRoute(profReq);
  const profJson = await profRes.json();
  assert(profRes.status === 200, 'GET /api/reports/profits returned 200');
  assert(profJson.success === true, 'GET /api/reports/profits success is true');
  assert(profJson.report.totalRevenue > 0, 'Route returns calculated profits');
  console.log('   ✅ GET /api/reports/profits HTTP 200 OK');

  // 4c. Reconciliation Route
  const reconReq = new Request(`http://localhost:3000/api/reports/reconciliation?date=${today}`);
  const reconRes = await getReconciliationReportRoute(reconReq);
  const reconJson = await reconRes.json();
  assert(reconRes.status === 200, 'GET /api/reports/reconciliation returned 200');
  assert(reconJson.success === true, 'GET /api/reports/reconciliation success is true');
  assert(reconJson.report.date === today, 'Route returns reconciliation report for date');
  console.log('   ✅ GET /api/reports/reconciliation HTTP 200 OK');

  console.log('\n===============================================================');
  console.log('  ALL POSTGRESQL REPORTS & ROUTE TESTS PASSED SUCCESSFULLY!    ');
  console.log('===============================================================\n');
}

async function main() {
  try {
    await startDatabase();
    await runReportsTests();
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    if (sql) {
      try { await sql.end(); } catch {}
    }
    if (ep) {
      try { await ep.stop(); } catch {}
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

main();
