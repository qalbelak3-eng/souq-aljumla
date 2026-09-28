import { eq, sql, desc, and, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { coupons, couponRedemptions, auditLogs } from '@/db/schema';
import { Coupon } from '@/types';
import { initialCoupons } from '@/data/initialData';
import { normalizePhoneForFinancialIdentity } from '@/lib/phone-utils';

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
  const maxDiscountRaw = r.maxDiscountAmount ?? r.max_discount_amount;
  const perCustomerLimitRaw = r.perCustomerLimit ?? r.per_customer_limit;
  const excludeDiscountedRaw = r.excludeDiscountedItems ?? r.exclude_discounted_items;

  return {
    id: r.id,
    code: String(r.code).toUpperCase().trim(),
    discountType: (r.discountType || r.discount_type) as 'percentage' | 'fixed',
    discountValue: Number(r.discountValue ?? r.discount_value),
    minOrderAmount: (r.minOrderAmount ?? r.min_order_amount) !== null && (r.minOrderAmount ?? r.min_order_amount) !== undefined
      ? Number(r.minOrderAmount ?? r.min_order_amount)
      : undefined,
    maxDiscountAmount: maxDiscountRaw !== null && maxDiscountRaw !== undefined && !isNaN(Number(maxDiscountRaw)) && Number(maxDiscountRaw) > 0
      ? Number(maxDiscountRaw)
      : undefined,
    perCustomerLimit: perCustomerLimitRaw !== null && perCustomerLimitRaw !== undefined && !isNaN(Number(perCustomerLimitRaw)) && Number(perCustomerLimitRaw) > 0
      ? Math.round(Number(perCustomerLimitRaw))
      : undefined,
    excludeDiscountedItems: Boolean(excludeDiscountedRaw ?? false),
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
    isArchived: Boolean(r.isArchived ?? r.is_archived ?? false),
    archivedAt: (r.archivedAt ?? r.archived_at)
      ? new Date(r.archivedAt ?? r.archived_at).toISOString()
      : undefined,
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
            isArchived: false,
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
 * By default filters out archived coupons unless includeArchived is true.
 */
export async function pgGetCoupons(includeArchived = false): Promise<Coupon[]> {
  const db = getDb();
  const whereClause = includeArchived ? undefined : eq(coupons.isArchived, false);
  let rows = whereClause
    ? await db.select().from(coupons).where(whereClause).orderBy(desc(coupons.createdAt))
    : await db.select().from(coupons).orderBy(desc(coupons.createdAt));

  if (rows.length === 0 && !includeArchived) {
    await pgSeedInitialCoupons();
    rows = await db.select().from(coupons).where(eq(coupons.isArchived, false)).orderBy(desc(coupons.createdAt));
  }
  return rows.map(mapPgCouponRowToCoupon);
}

/**
 * Finds a coupon by exact or uppercase code (excluding archived).
 */
export async function pgGetCouponByCode(code: string): Promise<Coupon | null> {
  const clean = (code || '').trim().toUpperCase();
  if (!clean) return null;

  const db = getDb();
  let rows = await db
    .select()
    .from(coupons)
    .where(and(sql`UPPER(TRIM(${coupons.code})) = ${clean}`, eq(coupons.isArchived, false)))
    .limit(1);

  if (rows.length === 0) {
    const existing = await db.select({ count: sql<number>`count(*)` }).from(coupons);
    if (Number(existing[0]?.count || 0) === 0) {
      await pgSeedInitialCoupons();
      rows = await db
        .select()
        .from(coupons)
        .where(and(sql`UPPER(TRIM(${coupons.code})) = ${clean}`, eq(coupons.isArchived, false)))
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
  maxDiscountAmount?: number | string | null;
  perCustomerLimit?: number | string | null;
  excludeDiscountedItems?: boolean;
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

  const maxDiscount = data.maxDiscountAmount !== undefined && data.maxDiscountAmount !== null && !isNaN(Number(data.maxDiscountAmount)) && Number(data.maxDiscountAmount) > 0
    ? String(Number(data.maxDiscountAmount))
    : null;

  const perCustomerLimit = data.perCustomerLimit !== undefined && data.perCustomerLimit !== null && !isNaN(Number(data.perCustomerLimit)) && Number(data.perCustomerLimit) > 0
    ? Math.round(Number(data.perCustomerLimit))
    : null;

  const excludeDiscountedItems = Boolean(data.excludeDiscountedItems ?? false);

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
      maxDiscountAmount: maxDiscount,
      perCustomerLimit,
      excludeDiscountedItems,
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

  if (updates.maxDiscountAmount !== undefined) {
    updateFields.maxDiscountAmount = updates.maxDiscountAmount !== null && !isNaN(Number(updates.maxDiscountAmount)) && Number(updates.maxDiscountAmount) > 0
      ? String(Number(updates.maxDiscountAmount))
      : null;
  }

  if (updates.perCustomerLimit !== undefined) {
    updateFields.perCustomerLimit = updates.perCustomerLimit !== null && !isNaN(Number(updates.perCustomerLimit)) && Number(updates.perCustomerLimit) > 0
      ? Math.round(Number(updates.perCustomerLimit))
      : null;
  }

  if (updates.excludeDiscountedItems !== undefined) {
    updateFields.excludeDiscountedItems = Boolean(updates.excludeDiscountedItems);
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
  const usageCount = Number(current.usageCount || 0);

  if (usageCount > 0) {
    // Preserve historical data: Archive & Deactivate used coupon instead of physical delete (Requirement D)
    const archivedCode = `${current.code}_ARCHIVED_${Date.now()}`;
    await db
      .update(coupons)
      .set({
        isActive: false,
        isArchived: true,
        archivedAt: new Date(),
        code: archivedCode,
      })
      .where(eq(coupons.id, current.id));

    // Audit log
    try {
      await db.insert(auditLogs).values({
        actionType: 'coupon_archived',
        actionLabel: 'أرشفة وتعطيل كود خصم مستخدم',
        category: 'marketing',
        categoryLabel: 'التسويق والكوبونات',
        operatorSnapshot: operator || null,
        targetType: 'coupon',
        targetId: current.id,
        targetReferenceNumber: current.code,
        details: `تمت أرشفة وتعطيل كود الخصم ${current.code} لاحتوائه على سجل استخدام سابق (${usageCount} طلبية) بواسطة ${operator?.name || operator?.username || 'الإدارة'}`,
        severity: 'info',
      });
    } catch (e) {
      console.error('Failed to log coupon archive audit:', e);
    }

    return true;
  }

  // Never used in any order: physical delete is safe
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
 * Calculates coupon discount server-side based on authoritative rules:
 * - Percentage: min(eligibleSubtotal * percentage / 100, maxDiscountAmount || infinity)
 * - Fixed: min(discountValue, eligibleSubtotal)
 * - Discount cannot exceed eligibleSubtotal and cannot be negative.
 */
export function calculateCouponDiscount(
  coupon: {
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    maxDiscountAmount?: number | null;
  },
  eligibleSubtotal: number
): number {
  if (eligibleSubtotal <= 0) return 0;
  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = Math.round((eligibleSubtotal * coupon.discountValue) / 100);
    if (coupon.maxDiscountAmount !== undefined && coupon.maxDiscountAmount !== null && Number(coupon.maxDiscountAmount) > 0) {
      discount = Math.min(discount, Number(coupon.maxDiscountAmount));
    }
  } else {
    discount = Math.min(eligibleSubtotal, coupon.discountValue);
  }
  return Math.max(0, Math.min(eligibleSubtotal, discount));
}

/**
 * Counts successful coupon redemptions for a specific customer identity.
 * Evaluates both registered customer ID and normalized phone number.
 */
export async function getCustomerCouponRedemptionCount(
  couponId: string,
  customer: { customerId?: string | null; customerPhone?: string | null },
  runner?: any
): Promise<number> {
  const client = (runner && typeof runner.select === 'function') ? runner : getDb();
  const cleanPhone = customer.customerPhone ? normalizePhoneForFinancialIdentity(customer.customerPhone) : null;
  const custId = customer.customerId ? String(customer.customerId).trim() : null;

  if (!cleanPhone && !custId) {
    return 0;
  }

  let condition;
  if (cleanPhone && custId) {
    condition = and(
      eq(couponRedemptions.couponId, couponId),
      or(eq(couponRedemptions.customerPhone, cleanPhone), eq(couponRedemptions.customerId, custId))
    );
  } else if (cleanPhone) {
    condition = and(
      eq(couponRedemptions.couponId, couponId),
      eq(couponRedemptions.customerPhone, cleanPhone)
    );
  } else {
    condition = and(
      eq(couponRedemptions.couponId, couponId),
      eq(couponRedemptions.customerId, custId!)
    );
  }

  const rows = await client
    .select({ count: sql<number>`count(*)` })
    .from(couponRedemptions)
    .where(condition);

  return Number(rows[0]?.count || 0);
}

/**
 * Strictly validates a coupon server-side without altering usageCount.
 * Validates existence, active flag, expiration, global usage limit, per-customer limit,
 * target audience, minimum order amount, and calculates discount on eligible subtotal.
 */
export async function pgValidateCoupon(
  code: string,
  subtotal: number,
  userAccountType?: string,
  options?: {
    eligibleSubtotal?: number;
    customerId?: string | null;
    customerPhone?: string | null;
  }
): Promise<{
  valid: boolean;
  coupon?: Coupon;
  discount: number;
  eligibleSubtotal: number;
  message: string;
}> {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, discount: 0, eligibleSubtotal: 0, message: 'يرجى إدخال كود الخصم' };
  }

  const coupon = await pgGetCouponByCode(cleanCode);
  if (!coupon) {
    return { valid: false, discount: 0, eligibleSubtotal: 0, message: 'كود الخصم غير صالح أو غير موجود' };
  }

  // 1. Active status check
  if (!coupon.isActive) {
    return { valid: false, discount: 0, eligibleSubtotal: 0, message: 'كود الخصم غير مفعّل حالياً' };
  }

  // 2. Expiration check
  if (coupon.expiresAt) {
    const expTime = new Date(coupon.expiresAt).getTime();
    if (expTime < Date.now()) {
      return { valid: false, discount: 0, eligibleSubtotal: 0, message: 'كود الخصم منتهي الصلاحية' };
    }
  }

  // 3. Global usage limit check
  if (coupon.usageLimit !== undefined && coupon.usageLimit !== null && (coupon.usageCount || 0) >= coupon.usageLimit) {
    return { valid: false, discount: 0, eligibleSubtotal: 0, message: 'تم الوصول إلى الحد الأقصى لاستخدام هذا الكوبون' };
  }

  // 4. Target audience check
  if (coupon.targetAudience && coupon.targetAudience !== 'all') {
    const effectiveType = userAccountType || 'individual';
    if (coupon.targetAudience === 'market' && effectiveType !== 'market') {
      return { valid: false, discount: 0, eligibleSubtotal: 0, message: 'هذا الكوبون مخصص لحسابات أصحاب الماركتات والمحلات فقط 🏪' };
    }
    if (coupon.targetAudience === 'wholesale' && effectiveType !== 'wholesale' && effectiveType !== 'merchant') {
      return { valid: false, discount: 0, eligibleSubtotal: 0, message: 'هذا الكوبون مخصص لحسابات كبار تجار الجملة VIP فقط 👑' };
    }
    if (coupon.targetAudience === 'individual' && effectiveType !== 'individual') {
      return { valid: false, discount: 0, eligibleSubtotal: 0, message: 'هذا الكوبون مخصص لزبائن الشراء بالمفرد فقط 🛒' };
    }
  }

  // 5. Minimum order amount check (evaluated against overall cart subtotal)
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    return {
      valid: false,
      discount: 0,
      eligibleSubtotal: 0,
      message: `الحد الأدنى لتطبيق هذا الكوبون هو ${coupon.minOrderAmount.toLocaleString()} د.ع`,
    };
  }

  // 6. Per-Customer usage limit check
  if (coupon.perCustomerLimit && coupon.perCustomerLimit > 0) {
    if (options?.customerId || options?.customerPhone) {
      const cleanPhone = options.customerPhone ? normalizePhoneForFinancialIdentity(options.customerPhone) : null;
      const custId = options.customerId ? String(options.customerId).trim() : null;

      if (options.customerPhone && !cleanPhone && !custId) {
        return {
          valid: false,
          discount: 0,
          eligibleSubtotal: 0,
          message: 'رقم هاتف العميل غير صالح ولا يمكن التحقق من حد استخدام الكوبون',
        };
      }

      const db = getDb();
      const userRedemptions = await getCustomerCouponRedemptionCount(
        coupon.id!,
        { customerId: custId, customerPhone: cleanPhone },
        db
      );
      if (userRedemptions >= coupon.perCustomerLimit) {
        return {
          valid: false,
          discount: 0,
          eligibleSubtotal: 0,
          message: `لقد استنفدت الحد الأقصى المسموح به لاستخدام هذا الكوبون (${coupon.perCustomerLimit} مرة)`,
        };
      }
    }
  }

  // 7. Determine eligible subtotal based on excludeDiscountedItems
  const effectiveEligibleSubtotal = coupon.excludeDiscountedItems
    ? (options?.eligibleSubtotal !== undefined ? Math.max(0, options.eligibleSubtotal) : subtotal)
    : subtotal;

  if (coupon.excludeDiscountedItems && effectiveEligibleSubtotal <= 0) {
    return {
      valid: false,
      discount: 0,
      eligibleSubtotal: 0,
      message: 'كافة المنتجات في السلة مشمولة بعروض خاصة ومستثناة من تطبيق هذا الكوبون',
    };
  }

  // 8. Calculate authoritative discount
  const discount = calculateCouponDiscount(coupon, effectiveEligibleSubtotal);

  return {
    valid: true,
    coupon,
    discount,
    eligibleSubtotal: effectiveEligibleSubtotal,
    message: `تم تطبيق خصم ${discount.toLocaleString()} د.ع بنجاح!`,
  };
}

/**
 * Atomically validates and consumes a coupon during order creation.
 * Increments usage_count atomically using PostgreSQL row lock and conditional update,
 * enforces per-customer limit via transaction-level advisory locks and redemption history,
 * records coupon redemption details, and calculates discount on eligible subtotal.
 */
export async function pgConsumeCoupon(
  code: string,
  subtotal: number,
  userAccountType?: string,
  txOrOptions?: any,
  maybeOptions?: {
    eligibleSubtotal?: number;
    customerId?: string | null;
    customerPhone?: string | null;
    orderId?: string;
    orderNumber?: string;
    recordRedemptionImmediately?: boolean;
  }
): Promise<{
  coupon: Coupon;
  discount: number;
  eligibleSubtotal: number;
  redemptionId?: string;
}> {
  let tx = txOrOptions;
  let options = maybeOptions;
  if (
    txOrOptions &&
    typeof txOrOptions === 'object' &&
    typeof txOrOptions.select !== 'function' &&
    typeof txOrOptions.execute !== 'function'
  ) {
    if (
      'customerPhone' in txOrOptions ||
      'customerId' in txOrOptions ||
      'eligibleSubtotal' in txOrOptions ||
      'orderId' in txOrOptions ||
      'recordRedemptionImmediately' in txOrOptions
    ) {
      options = txOrOptions;
      tx = undefined;
    }
  }

  const runner = (tx && typeof tx.select === 'function') ? tx : getDb();
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

  // Per-customer concurrency lock and usage limit enforcement
  if (cBefore.perCustomerLimit && cBefore.perCustomerLimit > 0) {
    if (options?.customerPhone || options?.customerId) {
      const cleanPhone = options.customerPhone ? normalizePhoneForFinancialIdentity(options.customerPhone) : null;
      const custId = options.customerId ? String(options.customerId).trim() : null;

      if (!cleanPhone && !custId) {
        throw new Error('رقم هاتف العميل غير صالح ولا يمكن تطبيق حد الاستخدام للكوبون بدونه');
      }

      const lockKey = cleanPhone
        ? `coupon:${cBefore.id}:${cleanPhone}`
        : `coupon:${cBefore.id}:${custId}`;
      await runner.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      const redemptionsCount = await getCustomerCouponRedemptionCount(
        cBefore.id!,
        { customerId: custId, customerPhone: cleanPhone },
        runner
      );
      if (redemptionsCount >= cBefore.perCustomerLimit) {
        throw new Error(`لقد تم استنفاد الحد الأقصى المسموح به لاستخدام هذا الكوبون (${cBefore.perCustomerLimit} مرة) لهذا الحساب/الهاتف`);
      }
    }
  }

  // Atomic row-level conditional update for global usage limit
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

  const effectiveEligible = consumedCoupon.excludeDiscountedItems
    ? (options?.eligibleSubtotal !== undefined ? Math.max(0, options.eligibleSubtotal) : subtotal)
    : subtotal;

  if (consumedCoupon.excludeDiscountedItems && effectiveEligible <= 0) {
    throw new Error('كافة المنتجات في السلة مشمولة بعروض خاصة ومستثناة من تطبيق هذا الكوبون');
  }

  const discount = calculateCouponDiscount(consumedCoupon, effectiveEligible);

  let redemptionId: string | undefined = undefined;
  if (options?.recordRedemptionImmediately && options?.orderId && options?.orderNumber) {
    redemptionId = await pgRecordCouponRedemption(runner, {
      couponId: consumedCoupon.id!,
      orderId: options.orderId,
      orderNumber: options.orderNumber,
      customerId: options.customerId,
      customerPhone: options.customerPhone,
      discountAmount: discount,
    });
  }

  return {
    coupon: consumedCoupon,
    discount,
    eligibleSubtotal: effectiveEligible,
    redemptionId,
  };
}

/**
 * Records a successful coupon redemption linked to an existing order.
 * Must be executed within the order creation transaction or directly with db runner.
 */
export async function pgRecordCouponRedemption(
  tx: any,
  data: {
    couponId: string;
    orderId: string;
    orderNumber: string;
    customerId?: string | null;
    customerPhone?: string | null;
    discountAmount: number;
  }
): Promise<string | undefined> {
  const runner = (tx && typeof tx.insert === 'function') ? tx : getDb();
  const cleanPhone = data.customerPhone ? normalizePhoneForFinancialIdentity(data.customerPhone) : null;
  if (!cleanPhone) {
    throw new Error(`رقم هاتف العميل غير صالح (${data.customerPhone || 'فارغ'}) ولا يمكن تسجيل استرداد الكوبون به`);
  }

  try {
    const [redemption] = await runner
      .insert(couponRedemptions)
      .values({
        couponId: data.couponId,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        customerId: data.customerId || null,
        customerPhone: cleanPhone,
        discountAmount: String(Number(data.discountAmount || 0).toFixed(2)),
      })
      .returning();

    return redemption?.id;
  } catch (err: any) {
    // Specifically handle PostgreSQL unique constraint violation on coupon_redemptions_order_id_unique (code 23505)
    const isCode23505 = err?.code === '23505' || err?.cause?.code === '23505';
    const constraintName = err?.constraint || err?.cause?.constraint || err?.cause?.constraint_name || '';
    const errMessage = (err?.message || '') + ' ' + (err?.cause?.message || '');
    const isOrderUniqueViolation =
      isCode23505 &&
      (constraintName === 'coupon_redemptions_order_id_unique' ||
        errMessage.includes('coupon_redemptions_order_id_unique'));

    if (isOrderUniqueViolation) {
      const existing = await runner
        .select({
          id: couponRedemptions.id,
          couponId: couponRedemptions.couponId,
        })
        .from(couponRedemptions)
        .where(eq(couponRedemptions.orderId, data.orderId))
        .limit(1);

      if (existing.length > 0) {
        const prev = existing[0];
        if (prev.couponId === data.couponId) {
          return prev.id;
        }
        throw new Error(
          `تعارض في سلامة البيانات: الطلب (${data.orderNumber}) مسجل له استرداد كوبون مسبقاً بكوبون مختلف (${prev.couponId}) عن الكوبون المطلوب (${data.couponId})`
        );
      }
    }

    throw err;
  }
}
