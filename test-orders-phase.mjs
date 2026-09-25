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
  // Test 12: API Routes Contract Integration (POST, GET, PATCH, PUT, DELETE)
  // ==============================================================
  console.log('\n--- Test 12: API Routes Contract & Auth Verification ---');
  const { GET: getOrdersRoute, POST: postOrderRoute } = await import('./src/app/api/orders/route.ts');
  const {
    GET: getOrderByIdRoute,
    PATCH: patchOrderRoute,
    PUT: putOrderRoute,
    DELETE: deleteOrderRoute,
  } = await import('./src/app/api/orders/[id]/route.ts');
  const {
    signAdminSession,
    SESSION_COOKIE_NAME,
    signCustomerSession,
    CUSTOMER_SESSION_COOKIE_NAME,
    signOrderAccessToken,
    verifyOrderAccessToken,
    getAuthenticatedCustomer,
  } = await import('./src/lib/auth.ts');
  const { ensureDbExists } = await import('./src/lib/db.ts');

  // Setup staff in db.staff for permission checks
  const memDb = ensureDbExists();
  if (!memDb.staff) memDb.staff = [];
  memDb.staff = memDb.staff.filter((s) => s.username !== 'acc_staff_test' && s.username !== 'orders_staff_test');
  
  // Staff with accounting permission ONLY (lacks 'orders')
  memDb.staff.push({
    id: 'staff-acc-only',
    name: 'موظف محاسبة فقط',
    username: 'acc_staff_test',
    role: 'staff',
    permissions: ['accounting'],
    isActive: true,
  });

  // Staff with orders permission
  memDb.staff.push({
    id: 'staff-orders-ok',
    name: 'موظف مبيعات معتمد',
    username: 'orders_staff_test',
    role: 'staff',
    permissions: ['orders'],
    isActive: true,
  });

  const adminCookie = `${SESSION_COOKIE_NAME}=${signAdminSession({
    userId: 'admin-master',
    username: 'admin',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;

  const staffNoOrdersCookie = `${SESSION_COOKIE_NAME}=${signAdminSession({
    userId: 'staff-acc-only',
    username: 'acc_staff_test',
    role: 'staff',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;

  const staffOrdersOkCookie = `${SESSION_COOKIE_NAME}=${signAdminSession({
    userId: 'staff-orders-ok',
    username: 'orders_staff_test',
    role: 'staff',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;

  // 12.1 POST /api/orders (Public storefront customer checkout)
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
  assert(postRes.status === 201, `Customer checkout POST /api/orders returned HTTP 201 (Public storefront access works)`);
  assert(postData.success === true, `POST response success is true`);
  assert(postData.order && postData.order.orderNumber.startsWith('INV-'), `Order created via API: ${postData.order.orderNumber}`);
  assert(postData.order.total === 25000, `API Order total calculated correctly: 25000 IQD`);
  assert(postData.whatsappUrl && postData.whatsappUrl.includes('whatsapp.com'), `WhatsApp link generated`);

  const apiOrderId = postData.order.id;

  // 12.2 Authentication Enforcements on Sensitive Order Operations:
  console.log('\n--- Test 13: Enforce Authentication on Sensitive Routes ---');

  // PATCH without session -> 401
  const patchNoAuthReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'processing' }),
  });
  const patchNoAuthRes = await patchOrderRoute(patchNoAuthReq, { params: { id: apiOrderId } });
  assert(patchNoAuthRes.status === 401, `PATCH without admin session rejected with HTTP 401`);

  // PUT without session -> 401
  const putNoAuthReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'تعديل غير مصرح' }),
  });
  const putNoAuthRes = await putOrderRoute(putNoAuthReq, { params: { id: apiOrderId } });
  assert(putNoAuthRes.status === 401, `PUT without admin session rejected with HTTP 401`);

  // DELETE without session -> 401
  const deleteNoAuthReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'DELETE',
  });
  const deleteNoAuthRes = await deleteOrderRoute(deleteNoAuthReq, { params: { id: apiOrderId } });
  assert(deleteNoAuthRes.status === 401, `DELETE without admin session rejected with HTTP 401`);

  // 12.3 Authorization Enforcements (Staff lacking 'orders' permission -> 403)
  console.log('\n--- Test 14: Enforce Permissions on Sensitive Routes ---');

  // PATCH with staff lacking 'orders' permission -> 403
  const patchNoPermReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': staffNoOrdersCookie,
    },
    body: JSON.stringify({ status: 'processing' }),
  });
  const patchNoPermRes = await patchOrderRoute(patchNoPermReq, { params: { id: apiOrderId } });
  assert(patchNoPermRes.status === 403, `PATCH by staff without 'orders' permission rejected with HTTP 403`);

  // PUT with staff lacking 'orders' permission -> 403
  const putNoPermReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': staffNoOrdersCookie,
    },
    body: JSON.stringify({ notes: 'تعديل موظف غير مخول' }),
  });
  const putNoPermRes = await putOrderRoute(putNoPermReq, { params: { id: apiOrderId } });
  assert(putNoPermRes.status === 403, `PUT by staff without 'orders' permission rejected with HTTP 403`);

  // DELETE with staff lacking 'orders' permission -> 403
  const deleteNoPermReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'DELETE',
    headers: {
      'Cookie': staffNoOrdersCookie,
    },
  });
  const deleteNoPermRes = await deleteOrderRoute(deleteNoPermReq, { params: { id: apiOrderId } });
  assert(deleteNoPermRes.status === 403, `DELETE by staff without 'orders' permission rejected with HTTP 403`);

  // 12.4 Successful operations with authorized Admin / Staff:
  console.log('\n--- Test 15: Authorized Admin / Staff Operations ---');

  // PATCH with authorized staff -> 200
  const patchAuthReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': staffOrdersOkCookie,
    },
    body: JSON.stringify({ status: 'processing' }),
  });
  const patchAuthRes = await patchOrderRoute(patchAuthReq, { params: { id: apiOrderId } });
  const patchAuthData = await patchAuthRes.json();
  assert(patchAuthRes.status === 200 && patchAuthData.order.status === 'processing', `PATCH with authorized staff succeeded with HTTP 200`);

  // PUT with master admin -> 200
  const putAuthReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': adminCookie,
    },
    body: JSON.stringify({ notes: 'ملاحظة معتمدة من الإدارة' }),
  });
  const putAuthRes = await putOrderRoute(putAuthReq, { params: { id: apiOrderId } });
  const putAuthData = await putAuthRes.json();
  assert(putAuthRes.status === 200 && putAuthData.success === true, `PUT with master admin succeeded with HTTP 200`);

  // 12.5 Customer A and Customer B Isolation Tests:
  console.log('\n--- Test 16: Scoping of Customer vs Admin Orders Access ---');

  // Create Order for Customer A
  const custA = {
    id: 'cust-a-uuid',
    name: 'حيدر الزبون أ',
    phone: '07701111111',
    email: 'custA@example.com',
  };

  // Create Order for Customer B
  const custB = {
    id: 'cust-b-uuid',
    name: 'كرار الزبون ب',
    phone: '07702222222',
    email: 'custB@example.com',
  };

  // Ensure Customer A and B exist and are active in DB
  const memDbTest16 = ensureDbExists();
  if (!memDbTest16.users) memDbTest16.users = [];
  memDbTest16.users = memDbTest16.users.filter((u) => u.id !== custA.id && u.id !== custB.id);
  memDbTest16.users.push({
    id: custA.id,
    name: custA.name,
    phone: custA.phone,
    email: custA.email,
    role: 'customer',
    accountType: 'individual',
    isActive: true,
    createdAt: new Date().toISOString(),
  });
  memDbTest16.users.push({
    id: custB.id,
    name: custB.name,
    phone: custB.phone,
    email: custB.email,
    role: 'customer',
    accountType: 'individual',
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  const tokenCustA = signCustomerSession({
    userId: custA.id,
    phone: custA.phone,
    email: custA.email,
    name: custA.name,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const cookieCustA = `${CUSTOMER_SESSION_COOKIE_NAME}=${tokenCustA}`;

  const tokenCustB = signCustomerSession({
    userId: custB.id,
    phone: custB.phone,
    email: custB.email,
    name: custB.name,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const cookieCustB = `${CUSTOMER_SESSION_COOKIE_NAME}=${tokenCustB}`;

  // POST Order for Customer A
  const postReqA = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieCustA,
    },
    body: JSON.stringify({
      customer: {
        name: custA.name,
        phone: custA.phone,
        city: 'بغداد',
        address: 'المنصور',
        userId: custA.id,
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
  const postResA = await postOrderRoute(postReqA);
  const postDataA = await postResA.json();
  assert(postResA.status === 201, `Customer A created order successfully: ${postDataA.order.id}`);
  const orderAId = postDataA.order.id;

  // POST Order for Customer B
  const postReqB = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieCustB,
    },
    body: JSON.stringify({
      customer: {
        name: custB.name,
        phone: custB.phone,
        city: 'النجف',
        address: 'الكوفة',
        userId: custB.id,
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
  const postResB = await postOrderRoute(postReqB);
  const postDataB = await postResB.json();
  assert(postResB.status === 201, `Customer B created order successfully: ${postDataB.order.id}`);
  const orderBId = postDataB.order.id;

  // 16.1 Unauthenticated request to GET /api/orders without session -> 401
  const getNoAuthAllReq = new Request('http://localhost:3000/api/orders');
  const getNoAuthAllRes = await getOrdersRoute(getNoAuthAllReq);
  assert(getNoAuthAllRes.status === 401, `Unauthenticated request to list all orders rejected with HTTP 401`);

  // 16.2 Customer A reads their own orders via session -> 200
  const getCustAReq = new Request('http://localhost:3000/api/orders', {
    headers: { 'Cookie': cookieCustA },
  });
  const getCustARes = await getOrdersRoute(getCustAReq);
  const getCustAData = await getCustARes.json();
  assert(getCustARes.status === 200, `Customer A successfully fetched their orders via session (HTTP 200)`);
  assert(getCustAData.orders.some((o) => o.id === orderAId), `Customer A orders list contains order A`);
  assert(!getCustAData.orders.some((o) => o.id === orderBId), `Customer A orders list does NOT contain order B`);

  // 16.3 Spoofing Attempt: Customer A puts Customer B's phone and userId in query params
  // The server MUST ignore the query params and return ONLY Customer A's orders based on trusted session!
  const getSpoofReq = new Request(`http://localhost:3000/api/orders?phone=${custB.phone}&userId=${custB.id}`, {
    headers: { 'Cookie': cookieCustA },
  });
  const getSpoofRes = await getOrdersRoute(getSpoofReq);
  const getSpoofData = await getSpoofRes.json();
  assert(getSpoofRes.status === 200, `Query with spoofed URL params processed under Customer A session`);
  assert(getSpoofData.orders.some((o) => o.id === orderAId), `Customer A still receives their own order A`);
  assert(!getSpoofData.orders.some((o) => o.id === orderBId), `Spoof thwarted: Customer A CANNOT access Customer B's orders by altering URL query parameters`);

  // 16.4 Admin querying all orders with admin session -> 200
  const getAdminAllReq = new Request('http://localhost:3000/api/orders', {
    headers: { 'Cookie': adminCookie },
  });
  const getAdminAllRes = await getOrdersRoute(getAdminAllReq);
  const getAdminAllData = await getAdminAllRes.json();
  assert(getAdminAllRes.status === 200, `Admin fetching all orders returned HTTP 200`);
  assert(
    getAdminAllData.orders.some((o) => o.id === orderAId) && getAdminAllData.orders.some((o) => o.id === orderBId),
    `Admin successfully received orders across all customers`
  );

  // ==============================================================
  // Test 17: GET /api/orders/[id] Object-Level Authorization
  // ==============================================================
  console.log('\n--- Test 17: GET /api/orders/[id] Object-Level Authorization ---');

  // 17.1 Customer A opens their own orderA -> 200
  const getOrderAAuthReq = new Request(`http://localhost:3000/api/orders/${orderAId}`, {
    headers: { 'Cookie': cookieCustA },
  });
  const getOrderAAuthRes = await getOrderByIdRoute(getOrderAAuthReq, { params: { id: orderAId } });
  assert(getOrderAAuthRes.status === 200, `Customer A can view their own orderA (HTTP 200)`);

  // 17.2 Customer A tries to open Customer B's orderB -> 403 Forbidden!
  const getOrderBByCustAReq = new Request(`http://localhost:3000/api/orders/${orderBId}`, {
    headers: { 'Cookie': cookieCustA },
  });
  const getOrderBByCustARes = await getOrderByIdRoute(getOrderBByCustAReq, { params: { id: orderBId } });
  assert(getOrderBByCustARes.status === 403, `Customer A blocked from viewing Customer B's order (HTTP 403 Forbidden)`);

  // 17.3 Unauthenticated anonymous request to orderB without session or token -> 401 Unauthorized!
  const getOrderBAnonReq = new Request(`http://localhost:3000/api/orders/${orderBId}`);
  const getOrderBAnonRes = await getOrderByIdRoute(getOrderBAnonReq, { params: { id: orderBId } });
  const getOrderBAnonData = await getOrderBAnonRes.json();
  assert(getOrderBAnonRes.status === 401, `Unauthenticated request to /api/orders/[id] rejected with HTTP 401`);
  assert(!getOrderBAnonData.order, `Order data is NOT leaked to unauthorized caller`);

  // 17.4 Admin with 'orders' permission can open any order -> 200
  const getOrderBByAdminReq = new Request(`http://localhost:3000/api/orders/${orderBId}`, {
    headers: { 'Cookie': adminCookie },
  });
  const getOrderBByAdminRes = await getOrderByIdRoute(getOrderBByAdminReq, { params: { id: orderBId } });
  assert(getOrderBByAdminRes.status === 200, `Admin with orders permission can view any order (HTTP 200)`);

  // ==============================================================
  // Test 18: Guest Checkout & Cryptographic Order Access Token
  // ==============================================================
  console.log('\n--- Test 18: Guest Checkout & Cryptographic Order Access Token ---');

  // 18.1 Guest places order via POST /api/orders (no session)
  const guestPostReq = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'ضيف مجهول',
        phone: '07703333333',
        city: 'كربلاء',
        address: 'حي الحسين',
        isGuest: true,
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
  const guestPostRes = await postOrderRoute(guestPostReq);
  const guestPostData = await guestPostRes.json();
  assert(guestPostRes.status === 201, `Guest Checkout succeeded with HTTP 201`);
  assert(guestPostData.orderAccessToken && typeof guestPostData.orderAccessToken === 'string', `Cryptographic orderAccessToken issued for guest order`);

  const guestOrderId = guestPostData.order.id;
  const guestToken = guestPostData.orderAccessToken;

  // 18.2 Attacker tries to read guest order without token -> 401
  const attackerGuestReq = new Request(`http://localhost:3000/api/orders/${guestOrderId}`);
  const attackerGuestRes = await getOrderByIdRoute(attackerGuestReq, { params: { id: guestOrderId } });
  assert(attackerGuestRes.status === 401, `Attacker without token cannot read guest order (phone alone is NOT authorization, HTTP 401)`);

  // 18.3 Attacker tries to read with tampered / fake token -> 401
  const fakeTokenReq = new Request(`http://localhost:3000/api/orders/${guestOrderId}?token=fake.tampered.token`);
  const fakeTokenRes = await getOrderByIdRoute(fakeTokenReq, { params: { id: guestOrderId } });
  assert(fakeTokenRes.status === 401, `Tampered or invalid token rejected with HTTP 401`);

  // 18.4 Attacker uses token from another order to access guest order -> 401
  const tokenForOrderA = signOrderAccessToken({
    orderId: orderAId,
    phone: custA.phone,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const wrongOrderTokenReq = new Request(`http://localhost:3000/api/orders/${guestOrderId}?token=${tokenForOrderA}`);
  const wrongOrderTokenRes = await getOrderByIdRoute(wrongOrderTokenReq, { params: { id: guestOrderId } });
  assert(wrongOrderTokenRes.status === 401, `Token scoped to another order rejected for guest order with HTTP 401`);

  // 18.5 Legitimate guest tracks order with valid URL token -> 200
  const validGuestReq = new Request(`http://localhost:3000/api/orders/${guestOrderId}?token=${guestToken}`);
  const validGuestRes = await getOrderByIdRoute(validGuestReq, { params: { id: guestOrderId } });
  const validGuestData = await validGuestRes.json();
  assert(validGuestRes.status === 200, `Guest safely accesses order with valid cryptographic orderAccessToken (HTTP 200)`);
  assert(validGuestData.order.id === guestOrderId, `Guest received correct order details`);

  // 18.6 Legitimate guest tracks order via automatic cookie -> 200
  const cookieGuestReq = new Request(`http://localhost:3000/api/orders/${guestOrderId}`, {
    headers: {
      'Cookie': `etihad_order_token_${guestOrderId}=${guestToken}`,
    },
  });
  const cookieGuestRes = await getOrderByIdRoute(cookieGuestReq, { params: { id: guestOrderId } });
  assert(cookieGuestRes.status === 200, `Guest accesses order seamlessly via scoped cookie (HTTP 200)`);

  // ==============================================================
  // Test 19: DELETE /api/orders/[id] with Admin Session -> 200
  // ==============================================================
  console.log('\n--- Test 19: DELETE by Admin with Inventory Restoration ---');
  const deleteAuthReq = new Request(`http://localhost:3000/api/orders/${apiOrderId}`, {
    method: 'DELETE',
    headers: { 'Cookie': adminCookie },
  });
  const deleteAuthRes = await deleteOrderRoute(deleteAuthReq, { params: { id: apiOrderId } });
  const deleteAuthData = await deleteAuthRes.json();
  assert(deleteAuthRes.status === 200 && deleteAuthData.success === true, `DELETE by authorized Admin succeeded with HTTP 200`);

  const [apiOrderInDb] = await sql`SELECT status, inventory_restored FROM orders WHERE id = ${apiOrderId};`;
  assert(apiOrderInDb.status === 'cancelled' && apiOrderInDb.inventory_restored === true, `Order in DB is cancelled and inventory restored`);

  // ==============================================================
  // Test 20: Customer Profile & Auth Security (/api/auth Hardening)
  // ==============================================================
  console.log('\n--- Test 20: Customer Profile & Auth Security (PUT/GET /api/auth) ---');
  const { GET: getAuthRoute, PUT: putAuthRoute } = await import('./src/app/api/auth/route.ts');
  const { createUser: createDbUser, getUsers: getDbUsers } = await import('./src/lib/db.ts');

  // Setup Customer A and Customer B in DB
  const phoneA = '0771' + Math.floor(1000000 + Math.random() * 9000000);
  const phoneB = '0772' + Math.floor(1000000 + Math.random() * 9000000);
  const userA = createDbUser({
    name: 'حيدر الزبون أ الأصلي',
    phone: phoneA,
    accountType: 'individual',
    city: 'بغداد',
    address: 'المنصور',
  });
  const userB = createDbUser({
    name: 'كرار الزبون ب الأصلي',
    phone: phoneB,
    accountType: 'individual',
    city: 'النجف',
    address: 'الكوفة',
  });

  const sessionTokenA = signCustomerSession({
    userId: userA.id,
    phone: userA.phone,
    name: userA.name,
    role: userA.accountType || 'customer',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const cookieSessionA = `${CUSTOMER_SESSION_COOKIE_NAME}=${sessionTokenA}`;

  // 20.1 PUT without session -> 401
  const putNoSessionReq = new Request('http://localhost:3000/api/auth', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates: { name: 'اختراق مجهول' } }),
  });
  const putNoSessionRes = await putAuthRoute(putNoSessionReq);
  assert(putNoSessionRes.status === 401, `PUT /api/auth without session rejected with HTTP 401`);

  // 20.2 Customer A cannot update Customer B even if sending B's userId in Body
  const putSpoofUserReq = new Request('http://localhost:3000/api/auth', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieSessionA,
    },
    body: JSON.stringify({
      userId: userB.id,
      updates: { name: 'محاولة تعديل اسم باء' },
    }),
  });
  const putSpoofUserRes = await putAuthRoute(putSpoofUserReq);
  assert(putSpoofUserRes.status === 200, `PUT request with Customer A session processed`);
  const freshUserB = getDbUsers().find(u => u.id === userB.id);
  assert(freshUserB.name === 'كرار الزبون ب الأصلي', `Confirmed: Customer B was NOT modified by Customer A (Customer B name unchanged)`);

  // 20.3 Modifying accountType or merchantStatus or administrative fields via PUT is safely ignored
  const putPrivilegeEscalationReq = new Request('http://localhost:3000/api/auth', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieSessionA,
    },
    body: JSON.stringify({
      updates: {
        accountType: 'wholesale',
        merchantStatus: 'approved',
        role: 'admin',
        balance: 9999999,
        category: 'vip',
      },
    }),
  });
  const putPrivilegeEscalationRes = await putAuthRoute(putPrivilegeEscalationReq);
  assert(putPrivilegeEscalationRes.status === 200, `PUT request processed`);
  const freshUserA = getDbUsers().find(u => u.id === userA.id);
  assert(freshUserA.accountType === 'individual', `accountType modification rejected/ignored (still individual)`);
  assert(freshUserA.merchantStatus === undefined, `merchantStatus modification rejected/ignored`);
  assert(freshUserA.role === 'customer', `role escalation rejected/ignored (still customer)`);

  // 20.4 Customer updates allowed personal fields only
  const putAllowedReq = new Request('http://localhost:3000/api/auth', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieSessionA,
    },
    body: JSON.stringify({
      updates: {
        name: 'حيدر الزبون أ المحدث',
        city: 'بغداد الجديدة',
        address: 'حي المعلمين',
      },
    }),
  });
  const putAllowedRes = await putAuthRoute(putAllowedReq);
  const putAllowedData = await putAllowedRes.json();
  assert(putAllowedRes.status === 200 && putAllowedData.success === true, `Customer updated allowed personal fields successfully`);
  const freshUserAAfterUpdate = getDbUsers().find(u => u.id === userA.id);
  assert(freshUserAAfterUpdate.name === 'حيدر الزبون أ المحدث', `Name updated in DB`);
  assert(freshUserAAfterUpdate.city === 'بغداد الجديدة', `City updated in DB`);
  assert(freshUserAAfterUpdate.address === 'حي المعلمين', `Address updated in DB`);

  // 20.5 Phone uniqueness check on update & session refresh
  // Attempting to change phone to Customer B's existing phone -> 400
  const putDuplicatePhoneReq = new Request('http://localhost:3000/api/auth', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieSessionA,
    },
    body: JSON.stringify({
      updates: { phone: userB.phone },
    }),
  });
  const putDuplicatePhoneRes = await putAuthRoute(putDuplicatePhoneReq);
  assert(putDuplicatePhoneRes.status === 400, `Updating phone to another user's phone rejected with HTTP 400`);

  // Changing to a unique phone succeeds and returns refreshed session token & cookie
  const newUniquePhone = '0773' + Math.floor(1000000 + Math.random() * 9000000);
  const putNewPhoneReq = new Request('http://localhost:3000/api/auth', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieSessionA,
    },
    body: JSON.stringify({
      updates: { phone: newUniquePhone },
    }),
  });
  const putNewPhoneRes = await putAuthRoute(putNewPhoneReq);
  const putNewPhoneData = await putNewPhoneRes.json();
  assert(putNewPhoneRes.status === 200, `Updating to unique phone succeeded`);
  assert(putNewPhoneData.token && typeof putNewPhoneData.token === 'string', `Refreshed session token issued on phone change`);
  assert(putNewPhoneRes.headers.get('set-cookie')?.includes(CUSTOMER_SESSION_COOKIE_NAME), `Refreshed session cookie set on phone change`);
  const freshUserANewPhone = getDbUsers().find(u => u.id === userA.id);
  assert(freshUserANewPhone.phone === newUniquePhone, `New phone saved in database`);

  // 20.6 GET /api/auth without session -> 401 (does NOT leak user data)
  const getAuthNoSessionReq = new Request(`http://localhost:3000/api/auth?identifier=${userB.phone}`);
  const getAuthNoSessionRes = await getAuthRoute(getAuthNoSessionReq);
  const getAuthNoSessionData = await getAuthNoSessionRes.json();
  assert(getAuthNoSessionRes.status === 401, `GET /api/auth by identifier without session rejected with HTTP 401`);
  assert(!getAuthNoSessionData.user, `No user data exposed to unauthenticated caller`);

  // 20.7 Customer A cannot GET Customer B's data; session A returns only A's data
  const getAuthCustAReq = new Request(`http://localhost:3000/api/auth?identifier=${userB.phone}`, {
    headers: { 'Cookie': cookieSessionA },
  });
  const getAuthCustARes = await getAuthRoute(getAuthCustAReq);
  const getAuthCustAData = await getAuthCustARes.json();
  assert(getAuthCustARes.status === 200, `Customer A GET /api/auth returns HTTP 200`);
  assert(getAuthCustAData.user.id === userA.id, `Confirmed: Session A returns A's data only`);
  assert(getAuthCustAData.user.id !== userB.id, `Confirmed: Customer A CANNOT get Customer B's data`);

  // 20.8 Admin lookup by identifier remains functional
  const getAuthAdminReq = new Request(`http://localhost:3000/api/auth?identifier=${userB.phone}`, {
    headers: { 'Cookie': adminCookie },
  });
  const getAuthAdminRes = await getAuthRoute(getAuthAdminReq);
  const getAuthAdminData = await getAuthAdminRes.json();
  assert(getAuthAdminRes.status === 200, `Admin can perform user lookup by identifier (HTTP 200)`);
  assert(getAuthAdminData.user.id === userB.id, `Admin received target user profile`);

  // 12.8 Server-side Customer Authentication & Fresh Identity Verification
  console.log('\n--- Test 21: Customer Authentication Server-Side Verification (Active, Exists, Fresh State) ---');

  // 21.1 Valid session for existing active user = PASS
  const activeUser = createDbUser({
    name: 'عميل نشط وحقيقي',
    phone: '0774' + Math.floor(1000000 + Math.random() * 9000000),
    accountType: 'individual',
    city: 'بغداد',
    address: 'الكرادة',
  });
  const validActiveToken = signCustomerSession({
    userId: activeUser.id,
    phone: activeUser.phone,
    name: activeUser.name,
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const validActiveReq = new Request('http://localhost:3000/api/auth', {
    headers: { 'Authorization': `Bearer ${validActiveToken}` },
  });
  const authCustomerResult = getAuthenticatedCustomer(validActiveReq);
  assert(authCustomerResult !== null, `Valid session for existing active user returns authenticated identity`);
  assert(authCustomerResult?.id === activeUser.id, `Authenticated identity ID matches active user`);
  assert(authCustomerResult?.isActive === true, `Active user has isActive: true`);

  // 21.2 Valid HMAC signature but non-existent userId in database = authentication fails (null / 401)
  const ghostToken = signCustomerSession({
    userId: 'non-existent-user-uuid-' + Date.now(),
    phone: '07799999999',
    name: 'مستخدم وهمي غير موجود في القاعدة',
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const ghostReq = new Request('http://localhost:3000/api/auth', {
    headers: { 'Authorization': `Bearer ${ghostToken}` },
  });
  const ghostAuthResult = getAuthenticatedCustomer(ghostReq);
  assert(ghostAuthResult === null, `Signed token with non-existent userId rejected by getAuthenticatedCustomer (returns null)`);

  const ghostApiReq = new Request('http://localhost:3000/api/auth', {
    headers: { 'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${ghostToken}` },
  });
  const ghostApiRes = await getAuthRoute(ghostApiReq);
  assert(ghostApiRes.status === 401, `GET /api/auth with token for non-existent user returns HTTP 401`);

  // 21.3 Disabled / inactive customer account = authentication fails (null / 401)
  const disabledUser = createDbUser({
    name: 'عميل معطل إدارياً',
    phone: '0775' + Math.floor(1000000 + Math.random() * 9000000),
    accountType: 'individual',
  });
  // Administratively disable user
  disabledUser.isActive = false;

  const disabledToken = signCustomerSession({
    userId: disabledUser.id,
    phone: disabledUser.phone,
    name: disabledUser.name,
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const disabledReq = new Request('http://localhost:3000/api/auth', {
    headers: { 'Authorization': `Bearer ${disabledToken}` },
  });
  const disabledAuthResult = getAuthenticatedCustomer(disabledReq);
  assert(disabledAuthResult === null, `Disabled user (isActive: false) rejected by getAuthenticatedCustomer (returns null)`);

  const disabledApiReq = new Request('http://localhost:3000/api/auth', {
    headers: { 'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${disabledToken}` },
  });
  const disabledApiRes = await getAuthRoute(disabledApiReq);
  assert(disabledApiRes.status === 401, `GET /api/auth for disabled user returns HTTP 401`);

  // Also check disabled via status: 'disabled'
  const disabledStatusUser = createDbUser({
    name: 'عميل موقوف بالحالة',
    phone: '0776' + Math.floor(1000000 + Math.random() * 9000000),
    accountType: 'individual',
  });
  disabledStatusUser.status = 'disabled';
  const disabledStatusToken = signCustomerSession({
    userId: disabledStatusUser.id,
    phone: disabledStatusUser.phone,
    name: disabledStatusUser.name,
    role: 'customer',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const disabledStatusReq = new Request('http://localhost:3000/api/auth', {
    headers: { 'Authorization': `Bearer ${disabledStatusToken}` },
  });
  assert(getAuthenticatedCustomer(disabledStatusReq) === null, `User with status: 'disabled' rejected by getAuthenticatedCustomer`);

  // 21.4 Administrative update takes effect immediately; does NOT rely on stale token values
  const updatingUser = createDbUser({
    name: 'عميل تم تعديل حسابه إدارياً',
    phone: '0777' + Math.floor(1000000 + Math.random() * 9000000),
    accountType: 'individual',
  });
  // Token issued when user was individual
  const staleToken = signCustomerSession({
    userId: updatingUser.id,
    phone: updatingUser.phone,
    name: 'الاسم القديم في التوكن',
    role: 'customer',
    accountType: 'individual',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  // Admin updates database directly (e.g. upgrades to market / changes role / updates name & pricing tier)
  updatingUser.name = 'الاسم الحديث في قاعدة البيانات';
  updatingUser.accountType = 'market';
  updatingUser.pricingTier = 'gold';

  const freshCheckReq = new Request('http://localhost:3000/api/auth', {
    headers: { 'Authorization': `Bearer ${staleToken}` },
  });
  const freshAuth = getAuthenticatedCustomer(freshCheckReq);
  assert(freshAuth !== null, `getAuthenticatedCustomer succeeds for updated user`);
  assert(freshAuth?.name === 'الاسم الحديث في قاعدة البيانات', `Returns fresh name from DB, not stale token name`);
  assert(freshAuth?.accountType === 'market', `Returns fresh accountType from DB, not stale token value`);
  assert(freshAuth?.pricingTier === 'gold', `Returns fresh pricingTier from DB`);

  // And GET /api/auth returns the fresh trusted DB data
  const freshApiReq = new Request('http://localhost:3000/api/auth', {
    headers: { 'Cookie': `${CUSTOMER_SESSION_COOKIE_NAME}=${staleToken}` },
  });
  const freshApiRes = await getAuthRoute(freshApiReq);
  const freshApiData = await freshApiRes.json();
  assert(freshApiRes.status === 200, `GET /api/auth returns HTTP 200 for updated user`);
  assert(freshApiData.user.accountType === 'market', `API returns fresh DB accountType ('market')`);
  assert(freshApiData.user.name === 'الاسم الحديث في قاعدة البيانات', `API returns fresh DB name`);

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
