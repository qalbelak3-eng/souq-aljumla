import path from 'path';
import os from 'os';
import fs from 'fs';
import postgres from 'postgres';
import EpDefault from 'embedded-postgres';

const Ep = EpDefault.default || EpDefault;
const PORT = 54333;
const tempDir = path.join(os.tmpdir(), 'ep_test_drivers_phase1_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'super-secret-admin-session-token-for-test-32chars';

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
  console.log('   All migrations applied successfully.\n');
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passed++;
    console.log(`[PASS] ${message}`);
  }
}

async function runDriversPhase1Tests() {
  console.log('===============================================================');
  console.log('       PHASE DRIVERS-1: DRIVERS + VEHICLES + AUTH TESTS        ');
  console.log('===============================================================\n');

  // Imports
  const {
    pgGetVehicles,
    pgGetVehicleById,
    pgCreateVehicle,
    pgUpdateVehicle,
    pgDeleteVehicle,
    pgGetDrivers,
    pgGetDriverById,
    pgGetDriverByPhone,
    pgCreateDriver,
    pgUpdateDriver,
    pgDeleteDriver,
  } = await import('./src/lib/postgres-drivers.ts');

  const {
    signAdminSession,
    signDriverSession,
    verifyDriverSessionToken,
    getAuthenticatedDriver,
    DRIVER_SESSION_COOKIE_NAME,
    SESSION_COOKIE_NAME,
  } = await import('./src/lib/auth.ts');

  const { GET: getAdminDrivers, POST: postAdminDrivers } = await import('./src/app/api/admin/drivers/route.ts');
  const { GET: getAdminDriverId, PUT: putAdminDriverId, DELETE: deleteAdminDriverId } = await import(
    './src/app/api/admin/drivers/[id]/route.ts'
  );
  const { GET: getAdminVehicles, POST: postAdminVehicles } = await import('./src/app/api/admin/vehicles/route.ts');
  const { PUT: putAdminVehicleId, DELETE: deleteAdminVehicleId } = await import(
    './src/app/api/admin/vehicles/[id]/route.ts'
  );
  const { POST: postDriverAuth } = await import('./src/app/api/driver/auth/route.ts');

  // Setup Admin Sessions
  const masterAdminToken = signAdminSession({
    userId: 'admin-master',
    username: 'admin',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const masterAdminCookie = `${SESSION_COOKIE_NAME}=${masterAdminToken}`;

  const staffWithoutDriversToken = signAdminSession({
    userId: 'staff-acc-only',
    username: 'accountant_user',
    role: 'staff',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const staffWithoutDriversCookie = `${SESSION_COOKIE_NAME}=${staffWithoutDriversToken}`;

  // Register staff with only accounting permission in memory db for session validation
  const { ensureDbExists } = await import('./src/lib/db.ts');
  const memDb = ensureDbExists();
  if (!memDb.staff) memDb.staff = [];
  memDb.staff.push({
    id: 'staff-acc-only',
    name: 'محاسب فقط',
    username: 'accountant_user',
    role: 'accountant',
    permissions: ['accounting'],
    isActive: true,
  });

  // --- Test 1: Vehicles CRUD in PostgreSQL ---
  console.log('--- Test 1: Vehicles CRUD in PostgreSQL ---');
  const uniquePlate1 = `45211-${Date.now().toString().slice(-4)}`;
  const v1 = await pgCreateVehicle({
    name: 'كيا حمل بيضاء 2023',
    plateNumber: uniquePlate1,
    type: 'كيا حمل',
    modelYear: '2023',
    notes: 'سيارة التوصيل الرئيسية',
  });
  assert(v1 && v1.id, 'Vehicle V1 created successfully in PostgreSQL');
  assert(v1.name === 'كيا حمل بيضاء 2023', 'Vehicle name matches');
  assert(v1.plateNumber === uniquePlate1, 'Vehicle plate number matches');
  assert(v1.isActive === true, 'Vehicle isActive defaults to true');

  // 1.2 Reject duplicate plate number
  let duplicatePlateCaught = false;
  try {
    await pgCreateVehicle({
      name: 'سيارة أخرى بنفس اللوحة',
      plateNumber: uniquePlate1,
      type: 'بيك آب',
    });
  } catch (err) {
    duplicatePlateCaught = true;
    assert(err.message.includes('مسجل مسبقاً'), 'Caught expected duplicate plate error');
  }
  assert(duplicatePlateCaught, 'Duplicate vehicle plate number strictly rejected');

  // 1.3 Update vehicle
  const updatedV1 = await pgUpdateVehicle(v1.id, {
    name: 'كيا حمل بيضاء 2023 محدثة',
    modelYear: '2024',
  });
  assert(updatedV1.name === 'كيا حمل بيضاء 2023 محدثة', 'Vehicle name updated successfully');
  assert(updatedV1.modelYear === '2024', 'Vehicle modelYear updated successfully');

  // 1.4 Get vehicles list
  const vehiclesList = await pgGetVehicles();
  assert(vehiclesList.some((v) => v.id === v1.id), 'V1 found in pgGetVehicles list');

  // 1.5 Create an inactive vehicle for validation testing
  const vDisabled = await pgCreateVehicle({
    name: 'شاحنة معطلة للصيانة',
    plateNumber: `99900-${Date.now().toString().slice(-4)}`,
    isActive: false,
  });
  assert(vDisabled.isActive === false, 'Inactive vehicle created successfully');

  // --- Test 2: Atomic Driver Creation (auth_identities + financial_accounts + drivers) ---
  console.log('\n--- Test 2: Atomic Driver Creation in PostgreSQL ---');

  // 2.0 Vehicle validation on create
  let nonExistentVehCaught = false;
  try {
    await pgCreateDriver({
      name: 'سائق مركبة وهمية',
      phone: '0770' + Math.floor(1000000 + Math.random() * 9000000),
      password: 'StrongPass123!',
      defaultVehicleId: '00000000-0000-0000-0000-000000000000',
    });
  } catch (err) {
    nonExistentVehCaught = true;
    assert(err.message === 'المركبة المحددة غير موجودة', 'pgCreateDriver rejects non-existent defaultVehicleId with exact message');
  }
  assert(nonExistentVehCaught, 'pgCreateDriver rejected non-existent defaultVehicleId');

  let inactiveVehCaught = false;
  try {
    await pgCreateDriver({
      name: 'سائق مركبة معطلة',
      phone: '0770' + Math.floor(1000000 + Math.random() * 9000000),
      password: 'StrongPass123!',
      defaultVehicleId: vDisabled.id,
    });
  } catch (err) {
    inactiveVehCaught = true;
    assert(err.message === 'المركبة المحددة معطلة ولا يمكن إسنادها', 'pgCreateDriver rejects inactive defaultVehicleId with exact message');
  }
  assert(inactiveVehCaught, 'pgCreateDriver rejected inactive defaultVehicleId');

  // 2.0.1 Password validation on create (no default '123' allowed)
  let noPassCaught = false;
  try {
    await pgCreateDriver({
      name: 'سائق بدون باسورد',
      phone: '0770' + Math.floor(1000000 + Math.random() * 9000000),
    });
  } catch (err) {
    noPassCaught = true;
    assert(err.message.includes('لا تقل عن 6 أحرف'), 'pgCreateDriver requires explicit password >= 6 chars');
  }
  assert(noPassCaught, 'pgCreateDriver rejected driver without password');

  let shortPassCaught = false;
  try {
    await pgCreateDriver({
      name: 'سائق باسورد قصير',
      phone: '0770' + Math.floor(1000000 + Math.random() * 9000000),
      password: '123',
    });
  } catch (err) {
    shortPassCaught = true;
    assert(err.message.includes('لا تقل عن 6 أحرف'), 'pgCreateDriver rejects password < 6 chars');
  }
  assert(shortPassCaught, 'pgCreateDriver rejected short password');
  const driverPhone1 = '0770' + Math.floor(1000000 + Math.random() * 9000000);
  const driver1 = await pgCreateDriver({
    name: 'أحمد سائق الكرادة',
    phone: driverPhone1,
    password: 'DriverPass123!',
    defaultVehicleId: v1.id,
    notes: 'سائق المنطقة المركزية',
  });

  assert(driver1 && driver1.id, 'Driver 1 created successfully');
  assert(driver1.authIdentityId, 'Driver 1 has authIdentityId');
  assert(driver1.financialAccountId, 'Driver 1 has financialAccountId');
  assert(driver1.defaultVehicleId === v1.id, 'Driver 1 linked to default vehicle V1');

  // Direct PostgreSQL query verification: verify rows in auth_identities and financial_accounts
  const [authRow] = await sql`SELECT * FROM auth_identities WHERE id = ${driver1.authIdentityId}`;
  assert(authRow !== undefined, 'auth_identities row exists in PostgreSQL');
  assert(authRow.role === 'driver', 'auth_identities role is driver');
  assert(authRow.phone === driverPhone1, 'auth_identities phone matches');
  assert(authRow.password_hash.startsWith('scrypt:'), 'Password is securely hashed with scrypt, NOT plaintext!');

  const [finAccRow] = await sql`SELECT * FROM financial_accounts WHERE id = ${driver1.financialAccountId}`;
  assert(finAccRow !== undefined, 'financial_accounts row exists in PostgreSQL');
  assert(finAccRow.category === 'driver', 'financial_accounts category is driver');
  assert(finAccRow.auth_identity_id === driver1.authIdentityId, 'financial_accounts links to auth_identity_id');
  assert(finAccRow.account_code.startsWith('ACC-'), 'financial_accounts account_code generated via sequence');

  // --- Test 3: Transaction Rollback on Failure ---
  console.log('\n--- Test 3: Transaction Rollback on Failure ---');
  let dupPhoneError = false;
  try {
    await pgCreateDriver({
      name: 'سائق مكرر الرقم',
      phone: driverPhone1, // Duplicate phone
      password: 'some-password',
    });
  } catch (err) {
    dupPhoneError = true;
    assert(err.message.includes('مسجل مسبقاً'), 'Caught duplicate phone error on driver creation');
  }
  assert(dupPhoneError, 'Duplicate driver phone rejected');

  // Verify that no orphaned auth_identity or financial_account was created
  const orphanAuthCount = await sql`SELECT count(*) FROM auth_identities WHERE phone = ${driverPhone1}`;
  assert(parseInt(orphanAuthCount[0].count, 10) === 1, 'Exactly 1 auth_identities record exists (rollback verified, no orphans)');

  const orphanFinCount = await sql`SELECT count(*) FROM financial_accounts WHERE phone = ${driverPhone1}`;
  assert(parseInt(orphanFinCount[0].count, 10) === 1, 'Exactly 1 financial_accounts record exists (rollback verified, no orphans)');

  // --- Test 4: Driver Authentication (POST /api/driver/auth) ---
  console.log('\n--- Test 4: Driver Authentication (POST /api/driver/auth) ---');

  // 4.1 Login with correct password
  const validLoginReq = new Request('http://localhost:3000/api/driver/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: driverPhone1, password: 'DriverPass123!' }),
  });
  const validLoginRes = await postDriverAuth(validLoginReq);
  const validLoginData = await validLoginRes.json();
  assert(validLoginRes.status === 200 && validLoginData.success === true, 'Driver login succeeded with HTTP 200');
  assert(validLoginData.token && typeof validLoginData.token === 'string', 'Session token returned in response');
  assert(
    validLoginRes.headers.get('set-cookie')?.includes(DRIVER_SESSION_COOKIE_NAME),
    'etihad_driver_session cookie set on response'
  );
  assert(validLoginData.driver.id === driver1.id, 'Returned driver id matches');

  // Verify lastLoginAt updated in PostgreSQL
  const [updatedAuth] = await sql`SELECT last_login_at FROM auth_identities WHERE id = ${driver1.authIdentityId}`;
  assert(updatedAuth.last_login_at !== null, 'last_login_at updated in PostgreSQL auth_identities');

  // 4.2 Reject wrong password
  const wrongPassReq = new Request('http://localhost:3000/api/driver/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: driverPhone1, password: 'WrongPassword999!' }),
  });
  const wrongPassRes = await postDriverAuth(wrongPassReq);
  const wrongPassData = await wrongPassRes.json();
  assert(wrongPassRes.status === 401, 'Wrong password rejected with HTTP 401');
  assert(!wrongPassData.token, 'No session token issued for invalid password');

  // 4.3 Reject non-existent phone
  const nonExistentPhoneReq = new Request('http://localhost:3000/api/driver/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '07700000000', password: 'AnyPassword' }),
  });
  const nonExistentPhoneRes = await postDriverAuth(nonExistentPhoneReq);
  assert(nonExistentPhoneRes.status === 401, 'Non-existent phone rejected with HTTP 401');

  // --- Test 5: Server-Side Driver Session & Inactive Driver Rejection ---
  console.log('\n--- Test 5: Server-Side Driver Session & Inactive Driver Rejection ---');
  const validDriverToken = validLoginData.token;

  // 5.1 Active driver session verification
  const activeReq = new Request('http://localhost:3000/api/driver/orders', {
    headers: { Authorization: `Bearer ${validDriverToken}` },
  });
  const authenticatedDriver = await getAuthenticatedDriver(activeReq);
  assert(authenticatedDriver !== null, 'getAuthenticatedDriver returns authenticated driver object');
  assert(authenticatedDriver.id === driver1.id, 'Authenticated driver ID matches driver1');
  assert(authenticatedDriver.isActive === true, 'Driver isActive is true');

  // 5.2 Deactivate driver (isActive: false)
  await pgUpdateDriver(driver1.id, { isActive: false });

  // Now verify that login fails with 403
  const inactiveLoginReq = new Request('http://localhost:3000/api/driver/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: driverPhone1, password: 'DriverPass123!' }),
  });
  const inactiveLoginRes = await postDriverAuth(inactiveLoginReq);
  assert(inactiveLoginRes.status === 403, 'Inactive driver login rejected with HTTP 403');

  // And previously signed token now fails server-side verification!
  const inactiveSessionReq = new Request('http://localhost:3000/api/driver/orders', {
    headers: { Authorization: `Bearer ${validDriverToken}` },
  });
  const inactiveAuthResult = await getAuthenticatedDriver(inactiveSessionReq);
  assert(
    inactiveAuthResult === null,
    'Previously signed token for deactivated driver returns null from getAuthenticatedDriver (PostgreSQL active state enforced!)'
  );

  // Re-activate driver for subsequent tests
  await pgUpdateDriver(driver1.id, { isActive: true });

  // 5.4 Deactivate auth_identities ONLY while driver remains active (drivers.is_active = true)
  console.log('5.4 Testing session failure when auth_identities.is_active = false while drivers.is_active = true');
  await sql`UPDATE auth_identities SET is_active = false WHERE id = ${driver1.authIdentityId}`;

  // Verify drivers.is_active is still true in db
  const [driverCheck] = await sql`SELECT is_active FROM drivers WHERE id = ${driver1.id}`;
  assert(driverCheck.is_active === true, 'drivers table is_active is still true');

  // Verify that old session token now fails server-side verification!
  const authDisabledSessionReq = new Request('http://localhost:3000/api/driver/orders', {
    headers: { Authorization: `Bearer ${validDriverToken}` },
  });
  const authDisabledResult = await getAuthenticatedDriver(authDisabledSessionReq);
  assert(
    authDisabledResult === null,
    'Session strictly fails when auth_identities.is_active = false even if drivers.is_active = true!'
  );

  // Also verify login fails
  const authDisabledLoginReq = new Request('http://localhost:3000/api/driver/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: driverPhone1, password: 'DriverPass123!' }),
  });
  const authDisabledLoginRes = await postDriverAuth(authDisabledLoginReq);
  assert(authDisabledLoginRes.status === 403, 'Login rejected with 403 when auth_identities.is_active = false');

  // Restore auth_identities.is_active = true
  await sql`UPDATE auth_identities SET is_active = true WHERE id = ${driver1.authIdentityId}`;
  const restoredAuthResult = await getAuthenticatedDriver(authDisabledSessionReq);
  assert(restoredAuthResult !== null, 'Session succeeds again after auth_identities restored to active');

  // --- Test 6: Driver Session Isolation (Driver A cannot impersonate Driver B) ---
  console.log('\n--- Test 6: Driver Session Isolation ---');
  const driverPhone2 = '0770' + Math.floor(1000000 + Math.random() * 9000000);
  const driver2 = await pgCreateDriver({
    name: 'كرار سائق المنصور',
    phone: driverPhone2,
    password: 'DriverPass456!',
  });

  const driver2LoginReq = new Request('http://localhost:3000/api/driver/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: driverPhone2, password: 'DriverPass456!' }),
  });
  const driver2LoginRes = await postDriverAuth(driver2LoginReq);
  const driver2LoginData = await driver2LoginRes.json();
  const tokenDriver2 = driver2LoginData.token;

  // Verify Driver 2 token authenticates as Driver 2
  const driver2Req = new Request('http://localhost:3000/api/driver/orders', {
    headers: { Authorization: `Bearer ${tokenDriver2}` },
  });
  const authDriver2 = await getAuthenticatedDriver(driver2Req);
  assert(authDriver2.id === driver2.id, 'Session token authenticates strictly as Driver 2');
  assert(authDriver2.id !== driver1.id, 'Driver 2 cannot authenticate as Driver 1');

  // Tampered or signed token with ghost driver ID fails server verification
  const ghostDriverToken = signDriverSession({
    driverId: '00000000-0000-0000-0000-000000000000',
    phone: '07709999999',
    name: 'سائق شبح غير موجود',
    role: 'driver',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const ghostReq = new Request('http://localhost:3000/api/driver/orders', {
    headers: { Authorization: `Bearer ${ghostDriverToken}` },
  });
  const ghostResult = await getAuthenticatedDriver(ghostReq);
  assert(ghostResult === null, 'Signed token with non-existent driverId in PostgreSQL rejected (returns null)');

  // --- Test 7: Admin APIs Security & Permission Checks ---
  console.log('\n--- Test 7: Admin APIs Security & Permission Checks ---');

  // 7.1 GET /api/admin/drivers without admin session -> 401
  const noSessionDriversReq = new Request('http://localhost:3000/api/admin/drivers');
  const noSessionDriversRes = await getAdminDrivers(noSessionDriversReq);
  assert(noSessionDriversRes.status === 401, 'GET /api/admin/drivers without session rejected with HTTP 401');

  // 7.2 GET /api/admin/drivers with staff lacking 'drivers' permission -> 403
  const forbiddenDriversReq = new Request('http://localhost:3000/api/admin/drivers', {
    headers: { Cookie: staffWithoutDriversCookie },
  });
  const forbiddenDriversRes = await getAdminDrivers(forbiddenDriversReq);
  assert(forbiddenDriversRes.status === 403, 'GET /api/admin/drivers by unauthorized staff rejected with HTTP 403');

  // 7.3 GET /api/admin/drivers with authorized admin -> 200
  const authorizedDriversReq = new Request('http://localhost:3000/api/admin/drivers', {
    headers: { Cookie: masterAdminCookie },
  });
  const authorizedDriversRes = await getAdminDrivers(authorizedDriversReq);
  const authorizedDriversData = await authorizedDriversRes.json();
  assert(authorizedDriversRes.status === 200, 'GET /api/admin/drivers with authorized admin returns HTTP 200');
  assert(Array.isArray(authorizedDriversData.drivers), 'Returns drivers list');
  assert(authorizedDriversData.drivers.some((d) => d.id === driver1.id), 'Driver 1 appears in admin drivers list');

  // 7.4 POST /api/admin/drivers without session -> 401
  const noSessionPostReq = new Request('http://localhost:3000/api/admin/drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'مهاجم مجهول', phone: '07705555555' }),
  });
  assert((await postAdminDrivers(noSessionPostReq)).status === 401, 'POST /api/admin/drivers without session rejected with 401');

  // 7.5 POST /api/admin/drivers with authorized admin -> 200
  const adminNewPhone = '0770' + Math.floor(1000000 + Math.random() * 9000000);
  const authorizedPostReq = new Request('http://localhost:3000/api/admin/drivers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: masterAdminCookie,
    },
    body: JSON.stringify({
      name: 'سائق مضاف عبر لوحة الإدارة',
      phone: adminNewPhone,
      password: 'AdminAdded123!',
      notes: 'تمت إضافته عبر واجهة الإدارة',
    }),
  });
  const authorizedPostRes = await postAdminDrivers(authorizedPostReq);
  const authorizedPostData = await authorizedPostRes.json();
  assert(authorizedPostRes.status === 200 && authorizedPostData.success === true, 'Admin successfully added driver via API (HTTP 200)');
  assert(authorizedPostData.driver.name === 'سائق مضاف عبر لوحة الإدارة', 'Driver created via API matches input');

  // 7.5.1 POST /api/admin/drivers password validation tests
  const postNoPassReq = new Request('http://localhost:3000/api/admin/drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: masterAdminCookie },
    body: JSON.stringify({
      name: 'سائق بدون باسورد عبر API',
      phone: '0770' + Math.floor(1000000 + Math.random() * 9000000),
    }),
  });
  const postNoPassRes = await postAdminDrivers(postNoPassReq);
  const postNoPassData = await postNoPassRes.json();
  assert(postNoPassRes.status === 400, 'POST /api/admin/drivers without password returns HTTP 400');
  assert(postNoPassData.error.includes('6 أحرف'), 'Password requirement message returned');

  const postShortPassReq = new Request('http://localhost:3000/api/admin/drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: masterAdminCookie },
    body: JSON.stringify({
      name: 'سائق باسورد قصير عبر API',
      phone: '0770' + Math.floor(1000000 + Math.random() * 9000000),
      password: '123',
    }),
  });
  const postShortPassRes = await postAdminDrivers(postShortPassReq);
  assert(postShortPassRes.status === 400, 'POST /api/admin/drivers with password < 6 chars returns HTTP 400');

  // 7.5.2 POST /api/admin/drivers vehicle validation tests
  const postBadVehReq = new Request('http://localhost:3000/api/admin/drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: masterAdminCookie },
    body: JSON.stringify({
      name: 'سائق مركبة وهمية عبر API',
      phone: '0770' + Math.floor(1000000 + Math.random() * 9000000),
      password: 'AdminAdded123!',
      defaultVehicleId: '00000000-0000-0000-0000-000000000000',
    }),
  });
  const postBadVehRes = await postAdminDrivers(postBadVehReq);
  const postBadVehData = await postBadVehRes.json();
  assert(postBadVehRes.status === 400, 'POST /api/admin/drivers with non-existent vehicle returns HTTP 400');
  assert(postBadVehData.error === 'المركبة المحددة غير موجودة', 'Returns exact vehicle non-existent error');

  const postInactiveVehReq = new Request('http://localhost:3000/api/admin/drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: masterAdminCookie },
    body: JSON.stringify({
      name: 'سائق مركبة معطلة عبر API',
      phone: '0770' + Math.floor(1000000 + Math.random() * 9000000),
      password: 'AdminAdded123!',
      defaultVehicleId: vDisabled.id,
    }),
  });
  const postInactiveVehRes = await postAdminDrivers(postInactiveVehReq);
  const postInactiveVehData = await postInactiveVehRes.json();
  assert(postInactiveVehRes.status === 400, 'POST /api/admin/drivers with inactive vehicle returns HTTP 400');
  assert(postInactiveVehData.error === 'المركبة المحددة معطلة ولا يمكن إسنادها', 'Returns exact inactive vehicle error');

  // 7.6 PUT /api/admin/drivers/[id] with authorized admin -> 200
  const putDriverReq = new Request(`http://localhost:3000/api/admin/drivers/${driver1.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: masterAdminCookie,
    },
    body: JSON.stringify({
      name: 'أحمد سائق الكرادة المحدث',
      notes: 'ملاحظات معدلة',
    }),
  });
  const putDriverRes = await putAdminDriverId(putDriverReq, { params: { id: driver1.id } });
  const putDriverData = await putDriverRes.json();
  assert(putDriverRes.status === 200 && putDriverData.success === true, 'Admin successfully updated driver via API');
  assert(putDriverData.driver.name === 'أحمد سائق الكرادة المحدث', 'Driver name updated in response');

  // 7.6.1 PUT /api/admin/drivers/[id] vehicle validation
  const putBadVehReq = new Request(`http://localhost:3000/api/admin/drivers/${driver1.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: masterAdminCookie },
    body: JSON.stringify({
      defaultVehicleId: '00000000-0000-0000-0000-000000000000',
    }),
  });
  const putBadVehRes = await putAdminDriverId(putBadVehReq, { params: { id: driver1.id } });
  const putBadVehData = await putBadVehRes.json();
  assert(putBadVehRes.status === 400, 'PUT /api/admin/drivers/[id] with non-existent vehicle returns HTTP 400');
  assert(putBadVehData.error === 'المركبة المحددة غير موجودة', 'Exact non-existent vehicle error returned');

  const putInactiveVehReq = new Request(`http://localhost:3000/api/admin/drivers/${driver1.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: masterAdminCookie },
    body: JSON.stringify({
      defaultVehicleId: vDisabled.id,
    }),
  });
  const putInactiveVehRes = await putAdminDriverId(putInactiveVehReq, { params: { id: driver1.id } });
  const putInactiveVehData = await putInactiveVehRes.json();
  assert(putInactiveVehRes.status === 400, 'PUT /api/admin/drivers/[id] with inactive vehicle returns HTTP 400');
  assert(putInactiveVehData.error === 'المركبة المحددة معطلة ولا يمكن إسنادها', 'Exact inactive vehicle error returned');

  // Direct pgUpdateDriver vehicle checks
  let pgUpdateBadVehCaught = false;
  try {
    await pgUpdateDriver(driver1.id, { defaultVehicleId: '00000000-0000-0000-0000-000000000000' });
  } catch (err) {
    pgUpdateBadVehCaught = true;
    assert(err.message === 'المركبة المحددة غير موجودة', 'pgUpdateDriver throws exact non-existent vehicle message');
  }
  assert(pgUpdateBadVehCaught, 'pgUpdateDriver rejects non-existent vehicle');

  let pgUpdateInactiveVehCaught = false;
  try {
    await pgUpdateDriver(driver1.id, { defaultVehicleId: vDisabled.id });
  } catch (err) {
    pgUpdateInactiveVehCaught = true;
    assert(err.message === 'المركبة المحددة معطلة ولا يمكن إسنادها', 'pgUpdateDriver throws exact inactive vehicle message');
  }
  assert(pgUpdateInactiveVehCaught, 'pgUpdateDriver rejects inactive vehicle');

  // 7.7 GET /api/admin/vehicles permissions
  const noSessionVehReq = new Request('http://localhost:3000/api/admin/vehicles');
  assert((await getAdminVehicles(noSessionVehReq)).status === 401, 'GET /api/admin/vehicles without session rejected with 401');

  const authVehReq = new Request('http://localhost:3000/api/admin/vehicles', {
    headers: { Cookie: masterAdminCookie },
  });
  const authVehRes = await getAdminVehicles(authVehReq);
  assert(authVehRes.status === 200, 'GET /api/admin/vehicles with admin returns HTTP 200');

  // 7.8 POST /api/admin/vehicles with authorized admin
  const newVehPlate = `77889-${Date.now().toString().slice(-4)}`;
  const postVehReq = new Request('http://localhost:3000/api/admin/vehicles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: masterAdminCookie,
    },
    body: JSON.stringify({
      name: 'بيك آب نيسان 2022',
      plateNumber: newVehPlate,
      type: 'بيك آب',
    }),
  });
  const postVehRes = await postAdminVehicles(postVehReq);
  const postVehData = await postVehRes.json();
  assert(postVehRes.status === 200 && postVehData.success === true, 'Admin successfully created vehicle via API');
  const createdVehId = postVehData.vehicle.id;

  // 7.9 PUT & DELETE /api/admin/vehicles/[id]
  const putVehReq = new Request(`http://localhost:3000/api/admin/vehicles/${createdVehId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: masterAdminCookie,
    },
    body: JSON.stringify({ name: 'بيك آب نيسان معدلة' }),
  });
  const putVehRes = await putAdminVehicleId(putVehReq, { params: { id: createdVehId } });
  assert(putVehRes.status === 200, 'PUT /api/admin/vehicles/[id] succeeded with HTTP 200');

  const deleteVehReq = new Request(`http://localhost:3000/api/admin/vehicles/${createdVehId}`, {
    method: 'DELETE',
    headers: { Cookie: masterAdminCookie },
  });
  const deleteVehRes = await deleteAdminVehicleId(deleteVehReq, { params: { id: createdVehId } });
  assert(deleteVehRes.status === 200, 'DELETE /api/admin/vehicles/[id] succeeded with HTTP 200');

  // 7.10 DELETE driver via API
  const deleteDriverReq = new Request(`http://localhost:3000/api/admin/drivers/${driver2.id}`, {
    method: 'DELETE',
    headers: { Cookie: masterAdminCookie },
  });
  const deleteDriverRes = await deleteAdminDriverId(deleteDriverReq, { params: { id: driver2.id } });
  assert(deleteDriverRes.status === 200, 'DELETE /api/admin/drivers/[id] succeeded with HTTP 200');

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
    await runDriversPhase1Tests();
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
