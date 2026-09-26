import { getPostgresClient } from '@/db/client';
import { Product, Category, Company } from '@/types';

// =========================================================================
// 1. Categories Management (PostgreSQL)
// =========================================================================

export async function pgGetCategories(): Promise<Category[]> {
  const sql = getPostgresClient();
  const rows = await sql`
    SELECT 
      id,
      name,
      slug,
      image,
      icon,
      color,
      order_index as "orderIndex",
      hide_from_home as "hideFromHome",
      description,
      created_at as "createdAt"
    FROM categories
    ORDER BY order_index ASC, name ASC;
  `;

  return rows.map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    image: r.image || '',
    icon: r.icon || 'basket',
    color: r.color || '#16a34a',
    order: Number(r.orderIndex || 0),
    hideFromHome: Boolean(r.hideFromHome),
    description: r.description || '',
    count: 0,
  }));
}

export async function pgCreateCategory(data: {
  name: string;
  image?: string;
  icon?: string;
  color?: string;
  description?: string;
  orderIndex?: number;
  hideFromHome?: boolean;
}): Promise<Category> {
  const sql = getPostgresClient();
  const name = data.name.trim();
  const slug = name.toLowerCase().replace(/\s+/g, '-');

  const [row] = await sql`
    INSERT INTO categories (
      name, slug, image, icon, color, description, order_index, hide_from_home
    ) VALUES (
      ${name},
      ${slug},
      ${data.image?.trim() || null},
      ${data.icon?.trim() || 'basket'},
      ${data.color?.trim() || '#16a34a'},
      ${data.description?.trim() || null},
      ${data.orderIndex ?? 0},
      ${data.hideFromHome ?? false}
    )
    RETURNING id, name, slug, image, icon, color, description, order_index as "orderIndex", hide_from_home as "hideFromHome";
  `;

  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    image: row.image || '',
    icon: row.icon || 'basket',
    color: row.color || '#16a34a',
    order: Number(row.orderIndex || 0),
    hideFromHome: Boolean(row.hideFromHome),
    description: row.description || '',
    count: 0,
  };
}

export async function pgUpdateCategory(
  id: string,
  updates: Partial<Category>
): Promise<Category | null> {
  const sql = getPostgresClient();
  const fields: Record<string, any> = {};

  if (updates.name !== undefined) fields.name = updates.name.trim();
  if (updates.slug !== undefined) fields.slug = updates.slug.trim();
  if (updates.image !== undefined) fields.image = updates.image?.trim() || null;
  if (updates.icon !== undefined) fields.icon = updates.icon?.trim() || null;
  if (updates.color !== undefined) fields.color = updates.color?.trim() || null;
  if (updates.description !== undefined) fields.description = updates.description?.trim() || null;
  if (updates.order !== undefined) fields.order_index = updates.order;
  if (updates.hideFromHome !== undefined) fields.hide_from_home = updates.hideFromHome;

  if (Object.keys(fields).length === 0) return null;

  const [row] = await sql`
    UPDATE categories
    SET ${sql(fields)}
    WHERE id = ${id}
    RETURNING id, name, slug, image, icon, color, description, order_index as "orderIndex", hide_from_home as "hideFromHome";
  `;

  if (!row) return null;

  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    image: row.image || '',
    icon: row.icon || 'basket',
    color: row.color || '#16a34a',
    order: Number(row.orderIndex || 0),
    hideFromHome: Boolean(row.hideFromHome),
    description: row.description || '',
    count: 0,
  };
}

export async function pgDeleteCategory(id: string): Promise<boolean> {
  const sql = getPostgresClient();
  const result = await sql`DELETE FROM categories WHERE id = ${id};`;
  return result.count > 0;
}

// =========================================================================
// 2. Companies Management (PostgreSQL)
// =========================================================================

export async function resolveCategoryRowsByNames(names: string[]) {
  const sql = getPostgresClient();
  if (!names || names.length === 0) return [];
  const rows = await sql`
    SELECT id, name FROM categories WHERE name = ANY(${names});
  `;

  // Explicit type-safe Map to prevent TypeScript inference errors (Rule #6)
  const byName = new Map<string, { id: string; name: string }>(
    rows.map((row: any) => [
      String(row.name),
      {
        id: String(row.id),
        name: String(row.name),
      },
    ])
  );

  return names
    .map((n) => byName.get(n))
    .filter((c): c is { id: string; name: string } => Boolean(c));
}

export async function pgGetCompanies(categoryFilter?: string): Promise<Company[]> {
  const sql = getPostgresClient();

  const companiesRows = await sql`
    SELECT 
      c.id,
      c.name,
      c.logo,
      c.color,
      c.icon,
      c.created_at,
      COALESCE(
        json_agg(cat.name) FILTER (WHERE cat.name IS NOT NULL),
        '[]'
      ) as categories
    FROM companies c
    LEFT JOIN company_categories cc ON c.id = cc.company_id
    LEFT JOIN categories cat ON cc.category_id = cat.id
    GROUP BY c.id
    ORDER BY c.name ASC;
  `;

  let list: Company[] = companiesRows.map((r: any) => ({
    id: String(r.id),
    name: String(r.name),
    logo: r.logo || undefined,
    color: r.color || undefined,
    icon: r.icon || undefined,
    categories: Array.isArray(r.categories) ? r.categories : [],
    category: Array.isArray(r.categories) && r.categories.length > 0 ? r.categories[0] : '',
    productsCount: 0,
  }));

  if (categoryFilter && categoryFilter !== 'الكل') {
    list = list.filter(
      (c) => (c.categories && c.categories.includes(categoryFilter)) || c.category === categoryFilter
    );
  }

  return list;
}

export async function pgCreateCompany(data: {
  name: string;
  category?: string;
  categories?: string[];
  logo?: string;
  icon?: string;
  color?: string;
}): Promise<Company> {
  const sql = getPostgresClient();
  const name = data.name.trim();

  const [row] = await sql`
    INSERT INTO companies (name, logo, icon, color)
    VALUES (${name}, ${data.logo?.trim() || null}, ${data.icon?.trim() || null}, ${data.color?.trim() || null})
    RETURNING id, name, logo, icon, color;
  `;

  const inputCats = Array.isArray(data.categories) && data.categories.length > 0
    ? data.categories
    : data.category ? [data.category] : [];

  if (inputCats.length > 0) {
    const resolvedCats = await resolveCategoryRowsByNames(inputCats);
    for (const cat of resolvedCats) {
      await sql`
        INSERT INTO company_categories (company_id, category_id)
        VALUES (${row.id}, ${cat.id})
        ON CONFLICT DO NOTHING;
      `;
    }
  }

  return {
    id: String(row.id),
    name: String(row.name),
    logo: row.logo || undefined,
    color: row.color || undefined,
    icon: row.icon || undefined,
    categories: inputCats,
    category: inputCats[0] || '',
    productsCount: 0,
  };
}

export async function pgUpdateCompany(
  id: string,
  updates: Partial<Company>
): Promise<Company | null> {
  const sql = getPostgresClient();
  const fields: Record<string, any> = {};

  if (updates.name !== undefined) fields.name = updates.name.trim();
  if (updates.logo !== undefined) fields.logo = updates.logo?.trim() || null;
  if (updates.icon !== undefined) fields.icon = updates.icon?.trim() || null;
  if (updates.color !== undefined) fields.color = updates.color?.trim() || null;

  if (Object.keys(fields).length > 0) {
    await sql`
      UPDATE companies
      SET ${sql(fields)}
      WHERE id = ${id};
    `;
  }

  if (updates.categories !== undefined && Array.isArray(updates.categories)) {
    await sql`DELETE FROM company_categories WHERE company_id = ${id};`;
    const resolvedCats = await resolveCategoryRowsByNames(updates.categories);
    for (const cat of resolvedCats) {
      await sql`
        INSERT INTO company_categories (company_id, category_id)
        VALUES (${id}, ${cat.id})
        ON CONFLICT DO NOTHING;
      `;
    }
  }

  const companies = await pgGetCompanies();
  return companies.find((c) => c.id === id) || null;
}

export async function pgDeleteCompany(id: string): Promise<boolean> {
  const sql = getPostgresClient();
  // ON DELETE CASCADE automatically removes entries in company_categories
  // ON DELETE SET NULL sets products.company_id to NULL without deleting products
  const result = await sql`DELETE FROM companies WHERE id = ${id};`;
  return result.count > 0;
}

// =========================================================================
// 3. Products Phase 3: Query & Read Engine (PostgreSQL Full Business Logic)
// =========================================================================

export interface ProductFilters {
  category?: string;
  query?: string;
  featured?: boolean;
}

/**
 * Transforms raw PostgreSQL joined row into a complete UI/API compatible Product object,
 * applying Active Offer Overlay and packaging calculations identically to the legacy store.
 */
function mapPgProductRowToProduct(r: any): Product {
  const boxes = Number(r.boxes_per_carton) || 1;
  const items = Number(r.items_per_box) || 1;
  const pieces = Number(r.pieces_per_carton) || boxes * items;
  const stockPieces = Number(r.current_stock_pieces) || 0;
  const stockCartons = pieces > 0 ? Number((stockPieces / pieces).toFixed(2)) : stockPieces;

  const basePrice = Number(r.price) || 0;
  const baseWholesalePrice = Number(r.wholesale_price) || 0;

  // Check if active promotional offer exists
  const now = new Date();
  const hasActiveOffer = Boolean(
    r.offer_id &&
    r.offer_is_active &&
    (!r.offer_is_archived || r.offer_is_archived === false) &&
    r.offer_end_date &&
    new Date(r.offer_end_date) > now &&
    (!r.offer_start_date || new Date(r.offer_start_date) <= now)
  );

  let prod: Product = {
    id: String(r.id),
    name: String(r.name),
    barcode: r.barcode || undefined,
    description: r.description || '',
    category: r.category_name || 'عام',
    company: r.company_name || undefined,
    companyLogo: r.company_logo || undefined,

    // Base & Selling Prices
    price: basePrice,
    wholesalePrice: baseWholesalePrice,
    marketPrice: r.market_price ? Number(r.market_price) : undefined,
    boxPrice: r.box_price ? Number(r.box_price) : undefined,
    specialPrice: r.special_price ? Number(r.special_price) : undefined,
    vipPrice: r.vip_price ? Number(r.vip_price) : undefined,
    wholesaleMinQuantity: r.wholesale_min_quantity ? Number(r.wholesale_min_quantity) : 1,

    // Cost Prices
    costPrice: Number(r.cost_price) || 0,
    boxCostPrice: Number(r.box_cost_price) || 0,
    pieceCostPrice: Number(r.piece_cost_price) || 0,

    // Packaging Breakdown
    boxesPerCarton: boxes,
    itemsPerBox: items,
    itemsPerWholesaleUnit: pieces,
    retailUnit: r.retail_unit || 'قطعة مفردة',
    wholesaleUnit: r.wholesale_unit || `كرتون جملة (${boxes} علب × ${items} قطعة)`,
    marketUnit: r.market_unit || undefined,

    // Stock & Alerts
    stock: stockCartons,
    minStockAlert: Number(r.min_stock_alert) || 5,

    // Dates & Shelf Life
    productionDate: r.production_date ? String(r.production_date) : undefined,
    expiryDate: r.expiry_date ? String(r.expiry_date) : undefined,
    expiryAlertDays: Number(r.expiry_alert_days) || 30,

    // Flags & Media
    isFeatured: Boolean(r.is_featured),
    isBestSeller: Boolean(r.is_best_seller),
    isNew: Boolean(r.is_new),
    images: Array.isArray(r.images) ? r.images : [],

    // Cashback incentives
    cashbackCustomerAmount: r.cashback_customer_amount ? Number(r.cashback_customer_amount) : undefined,
    cashbackMarketAmount: r.cashback_market_amount ? Number(r.cashback_market_amount) : undefined,
    cashbackMerchantAmount: r.cashback_merchant_amount ? Number(r.cashback_merchant_amount) : undefined,

    // Permanent Base Prices
    basePrice,
    baseWholesalePrice,
    isOnOffer: false,

    // Note: Order Analytics (orderedWholesaleQty, etc.) are set to 0 until Orders domain is migrated to PostgreSQL.
    orderedWholesaleQty: 0,
    orderedMarketQty: 0,
    orderedRetailQty: 0,
    orderedTotalQty: 0,

    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
  };

  // Apply Active Promotional Offer Overlay
  if (hasActiveOffer) {
    const offerPrice = Number(r.offer_price);
    const offerWholesale = r.offer_wholesale_price ? Number(r.offer_wholesale_price) : undefined;

    prod = {
      ...prod,
      isOnOffer: true,
      offerId: String(r.offer_id),
      price: offerPrice,
      originalPrice: Number(r.offer_original_price) || basePrice,
      wholesalePrice: offerWholesale && offerWholesale > 0 ? offerWholesale : baseWholesalePrice,
      originalWholesalePrice: offerWholesale && offerWholesale > 0 ? (Number(r.offer_original_wholesale_price) || baseWholesalePrice) : undefined,
      offerBadge: r.offer_badge || 'عرض خاص',
      offerEndDate: new Date(r.offer_end_date).toISOString(),
    };
  }

  return prod;
}

/**
 * Phase 3: pgGetProducts
 * Queries all products from PostgreSQL with Category, Company, and Active Offer joins.
 * Applies category, featured, and multi-field query filters (name, barcode, description).
 */
export async function pgGetProducts(filters?: ProductFilters): Promise<Product[]> {
  const sql = getPostgresClient();

  const rows = await sql`
    SELECT 
      p.*,
      c.name as category_name,
      comp.name as company_name,
      comp.logo as company_logo,
      -- Active Offer Overlay fields (joined only when active, unarchived, and unexpired)
      o.id as offer_id,
      o.offer_price,
      o.offer_wholesale_price,
      o.original_price as offer_original_price,
      o.original_wholesale_price as offer_original_wholesale_price,
      o.badge as offer_badge,
      o.start_date as offer_start_date,
      o.end_date as offer_end_date,
      o.is_active as offer_is_active,
      o.is_archived as offer_is_archived
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN companies comp ON p.company_id = comp.id
    LEFT JOIN product_offers o ON p.id = o.product_id 
      AND o.is_active = true 
      AND (o.is_archived IS NULL OR o.is_archived = false)
      AND (o.start_date IS NULL OR o.start_date <= NOW())
      AND o.end_date > NOW()
    ORDER BY p.created_at DESC;
  `;

  let list: Product[] = rows.map(mapPgProductRowToProduct);

  if (filters?.category && filters.category !== 'الكل') {
    list = list.filter((p) => p.category === filters.category);
  }

  if (filters?.featured) {
    list = list.filter((p) => p.isFeatured);
  }

  if (filters?.query) {
    const q = filters.query.toLowerCase().trim();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }

  return list;
}

/**
 * Phase 3: pgGetProductById
 * Queries a single product by UUID or Barcode with Category, Company, and Active Offer joins.
 */
export async function pgGetProductById(id: string): Promise<Product | null> {
  const sql = getPostgresClient();

  // Check if string matches standard UUID format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let rows;
  if (isUuid) {
    rows = await sql`
      SELECT 
        p.*,
        c.name as category_name,
        comp.name as company_name,
        comp.logo as company_logo,
        o.id as offer_id,
        o.offer_price,
        o.offer_wholesale_price,
        o.original_price as offer_original_price,
        o.original_wholesale_price as offer_original_wholesale_price,
        o.badge as offer_badge,
        o.start_date as offer_start_date,
        o.end_date as offer_end_date,
        o.is_active as offer_is_active,
        o.is_archived as offer_is_archived
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN companies comp ON p.company_id = comp.id
      LEFT JOIN product_offers o ON p.id = o.product_id 
        AND o.is_active = true 
        AND (o.is_archived IS NULL OR o.is_archived = false)
        AND (o.start_date IS NULL OR o.start_date <= NOW())
        AND o.end_date > NOW()
      WHERE p.id = ${id} OR p.barcode = ${id}
      LIMIT 1;
    `;
  } else {
    // If not a UUID, query by barcode only to avoid PostgreSQL UUID cast error
    rows = await sql`
      SELECT 
        p.*,
        c.name as category_name,
        comp.name as company_name,
        comp.logo as company_logo,
        o.id as offer_id,
        o.offer_price,
        o.offer_wholesale_price,
        o.original_price as offer_original_price,
        o.original_wholesale_price as offer_original_wholesale_price,
        o.badge as offer_badge,
        o.start_date as offer_start_date,
        o.end_date as offer_end_date,
        o.is_active as offer_is_active,
        o.is_archived as offer_is_archived
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN companies comp ON p.company_id = comp.id
      LEFT JOIN product_offers o ON p.id = o.product_id 
        AND o.is_active = true 
        AND (o.is_archived IS NULL OR o.is_archived = false)
        AND (o.start_date IS NULL OR o.start_date <= NOW())
        AND o.end_date > NOW()
      WHERE p.barcode = ${id}
      LIMIT 1;
    `;
  }

  if (!rows || rows.length === 0) return null;
  return mapPgProductRowToProduct(rows[0]);
}

// =========================================================================
// 4. Products Management (PostgreSQL Write Operations)
// =========================================================================

/**
 * Phase 4 & 5: pgCreateProduct
 * Implements business logic from createProduct:
 * - Smart pricing defaults
 * - Packaging breakdown math (boxesPerCarton * itemsPerBox = piecesPerCarton)
 * - Cost calculations (boxCostPrice, pieceCostPrice)
 * - Stock conversion (cartons to pieces)
 * - Category and company relational resolution
 * - Promotional offer creation in product_offers if created on offer
 */
export async function pgCreateProduct(productData: Partial<Product> & { name: string; category?: string }): Promise<Product> {
  const sql = getPostgresClient();

  const name = productData.name?.trim();
  if (!name) {
    throw new Error('اسم المنتج مطلوب');
  }

  // 1. Resolve Category ID
  let categoryId: string | null = null;
  const rawCat = (productData.category || '').trim();
  if (!rawCat) {
    throw new Error('القسم مطلوب');
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCat);
  if (isUuid) {
    const rows = await sql`SELECT id FROM categories WHERE id = ${rawCat} LIMIT 1;`;
    if (rows.length > 0) categoryId = String(rows[0].id);
  }
  if (!categoryId) {
    const rows = await sql`SELECT id FROM categories WHERE name = ${rawCat} OR slug = ${rawCat.toLowerCase()} LIMIT 1;`;
    if (rows.length > 0) categoryId = String(rows[0].id);
  }

  if (!categoryId) {
    throw new Error('القسم المحدد غير موجود');
  }

  // 2. Resolve Company ID (Optional)
  let companyId: string | null = null;
  const rawComp = productData.company !== undefined && productData.company !== null
    ? String(productData.company).trim()
    : '';

  if (rawComp) {
    const isCompUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawComp);
    if (isCompUuid) {
      const rows = await sql`SELECT id FROM companies WHERE id = ${rawComp} LIMIT 1;`;
      if (rows.length > 0) companyId = String(rows[0].id);
    }
    if (!companyId) {
      const rows = await sql`SELECT id FROM companies WHERE name = ${rawComp} LIMIT 1;`;
      if (rows.length > 0) companyId = String(rows[0].id);
    }

    if (!companyId) {
      throw new Error('الشركة المحددة غير موجودة');
    }
  }

  // 3. Packaging Breakdown Math (Satisfies chk_product_packaging_math)
  const boxesPerCarton = Math.max(1, Number(productData.boxesPerCarton) || 1);
  const itemsPerBox = Math.max(1, Number(productData.itemsPerBox) || 1);
  const piecesPerCarton = boxesPerCarton * itemsPerBox;

  // 4. Stock Conversion: stock input is in cartons -> converted to current_stock_pieces
  const stockCartons = Number(productData.stock) || 0;
  const currentStockPieces = Math.max(0, Math.round(stockCartons * piecesPerCarton));

  // 5. Smart Defaults for Prices (matching legacy db.ts logic)
  const price = Number(productData.price) || 0;
  const wholesalePrice = productData.wholesalePrice !== undefined
    ? Number(productData.wholesalePrice)
    : Math.round(price * 0.85);

  const costPrice = productData.costPrice !== undefined && Number(productData.costPrice) > 0
    ? Number(productData.costPrice)
    : (wholesalePrice > 0 ? Math.round(wholesalePrice * 0.8) : Math.round(price * 0.7));

  const boxCostPrice = productData.boxCostPrice !== undefined
    ? Number(productData.boxCostPrice)
    : (boxesPerCarton > 0 ? Number((costPrice / boxesPerCarton).toFixed(4)) : 0);

  const pieceCostPrice = productData.pieceCostPrice !== undefined
    ? Number(productData.pieceCostPrice)
    : (piecesPerCarton > 0 ? Number((costPrice / piecesPerCarton).toFixed(4)) : 0);

  const specialPrice = productData.specialPrice !== undefined
    ? Number(productData.specialPrice)
    : (wholesalePrice > 0 ? Math.round(wholesalePrice * 0.95) : Math.round(price * 0.9));

  const marketPrice = productData.marketPrice !== undefined ? Number(productData.marketPrice) : null;
  const boxPrice = productData.boxPrice !== undefined ? Number(productData.boxPrice) : null;
  const vipPrice = productData.vipPrice !== undefined ? Number(productData.vipPrice) : null;
  const wholesaleMinQuantity = Math.max(1, Number(productData.wholesaleMinQuantity) || 1);

  // 6. Units and Merchandising
  const retailUnit = productData.retailUnit?.trim() || 'قطعة مفردة';
  const wholesaleUnit = productData.wholesaleUnit?.trim() || `كرتون جملة (${boxesPerCarton} علب × ${itemsPerBox} قطعة)`;
  const marketUnit = productData.marketUnit?.trim() || null;
  const minStockAlert = productData.minStockAlert !== undefined ? Number(productData.minStockAlert) : 5;
  const expiryAlertDays = productData.expiryAlertDays !== undefined ? Number(productData.expiryAlertDays) : 30;
  const barcode = productData.barcode?.trim() || null;
  const description = productData.description?.trim() || null;
  const isFeatured = Boolean(productData.isFeatured);
  const isBestSeller = Boolean(productData.isBestSeller);
  const isNew = Boolean(productData.isNew);
  const images = Array.isArray(productData.images) && productData.images.length > 0 ? productData.images : [];

  const productionDate = productData.productionDate ? productData.productionDate : null;
  const expiryDate = productData.expiryDate ? productData.expiryDate : null;

  const cashbackCustomer = productData.cashbackCustomerAmount !== undefined ? Number(productData.cashbackCustomerAmount) : null;
  const cashbackMarket = productData.cashbackMarketAmount !== undefined ? Number(productData.cashbackMarketAmount) : null;
  const cashbackMerchant = productData.cashbackMerchantAmount !== undefined ? Number(productData.cashbackMerchantAmount) : null;

  // Determine base prices if created with an active promotional offer
  const isOnOffer = Boolean(
    productData.isOnOffer &&
    productData.originalPrice &&
    Number(productData.originalPrice) > price
  );

  const basePriceToStore = isOnOffer ? Number(productData.originalPrice) : price;
  const baseWholesaleToStore = isOnOffer && productData.originalWholesalePrice
    ? Number(productData.originalWholesalePrice)
    : wholesalePrice;

  // 7. Insert into products table
  const [newRow] = await sql`
    INSERT INTO products (
      name, barcode, description, category_id, company_id,
      current_stock_pieces, min_stock_alert,
      boxes_per_carton, items_per_box, pieces_per_carton,
      retail_unit, wholesale_unit, market_unit,
      piece_cost_price, box_cost_price, cost_price,
      price, wholesale_price, market_price, box_price, special_price, vip_price, wholesale_min_quantity,
      production_date, expiry_date, expiry_alert_days,
      is_featured, is_best_seller, is_new, images,
      cashback_customer_amount, cashback_market_amount, cashback_merchant_amount
    ) VALUES (
      ${name},
      ${barcode},
      ${description},
      ${categoryId},
      ${companyId},
      ${currentStockPieces},
      ${minStockAlert},
      ${boxesPerCarton},
      ${itemsPerBox},
      ${piecesPerCarton},
      ${retailUnit},
      ${wholesaleUnit},
      ${marketUnit},
      ${pieceCostPrice},
      ${boxCostPrice},
      ${costPrice},
      ${basePriceToStore},
      ${baseWholesaleToStore},
      ${marketPrice},
      ${boxPrice},
      ${specialPrice},
      ${vipPrice},
      ${wholesaleMinQuantity},
      ${productionDate},
      ${expiryDate},
      ${expiryAlertDays},
      ${isFeatured},
      ${isBestSeller},
      ${isNew},
      ${images.length > 0 ? images : sql`ARRAY[]::text[]`},
      ${cashbackCustomer},
      ${cashbackMarket},
      ${cashbackMerchant}
    )
    RETURNING id;
  `;

  const newProductId = String(newRow.id);

  // 8. Handle Promotional Offer Creation
  if (isOnOffer) {
    const offerOriginalPrice = Number(productData.originalPrice);
    const offerPrice = price;
    const discountPercent = offerOriginalPrice > 0
      ? Number((((offerOriginalPrice - offerPrice) / offerOriginalPrice) * 100).toFixed(2))
      : null;

    const endDate = productData.offerEndDate
      ? new Date(productData.offerEndDate)
      : new Date(Date.now() + 7 * 86400000);

    await sql`
      INSERT INTO product_offers (
        product_id, original_price, original_wholesale_price,
        offer_price, offer_wholesale_price, discount_percent,
        badge, end_date, is_active
      ) VALUES (
        ${newProductId},
        ${offerOriginalPrice},
        ${productData.originalWholesalePrice ? Number(productData.originalWholesalePrice) : null},
        ${offerPrice},
        ${productData.wholesalePrice ? Number(productData.wholesalePrice) : null},
        ${discountPercent},
        ${productData.offerBadge || '🔥 عرض خاص'},
        ${endDate},
        true
      );
    `;
  }

  const created = await pgGetProductById(newProductId);
  if (!created) {
    throw new Error('فشل جلب المنتج المنشأ حديثاً');
  }

  return created;
}

/**
 * Phase 4 & 5: pgUpdateProduct
 * Updates an existing product in PostgreSQL:
 * - Recalculates packaging math and stock pieces when packaging/stock changes
 * - Updates category and company associations
 * - Synchronizes active offers with product_offers table (deactivates/deletes or updates)
 */
export async function pgUpdateProduct(
  id: string,
  updates: Partial<Product>
): Promise<Product | null> {
  const sql = getPostgresClient();

  const existing = await pgGetProductById(id);
  if (!existing) return null;

  const productId = existing.id;

  // 1. Resolve Category ID if changed
  let categoryId: string | undefined = undefined;
  if (updates.category !== undefined) {
    const rawCat = (updates.category || '').trim();
    if (!rawCat) {
      throw new Error('القسم مطلوب');
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCat);
    if (isUuid) {
      const rows = await sql`SELECT id FROM categories WHERE id = ${rawCat} LIMIT 1;`;
      if (rows.length > 0) categoryId = String(rows[0].id);
    }
    if (!categoryId) {
      const rows = await sql`SELECT id FROM categories WHERE name = ${rawCat} OR slug = ${rawCat.toLowerCase()} LIMIT 1;`;
      if (rows.length > 0) categoryId = String(rows[0].id);
    }

    if (!categoryId) {
      throw new Error('القسم المحدد غير موجود');
    }
  }

  // 2. Resolve Company ID if changed
  let companyId: string | null | undefined = undefined;
  if (updates.company !== undefined) {
    if (updates.company === null || (typeof updates.company === 'string' && updates.company.trim() === '')) {
      // Deliberately removing company
      companyId = null;
    } else {
      const rawComp = String(updates.company).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawComp);
      if (isUuid) {
        const rows = await sql`SELECT id FROM companies WHERE id = ${rawComp} LIMIT 1;`;
        if (rows.length > 0) companyId = String(rows[0].id);
      }
      if (!companyId) {
        const rows = await sql`SELECT id FROM companies WHERE name = ${rawComp} LIMIT 1;`;
        if (rows.length > 0) companyId = String(rows[0].id);
      }

      if (!companyId) {
        throw new Error('الشركة المحددة غير موجودة');
      }
    }
  }

  // 3. Packaging math & stock calculation
  const newBoxes = updates.boxesPerCarton !== undefined
    ? Math.max(1, Number(updates.boxesPerCarton))
    : (existing.boxesPerCarton || 1);
  const newItems = updates.itemsPerBox !== undefined
    ? Math.max(1, Number(updates.itemsPerBox))
    : (existing.itemsPerBox || 1);
  const newPiecesPerCarton = newBoxes * newItems;

  let newCurrentStockPieces: number | undefined = undefined;
  if (updates.stock !== undefined) {
    newCurrentStockPieces = Math.max(0, Math.round(Number(updates.stock) * newPiecesPerCarton));
  }
  // CRITICAL: If updates.stock === undefined, newCurrentStockPieces remains undefined,
  // meaning existing current_stock_pieces in PostgreSQL is preserved untouched.

  // 4. Cost prices recalculation
  const costPrice = updates.costPrice !== undefined ? Number(updates.costPrice) : existing.costPrice;
  const boxCostPrice = updates.boxCostPrice !== undefined
    ? Number(updates.boxCostPrice)
    : (costPrice && newBoxes > 0 ? Number((costPrice / newBoxes).toFixed(4)) : undefined);
  const pieceCostPrice = updates.pieceCostPrice !== undefined
    ? Number(updates.pieceCostPrice)
    : (costPrice && newPiecesPerCarton > 0 ? Number((costPrice / newPiecesPerCarton).toFixed(4)) : undefined);

  // 5. Handle Promotional Offer Sync
  if (updates.isOnOffer === false) {
    // Offer explicitly turned off: remove active offer
    await sql`DELETE FROM product_offers WHERE product_id = ${productId};`;
  } else if (updates.isOnOffer === true || (existing.isOnOffer && (updates.price !== undefined || updates.originalPrice !== undefined))) {
    // Offer active or being updated
    const offerPrice = updates.price !== undefined ? Number(updates.price) : existing.price;
    const offerOriginalPrice = updates.originalPrice !== undefined
      ? Number(updates.originalPrice)
      : (existing.originalPrice || existing.basePrice || existing.price);

    const offerWholesalePrice = updates.wholesalePrice !== undefined
      ? Number(updates.wholesalePrice)
      : existing.wholesalePrice;
    const offerOriginalWholesale = updates.originalWholesalePrice !== undefined
      ? Number(updates.originalWholesalePrice)
      : (existing.originalWholesalePrice || existing.baseWholesalePrice || existing.wholesalePrice);

    const discountPercent = offerOriginalPrice > 0 && offerPrice < offerOriginalPrice
      ? Number((((offerOriginalPrice - offerPrice) / offerOriginalPrice) * 100).toFixed(2))
      : null;

    const badge = updates.offerBadge !== undefined ? updates.offerBadge : (existing.offerBadge || '🔥 عرض خاص');
    const endDate = updates.offerEndDate
      ? new Date(updates.offerEndDate)
      : (existing.offerEndDate ? new Date(existing.offerEndDate) : new Date(Date.now() + 7 * 86400000));

    const [existingOffer] = await sql`
      SELECT id FROM product_offers WHERE product_id = ${productId} LIMIT 1;
    `;

    if (existingOffer) {
      await sql`
        UPDATE product_offers SET
          original_price = ${offerOriginalPrice},
          original_wholesale_price = ${offerOriginalWholesale || null},
          offer_price = ${offerPrice},
          offer_wholesale_price = ${offerWholesalePrice || null},
          discount_percent = ${discountPercent},
          badge = ${badge},
          end_date = ${endDate},
          is_active = true
        WHERE product_id = ${productId};
      `;
    } else if (offerPrice < offerOriginalPrice) {
      await sql`
        INSERT INTO product_offers (
          product_id, original_price, original_wholesale_price,
          offer_price, offer_wholesale_price, discount_percent,
          badge, end_date, is_active
        ) VALUES (
          ${productId},
          ${offerOriginalPrice},
          ${offerOriginalWholesale || null},
          ${offerPrice},
          ${offerWholesalePrice || null},
          ${discountPercent},
          ${badge},
          ${endDate},
          true
        );
      `;
    }
  }

  // 6. Base prices to store on products table
  let basePriceToStore: number | undefined = undefined;
  let baseWholesaleToStore: number | undefined = undefined;

  if (updates.isOnOffer === true) {
    if (updates.originalPrice !== undefined) basePriceToStore = Number(updates.originalPrice);
    if (updates.originalWholesalePrice !== undefined) baseWholesaleToStore = Number(updates.originalWholesalePrice);
  } else if (updates.isOnOffer === false) {
    if (updates.price !== undefined) basePriceToStore = Number(updates.price);
    if (updates.wholesalePrice !== undefined) baseWholesaleToStore = Number(updates.wholesalePrice);
  } else if (!existing.isOnOffer) {
    if (updates.price !== undefined) basePriceToStore = Number(updates.price);
    if (updates.wholesalePrice !== undefined) baseWholesaleToStore = Number(updates.wholesalePrice);
  }

  // 7. Execute Update on products table
  await sql`
    UPDATE products SET
      name = ${updates.name !== undefined ? updates.name.trim() : sql`name`},
      barcode = ${updates.barcode !== undefined ? (updates.barcode?.trim() || null) : sql`barcode`},
      description = ${updates.description !== undefined ? (updates.description?.trim() || null) : sql`description`},
      category_id = ${categoryId !== undefined ? categoryId : sql`category_id`},
      company_id = ${companyId !== undefined ? companyId : sql`company_id`},
      boxes_per_carton = ${updates.boxesPerCarton !== undefined ? newBoxes : sql`boxes_per_carton`},
      items_per_box = ${updates.itemsPerBox !== undefined ? newItems : sql`items_per_box`},
      pieces_per_carton = ${(updates.boxesPerCarton !== undefined || updates.itemsPerBox !== undefined) ? newPiecesPerCarton : sql`pieces_per_carton`},
      current_stock_pieces = ${newCurrentStockPieces !== undefined ? newCurrentStockPieces : sql`current_stock_pieces`},
      cost_price = ${updates.costPrice !== undefined ? Number(updates.costPrice) : sql`cost_price`},
      box_cost_price = ${boxCostPrice !== undefined ? boxCostPrice : sql`box_cost_price`},
      piece_cost_price = ${pieceCostPrice !== undefined ? pieceCostPrice : sql`piece_cost_price`},
      price = ${basePriceToStore !== undefined ? basePriceToStore : sql`price`},
      wholesale_price = ${baseWholesaleToStore !== undefined ? baseWholesaleToStore : sql`wholesale_price`},
      market_price = ${updates.marketPrice !== undefined ? (updates.marketPrice ? Number(updates.marketPrice) : null) : sql`market_price`},
      box_price = ${updates.boxPrice !== undefined ? (updates.boxPrice ? Number(updates.boxPrice) : null) : sql`box_price`},
      special_price = ${updates.specialPrice !== undefined ? (updates.specialPrice ? Number(updates.specialPrice) : null) : sql`special_price`},
      vip_price = ${updates.vipPrice !== undefined ? (updates.vipPrice ? Number(updates.vipPrice) : null) : sql`vip_price`},
      wholesale_min_quantity = ${updates.wholesaleMinQuantity !== undefined ? Math.max(1, Number(updates.wholesaleMinQuantity)) : sql`wholesale_min_quantity`},
      retail_unit = ${updates.retailUnit !== undefined ? updates.retailUnit.trim() : sql`retail_unit`},
      wholesale_unit = ${updates.wholesaleUnit !== undefined ? updates.wholesaleUnit.trim() : sql`wholesale_unit`},
      market_unit = ${updates.marketUnit !== undefined ? (updates.marketUnit?.trim() || null) : sql`market_unit`},
      min_stock_alert = ${updates.minStockAlert !== undefined ? Number(updates.minStockAlert) : sql`min_stock_alert`},
      expiry_alert_days = ${updates.expiryAlertDays !== undefined ? Number(updates.expiryAlertDays) : sql`expiry_alert_days`},
      production_date = ${updates.productionDate !== undefined ? (updates.productionDate || null) : sql`production_date`},
      expiry_date = ${updates.expiryDate !== undefined ? (updates.expiryDate || null) : sql`expiry_date`},
      is_featured = ${updates.isFeatured !== undefined ? Boolean(updates.isFeatured) : sql`is_featured`},
      is_best_seller = ${updates.isBestSeller !== undefined ? Boolean(updates.isBestSeller) : sql`is_best_seller`},
      is_new = ${updates.isNew !== undefined ? Boolean(updates.isNew) : sql`is_new`},
      images = ${updates.images !== undefined ? (Array.isArray(updates.images) && updates.images.length > 0 ? updates.images : sql`ARRAY[]::text[]`) : sql`images`},
      cashback_customer_amount = ${updates.cashbackCustomerAmount !== undefined ? (updates.cashbackCustomerAmount ? Number(updates.cashbackCustomerAmount) : null) : sql`cashback_customer_amount`},
      cashback_market_amount = ${updates.cashbackMarketAmount !== undefined ? (updates.cashbackMarketAmount ? Number(updates.cashbackMarketAmount) : null) : sql`cashback_market_amount`},
      cashback_merchant_amount = ${updates.cashbackMerchantAmount !== undefined ? (updates.cashbackMerchantAmount ? Number(updates.cashbackMerchantAmount) : null) : sql`cashback_merchant_amount`}
    WHERE id = ${productId};
  `;

  return await pgGetProductById(productId);
}

/**
 * Phase 4 & 5: pgDeleteProduct
 * Deletes a product from PostgreSQL.
 * Foreign key constraint (product_offers ON DELETE CASCADE) guarantees
 * that all attached offers are safely removed automatically without orphans.
 */
export async function pgDeleteProduct(id: string): Promise<boolean> {
  const sql = getPostgresClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let rows;
  if (isUuid) {
    rows = await sql`
      DELETE FROM products 
      WHERE id = ${id} OR barcode = ${id} 
      RETURNING id;
    `;
  } else {
    rows = await sql`
      DELETE FROM products 
      WHERE barcode = ${id} 
      RETURNING id;
    `;
  }

  return rows.length > 0;
}

