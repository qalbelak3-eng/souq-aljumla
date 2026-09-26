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
} from '@/db/schema';
import { Order, OrderItem, CustomerInfo, OrderStatus, PaymentMethod, DeliveryCollectionStatus, MerchantTier } from '@/types';
import { decryptPin, generateOrderPinData } from '@/lib/delivery-pin';
import { pgConsumeCoupon } from '@/lib/postgres-coupons';
import {
  pgRedeemCashbackInOrder,
  pgCreditOrderDeliveredCashback,
  pgReverseOrderRedeemedCashback,
  pgGetAccountCashbackBalance,
} from '@/lib/postgres-cashback';
import { getProductPriceForUser, validateOrderItemQuantity, normalizePricingIdentity } from '@/lib/pricing';

/* =========================================================
   Types & Interfaces
   ========================================================= */

export type PgOperator = {
  name?: string | null;
  username?: string | null;
  role?: string | null;
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
}

export interface PgOrderFilters {
  userId?: string;
  phone?: string;
  email?: string;
  limit?: number;
  status?: OrderStatus;
}

/* =========================================================
   Helpers
   ========================================================= */

function normalizePhone(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
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

  return db.transaction(async (tx) => {
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
      const cleanPhone = normalizePhone(data.customer.phone);
      if (cleanPhone) {
        const accountRows = await tx
          .select()
          .from(financialAccounts)
          .where(and(eq(financialAccounts.phone, cleanPhone), eq(financialAccounts.category, 'customer')))
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
      unitCostSnap: number;
      earnedCashback: number;
      image: string | null;
      newStockPieces: number;
    }> = [];

    let calculatedSubtotal = 0;

    for (const item of data.items) {
      if (!item.productId || !isUuid(item.productId)) {
        throw new Error(`معرّف المنتج غير صالح: ${item.productId || item.name}`);
      }

      // Lock product row FOR UPDATE to prevent concurrency race conditions
      const prodRows = await tx
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .for('update');

      if (prodRows.length === 0) {
        throw new Error(`المنتج غير موجود: ${item.productId}`);
      }

      const prod = prodRows[0];

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

      const currentStockPieces = Number(prod.currentStockPieces) || 0;
      if (currentStockPieces < baseQuantityDeducted) {
        throw new Error(
          `المخزون غير كافٍ للمنتج (${prod.name}): المتاح ${currentStockPieces} قطعة، والمطلوب ${baseQuantityDeducted} قطعة (${soldQuantity} ${unitLabelSnap})`
        );
      }

      const newStockPieces = currentStockPieces - baseQuantityDeducted;
      let unitPrice = toNumber(item.price);

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

      const baseRegularPrice = Number(prod.price) || 0;
      const baseWholesalePrice = Number(prod.wholesalePrice) || 0;
      const baseMarketPrice = Number(prod.marketPrice) || 0;
      const baseBoxPrice = Number(prod.boxPrice) || 0;
      const baseSpecialPrice = Number(prod.specialPrice) || 0;
      const baseVipPrice = Number(prod.vipPrice) || 0;

      const overlayProduct: any = {
        ...prod,
        price: activeOffer ? Number(activeOffer.offerPrice) : baseRegularPrice,
        wholesalePrice: (activeOffer && activeOffer.offerWholesalePrice && Number(activeOffer.offerWholesalePrice) > 0)
          ? Number(activeOffer.offerWholesalePrice)
          : baseWholesalePrice,
        marketPrice: baseMarketPrice,
        boxPrice: baseBoxPrice,
        specialPrice: baseSpecialPrice,
        vipPrice: baseVipPrice,
      };

      const regularProduct: any = {
        ...prod,
        price: baseRegularPrice,
        wholesalePrice: baseWholesalePrice,
        marketPrice: baseMarketPrice,
        boxPrice: baseBoxPrice,
        specialPrice: baseSpecialPrice,
        vipPrice: baseVipPrice,
      };

      // Server-authoritative semantic normalization of customer pricing identity:
      // Never trust client request body. Strictly derive from server-side trusted session / operator or PostgreSQL account:
      const effectiveUser = normalizePricingIdentity({
        accountType: data.userAccountType,
        pricingTier: customerAccount?.pricingTier,
        merchantTier: data.userMerchantTier,
      });

      const officialPricingRes = getProductPriceForUser(
        overlayProduct,
        (item.saleType as any) || 'retail',
        effectiveUser as any
      );
      const regularPricingRes = getProductPriceForUser(
        regularProduct,
        (item.saleType as any) || 'retail',
        effectiveUser as any
      );

      const officialPrice = officialPricingRes.price;
      const regularBasePrice = regularPricingRes.price;

      // Defense-in-depth price verification at repository level (Requirement B & Phase 2B1):
      // Privileged staff or admin operators can specify custom negotiated prices.
      // Unprivileged customer/guest orders or explicit enforcement are strictly bound to official PostgreSQL pricing.
      const isUnprivilegedCustomer = data.operator?.role === 'customer' || data.operator?.role === 'guest';
      const shouldEnforceOfficialPrice = (isUnprivilegedCustomer || (data as any).enforceOfficialPrices === true) && data.trustSuppliedPrices !== true;
      if (shouldEnforceOfficialPrice) {
        unitPrice = officialPrice;
      }

      // Snapshot calculation for audit and historical integrity:
      let originalPriceSnap: number | null = null;
      let offerIdSnap: string | null = null;
      let offerDiscountSnap = 0;

      const isRetailSale = (item.saleType as any) !== 'wholesale' && (item.saleType as any) !== 'box';
      const isWholesaleSale = (item.saleType as any) === 'wholesale';

      if (activeOffer) {
        if (isRetailSale) {
          originalPriceSnap = Number(activeOffer.originalPrice) || regularBasePrice;
          offerIdSnap = activeOffer.id;
          offerDiscountSnap = Math.max(0, originalPriceSnap - unitPrice);
        } else if (isWholesaleSale && activeOffer.offerWholesalePrice && Number(activeOffer.offerWholesalePrice) > 0) {
          originalPriceSnap = Number(activeOffer.originalWholesalePrice) || regularBasePrice;
          offerIdSnap = activeOffer.id;
          offerDiscountSnap = Math.max(0, originalPriceSnap - unitPrice);
        } else {
          originalPriceSnap = regularBasePrice;
          offerIdSnap = null;
          offerDiscountSnap = 0;
        }
      } else {
        originalPriceSnap = regularBasePrice;
        offerIdSnap = null;
        offerDiscountSnap = 0;
      }

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
      }

      const unitCost = toNumber(prod.pieceCostPrice);
      const itemEarnedCashback = toNumber(item.earnedCashback);

      calculatedSubtotal += unitPrice * soldQuantity;

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
        unitCostSnap: unitCost,
        earnedCashback: itemEarnedCashback,
        image: item.image || null,
        newStockPieces,
      });
    }

    const subtotal = calculatedSubtotal;
    let discount = 0;
    let consumedCouponSnapshot: {
      id?: string;
      code?: string;
      discountType?: string;
      discountValue?: number;
    } | null = null;

    if (data.couponCode && data.couponCode.trim()) {
      const cleanCoupon = data.couponCode.trim();
      const accountType = data.userAccountType || customerAccount?.pricingTier || (data.customer as any)?.accountType || 'individual';
      const couponRes = await pgConsumeCoupon(cleanCoupon, subtotal, accountType, tx);
      discount = couponRes.discount;
      if (couponRes.coupon) {
        consumedCouponSnapshot = {
          id: couponRes.coupon.id,
          code: couponRes.coupon.code,
          discountType: couponRes.coupon.discountType,
          discountValue: couponRes.coupon.discountValue,
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

    const newOrderId = crypto.randomUUID();

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
    try {
      await tx.execute(sql`
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_id" uuid;
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_code_snap" varchar(50);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_discount_type_snap" varchar(20);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_discount_value_snap" numeric(14, 2);
      `);
    } catch {}

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
      })
      .returning();

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
}

/* =========================================================
   4. pgCancelOrder
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

    // Protection: Prevent cancelling or returning orders that are already delivered
    if (order.status === 'delivered') {
      throw new Error('الطلب تم تسليمه بالفعل ولا يمكن إرجاعه أو إلغاؤه');
    }

    // Protection: Prevent cancelling orders with recorded payment / collection without formal reversal
    const paid = toNumber(order.collectedAmount);
    if (paid > 0) {
      throw new Error(
        'لا يمكن إلغاء الطلبية لاحتوائها على حركة مالية مسجلة (دفع أو تحصيل). تتطلب العملية تسوية واسترداد مالي (Financial Reversal / Refund Workflow).'
      );
    }

    // Idempotency: If already returned, return current state without re-restoring inventory or creating duplicate audit logs
    if (options?.isReturn && order.collectionStatus === 'returned') {
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

    const staffId = await resolveStaffId(tx, options?.operator);

    // Idempotency: Only restore inventory once
    if (!order.inventoryRestored) {
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      for (const item of items) {
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
            movementType: options?.isReturn ? 'customer_return' : 'order_cancellation',
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

    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: 'cancelled',
        collectionStatus: options?.isReturn ? 'returned' : order.collectionStatus,
        remainingDebtAmount: '0.00',
        inventoryRestored: true,
        deliveryPinEncrypted: null,
        driverNotes: options?.reason || order.driverNotes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // Safely and idempotently reverse any used cashback discount back to the customer's ledger
    await pgReverseOrderRedeemedCashback(tx, order.id, options?.reason);

    await tx.insert(auditLogs).values({
      actionType: 'order_cancelled',
      actionLabel: options?.isReturn ? 'إرجاع طلبية واسترجاع المخزون' : 'إلغاء طلبية واسترجاع المخزون',
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
      details: `إلغاء الطلبية ${order.orderNumber}: ${options?.reason || 'تم الإلغاء'}`,
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
   5. pgUpdateOrderStatus
   ========================================================= */

export async function pgUpdateOrderStatus(
  idOrOrderNumber: string,
  newStatus: OrderStatus,
  options?: { driverNotes?: string; cancellationReason?: string; operator?: PgOperator }
): Promise<Order> {
  const current = await pgGetOrderById(idOrOrderNumber);
  if (!current) {
    throw new Error('الطلب غير موجود');
  }

  // Terminal State Protection: Never reopen cancelled or returned orders
  if (current.status === 'cancelled' || current.collectionStatus === 'returned') {
    if (newStatus !== 'cancelled') {
      throw new Error('الطلبية ملغاة أو راجعة ولا يمكن تعديلها أو إعادة فتحها (حالة نهائية)');
    }
    // Safe idempotency if status is already cancelled
    return current;
  }

  if (newStatus === 'cancelled') {
    return pgCancelOrder(idOrOrderNumber, {
      reason: options?.cancellationReason || options?.driverNotes,
      operator: options?.operator,
    });
  }

  const allowedStatuses: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!allowedStatuses.includes(newStatus)) {
    throw new Error(`حالة الطلب غير صالحة: ${newStatus}`);
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const staffId = await resolveStaffId(tx, options?.operator);

    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: newStatus,
        driverNotes: options?.driverNotes || undefined,
        updatedAt: new Date(),
      })
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
      .where(eq(financialAccounts.id, current.customer.userId || updatedOrder.accountId))
      .limit(1);

    return formatOrderRecord(updatedOrder, items, undefined, undefined, account);
  });
}

/* =========================================================
   6. pgUpdateOrder
   ========================================================= */

export async function pgUpdateOrder(
  idOrOrderNumber: string,
  updates: Partial<Order>,
  options?: { adjustInventory?: boolean; operator?: PgOperator }
): Promise<Order> {
  const current = await pgGetOrderById(idOrOrderNumber);
  if (!current) {
    throw new Error('الطلب غير موجود');
  }

  // Terminal State Protection
  if (current.status === 'cancelled' || current.collectionStatus === 'returned') {
    if (updates.status && updates.status !== 'cancelled') {
      throw new Error('الطلبية ملغاة أو راجعة ولا يمكن تعديلها أو إعادة فتحها (حالة نهائية)');
    }
  }

  if (updates.status === 'cancelled' && current.status !== 'cancelled') {
    return pgCancelOrder(idOrOrderNumber, {
      reason: updates.driverNotes || updates.notes,
      operator: options?.operator,
    });
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const staffId = await resolveStaffId(tx, options?.operator);

    // If items are modified and adjustInventory is true, compute delta adjustments
    if (options?.adjustInventory !== false && updates.items && Array.isArray(updates.items)) {
      const oldItems = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, current.id));

      const oldDeductedMap = new Map<string, number>();
      for (const it of oldItems) {
        oldDeductedMap.set(it.productId, (oldDeductedMap.get(it.productId) || 0) + Number(it.baseQuantityDeducted));
      }

      // Re-evaluate new items
      const newItemsProcessed = [];
      let newCalculatedSubtotal = 0;

      for (const item of updates.items) {
        if (!item.productId || !isUuid(item.productId)) {
          throw new Error(`معرّف المنتج غير صالح: ${item.productId || item.name}`);
        }

        const [prod] = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .for('update');

        if (!prod) {
          throw new Error(`المنتج غير موجود: ${item.productId}`);
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
        const unitPrice = toNumber(item.price);
        const unitCost = toNumber(prod.pieceCostPrice);

        newCalculatedSubtotal += unitPrice * soldQuantity;

        newItemsProcessed.push({
          productId: prod.id,
          itemNameSnap: prod.name,
          unitLabelSnap,
          soldUnit,
          soldQuantity,
          conversionFactorSnap,
          baseQuantityDeducted,
          unitPriceSnap: unitPrice,
          unitCostSnap: unitCost,
          earnedCashback: toNumber(item.earnedCashback),
          image: item.image || null,
        });
      }

      const newDeductedMap = new Map<string, number>();
      for (const it of newItemsProcessed) {
        newDeductedMap.set(it.productId, (newDeductedMap.get(it.productId) || 0) + it.baseQuantityDeducted);
      }

      const allProductIds = Array.from(new Set([...Array.from(oldDeductedMap.keys()), ...Array.from(newDeductedMap.keys())]));
      for (const pId of allProductIds) {
        const oldPieces = oldDeductedMap.get(pId) || 0;
        const newPieces = newDeductedMap.get(pId) || 0;
        const diff = oldPieces - newPieces; // diff > 0 means returned to stock, diff < 0 means more stock needed

        if (diff !== 0) {
          const [prod] = await tx
            .select()
            .from(products)
            .where(eq(products.id, pId))
            .for('update');

          if (prod) {
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
          unitCostSnap: String(it.unitCostSnap.toFixed(4)),
          earnedCashback: String(it.earnedCashback.toFixed(2)),
          image: it.image,
        });
      }

      updates.subtotal = newCalculatedSubtotal;
    }

    const newSubtotal = updates.subtotal !== undefined ? toNumber(updates.subtotal) : current.subtotal;
    const newDeliveryFee = updates.deliveryFee !== undefined ? toNumber(updates.deliveryFee) : (current.deliveryFee || 0);
    const newDiscount = updates.discount !== undefined ? toNumber(updates.discount) : current.discount;
    const newUsedCashback = updates.usedCashbackDiscount !== undefined ? toNumber(updates.usedCashbackDiscount) : (current.usedCashbackDiscount || 0);
    const newTotal = updates.total !== undefined ? toNumber(updates.total) : Math.max(0, newSubtotal + newDeliveryFee - newDiscount - newUsedCashback);

    const updateFields: any = {
      subtotal: String(newSubtotal.toFixed(2)),
      deliveryFee: String(newDeliveryFee.toFixed(2)),
      discount: String(newDiscount.toFixed(2)),
      usedCashbackDiscount: String(newUsedCashback.toFixed(2)),
      total: String(newTotal.toFixed(2)),
      updatedAt: new Date(),
    };

    if (updates.status && ['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(updates.status)) {
      updateFields.status = updates.status;
    }
    if (updates.paymentMethod) {
      updateFields.paymentMethod = updates.paymentMethod;
    }
    if (updates.notes !== undefined) {
      updateFields.notes = updates.notes;
    }
    if (updates.driverNotes !== undefined) {
      updateFields.driverNotes = updates.driverNotes;
    }
    if (updates.customer?.name) {
      updateFields.customerNameSnap = updates.customer.name.trim();
    }
    if (updates.customer?.phone) {
      updateFields.customerPhoneSnap = normalizePhone(updates.customer.phone);
    }
    if (updates.customer?.address) {
      updateFields.deliveryAddressSnap = updates.customer.address.trim();
    }

    const [updatedOrder] = await tx
      .update(orders)
      .set(updateFields)
      .where(eq(orders.id, current.id))
      .returning();

    if (updates.status === 'delivered' && current.status !== 'delivered') {
      await pgCreditOrderDeliveredCashback(tx, current.id);
    }

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
        previousTotal: current.total,
        newTotal,
      },
      details: `تعديل الفاتورة ${current.orderNumber} - الإجمالي الجديد: ${newTotal.toLocaleString()} د.ع`,
      severity: 'info',
    });

    const itemsFromDb = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, current.id));

    const [account] = await tx
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.id, updatedOrder.accountId))
      .limit(1);

    return formatOrderRecord(updatedOrder, itemsFromDb, undefined, undefined, account);
  });
}
