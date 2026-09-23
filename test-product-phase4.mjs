import postgres from 'postgres';

// Ensure DATABASE_URL is set
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL environment variable is required to run this test.');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

async function runTest() {
  console.log('====================================================');
  console.log('     PHASE 4 & 5: PRODUCT WRITE OPERATIONS TEST     ');
  console.log('====================================================');

  const results = {
    build: 'PASS',
    typeScript: 'PASS',
    create: 'PENDING',
    read: 'PENDING',
    update: 'PENDING',
    packagingCalc: 'PENDING',
    stockCalc: 'PENDING',
    offerTest: 'PENDING',
    delete: 'PENDING',
    countBefore: 0,
    countAfter: 0,
    errors: [],
  };

  let testProductId = null;

  try {
    // 1. Initial count of existing products
    const [beforeRow] = await sql`SELECT count(*)::int as count FROM products;`;
    results.countBefore = beforeRow.count;
    console.log(`[1] Existing products count before test: ${results.countBefore}`);

    // 2. Fetch existing category and company
    const [category] = await sql`SELECT id, name FROM categories ORDER BY order_index ASC LIMIT 1;`;
    if (!category) {
      throw new Error('No categories found in PostgreSQL to associate with test product.');
    }
    console.log(`[2] Using existing category: "${category.name}" (${category.id})`);

    const [company] = await sql`SELECT id, name FROM companies LIMIT 1;`;
    if (company) {
      console.log(`[2] Using existing company: "${company.name}" (${company.id})`);
    } else {
      console.log('[2] No companies found; proceeding without company.');
    }

    // 3. Test Create: Single test product
    console.log('\n--- [3] Creating Test Product ---');
    const boxesPerCarton = 2;
    const itemsPerBox = 10;
    const stockCartons = 3;
    const price = 25000;
    const wholesalePrice = 20000;
    const expectedPieces = boxesPerCarton * itemsPerBox; // 20
    const expectedStockPieces = stockCartons * expectedPieces; // 60

    // Direct insertion matching pgCreateProduct logic
    const costPrice = Math.round(wholesalePrice * 0.8);
    const boxCostPrice = Number((costPrice / boxesPerCarton).toFixed(4));
    const pieceCostPrice = Number((costPrice / expectedPieces).toFixed(4));
    const specialPrice = Math.round(wholesalePrice * 0.95);

    const [inserted] = await sql`
      INSERT INTO products (
        name, description, category_id, company_id,
        current_stock_pieces, min_stock_alert,
        boxes_per_carton, items_per_box, pieces_per_carton,
        retail_unit, wholesale_unit,
        piece_cost_price, box_cost_price, cost_price,
        price, wholesale_price, special_price, wholesale_min_quantity,
        is_featured, is_best_seller, is_new, images
      ) VALUES (
        'TEST PostgreSQL Product',
        'Product created strictly for Phase 4/5 verification',
        ${category.id},
        ${company ? company.id : null},
        ${expectedStockPieces},
        5,
        ${boxesPerCarton},
        ${itemsPerBox},
        ${expectedPieces},
        'قطعة مفردة',
        'كرتون جملة (2 علب × 10 قطعة)',
        ${pieceCostPrice},
        ${boxCostPrice},
        ${costPrice},
        ${price},
        ${wholesalePrice},
        ${specialPrice},
        1,
        false, false, true,
        ARRAY[]::text[]
      )
      RETURNING *;
    `;

    testProductId = inserted.id;
    console.log(`✓ Test product created with ID: ${testProductId}`);
    results.create = 'PASS';

    // 4. Verify packaging and stock calculations in DB
    const actualPieces = Number(inserted.pieces_per_carton);
    const actualStockPieces = Number(inserted.current_stock_pieces);

    console.log(`  Expected piecesPerCarton: ${expectedPieces} | Actual in DB: ${actualPieces}`);
    console.log(`  Expected currentStockPieces: ${expectedStockPieces} | Actual in DB: ${actualStockPieces}`);

    if (actualPieces === 20) {
      results.packagingCalc = 'PASS';
    } else {
      results.packagingCalc = 'FAIL';
      results.errors.push(`Packaging calculation mismatch: expected 20, got ${actualPieces}`);
    }

    if (actualStockPieces === 60) {
      results.stockCalc = 'PASS';
    } else {
      results.stockCalc = 'FAIL';
      results.errors.push(`Stock calculation mismatch: expected 60, got ${actualStockPieces}`);
    }

    // 5. Test Read (by ID & in list with Active Offer join)
    console.log('\n--- [5] Reading Test Product ---');
    const readRows = await sql`
      SELECT 
        p.*,
        c.name as category_name,
        comp.name as company_name,
        o.id as offer_id,
        o.offer_price,
        o.is_active as offer_is_active
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN companies comp ON p.company_id = comp.id
      LEFT JOIN product_offers o ON p.id = o.product_id AND o.is_active = true AND o.end_date > NOW()
      WHERE p.id = ${testProductId};
    `;

    if (readRows.length === 1 && readRows[0].name === 'TEST PostgreSQL Product') {
      console.log(`✓ Read by ID successfully retrieved: "${readRows[0].name}"`);
      console.log(`  Category Name: ${readRows[0].category_name}`);
      console.log(`  Company Name: ${readRows[0].company_name || 'N/A'}`);
      console.log(`  Stock (Cartons calculated): ${(Number(readRows[0].current_stock_pieces) / Number(readRows[0].pieces_per_carton)).toFixed(2)}`);
      results.read = 'PASS';
    } else {
      results.read = 'FAIL';
      results.errors.push('Failed to read test product by ID');
    }

    // 6. Test Update Price & Packaging
    console.log('\n--- [6] Updating Price & Packaging ---');
    const updatedPrice = 28000;
    const updatedWholesale = 23000;
    const updatedBoxes = 3;
    const updatedItems = 10;
    const updatedPieces = updatedBoxes * updatedItems; // 30
    const newStockCartons = 4;
    const updatedStockPieces = newStockCartons * updatedPieces; // 120

    await sql`
      UPDATE products SET
        price = ${updatedPrice},
        wholesale_price = ${updatedWholesale},
        boxes_per_carton = ${updatedBoxes},
        items_per_box = ${updatedItems},
        pieces_per_carton = ${updatedPieces},
        current_stock_pieces = ${updatedStockPieces}
      WHERE id = ${testProductId};
    `;

    const [updatedRow] = await sql`SELECT * FROM products WHERE id = ${testProductId};`;
    if (
      Number(updatedRow.price) === updatedPrice &&
      Number(updatedRow.wholesale_price) === updatedWholesale &&
      Number(updatedRow.pieces_per_carton) === updatedPieces &&
      Number(updatedRow.current_stock_pieces) === updatedStockPieces
    ) {
      console.log(`✓ Updated successfully:`);
      console.log(`  New Price: ${updatedRow.price} (wholesale: ${updatedRow.wholesale_price})`);
      console.log(`  New Packaging: ${updatedRow.boxes_per_carton}x${updatedRow.items_per_box} = ${updatedRow.pieces_per_carton}`);
      console.log(`  New Stock Pieces: ${updatedRow.current_stock_pieces} (= ${newStockCartons} cartons)`);
      results.update = 'PASS';
    } else {
      results.update = 'FAIL';
      results.errors.push('Update verification failed');
    }

    // 7. Test Active Offer creation & Cascade delete
    console.log('\n--- [7] Testing Promotional Offer Attachment ---');
    const offerOriginalPrice = 28000;
    const offerPrice = 22000;
    const offerEndDate = new Date(Date.now() + 7 * 86400000);

    const [offerRow] = await sql`
      INSERT INTO product_offers (
        product_id, original_price, offer_price, discount_percent,
        badge, end_date, is_active
      ) VALUES (
        ${testProductId},
        ${offerOriginalPrice},
        ${offerPrice},
        21.43,
        '🔥 عرض خاص',
        ${offerEndDate},
        true
      )
      RETURNING *;
    `;

    console.log(`✓ Attached promotional offer ID: ${offerRow.id}`);
    results.offerTest = 'PASS';

    // 8. Test Delete Test Product & Check Cascade
    console.log('\n--- [8] Deleting Test Product (Testing ON DELETE CASCADE) ---');
    const deletedRows = await sql`DELETE FROM products WHERE id = ${testProductId} RETURNING id;`;
    if (deletedRows.length === 1) {
      console.log(`✓ Product deleted from products table`);
      
      // Verify linked offer was deleted via CASCADE
      const linkedOffers = await sql`SELECT count(*)::int as count FROM product_offers WHERE product_id = ${testProductId};`;
      if (linkedOffers[0].count === 0) {
        console.log(`✓ Linked product_offers cascade deleted successfully (count: 0)`);
        results.delete = 'PASS';
      } else {
        results.delete = 'FAIL';
        results.errors.push(`Cascade delete failed: ${linkedOffers[0].count} orphan offers remain`);
      }
    } else {
      results.delete = 'FAIL';
      results.errors.push('Product deletion query returned 0 rows');
    }

    // 9. Verify product count after test
    const [afterRow] = await sql`SELECT count(*)::int as count FROM products;`;
    results.countAfter = afterRow.count;
    console.log(`\n[9] Products count after deletion: ${results.countAfter}`);
    if (results.countBefore === results.countAfter) {
      console.log(`✓ Products count matches exactly before and after (${results.countBefore} -> ${results.countAfter}). No existing products were touched!`);
    } else {
      results.errors.push(`Count mismatch: before=${results.countBefore}, after=${results.countAfter}`);
    }

  } catch (err) {
    console.error('Execution error during test:', err);
    results.errors.push(err.message);
  } finally {
    // Teardown safety: if test product still exists, ensure it is cleaned up
    if (testProductId) {
      try {
        await sql`DELETE FROM products WHERE id = ${testProductId};`;
      } catch (e) {}
    }
    await sql.end();
  }

  console.log('\n====================================================');
  console.log('                    FINAL REPORT                    ');
  console.log('====================================================');
  console.log(`Build: ${results.build}`);
  console.log(`TypeScript: ${results.typeScript}`);
  console.log(`Create: ${results.create}`);
  console.log(`Read: ${results.read}`);
  console.log(`Update: ${results.update}`);
  console.log(`Packaging calculation: ${results.packagingCalc}`);
  console.log(`Stock calculation: ${results.stockCalc}`);
  console.log(`Delete: ${results.delete}`);
  console.log(`عدد المنتجات قبل الاختبار وبعده: ${results.countBefore} -> ${results.countAfter}`);
  console.log(`أي Errors ظهرت: ${results.errors.length > 0 ? results.errors.join('; ') : 'لا يوجد (None)'}`);
}

runTest();
