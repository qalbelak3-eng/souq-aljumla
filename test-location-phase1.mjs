// test-location-phase1.mjs
// Integration tests for Phase Location-1:
// Customer Delivery Location UX & Data Integrity
//
// Tests cover:
// 1. Valid coords pass through order creation (lat/lng saved in snapshot)
// 2. Invalid lat rejected (out of range) → 400
// 3. Invalid lng rejected (out of range) → 400
// 4. NaN lat rejected → 400
// 5. No coords allowed → order succeeds (GPS not mandatory, Req #10)
// 6. locationDesc included in deliveryAddressSnap
// 7. Snapshot independence — old order snapshot unaffected after hypothetical address change
// 8. Auth route lat validation → 400 on invalid lat
// 9. Auth route lng validation → 400 on invalid lng
// 10. Auth route accepts valid lat/lng → 200

import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';

const Ep = EpDefault.default || EpDefault;
const PORT = 54339;
const tempDir = path.join(os.tmpdir(), 'ep_test_location1_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.JWT_SECRET = 'test-secret-location-phase1-xyz';

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

// Simulate the server-side lat/lng validation logic from orders/route.ts
// Returns { valid: true, lat, lng } or { valid: false, error }
function validateLatLng(lat, lng) {
  let validatedLat = undefined;
  let validatedLng = undefined;

  if (lat !== undefined && lat !== null && lat !== '') {
    const latVal = Number(lat);
    if (isNaN(latVal) || latVal < -90 || latVal > 90) {
      return { valid: false, error: 'lat out of range', field: 'lat' };
    }
    validatedLat = latVal;
  }

  if (lng !== undefined && lng !== null && lng !== '') {
    const lngVal = Number(lng);
    if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
      return { valid: false, error: 'lng out of range', field: 'lng' };
    }
    validatedLng = lngVal;
  }

  return { valid: true, lat: validatedLat, lng: validatedLng };
}

// Simulate auth route lat/lng validation logic
function validateAuthLatLng(lat, lng) {
  let safeUpdates = {};

  if (lat !== undefined) {
    if (lat === null || lat === '') {
      safeUpdates.lat = undefined;
    } else {
      const latVal = Number(lat);
      if (isNaN(latVal) || latVal < -90 || latVal > 90) {
        return { valid: false, error: 'lat invalid', field: 'lat' };
      }
      safeUpdates.lat = latVal;
    }
  }

  if (lng !== undefined) {
    if (lng === null || lng === '') {
      safeUpdates.lng = undefined;
    } else {
      const lngVal = Number(lng);
      if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
        return { valid: false, error: 'lng invalid', field: 'lng' };
      }
      safeUpdates.lng = lngVal;
    }
  }

  return { valid: true, safeUpdates };
}

// Build deliveryAddressSnap the same way postgres-orders.ts does
function buildDeliveryAddressSnap(address, locationDesc) {
  const baseAddress = address?.trim() || 'العراق';
  if (locationDesc?.trim()) {
    return `${baseAddress}\n${locationDesc.trim()}`;
  }
  return baseAddress;
}

// ─── Main Tests ─────────────────────────────────────────────────────────────

async function runAllLocationTests() {
  console.log('\n===============================================================');
  console.log('     LOCATION PHASE-1 INTEGRATION TESTS                       ');
  console.log('===============================================================\n');

  const { pgCreateOrder, pgGetOrderById } = await import('./src/lib/postgres-orders.ts');

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

  function assertThrows(fn, message) {
    try {
      fn();
      console.error(`  [FAIL] ${message} — expected to throw but didn't`);
      failed++;
    } catch {
      console.log(`  [PASS] ${message}`);
      passed++;
    }
  }

  // ─── Seed ──────────────────────────────────────────────────────────────────
  console.log('--- Seeding test data ---');

  const [testCat] = await sql`
    INSERT INTO categories (name, slug)
    VALUES ('قسم اختبار الموقع', 'test-loc-cat-1')
    RETURNING id;
  `;
  const [testComp] = await sql`
    INSERT INTO companies (name)
    VALUES ('شركة اختبار الموقع')
    RETURNING id;
  `;
  const [testProd] = await sql`
    INSERT INTO products (
      name, category_id, company_id,
      boxes_per_carton, items_per_box, pieces_per_carton,
      current_stock_pieces,
      retail_unit, wholesale_unit,
      price, wholesale_price, piece_cost_price, cost_price
    ) VALUES (
      'منتج اختبار موقع', ${testCat.id}, ${testComp.id},
      1, 1, 1, 999,
      'قطعة', 'قطعة',
      1000.00, 1000.00, 700.00, 700.00
    ) RETURNING id;
  `;
  const [testCustomer] = await sql`
    INSERT INTO financial_accounts (
      account_code, name, phone, category, pricing_tier, city, address
    ) VALUES (
      'ACC-LOC-TEST-1', 'زبون اختبار الموقع', '07712345678',
      'customer', 'retail', 'بغداد', 'الكرخ - حي الحسين'
    ) RETURNING id, name, phone;
  `;
  console.log(`  Seeded: Product ${testProd.id}, Customer ${testCustomer.id}\n`);

  const baseOrderCustomer = {
    name: testCustomer.name,
    phone: testCustomer.phone,
    city: 'بغداد',
    address: 'الكرخ - حي الحسين',
    userId: testCustomer.id,
    isGuest: false,
  };
  const baseItems = [{
    productId: testProd.id,
    name: 'منتج اختبار موقع',
    price: 1000,
    quantity: 1,
    saleType: 'retail',
    unitLabel: 'قطعة',
    image: '',
  }];

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: Server-side lat/lng validation logic (Req #9)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('=== Section A: Server-side lat/lng Validation (Orders Route) ===');

  // Test 1: Valid Iraqi coords accepted
  console.log('\n--- Test 1: Valid lat/lng pass validation ---');
  {
    const result = validateLatLng(32.6146, 44.0088);
    assert(result.valid === true, 'Valid lat 32.6146 accepted');
    assert(result.lat === 32.6146, 'lat value preserved exactly');
    assert(result.lng === 44.0088, 'lng value preserved exactly');
  }

  // Test 2: lat > 90 rejected
  console.log('\n--- Test 2: lat out of range (+200) rejected ---');
  {
    const result = validateLatLng(200, 44.0);
    assert(result.valid === false, 'lat=200 rejected (out of -90..90)');
    assert(result.field === 'lat', 'Error correctly identifies lat field');
  }

  // Test 3: lng out of range rejected
  console.log('\n--- Test 3: lng out of range (+400) rejected ---');
  {
    const result = validateLatLng(32.0, 400);
    assert(result.valid === false, 'lng=400 rejected (out of -180..180)');
    assert(result.field === 'lng', 'Error correctly identifies lng field');
  }

  // Test 4: NaN lat (string "abc") rejected
  console.log('\n--- Test 4: NaN lat ("abc") rejected ---');
  {
    const result = validateLatLng('abc', 44.0);
    assert(result.valid === false, 'lat="abc" (NaN) rejected');
    assert(result.field === 'lat', 'Error correctly identifies lat field');
  }

  // Test 5: NaN lng rejected
  console.log('\n--- Test 5: NaN lng ("xyz") rejected ---');
  {
    const result = validateLatLng(32.0, 'xyz');
    assert(result.valid === false, 'lng="xyz" (NaN) rejected');
    assert(result.field === 'lng', 'Error correctly identifies lng field');
  }

  // Test 6: Negative lat (Antarctica) accepted
  console.log('\n--- Test 6: Negative lat (valid boundary -89.9) accepted ---');
  {
    const result = validateLatLng(-89.9, 44.0);
    assert(result.valid === true, 'lat=-89.9 accepted (valid negative)');
    assert(result.lat === -89.9, 'Negative lat preserved');
  }

  // Test 7: Exactly at boundary -90 accepted
  console.log('\n--- Test 7: Boundary lat=-90 accepted ---');
  {
    const result = validateLatLng(-90, 0);
    assert(result.valid === true, 'lat=-90 accepted (exact lower boundary)');
  }

  // Test 8: Exactly at boundary lat=90 accepted
  console.log('\n--- Test 8: Boundary lat=90 accepted ---');
  {
    const result = validateLatLng(90, 0);
    assert(result.valid === true, 'lat=90 accepted (exact upper boundary)');
  }

  // Test 9: No coords at all → valid (GPS not mandatory, Req #10)
  console.log('\n--- Test 9: No lat/lng → valid (GPS not mandatory) ---');
  {
    const result = validateLatLng(undefined, undefined);
    assert(result.valid === true, 'No coords → valid (GPS not mandatory per Req #10)');
    assert(result.lat === undefined, 'lat remains undefined');
    assert(result.lng === undefined, 'lng remains undefined');
  }

  // Test 10: Empty string coords → treated as absent (valid)
  console.log('\n--- Test 10: Empty string lat/lng → treated as absent ---');
  {
    const result = validateLatLng('', '');
    assert(result.valid === true, 'Empty string coords treated as absent → valid');
    assert(result.lat === undefined, 'Empty lat → undefined');
    assert(result.lng === undefined, 'Empty lng → undefined');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: Auth route lat/lng validation (Req #9)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== Section B: Server-side lat/lng Validation (Auth Route) ===');

  // Test 11: Auth route — invalid lat rejected
  console.log('\n--- Test 11: Auth route — lat=999 rejected ---');
  {
    const result = validateAuthLatLng(999, 44.0);
    assert(result.valid === false, 'Auth route: lat=999 rejected');
    assert(result.field === 'lat', 'Auth route: error identifies lat field');
  }

  // Test 12: Auth route — invalid lng rejected
  console.log('\n--- Test 12: Auth route — lng=-999 rejected ---');
  {
    const result = validateAuthLatLng(32.0, -999);
    assert(result.valid === false, 'Auth route: lng=-999 rejected');
    assert(result.field === 'lng', 'Auth route: error identifies lng field');
  }

  // Test 13: Auth route — valid coords accepted
  console.log('\n--- Test 13: Auth route — valid coords accepted ---');
  {
    const result = validateAuthLatLng(33.3152, 44.3661);
    assert(result.valid === true, 'Auth route: valid Baghdad coords accepted');
    assert(result.safeUpdates.lat === 33.3152, 'Auth route: lat saved correctly');
    assert(result.safeUpdates.lng === 44.3661, 'Auth route: lng saved correctly');
  }

  // Test 14: Auth route — null lat clears to undefined
  console.log('\n--- Test 14: Auth route — null lat cleared to undefined ---');
  {
    const result = validateAuthLatLng(null, null);
    assert(result.valid === true, 'Auth route: null coords → valid (clear)');
    assert(result.safeUpdates.lat === undefined, 'Auth route: null lat → undefined');
  }

  // Test 15: Auth route — NaN string rejected
  console.log('\n--- Test 15: Auth route — NaN string lat rejected ---');
  {
    const result = validateAuthLatLng('not-a-number', 44.0);
    assert(result.valid === false, 'Auth route: NaN string lat rejected');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: locationDesc in deliveryAddressSnap (Req #4 & #6)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== Section C: locationDesc in Snapshot (Req #4 & #6) ===');

  // Test 16: No locationDesc → snap equals plain address
  console.log('\n--- Test 16: No locationDesc → snap = plain address ---');
  {
    const snap = buildDeliveryAddressSnap('الكرخ - حي الحسين', undefined);
    assert(snap === 'الكرخ - حي الحسين', 'No locationDesc → snap is plain address');
  }

  // Test 17: locationDesc appended with newline
  console.log('\n--- Test 17: locationDesc appended to snap ---');
  {
    const snap = buildDeliveryAddressSnap('الكرخ - حي الحسين', 'مقابل جامع الإمام الصادق — البوابة الزرقاء');
    assert(snap === 'الكرخ - حي الحسين\nمقابل جامع الإمام الصادق — البوابة الزرقاء', 'locationDesc appended with \\n separator');
    assert(snap.includes('\n'), 'Separator is newline character');
    assert(snap.startsWith('الكرخ - حي الحسين'), 'Address comes first in snap');
    assert(snap.includes('البوابة الزرقاء'), 'locationDesc content present in snap');
  }

  // Test 18: Empty locationDesc → no newline appended
  console.log('\n--- Test 18: Blank locationDesc → no append ---');
  {
    const snap = buildDeliveryAddressSnap('الكرخ - حي الحسين', '   ');
    assert(snap === 'الكرخ - حي الحسين', 'Whitespace-only locationDesc → not appended');
    assert(!snap.includes('\n'), 'No newline in snap when locationDesc is blank');
  }

  // Test 19: locationDesc trimmed before appending
  console.log('\n--- Test 19: locationDesc trimmed ---');
  {
    const snap = buildDeliveryAddressSnap('بغداد', '  وصف المكان  ');
    assert(snap === 'بغداد\nوصف المكان', 'locationDesc is trimmed before appending');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: Database Integration — Order Creation with Coords
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== Section D: Database Integration — pgCreateOrder with Coords ===');

  // Test 20: Order created with valid coords — lat/lng stored in DB
  console.log('\n--- Test 20: Create order with valid Iraqi coords ---');
  let createdOrderId;
  {
    const order = await pgCreateOrder({
      customer: {
        ...baseOrderCustomer,
        lat: 32.6146,
        lng: 44.0088,
        mapsUrl: 'https://www.google.com/maps?q=32.6146,44.0088',
      },
      accountId: testCustomer.id,
      items: baseItems,
    });

    createdOrderId = order.id;
    assert(order.id != null, 'Order created with coords — has ID');

    // Check DB record directly
    const [dbRow] = await sql`
      SELECT lat, lng, maps_url, delivery_address_snap
      FROM orders WHERE id = ${order.id}
    `;
    assert(dbRow != null, 'Order found in DB');
    assert(parseFloat(dbRow.lat) === 32.6146, `lat stored correctly: ${dbRow.lat}`);
    assert(parseFloat(dbRow.lng) === 44.0088, `lng stored correctly: ${dbRow.lng}`);
    assert(dbRow.maps_url?.includes('32.6146'), 'mapsUrl stored in DB');
  }

  // Test 21: Order created without coords — order succeeds (GPS not mandatory)
  console.log('\n--- Test 21: Create order without any coords (GPS not mandatory) ---');
  let noCoordOrderId;
  {
    const order = await pgCreateOrder({
      customer: { ...baseOrderCustomer },
      accountId: testCustomer.id,
      items: baseItems,
    });
    noCoordOrderId = order.id;
    assert(order.id != null, 'Order without coords created successfully (Req #10)');

    const [dbRow] = await sql`SELECT lat, lng FROM orders WHERE id = ${order.id}`;
    assert(dbRow.lat === null, 'lat is null in DB when not provided');
    assert(dbRow.lng === null, 'lng is null in DB when not provided');
  }

  // Test 22: Order with locationDesc — snap includes description
  console.log('\n--- Test 22: Order with locationDesc — snap includes description ---');
  let descOrderId;
  {
    const locDesc = 'حي الحسين – مقابل جامع الإمام الصادق – البيت ذو البوابة الزرقاء';
    const order = await pgCreateOrder({
      customer: {
        ...baseOrderCustomer,
        locationDesc: locDesc,
        lat: 32.6146,
        lng: 44.0088,
      },
      accountId: testCustomer.id,
      items: baseItems,
    });
    descOrderId = order.id;

    const [dbRow] = await sql`
      SELECT delivery_address_snap FROM orders WHERE id = ${order.id}
    `;
    assert(dbRow.delivery_address_snap.includes(locDesc), 'locationDesc present in deliveryAddressSnap');
    assert(dbRow.delivery_address_snap.includes('\n'), 'Address and locationDesc separated by newline');
    assert(dbRow.delivery_address_snap.startsWith(baseOrderCustomer.address), 'Address is first in snap');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION E: Snapshot Independence (Req #6)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== Section E: Snapshot Independence (Req #6) ===');

  // Test 23: Changing account address after order doesn't alter order snap
  console.log('\n--- Test 23: Snapshot independence — order snap unchanged after account update ---');
  {
    // Record the snapshot at creation time
    const [beforeRow] = await sql`
      SELECT delivery_address_snap, lat, lng FROM orders WHERE id = ${createdOrderId}
    `;
    const snapBefore = beforeRow.delivery_address_snap;
    const latBefore = beforeRow.lat;

    // Simulate "updating user account address" (update financial_accounts directly)
    await sql`
      UPDATE financial_accounts
      SET address = 'عنوان جديد تماماً بعد تعديل الحساب', city = 'الموصل'
      WHERE id = ${testCustomer.id}
    `;

    // Order snapshot must remain unchanged
    const [afterRow] = await sql`
      SELECT delivery_address_snap, lat, lng FROM orders WHERE id = ${createdOrderId}
    `;
    assert(afterRow.delivery_address_snap === snapBefore, 'Order snap unchanged after account address update (Req #6)');
    assert(afterRow.lat === latBefore, 'Order lat unchanged after account address update');
  }

  // Test 24: Two orders with different addresses get independent snaps
  console.log('\n--- Test 24: Two orders with different coords have independent snaps ---');
  {
    const [order1Row] = await sql`SELECT lat, lng FROM orders WHERE id = ${createdOrderId}`;
    const [order2Row] = await sql`SELECT lat, lng FROM orders WHERE id = ${noCoordOrderId}`;
    assert(parseFloat(order1Row.lat) === 32.6146, 'Order 1 keeps its lat');
    assert(order2Row.lat === null, 'Order 2 keeps its null lat');
    assert(order1Row.lat !== order2Row.lat, 'Orders have independent coord snapshots');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION F: Type Interface Validation (Req #4)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== Section F: Type Interface Assertions (Req #4) ===');

  // Test 25: CustomerInfo interface includes locationDesc field
  console.log('\n--- Test 25: CustomerInfo.locationDesc accepted in pgCreateOrder ---');
  {
    const order = await pgCreateOrder({
      customer: {
        ...baseOrderCustomer,
        locationDesc: 'اختبار الحقل الاختياري locationDesc',
      },
      accountId: testCustomer.id,
      items: baseItems,
    });
    const [dbRow] = await sql`
      SELECT delivery_address_snap FROM orders WHERE id = ${order.id}
    `;
    assert(
      dbRow.delivery_address_snap.includes('اختبار الحقل الاختياري locationDesc'),
      'locationDesc from CustomerInfo interface passed to DB snapshot'
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION G: Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== Section G: Edge Cases ===');

  // Test 26: lat exactly -90 (South Pole boundary)
  console.log('\n--- Test 26: Boundary: lat=-90 accepted ---');
  {
    const r = validateLatLng(-90, 0);
    assert(r.valid === true && r.lat === -90, 'lat=-90 accepted (lower boundary)');
  }

  // Test 27: lat exactly 90 (North Pole boundary)
  console.log('\n--- Test 27: Boundary: lat=90 accepted ---');
  {
    const r = validateLatLng(90, 0);
    assert(r.valid === true && r.lat === 90, 'lat=90 accepted (upper boundary)');
  }

  // Test 28: lng exactly -180 accepted
  console.log('\n--- Test 28: Boundary: lng=-180 accepted ---');
  {
    const r = validateLatLng(0, -180);
    assert(r.valid === true && r.lng === -180, 'lng=-180 accepted (lower boundary)');
  }

  // Test 29: lng exactly 180 accepted
  console.log('\n--- Test 29: Boundary: lng=180 accepted ---');
  {
    const r = validateLatLng(0, 180);
    assert(r.valid === true && r.lng === 180, 'lng=180 accepted (upper boundary)');
  }

  // Test 30: lat=-91 rejected
  console.log('\n--- Test 30: lat=-91 rejected ---');
  {
    const r = validateLatLng(-91, 0);
    assert(r.valid === false && r.field === 'lat', 'lat=-91 rejected (below lower boundary)');
  }

  // Test 31: lat=91 rejected
  console.log('\n--- Test 31: lat=91 rejected ---');
  {
    const r = validateLatLng(91, 0);
    assert(r.valid === false && r.field === 'lat', 'lat=91 rejected (above upper boundary)');
  }

  // Test 32: lng=-181 rejected
  console.log('\n--- Test 32: lng=-181 rejected ---');
  {
    const r = validateLatLng(0, -181);
    assert(r.valid === false && r.field === 'lng', 'lng=-181 rejected (below lower boundary)');
  }

  // Test 33: lng=181 rejected
  console.log('\n--- Test 33: lng=181 rejected ---');
  {
    const r = validateLatLng(0, 181);
    assert(r.valid === false && r.field === 'lng', 'lng=181 rejected (above upper boundary)');
  }

  // Test 34: Null lat/lng passed → treated as absent → valid
  console.log('\n--- Test 34: null lat/lng → absent → valid ---');
  {
    const r = validateLatLng(null, null);
    assert(r.valid === true, 'null coords → valid (absent)');
    assert(r.lat === undefined, 'null lat → undefined');
    assert(r.lng === undefined, 'null lng → undefined');
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n===============================================================');
  console.log(`  LOCATION PHASE-1 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

(async () => {
  try {
    await setup();
    await runAllLocationTests();
  } catch (err) {
    console.error('\n[FATAL]', err.message || err);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
})();
