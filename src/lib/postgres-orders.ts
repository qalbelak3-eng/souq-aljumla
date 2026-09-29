import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { getDb } from '@/db/client';
import {
  orders,
  orderItems,
  financialAccounts,
  products,
  productOffers,
  inventoryMovements,
  auditLogs,
  staffProfiles,
  drivers,
  vehicles,
  coupons,
  orderRefunds,
} from '@/db/schema';
import { Order, OrderItem, CustomerInfo, OrderStatus, PaymentMethod, DeliveryCollectionStatus, DeliverySubState, MerchantTier } from '@/types';
import { decryptPin, generateOrderPinData } from '@/lib/delivery-pin';
import { pgConsumeCoupon, pgRecordCouponRedemption, pgReleaseOrderCouponRedemption } from '@/lib/postgres-coupons';
import {
  pgRedeemCashbackInOrder,
  pgCreditOrderDeliveredCashback,
  pgReverseOrderRedeemedCashback,
  pgClawbackOrderDeliveredCashback,
  pgGetAccountCashbackBalance,
} from '@/lib/postgres-cashback';
import { getProductPriceForUser, resolveAuthoritativeProductPrice, validateOrderItemQuantity, normalizePricingIdentity } from '@/lib/pricing';
import { toCanonicalIraqiPhone, toLocalIraqiPhone, normalizePhoneForFinancialIdentity } from '@/lib/phone-utils';

/* =========================================================
   Types & Interfaces
   ========================================================= */

export type PgOperator = {
  id?: string | null;
  name?: string | null;
  username?: string | null;
  role?: string | null;
  permissions?: string[] | null;
};

export interface PgCreateOrderInput {
  customer: CustomerInfo;
  items: OrderItem[];
  subtotal?: number;
  deliveryFee?: number;
  discount?: number;
  couponCode?: string;
  userAccountType?: string;
  userMerchantTier?: MerchantTier;
  usedCashbackDiscount?: number;
  earnedCashback?: number;
  total?: number;
  notes?: string;
  paymentMethod?: PaymentMethod;
  status?: OrderStatus;
  accountId?: string;
  createAccountIfMissing?: boolean;
  operator?: PgOperator;
  trustSuppliedPrices?: boolean;
  idempotencyKey?: string;
}

export interface PgOrderFilters {
  userId?: string;
  phone?: string;
  email?: string;
  limit?: number;
  status?: OrderStatus;
}

/* =========================================================
   Helpers & Idempotency / Identity Resolution
   ========================================================= */

function normalizePhone(value?: string | null): string {
  return normalizePhoneForFinancialIdentity(value) || '';
}

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function generateAccountCode(): string {
  return `ACC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function isUuid(value?: string | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

/**
 * Computes deterministic SHA-256 payload fingerprint for order idempotency protection.
 * Client prices are untrusted and excluded; canonicalizes phone, items, discounts, and destinations.
 */
export function computeOrderPayloadFingerprint(data: PgCreateOrderInput): string {
  const phone = normalizePhone(data.customer?.phone);
  const userId = String(data.customer?.userId || '').trim();
  const city = String(data.customer?.city || '').trim().toLowerCase();
  const address = String(data.customer?.address || '').trim().toLowerCase();
  const sortedItems = [...(data.items || [])]
    .map((item) => ({
      productId: String(item.productId || (item as any).id || '').trim(),
      quantity: Number(item.quantity) || 0,
      saleType: String(item.saleType || 'retail').trim().toLowerCase(),
    }))
    .sort((a, b) => {
      const cmp = a.productId.localeCompare(b.productId);
      if (cmp !== 0) return cmp;
      return a.saleType.localeCompare(b.saleType);
    });
  const couponCode = (data.couponCode || '').trim().toUpperCase();
  const usedCashbackDiscount = Number(data.usedCashbackDiscount || 0);
  const paymentMethod = (data.paymentMethod || 'cod').trim().toLowerCase();

  const canonicalPayload = {
    phone,
    userId,
    city,
    address,
    items: sortedItems,
    couponCode,
    usedCashbackDiscount,
    paymentMethod,
  };

  return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
}

/**
 * Authoritative PostgreSQL customer identity resolver:
 * Fetches and resolves trusted customer profile and normalized pricing identity from financial_accounts.
 * Fully eliminates legacy data stores and in-memory user lists from order creation runtime.
 */
export async function pgResolveCustomerIdentity(
  identifier: string | { userId?: string; phone?: string; accountId?: string; merchantTier?: string },
  tx?: any
): Promise<any | null> {
  const db = tx || getDb();
  let accountId: string | undefined;
  let userId: string | undefined;
  let phone: string | undefined;
  let merchantTier: string | undefined;

  if (typeof identifier === 'string') {
    if (isUuid(identifier)) {
      userId = identifier;
      accountId = identifier;
    } else {
      phone = identifier;
    }
  } else if (identifier && typeof identifier === 'object') {
    accountId = identifier.accountId;
    userId = identifier.userId;
    phone = identifier.phone;
    merchantTier = identifier.merchantTier;
  }

  let account: any = null;

  if (accountId && isUuid(accountId)) {
    const rows = await db
      .select()
      .from(financialAccounts)
      .where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.category, 'customer')))
      .limit(1);
    if (rows.length > 0) account = rows[0];
  }

  if (!account && userId && isUuid(userId)) {
    const rows = await db
      .select()
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.category, 'customer'),
          sql`${financialAccounts.authIdentityId} = ${userId} OR ${financialAccounts.id} = ${userId}`
        )
      )
      .limit(1);
    if (rows.length > 0) account = rows[0];
  }

  if (!account && phone) {
    const cleanPhone = normalizePhone(phone);
    if (cleanPhone) {
      const rows = await db
        .select()
        .from(financialAccounts)
        .where(and(eq(financialAccounts.phone, cleanPhone), eq(financialAccounts.category, 'customer')))
        .limit(1);
      if (rows.length > 0) account = rows[0];
    }
  }

  if (!account) return null;

  const isApproved = account.merchantStatus === 'approved' && account.isActive && !account.archivedAt;
  // If customer is pending/rejected or not approved merchant, do NOT grant wholesale/market discount tier
  const effectivePricingTier = isApproved
    ? account.pricingTier
    : (account.pricingTier === 'market' || account.pricingTier === 'wholesale' ? 'retail' : account.pricingTier);
  const effectiveMerchantTier = isApproved ? (account.merchantTier || undefined) : undefined;

  const pricingIdentity = normalizePricingIdentity({
    pricingTier: effectivePricingTier,
    accountType: account.category === 'customer' ? undefined : account.category,
    merchantTier: effectiveMerchantTier,
  });

  return {
    id: account.id,
    authIdentityId: account.authIdentityId || undefined,
    name: account.name,
    businessName: account.businessName || undefined,
    phone: account.phone || '',
    role: pricingIdentity.accountType === 'wholesale' ? 'merchant' : 'customer',
    accountType: pricingIdentity.accountType,
    pricingTier: effectivePricingTier,
    merchantTier: pricingIdentity.merchantTier,
    merchantStatus: (account.merchantStatus as string) || (account.isActive && !account.archivedAt ? 'approved' : 'none'),
    fixedDiscountPercent: Number(account.fixedDiscountPercent || 0),
    city: account.city || undefined,
    address: account.address || undefined,
    isActive: Boolean(account.isActive && !account.archivedAt),
  };
}

export async function resolveStaffId(tx: any, operator?: PgOperator): Promise<string | null> {
  const username = String(operator?.username || '').trim();
  if (!username) return null;

  const rows = await tx
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.username, username))
    .limit(1);

  return rows[0]?.id || null;
}

export function formatOrderRecord(
  orderRow: any,
  itemsRows: any[],
  driverRow?: any,
  vehicleRow?: any,
  accountRow?: any,
  includePin?: boolean
): Order {
  return {
    id: String(orderRow.id),
    orderNumber: String(orderRow.orderNumber),
    customer: {
      name: String(orderRow.customerNameSnap),
      phone: String(orderRow.customerPhoneSnap),
      city: accountRow?.city || '',
      address: String(orderRow.deliveryAddressSnap),
      locationTitle: orderRow.locationTitleSnap || undefined,
      lat: orderRow.lat ? Number(orderRow.lat) : undefined,
      lng: orderRow.lng ? Number(orderRow.lng) : undefined,
      mapsUrl: orderRow.mapsUrl || undefined,
      storefrontImage: orderRow.storefrontImage || undefined,
      notes: orderRow.notes || undefined,
      isGuest: !accountRow?.authIdentityId,
      userId: accountRow?.id || undefined,
      businessName: accountRow?.businessName || undefined,
    },
    items: (itemsRows || []).map((it: any) => ({
      productId: String(it.productId),
      name: String(it.itemNameSnap),
      price: toNumber(it.unitPriceSnap),
      originalPrice: it.originalPriceSnap ? toNumber(it.originalPriceSnap) : undefined,
      offerId: it.offerIdSnap ? String(it.offerIdSnap) : undefined,
      offerDiscount: it.offerDiscountSnap ? toNumber(it.offerDiscountSnap) : undefined,
      pricingTierSnap: it.pricingTierSnap ? String(it.pricingTierSnap) : undefined,
      costPrice: toNumber(it.unitCostSnap),
      quantity: Number(it.soldQuantity),
      saleType: (it.soldUnit === 'carton' ? 'wholesale' : 'retail') as OrderItem['saleType'],
      unitLabel: String(it.unitLabelSnap),
      image: it.image || '',
      cashbackPerUnit: it.soldQuantity > 0 ? Number((toNumber(it.earnedCashback) / it.soldQuantity).toFixed(2)) : 0,
      earnedCashback: toNumber(it.earnedCashback),
    })),
    subtotal: toNumber(orderRow.subtotal),
    deliveryFee: toNumber(orderRow.deliveryFee),
    discount: toNumber(orderRow.discount),
    couponId: orderRow.couponId ? String(orderRow.couponId) : undefined,
    couponCode: orderRow.couponCodeSnap ? String(orderRow.couponCodeSnap) : undefined,
    couponDiscountType: orderRow.couponDiscountTypeSnap ? String(orderRow.couponDiscountTypeSnap) : undefined,
    couponDiscountValue: orderRow.couponDiscountValueSnap !== null && orderRow.couponDiscountValueSnap !== undefined
      ? toNumber(orderRow.couponDiscountValueSnap)
      : undefined,
    couponMaxDiscountSnap: orderRow.couponMaxDiscountSnap !== null && orderRow.couponMaxDiscountSnap !== undefined
      ? toNumber(orderRow.couponMaxDiscountSnap)
      : undefined,
    couponEligibleSubtotalSnap: orderRow.couponEligibleSubtotalSnap !== null && orderRow.couponEligibleSubtotalSnap !== undefined
      ? toNumber(orderRow.couponEligibleSubtotalSnap)
      : undefined,
    customerAccountTypeSnap: orderRow.customerAccountTypeSnap ? String(orderRow.customerAccountTypeSnap) : undefined,
    customerMerchantTierSnap: orderRow.customerMerchantTierSnap ? String(orderRow.customerMerchantTierSnap) : undefined,
    usedCashbackDiscount: toNumber(orderRow.usedCashbackDiscount),
    earnedCashback: toNumber(orderRow.earnedCashback),
    total: toNumber(orderRow.total),
    status: orderRow.status as OrderStatus,
    paymentMethod: orderRow.paymentMethod as PaymentMethod,
    notes: orderRow.notes || undefined,
    driverNotes: orderRow.driverNotes || undefined,
    paidAmount: toNumber(orderRow.collectedAmount),
    collectedAmount: toNumber(orderRow.collectedAmount),
    remainingDebtAmount: toNumber(orderRow.remainingDebtAmount),
    driverId: orderRow.driverId ? String(orderRow.driverId) : undefined,
    driverName: driverRow?.name || undefined,
    driverPhone: driverRow?.phone || undefined,
    driverAssignedAt: orderRow.driverAssignedAt ? new Date(orderRow.driverAssignedAt).toISOString() : undefined,
    vehicleId: orderRow.vehicleId ? String(orderRow.vehicleId) : undefined,
    vehicleName: vehicleRow?.name || undefined,
    vehiclePlate: vehicleRow?.plateNumber || undefined,
    outForDeliveryAt: orderRow.outForDeliveryAt ? new Date(orderRow.outForDeliveryAt).toISOString() : undefined,
    driverArrivedAt: orderRow.driverArrivedAt ? new Date(orderRow.driverArrivedAt).toISOString() : undefined,
    deliveredAt: orderRow.deliveredAt ? new Date(orderRow.deliveredAt).toISOString() : undefined,
    collectionStatus: orderRow.collectionStatus as DeliveryCollectionStatus,
    driverCashSettled: Boolean(orderRow.driverCashSettled),
    settlementId: orderRow.settlementId ? String(orderRow.settlementId) : undefined,
    inventoryRestored: Boolean(orderRow.inventoryRestored),
    deliverySubState: orderRow.deliverySubState ? (orderRow.deliverySubState as DeliverySubState) : undefined,
    refundedAmount: toNumber(orderRow.refundedAmount),
    refundStatus: (orderRow.refundStatus || 'none') as 'none' | 'pending' | 'refunded',
    deliveryProofMethod: orderRow.deliveryProofMethod || undefined,
    deliveryVerifiedAt: orderRow.deliveryVerifiedAt ? new Date(orderRow.deliveryVerifiedAt).toISOString() : undefined,
    deliveryOverrideReason: orderRow.deliveryOverrideReason || undefined,
    deliveryPin:
      includePin &&
      orderRow.deliveryPinEncrypted &&
      orderRow.status !== 'delivered' &&
      orderRow.status !== 'cancelled'
        ? (decryptPin(orderRow.deliveryPinEncrypted) || undefined)
        : undefined,
    idempotencyKey: orderRow.idempotencyKey || undefined,
    requestFingerprint: orderRow.requestFingerprint || undefined,
    createdAt: new Date(orderRow.createdAt).toISOString(),
    updatedAt: new Date(orderRow.updatedAt).toISOString(),
  };
}

/* =========================================================
   1. pgGetOrders
   ========================================================= */

export async function pgGetOrders(filters?: PgOrderFilters, options?: { includePin?: boolean }): Promise<Order[]> {
  const db = getDb();

  const conditions = [];

  if (filters?.status) {
    conditions.push(eq(orders.status, filters.status));
  }

  if (filters?.phone) {
    const clean = normalizePhone(filters.phone);
    if (clean) {
      conditions.push(eq(orders.customerPhoneSnap, clean));
    }
  }

  if (filters?.userId && isUuid(filters.userId)) {
    conditions.push(eq(orders.accountId, filters.userId));
  }

  let query = db
    .select({
      order: orders,
      account: financialAccounts,
      driver: drivers,
      vehicle: vehicles,
    })
    .from(orders)
    .leftJoin(financialAccounts, eq(orders.accountId, financialAccounts.id))
    .leftJoin(drivers, eq(orders.driverId, drivers.id))
    .leftJoin(vehicles, eq(orders.vehicleId, vehicles.id));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  query = query.orderBy(desc(orders.createdAt)) as any;

  if (filters?.limit && filters.limit > 0) {
    query = query.limit(filters.limit) as any;
  }

  const orderRows = await query;
  if (orderRows.length === 0) {
    return [];
  }

  const orderIds = orderRows.map((r) => r.order.id);

  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  const itemsByOrderId = new Map<string, any[]>();
  for (const item of items) {
    const arr = itemsByOrderId.get(item.orderId) || [];
    arr.push(item);
    itemsByOrderId.set(item.orderId, arr);
  }

  return orderRows.map(({ order, account, driver, vehicle }) =>
    formatOrderRecord(order, itemsByOrderId.get(order.id) || [], driver, vehicle, account, options?.includePin)
  );
}

/* =========================================================
   2. pgGetOrderById
   ========================================================= */

export async function pgGetOrderById(idOrOrderNumber: string, options?: { includePin?: boolean }): Promise<Order | null> {
  const db = getDb();
  const trimmed = String(idOrOrderNumber || '').trim();
  if (!trimmed) return null;

  const conditions = [eq(orders.orderNumber, trimmed)];
  if (isUuid(trimmed)) {
    conditions.push(eq(orders.id, trimmed));
  }

  const rows = await db
    .select({
      order: orders,
      account: financialAccounts,
      driver: drivers,
      vehicle: vehicles,
    })
    .from(orders)
    .leftJoin(financialAccounts, eq(orders.accountId, financialAccounts.id))
    .leftJoin(drivers, eq(orders.driverId, drivers.id))
    .leftJoin(vehicles, eq(orders.vehicleId, vehicles.id))
    .where(or(...conditions))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const { order, account, driver, vehicle } = rows[0];

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return formatOrderRecord(order, items, driver, vehicle, account, options?.includePin);
}

/* =========================================================
   3. pgCreateOrder
   ========================================================= */

export async function pgCreateOrder(data: PgCreateOrderInput): Promise<Order> {
  const db = getDb();

  if (!data.customer?.name || !data.customer?.phone) {
    throw new Error('بيانات العميل (الاسم ورقم الهاتف) مطلوبة لإنشاء الطلب');
  }

  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('لا يمكن إنشاء طلبية بدون أصناف');
  }

  const rawKey = data.idempotencyKey ? String(data.idempotencyKey).trim() : undefined;
  if (rawKey && rawKey.length > 128) {
    throw new Error('مفتاح عدم التكرار idempotency key يتجاوز الحد الأقصى المسموح (128 حرف)');
  }
  const cleanKey = rawKey || undefined;
  const requestFingerprint = cleanKey ? computeOrderPayloadFingerprint(data) : undefined;

  const validateAndFormatExisting = async (
    existingOrder: any,
    existingItems: any[],
    driver?: any,
    vehicle?: any,
    account?: any
  ): Promise<Order> => {
    // 1. Verify caller ownership
    const callerCanonicalPhone = normalizePhone(data.customer?.phone);
    const existingPhone = existingOrder.customerPhoneSnap;
    if (existingPhone && callerCanonicalPhone && existingPhone !== callerCanonicalPhone) {
      throw new Error('Idempotency Conflict: Key belongs to another customer or phone number');
    }

    if (data.accountId && existingOrder.accountId && data.accountId !== existingOrder.accountId) {
      throw new Error('Idempotency Conflict: Key belongs to another customer account');
    }

    // 2. Verify payload fingerprint
    if (existingOrder.requestFingerprint && requestFingerprint && existingOrder.requestFingerprint !== requestFingerprint) {
      throw new Error('Idempotency Conflict: Key reused with different order payload');
    }

    return formatOrderRecord(existingOrder, existingItems, driver, vehicle, account);
  };

  // Pre-check for already completed order with the same idempotency key
  if (cleanKey) {
    const existingRows = await db
      .select({
        order: orders,
        account: financialAccounts,
        driver: drivers,
        vehicle: vehicles,
      })
      .from(orders)
      .leftJoin(financialAccounts, eq(orders.accountId, financialAccounts.id))
      .leftJoin(drivers, eq(orders.driverId, drivers.id))
      .leftJoin(vehicles, eq(orders.vehicleId, vehicles.id))
      .where(eq(orders.idempotencyKey, cleanKey))
      .limit(1);

    if (existingRows.length > 0) {
      const { order: existingOrder, account, driver, vehicle } = existingRows[0];
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, existingOrder.id));
      return await validateAndFormatExisting(existingOrder, items, driver, vehicle, account);
    }
  }

  try {
    return await db.transaction(async (tx) => {
    // -------------------------------------------------------------
    // Step A: Resolve Customer Financial Account
    // -------------------------------------------------------------
    let customerAccount: any = null;

    if (data.accountId) {
      if (!isUuid(data.accountId)) {
        throw new Error('الحساب المالي للعميل غير موجود');
      }
      const accountRows = await tx
        .select()
        .from(financialAccounts)
        .where(and(eq(financialAccounts.id, data.accountId), eq(financialAccounts.category, 'customer')))
        .limit(1);

      if (accountRows.length === 0) {
        throw new Error('الحساب المالي للعميل غير موجود');
      }
      customerAccount = accountRows[0];
    } else {
      const canonicalPhone = toCanonicalIraqiPhone(data.customer.phone);
      const localPhone = toLocalIraqiPhone(data.customer.phone);
      const rawDigits = String(data.customer.phone || '').replace(/\D/g, '');
      const phoneMatches = Array.from(new Set([canonicalPhone, localPhone, rawDigits].filter(Boolean))) as string[];

      if (phoneMatches.length > 0) {
        const accountRows = await tx
          .select()
          .from(financialAccounts)
          .where(and(inArray(financialAccounts.phone, phoneMatches), eq(financialAccounts.category, 'customer')))
          .limit(1);

        if (accountRows.length > 0) {
          customerAccount = accountRows[0];
        }
      }

      if (!customerAccount && data.customer.userId && isUuid(data.customer.userId)) {
        const accountRows = await tx
          .select()
          .from(financialAccounts)
          .where(and(eq(financialAccounts.id, data.customer.userId), eq(financialAccounts.category, 'customer')))
          .limit(1);

        if (accountRows.length > 0) {
          customerAccount = accountRows[0];
        }
      }

      if (!customerAccount) {
        if (data.createAccountIfMissing) {
          const [newAcc] = await tx
            .insert(financialAccounts)
            .values({
              accountCode: generateAccountCode(),
              name: data.customer.name.trim(),
              businessName: data.customer.businessName?.trim() || null,
              phone: normalizePhone(data.customer.phone) || null,
              category: 'customer',
              pricingTier: 'retail',
              city: data.customer.city?.trim() || null,
              address: data.customer.address?.trim() || null,
              isActive: true,
              notes: 'تم الإنشاء تلقائياً عبر فاتورة مبيعات',
            })
            .returning();

          customerAccount = newAcc;
        } else {
          throw new Error('الحساب المالي للعميل غير موجود');
        }
      }
    }

    const staffId = await resolveStaffId(tx, data.operator);

    // -------------------------------------------------------------
    // Step B: Monotonic Sequence for Order Number
    // -------------------------------------------------------------
    let orderNumber = '';
    try {
      const seqRows: any = await tx.execute(sql`SELECT nextval('order_number_seq') as seq`);
      const seqVal = seqRows[0]?.seq || seqRows?.rows?.[0]?.seq;
      orderNumber = `INV-${seqVal}`;
    } catch {
      const maxRows: any = await tx.execute(sql`
        SELECT COALESCE(MAX(SUBSTRING(order_number FROM '[0-9]+')::int), 1000) + 1 as seq FROM orders
      `);
      const maxVal = maxRows[0]?.seq || maxRows?.rows?.[0]?.seq || 1001;
      orderNumber = `INV-${maxVal}`;
    }

    // -------------------------------------------------------------
    // Step C: Lock Products FOR UPDATE, Check & Deduct Inventory
    // -------------------------------------------------------------
    const processedItems: Array<{
      productId: string;
      itemNameSnap: string;
      unitLabelSnap: string;
      soldUnit: string;
      soldQuantity: number;
      conversionFactorSnap: number;
      baseQuantityDeducted: number;
      unitPriceSnap: number;
      originalPriceSnap?: number | null;
      offerIdSnap?: string | null;
      offerDiscountSnap?: number;
      pricingTierSnap?: string | null;
      unitCostSnap: number;
      earnedCashback: number;
      image: string | null;
      newStockPieces: number;
    }> = [];

    // Server-authoritative semantic normalization of customer pricing identity:
    // Never trust client request body. Strictly derive from server-side trusted session / operator or PostgreSQL account:
    const effectiveUser = normalizePricingIdentity({
      accountType: data.userAccountType,
      pricingTier: customerAccount?.pricingTier,
      merchantTier: data.userMerchantTier,
    });

    let calculatedSubtotal = 0;
    let calculatedNonDiscountedSubtotal = 0;

    // Deterministic Product Row Locking (Commerce-2C4A Finding #2):
    // Collect all unique productIds, sort lexicographically, and lock upfront in deterministic order
    // to strictly prevent intra-table concurrency deadlocks (40P01 deadlock_detected) across concurrent checkouts.
    const uniqueProductIds = Array.from(
      new Set(
        (data.items || []).map((it) => {
          const pId = String(it.productId || (it as any).id || '').trim();
          if (!pId || !isUuid(pId)) {
            throw new Error(`معرّف المنتج غير صالح: ${it.productId || it.name}`);
          }
          return pId;
        })
      )
    ).sort((a, b) => a.localeCompare(b));

    const lockedProductsMap = new Map<string, any>();
    const prodStockTracker = new Map<string, number>();

    for (const pId of uniqueProductIds) {
      const prodRows = await tx
        .select()
        .from(products)
        .where(eq(products.id, pId))
        .for('update');

      if (prodRows.length === 0) {
        throw new Error(`المنتج غير موجود: ${pId}`);
      }
      lockedProductsMap.set(pId, prodRows[0]);
      prodStockTracker.set(pId, Number(prodRows[0].currentStockPieces) || 0);
    }

    for (const item of data.items) {
      const prodId = String(item.productId || (item as any).id || '').trim();
      const prod = lockedProductsMap.get(prodId);
      if (!prod) {
        throw new Error(`المنتج غير موجود: ${prodId}`);
      }

      if (prod.isArchived) {
        throw new Error(`المنتج (${prod.name}) مؤرشف ومحذوف من المتجر ولا يمكن طلبه`);
      }
      if (prod.isActive === false) {
        throw new Error(`المنتج (${prod.name}) معطل حالياً وغير متاح للطلب`);
      }

      const boxesPerCarton = Math.max(1, Number(prod.boxesPerCarton) || 1);
      const itemsPerBox = Math.max(1, Number(prod.itemsPerBox) || 1);
      const piecesPerCarton = Number(prod.piecesPerCarton) || (boxesPerCarton * itemsPerBox);

      let soldUnit = 'piece';
      let conversionFactorSnap = 1;
      let unitLabelSnap = item.unitLabel || prod.retailUnit || 'قطعة';

      if (item.saleType === 'wholesale') {
        soldUnit = 'carton';
        conversionFactorSnap = piecesPerCarton;
        unitLabelSnap = item.unitLabel || prod.wholesaleUnit || 'كرتون';
      } else if ((item.saleType as string) === 'box') {
        soldUnit = 'box';
        conversionFactorSnap = itemsPerBox;
        unitLabelSnap = item.unitLabel || 'علبة';
      } else {
        soldUnit = 'piece';
        conversionFactorSnap = 1;
        unitLabelSnap = item.unitLabel || prod.retailUnit || 'قطعة';
      }

      const qtyRes = validateOrderItemQuantity(item.quantity);
      if (!qtyRes.valid) {
        throw new Error(`كمية غير صالحة للمنتج (${prod.name}): ${qtyRes.error}`);
      }
      const soldQuantity = qtyRes.quantity!;
      const baseQuantityDeducted = soldQuantity * conversionFactorSnap;

      const availableStockPieces = prodStockTracker.get(prod.id)!;
      if (availableStockPieces < baseQuantityDeducted) {
        throw new Error(
          `المخزون غير كافٍ للمنتج (${prod.name}): المتاح ${availableStockPieces} قطعة، والمطلوب ${baseQuantityDeducted} قطعة (${soldQuantity} ${unitLabelSnap})`
        );
      }

      const newStockPieces = availableStockPieces - baseQuantityDeducted;
      prodStockTracker.set(prod.id, newStockPieces);
      let unitPrice = toNumber(item.price ?? (item as any).unitPrice);

      // Query active, unarchived, and valid promotional offer for this product under transaction lock
      const activeOfferRows = await tx
        .select()
        .from(productOffers)
        .where(
          and(
            eq(productOffers.productId, prod.id),
            eq(productOffers.isActive, true),
            or(isNull(productOffers.isArchived), eq(productOffers.isArchived, false)),
            or(isNull(productOffers.startDate), lte(productOffers.startDate, new Date())),
            gt(productOffers.endDate, new Date())
          )
        )
        .orderBy(desc(productOffers.createdAt))
        .limit(1);

      const activeOffer = activeOfferRows.length > 0 ? activeOfferRows[0] : null;

      const saleType = (item.saleType as any) || 'retail';
      const authoritativePricing = resolveAuthoritativeProductPrice({
        product: prod,
        saleType,
        user: effectiveUser,
        activeOffer: activeOffer ? {
          id: activeOffer.id,
          offerPrice: Number(activeOffer.offerPrice),
          offerWholesalePrice: activeOffer.offerWholesalePrice ? Number(activeOffer.offerWholesalePrice) : undefined,
          originalPrice: activeOffer.originalPrice ? Number(activeOffer.originalPrice) : undefined,
          originalWholesalePrice: activeOffer.originalWholesalePrice ? Number(activeOffer.originalWholesalePrice) : undefined,
          startDate: activeOffer.startDate,
          endDate: activeOffer.endDate,
        } : null,
      });

      const officialPrice = authoritativePricing.finalUnitPrice;

      // Defense-in-depth price verification at repository level (Requirement B & Phase 2B1):
      // Privileged staff or admin operators can specify custom negotiated prices.
      // Unprivileged customer/guest orders or explicit enforcement are strictly bound to official PostgreSQL pricing.
      const isUnprivilegedCustomer = data.operator?.role === 'customer' || data.operator?.role === 'guest';
      const shouldEnforceOfficialPrice = (isUnprivilegedCustomer || (data as any).enforceOfficialPrices === true) && data.trustSuppliedPrices !== true;
      if (shouldEnforceOfficialPrice || unitPrice <= 0) {
        unitPrice = officialPrice;
      }

      // Snapshot calculation for audit and historical integrity:
      let originalPriceSnap: number | null = authoritativePricing.originalUnitPrice;
      let offerIdSnap: string | null = authoritativePricing.isOfferApplied ? authoritativePricing.offerId || null : null;
      let offerDiscountSnap = authoritativePricing.isOfferApplied ? authoritativePricing.offerSavingsPerUnit : 0;
      let pricingTierSnap: string | null = authoritativePricing.pricingTierApplied;

      // If privileged operator specified explicit offer snapshot fields, preserve them
      if (!shouldEnforceOfficialPrice) {
        if ((item as any).offerIdSnap || (item as any).offerId) {
          offerIdSnap = (item as any).offerIdSnap || (item as any).offerId || null;
        }
        if ((item as any).originalPriceSnap !== undefined || (item as any).originalPrice !== undefined) {
          originalPriceSnap = toNumber((item as any).originalPriceSnap ?? (item as any).originalPrice);
        }
        if ((item as any).offerDiscountSnap !== undefined || (item as any).offerDiscount !== undefined) {
          offerDiscountSnap = toNumber((item as any).offerDiscountSnap ?? (item as any).offerDiscount);
        }
        if ((item as any).pricingTierSnap !== undefined) {
          pricingTierSnap = (item as any).pricingTierSnap || null;
        }
      }

      const unitCost = toNumber(prod.pieceCostPrice);
      const itemEarnedCashback = toNumber(item.earnedCashback);

      calculatedSubtotal += unitPrice * soldQuantity;
      const isDiscountedItem = Boolean(
        authoritativePricing.isOfferApplied ||
        (offerIdSnap && offerDiscountSnap && offerDiscountSnap > 0)
      );
      if (!isDiscountedItem) {
        calculatedNonDiscountedSubtotal += unitPrice * soldQuantity;
      }

      processedItems.push({
        productId: prod.id,
        itemNameSnap: prod.name,
        unitLabelSnap,
        soldUnit,
        soldQuantity,
        conversionFactorSnap,
        baseQuantityDeducted,
        unitPriceSnap: unitPrice,
        originalPriceSnap,
        offerIdSnap,
        offerDiscountSnap,
        pricingTierSnap,
        unitCostSnap: unitCost,
        earnedCashback: itemEarnedCashback,
        image: item.image || null,
        newStockPieces,
      });
    }

    const subtotal = calculatedSubtotal;
    let discount = 0;
    const newOrderId = crypto.randomUUID();

    let consumedCouponSnapshot: {
      id?: string;
      code?: string;
      discountType?: string;
      discountValue?: number;
      maxDiscountAmount?: number | null;
      eligibleSubtotal?: number;
    } | null = null;

    if (data.couponCode && data.couponCode.trim()) {
      const cleanCoupon = data.couponCode.trim().toUpperCase();
      const accountType = data.userAccountType || customerAccount?.pricingTier || (data.customer as any)?.accountType || 'individual';

      const couponRows = await tx
        .select()
        .from(coupons)
        .where(sql`UPPER(TRIM(${coupons.code})) = ${cleanCoupon}`)
        .limit(1);

      let eligibleSubtotal = calculatedSubtotal;
      if (couponRows.length > 0 && couponRows[0].excludeDiscountedItems) {
        eligibleSubtotal = calculatedNonDiscountedSubtotal;
      }

      const couponRes = await pgConsumeCoupon(cleanCoupon, subtotal, accountType, tx, {
        eligibleSubtotal,
        customerId: customerAccount.id,
        customerPhone: normalizePhone(data.customer.phone),
      });
      discount = couponRes.discount;
      if (couponRes.coupon) {
        consumedCouponSnapshot = {
          id: couponRes.coupon.id,
          code: couponRes.coupon.code,
          discountType: couponRes.coupon.discountType,
          discountValue: couponRes.coupon.discountValue,
          maxDiscountAmount: couponRes.coupon.maxDiscountAmount || null,
          eligibleSubtotal: couponRes.eligibleSubtotal,
        };
      }
    } else if (data.discount !== undefined && data.discount !== null && Number(data.discount) > 0) {
      if (data.operator?.role === 'admin' || data.operator?.role === 'staff') {
        discount = Math.min(subtotal, Math.max(0, toNumber(data.discount)));
      } else {
        discount = 0;
      }
    }

    const deliveryFee = toNumber(data.deliveryFee);
    const requestedCashback = toNumber(data.usedCashbackDiscount);
    const earnedCashback = data.earnedCashback !== undefined
      ? toNumber(data.earnedCashback)
      : processedItems.reduce((acc, it) => acc + it.earnedCashback, 0);

    // -------------------------------------------------------------
    // Step C.2: Atomically Lock Account & Validate Cashback (FOR UPDATE)
    // -------------------------------------------------------------
    let verifiedCashbackDiscount = 0;
    if (requestedCashback > 0) {
      await tx
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(eq(financialAccounts.id, customerAccount.id))
        .for('update');

      const currentBalance = await pgGetAccountCashbackBalance(customerAccount.id, tx);
      if (currentBalance <= 0) {
        throw new Error('رصيد الأرباح المتاح لديك هو 0 د.ع ولا يمكن استخدام رصيد أرباح في هذا الطلب');
      }
      if (requestedCashback > currentBalance) {
        throw new Error(
          `رصيد الأرباح المتاح لديك (${currentBalance.toLocaleString()} د.ع) غير كافٍ للمبلغ المطلوب (${requestedCashback.toLocaleString()} د.ع)`
        );
      }
      const maxAllowable = Math.max(0, subtotal - discount);
      verifiedCashbackDiscount = Math.min(requestedCashback, currentBalance, maxAllowable);
    }

    const calculatedTotal = Math.max(0, subtotal + deliveryFee - discount - verifiedCashbackDiscount);
    const total = calculatedTotal;

    // -------------------------------------------------------------
    // Step D: Insert Order
    // -------------------------------------------------------------
    const pinData = generateOrderPinData();

    const [insertedOrder] = await tx
      .insert(orders)
      .values({
        id: newOrderId,
        orderNumber,
        accountId: customerAccount.id,
        customerNameSnap: data.customer.name.trim(),
        customerPhoneSnap: normalizePhone(data.customer.phone),
        deliveryAddressSnap: data.customer.locationDesc?.trim()
          ? `${data.customer.address?.trim() || 'العراق'}\n${data.customer.locationDesc.trim()}`
          : data.customer.address?.trim() || 'العراق',
        locationTitleSnap: data.customer.locationTitle?.trim() || null,
        lat: data.customer.lat !== undefined ? String(data.customer.lat) : null,
        lng: data.customer.lng !== undefined ? String(data.customer.lng) : null,
        mapsUrl: data.customer.mapsUrl?.trim() || null,
        storefrontImage: data.customer.storefrontImage?.trim() || null,
        subtotal: String(subtotal.toFixed(2)),
        deliveryFee: String(deliveryFee.toFixed(2)),
        discount: String(discount.toFixed(2)),
        couponId: consumedCouponSnapshot?.id || null,
        couponCodeSnap: consumedCouponSnapshot?.code || null,
        couponDiscountTypeSnap: consumedCouponSnapshot?.discountType || null,
        couponDiscountValueSnap: consumedCouponSnapshot?.discountValue !== undefined
          ? String(consumedCouponSnapshot.discountValue.toFixed(2))
          : null,
        couponMaxDiscountSnap: consumedCouponSnapshot?.maxDiscountAmount !== undefined && consumedCouponSnapshot.maxDiscountAmount !== null
          ? String(consumedCouponSnapshot.maxDiscountAmount.toFixed(2))
          : null,
        couponEligibleSubtotalSnap: consumedCouponSnapshot?.eligibleSubtotal !== undefined
          ? String(consumedCouponSnapshot.eligibleSubtotal.toFixed(2))
          : null,
        customerAccountTypeSnap: effectiveUser.accountType || null,
        customerMerchantTierSnap: effectiveUser.merchantTier || null,
        usedCashbackDiscount: String(verifiedCashbackDiscount.toFixed(2)),
        earnedCashback: String(earnedCashback.toFixed(2)),
        total: String(total.toFixed(2)),
        status: data.status && ['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(data.status)
          ? data.status
          : 'pending',
        paymentMethod: data.paymentMethod && ['cod', 'cash', 'debt', 'zaincash', 'qicard', 'bank_transfer', 'online'].includes(data.paymentMethod)
          ? data.paymentMethod
          : 'cod',
        collectionStatus: 'pending',
        collectedAmount: '0.00',
        remainingDebtAmount: String(total.toFixed(2)),
        driverCashSettled: false,
        inventoryRestored: false,
        deliveryPinHash: pinData.hash,
        deliveryPinEncrypted: pinData.encrypted,
        deliveryPinAttempts: 0,
        notes: data.notes?.trim() || null,
        idempotencyKey: cleanKey || null,
        requestFingerprint: requestFingerprint || null,
      })
      .returning();

    // -------------------------------------------------------------
    // Step D.2: Record Coupon Redemption in Database (Audit & Tracking)
    // -------------------------------------------------------------
    if (consumedCouponSnapshot?.id) {
      await pgRecordCouponRedemption(tx, {
        couponId: consumedCouponSnapshot.id,
        orderId: insertedOrder.id,
        orderNumber: insertedOrder.orderNumber,
        customerId: customerAccount.id,
        customerPhone: normalizePhone(data.customer.phone),
        discountAmount: discount,
      });
    }

    // -------------------------------------------------------------
    // Step E: Insert Order Items, Update Product Stock, & Log Movements
    // -------------------------------------------------------------
    for (const item of processedItems) {
      await tx.insert(orderItems).values({
        orderId: insertedOrder.id,
        productId: item.productId,
        itemNameSnap: item.itemNameSnap,
        unitLabelSnap: item.unitLabelSnap,
        soldUnit: item.soldUnit,
        soldQuantity: item.soldQuantity,
        conversionFactorSnap: item.conversionFactorSnap,
        baseQuantityDeducted: item.baseQuantityDeducted,
        unitPriceSnap: String(item.unitPriceSnap.toFixed(2)),
        originalPriceSnap: item.originalPriceSnap != null ? String(item.originalPriceSnap.toFixed(2)) : null,
        offerIdSnap: item.offerIdSnap || null,
        offerDiscountSnap: String((item.offerDiscountSnap || 0).toFixed(2)),
        pricingTierSnap: item.pricingTierSnap || null,
        unitCostSnap: String(item.unitCostSnap.toFixed(4)),
        earnedCashback: String(item.earnedCashback.toFixed(2)),
        image: item.image,
      });

      await tx
        .update(products)
        .set({
          currentStockPieces: item.newStockPieces,
        })
        .where(eq(products.id, item.productId));

      await tx.insert(inventoryMovements).values({
        productId: item.productId,
        movementType: 'sale',
        quantityPieces: -item.baseQuantityDeducted, // negative for sale outflow
        unitCostPieces: String(item.unitCostSnap.toFixed(4)),
        totalCost: String((item.baseQuantityDeducted * item.unitCostSnap).toFixed(2)),
        balanceAfterPieces: item.newStockPieces,
        referenceType: 'order',
        referenceId: insertedOrder.id,
        referenceNumber: insertedOrder.orderNumber,
        performedByStaffId: staffId,
        notes: `مبيعات طلبية ${insertedOrder.orderNumber} (${item.soldQuantity} ${item.unitLabelSnap})`,
      });
    }

    // -------------------------------------------------------------
    // Step F: Audit Log
    // -------------------------------------------------------------
    await tx.insert(auditLogs).values({
      actionType: 'order_created',
      actionLabel: 'إنشاء طلبية مبيعات جديدة',
      category: 'commerce',
      categoryLabel: 'الطلبات والمبيعات',
      staffId,
      operatorSnapshot: data.operator || null,
      targetType: 'order',
      targetId: insertedOrder.id,
      targetReferenceNumber: insertedOrder.orderNumber,
      financialImpact: {
        total,
        subtotal,
        deliveryFee,
        discount,
        customerAccountId: customerAccount.id,
      },
      details: `إنشاء طلبية ${insertedOrder.orderNumber} للزبون ${data.customer.name} بمبلغ ${total.toLocaleString()} د.ع`,
      severity: 'info',
    });

    // -------------------------------------------------------------
    // Step E.2: Redeem Cashback in Ledger (Foreign Key to orders satisfied)
    // -------------------------------------------------------------
    if (verifiedCashbackDiscount > 0) {
      await pgRedeemCashbackInOrder(tx, {
        accountId: customerAccount.id,
        orderId: insertedOrder.id,
        orderNumber: insertedOrder.orderNumber,
        requestedAmount: verifiedCashbackDiscount,
        subtotal: Math.max(0, subtotal - discount),
        notes: `استخدام رصيد أرباح في الطلبية رقم ${insertedOrder.orderNumber}`,
      });
    }

    // If created directly in delivered status, credit cashback idempotently
    if (insertedOrder.status === 'delivered') {
      await pgCreditOrderDeliveredCashback(tx, insertedOrder.id);
    }

    const itemsFromDb = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, insertedOrder.id));

    return formatOrderRecord(insertedOrder, itemsFromDb, undefined, undefined, customerAccount);
    });
  } catch (error: any) {
    // Concurrent execution resolution via DB unique constraint uq_orders_idempotency_key
    if (
      cleanKey &&
      (error?.code === '23505' ||
        String(error?.message).includes('uq_orders_idempotency_key') ||
        String(error?.detail).includes('idempotency_key'))
    ) {
      const concurrentRows = await db
        .select({
          order: orders,
          account: financialAccounts,
          driver: drivers,
          vehicle: vehicles,
        })
        .from(orders)
        .leftJoin(financialAccounts, eq(orders.accountId, financialAccounts.id))
        .leftJoin(drivers, eq(orders.driverId, drivers.id))
        .leftJoin(vehicles, eq(orders.vehicleId, vehicles.id))
        .where(eq(orders.idempotencyKey, cleanKey))
        .limit(1);

      if (concurrentRows.length > 0) {
        const { order: existingOrder, account, driver, vehicle } = concurrentRows[0];
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, existingOrder.id));
        return await validateAndFormatExisting(existingOrder, items, driver, vehicle, account);
      }
    }
    throw error;
  }
}

/* =========================================================
   4. State Machine & Order Lifecycle
   ========================================================= */

export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [], // Terminal
  returned: [],  // Terminal
};

export function validateOrderTransition(currentStatus: OrderStatus, newStatus: OrderStatus): void {
  if (currentStatus === newStatus) return; // Idempotent no-op
  if (currentStatus === 'cancelled') {
    throw new Error('الطلبية ملغاة ولا يمكن تعديل حالتها (حالة نهائية)');
  }
  if (currentStatus === 'returned') {
    throw new Error('الطلبية مرتجعة ولا يمكن تعديل حالتها (حالة نهائية)');
  }
  const allowed = VALID_ORDER_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`لا يمكن تغيير حالة الطلب من "${currentStatus}" إلى "${newStatus}". الانتقال غير مسموح.`);
  }
}

/* =========================================================
   4.1. pgCancelOrder (Pre-Delivery Cancellation)
   ========================================================= */

export async function pgCancelOrder(
  idOrOrderNumber: string,
  options?: {
    reason?: string;
    isReturn?: boolean;
    operator?: PgOperator;
    tx?: any;
    driverId?: string;
  }
): Promise<Order> {
  const trimmed = String(idOrOrderNumber || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  const execute = async (tx: any) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) {
      conditions.push(eq(orders.id, trimmed));
    }

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const order = orderRows[0];

    // Object-Level Authorization if driverId is specified
    if (options?.driverId) {
      if (!order.driverId || order.driverId !== options.driverId) {
        throw new Error('هذا الطلب غير مسند إليك ولا يمكنك إرجاعه');
      }
    }

    // Idempotency: If already cancelled, return existing state immediately without re-restoring inventory or creating duplicate audit logs
    if (order.status === 'cancelled') {
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      const [account] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, order.accountId))
        .limit(1);

      return formatOrderRecord(order, items, undefined, undefined, account);
    }

    // Protection: Prevent cancelling orders that are already delivered
    if (order.status === 'delivered') {
      throw new Error('الطلب تم تسليمه بالفعل ولا يمكن إلغاؤه');
    }

    // Protection: Prevent cancelling orders that are already returned
    if (order.status === 'returned' || order.collectionStatus === 'returned') {
      throw new Error('الطلب مرتجع بالفعل ولا يمكن إلغاؤه');
    }

    // State Machine Check: only pending, processing, shipped can be cancelled
    if (!['pending', 'processing', 'shipped'].includes(order.status)) {
      throw new Error(`لا يمكن إلغاء الطلب في حالته الحالية: ${order.status}`);
    }

    // Protection: Prevent cancelling orders with recorded payment / collection without formal reversal
    const paid = toNumber(order.collectedAmount);
    if (paid > 0) {
      throw new Error(
        'لا يمكن إلغاء الطلبية لاحتوائها على حركة مالية مسجلة (دفع أو تحصيل). تتطلب العملية تسوية واسترداد مالي (Financial Reversal / Refund Workflow).'
      );
    }

    const staffId = await resolveStaffId(tx, options?.operator);
    const isShippedWithDriver = order.status === 'shipped' && !!order.driverId;

    // 1. Inventory Restoration: Exactly once using historical baseQuantityDeducted
    // CRITICAL (Commerce-2C4C): If the order is currently shipped and in driver custody,
    // the physical goods are outside the warehouse. We perform Commercial Cancellation,
    // but MUST NOT restore warehouse inventory until Warehouse Physical Check-in!
    const willRestoreInventory = !order.inventoryRestored && !isShippedWithDriver;

    if (willRestoreInventory) {
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      const sortedItems = [...items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
      for (const item of sortedItems) {
        const prodRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .for('update');

        if (prodRows.length > 0) {
          const prod = prodRows[0];
          const restoredPieces = Number(item.baseQuantityDeducted);
          const newStockPieces = (Number(prod.currentStockPieces) || 0) + restoredPieces;

          await tx
            .update(products)
            .set({ currentStockPieces: newStockPieces })
            .where(eq(products.id, prod.id));

          await tx.insert(inventoryMovements).values({
            productId: prod.id,
            movementType: 'order_cancellation',
            quantityPieces: restoredPieces, // positive for inflow
            unitCostPieces: String(item.unitCostSnap),
            totalCost: String((restoredPieces * toNumber(item.unitCostSnap)).toFixed(2)),
            balanceAfterPieces: newStockPieces,
            referenceType: 'order',
            referenceId: order.id,
            referenceNumber: order.orderNumber,
            performedByStaffId: staffId,
            notes: `استرجاع مخزون لإلغاء طلبية ${order.orderNumber} (${item.soldQuantity} ${item.unitLabelSnap})`,
          });
        }
      }
    }

    // 2. Safely and idempotently reverse any used cashback discount back to the customer's ledger
    await pgReverseOrderRedeemedCashback(tx, order.id, options?.reason);

    // 3. Safely and idempotently release any coupon redemption so customer can reuse it
    await pgReleaseOrderCouponRedemption(tx, order.id, options?.operator);

    // 4. Update order state
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: 'cancelled',
        deliverySubState: isShippedWithDriver ? 'return_requested' : order.deliverySubState,
        collectionStatus: order.collectionStatus,
        remainingDebtAmount: '0.00',
        inventoryRestored: willRestoreInventory ? true : order.inventoryRestored,
        deliveryPinEncrypted: null,
        driverNotes: options?.reason || order.driverNotes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // 5. Audit Log (single log event per cancellation)
    await tx.insert(auditLogs).values({
      actionType: 'order_cancelled',
      actionLabel: isShippedWithDriver
        ? 'إلغاء تجاري للطلبية وبقاء البضاعة بعهدة السائق لحين تسليمها للمستودع'
        : 'إلغاء طلبية واسترجاع المخزون',
      category: 'commerce',
      categoryLabel: 'الطلبات والمبيعات',
      staffId,
      operatorSnapshot: options?.operator || null,
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      financialImpact: {
        cancelledTotal: toNumber(order.total),
      },
      details: isShippedWithDriver
        ? `إلغاء تجاري للطلبية ${order.orderNumber} أثناء خروجها مع السائق. المخزون لم يسترجع وبانتظار تسليم البضاعة للمستودع. ملاحظات: ${options?.reason || 'تم الإلغاء'}`
        : `إلغاء الطلبية ${order.orderNumber}: ${options?.reason || 'تم الإلغاء'}`,
      severity: 'warning',
    });

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const [account] = await tx
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.id, order.accountId))
      .limit(1);

    return formatOrderRecord(updatedOrder, items, undefined, undefined, account);
  };

  if (options?.tx) {
    return await execute(options.tx);
  } else {
    const db = getDb();
    return await db.transaction(execute);
  }
}

/* =========================================================
   4.2. pgReturnOrder (Post-Delivery Return Workflow)
   ========================================================= */

export async function pgReturnOrder(
  idOrOrderNumber: string,
  options?: {
    reason?: string;
    operator?: PgOperator;
    tx?: any;
    driverId?: string;
  }
): Promise<Order> {
  const trimmed = String(idOrOrderNumber || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  const executeReturn = async (tx: any) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) {
      conditions.push(eq(orders.id, trimmed));
    }

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const order = orderRows[0];

    // Object-Level Authorization if driverId is specified
    if (options?.driverId) {
      if (!order.driverId || order.driverId !== options.driverId) {
        throw new Error('هذا الطلب غير مسند إليك ولا يمكنك إرجاعه');
      }
    }

    // Idempotency: If already returned, return current state without re-restoring inventory or duplicate clawback or duplicate audit logs
    if (order.status === 'returned' || order.collectionStatus === 'returned') {
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      const [account] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, order.accountId))
        .limit(1);

      return formatOrderRecord(order, items, undefined, undefined, account);
    }

    // State Machine Check: Post-delivery return is ONLY permitted from 'delivered'
    if (order.status !== 'delivered') {
      throw new Error(`لا يمكن إرجاع الطلب إلا بعد تسليمه (delivered). الحالة الحالية للطلب: ${order.status}`);
    }

    const staffId = await resolveStaffId(tx, options?.operator);

    // 1. Inventory Restoration: Exactly once using historical baseQuantityDeducted pieces
    if (!order.inventoryRestored) {
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      const sortedItems = [...items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
      for (const item of sortedItems) {
        const prodRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .for('update');

        if (prodRows.length > 0) {
          const prod = prodRows[0];
          const restoredPieces = Number(item.baseQuantityDeducted);
          const newStockPieces = (Number(prod.currentStockPieces) || 0) + restoredPieces;

          await tx
            .update(products)
            .set({ currentStockPieces: newStockPieces })
            .where(eq(products.id, prod.id));

          await tx.insert(inventoryMovements).values({
            productId: prod.id,
            movementType: 'customer_return',
            quantityPieces: restoredPieces, // positive for inflow
            unitCostPieces: String(item.unitCostSnap),
            totalCost: String((restoredPieces * toNumber(item.unitCostSnap)).toFixed(2)),
            balanceAfterPieces: newStockPieces,
            referenceType: 'order',
            referenceId: order.id,
            referenceNumber: order.orderNumber,
            performedByStaffId: staffId,
            notes: `استرجاع مخزون لإرجاع طلبية مسلّمة ${order.orderNumber} (${item.soldQuantity} ${item.unitLabelSnap})`,
          });
        }
      }
    }

    // 2. Cashback Clawback: Idempotently claw back earned cashback for this delivered order
    const clawbackResult = await pgClawbackOrderDeliveredCashback(tx, order.id, options?.reason);

    // 3. Update Order State to 'returned'
    const returnUpdates: any = {
      status: 'returned',
      collectionStatus: 'returned',
      inventoryRestored: true,
      driverNotes: options?.reason
        ? (order.driverNotes ? `${order.driverNotes} | [مرتجع]: ${options.reason}` : `[مرتجع]: ${options.reason}`)
        : order.driverNotes,
      updatedAt: new Date(),
    };

    if (toNumber(order.collectedAmount) > 0 && (!order.refundStatus || order.refundStatus === 'none')) {
      returnUpdates.refundStatus = 'pending';
    }

    const [updatedOrder] = await tx
      .update(orders)
      .set(returnUpdates)
      .where(eq(orders.id, order.id))
      .returning();

    // 4. Audit Log (single log event per return)
    await tx.insert(auditLogs).values({
      actionType: 'order_returned',
      actionLabel: 'إرجاع طلبية مسلّمة واسترجاع المخزون وسحب الكاشباك',
      category: 'commerce',
      categoryLabel: 'الطلبات والمبيعات',
      staffId,
      operatorSnapshot: options?.operator || null,
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      financialImpact: {
        total: toNumber(order.total),
        clawedBackCashback: clawbackResult.amount,
        cashbackDeficit: clawbackResult.deficitAmount,
      },
      details: clawbackResult.deficitAmount > 0
        ? `تم إرجاع الطلبية المسلّمة ${order.orderNumber} واسترجاع المخزون وسحب ${clawbackResult.amount.toLocaleString()} د.ع كاشباك مع وجود عجز ${clawbackResult.deficitAmount.toLocaleString()} د.ع في رصيد العميل`
        : `تم إرجاع الطلبية المسلّمة ${order.orderNumber} واسترجاع المخزون وسحب أرباح الكاشباك بنجاح`,
      severity: clawbackResult.deficitAmount > 0 ? 'warning' : 'info',
    });

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const [account] = await tx
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.id, order.accountId))
      .limit(1);

    return formatOrderRecord(updatedOrder, items, undefined, undefined, account);
  };

  if (options?.tx) {
    return await executeReturn(options.tx);
  } else {
    const db = getDb();
    return await db.transaction(executeReturn);
  }
}

/* =========================================================
   7. pgRefundOrder (Commerce-2C4B Customer Refund Hardening)
   ========================================================= */
export async function pgRefundOrder(
  idOrOrderNumber: string,
  data?: {
    amount?: number;
    method?: 'cash' | 'store_credit' | 'electronic' | 'bank_transfer' | 'other';
    reason?: string;
    notes?: string;
  },
  options?: {
    operator?: PgOperator;
    tx?: any;
  }
): Promise<{ order: Order; refund: any }> {
  const trimmed = String(idOrOrderNumber || '').trim();
  if (!trimmed) throw new Error('معرف الطلب أو رقمه مطلوب للاسترداد');

  const executeRefund = async (tx: any) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) {
      conditions.push(eq(orders.id, trimmed));
    }

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error(`لم يتم العثور على الطلب: ${trimmed}`);
    }

    const order = orderRows[0];

    // Validate that order is returned
    if (order.status !== 'returned' && order.collectionStatus !== 'returned') {
      throw new Error(`لا يمكن استرداد أموال طلبية إلا إذا كانت مرتجعة (returned). الحالة الحالية: ${order.status}`);
    }

    // Check if already refunded
    if (order.refundStatus === 'refunded') {
      throw new Error(`تم استرداد مبالغ هذه الطلبية مسبقاً (refunded). الطلبية: ${order.orderNumber}`);
    }

    const collected = toNumber(order.collectedAmount);
    if (collected <= 0) {
      throw new Error(`لا توجد مبالغ محصلة في هذه الطلبية للاسترداد. المبلغ المحصل: ${collected}`);
    }

    const refundAmount = data?.amount !== undefined ? Math.max(0, toNumber(data.amount)) : collected;
    if (refundAmount <= 0) {
      throw new Error('مبلغ الاسترداد يجب أن يكون أكبر من الصفر');
    }
    if (refundAmount > collected) {
      throw new Error(`مبلغ الاسترداد (${refundAmount.toLocaleString()}) لا يمكن أن يتجاوز المبلغ المحصل (${collected.toLocaleString()})`);
    }

    // Generate refund number from refund_seq
    const seqResult = await tx.execute(sql`SELECT nextval('refund_seq') AS nextval`);
    const nextSeq = seqResult[0]?.nextval || Math.floor(1000 + Math.random() * 9000);
    const refundNumber = `REF-${nextSeq}`;

    const staffId = await resolveStaffId(tx, options?.operator);
    const method = data?.method || 'cash';

    const [refundRecord] = await tx
      .insert(orderRefunds)
      .values({
        refundNumber,
        orderId: order.id,
        accountId: order.accountId,
        amount: String(refundAmount.toFixed(2)),
        method,
        status: 'completed',
        reason: data?.reason || 'استرداد قيمة طلبية مرتجعة',
        processedByStaffId: staffId,
        notes: data?.notes || null,
      })
      .returning();

    const [updatedOrder] = await tx
      .update(orders)
      .set({
        refundedAmount: String(refundAmount.toFixed(2)),
        refundStatus: 'refunded',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    await tx.insert(auditLogs).values({
      actionType: 'order_refunded',
      actionLabel: 'استرداد مالي للعميل عن طلبية مرتجعة',
      category: 'commerce',
      categoryLabel: 'الطلبات والمبيعات',
      staffId,
      operatorSnapshot: options?.operator || null,
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      financialImpact: {
        refundAmount,
        refundNumber,
        method,
      },
      details: `تم صرف استرداد مالي بقيمة ${refundAmount.toLocaleString()} د.ع للطلبية ${order.orderNumber} عبر ${method} برقم مستند ${refundNumber}`,
      severity: 'info',
    });

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const [account] = await tx
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.id, order.accountId))
      .limit(1);

    return {
      order: formatOrderRecord(updatedOrder, items, undefined, undefined, account),
      refund: {
        id: String(refundRecord.id),
        refundNumber: String(refundRecord.refundNumber),
        orderId: String(refundRecord.orderId),
        accountId: String(refundRecord.accountId),
        amount: toNumber(refundRecord.amount),
        method: refundRecord.method,
        status: refundRecord.status,
        reason: refundRecord.reason || undefined,
        notes: refundRecord.notes || undefined,
        createdAt: new Date(refundRecord.createdAt).toISOString(),
      },
    };
  };

  if (options?.tx) {
    return await executeRefund(options.tx);
  } else {
    const db = getDb();
    return await db.transaction(executeRefund);
  }
}

/* =========================================================
   5. pgUpdateOrderStatus (Strict Server-Side State Machine)
   ========================================================= */

export async function pgUpdateOrderStatus(
  idOrOrderNumber: string,
  newStatus: OrderStatus,
  options?: {
    driverNotes?: string;
    cancellationReason?: string;
    operator?: PgOperator;
    tx?: any;
    driverId?: string;
    collectedAmount?: number;
    skipPinVerification?: boolean;
  }
): Promise<Order> {
  const trimmed = String(idOrOrderNumber || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  const allowedStatuses: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
  if (!allowedStatuses.includes(newStatus)) {
    throw new Error(`حالة الطلب غير صالحة: ${newStatus}`);
  }

  const executeUpdate = async (tx: any) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) {
      conditions.push(eq(orders.id, trimmed));
    }

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const current = orderRows[0];

    // Idempotent: If status is already the target status, return existing order immediately
    if (current.status === newStatus) {
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, current.id));

      const [account] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, current.accountId))
        .limit(1);

      return formatOrderRecord(current, items, undefined, undefined, account);
    }

    // Terminal State Protection & State Machine Validation under FOR UPDATE lock
    validateOrderTransition(current.status as OrderStatus, newStatus);

    // If newStatus is 'cancelled', delegate to cancel logic within this transaction
    if (newStatus === 'cancelled') {
      return await pgCancelOrder(trimmed, {
        reason: options?.cancellationReason || options?.driverNotes,
        operator: options?.operator,
        tx,
      });
    }

    // If newStatus is 'returned', delegate to return logic within this transaction
    if (newStatus === 'returned') {
      return await pgReturnOrder(trimmed, {
        reason: options?.cancellationReason || options?.driverNotes,
        operator: options?.operator,
        tx,
      });
    }

    const staffId = await resolveStaffId(tx, options?.operator);

    const updatePayload: any = {
      status: newStatus,
      driverNotes: options?.driverNotes || undefined,
      updatedAt: new Date(),
    };

    if (options?.driverId) {
      updatePayload.driverId = options.driverId;
      if (!current.driverAssignedAt) {
        updatePayload.driverAssignedAt = new Date();
      }
    }

    if (newStatus === 'shipped') {
      if (!current.outForDeliveryAt) {
        updatePayload.outForDeliveryAt = new Date();
      }
    }

    if (newStatus === 'delivered') {
      updatePayload.deliveredAt = new Date();
      if (options?.collectedAmount !== undefined) {
        const amt = Math.max(0, toNumber(options.collectedAmount));
        const total = toNumber(current.total);
        updatePayload.collectedAmount = String(amt.toFixed(2));
        if (amt >= total) {
          updatePayload.collectionStatus = 'collected_cash';
        } else if (amt > 0) {
          updatePayload.collectionStatus = 'partial';
        } else {
          updatePayload.collectionStatus = 'debt_unpaid';
        }
        updatePayload.remainingDebtAmount = String(Math.max(0, total - amt).toFixed(2));
      }
    }

    const [updatedOrder] = await tx
      .update(orders)
      .set(updatePayload)
      .where(eq(orders.id, current.id))
      .returning();

    if (newStatus === 'delivered') {
      await pgCreditOrderDeliveredCashback(tx, current.id);
    }

    await tx.insert(auditLogs).values({
      actionType: 'order_status_updated',
      actionLabel: 'تحديث حالة الطلبية',
      category: 'commerce',
      categoryLabel: 'الطلبات والمبيعات',
      staffId,
      operatorSnapshot: options?.operator || null,
      targetType: 'order',
      targetId: current.id,
      targetReferenceNumber: current.orderNumber,
      financialImpact: null,
      details: `تغيير حالة الطلبية ${current.orderNumber} من ${current.status} إلى ${newStatus}`,
      severity: 'info',
    });

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, current.id));

    const [account] = await tx
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.id, current.accountId))
      .limit(1);

    return formatOrderRecord(updatedOrder, items, undefined, undefined, account);
  };

  if (options?.tx) {
    return await executeUpdate(options.tx);
  } else {
    const db = getDb();
    return await db.transaction(executeUpdate);
  }
}

/* =========================================================
   6. pgUpdateOrder
   ========================================================= */

export async function pgUpdateOrder(
  idOrOrderNumber: string,
  updates: Partial<Order> & { items?: OrderItem[]; customer?: CustomerInfo; accountId?: string },
  options?: { adjustInventory?: boolean; operator?: PgOperator; tx?: any }
): Promise<Order> {
  const trimmed = String(idOrOrderNumber || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  const executeUpdate = async (tx: any) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) {
      conditions.push(eq(orders.id, trimmed));
    }

    // 1. Row-level lock on the target order BEFORE any check or modification
    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const current = orderRows[0];

    // 2. Terminal State Protection: Strictly forbid modifying delivered, cancelled, or returned orders
    if (['delivered', 'cancelled', 'returned'].includes(current.status) || current.collectionStatus === 'returned') {
      throw new Error(`الطلبية بحالة نهائية (${current.status}) ولا يمكن تعديلها`);
    }

    // 3. Double-restock Protection: Never allow inventory or item modification if inventory was already restored
    if (current.inventoryRestored) {
      throw new Error('تم استرجاع مخزون هذه الطلبية مسبقاً ولا يمكن تعديل أصنافها أو مخزونها');
    }

    // 4. Financial Identity Protection: Never allow changing the customer accountId to sever the invoice
    if (updates.accountId && updates.accountId !== current.accountId) {
      throw new Error('لا يمكن تغيير الحساب المالي المرتبط بالطلب');
    }

    // 5. Strict State Machine Validation: Do not allow free arbitrary status mutations
    if (updates.status && updates.status !== current.status) {
      validateOrderTransition(current.status as OrderStatus, updates.status as OrderStatus);

      if (updates.status === 'cancelled') {
        return await pgCancelOrder(trimmed, {
          reason: updates.driverNotes || updates.notes,
          operator: options?.operator,
          tx,
        });
      }

      if (updates.status === 'returned') {
        return await pgReturnOrder(trimmed, {
          reason: updates.driverNotes || updates.notes,
          operator: options?.operator,
          tx,
        });
      }

      // Delegate to official lifecycle status updater
      return await pgUpdateOrderStatus(trimmed, updates.status as OrderStatus, {
        operator: options?.operator,
        driverNotes: updates.driverNotes || updates.notes,
        tx,
      });
    }

    const staffId = await resolveStaffId(tx, options?.operator);

    // 6. Item & Quantity Modification: Strictly allowed in 'pending' status ONLY
    if (updates.items && Array.isArray(updates.items)) {
      if (current.status !== 'pending') {
        throw new Error(
          `لا يمكن تعديل أصناف أو كميات الطلبية إلا عندما تكون بحالة الانتظار (pending). حالة الطلب الحالية: ${current.status}`
        );
      }

      // Financial Impact Protection: Forbid modifying items if coupon or cashback was applied
      if (toNumber(current.usedCashbackDiscount) > 0 || current.couponId) {
        throw new Error(
          'لا يمكن تعديل أصناف طلب تم تطبيق كود خصم أو رصيد أرباح (كاشباك) عليه لاختلاف الأثر المالي؛ يرجى إلغاء الطلب وإنشاء طلب جديد بالكميات المعدلة'
        );
      }

      // Fetch customer account to determine authoritative pricing identity
      const [customerAccount] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, current.accountId))
        .limit(1);

      const effectiveUser = normalizePricingIdentity({
        accountType: current.customerAccountTypeSnap || (customerAccount?.category === 'customer' ? undefined : customerAccount?.category),
        pricingTier: customerAccount?.pricingTier,
        merchantTier: current.customerMerchantTierSnap as any,
      });

      // Existing items for inventory diff
      const oldItems = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, current.id));

      const oldDeductedMap = new Map<string, number>();
      for (const it of oldItems) {
        oldDeductedMap.set(it.productId, (oldDeductedMap.get(it.productId) || 0) + Number(it.baseQuantityDeducted));
      }

      // Validate new items and collect new product IDs
      const newDeductedMap = new Map<string, number>();
      const newProductIds = new Set<string>();

      for (const item of updates.items) {
        const pId = String(item.productId || (item as any).id || '').trim();
        if (!pId || !isUuid(pId)) {
          throw new Error(`معرّف المنتج غير صالح: ${item.productId || item.name}`);
        }
        newProductIds.add(pId);
      }

      // Deterministic Sorting of ALL affected product IDs before locking
      const allProductIds = Array.from(
        new Set([...Array.from(oldDeductedMap.keys()), ...Array.from(newProductIds)])
      ).sort((a, b) => a.localeCompare(b));

      // Lock all affected products in deterministic order
      const lockedProdsMap = new Map<string, any>();
      for (const pId of allProductIds) {
        const prodRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, pId))
          .for('update');

        if (prodRows.length === 0) {
          throw new Error(`المنتج غير موجود: ${pId}`);
        }
        lockedProdsMap.set(pId, prodRows[0]);
      }

      // Process new items with authoritative pricing and packaging math
      const newItemsProcessed = [];
      let newCalculatedSubtotal = 0;

      for (const item of updates.items) {
        const pId = String(item.productId || (item as any).id || '').trim();
        const prod = lockedProdsMap.get(pId)!;

        if (prod.isArchived) {
          throw new Error(`المنتج (${prod.name}) مؤرشف ومحذوف من المتجر ولا يمكن طلبه`);
        }
        if (prod.isActive === false) {
          throw new Error(`المنتج (${prod.name}) معطل حالياً وغير متاح للطلب`);
        }

        const boxesPerCarton = Math.max(1, Number(prod.boxesPerCarton) || 1);
        const itemsPerBox = Math.max(1, Number(prod.itemsPerBox) || 1);
        const piecesPerCarton = Number(prod.piecesPerCarton) || (boxesPerCarton * itemsPerBox);

        let soldUnit = 'piece';
        let conversionFactorSnap = 1;
        let unitLabelSnap = item.unitLabel || prod.retailUnit || 'قطعة';

        if (item.saleType === 'wholesale') {
          soldUnit = 'carton';
          conversionFactorSnap = piecesPerCarton;
          unitLabelSnap = item.unitLabel || prod.wholesaleUnit || 'كرتون';
        } else if ((item.saleType as string) === 'box') {
          soldUnit = 'box';
          conversionFactorSnap = itemsPerBox;
          unitLabelSnap = item.unitLabel || 'علبة';
        }

        const qtyRes = validateOrderItemQuantity(item.quantity);
        if (!qtyRes.valid) {
          throw new Error(`كمية غير صالحة للمنتج (${prod.name}): ${qtyRes.error}`);
        }
        const soldQuantity = qtyRes.quantity!;
        const baseQuantityDeducted = soldQuantity * conversionFactorSnap;

        // Query active promotional offer for this product under lock
        const activeOfferRows = await tx
          .select()
          .from(productOffers)
          .where(
            and(
              eq(productOffers.productId, prod.id),
              eq(productOffers.isActive, true),
              or(isNull(productOffers.isArchived), eq(productOffers.isArchived, false)),
              or(isNull(productOffers.startDate), lte(productOffers.startDate, new Date())),
              gt(productOffers.endDate, new Date())
            )
          )
          .orderBy(desc(productOffers.createdAt))
          .limit(1);

        const activeOffer = activeOfferRows.length > 0 ? activeOfferRows[0] : null;

        // Authoritative Server-Side Pricing (NEVER trust item.price)
        const authoritativePricing = resolveAuthoritativeProductPrice({
          product: prod,
          saleType: (item.saleType as any) || 'retail',
          user: effectiveUser,
          activeOffer: activeOffer ? {
            id: activeOffer.id,
            offerPrice: Number(activeOffer.offerPrice),
            offerWholesalePrice: activeOffer.offerWholesalePrice ? Number(activeOffer.offerWholesalePrice) : undefined,
            originalPrice: activeOffer.originalPrice ? Number(activeOffer.originalPrice) : undefined,
            originalWholesalePrice: activeOffer.originalWholesalePrice ? Number(activeOffer.originalWholesalePrice) : undefined,
            startDate: activeOffer.startDate,
            endDate: activeOffer.endDate,
          } : null,
        });

        const authoritativePrice = authoritativePricing.finalUnitPrice;
        const unitCost = toNumber(prod.pieceCostPrice);

        newCalculatedSubtotal += authoritativePrice * soldQuantity;
        newDeductedMap.set(pId, (newDeductedMap.get(pId) || 0) + baseQuantityDeducted);

        newItemsProcessed.push({
          productId: prod.id,
          itemNameSnap: prod.name,
          unitLabelSnap,
          soldUnit,
          soldQuantity,
          conversionFactorSnap,
          baseQuantityDeducted,
          unitPriceSnap: authoritativePrice,
          originalPriceSnap: authoritativePricing.originalUnitPrice,
          offerIdSnap: authoritativePricing.isOfferApplied ? authoritativePricing.offerId || null : null,
          offerDiscountSnap: authoritativePricing.isOfferApplied ? authoritativePricing.offerSavingsPerUnit : 0,
          pricingTierSnap: authoritativePricing.pricingTierApplied,
          unitCostSnap: unitCost,
          earnedCashback: 0,
          image: item.image || null,
        });
      }

      // Rebalance inventory atomically
      for (const pId of allProductIds) {
        const oldPieces = oldDeductedMap.get(pId) || 0;
        const newPieces = newDeductedMap.get(pId) || 0;
        const diff = oldPieces - newPieces; // diff > 0: return to stock; diff < 0: deduct more

        if (diff !== 0) {
          const prod = lockedProdsMap.get(pId)!;
          const currentStock = Number(prod.currentStockPieces) || 0;
          const updatedStock = currentStock + diff;

          if (updatedStock < 0) {
            throw new Error(
              `المخزون غير كافٍ للمنتج (${prod.name}) لتعديل الكمية: المطلوب إضافة ${Math.abs(diff)} قطعة بينما المتاح فقط ${currentStock}`
            );
          }

          await tx
            .update(products)
            .set({ currentStockPieces: updatedStock })
            .where(eq(products.id, prod.id));

          await tx.insert(inventoryMovements).values({
            productId: prod.id,
            movementType: diff > 0 ? 'customer_return' : 'sale',
            quantityPieces: diff,
            unitCostPieces: String(prod.pieceCostPrice || '0.0000'),
            totalCost: String((Math.abs(diff) * Number(prod.pieceCostPrice || 0)).toFixed(2)),
            balanceAfterPieces: updatedStock,
            referenceType: 'order',
            referenceId: current.id,
            referenceNumber: current.orderNumber,
            performedByStaffId: staffId,
            notes: `تعديل كمية أصناف الطلبية ${current.orderNumber} (فارق ${diff} قطعة)`,
          });
        }
      }

      // Replace order items
      await tx.delete(orderItems).where(eq(orderItems.orderId, current.id));
      for (const it of newItemsProcessed) {
        await tx.insert(orderItems).values({
          orderId: current.id,
          productId: it.productId,
          itemNameSnap: it.itemNameSnap,
          unitLabelSnap: it.unitLabelSnap,
          soldUnit: it.soldUnit,
          soldQuantity: it.soldQuantity,
          conversionFactorSnap: it.conversionFactorSnap,
          baseQuantityDeducted: it.baseQuantityDeducted,
          unitPriceSnap: String(it.unitPriceSnap.toFixed(2)),
          originalPriceSnap: it.originalPriceSnap != null ? String(it.originalPriceSnap.toFixed(2)) : null,
          offerIdSnap: it.offerIdSnap,
          offerDiscountSnap: String(it.offerDiscountSnap.toFixed(2)),
          pricingTierSnap: it.pricingTierSnap,
          unitCostSnap: String(it.unitCostSnap.toFixed(4)),
          earnedCashback: '0.00',
          image: it.image,
        });
      }

      // Recalculate totals server-side (Never trust client total or subtotal)
      const newDeliveryFee = updates.deliveryFee !== undefined ? Math.max(0, toNumber(updates.deliveryFee)) : toNumber(current.deliveryFee);
      const newTotal = Math.max(0, newCalculatedSubtotal + newDeliveryFee);

      const updateFields: any = {
        subtotal: String(newCalculatedSubtotal.toFixed(2)),
        deliveryFee: String(newDeliveryFee.toFixed(2)),
        discount: '0.00',
        usedCashbackDiscount: '0.00',
        total: String(newTotal.toFixed(2)),
        remainingDebtAmount: String(newTotal.toFixed(2)),
        updatedAt: new Date(),
      };

      if (updates.paymentMethod) updateFields.paymentMethod = updates.paymentMethod;
      if (updates.notes !== undefined) updateFields.notes = updates.notes;
      if (updates.driverNotes !== undefined) updateFields.driverNotes = updates.driverNotes;
      if (updates.customer?.name) updateFields.customerNameSnap = updates.customer.name.trim();
      if (updates.customer?.phone) updateFields.customerPhoneSnap = normalizePhone(updates.customer.phone);
      if (updates.customer?.address) updateFields.deliveryAddressSnap = updates.customer.address.trim();

      const [updatedOrder] = await tx
        .update(orders)
        .set(updateFields)
        .where(eq(orders.id, current.id))
        .returning();

      await tx.insert(auditLogs).values({
        actionType: 'order_updated',
        actionLabel: 'تعديل أصناف وبيانات الفاتورة',
        category: 'commerce',
        categoryLabel: 'الطلبات والمبيعات',
        staffId,
        operatorSnapshot: options?.operator || null,
        targetType: 'order',
        targetId: current.id,
        targetReferenceNumber: current.orderNumber,
        financialImpact: {
          previousTotal: toNumber(current.total),
          newTotal,
        },
        details: `تعديل أصناف الفاتورة ${current.orderNumber} - الإجمالي الجديد: ${newTotal.toLocaleString()} د.ع`,
        severity: 'info',
      });

      const itemsFromDb = await tx.select().from(orderItems).where(eq(orderItems.orderId, current.id));
      return formatOrderRecord(updatedOrder, itemsFromDb, undefined, undefined, customerAccount);
    }

    // 7. Non-Item Updates (Notes, Delivery Fee adjustments on pending order, Driver Notes, Address)
    const updateFields: any = {
      updatedAt: new Date(),
    };

    if (updates.deliveryFee !== undefined) {
      const newDeliveryFee = Math.max(0, toNumber(updates.deliveryFee));
      const subtotal = toNumber(current.subtotal);
      const discount = toNumber(current.discount);
      const usedCashback = toNumber(current.usedCashbackDiscount);
      const newTotal = Math.max(0, subtotal + newDeliveryFee - discount - usedCashback);

      updateFields.deliveryFee = String(newDeliveryFee.toFixed(2));
      updateFields.total = String(newTotal.toFixed(2));
      updateFields.remainingDebtAmount = String(newTotal.toFixed(2));
    }

    if (updates.paymentMethod) updateFields.paymentMethod = updates.paymentMethod;
    if (updates.notes !== undefined) updateFields.notes = updates.notes;
    if (updates.driverNotes !== undefined) updateFields.driverNotes = updates.driverNotes;
    if (updates.customer?.name) updateFields.customerNameSnap = updates.customer.name.trim();
    if (updates.customer?.phone) updateFields.customerPhoneSnap = normalizePhone(updates.customer.phone);
    if (updates.customer?.address) updateFields.deliveryAddressSnap = updates.customer.address.trim();

    const [updatedOrder] = await tx
      .update(orders)
      .set(updateFields)
      .where(eq(orders.id, current.id))
      .returning();

    await tx.insert(auditLogs).values({
      actionType: 'order_updated',
      actionLabel: 'تعديل بيانات الفاتورة',
      category: 'commerce',
      categoryLabel: 'الطلبات والمبيعات',
      staffId,
      operatorSnapshot: options?.operator || null,
      targetType: 'order',
      targetId: current.id,
      targetReferenceNumber: current.orderNumber,
      financialImpact: {
        previousTotal: toNumber(current.total),
        newTotal: toNumber(updatedOrder.total),
      },
      details: `تعديل بيانات الفاتورة ${current.orderNumber}`,
      severity: 'info',
    });

    const itemsFromDb = await tx.select().from(orderItems).where(eq(orderItems.orderId, current.id));
    const [account] = await tx.select().from(financialAccounts).where(eq(financialAccounts.id, updatedOrder.accountId)).limit(1);

    return formatOrderRecord(updatedOrder, itemsFromDb, undefined, undefined, account);
  };

  if (options?.tx) {
    return await executeUpdate(options.tx);
  } else {
    const db = getDb();
    return await db.transaction(executeUpdate);
  }
}
