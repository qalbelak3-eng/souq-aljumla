import { eq, sql, desc } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { coupons, auditLogs } from '@/db/schema';
import { Coupon } from '@/types';
import { initialCoupons } from '@/data/initialData';

export type PgOperator = {
  id?: string | null;
  name?: string | null;
  username?: string | null;
  role?: string | null;
};

/**
 * Maps a PostgreSQL coupons row to the standard Coupon domain interface.
 */
export function mapPgCouponRowToCoupon(r: any): Coupon {
  return {
    id: r.id,
    code: String(r.code).toUpperCase().trim(),
    discountType: (r.discountType || r.discount_type) as 'percentage' | 'fixed',
    discountValue: Number(r.discountValue ?? r.discount_value),
    minOrderAmount: (r.minOrderAmount ?? r.min_order_amount) !== null && (r.minOrderAmount ?? r.min_order_amount) !== undefined
      ? Number(r.minOrderAmount ?? r.min_order_amount)
      : undefined,
    targetAudience: ((r.targetAudience ?? r.target_audience) || 'all') as 'all' | 'individual' | 'market' | 'wholesale',
    description: (r.description ?? '') ? String(r.description).trim() : undefined,
    usageLimit: (r.usageLimit ?? r.usage_limit) !== null && (r.usageLimit ?? r.usage_limit) !== undefined
      ? Number(r.usageLimit ?? r.usage_limit)
      : undefined,
    usageCount: Number(r.usageCount ?? r.usage_count ?? 0),
    expiresAt: (r.expiresAt ?? r.expires_at)
      ? new Date(r.expiresAt ?? r.expires_at).toISOString()
      : undefined,
    isActive: Boolean(r.isActive ?? r.is_active),
  };
}

/**
 * Seeds initial coupons into PostgreSQL if table is empty.
 */
export async function pgSeedInitialCoupons(): Promise<void> {
  const db = getDb();
  try {
    const existing = await db.select({ count: sql<number>`count(*)` }).from(coupons);
    const count = Number(existing[0]?.count || 0);
    if (count === 0 && initialCoupons && initialCoupons.length > 0) {
      for (const init of initialCoupons) {
        await db
          .insert(coupons)
          .values({
            code: init.code.trim().toUpperCase(),
            discountType: init.discountType,
            discountValue: String(init.discountValue),
            minOrderAmount: init.minOrderAmount !== undefined && init.minOrderAmount !== null ? String(init.minOrderAmount) : null,
            targetAudience: init.targetAudience || 'all',
            description: init.description || null,
            usageLimit: init.usageLimit !== undefined && init.usageLimit !== null ? init.usageLimit : null,
            usageCount: init.usageCount || 0,
            expiresAt: init.expiresAt ? new Date(init.expiresAt) : null,
            isActive: init.isActive ?? true,
          })
          .onConflictDoNothing();
      }
    }
  } catch (err) {
    console.error('Error seeding initial coupons to PostgreSQL:', err);
  }
}

/**
 * Fetches all coupons from PostgreSQL, ordered by created_at DESC.
 * Seeds initialCoupons if the table is empty.
 */
export async function pgGetCoupons(): Promise<Coupon[]> {
  const db = getDb();
  let rows = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  if (rows.length === 0) {
    await pgSeedInitialCoupons();
    rows = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  }
  return rows.map(mapPgCouponRowToCoupon);
}

/**
 * Finds a coupon by exact or uppercase code.
 */
export async function pgGetCouponByCode(code: string): Promise<Coupon | null> {
  const clean = (code || '').trim().toUpperCase();
  if (!clean) return null;

  const db = getDb();
  let rows = await db
    .select()
    .from(coupons)
    .where(sql`UPPER(TRIM(${coupons.code})) = ${clean}`)
    .limit(1);

  if (rows.length === 0) {
    const existing = await db.select({ count: sql<number>`count(*)` }).from(coupons);
    if (Number(existing[0]?.count || 0) === 0) {
      await pgSeedInitialCoupons();
      rows = await db
        .select()
        .from(coupons)
        .where(sql`UPPER(TRIM(${coupons.code})) = ${clean}`)
        .limit(1);
    }
  }

  if (rows.length === 0) return null;
  return mapPgCouponRowToCoupon(rows[0]);
}

/**
 * Finds a coupon by UUID.
 */
export async function pgGetCouponById(id: string): Promise<Coupon | null> {
  const clean = (id || '').trim();
  if (!clean) return null;

  const db = getDb();
  const rows = await db
    .select()
    .from(coupons)
    .where(eq(coupons.id, clean))
    .limit(1);

  if (rows.length === 0) return null;
  return mapPgCouponRowToCoupon(rows[0]);
}

export interface CreateCouponInput {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number | string;
  minOrderAmount?: number | string | null;
  targetAudience?: 'all' | 'individual' | 'market' | 'wholesale';
  description?: string | null;
  usageLimit?: number | string | null;
  expiresAt?: string | null;
  isActive?: boolean;
}

/**
 * Creates a new coupon in PostgreSQL with validation and audit logging.
 */
export async function pgCreateCoupon(
  data: CreateCouponInput,
  operator?: PgOperator
): Promise<Coupon> {
  const db = getDb();
  const cleanCode = (data.code || '').trim().toUpperCase();
  if (!cleanCode) {
    throw new Error('يرجى كتابة كود الخصم');
  }
  if (!data.discountType || !['percentage', 'fixed'].includes(data.discountType)) {
    throw new Error('نوع الخصم غير صالح (يجب أن يكون نسبة percentage أو مبلغ ثابت fixed)');
  }

  const val = Number(data.discountValue);
  if (isNaN(val) || val <= 0) {
    throw new Error('قيمة الخصم يجب أن تكون رقماً أكبر من صفر');
  }
  if (data.discountType === 'percentage' && val > 100) {
    throw new Error('نسبة الخصم لا يمكن أن تتجاوز 100%');
  }

  // Ensure code uniqueness (case-insensitive)
  const existing = await db
    .select()
    .from(coupons)
    .where(sql`UPPER(TRIM(${coupons.code})) = ${cleanCode}`)
    .limit(1);

  if (existing.length > 0) {
    throw new Error(`كود الخصم (${cleanCode}) موجود مسبقاً`);
  }

  const minOrder = data.minOrderAmount !== undefined && data.minOrderAmount !== null && !isNaN(Number(data.minOrderAmount)) && Number(data.minOrderAmount) > 0
    ? String(Number(data.minOrderAmount))
    : null;

  const usageLimit = data.usageLimit !== undefined && data.usageLimit !== null && !isNaN(Number(data.usageLimit)) && Number(data.usageLimit) > 0
    ? Math.round(Number(data.usageLimit))
    : null;

  const expiresAt = data.expiresAt && data.expiresAt.trim() ? new Date(data.expiresAt) : null;
  if (expiresAt && isNaN(expiresAt.getTime())) {
    throw new Error('تاريخ انتهاء الصلاحية غير صالح');
  }

  const [inserted] = await db
    .insert(coupons)
    .values({
      code: cleanCode,
      discountType: data.discountType,
      discountValue: String(val.toFixed(2)),
      minOrderAmount: minOrder,
      targetAudience: data.targetAudience || 'all',
      description: data.description?.trim() || null,
      usageLimit,
      usageCount: 0,
      expiresAt,
      isActive: data.isActive ?? true,
    })
    .returning();

  // Audit log
  try {
    await db.insert(auditLogs).values({
      actionType: 'coupon_created',
      actionLabel: 'إنشاء كود خصم جديد',
      category: 'marketing',
      categoryLabel: 'التسويق والكوبونات',
      operatorSnapshot: operator || null,
      targetType: 'coupon',
      targetId: inserted.id,
      targetReferenceNumber: inserted.code,
      details: `تم إنشاء كود الخصم ${inserted.code} بقيمة ${val}${data.discountType === 'percentage' ? '%' : ' د.ع'} بواسطة ${operator?.name || operator?.username || 'الإدارة'}`,
      severity: 'info',
    });
  } catch (e) {
    console.error('Failed to log coupon creation audit:', e);
  }

  return mapPgCouponRowToCoupon(inserted);
}

/**
 * Updates an existing coupon by UUID or Code with validation and audit logging.
 */
export async function pgUpdateCoupon(
  idOrCode: string,
  updates: Partial<Coupon>,
  operator?: PgOperator
): Promise<Coupon | null> {
  const db = getDb();
  const trimmed = (idOrCode || '').trim();
  if (!trimmed) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  const existing = await db
    .select()
    .from(coupons)
    .where(isUuid ? eq(coupons.id, trimmed) : sql`UPPER(TRIM(${coupons.code})) = ${trimmed.toUpperCase()}`)
    .limit(1);

  if (existing.length === 0) return null;
  const current = existing[0];

  const updateFields: any = {};

  if (updates.code !== undefined) {
    const cleanCode = updates.code.trim().toUpperCase();
    if (!cleanCode) throw new Error('كود الخصم لا يمكن أن يكون فارغاً');
    if (cleanCode !== current.code.toUpperCase()) {
      const dup = await db
        .select()
        .from(coupons)
        .where(sql`UPPER(TRIM(${coupons.code})) = ${cleanCode} AND ${coupons.id} != ${current.id}`)
        .limit(1);
      if (dup.length > 0) throw new Error(`كود الخصم (${cleanCode}) مستخدم بالفعل في كوبون آخر`);
    }
    updateFields.code = cleanCode;
  }

  const finalDiscountType = updates.discountType || current.discountType;
  if (updates.discountType !== undefined) {
    if (!['percentage', 'fixed'].includes(updates.discountType)) {
      throw new Error('نوع الخصم غير صالح');
    }
    updateFields.discountType = updates.discountType;
  }

  if (updates.discountValue !== undefined) {
    const val = Number(updates.discountValue);
    if (isNaN(val) || val <= 0) throw new Error('قيمة الخصم يجب أن تكون رقماً أكبر من صفر');
    if (finalDiscountType === 'percentage' && val > 100) {
      throw new Error('نسبة الخصم لا يمكن أن تتجاوز 100%');
    }
    updateFields.discountValue = String(val.toFixed(2));
  }

  if (updates.minOrderAmount !== undefined) {
    updateFields.minOrderAmount = updates.minOrderAmount !== null && !isNaN(Number(updates.minOrderAmount)) && Number(updates.minOrderAmount) > 0
      ? String(Number(updates.minOrderAmount))
      : null;
  }

  if (updates.targetAudience !== undefined) {
    updateFields.targetAudience = updates.targetAudience || 'all';
  }

  if (updates.description !== undefined) {
    updateFields.description = updates.description?.trim() || null;
  }

  if (updates.usageLimit !== undefined) {
    updateFields.usageLimit = updates.usageLimit !== null && !isNaN(Number(updates.usageLimit)) && Number(updates.usageLimit) > 0
      ? Math.round(Number(updates.usageLimit))
      : null;
  }

  if (updates.expiresAt !== undefined) {
    if (updates.expiresAt && updates.expiresAt.trim()) {
      const expDate = new Date(updates.expiresAt);
      if (isNaN(expDate.getTime())) throw new Error('تاريخ انتهاء الصلاحية غير صالح');
      updateFields.expiresAt = expDate;
    } else {
      updateFields.expiresAt = null;
    }
  }

  if (updates.isActive !== undefined) {
    updateFields.isActive = Boolean(updates.isActive);
  }

  const [updated] = await db
    .update(coupons)
    .set(updateFields)
    .where(eq(coupons.id, current.id))
    .returning();

  // Audit log
  try {
    await db.insert(auditLogs).values({
      actionType: 'coupon_updated',
      actionLabel: 'تعديل كود خصم',
      category: 'marketing',
      categoryLabel: 'التسويق والكوبونات',
      operatorSnapshot: operator || null,
      targetType: 'coupon',
      targetId: updated.id,
      targetReferenceNumber: updated.code,
      details: `تم تعديل كود الخصم ${updated.code} بواسطة ${operator?.name || operator?.username || 'الإدارة'}`,
      severity: 'info',
    });
  } catch (e) {
    console.error('Failed to log coupon update audit:', e);
  }

  return mapPgCouponRowToCoupon(updated);
}

/**
 * Deletes a coupon from PostgreSQL by UUID or Code with audit logging.
 */
export async function pgDeleteCoupon(
  idOrCode: string,
  operator?: PgOperator
): Promise<boolean> {
  const db = getDb();
  const trimmed = (idOrCode || '').trim();
  if (!trimmed) return false;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  const existing = await db
    .select()
    .from(coupons)
    .where(isUuid ? eq(coupons.id, trimmed) : sql`UPPER(TRIM(${coupons.code})) = ${trimmed.toUpperCase()}`)
    .limit(1);

  if (existing.length === 0) return false;
  const current = existing[0];

  await db.delete(coupons).where(eq(coupons.id, current.id));

  // Audit log
  try {
    await db.insert(auditLogs).values({
      actionType: 'coupon_deleted',
      actionLabel: 'حذف كود خصم',
      category: 'marketing',
      categoryLabel: 'التسويق والكوبونات',
      operatorSnapshot: operator || null,
      targetType: 'coupon',
      targetId: current.id,
      targetReferenceNumber: current.code,
      details: `تم حذف كود الخصم ${current.code} بواسطة ${operator?.name || operator?.username || 'الإدارة'}`,
      severity: 'warning',
    });
  } catch (e) {
    console.error('Failed to log coupon delete audit:', e);
  }

  return true;
}

/**
 * Strictly validates a coupon server-side without altering usageCount.
 * Validates existence, active flag, expiration, usage limit, target audience, and minimum order.
 */
export async function pgValidateCoupon(
  code: string,
  subtotal: number,
  userAccountType?: string
): Promise<{ valid: boolean; coupon?: Coupon; discount: number; message: string }> {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, discount: 0, message: 'يرجى إدخال كود الخصم' };
  }

  const coupon = await pgGetCouponByCode(cleanCode);
  if (!coupon) {
    return { valid: false, discount: 0, message: 'كود الخصم غير صالح أو غير موجود' };
  }

  // 1. Active status check
  if (!coupon.isActive) {
    return { valid: false, discount: 0, message: 'كود الخصم غير مفعّل حالياً' };
  }

  // 2. Expiration check
  if (coupon.expiresAt) {
    const expTime = new Date(coupon.expiresAt).getTime();
    if (expTime < Date.now()) {
      return { valid: false, discount: 0, message: 'كود الخصم منتهي الصلاحية' };
    }
  }

  // 3. Usage limit check
  if (coupon.usageLimit !== undefined && coupon.usageLimit !== null && (coupon.usageCount || 0) >= coupon.usageLimit) {
    return { valid: false, discount: 0, message: 'تم الوصول إلى الحد الأقصى لاستخدام هذا الكوبون' };
  }

  // 4. Target audience check
  if (coupon.targetAudience && coupon.targetAudience !== 'all') {
    const effectiveType = userAccountType || 'individual';
    if (coupon.targetAudience === 'market' && effectiveType !== 'market') {
      return { valid: false, discount: 0, message: 'هذا الكوبون مخصص لحسابات أصحاب الماركتات والمحلات فقط 🏪' };
    }
    if (coupon.targetAudience === 'wholesale' && effectiveType !== 'wholesale' && effectiveType !== 'merchant') {
      return { valid: false, discount: 0, message: 'هذا الكوبون مخصص لحسابات كبار تجار الجملة VIP فقط 👑' };
    }
    if (coupon.targetAudience === 'individual' && effectiveType !== 'individual') {
      return { valid: false, discount: 0, message: 'هذا الكوبون مخصص لزبائن الشراء بالمفرد فقط 🛒' };
    }
  }

  // 5. Minimum order amount check
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    return {
      valid: false,
      discount: 0,
      message: `الحد الأدنى لتطبيق هذا الكوبون هو ${coupon.minOrderAmount.toLocaleString()} د.ع`,
    };
  }

  // 6. Discount calculation
  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = Math.round((subtotal * coupon.discountValue) / 100);
  } else {
    discount = Math.min(subtotal, coupon.discountValue);
  }
  discount = Math.max(0, Math.min(subtotal, discount));

  return {
    valid: true,
    coupon,
    discount,
    message: `تم تطبيق خصم ${discount.toLocaleString()} د.ع بنجاح!`,
  };
}

/**
 * Atomically validates and consumes a coupon during order creation.
 * Increments usage_count atomically using PostgreSQL row lock and conditional update
 * to prevent race conditions past usage_limit.
 */
export async function pgConsumeCoupon(
  code: string,
  subtotal: number,
  userAccountType?: string,
  tx?: any
): Promise<{ coupon: Coupon; discount: number }> {
  const runner = tx || getDb();
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    throw new Error('يرجى إدخال كود الخصم');
  }

  // Pre-fetch coupon for comprehensive error reporting and audience validation
  const existingRows = await runner
    .select()
    .from(coupons)
    .where(sql`UPPER(TRIM(${coupons.code})) = ${cleanCode}`)
    .limit(1);

  if (existingRows.length === 0) {
    throw new Error('كود الخصم غير صالح أو غير موجود');
  }

  const cBefore = mapPgCouponRowToCoupon(existingRows[0]);

  if (!cBefore.isActive) {
    throw new Error('كود الخصم غير مفعّل حالياً');
  }

  if (cBefore.expiresAt && new Date(cBefore.expiresAt).getTime() < Date.now()) {
    throw new Error('كود الخصم منتهي الصلاحية');
  }

  if (cBefore.usageLimit !== undefined && cBefore.usageLimit !== null && (cBefore.usageCount || 0) >= cBefore.usageLimit) {
    throw new Error('تم الوصول إلى الحد الأقصى لاستخدام هذا الكوبون');
  }

  if (cBefore.targetAudience && cBefore.targetAudience !== 'all') {
    const effectiveType = userAccountType || 'individual';
    if (cBefore.targetAudience === 'market' && effectiveType !== 'market') {
      throw new Error('هذا الكوبون مخصص لحسابات أصحاب الماركتات والمحلات فقط 🏪');
    }
    if (cBefore.targetAudience === 'wholesale' && effectiveType !== 'wholesale' && effectiveType !== 'merchant') {
      throw new Error('هذا الكوبون مخصص لحسابات كبار تجار الجملة VIP فقط 👑');
    }
    if (cBefore.targetAudience === 'individual' && effectiveType !== 'individual') {
      throw new Error('هذا الكوبون مخصص لزبائن الشراء بالمفرد فقط 🛒');
    }
  }

  if (cBefore.minOrderAmount && subtotal < cBefore.minOrderAmount) {
    throw new Error(`الحد الأدنى لتطبيق هذا الكوبون هو ${cBefore.minOrderAmount.toLocaleString()} د.ع`);
  }

  // Atomic row-level conditional update
  const updatedRows = await runner.execute(sql`
    UPDATE coupons
    SET usage_count = usage_count + 1
    WHERE id = ${cBefore.id}
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (usage_limit IS NULL OR usage_count < usage_limit)
    RETURNING *;
  `);

  const updatedRow = updatedRows[0] || updatedRows?.rows?.[0];
  if (!updatedRow) {
    // If update returned 0 rows, concurrent race condition exhausted usage limit
    throw new Error('تم الوصول إلى الحد الأقصى لاستخدام هذا الكوبون');
  }

  const consumedCoupon = mapPgCouponRowToCoupon(updatedRow);

  let discount = 0;
  if (consumedCoupon.discountType === 'percentage') {
    discount = Math.round((subtotal * consumedCoupon.discountValue) / 100);
  } else {
    discount = Math.min(subtotal, consumedCoupon.discountValue);
  }
  discount = Math.max(0, Math.min(subtotal, discount));

  return {
    coupon: consumedCoupon,
    discount,
  };
}
