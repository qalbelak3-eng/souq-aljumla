import postgres from 'postgres';

// Ensure DATABASE_URL is set
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL environment variable is required to run this test.');
  console.error('Example: DATABASE_URL="postgres://user:pass@127.0.0.1:5432/dbname" node test-product-phase4.mjs');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 5 });

async function runAll15Tests() {
  console.log('===============================================================');
  console.log('      PHASE 4 & 5: POSTGRESQL 15 MANDATORY TESTS RUNNER        ');
  console.log('===============================================================');

  const [countRowBefore] = await sql`SELECT count(*)::int as count FROM products;`;
  const countBefore = countRowBefore.count;
  console.log(`[Baseline] Existing products count before test: ${countBefore}\n`);

  // Ensure baseline category and company exist
  let [category] = await sql`SELECT id, name FROM categories ORDER BY order_index ASC LIMIT 1;`;
  if (!category) {
    [category] = await sql`
      INSERT INTO categories (name, slug) 
      VALUES ('قسم تجريبي للاختبار', 'test-cat') 
      RETURNING id, name;
    `;
  }

  let [anotherCategory] = await sql`SELECT id, name FROM categories WHERE id != ${category.id} LIMIT 1;`;
  if (!anotherCategory) {
    [anotherCategory] = await sql`
      INSERT INTO categories (name, slug) 
      VALUES ('قسم تجريبي ثاني', 'test-cat-2') 
      RETURNING id, name;
    `;
  }

  let [company] = await sql`SELECT id, name FROM companies LIMIT 1;`;
  if (!company) {
    [company] = await sql`
      INSERT INTO companies (name) 
      VALUES ('شركة تجريبية للاختبار') 
      RETURNING id, name;
    `;
  }

  let [anotherCompany] = await sql`SELECT id, name FROM companies WHERE id != ${company.id} LIMIT 1;`;
  if (!anotherCompany) {
    [anotherCompany] = await sql`
      INSERT INTO companies (name) 
      VALUES ('شركة تجريبية ثانية') 
      RETURNING id, name;
    `;
  }

  console.log(`Using Category A: "${category.name}" (${category.id})`);
  console.log(`Using Category B: "${anotherCategory.name}" (${anotherCategory.id})`);
  console.log(`Using Company A:  "${company.name}" (${company.id})`);
  console.log(`Using Company B:  "${anotherCompany.name}" (${anotherCompany.id})\n`);

  const results = [];
  function record(num, title, pass, detail) {
    results.push({ num, title, pass, detail });
    console.log(`[Test ${num.toString().padStart(2, ' ')}] ${pass ? '✓ PASS' : '✗ FAIL'}: ${title} - ${detail}`);
  }

  let testProdId = null;
  let testProdId2 = null;

  try {
    // -------------------------------------------------------------
    // Test 1: إنشاء منتج بقسم صحيح -> ينجح.
    // -------------------------------------------------------------
    const [t1] = await sql`
      INSERT INTO products (
        name, category_id, boxes_per_carton, items_per_box, pieces_per_carton,
        current_stock_pieces, price, wholesale_price, retail_unit, wholesale_unit
      ) VALUES (
        'TEST_P1', ${category.id}, 2, 10, 20, 60, 25000, 20000, 'قطعة', 'كرتون'
      ) RETURNING id, name, category_id;
    `;
    testProdId = t1.id;
    record(1, 'إنشاء منتج بقسم صحيح', Boolean(t1 && t1.id), `Product ID: ${t1.id}`);

    // -------------------------------------------------------------
    // Test 2: إنشاء منتج بقسم غير موجود -> يفشل ولا ينشئ المنتج.
    // -------------------------------------------------------------
    try {
      const nonExistentCatUuid = '00000000-0000-0000-0000-000000000000';
      await sql`
        INSERT INTO products (
          name, category_id, boxes_per_carton, items_per_box, pieces_per_carton,
          current_stock_pieces, price, wholesale_price, retail_unit, wholesale_unit
        ) VALUES (
          'TEST_P2_FAIL', ${nonExistentCatUuid}, 2, 10, 20, 60, 25000, 20000, 'قطعة', 'كرتون'
        );
      `;
      record(2, 'إنشاء منتج بقسم غير موجود', false, 'Should have failed foreign key constraint');
    } catch (e) {
      record(2, 'إنشاء منتج بقسم غير موجود', true, 'Foreign key / validation rejected insertion');
    }

    // -------------------------------------------------------------
    // Test 3: إنشاء منتج بشركة صحيحة -> ينجح ويرتبط بها.
    // -------------------------------------------------------------
    const [t3] = await sql`
      INSERT INTO products (
        name, category_id, company_id, boxes_per_carton, items_per_box, pieces_per_carton,
        current_stock_pieces, price, wholesale_price, retail_unit, wholesale_unit
      ) VALUES (
        'TEST_P3_COMP', ${category.id}, ${company.id}, 2, 10, 20, 60, 25000, 20000, 'قطعة', 'كرتون'
      ) RETURNING id, company_id;
    `;
    testProdId2 = t3.id;
    record(3, 'إنشاء منتج بشركة صحيحة', t3.company_id === company.id, `Linked Company: ${t3.company_id}`);

    // -------------------------------------------------------------
    // Test 4: إنشاء منتج باسم شركة غير موجود -> يفشل.
    // -------------------------------------------------------------
    try {
      const nonExistentCompUuid = '00000000-0000-0000-0000-000000000000';
      await sql`
        INSERT INTO products (
          name, category_id, company_id, boxes_per_carton, items_per_box, pieces_per_carton,
          current_stock_pieces, price, wholesale_price, retail_unit, wholesale_unit
        ) VALUES (
          'TEST_P4_FAIL', ${category.id}, ${nonExistentCompUuid}, 2, 10, 20, 60, 25000, 20000, 'قطعة', 'كرتون'
        );
      `;
      record(4, 'إنشاء منتج باسم شركة غير موجود', false, 'Should have failed foreign key constraint');
    } catch (e) {
      record(4, 'إنشاء منتج باسم شركة غير موجود', true, 'Foreign key / validation rejected insertion');
    }

    // -------------------------------------------------------------
    // Test 5: إنشاء منتج بدون شركة -> ينجح إذا كانت الشركة اختيارية.
    // -------------------------------------------------------------
    const [t5] = await sql`
      INSERT INTO products (
        name, category_id, company_id, boxes_per_carton, items_per_box, pieces_per_carton,
        current_stock_pieces, price, wholesale_price, retail_unit, wholesale_unit
      ) VALUES (
        'TEST_P5_NO_COMP', ${category.id}, NULL, 2, 10, 20, 60, 25000, 20000, 'قطعة', 'كرتون'
      ) RETURNING id, company_id;
    `;
    record(5, 'إنشاء منتج بدون شركة', t5.company_id === null, `Company ID is NULL: ${t5.company_id === null}`);
    await sql`DELETE FROM products WHERE id = ${t5.id};`;

    // -------------------------------------------------------------
    // Test 6: تعديل المنتج إلى قسم صحيح -> ينجح.
    // -------------------------------------------------------------
    await sql`UPDATE products SET category_id = ${anotherCategory.id} WHERE id = ${testProdId};`;
    const [t6] = await sql`SELECT category_id FROM products WHERE id = ${testProdId};`;
    record(6, 'تعديل المنتج إلى قسم صحيح', t6.category_id === anotherCategory.id, `Updated to: ${t6.category_id}`);

    // -------------------------------------------------------------
    // Test 7: تعديل المنتج إلى قسم غير موجود -> يفشل ولا يغيّر القسم السابق.
    // -------------------------------------------------------------
    try {
      const badCat = '00000000-0000-0000-0000-000000000000';
      await sql`UPDATE products SET category_id = ${badCat} WHERE id = ${testProdId};`;
      record(7, 'تعديل المنتج إلى قسم غير موجود', false, 'Should have failed FK constraint');
    } catch (e) {
      const [t7] = await sql`SELECT category_id FROM products WHERE id = ${testProdId};`;
      const pass = t7.category_id === anotherCategory.id;
      record(7, 'تعديل المنتج إلى قسم غير موجود', pass, `Rejected and preserved previous category: ${t7.category_id}`);
    }

    // -------------------------------------------------------------
    // Test 8: تعديل الشركة إلى شركة صحيحة -> ينجح.
    // -------------------------------------------------------------
    await sql`UPDATE products SET company_id = ${anotherCompany.id} WHERE id = ${testProdId2};`;
    const [t8] = await sql`SELECT company_id FROM products WHERE id = ${testProdId2};`;
    record(8, 'تعديل الشركة إلى شركة صحيحة', t8.company_id === anotherCompany.id, `Updated to: ${t8.company_id}`);

    // -------------------------------------------------------------
    // Test 9: تعديل الشركة باسم غير موجود -> يفشل ويحافظ على الشركة السابقة.
    // -------------------------------------------------------------
    try {
      const badComp = '00000000-0000-0000-0000-000000000000';
      await sql`UPDATE products SET company_id = ${badComp} WHERE id = ${testProdId2};`;
      record(9, 'تعديل الشركة باسم غير موجود', false, 'Should have failed FK constraint');
    } catch (e) {
      const [t9] = await sql`SELECT company_id FROM products WHERE id = ${testProdId2};`;
      const pass = t9.company_id === anotherCompany.id;
      record(9, 'تعديل الشركة باسم غير موجود', pass, `Rejected and preserved previous company: ${t9.company_id}`);
    }

    // -------------------------------------------------------------
    // Test 10: إزالة الشركة عمداً بقيمة فارغة -> company_id = NULL.
    // -------------------------------------------------------------
    await sql`UPDATE products SET company_id = NULL WHERE id = ${testProdId2};`;
    const [t10] = await sql`SELECT company_id FROM products WHERE id = ${testProdId2};`;
    record(10, 'إزالة الشركة عمداً بقيمة فارغة', t10.company_id === null, `Company is NULL: ${t10.company_id === null}`);

    // -------------------------------------------------------------
    // Baseline Setup for Packaging Tests (11, 12, 13)
    // boxes=2, items=10, pieces=20, stock=5 cartons -> current_stock_pieces = 100
    // -------------------------------------------------------------
    const [pkgProd] = await sql`
      INSERT INTO products (
        name, category_id, boxes_per_carton, items_per_box, pieces_per_carton,
        current_stock_pieces, price, wholesale_price, retail_unit, wholesale_unit
      ) VALUES (
        'TEST_PACKAGING', ${category.id}, 2, 10, 20, 100, 20000, 16000, 'قطعة', 'كرتون'
      ) RETURNING id, boxes_per_carton, items_per_box, pieces_per_carton, current_stock_pieces;
    `;
    const pkgProdId = pkgProd.id;

    // -------------------------------------------------------------
    // Test 11: تغيير boxesPerCarton فقط -> current_stock_pieces لا يتغير.
    // -------------------------------------------------------------
    const newBoxes11 = 4;
    const newPieces11 = newBoxes11 * pkgProd.items_per_box; // 4 * 10 = 40
    // Updates only packaging, leaves current_stock_pieces untouched
    await sql`
      UPDATE products SET
        boxes_per_carton = ${newBoxes11},
        pieces_per_carton = ${newPieces11}
      WHERE id = ${pkgProdId};
    `;
    const [t11] = await sql`SELECT boxes_per_carton, pieces_per_carton, current_stock_pieces FROM products WHERE id = ${pkgProdId};`;
    const pass11 = Number(t11.current_stock_pieces) === 100 && Number(t11.pieces_per_carton) === 40;
    record(11, 'تغيير boxesPerCarton فقط -> current_stock_pieces لا يتغير', pass11,
      `pieces_per_carton: ${t11.pieces_per_carton}, current_stock_pieces: ${t11.current_stock_pieces} (displayed cartons: ${100/40})`);

    // -------------------------------------------------------------
    // Test 12: تغيير itemsPerBox فقط -> current_stock_pieces لا يتغير.
    // -------------------------------------------------------------
    const newItems12 = 5;
    const newPieces12 = t11.boxes_per_carton * newItems12; // 4 * 5 = 20
    await sql`
      UPDATE products SET
        items_per_box = ${newItems12},
        pieces_per_carton = ${newPieces12}
      WHERE id = ${pkgProdId};
    `;
    const [t12] = await sql`SELECT items_per_box, pieces_per_carton, current_stock_pieces FROM products WHERE id = ${pkgProdId};`;
    const pass12 = Number(t12.current_stock_pieces) === 100 && Number(t12.pieces_per_carton) === 20;
    record(12, 'تغيير itemsPerBox فقط -> current_stock_pieces لا يتغير', pass12,
      `pieces_per_carton: ${t12.pieces_per_carton}, current_stock_pieces: ${t12.current_stock_pieces} (displayed cartons: ${100/20})`);

    // -------------------------------------------------------------
    // Test 13: تغيير التعبئة + stock معاً -> current_stock_pieces يحسب من القيم الجديدة.
    // -------------------------------------------------------------
    const newBoxes13 = 3;
    const newItems13 = 10;
    const newPieces13 = newBoxes13 * newItems13; // 30
    const newStockCartons13 = 4;
    const expectedStockPieces13 = newStockCartons13 * newPieces13; // 120
    await sql`
      UPDATE products SET
        boxes_per_carton = ${newBoxes13},
        items_per_box = ${newItems13},
        pieces_per_carton = ${newPieces13},
        current_stock_pieces = ${expectedStockPieces13}
      WHERE id = ${pkgProdId};
    `;
    const [t13] = await sql`SELECT boxes_per_carton, items_per_box, pieces_per_carton, current_stock_pieces FROM products WHERE id = ${pkgProdId};`;
    const pass13 = Number(t13.current_stock_pieces) === 120 && Number(t13.pieces_per_carton) === 30;
    record(13, 'تغيير التعبئة + stock معاً -> current_stock_pieces يحسب من القيم الجديدة', pass13,
      `pieces_per_carton: ${t13.pieces_per_carton}, current_stock_pieces: ${t13.current_stock_pieces} (stock: ${120/30} cartons)`);

    await sql`DELETE FROM products WHERE id = ${pkgProdId};`;

    // -------------------------------------------------------------
    // Test 14: CRUD الكامل: Create -> Read -> Update -> Delete
    // -------------------------------------------------------------
    const [crudCreated] = await sql`
      INSERT INTO products (
        name, category_id, boxes_per_carton, items_per_box, pieces_per_carton,
        current_stock_pieces, price, wholesale_price, retail_unit, wholesale_unit
      ) VALUES (
        'TEST_CRUD', ${category.id}, 1, 1, 1, 10, 5000, 4000, 'قطعة', 'كرتون'
      ) RETURNING id;
    `;
    const [crudRead] = await sql`SELECT name, price FROM products WHERE id = ${crudCreated.id};`;
    await sql`UPDATE products SET price = 6000 WHERE id = ${crudCreated.id};`;
    const [crudUpdated] = await sql`SELECT price FROM products WHERE id = ${crudCreated.id};`;
    const delRes = await sql`DELETE FROM products WHERE id = ${crudCreated.id} RETURNING id;`;
    const [crudAfter] = await sql`SELECT id FROM products WHERE id = ${crudCreated.id};`;

    const pass14 = Boolean(
      crudCreated.id &&
      crudRead.name === 'TEST_CRUD' &&
      Number(crudUpdated.price) === 6000 &&
      delRes.length === 1 &&
      !crudAfter
    );
    record(14, 'CRUD الكامل', pass14, 'Create, Read, Update, Delete all succeeded cleanly');

    // -------------------------------------------------------------
    // Test 15: حذف المنتج يحذف عروضه المرتبطة تلقائياً بـ CASCADE
    // -------------------------------------------------------------
    const [offerProd] = await sql`
      INSERT INTO products (
        name, category_id, boxes_per_carton, items_per_box, pieces_per_carton,
        current_stock_pieces, price, wholesale_price, retail_unit, wholesale_unit
      ) VALUES (
        'TEST_CASCADE_OFFER', ${category.id}, 1, 1, 1, 10, 10000, 8000, 'قطعة', 'كرتون'
      ) RETURNING id;
    `;

    const [createdOffer] = await sql`
      INSERT INTO product_offers (
        product_id, original_price, offer_price, discount_percent, badge, end_date, is_active
      ) VALUES (
        ${offerProd.id}, 10000, 8000, 20.00, 'عرض خاص', ${new Date(Date.now() + 7 * 86400000)}, true
      ) RETURNING id;
    `;

    const [beforeDel] = await sql`SELECT count(*)::int as c FROM product_offers WHERE product_id = ${offerProd.id};`;
    await sql`DELETE FROM products WHERE id = ${offerProd.id};`;
    const [afterDel] = await sql`SELECT count(*)::int as c FROM product_offers WHERE product_id = ${offerProd.id};`;

    const pass15 = beforeDel.c === 1 && afterDel.c === 0;
    record(15, 'حذف المنتج يحذف عروضه المرتبطة تلقائياً بـ CASCADE', pass15,
      `Offers before delete: ${beforeDel.c}, Offers after delete: ${afterDel.c} (0 orphans)`);

    // Clean up remaining test products
    if (testProdId) await sql`DELETE FROM products WHERE id = ${testProdId};`;
    if (testProdId2) await sql`DELETE FROM products WHERE id = ${testProdId2};`;

    // Final count check
    const [countRowAfter] = await sql`SELECT count(*)::int as count FROM products;`;
    const countAfter = countRowAfter.count;
    console.log(`\n[Count Check] Products before: ${countBefore} -> after: ${countAfter}`);
    const countMatches = countBefore === countAfter;

    console.log('\n===============================================================');
    console.log('                     15 TESTS SUMMARY                          ');
    console.log('===============================================================');
    const allPassed = results.every(r => r.pass) && countMatches;
    console.log(`Total: 15 | Passed: ${results.filter(r => r.pass).length} | Failed: ${results.filter(r => !r.pass).length}`);
    console.log(`Original Products Untouched: ${countMatches ? 'YES ✓' : 'NO ✗'}`);
    console.log(`OVERALL STATUS: ${allPassed ? 'ALL PASS ✓' : 'SOME FAILED ✗'}`);

  } catch (err) {
    console.error('Fatal error during test run:', err);
  } finally {
    await sql.end();
  }
}

runAll15Tests();
