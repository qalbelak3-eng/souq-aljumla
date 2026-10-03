import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import postgres from 'postgres';
import { default as epModule } from 'embedded-postgres';

const Ep = epModule.default || epModule;
const PORT = 54378;
const tempDir = path.join(os.tmpdir(), 'ep_test_company_categories_' + Date.now());
const dbUrl = `postgres://postgres:password@127.0.0.1:${PORT}/postgres`;
process.env.DATABASE_URL = dbUrl;
process.env.DB_POOL_MAX = '5';
process.env.ADMIN_SESSION_SECRET = 'company-categories-test-secret-32-chars-long!';

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

async function main() {
  console.log('===============================================================');
  console.log('       COMPANY_CATEGORIES SCHEMA & LIFECYCLE TESTS             ');
  console.log('===============================================================');

  console.log('1. Starting embedded PostgreSQL on port', PORT);
  ep = new Ep({ databaseDir: tempDir, port: PORT });
  await ep.initialise();
  await ep.start();

  sql = postgres(dbUrl, { max: 5 });

  console.log('2. Fresh DB: Applying all migrations (0000 -> 0024)...');
  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  const migrations = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join('drizzle', f));

  assert(migrations.some(m => m.includes('0024_company_categories')), '0024_company_categories.sql exists in migration list');

  for (const m of migrations) {
    const fullPath = path.resolve(process.cwd(), m);
    await runSqlScript(sql, fullPath);
  }
  console.log('   ✅ All migrations 0000 -> 0024 applied successfully.');

  // Import catalog functions after setting env vars
  const {
    pgGetCategories,
    pgCreateCategory,
    pgDeleteCategory,
    pgGetCompanies,
    pgCreateCompany,
    pgUpdateCompany,
    pgDeleteCompany,
  } = await import('./src/lib/postgres-catalog.ts');

  // --- Test 1: Verify Schema & Table Constraints in PostgreSQL ---
  console.log('\n--- Test 1: Schema Structure & Constraint Introspection ---');
  const [tableExists] = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'company_categories' AND table_schema = 'public';
  `;
  assert(tableExists, 'company_categories table exists in public schema');

  // Verify PK
  const pkCols = await sql`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'company_categories' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position;
  `;
  const pkColNames = pkCols.map(r => r.column_name);
  assert(pkColNames.length === 2, 'Primary key is composite with 2 columns');
  assert(pkColNames[0] === 'company_id' && pkColNames[1] === 'category_id', 'Composite PK is (company_id, category_id)');

  // Verify Foreign Key Constraints with CASCADE
  const fkConstraints = await sql`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'company_categories';
  `;

  const companyFk = fkConstraints.find(f => f.column_name === 'company_id');
  assert(companyFk, 'FK on company_id exists');
  assert(companyFk.foreign_table_name === 'companies', 'company_id references companies');
  assert(companyFk.delete_rule === 'CASCADE', 'company_id FK has ON DELETE CASCADE');

  const categoryFk = fkConstraints.find(f => f.column_name === 'category_id');
  assert(categoryFk, 'FK on category_id exists');
  assert(categoryFk.foreign_table_name === 'categories', 'category_id references categories');
  assert(categoryFk.delete_rule === 'CASCADE', 'category_id FK has ON DELETE CASCADE');

  // Verify Index on category_id
  const [catIndex] = await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'company_categories' AND indexname = 'idx_company_categories_category_id';
  `;
  assert(catIndex, 'idx_company_categories_category_id index exists');
  console.log('   ✅ Table schema, composite PK, CASCADE FKs, and category index verified');

  // --- Test 2: Seed Categories and Create Company with Multiple Categories ---
  console.log('\n--- Test 2: Multi-Category Association on Creation ---');
  const cat1 = await pgCreateCategory({ name: 'ألبان وجبن تجريبي' });
  const cat2 = await pgCreateCategory({ name: 'مشروبات وعصائر تجريبي' });
  const cat3 = await pgCreateCategory({ name: 'حلويات ومعجنات تجريبي' });

  const companyA = await pgCreateCompany({
    name: 'شركة الاتحاد للأغذية',
    categories: [cat1.name, cat2.name],
  });

  assert(companyA.id, 'Company A created');
  assert(companyA.categories.length === 2, 'Company A has 2 categories in returned object');

  // Check actual DB rows
  const assocRowsA = await sql`
    SELECT * FROM company_categories WHERE company_id = ${companyA.id};
  `;
  assert(assocRowsA.length === 2, 'Exactly 2 junction rows in company_categories for Company A');
  console.log('   ✅ Company created with multiple categories successfully');

  // --- Test 3: Read Relations & Filtering ---
  console.log('\n--- Test 3: Reading Companies & Multi-Category Filtering ---');
  const allCompanies = await pgGetCompanies();
  const foundA = allCompanies.find(c => c.id === companyA.id);
  assert(foundA, 'Company A returned by pgGetCompanies');
  assert(foundA.categories.includes(cat1.name), 'Company A includes Cat 1');
  assert(foundA.categories.includes(cat2.name), 'Company A includes Cat 2');
  assert(foundA.category === cat1.name || foundA.category === cat2.name, 'Legacy category property populated');

  const filteredCat1 = await pgGetCompanies(cat1.name);
  assert(filteredCat1.some(c => c.id === companyA.id), 'Company A found when filtering by Cat 1');

  const filteredCat3 = await pgGetCompanies(cat3.name);
  assert(!filteredCat3.some(c => c.id === companyA.id), 'Company A NOT returned when filtering by unlinked Cat 3');
  console.log('   ✅ Multi-category reading and filtering verified');

  // --- Test 4: Update Relations (Array & Single Compatibility) ---
  console.log('\n--- Test 4: Updating Category Associations ---');
  // Update to Cat2 and Cat3
  const updatedA = await pgUpdateCompany(companyA.id, {
    categories: [cat2.name, cat3.name],
  });
  assert(updatedA.categories.includes(cat2.name), 'Updated company contains Cat 2');
  assert(updatedA.categories.includes(cat3.name), 'Updated company contains Cat 3');
  assert(!updatedA.categories.includes(cat1.name), 'Old Cat 1 was removed');

  const updatedRowsA = await sql`
    SELECT category_id FROM company_categories WHERE company_id = ${companyA.id};
  `;
  const updatedCatIds = updatedRowsA.map(r => r.category_id);
  assert(!updatedCatIds.includes(cat1.id), 'Cat 1 deleted from junction table');
  assert(updatedCatIds.includes(cat2.id), 'Cat 2 present in junction table');
  assert(updatedCatIds.includes(cat3.id), 'Cat 3 present in junction table');

  // Backward compatibility: update via single `category`
  const singleUpdatedA = await pgUpdateCompany(companyA.id, {
    category: cat1.name,
  });
  assert(singleUpdatedA.categories.length === 1 && singleUpdatedA.categories[0] === cat1.name, 'Single category update synced to categories array');
  console.log('   ✅ Updating relations with array and backward-compatible single category verified');

  // --- Test 5: Cascade Deletion on Company Delete ---
  console.log('\n--- Test 5: Cascade Deletion when Company is Deleted ---');
  const companyB = await pgCreateCompany({
    name: 'شركة تجريبية للحذف',
    categories: [cat1.name, cat3.name],
  });
  const bRowsBefore = await sql`SELECT * FROM company_categories WHERE company_id = ${companyB.id};`;
  assert(bRowsBefore.length === 2, 'Company B has 2 junction rows');

  await pgDeleteCompany(companyB.id);

  const bRowsAfter = await sql`SELECT * FROM company_categories WHERE company_id = ${companyB.id};`;
  assert(bRowsAfter.length === 0, 'Junction rows automatically removed by ON DELETE CASCADE');

  const [cat1StillExists] = await sql`SELECT id FROM categories WHERE id = ${cat1.id};`;
  assert(cat1StillExists, 'Category 1 remains intact after company deletion');
  console.log('   ✅ ON DELETE CASCADE when company deleted verified');

  // --- Test 6: Cascade Deletion on Category Delete ---
  console.log('\n--- Test 6: Cascade Deletion when Category is Deleted ---');
  const catDel = await pgCreateCategory({ name: 'قسم تجريبي سيتم حذفه' });
  const companyC = await pgCreateCompany({
    name: 'شركة مرتبطة بقسم محذوف',
    categories: [catDel.name, cat2.name],
  });

  const cRowsBefore = await sql`SELECT * FROM company_categories WHERE company_id = ${companyC.id};`;
  assert(cRowsBefore.length === 2, 'Company C has 2 junction rows');

  // Delete category
  const delRes = await pgDeleteCategory(catDel.id);
  assert(delRes.success === true, 'Category deleted successfully');

  const cRowsAfter = await sql`SELECT * FROM company_categories WHERE company_id = ${companyC.id};`;
  assert(cRowsAfter.length === 1, 'Junction row for deleted category was cascaded away');
  assert(cRowsAfter[0].category_id === cat2.id, 'Remaining junction row is for Cat 2');

  const [companyCStillExists] = await sql`SELECT id FROM companies WHERE id = ${companyC.id};`;
  assert(companyCStillExists, 'Company C remains intact after category deletion');
  console.log('   ✅ ON DELETE CASCADE when category deleted verified');

  // --- Test 7: Idempotent Re-execution of 0024 (Adopt-Existing Safety & Zero Data Loss) ---
  console.log('\n--- Test 7: Re-running 0024 on Existing Data (Zero Data Loss) ---');
  // Count junction rows before re-running migration
  const [countBefore] = await sql`SELECT count(*)::int as count FROM company_categories;`;
  assert(countBefore.count > 0, 'company_categories has existing rows');

  // Re-run 0024 migration
  const migration0024Path = path.resolve(process.cwd(), 'drizzle', '0024_company_categories.sql');
  await runSqlScript(sql, migration0024Path);

  // Count junction rows after re-running migration
  const [countAfter] = await sql`SELECT count(*)::int as count FROM company_categories;`;
  assert(countAfter.count === countBefore.count, 'Exact same count of rows preserved; ZERO DATA LOSS');

  // Verify Company A and Company C relations still intact
  const companiesPostMigration = await pgGetCompanies();
  const compAPost = companiesPostMigration.find(c => c.id === companyA.id);
  assert(compAPost, 'Company A intact post-migration re-run');
  assert(compAPost.categories.includes(cat1.name), 'Company A relations completely intact');
  console.log('   ✅ Migration 0024 re-executed safely: idempotent, adopt-existing safe, zero data loss');

  console.log('\n===============================================================');
  console.log('   ALL COMPANY_CATEGORIES LIFECYCLE TESTS PASSED! (7/7)        ');
  console.log('===============================================================');
}

main()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    if (sql) {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
    if (ep) {
      await ep.stop().catch(() => {});
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });
