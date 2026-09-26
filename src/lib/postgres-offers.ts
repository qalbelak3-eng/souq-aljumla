import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, getPostgresClient } from '@/db/client';
import { productOffers, products, auditLogs, orderItems } from '@/db/schema';
import { PgOperator } from '@/lib/postgres-orders';

export interface PgOffer {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  category: string;
  company: string;
  barcode?: string;
  originalPrice: number;
  originalWholesalePrice?: number;
  offerPrice: number;
  offerWholesalePrice?: number;
  discountPercent?: number;
  badge: string;
  startDate?: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: string;
  createdAt: string;
  // Computed helpers
  isValidActive: boolean;
  isFuture: boolean;
  isExpired: boolean;
}

export interface PgCreateOfferInput {
  productId: string;
  originalPrice?: number;
  originalWholesalePrice?: number;
  offerPrice: number;
  offerWholesalePrice?: number;
  badge?: string;
  startDate?: string | null;
  endDate: string;
  isActive?: boolean;
}

export interface PgUpdateOfferInput {
  originalPrice?: number;
  originalWholesalePrice?: number;
  offerPrice?: number;
  offerWholesalePrice?: number;
  badge?: string;
  startDate?: string | null;
  endDate?: string;
  isActive?: boolean;
}

function toNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Checks whether an offer is actively valid according to the authoritative business rules:
 * - is_active === true
 * - is_archived !== true
 * - (start_date IS NULL OR start_date <= NOW())
 * - end_date > NOW()
 */
export function isOfferActiveNow(offer: {
  isActive: boolean;
  isArchived?: boolean;
  startDate?: string | Date | null;
  endDate: string | Date;
}): boolean {
  if (!offer.isActive || offer.isArchived) return false;
  const now = Date.now();
  const end = new Date(offer.endDate).getTime();
  if (isNaN(end) || end <= now) return false;

  if (offer.startDate) {
    const start = new Date(offer.startDate).getTime();
    if (!isNaN(start) && start > now) return false;
  }

  return true;
}

/**
 * Verifies that there is no existing active, unarchived offer for the same product
 * that overlaps with the proposed [startDate, endDate] interval.
 */
export async function checkOfferTimeOverlap(
  productId: string,
  startDateStr: string | null | undefined,
  endDateStr: string,
  excludeOfferId?: string,
  client?: any
): Promise<{ overlaps: boolean; conflictingOfferId?: string }> {
  const sqlClient = client || getPostgresClient();
  const endIso = new Date(endDateStr).toISOString();
  const startIso = startDateStr ? new Date(startDateStr).toISOString() : null;

  // Two time intervals [S1, E1] and [S2, E2] overlap iff:
  // (S1 IS NULL OR S1 < E2) AND (S2 IS NULL OR S2 < E1)
  const rows = await sqlClient`
    SELECT id, start_date, end_date
    FROM product_offers
    WHERE product_id = ${productId}
      AND is_active = true
      AND (is_archived IS NULL OR is_archived = false)
      ${excludeOfferId ? sqlClient`AND id != ${excludeOfferId}` : sqlClient``}
      AND (
        (${startIso}::timestamptz IS NULL OR end_date > ${startIso}::timestamptz)
        AND
        (start_date IS NULL OR start_date < ${endIso}::timestamptz)
      )
    LIMIT 1;
  `;

  if (rows && rows.length > 0) {
    return { overlaps: true, conflictingOfferId: String(rows[0].id) };
  }

  return { overlaps: false };
}

/**
 * Maps a joined PostgreSQL row to a PgOffer domain object.
 */
function mapOfferRow(r: any): PgOffer {
  const now = Date.now();
  const end = new Date(r.end_date).getTime();
  const start = r.start_date ? new Date(r.start_date).getTime() : null;

  const isExpired = !isNaN(end) && end <= now;
  const isFuture = start !== null && !isNaN(start) && start > now;
  const isValidActive = Boolean(r.is_active) && !Boolean(r.is_archived) && !isExpired && !isFuture;

  const origPrice = toNumber(r.original_price);
  const offPrice = toNumber(r.offer_price);
  const discountPercent = origPrice > 0 && offPrice < origPrice
    ? Math.round(((origPrice - offPrice) / origPrice) * 100)
    : undefined;

  let image = '';
  if (Array.isArray(r.product_images) && r.product_images.length > 0) {
    image = r.product_images[0];
  } else if (typeof r.product_image === 'string') {
    image = r.product_image;
  }

  return {
    id: String(r.id),
    productId: String(r.product_id),
    productName: String(r.product_name || 'صنف غير معروف'),
    productImage: image,
    category: String(r.category_name || ''),
    company: String(r.company_name || ''),
    barcode: r.barcode ? String(r.barcode) : undefined,
    originalPrice: origPrice,
    originalWholesalePrice: r.original_wholesale_price ? toNumber(r.original_wholesale_price) : undefined,
    offerPrice: offPrice,
    offerWholesalePrice: r.offer_wholesale_price ? toNumber(r.offer_wholesale_price) : undefined,
    discountPercent: r.discount_percent ? toNumber(r.discount_percent) : discountPercent,
    badge: r.badge ? String(r.badge) : '🔥 عرض خاص',
    startDate: r.start_date ? new Date(r.start_date).toISOString() : undefined,
    endDate: new Date(r.end_date).toISOString(),
    isActive: Boolean(r.is_active),
    isArchived: Boolean(r.is_archived),
    archivedAt: r.archived_at ? new Date(r.archived_at).toISOString() : undefined,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    isValidActive,
    isFuture,
    isExpired,
  };
}

/**
 * 1. pgGetOffers: Fetch all offers with joined product details from PostgreSQL.
 */
export async function pgGetOffers(filters?: {
  activeOnly?: boolean;
  productId?: string;
  includeArchived?: boolean;
}): Promise<PgOffer[]> {
  const sql = getPostgresClient();

  const rows = await sql`
    SELECT 
      o.*,
      p.name as product_name,
      p.images as product_images,
      p.barcode,
      c.name as category_name,
      comp.name as company_name
    FROM product_offers o
    LEFT JOIN products p ON o.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN companies comp ON p.company_id = comp.id
    WHERE 1=1
      ${filters?.includeArchived ? sql`` : sql`AND (o.is_archived IS NULL OR o.is_archived = false)`}
      ${filters?.productId ? sql`AND o.product_id = ${filters.productId}` : sql``}
      ${filters?.activeOnly ? sql`AND o.is_active = true AND o.end_date > NOW() AND (o.start_date IS NULL OR o.start_date <= NOW())` : sql``}
    ORDER BY o.created_at DESC;
  `;

  return rows.map(mapOfferRow);
}

/**
 * 2. pgGetOfferById: Fetch single offer by ID with product details.
 */
export async function pgGetOfferById(id: string): Promise<PgOffer | null> {
  if (!id || !isUuid(id)) return null;
  const sql = getPostgresClient();

  const rows = await sql`
    SELECT 
      o.*,
      p.name as product_name,
      p.images as product_images,
      p.barcode,
      c.name as category_name,
      comp.name as company_name
    FROM product_offers o
    LEFT JOIN products p ON o.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN companies comp ON p.company_id = comp.id
    WHERE o.id = ${id}
    LIMIT 1;
  `;

  if (!rows || rows.length === 0) return null;
  return mapOfferRow(rows[0]);
}

/**
 * 3. pgGetActiveOfferForProduct: Authoritatively queries the active valid offer for a product.
 * Supports running inside an ongoing transaction with optional row-level lock.
 */
export async function pgGetActiveOfferForProduct(
  productId: string,
  tx?: any
): Promise<{
  id: string;
  offerPrice: number;
  offerWholesalePrice?: number;
  originalPrice: number;
  originalWholesalePrice?: number;
  badge: string;
  startDate?: string;
  endDate: string;
} | null> {
  if (!productId || !isUuid(productId)) return null;
  const client = tx || getPostgresClient();

  const rows = await client`
    SELECT 
      id,
      offer_price,
      offer_wholesale_price,
      original_price,
      original_wholesale_price,
      badge,
      start_date,
      end_date
    FROM product_offers
    WHERE product_id = ${productId}
      AND is_active = true
      AND (is_archived IS NULL OR is_archived = false)
      AND (start_date IS NULL OR start_date <= NOW())
      AND end_date > NOW()
    ORDER BY created_at DESC
    LIMIT 1;
  `;

  if (!rows || rows.length === 0) return null;
  const r = rows[0];

  return {
    id: String(r.id),
    offerPrice: toNumber(r.offer_price),
    offerWholesalePrice: r.offer_wholesale_price ? toNumber(r.offer_wholesale_price) : undefined,
    originalPrice: toNumber(r.original_price),
    originalWholesalePrice: r.original_wholesale_price ? toNumber(r.original_wholesale_price) : undefined,
    badge: r.badge ? String(r.badge) : '🔥 عرض خاص',
    startDate: r.start_date ? new Date(r.start_date).toISOString() : undefined,
    endDate: new Date(r.end_date).toISOString(),
  };
}

/**
 * 4. pgCreateOffer: Authoritative server-side creation of a product offer in PostgreSQL.
 * Performs RBAC audit logging and validates time interval overlaps.
 */
export async function pgCreateOffer(
  data: PgCreateOfferInput,
  operator?: PgOperator
): Promise<PgOffer> {
  const db = getDb();
  const sql = getPostgresClient();

  if (!data.productId || !isUuid(data.productId)) {
    throw new Error('معرّف المنتج غير صالح أو غير موجود');
  }

  const offerPrice = toNumber(data.offerPrice);
  if (offerPrice <= 0) {
    throw new Error('سعر العرض يجب أن يكون رقماً أكبر من صفر');
  }

  if (!data.endDate || isNaN(new Date(data.endDate).getTime())) {
    throw new Error('تاريخ انتهاء العرض مطلوب ويجب أن يكون صالحاً');
  }

  const endDate = new Date(data.endDate);
  const startDate = data.startDate && data.startDate.trim() ? new Date(data.startDate) : null;

  if (startDate && isNaN(startDate.getTime())) {
    throw new Error('تاريخ بدء العرض غير صالح');
  }

  if (startDate && endDate <= startDate) {
    throw new Error('تاريخ انتهاء العرض يجب أن يكون بعد تاريخ البدء');
  }

  // Fetch product from PostgreSQL to verify existence and baseline prices
  const [prod] = await sql`
    SELECT id, name, price, wholesale_price
    FROM products
    WHERE id = ${data.productId}
    LIMIT 1;
  `;

  if (!prod) {
    throw new Error('المنتج المطلوب إنشاء العرض عليه غير موجود في قاعدة البيانات');
  }

  const origPrice = data.originalPrice !== undefined && Number(data.originalPrice) > 0
    ? Number(data.originalPrice)
    : toNumber(prod.price);

  if (offerPrice >= origPrice) {
    throw new Error(`سعر العرض (${offerPrice.toLocaleString()} د.ع) يجب أن يكون أقل من السعر الأصلي للمنتج (${origPrice.toLocaleString()} د.ع)`);
  }

  let offerWholesale: number | null = null;
  let origWholesale: number | null = null;

  if (data.offerWholesalePrice !== undefined && Number(data.offerWholesalePrice) > 0) {
    offerWholesale = Number(data.offerWholesalePrice);
    origWholesale = data.originalWholesalePrice !== undefined && Number(data.originalWholesalePrice) > 0
      ? Number(data.originalWholesalePrice)
      : (prod.wholesale_price ? toNumber(prod.wholesale_price) : null);

    if (origWholesale && offerWholesale >= origWholesale) {
      throw new Error(`سعر جملة العرض (${offerWholesale.toLocaleString()} د.ع) يجب أن يكون أقل من سعر الجملة الأصلي (${origWholesale.toLocaleString()} د.ع)`);
    }
  }

  const isActive = data.isActive ?? true;

  // Check time overlap if active
  if (isActive) {
    const overlap = await checkOfferTimeOverlap(
      data.productId,
      startDate ? startDate.toISOString() : null,
      endDate.toISOString(),
      undefined,
      sql
    );
    if (overlap.overlaps) {
      throw new Error('يوجد عرض آخر نشط أو مجدول لنفس المنتج يتداخل مع هذه الفترة الزمنية. يرجى تعديل الفترة أو تعطيل العرض السابق.');
    }
  }

  const discountPercent = origPrice > 0 && offerPrice < origPrice
    ? Number((((origPrice - offerPrice) / origPrice) * 100).toFixed(2))
    : null;

  const [inserted] = await db
    .insert(productOffers)
    .values({
      productId: data.productId,
      originalPrice: String(origPrice.toFixed(2)),
      originalWholesalePrice: origWholesale ? String(origWholesale.toFixed(2)) : null,
      offerPrice: String(offerPrice.toFixed(2)),
      offerWholesalePrice: offerWholesale ? String(offerWholesale.toFixed(2)) : null,
      discountPercent: discountPercent ? String(discountPercent.toFixed(2)) : null,
      badge: data.badge?.trim() || 'عرض خاص',
      startDate: startDate || null,
      endDate,
      isActive,
      isArchived: false,
    })
    .returning();

  // Audit log
  try {
    await db.insert(auditLogs).values({
      actionType: 'offer_created',
      actionLabel: 'إنشاء عرض ترويجي جديد',
      category: 'marketing',
      categoryLabel: 'العروض والتخفيضات',
      operatorSnapshot: operator || null,
      targetType: 'offer',
      targetId: inserted.id,
      targetReferenceNumber: prod.name,
      details: `تم إنشاء عرض خاص على المنتج "${prod.name}" بسعر ${offerPrice.toLocaleString()} د.ع (بدلاً من ${origPrice.toLocaleString()} د.ع) بواسطة ${operator?.name || operator?.username || 'الإدارة'}`,
      severity: 'info',
    });
  } catch (e) {
    console.error('Failed to log offer creation audit:', e);
  }

  const offer = await pgGetOfferById(inserted.id);
  return offer!;
}

/**
 * 5. pgUpdateOffer: Update an existing offer in PostgreSQL with audit log and overlap check.
 */
export async function pgUpdateOffer(
  id: string,
  updates: PgUpdateOfferInput,
  operator?: PgOperator
): Promise<PgOffer> {
  if (!id || !isUuid(id)) {
    throw new Error('معرّف العرض غير صالح');
  }

  const db = getDb();
  const sql = getPostgresClient();

  const current = await pgGetOfferById(id);
  if (!current) {
    throw new Error('العرض المطلوب تعديله غير موجود');
  }

  const finalOfferPrice = updates.offerPrice !== undefined ? toNumber(updates.offerPrice) : current.offerPrice;
  const finalOrigPrice = updates.originalPrice !== undefined ? toNumber(updates.originalPrice) : current.originalPrice;

  if (finalOfferPrice <= 0) {
    throw new Error('سعر العرض يجب أن يكون أكبر من صفر');
  }

  if (finalOfferPrice >= finalOrigPrice) {
    throw new Error(`سعر العرض (${finalOfferPrice.toLocaleString()} د.ع) يجب أن يكون أقل من السعر الأصلي (${finalOrigPrice.toLocaleString()} د.ع)`);
  }

  let finalOfferWholesale = updates.offerWholesalePrice !== undefined
    ? (updates.offerWholesalePrice ? toNumber(updates.offerWholesalePrice) : null)
    : (current.offerWholesalePrice || null);

  let finalOrigWholesale = updates.originalWholesalePrice !== undefined
    ? (updates.originalWholesalePrice ? toNumber(updates.originalWholesalePrice) : null)
    : (current.originalWholesalePrice || null);

  if (finalOfferWholesale && finalOrigWholesale && finalOfferWholesale >= finalOrigWholesale) {
    throw new Error(`سعر جملة العرض (${finalOfferWholesale.toLocaleString()} د.ع) يجب أن يكون أقل من سعر الجملة الأصلي (${finalOrigWholesale.toLocaleString()} د.ع)`);
  }

  const finalEndDateStr = updates.endDate || current.endDate;
  const finalEndDate = new Date(finalEndDateStr);
  const finalStartDateStr = updates.startDate !== undefined ? updates.startDate : current.startDate;
  const finalStartDate = finalStartDateStr ? new Date(finalStartDateStr) : null;

  if (isNaN(finalEndDate.getTime())) {
    throw new Error('تاريخ انتهاء العرض غير صالح');
  }

  if (finalStartDate && isNaN(finalStartDate.getTime())) {
    throw new Error('تاريخ بدء العرض غير صالح');
  }

  if (finalStartDate && finalEndDate <= finalStartDate) {
    throw new Error('تاريخ انتهاء العرض يجب أن يكون بعد تاريخ البدء');
  }

  const finalIsActive = updates.isActive !== undefined ? Boolean(updates.isActive) : current.isActive;

  // Check overlap if offer is active
  if (finalIsActive) {
    const overlap = await checkOfferTimeOverlap(
      current.productId,
      finalStartDate ? finalStartDate.toISOString() : null,
      finalEndDate.toISOString(),
      current.id,
      sql
    );
    if (overlap.overlaps) {
      throw new Error('يوجد عرض آخر نشط أو مجدول لنفس المنتج يتداخل مع هذه الفترة الزمنية');
    }
  }

  const discountPercent = finalOrigPrice > 0 && finalOfferPrice < finalOrigPrice
    ? Number((((finalOrigPrice - finalOfferPrice) / finalOrigPrice) * 100).toFixed(2))
    : null;

  await db
    .update(productOffers)
    .set({
      originalPrice: String(finalOrigPrice.toFixed(2)),
      originalWholesalePrice: finalOrigWholesale ? String(finalOrigWholesale.toFixed(2)) : null,
      offerPrice: String(finalOfferPrice.toFixed(2)),
      offerWholesalePrice: finalOfferWholesale ? String(finalOfferWholesale.toFixed(2)) : null,
      discountPercent: discountPercent ? String(discountPercent.toFixed(2)) : null,
      badge: updates.badge !== undefined ? (updates.badge.trim() || '🔥 عرض خاص') : current.badge,
      startDate: finalStartDate || null,
      endDate: finalEndDate,
      isActive: finalIsActive,
    })
    .where(eq(productOffers.id, id));

  // Audit log
  try {
    await db.insert(auditLogs).values({
      actionType: 'offer_updated',
      actionLabel: 'تعديل عرض ترويجي',
      category: 'marketing',
      categoryLabel: 'العروض والتخفيضات',
      operatorSnapshot: operator || null,
      targetType: 'offer',
      targetId: id,
      targetReferenceNumber: current.productName,
      details: `تم تعديل العرض الخاص بالمنتج "${current.productName}" بواسطة ${operator?.name || operator?.username || 'الإدارة'}`,
      severity: 'info',
    });
  } catch (e) {
    console.error('Failed to log offer update audit:', e);
  }

  const updated = await pgGetOfferById(id);
  return updated!;
}

/**
 * 6. pgDeleteOffer: Safely handles offer removal with strict historical protection.
 * If the offer was used in any historical order (order_items.offer_id_snap), it is archived
 * and deactivated (is_archived = true, is_active = false) to protect invoice history.
 * If never used, it is safely physically deleted.
 */
export async function pgDeleteOffer(
  id: string,
  operator?: PgOperator
): Promise<{ deleted: boolean; archived: boolean; message: string }> {
  if (!id || !isUuid(id)) {
    throw new Error('معرّف العرض غير صالح');
  }

  const db = getDb();
  const sql = getPostgresClient();

  const current = await pgGetOfferById(id);
  if (!current) {
    throw new Error('العرض المطلوب حذفه غير موجود');
  }

  // Check if this offer has ever been applied to any invoice/order_item
  const [usageCheck] = await sql`
    SELECT COUNT(*)::int as count
    FROM order_items
    WHERE offer_id_snap = ${id}
    LIMIT 1;
  `;

  const timesUsed = usageCheck ? Number(usageCheck.count || 0) : 0;

  if (timesUsed > 0) {
    // Offer was historically used: ARCHIVE AND DEACTIVATE ONLY (Do NOT hard delete)
    await sql`
      UPDATE product_offers
      SET is_active = false,
          is_archived = true,
          archived_at = NOW()
      WHERE id = ${id};
    `;

    // Audit log
    try {
      await db.insert(auditLogs).values({
        actionType: 'offer_archived',
        actionLabel: 'أرشفة وتعطيل عرض مستخدم تاريخياً',
        category: 'marketing',
        categoryLabel: 'العروض والتخفيضات',
        operatorSnapshot: operator || null,
        targetType: 'offer',
        targetId: id,
        targetReferenceNumber: current.productName,
        details: `تمت أرشفة وتعطيل العرض الخاص بالمنتج "${current.productName}" لوجود سجل استخدام في ${timesUsed} بند فاتورة سابق بواسطة ${operator?.name || operator?.username || 'الإدارة'}`,
        severity: 'info',
      });
    } catch (e) {
      console.error('Failed to log offer archive audit:', e);
    }

    return {
      deleted: false,
      archived: true,
      message: `تمت أرشفة وتعطيل العرض بنجاح بدلاً من حذفه لوجود ${timesUsed} بند فاتورة مرتبط به تاريخياً`,
    };
  }

  // Never used in any invoice: safe to physically delete
  await sql`DELETE FROM product_offers WHERE id = ${id};`;

  // Audit log
  try {
    await db.insert(auditLogs).values({
      actionType: 'offer_deleted',
      actionLabel: 'حذف عرض ترويجي',
      category: 'marketing',
      categoryLabel: 'العروض والتخفيضات',
      operatorSnapshot: operator || null,
      targetType: 'offer',
      targetId: id,
      targetReferenceNumber: current.productName,
      details: `تم حذف العرض الخاص بالمنتج "${current.productName}" (لم يُستخدم في أي فاتورة) بواسطة ${operator?.name || operator?.username || 'الإدارة'}`,
      severity: 'warning',
    });
  } catch (e) {
    console.error('Failed to log offer delete audit:', e);
  }

  return {
    deleted: true,
    archived: false,
    message: 'تم حذف العرض بنجاح لعدم وجود فواتير سابقة مرتبطة به',
  };
}
