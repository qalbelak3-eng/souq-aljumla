// test-location-phase2.mjs
// Integration tests for Phase Location-2:
// Driver Navigation & Delivery Location Experience
//
// Tests cover:
// 1. Driver A cannot read Driver B's order (object-level isolation)
// 2. Driver sees snapshot coordinates, not live profile address
// 3. Editing SavedAddress after order creation does NOT change snap
// 4. Navigation URL uses lat/lng when available (pure logic test)
// 5. Missing GPS does not break order fetch
// 6. locationDesc reaches driver via customer.address split
// 7. Arrival registration only works in shipped state
// 8. Duplicate arrival registration is idempotent (exactly 1 audit log)
// 9. Inactive driver assignment is rejected by pgAssignOrderDriver
// 10. No internal financial fields leaked to driver order view

import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';

const Ep = EpDefault.default || EpDefault;
const PORT = 54340;
const tempDir = path.join(os.tmpdir(), 'ep_test_location2_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.JWT_SECRET = 'test-secret-location-phase2-xyz';
process.env.ADMIN_SESSION_SECRET = 'super-secret-admin-session-token-for-test-32chars';

let ep = null;
let sql = null;

async function runSqlScript(client, filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes('--> statement-breakpoint')) {
    const stmts = content.split('--> statement-breakpoint');
    for (const stmt of stmts) {
      const trimmed = stmt.trim();
      if (trimmed) await client.unsafe(trimmed);
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

  console.log('2. Applying schema migrations...');
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
  console.log('   All migrations applied.\n');
}

async function teardown() {
  if (sql) await sql.end();
  if (ep) {
    await ep.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignored on Windows if postgres process holds temporary lock
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Replicate the frontend getGoogleMapsLink logic from src/app/driver/page.tsx
function getGoogleMapsLink(order) {
  const lat = order?.customer?.lat;
  const lng = order?.customer?.lng;
  const mapsUrl = order?.customer?.mapsUrl;
  const address = order?.customer?.address || '';
  const city = order?.customer?.city || '';

  if (lat && lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  if (mapsUrl) {
    return mapsUrl;
  }
  const query = encodeURIComponent(`${city} ${address}`.trim());
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}

// Replicate the frontend getLocationDesc helper (splits customer.address on \n)
function getLocationDesc(order) {
  const addr = order?.customer?.address || '';
  const idx = addr.indexOf('\n');
  if (idx === -1) return null;
  return addr.slice(idx + 1) || null;
}

// Replicate the frontend getBaseAddress helper
function getBaseAddress(order) {
  const addr = order?.customer?.address || '';
  const idx = addr.indexOf('\n');
  if (idx === -1) return addr;
  return addr.slice(0, idx);
}

// ─── Main Tests ─────────────────────────────────────────────────────────────

async function runAllLocationPhase2Tests() {
  console.log('\n===============================================================');
  console.log('     LOCATION PHASE-2 INTEGRATION TESTS                       ');
  console.log('===============================================================\n');

  const { pgCreateOrder, pgGetOrderById } = await import('./src/lib/postgres-orders.ts');
  const {
    pgAssignOrderDriver,
    pgGetDriverOrders,
    pgGetDriverOrderById,
    pgStartDriverDelivery,
    pgNotifyDriverArrived,
  } = await import('./src/lib/postgres-delivery.ts');
  const { pgCreateDriver, pgUpdateDriver } = await import('./src/lib/postgres-drivers.ts');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // ─── Seed Reference Data ───────────────────────────────────────────────────
  console.log('--- Seeding reference data ---');

  const [cat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم اختبار موقع-2', 'test-loc2-cat')
    RETURNING id;
  `;
  const [comp] = await sql`
    INSERT INTO companies (name)
    VALUES ('شركة اختبار موقع-2')
    RETURNING id;
  `;
  const [prod] = await sql`
    INSERT INTO products (
      name, category_id, company_id,
      boxes_per_carton, items_per_box, pieces_per_carton,
      current_stock_pieces,
      retail_unit, wholesale_unit,
      price, wholesale_price, piece_cost_price, cost_price
    ) VALUES (
      'منتج اختبار موقع-2', ${cat.id}, ${comp.id},
      1, 1, 1, 9999,
      'قطعة', 'قطعة',
      1000.00, 1000.00, 700.00, 700.00
    ) RETURNING id;
  `;
  const [custAcc] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier, city, address
    ) VALUES (
      'ACC-LOC2-001', 'زبون اختبار موقع-2', '07799887766',
      'customer', 'retail', 'بغداد', 'الكرخ - الدورة'
    ) RETURNING id, name, phone;
  `;

  const adminOperator = {
    userId: 'admin-loc2-test-id',
    username: 'admin',
    role: 'admin',
    name: 'مدير اختبار موقع-2',
  };

  const baseItems = [{
    productId: prod.id,
    name: 'منتج اختبار موقع-2',
    price: 1000,
    quantity: 1,
    saleType: 'retail',
    unitLabel: 'قطعة',
    image: '',
  }];

  // Create Driver A and Driver B
  const driverA = await pgCreateDriver({
    name: 'السائق علي للموقع-2',
    phone: '077' + Math.floor(10000000 + Math.random() * 89999999),
    password: 'DriverPassA!loc2',
    isActive: true,
  });
  const driverB = await pgCreateDriver({
    name: 'السائق كريم للموقع-2',
    phone: '077' + Math.floor(10000000 + Math.random() * 89999999),
    password: 'DriverPassB!loc2',
    isActive: true,
  });

  console.log(`  Seeded: DriverA=${driverA.id}, DriverB=${driverB.id}\n`);

  // =========================================================================
  // Test 1: Driver A cannot read Driver B's order
  // =========================================================================
  console.log('--- Test 1: Driver A cannot read Driver B\'s order ---');
  {
    const orderA = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: 'الكرخ - الدورة',
        lat: 33.3152,
        lng: 44.3661,
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });
    const orderB = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: 'الرصافة - السعدون',
        lat: 33.3406,
        lng: 44.4009,
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });

    await pgAssignOrderDriver({ orderId: orderA.id, driverId: driverA.id, adminOperator });
    await pgAssignOrderDriver({ orderId: orderB.id, driverId: driverB.id, adminOperator });

    // Driver A's order list must NOT include orderB
    const driverAOrders = await pgGetDriverOrders(driverA.id);
    const allA = [...(driverAOrders.activeOrders || []), ...(driverAOrders.historyOrders || [])];
    assert(!allA.some((o) => o.id === orderB.id), 'Driver A order list does NOT contain Driver B\'s order');

    // pgGetDriverOrderById with wrong driver returns null
    const sneakPeek = await pgGetDriverOrderById(driverA.id, orderB.id);
    assert(sneakPeek === null || sneakPeek === undefined, 'pgGetDriverOrderById(driverA, orderB_id) returns null (object isolation)');
  }

  // =========================================================================
  // Test 2: Driver sees snapshot coordinates, not live profile
  // =========================================================================
  console.log('\n--- Test 2: Driver sees snapshot coordinates (immutable snapshot) ---');
  {
    const snapLat = 33.3152;
    const snapLng = 44.3661;
    const order = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: 'الكرخ - حي الأمين',
        lat: snapLat,
        lng: snapLng,
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });

    await pgAssignOrderDriver({ orderId: order.id, driverId: driverA.id, adminOperator });

    // Simulate profile change: update financial_accounts address (live data)
    await sql`
      UPDATE financial_accounts
      SET address = 'عنوان مختلف تماماً - بعد التعديل'
      WHERE id = ${custAcc.id}
    `;

    // Driver fetches orders — snapshot coordinates must be unchanged
    const result = await pgGetDriverOrders(driverA.id);
    const fetched = [...(result.activeOrders || []), ...(result.historyOrders || [])]
      .find((o) => o.id === order.id);

    assert(fetched !== undefined, 'Order found in driver orders after profile change');
    assert(fetched.customer.lat === snapLat, `customer.lat still ${snapLat} (snapshot preserved, not live)`);
    assert(fetched.customer.lng === snapLng, `customer.lng still ${snapLng} (snapshot preserved, not live)`);

    // Restore custAcc address for later tests
    await sql`
      UPDATE financial_accounts
      SET address = 'الكرخ - الدورة'
      WHERE id = ${custAcc.id}
    `;
  }

  // =========================================================================
  // Test 3: Editing financial_accounts address after creation does NOT change snap
  // =========================================================================
  console.log('\n--- Test 3: deliveryAddressSnap is immutable after order creation ---');
  {
    const originalAddress = 'بغداد - الكرخ - حي الجهاد';
    const order = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: originalAddress,
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });

    // Directly update financial_accounts
    await sql`
      UPDATE financial_accounts
      SET address = 'عنوان بعد التعديل - لا يجب أن يتغير الطلب القديم'
      WHERE id = ${custAcc.id}
    `;

    await pgAssignOrderDriver({ orderId: order.id, driverId: driverA.id, adminOperator });
    const result = await pgGetDriverOrders(driverA.id);
    const fetched = [...(result.activeOrders || []), ...(result.historyOrders || [])]
      .find((o) => o.id === order.id);

    assert(fetched !== undefined, 'Order found after financial_accounts address update');
    assert(
      fetched.customer.address === originalAddress || fetched.customer.address.startsWith(originalAddress),
      `customer.address still equals original snap "${originalAddress}" (not updated live address)`
    );

    // Restore
    await sql`UPDATE financial_accounts SET address = 'الكرخ - الدورة' WHERE id = ${custAcc.id}`;
  }

  // =========================================================================
  // Test 4: Navigation URL uses lat/lng when available (pure frontend logic)
  // =========================================================================
  console.log('\n--- Test 4: getGoogleMapsLink uses lat/lng first, then mapsUrl, then text ---');
  {
    // Case A: lat + lng → GPS link
    const withGps = { customer: { lat: 33.3152, lng: 44.3661, mapsUrl: 'https://maps.app.goo.gl/fake', address: 'العراق' } };
    const gpsUrl = getGoogleMapsLink(withGps);
    assert(
      gpsUrl.includes('destination=33.3152,44.3661'),
      'GPS URL contains destination=lat,lng (not mapsUrl)'
    );
    assert(!gpsUrl.includes('goo.gl'), 'GPS URL does NOT fall back to mapsUrl when coords available');

    // Case B: mapsUrl only (no coords)
    const withMapsUrl = { customer: { mapsUrl: 'https://maps.app.goo.gl/shortlink', address: 'العراق' } };
    const mapsUrlResult = getGoogleMapsLink(withMapsUrl);
    assert(mapsUrlResult === 'https://maps.app.goo.gl/shortlink', 'Falls back to mapsUrl when no coords');

    // Case C: text address only
    const withText = { customer: { address: 'الكرادة خارج - بغداد', city: 'بغداد' } };
    const textUrl = getGoogleMapsLink(withText);
    assert(textUrl.includes('destination=') && textUrl.includes(encodeURIComponent('الكرادة')), 'Falls back to text destination when no GPS or mapsUrl');
  }

  // =========================================================================
  // Test 5: Missing GPS does not break order fetch
  // =========================================================================
  console.log('\n--- Test 5: Order without GPS fetched without errors ---');
  {
    const order = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: 'المنصور - بغداد',
        // No lat, lng, or mapsUrl
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });

    await pgAssignOrderDriver({ orderId: order.id, driverId: driverA.id, adminOperator });
    const result = await pgGetDriverOrders(driverA.id);
    const fetched = [...(result.activeOrders || []), ...(result.historyOrders || [])]
      .find((o) => o.id === order.id);

    assert(fetched !== undefined, 'Order without GPS fetched without error');
    assert(
      fetched.customer.lat === undefined || fetched.customer.lat === null,
      'customer.lat is absent/null when no GPS provided'
    );
    assert(
      fetched.customer.lng === undefined || fetched.customer.lng === null,
      'customer.lng is absent/null when no GPS provided'
    );
  }

  // =========================================================================
  // Test 6: locationDesc reaches driver via customer.address split
  // =========================================================================
  console.log('\n--- Test 6: locationDesc embedded in deliveryAddressSnap and reachable via split ---');
  {
    const baseAddr = 'الكرادة خارج - بغداد';
    const locationDesc = 'بجانب المسجد الكبير';
    const order = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: baseAddr,
        locationDesc,
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });

    await pgAssignOrderDriver({ orderId: order.id, driverId: driverA.id, adminOperator });
    const result = await pgGetDriverOrders(driverA.id);
    const fetched = [...(result.activeOrders || []), ...(result.historyOrders || [])]
      .find((o) => o.id === order.id);

    assert(fetched !== undefined, 'Order with locationDesc found in driver orders');
    assert(
      fetched.customer.address.includes('\n'),
      'customer.address contains \\n separator between base address and locationDesc'
    );

    const desc = getLocationDesc(fetched);
    const base = getBaseAddress(fetched);
    assert(desc === locationDesc, `getLocationDesc extracts "${locationDesc}" correctly`);
    assert(base === baseAddr, `getBaseAddress extracts "${baseAddr}" correctly`);
  }

  // =========================================================================
  // Test 7: Arrival registration only works in shipped state
  // =========================================================================
  console.log('\n--- Test 7: pgNotifyDriverArrived requires shipped status ---');
  {
    const order = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: 'الجادرية - بغداد',
        lat: 33.2778,
        lng: 44.3661,
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });

    await pgAssignOrderDriver({ orderId: order.id, driverId: driverA.id, adminOperator });
    // Order is now 'processing' — arrival should be rejected

    let threwOnProcessing = false;
    try {
      await pgNotifyDriverArrived(driverA.id, order.id, {
        id: driverA.id,
        name: driverA.name,
        phone: driverA.phone,
      });
    } catch (err) {
      threwOnProcessing = true;
      assert(
        err.message.includes('قبل بدء التوصيل وخروج الطلبية'),
        'Error message mentions "قبل بدء التوصيل وخروج الطلبية" for processing state'
      );
    }
    assert(threwOnProcessing, 'pgNotifyDriverArrived throws when order is in processing state');

    // Transition to shipped
    await pgStartDriverDelivery(driverA.id, order.id, {
      id: driverA.id,
      name: driverA.name,
      phone: driverA.phone,
    });

    const [statusCheck] = await sql`SELECT status FROM orders WHERE id = ${order.id}`;
    assert(statusCheck.status === 'shipped', 'Order transitioned to shipped after pgStartDriverDelivery');

    // Now arrival should succeed
    const arriveResult = await pgNotifyDriverArrived(driverA.id, order.id, {
      id: driverA.id,
      name: driverA.name,
      phone: driverA.phone,
    });
    assert(arriveResult.success === true, 'pgNotifyDriverArrived succeeds when order is shipped');
    assert(arriveResult.alreadyArrived === false, 'First call: alreadyArrived is false');
  }

  // =========================================================================
  // Test 8: Duplicate arrival registration is idempotent (exactly 1 audit log)
  // =========================================================================
  console.log('\n--- Test 8: Duplicate arrival registration is idempotent ---');
  {
    const order = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: 'الأعظمية - بغداد',
        lat: 33.3784,
        lng: 44.3903,
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });

    await pgAssignOrderDriver({ orderId: order.id, driverId: driverA.id, adminOperator });
    await pgStartDriverDelivery(driverA.id, order.id, {
      id: driverA.id,
      name: driverA.name,
      phone: driverA.phone,
    });

    const driverInfo = { id: driverA.id, name: driverA.name, phone: driverA.phone };

    // First call
    const first = await pgNotifyDriverArrived(driverA.id, order.id, driverInfo);
    assert(first.success === true, 'First arrival call succeeds');
    assert(first.alreadyArrived === false, 'First call: alreadyArrived=false');

    // Second call — must be idempotent
    const second = await pgNotifyDriverArrived(driverA.id, order.id, driverInfo);
    assert(second.success === true, 'Second (duplicate) arrival call returns success');
    assert(second.alreadyArrived === true, 'Second call: alreadyArrived=true (idempotent)');

    // Exactly 1 audit log entry
    const auditLogs = await sql`
      SELECT id FROM audit_logs
      WHERE target_id = ${order.id} AND action_type = 'delivery_arrived'
    `;
    assert(auditLogs.length === 1, 'Exactly 1 delivery_arrived audit log row (not duplicated)');
  }

  // =========================================================================
  // Test 9: Inactive driver is rejected by pgAssignOrderDriver
  // =========================================================================
  console.log('\n--- Test 9: Inactive driver assignment rejected by pgAssignOrderDriver ---');
  {
    const order = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: 'الشعب - بغداد',
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });

    // Deactivate driver B
    await pgUpdateDriver(driverB.id, { isActive: false });

    let threwOnInactive = false;
    try {
      await pgAssignOrderDriver({ orderId: order.id, driverId: driverB.id, adminOperator });
    } catch (err) {
      threwOnInactive = true;
      assert(
        err.message.includes('معطل') || err.message.includes('غير نشط') || err.message.includes('inactive'),
        `Error message indicates driver is inactive: "${err.message}"`
      );
    }
    assert(threwOnInactive, 'pgAssignOrderDriver throws when driver is inactive');

    // Restore driver B
    await pgUpdateDriver(driverB.id, { isActive: true });
  }

  // =========================================================================
  // Test 10: No internal financial fields leaked to driver order view
  // =========================================================================
  console.log('\n--- Test 10: No financial fields leaked in driver order view ---');
  {
    const order = await pgCreateOrder({
      customer: {
        name: custAcc.name,
        phone: custAcc.phone,
        city: 'بغداد',
        address: 'الكرادة داخل - بغداد',
        lat: 33.3152,
        lng: 44.3661,
        isGuest: false,
        userId: custAcc.id,
      },
      items: baseItems,
      paymentMethod: 'cod',
      accountId: custAcc.id,
    });

    await pgAssignOrderDriver({ orderId: order.id, driverId: driverA.id, adminOperator });
    const result = await pgGetDriverOrders(driverA.id);
    const fetched = [...(result.activeOrders || []), ...(result.historyOrders || [])]
      .find((o) => o.id === order.id);

    assert(fetched !== undefined, 'Order found in driver view for financial leak test');

    // Check top-level order object
    const forbiddenTopLevel = ['costPrice', 'cost_price', 'profitMargin', 'profit', 'buyingCost', 'unitCostSnap'];
    for (const key of forbiddenTopLevel) {
      assert(
        !(key in fetched),
        `Top-level field "${key}" NOT present in driver order view`
      );
    }

    // Check customer sub-object
    if (fetched.customer) {
      for (const key of forbiddenTopLevel) {
        assert(
          !(key in fetched.customer),
          `customer.${key} NOT present in driver order view`
        );
      }
    }

    // Check items array
    if (fetched.items && fetched.items.length > 0) {
      for (const item of fetched.items) {
        assert(item.costPrice === undefined, 'item.costPrice NOT present in driver order view');
        assert(item.unitCostSnap === undefined, 'item.unitCostSnap NOT present in driver order view');
      }
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n===============================================================');
  console.log(`  LOCATION PHASE-2 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

(async () => {
  try {
    await setup();
    await runAllLocationPhase2Tests();
  } catch (err) {
    console.error('\n[FATAL]', err.message || err);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
})();
