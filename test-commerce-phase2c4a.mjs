import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';
import {
  pgCreateOrder,
  pgGetOrderById,
  pgCancelOrder,
  pgReturnOrder,
  pgUpdateOrderStatus,
  pgUpdateOrder,
} from './src/lib/postgres-orders.ts';
import { pgCreateProduct, pgCreateCategory } from './src/lib/postgres-catalog.ts';
import { pgCreateCoupon } from './src/lib/postgres-coupons.ts';
import { pgGetAccountCashbackBalance } from './src/lib/postgres-cashback.ts';
import { toCanonicalIraqiPhone } from './src/lib/phone-utils.ts';
import { getDb } from './src/db/client.ts';
import { orders } from './src/db/schema/orders.ts';
import { products } from './src/db/schema/catalog.ts';
import { inventoryMovements } from './src/db/schema/inventory.ts';
import { eq } from 'drizzle-orm';

const Ep = EpDefault.default || EpDefault;
const PORT = 54362;
const tempDir = path.join(os.tmpdir(), 'ep_test_commerce_phase2c4a_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '10';
process.env.DATA_SOURCE_CATALOG_BASE = 'postgres';
process.env.ADMIN_SESSION_SECRET = 'commerce-phase2c4a-test-secret-min-32-chars-long';
process.env.CUSTOMER_SESSION_SECRET = 'commerce-phase2c4a-test-secret-min-32-chars-long';

process.on('unhandledRejection', (reason) => {
  if (reason && reason.code === 'EBUSY') return;
  console.error('Unhandled rejection:', reason);
});

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

  console.log('2. Applying schema and migrations (0000 -> 0017)...');
  const schemaFile = path.resolve(process.cwd(), 'drizzle/0000_magical_warbound.sql');
  await runSqlScript(sql, schemaFile);

  const migrationFiles = fs
    .readdirSync(path.resolve(process.cwd(), 'drizzle'))
    .filter((f) => f.endsWith('.sql') && f !== '0000_magical_warbound.sql')
    .sort();

  for (const m of migrationFiles) {
    const mPath = path.resolve(process.cwd(), 'drizzle', m);
    await runSqlScript(sql, mPath);
  }
  console.log('   All 17 migrations applied.');
}

async function stopDatabase() {
  console.log('\nCleaning up database...');
  if (sql) {
    try {
      await sql.end({ timeout: 5 });
    } catch {}
  }
  if (ep) {
    try {
      await ep.stop();
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 1000));
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}
  console.log('Database stopped and temp dir removed.');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`   ❌ [FAIL] ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`   ✅ [PASS] ${message}`);
}

async function createTestOrder(data = {}) {
  return await pgCreateOrder({
    customer: data.customer || {
      name: 'عميل تجريبي 2C4A',
      phone: '07701112233',
      city: 'بغداد',
      address: 'شارع المنصور',
    },
    items: data.items,
    deliveryFee: data.deliveryFee ?? 5000,
    couponCode: data.couponCode,
    usedCashbackDiscount: data.usedCashbackDiscount,
    paymentMethod: data.paymentMethod || 'cod',
    operator: data.operator || { role: 'customer' },
    idempotencyKey: data.idempotencyKey,
    createAccountIfMissing: true,
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('Running Commerce-2C4A Order Integrity & Concurrency Suite');
  console.log('======================================================\n');

  // Seed Catalog
  const cat = await pgCreateCategory({ name: 'قسم الحلويات 2C4A', slug: 'sweets-2c4a' });
  const prodA = await pgCreateProduct({
    name: 'شوكولاتة البندق A',
    category: cat.id,
    price: 15000,
    costPrice: 9000,
    wholesalePrice: 120000,
    stock: 10,
    retailUnit: 'قطعة',
    wholesaleUnit: 'كرتون',
    unit: 'piece',
    unitLabel: 'قطعة',
    boxesPerCarton: 1,
    itemsPerBox: 10,
    piecesPerCarton: 10,
  });

  const prodB = await pgCreateProduct({
    name: 'بسكويت الكاكاو B',
    category: cat.id,
    price: 10000,
    costPrice: 6000,
    wholesalePrice: 80000,
    stock: 10,
    retailUnit: 'قطعة',
    wholesaleUnit: 'كرتون',
    unit: 'piece',
    unitLabel: 'قطعة',
    boxesPerCarton: 1,
    itemsPerBox: 10,
    piecesPerCarton: 10,
  });

  // [Test 1] Rejection of modifying 'delivered' order
  console.log('\n[Test 1] Testing Rejection of modifying delivered order');
  const orderDelivered = await createTestOrder({
    items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  await pgUpdateOrderStatus(orderDelivered.id, 'processing');
  await pgUpdateOrderStatus(orderDelivered.id, 'shipped');
  await pgUpdateOrderStatus(orderDelivered.id, 'delivered');

  let err1 = null;
  try {
    await pgUpdateOrder(orderDelivered.id, {
      items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 5, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
    });
  } catch (e) {
    err1 = e;
  }
  assert(Boolean(err1), 'Modifying items on delivered order strictly rejected');
  assert(err1?.message.includes('حالة نهائية') || err1?.message.includes('delivered'), 'Error cites terminal delivered status: ' + err1?.message);

  // [Test 2] Rejection of modifying 'cancelled' order
  console.log('\n[Test 2] Testing Rejection of modifying cancelled order');
  const orderCancelled = await createTestOrder({
    items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  await pgCancelOrder(orderCancelled.id, { reason: 'إلغاء لاختبار التعديل' });

  let err2 = null;
  try {
    await pgUpdateOrder(orderCancelled.id, {
      items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 4, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
    });
  } catch (e) {
    err2 = e;
  }
  assert(Boolean(err2), 'Modifying items on cancelled order strictly rejected');
  assert(err2?.message.includes('حالة نهائية') || err2?.message.includes('cancelled'), 'Error cites terminal cancelled status: ' + err2?.message);

  // [Test 3] Rejection of modifying 'returned' order
  console.log('\n[Test 3] Testing Rejection of modifying returned order');
  const orderReturned = await createTestOrder({
    items: [{ productId: prodB.id, name: prodB.name, price: 10000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  await pgUpdateOrderStatus(orderReturned.id, 'processing');
  await pgUpdateOrderStatus(orderReturned.id, 'shipped');
  await pgUpdateOrderStatus(orderReturned.id, 'delivered');
  await pgReturnOrder(orderReturned.id, { reason: 'إرجاع لاختبار التعديل' });

  let err3 = null;
  try {
    await pgUpdateOrder(orderReturned.id, {
      deliveryFee: 10000,
    });
  } catch (e) {
    err3 = e;
  }
  assert(Boolean(err3), 'Modifying fields on returned order strictly rejected');
  assert(err3?.message.includes('حالة نهائية') || err3?.message.includes('returned'), 'Error cites terminal returned status: ' + err3?.message);

  // [Test 4] Inability to transition delivered -> processing
  console.log('\n[Test 4] Testing Inability to transition delivered -> processing');
  let err4 = null;
  try {
    await pgUpdateOrder(orderDelivered.id, {
      status: 'processing',
    });
  } catch (e) {
    err4 = e;
  }
  assert(Boolean(err4), 'Transitioning delivered -> processing is strictly rejected');
  assert(err4?.message.includes('حالة نهائية') || err4?.message.includes('لا يمكن'), 'Error prevents backwards status change: ' + err4?.message);

  // [Test 5] Rejection of forged prices in PUT / pgUpdateOrder
  console.log('\n[Test 5] Testing Forged Price Tampering Protection');
  const orderPending = await createTestOrder({
    items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
    deliveryFee: 5000,
  });

  // Client attempts to tamper with item price to 1 IQD
  const updatedOrder5 = await pgUpdateOrder(orderPending.id, {
    items: [{ productId: prodA.id, name: prodA.name, price: 1, quantity: 2, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });
  assert(updatedOrder5.items[0].price === 15000, 'Tampered price 1 IQD was ignored; authoritative price 15,000 IQD enforced');
  assert(updatedOrder5.subtotal === 30000, 'Subtotal correctly calculated as 30,000 IQD (not 2 IQD)');
  assert(updatedOrder5.total === 35000, 'Total correctly calculated as 35,000 IQD (including 5,000 delivery fee)');

  // [Test 6 & 7] Correct stock difference when increasing quantity
  console.log('\n[Test 6 & 7] Testing Stock Difference When Increasing Quantity (diff < 0)');
  const [stockBeforeIncrease] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  const initialStockA = Number(stockBeforeIncrease.current_stock_pieces);

  // Increase quantity from 2 to 5 pieces (net difference: 3 pieces deducted from stock)
  const updatedOrder6 = await pgUpdateOrder(orderPending.id, {
    items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 5, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });

  const [stockAfterIncrease] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  const stockAfterA = Number(stockAfterIncrease.current_stock_pieces);
  assert(stockAfterA === initialStockA - 3, `Stock decreased exactly by difference of 3 pieces (was ${initialStockA}, now ${stockAfterA})`);
  assert(updatedOrder6.subtotal === 75000, 'Updated subtotal is 75,000 IQD (5 * 15,000)');
  assert(updatedOrder6.total === 80000, 'Updated total is 80,000 IQD');

  const [mvtIncrease] = await sql`
    SELECT movement_type, quantity_pieces 
    FROM inventory_movements 
    WHERE reference_id = ${orderPending.id} AND notes LIKE '%فارق -3%'
    ORDER BY created_at DESC LIMIT 1
  `;
  assert(Boolean(mvtIncrease), 'Inventory movement recorded with exact delta -3 pieces');
  assert(mvtIncrease.movement_type === 'sale', 'Movement type is sale for quantity increase');

  // [Test 8] Correct stock difference when decreasing quantity
  console.log('\n[Test 8] Testing Stock Difference When Decreasing Quantity (diff > 0)');
  // Decrease quantity from 5 down to 1 piece (net difference: 4 pieces returned to stock)
  const updatedOrder8 = await pgUpdateOrder(orderPending.id, {
    items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
  });

  const [stockAfterDecrease] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  const stockRestoredA = Number(stockAfterDecrease.current_stock_pieces);
  assert(stockRestoredA === stockAfterA + 4, `Stock restored exactly by difference of 4 pieces (was ${stockAfterA}, now ${stockRestoredA})`);
  assert(updatedOrder8.subtotal === 15000, 'Updated subtotal is 15,000 IQD (1 * 15,000)');
  assert(updatedOrder8.total === 20000, 'Updated total is 20,000 IQD');

  const [mvtDecrease] = await sql`
    SELECT movement_type, quantity_pieces 
    FROM inventory_movements 
    WHERE reference_id = ${orderPending.id} AND notes LIKE '%فارق 4%'
    ORDER BY created_at DESC LIMIT 1
  `;
  assert(Boolean(mvtDecrease), 'Inventory movement recorded with exact delta +4 pieces');
  assert(mvtDecrease.movement_type === 'customer_return', 'Movement type is customer_return for quantity decrease');

  // [Test 9] Prevention of double-restock
  console.log('\n[Test 9] Testing Prevention of Double-Restock');
  await sql`UPDATE orders SET inventory_restored = true WHERE id = ${orderPending.id}`;
  let err9 = null;
  try {
    await pgUpdateOrder(orderPending.id, {
      items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 10, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
    });
  } catch (e) {
    err9 = e;
  }
  assert(Boolean(err9), 'Modification blocked when inventoryRestored is true');
  assert(err9?.message.includes('تم استرجاع مخزون هذه الطلبية مسبقاً'), 'Error explicitly cites inventory restoration protection');
  await sql`UPDATE orders SET inventory_restored = false WHERE id = ${orderPending.id}`;

  // [Test 10] Consistency of invoice / financial history
  console.log('\n[Test 10] Testing Invoice Totals and Debt Recalculation Consistency');
  const [dbOrderRow10] = await sql`SELECT subtotal, total, remaining_debt_amount FROM orders WHERE id = ${orderPending.id}`;
  assert(Number(dbOrderRow10.subtotal) === 15000, 'DB subtotal matches 15,000 IQD');
  assert(Number(dbOrderRow10.total) === 20000, 'DB total matches 20,000 IQD');
  assert(Number(dbOrderRow10.remaining_debt_amount) === 20000, 'DB remaining debt matches 20,000 IQD');

  // [Test 11] Financial Impact Protection (Coupons & Cashback block item modifications)
  console.log('\n[Test 11] Testing Financial Impact Protection (Coupons/Cashback Block Item Mod)');
  const testCoupon = await pgCreateCoupon({
    code: 'DISC2C4A',
    discountType: 'fixed',
    discountValue: 2000,
    minOrderAmount: 10000,
  });

  const orderWithCoupon = await createTestOrder({
    items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 1, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
    couponCode: 'DISC2C4A',
  });
  assert(orderWithCoupon.discount === 2000, 'Order successfully created with coupon discount 2,000 IQD');

  let err11 = null;
  try {
    await pgUpdateOrder(orderWithCoupon.id, {
      items: [{ productId: prodA.id, name: prodA.name, price: 15000, quantity: 3, saleType: 'piece', unitLabel: 'قطعة', image: '' }],
    });
  } catch (e) {
    err11 = e;
  }
  assert(Boolean(err11), 'Modifying items on order with applied coupon is strictly blocked');
  assert(err11?.message.includes('كود خصم أو رصيد أرباح'), 'Error message informs user to cancel and re-create order: ' + err11?.message);

  // [Test 12] Financial Identity Protection (Cannot modify accountId)
  console.log('\n[Test 12] Testing Financial Identity Protection');
  let err12 = null;
  try {
    await pgUpdateOrder(orderPending.id, {
      accountId: '00000000-0000-0000-0000-000000000099',
    });
  } catch (e) {
    err12 = e;
  }
  assert(Boolean(err12), 'Altering accountId on order is strictly blocked');
  assert(err12?.message.includes('لا يمكن تغيير الحساب المالي'), 'Error preserves financial account binding');

  // [Test 13] Real PostgreSQL Concurrency Deadlock Test: [A, B] vs [B, A]
  console.log('\n[Test 13] Testing Intra-Table Product Lock Deadlock Prevention ([A, B] vs [B, A])');

  // Set initial stock of both products to 100
  await sql`UPDATE products SET current_stock_pieces = 100 WHERE id IN (${prodA.id}, ${prodB.id})`;

  // Prepare two concurrent orders with opposite item ordering:
  // Order 1 has items [prodA (10), prodB (20)]
  // Order 2 has items [prodB (15), prodA (25)]
  const orderPromise1 = createTestOrder({
    customer: { name: 'زبون التزامن 1', phone: '07709991111', city: 'بغداد', address: 'حي الجامعة' },
    items: [
      { productId: prodA.id, name: prodA.name, price: 15000, quantity: 10, saleType: 'piece', unitLabel: 'قطعة', image: '' },
      { productId: prodB.id, name: prodB.name, price: 10000, quantity: 20, saleType: 'piece', unitLabel: 'قطعة', image: '' },
    ],
  });

  const orderPromise2 = createTestOrder({
    customer: { name: 'زبون التزامن 2', phone: '07709992222', city: 'بغداد', address: 'حي المنصور' },
    items: [
      { productId: prodB.id, name: prodB.name, price: 10000, quantity: 15, saleType: 'piece', unitLabel: 'قطعة', image: '' },
      { productId: prodA.id, name: prodA.name, price: 15000, quantity: 25, saleType: 'piece', unitLabel: 'قطعة', image: '' },
    ],
  });

  // Execute both concurrently with Promise.all
  const [resOrder1, resOrder2] = await Promise.all([orderPromise1, orderPromise2]);

  assert(Boolean(resOrder1?.id), 'Concurrent Order 1 [A, B] completed without 40P01 deadlock');
  assert(Boolean(resOrder2?.id), 'Concurrent Order 2 [B, A] completed without 40P01 deadlock');

  const [finalStockA] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodA.id}`;
  const [finalStockB] = await sql`SELECT current_stock_pieces FROM products WHERE id = ${prodB.id}`;

  const expectedStockA = 100 - 10 - 25; // 65 pieces
  const expectedStockB = 100 - 20 - 15; // 65 pieces

  assert(
    Number(finalStockA.current_stock_pieces) === expectedStockA,
    `Final stock of Product A is strictly ${expectedStockA} (Actual: ${finalStockA.current_stock_pieces})`
  );
  assert(
    Number(finalStockB.current_stock_pieces) === expectedStockB,
    `Final stock of Product B is strictly ${expectedStockB} (Actual: ${finalStockB.current_stock_pieces})`
  );

  console.log('\n======================================================');
  console.log('✅ ALL COMMERCE-2C4A INTEGRITY TESTS PASSED!');
  console.log('======================================================\n');
}

async function main() {
  try {
    await startDatabase();
    await runTests();
  } catch (err) {
    console.error('Test suite failed:', err);
    process.exitCode = 1;
  } finally {
    await stopDatabase();
  }
}

main();
