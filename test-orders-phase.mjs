import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';

const Ep = EpDefault.default || EpDefault;
const PORT = 54332;
const tempDir = path.join(os.tmpdir(), 'ep_test_orders_phase_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';

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
  ];

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    if (fs.existsSync(fullPath)) {
      await runSqlScript(sql, fullPath);
    }
  }
  console.log('   All migrations applied successfully.');
}

async function runAllOrdersTests() {
  console.log('\n===============================================================');
  console.log('        ORDERS / SALES INTEGRATION COMPREHENSIVE TESTS         ');
  console.log('===============================================================\n');

  const {
    pgCreateOrder,
    pgGetOrders,
    pgGetOrderById,
    pgUpdateOrderStatus,
    pgUpdateOrder,
    pgCancelOrder,
  } = await import('./src/lib/postgres-orders.ts');

  const {
    pgGetCustomerStatement,
  } = await import('./src/lib/postgres-accounting.ts');

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

  // 0. Seed test category, company, and products
  console.log('--- Setting up Test Data ---');
  const [testCat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم تجارب الطلبات', 'test-order-cat')
    RETURNING id, name;
  `;

  const [testComp] = await sql`
    INSERT INTO companies (name)
    VALUES ('شركة تجارب الطلبات')
    RETURNING id, name;
  `;

  // Product A: 4 boxes per carton, 6 items per box -> 24 pieces per carton. Stock: 100 pieces
  const [prodA] = await sql`
    INSERT INTO products (
      name, category_id, company_id,
      boxes_per_carton, items_per_box, pieces_per_carton,
      current_stock_pieces,
      retail_unit, wholesale_unit,
      price, wholesale_price, piece_cost_price, cost_price
    ) VALUES (
      'عصير راني برتقال كرتون وقطع', ${testCat.id}, ${testComp.id},
      4, 6, 24,
      100,
      'قطعة مفردة', 'كرتون 24 قطعة',
      1000.00, 20000.00, 700.0000, 16800.00
    ) RETURNING id, name, current_stock_pieces;
  `;

  // Product B: single piece items. Stock: 10 pieces
  const [prodB] = await sql`
    INSERT INTO products (
      name, category_id, company_id,
      boxes_per_carton, items_per_box, pieces_per_carton,
      current_stock_pieces,
      retail_unit, wholesale_unit,
      price, wholesale_price, piece_cost_price, cost_price
    ) VALUES (
      'شوكولاتة نوتيلا مفرد', ${testCat.id}, ${testComp.id},
      1, 1, 1,
      10,
      'قطعة مفردة', 'علبة مفردة',
      5000.00, 5000.00, 3500.0000, 3500.00
    ) RETURNING id, name, current_stock_pieces;
  `;

  // Customer Account
  const [testCustomer] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier, city, address
    ) VALUES (
      'ACC-TEST-ORDER-1', 'الحاج رعد الكرخي', '07701112233', 'customer', 'retail', 'بغداد', 'الكرخ - ساحة الشهداء'
    ) RETURNING id, name, phone;
  `;

  console.log(`Seeded Product A: ${prodA.name} (${prodA.id}) with ${prodA.current_stock_pieces} pieces.`);
  console.log(`Seeded Product B: ${prodB.name} (${prodB.id}) with ${prodB.current_stock_pieces} pieces.`);
  console.log(`Seeded Customer: ${testCustomer.name} (${testCustomer.id})\n`);

  // ==============================================================
  // Test 1: Order Creation -> Piece Deduction & Math Integrity
  // ==============================================================
  console.log('--- Test 1: Create Order & Deduct Inventory in Pieces ---');
  // Order: 2 cartons of Product A (2 * 24 = 48 pieces) + 3 pieces of Product B (3 * 1 = 3 pieces)
  const order1 = await pgCreateOrder({
    customer: {
      name: testCustomer.name,
      phone: testCustomer.phone,
      city: 'بغداد',
      address: 'الكرخ - ساحة الشهداء',
      userId: testCustomer.id,
      isGuest: false,
    },
    accountId: testCustomer.id,
    items: [
      {
        productId: prodA.id,
        name: 'عصير راني برتقال',
        price: 20000,
        quantity: 2,
        saleType: 'wholesale',
        unitLabel: 'كرتون',
        image: '',
      },
      {
        productId: prodB.id,
        name: 'شوكولاتة نوتيلا',
        price: 5000,
        quantity: 3,
        saleType: 'retail',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
    deliveryFee: 5000,
    discount: 1000,
    paymentMethod: 'cod',
    operator: { name: 'Admin Test', username: 'admin_test', role: 'admin' },
  });

  assert(order1 && order1.orderNumber.startsWith('INV-'), `Order 1 created with monotonic sequence: ${order1.orderNumber}`);
  assert(order1.status === 'pending', `Order status is pending`);
  assert(order1.total === 20000 * 2 + 5000 * 3 + 5000 - 1000, `Order total is calculated accurately (${order1.total} IQD)`);

  // Verify stock of Product A (100 - 48 = 52)
  const [stockRowA] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(stockRowA.current_stock_pieces === 52, `Product A stock deducted in pieces: 100 - 48 = ${stockRowA.current_stock_pieces}`);

  // Verify stock of Product B (10 - 3 = 7)
  const [stockRowB] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodB.id}`;
  assert(stockRowB.current_stock_pieces === 7, `Product B stock deducted in pieces: 10 - 3 = ${stockRowB.current_stock_pieces}`);

  // Verify inventory_movements records
  const movements = await sql`
    SELECT movement_type, quantity_pieces, reference_id, reference_type
    FROM inventory_movements
    WHERE reference_id = ${order1.id}
    ORDER BY created_at ASC;
  `;
  assert(movements.length === 2, `Exactly 2 inventory movements recorded for Order 1`);
  assert(movements[0].movement_type === 'sale' && movements[0].quantity_pieces === -48, `Movement 1 is sale outflow of -48 pieces`);
  assert(movements[1].movement_type === 'sale' && movements[1].quantity_pieces === -3, `Movement 2 is sale outflow of -3 pieces`);

  // Verify order_items math integrity in DB
  const dbItems = await sql`
    SELECT sold_quantity, conversion_factor_snap, base_quantity_deducted
    FROM order_items
    WHERE order_id = ${order1.id};
  `;
  for (const it of dbItems) {
    assert(it.base_quantity_deducted === it.sold_quantity * it.conversion_factor_snap, `Math integrity constraint verified: ${it.base_quantity_deducted} = ${it.sold_quantity} * ${it.conversion_factor_snap}`);
  }

  // ==============================================================
  // Test 2: Customer Statement (Invoice is Debit, No Auto Voucher)
  // ==============================================================
  console.log('\n--- Test 2: Customer Statement Verification ---');
  const statement = await pgGetCustomerStatement(testCustomer.phone);
  assert(statement !== null, `Statement retrieved for customer ${testCustomer.phone}`);
  const invoiceTx = statement.transactions.find((t) => t.reference === order1.orderNumber);
  assert(invoiceTx !== undefined, `Invoice transaction appears in customer statement`);
  assert(invoiceTx.debit === order1.total && invoiceTx.credit === 0, `Invoice is Debit of ${order1.total} IQD with 0 Credit`);
  
  // Verify NO auto-voucher was created
  const voucherCount = await sql`SELECT count(*)::int as count FROM vouchers WHERE account_id = ${testCustomer.id};`;
  assert(voucherCount[0].count === 0, `Verified NO auto-voucher was created upon order creation`);

  // ==============================================================
  // Test 3: Update Order & Delta Inventory Adjustment
  // ==============================================================
  console.log('\n--- Test 3: Update Order & Delta Inventory Adjustment ---');
  // Update order: reduce Product B from 3 to 1 piece (2 pieces returned to stock)
  await pgUpdateOrder(order1.id, {
    items: [
      {
        productId: prodA.id,
        name: 'عصير راني برتقال',
        price: 20000,
        quantity: 2,
        saleType: 'wholesale',
        unitLabel: 'كرتون',
        image: '',
      },
      {
        productId: prodB.id,
        name: 'شوكولاتة نوتيلا',
        price: 5000,
        quantity: 1, // Reduced by 2 pieces
        saleType: 'retail',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
  });

  const [stockRowBAfterUpdate] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodB.id}`;
  assert(stockRowBAfterUpdate.current_stock_pieces === 9, `Product B stock adjusted up by delta (+2 pieces): 7 -> ${stockRowBAfterUpdate.current_stock_pieces}`);

  // ==============================================================
  // Test 4: Cancel Order & Inventory Restoration
  // ==============================================================
  console.log('\n--- Test 4: Cancel Order & Restore Inventory ---');
  const cancelledOrder = await pgCancelOrder(order1.id, { reason: 'رغبة العميل بالإلغاء' });
  assert(cancelledOrder.status === 'cancelled', `Order status updated to cancelled`);
  assert(cancelledOrder.inventoryRestored === true, `Order inventoryRestored flag set to true`);

  const [stockRowAFinal] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(stockRowAFinal.current_stock_pieces === 100, `Product A stock fully restored back to 100 pieces (was 52)`);

  const [stockRowBFinal] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodB.id}`;
  assert(stockRowBFinal.current_stock_pieces === 10, `Product B stock fully restored back to 10 pieces (was 9)`);

  // Verify statement excludes cancelled order
  const statementAfterCancel = await pgGetCustomerStatement(testCustomer.phone);
  const cancelledTx = statementAfterCancel.transactions.find((t) => t.reference === order1.orderNumber);
  assert(cancelledTx === undefined, `Cancelled order is excluded from customer active statement`);

  // ==============================================================
  // Test 5: Idempotency (Prevent Duplicate Restoration)
  // ==============================================================
  console.log('\n--- Test 5: Idempotent Restoration Protection ---');
  await pgCancelOrder(order1.id, { reason: 'إلغاء مكرر للتجربة' });
  const [stockRowAIdempotent] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(stockRowAIdempotent.current_stock_pieces === 100, `Stock remains exactly 100 pieces, not duplicated to 148`);

  // ==============================================================
  // Test 6: Terminal State Protection (Cannot Reopen Cancelled)
  // ==============================================================
  console.log('\n--- Test 6: Terminal State Protection ---');
  let reopenedError = false;
  try {
    await pgUpdateOrderStatus(order1.id, 'processing');
  } catch (err) {
    reopenedError = true;
    assert(err.message.includes('حالة نهائية'), `Blocked reopening cancelled order: ${err.message}`);
  }
  assert(reopenedError, `Reopening cancelled order rejected successfully`);

  // ==============================================================
  // Test 7: Insufficient Stock Failure
  // ==============================================================
  console.log('\n--- Test 7: Insufficient Stock Failure (Negative Stock Prevention) ---');
  let insufficientStockError = false;
  try {
    await pgCreateOrder({
      customer: {
        name: testCustomer.name,
        phone: testCustomer.phone,
        city: 'بغداد',
        address: 'الكرخ',
        userId: testCustomer.id,
        isGuest: false,
      },
      accountId: testCustomer.id,
      items: [
        {
          productId: prodA.id,
          name: 'عصير راني',
          price: 20000,
          quantity: 10, // 10 cartons * 24 = 240 pieces, but only 100 exist
          saleType: 'wholesale',
          unitLabel: 'كرتون',
          image: '',
        },
      ],
    });
  } catch (err) {
    insufficientStockError = true;
    assert(err.message.includes('المخزون غير كافٍ'), `Caught insufficient stock error: ${err.message}`);
  }
  assert(insufficientStockError, `Insufficient stock cleanly blocked without negative stock`);

  const [stockRowAPreserve] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  assert(stockRowAPreserve.current_stock_pieces === 100, `Stock remains untouched at 100 after failed order`);

  // ==============================================================
  // Test 8: Non-Existent Product Failure
  // ==============================================================
  console.log('\n--- Test 8: Non-Existent Product Failure ---');
  let nonExistentProdError = false;
  try {
    await pgCreateOrder({
      customer: {
        name: testCustomer.name,
        phone: testCustomer.phone,
        city: 'بغداد',
        address: 'الكرخ',
        userId: testCustomer.id,
        isGuest: false,
      },
      accountId: testCustomer.id,
      items: [
        {
          productId: 'a0000000-0000-0000-0000-000000000000',
          name: 'منتج وهمي',
          price: 1000,
          quantity: 1,
          saleType: 'retail',
          unitLabel: 'قطعة',
          image: '',
        },
      ],
    });
  } catch (err) {
    nonExistentProdError = true;
    assert(err.message.includes('المنتج غير موجود'), `Caught non-existent product error: ${err.message}`);
  }
  assert(nonExistentProdError, `Non-existent product rejected`);

  // ==============================================================
  // Test 9: Non-Existent Account Failure
  // ==============================================================
  console.log('\n--- Test 9: Non-Existent Account Failure ---');
  let nonExistentAccError = false;
  try {
    await pgCreateOrder({
      customer: {
        name: 'عميل غير مسجل',
        phone: '07709998877',
        city: 'بغداد',
        address: 'الكرخ',
        isGuest: false,
      },
      accountId: 'b0000000-0000-0000-0000-000000000000',
      items: [
        {
          productId: prodA.id,
          name: 'عصير راني',
          price: 20000,
          quantity: 1,
          saleType: 'wholesale',
          unitLabel: 'كرتون',
          image: '',
        },
      ],
      createAccountIfMissing: false,
    });
  } catch (err) {
    nonExistentAccError = true;
    assert(err.message.includes('الحساب المالي للعميل غير موجود'), `Caught non-existent account error: ${err.message}`);
  }
  assert(nonExistentAccError, `Non-existent account rejected`);

  // ==============================================================
  // Test 10: Financial Protection (Cannot Cancel Collected Order)
  // ==============================================================
  console.log('\n--- Test 10: Financial Protection against Cancelling Collected Orders ---');
  const orderCollected = await pgCreateOrder({
    customer: {
      name: testCustomer.name,
      phone: testCustomer.phone,
      city: 'بغداد',
      address: 'الكرخ',
      userId: testCustomer.id,
      isGuest: false,
    },
    accountId: testCustomer.id,
    items: [
      {
        productId: prodB.id,
        name: 'شوكولاتة نوتيلا',
        price: 5000,
        quantity: 1,
        saleType: 'retail',
        unitLabel: 'قطعة',
        image: '',
      },
    ],
  });

  await sql`
    UPDATE orders
    SET collected_amount = 5000.00
    WHERE id = ${orderCollected.id};
  `;

  let cancelCollectedError = false;
  try {
    await pgCancelOrder(orderCollected.id, { reason: 'إلغاء طلب عليه دفع' });
  } catch (err) {
    cancelCollectedError = true;
    assert(err.message.includes('حركة مالية مسجلة'), `Caught financial protection error: ${err.message}`);
  }
  assert(cancelCollectedError, `Cancellation of collected order safely blocked`);

  // ==============================================================
  // Test 11: Physical DELETE Blocked by PostgreSQL Trigger
  // ==============================================================
  console.log('\n--- Test 11: Physical DELETE Prevention (Database Trigger) ---');
  let physicalDeleteBlocked = false;
  try {
    await sql`DELETE FROM orders WHERE id = ${order1.id};`;
  } catch (err) {
    physicalDeleteBlocked = true;
    assert(err.message.includes('Orders cannot be deleted'), `Trigger trg_prevent_order_delete raised expected exception: ${err.message}`);
  }
  assert(physicalDeleteBlocked, `Physical DELETE on orders table is strictly forbidden by PostgreSQL`);

  // ==============================================================
  // Test 12: API Routes Contract Integration (POST, GET, PATCH, DELETE)
  // ==============================================================
  console.log('\n--- Test 12: API Routes End-to-End Verification ---');
  const { GET: getOrdersRoute, POST: postOrderRoute } = await import('./src/app/api/orders/route.ts');
  const {
    GET: getOrderByIdRoute,
    PATCH: patchOrderRoute,
    DELETE: deleteOrderRoute,
  } = await import('./src/app/api/orders/[id]/route.ts');

  // POST /api/orders (Storefront checkout with auto-created account)
  const postReq = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'سالم الكرخي',
        phone: '07708889911',
        city: 'بغداد',
        address: 'شارع فلسطين',
      },
      items: [
        {
          productId: prodA.id,
          name: prodA.name,
          price: 20000,
          quantity: 1,
          saleType: 'wholesale',
        },
      ],
      deliveryFee: 5000,
    }),
  });

  const postRes = await postOrderRoute(postReq);
  const postData = await postRes.json();
  assert(postRes.status === 201, `POST /api/orders returned HTTP 201`);
  assert(postData.success === true, `POST response success is true`);
  assert(postData.order && postData.order.orderNumber.startsWith('INV-'), `Order created via API: ${postData.order.orderNumber}`);
  assert(postData.order.total === 25000, `API Order total calculated correctly: 25000 IQD`);
  assert(postData.whatsappUrl && postData.whatsappUrl.includes('whatsapp.com'), `WhatsApp link generated`);

  const apiOrderId = postData.order.id;

  // GET /api/orders by phone
  const getReq = new Request(`http://localhost:3000/api/orders?phone=07708889911`);
  const getRes = await getOrdersRoute(getReq);
  const getData = await getRes.json();
  assert(getRes.status === 200, `GET /api/orders returned HTTP 200`);
  assert(getData.orders.length >= 1 && getData.orders[0].id === apiOrderId, `Order found via GET /api/orders?phone=...`);

  // GET /api/orders/[id]
  const getByIdReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`);
  const getByIdRes = await getOrderByIdRoute(getByIdReq, { params: { id: apiOrderId } });
  const getByIdData = await getByIdRes.json();
  assert(getByIdRes.status === 200, `GET /api/orders/[id] returned HTTP 200`);
  assert(getByIdData.order.customer.name === 'سالم الكرخي', `Retrieved order matches customer`);

  // PATCH /api/orders/[id]
  const patchReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'processing' }),
  });
  const patchRes = await patchOrderRoute(patchReq, { params: { id: apiOrderId } });
  const patchData = await patchRes.json();
  assert(patchRes.status === 200 && patchData.order.status === 'processing', `PATCH transitioned order to processing`);

  // DELETE /api/orders/[id] (Logical cancel + stock restore)
  const deleteReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'DELETE',
  });
  const deleteRes = await deleteOrderRoute(deleteReq, { params: { id: apiOrderId } });
  const deleteData = await deleteRes.json();
  assert(deleteRes.status === 200 && deleteData.success === true, `DELETE /api/orders/[id] succeeded logically`);

  const [apiOrderInDb] = await sql`SELECT status, inventory_restored FROM orders WHERE id = ${apiOrderId};`;
  assert(apiOrderInDb.status === 'cancelled' && apiOrderInDb.inventory_restored === true, `Order in DB is cancelled and inventory restored`);

  console.log('\n===============================================================');
  console.log(` ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED `);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

async function main() {
  try {
    await setup();
    await runAllOrdersTests();
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    if (sql) await sql.end();
    if (ep) {
      console.log('Stopping embedded PostgreSQL...');
      await ep.stop();
      console.log('Embedded PostgreSQL stopped.');
    }
    process.exit(0);
  }
}

main();
