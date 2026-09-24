import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  orders,
  orderItems,
  drivers,
  vehicles,
  authIdentities,
  financialAccounts,
  auditLogs,
} from '@/db/schema';
import { Order, OrderStatus, DeliveryCollectionStatus } from '@/types';
import {
  formatOrderRecord,
  pgCancelOrder,
  toNumber,
  isUuid,
} from '@/lib/postgres-orders';

/* =========================================================
   Types & Interfaces
   ========================================================= */

export interface AssignDriverInput {
  orderId: string;
  driverId: string | null; // null or 'none' to unassign
  vehicleId?: string | null;
  adminOperator: {
    userId?: string;
    username: string;
    role: string;
    name?: string;
  };
}

export interface DriverOperatorInfo {
  id: string;
  name: string;
  phone: string;
}

export interface DeliverOrderInput {
  collectionStatus?: 'collected_cash' | 'debt_unpaid' | 'partial';
  collectedAmount?: number;
  notes?: string;
}

export type DeliveryFailureReason =
  | 'customer_refused'
  | 'customer_unreachable'
  | 'wrong_address'
  | 'customer_requested_reschedule'
  | 'other';

export interface FailDeliveryInput {
  reason: DeliveryFailureReason;
  notes?: string;
}

export interface DriverOrderView {
  id: string;
  orderNumber: string;
  customer: {
    name: string;
    phone: string;
    address: string;
    locationTitle?: string;
    lat?: number;
    lng?: number;
    mapsUrl?: string;
    storefrontImage?: string;
    notes?: string;
  };
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitLabel: string;
    soldUnit: string;
    price: number;
    image?: string;
  }>;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  paymentMethod: string;
  collectionStatus: DeliveryCollectionStatus;
  collectedAmount: number;
  remainingDebtAmount: number;
  driverNotes?: string;
  notes?: string;
  driverAssignedAt?: string;
  outForDeliveryAt?: string;
  driverArrivedAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* =========================================================
   1. pgAssignOrderDriver (Admin Assignment & Re-assignment)
   ========================================================= */

export async function pgAssignOrderDriver(input: AssignDriverInput): Promise<Order> {
  const db = getDb();
  const trimmedOrderId = String(input.orderId || '').trim();
  if (!trimmedOrderId) {
    throw new Error('معرف الطلب مطلوب للإسناد');
  }

  return await db.transaction(async (tx) => {
    // 1. Fetch order with row-level lock
    const conditions = [eq(orders.orderNumber, trimmedOrderId)];
    if (isUuid(trimmedOrderId)) {
      conditions.push(eq(orders.id, trimmedOrderId));
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

    // 2. State validation: Cannot assign cancelled, returned or delivered orders
    if (order.status === 'cancelled' || order.collectionStatus === 'returned') {
      throw new Error('الطلبية ملغاة أو راجعة ولا يمكن إسنادها لسائق (حالة نهائية)');
    }
    if (order.status === 'delivered') {
      throw new Error('الطلبية تم تسليمها بالفعل ولا يمكن إعادة إسنادها');
    }

    // 3. Handle unassignment
    if (!input.driverId || input.driverId === 'none') {
      if (order.status === 'shipped') {
        throw new Error('الطلبية خرجت للتوصيل بالفعل مع السائق، لا يمكن إلغاء الإسناد قبل إرجاعها للمستودع');
      }

      const [unassignedOrder] = await tx
        .update(orders)
        .set({
          driverId: null,
          vehicleId: null,
          driverAssignedAt: null,
          status: order.status === 'processing' ? 'pending' : order.status,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();

      await tx.insert(auditLogs).values({
        actionType: 'order_unassigned',
        actionLabel: 'إلغاء إسناد الطلبية من السائق',
        category: 'commerce',
        categoryLabel: 'الطلبات والتوصيل',
        operatorSnapshot: input.adminOperator,
        targetType: 'order',
        targetId: order.id,
        targetReferenceNumber: order.orderNumber,
        details: `قام المشرف ${input.adminOperator.username} بإلغاء إسناد الطلبية ${order.orderNumber} من السائق السابق (${order.driverId || 'غير محدد'})`,
        severity: 'info',
      });

      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const [acc] = await tx.select().from(financialAccounts).where(eq(financialAccounts.id, order.accountId)).limit(1);
      return formatOrderRecord(unassignedOrder, items, undefined, undefined, acc);
    }

    // 4. Validate driver existence & active state in PostgreSQL
    const driverRows = await tx
      .select({
        driver: drivers,
        auth: authIdentities,
      })
      .from(drivers)
      .innerJoin(authIdentities, eq(drivers.authIdentityId, authIdentities.id))
      .where(eq(drivers.id, input.driverId))
      .limit(1);

    if (driverRows.length === 0) {
      throw new Error('السائق المحدد غير موجود');
    }

    const { driver: drv, auth } = driverRows[0];
    if (!drv.isActive) {
      throw new Error('حساب السائق معطل ولا يمكن إسناد الطلبات إليه');
    }
    if (!auth.isActive) {
      throw new Error('هوية السائق الأمنية معطلة ولا يمكن إسناد الطلبات إليه');
    }

    // 5. Prevent reassignment if order is already out for delivery with another driver
    if (order.status === 'shipped' && order.driverId !== drv.id) {
      throw new Error('الطلبية خرجت للتوصيل بالفعل مع سائق آخر، يجب إرجاعها للمستودع أولاً قبل إعادة الإسناد');
    }

    // 6. Validate Vehicle if specified or using driver default
    let validVehicleId: string | null = null;
    const targetVehicleId = input.vehicleId !== undefined
      ? (input.vehicleId === 'none' ? null : input.vehicleId)
      : drv.defaultVehicleId;

    if (targetVehicleId) {
      const [veh] = await tx
        .select({ id: vehicles.id, isActive: vehicles.isActive })
        .from(vehicles)
        .where(eq(vehicles.id, targetVehicleId))
        .limit(1);

      if (!veh) {
        throw new Error('المركبة المحددة غير موجودة');
      }
      if (!veh.isActive) {
        throw new Error('المركبة المحددة معطلة ولا يمكن إسنادها');
      }
      validVehicleId = veh.id;
    }

    const isReassignment = !!(order.driverId && order.driverId !== drv.id);
    const oldDriverId = order.driverId;
    const nextStatus = order.status === 'pending' ? 'processing' : order.status;

    // 7. Update order
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        driverId: drv.id,
        vehicleId: validVehicleId,
        driverAssignedAt: order.driverAssignedAt || new Date(),
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // 8. Record audit log
    await tx.insert(auditLogs).values({
      actionType: isReassignment ? 'order_reassigned' : 'order_assigned_to_driver',
      actionLabel: isReassignment ? 'إعادة إسناد الطلبية لسائق آخر' : 'إسناد الطلبية إلى سائق',
      category: 'commerce',
      categoryLabel: 'الطلبات والتوصيل',
      operatorSnapshot: input.adminOperator,
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      details: isReassignment
        ? `قام المشرف ${input.adminOperator.username} بإعادة إسناد الطلبية ${order.orderNumber} من السائق (${oldDriverId}) إلى السائق ${drv.name} (${drv.phone})`
        : `قام المشرف ${input.adminOperator.username} بإسناد الطلبية ${order.orderNumber} إلى السائق ${drv.name} (${drv.phone})`,
      severity: 'info',
    });

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const [acc] = await tx.select().from(financialAccounts).where(eq(financialAccounts.id, order.accountId)).limit(1);
    const [vehicleRow] = validVehicleId
      ? await tx.select().from(vehicles).where(eq(vehicles.id, validVehicleId)).limit(1)
      : [undefined];

    return formatOrderRecord(updatedOrder, items, drv, vehicleRow, acc);
  });
}

/* =========================================================
   2. pgGetDriverOrders (Secure Driver Orders List)
   ========================================================= */

export async function pgGetDriverOrders(driverId: string): Promise<{
  activeOrders: DriverOrderView[];
  historyOrders: DriverOrderView[];
}> {
  const db = getDb();
  if (!driverId || !isUuid(driverId)) {
    return { activeOrders: [], historyOrders: [] };
  }

  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.driverId, driverId))
    .orderBy(desc(orders.createdAt));

  if (orderRows.length === 0) {
    return { activeOrders: [], historyOrders: [] };
  }

  const orderIds = orderRows.map((o) => o.id);
  const allItems = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  const itemsMap = new Map<string, typeof allItems>();
  for (const it of allItems) {
    const list = itemsMap.get(it.orderId) || [];
    list.push(it);
    itemsMap.set(it.orderId, list);
  }

  const activeOrders: DriverOrderView[] = [];
  const historyOrders: DriverOrderView[] = [];

  for (const o of orderRows) {
    const orderItemsList = itemsMap.get(o.id) || [];
    const sanitizedView: DriverOrderView = {
      id: o.id,
      orderNumber: o.orderNumber,
      customer: {
        name: o.customerNameSnap,
        phone: o.customerPhoneSnap,
        address: o.deliveryAddressSnap,
        locationTitle: o.locationTitleSnap || undefined,
        lat: o.lat ? Number(o.lat) : undefined,
        lng: o.lng ? Number(o.lng) : undefined,
        mapsUrl: o.mapsUrl || undefined,
        storefrontImage: o.storefrontImage || undefined,
        notes: o.notes || undefined,
      },
      items: orderItemsList.map((it) => ({
        productId: it.productId,
        name: it.itemNameSnap,
        quantity: Number(it.soldQuantity),
        unitLabel: it.unitLabelSnap,
        soldUnit: it.soldUnit,
        price: toNumber(it.unitPriceSnap),
        image: it.image || undefined,
      })),
      subtotal: toNumber(o.subtotal),
      deliveryFee: toNumber(o.deliveryFee),
      discount: toNumber(o.discount),
      total: toNumber(o.total),
      status: o.status as OrderStatus,
      paymentMethod: o.paymentMethod,
      collectionStatus: o.collectionStatus as DeliveryCollectionStatus,
      collectedAmount: toNumber(o.collectedAmount),
      remainingDebtAmount: toNumber(o.remainingDebtAmount),
      driverNotes: o.driverNotes || undefined,
      notes: o.notes || undefined,
      driverAssignedAt: o.driverAssignedAt ? o.driverAssignedAt.toISOString() : undefined,
      outForDeliveryAt: o.outForDeliveryAt ? o.outForDeliveryAt.toISOString() : undefined,
      driverArrivedAt: o.driverArrivedAt ? o.driverArrivedAt.toISOString() : undefined,
      deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : undefined,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };

    if (o.status === 'delivered' || o.status === 'cancelled' || o.collectionStatus === 'returned') {
      historyOrders.push(sanitizedView);
    } else {
      activeOrders.push(sanitizedView);
    }
  }

  return { activeOrders, historyOrders };
}

/* =========================================================
   3. pgGetDriverOrderById (Object-Level Authorization)
   ========================================================= */

export async function pgGetDriverOrderById(driverId: string, orderId: string): Promise<DriverOrderView | null> {
  const db = getDb();
  if (!driverId || !orderId) return null;

  const conditions = [
    and(eq(orders.orderNumber, orderId), eq(orders.driverId, driverId)),
  ];
  if (isUuid(orderId)) {
    conditions.push(and(eq(orders.id, orderId), eq(orders.driverId, driverId)));
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(or(...conditions))
    .limit(1);

  if (!order) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customer: {
      name: order.customerNameSnap,
      phone: order.customerPhoneSnap,
      address: order.deliveryAddressSnap,
      locationTitle: order.locationTitleSnap || undefined,
      lat: order.lat ? Number(order.lat) : undefined,
      lng: order.lng ? Number(order.lng) : undefined,
      mapsUrl: order.mapsUrl || undefined,
      storefrontImage: order.storefrontImage || undefined,
      notes: order.notes || undefined,
    },
    items: items.map((it) => ({
      productId: it.productId,
      name: it.itemNameSnap,
      quantity: Number(it.soldQuantity),
      unitLabel: it.unitLabelSnap,
      soldUnit: it.soldUnit,
      price: toNumber(it.unitPriceSnap),
      image: it.image || undefined,
    })),
    subtotal: toNumber(order.subtotal),
    deliveryFee: toNumber(order.deliveryFee),
    discount: toNumber(order.discount),
    total: toNumber(order.total),
    status: order.status as OrderStatus,
    paymentMethod: order.paymentMethod,
    collectionStatus: order.collectionStatus as DeliveryCollectionStatus,
    collectedAmount: toNumber(order.collectedAmount),
    remainingDebtAmount: toNumber(order.remainingDebtAmount),
    driverNotes: order.driverNotes || undefined,
    notes: order.notes || undefined,
    driverAssignedAt: order.driverAssignedAt ? order.driverAssignedAt.toISOString() : undefined,
    outForDeliveryAt: order.outForDeliveryAt ? order.outForDeliveryAt.toISOString() : undefined,
    driverArrivedAt: order.driverArrivedAt ? order.driverArrivedAt.toISOString() : undefined,
    deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : undefined,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/* =========================================================
   4. pgStartDriverDelivery (Confirm Pickup / Out for Delivery)
   ========================================================= */

export async function pgStartDriverDelivery(
  driverId: string,
  orderId: string,
  driverOperator: DriverOperatorInfo
): Promise<Order> {
  const db = getDb();
  const trimmed = String(orderId || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  return await db.transaction(async (tx) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) conditions.push(eq(orders.id, trimmed));

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const order = orderRows[0];

    // Object-Level Authorization: only assigned driver can start delivery
    if (!order.driverId || order.driverId !== driverId) {
      throw new Error('هذا الطلب غير مسند إليك ولا يمكنك بدء توصيله');
    }

    // Terminal State Checks
    if (order.status === 'delivered') {
      throw new Error('الطلب تم تسليمه بالفعل ولا يمكن بدء توصيله مجدداً');
    }
    if (order.status === 'cancelled' || order.collectionStatus === 'returned') {
      throw new Error('الطلب ملغى أو راجع ولا يمكن بدء توصيله');
    }

    // Idempotency: If already shipped and outForDeliveryAt is set, return current order without duplicate effect
    if (order.status === 'shipped') {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const [acc] = await tx.select().from(financialAccounts).where(eq(financialAccounts.id, order.accountId)).limit(1);
      const [drv] = await tx.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
      return formatOrderRecord(order, items, drv, undefined, acc);
    }

    // State Machine Transition check
    if (order.status !== 'processing' && order.status !== 'pending') {
      throw new Error(`حالة الطلب الحالية (${order.status}) لا تسمح ببدء التوصيل`);
    }

    // Update to shipped / out for delivery
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: 'shipped',
        outForDeliveryAt: order.outForDeliveryAt || new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // Audit Log
    await tx.insert(auditLogs).values({
      actionType: 'delivery_started',
      actionLabel: 'بدء التوصيل وخروج الطلبية مع السائق',
      category: 'commerce',
      categoryLabel: 'الطلبات والتوصيل',
      operatorSnapshot: { role: 'driver', ...driverOperator },
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      details: `قام السائق ${driverOperator.name} بتأكيد استلام الطلبية ${order.orderNumber} وبدء التوصيل`,
      severity: 'info',
    });

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const [acc] = await tx.select().from(financialAccounts).where(eq(financialAccounts.id, order.accountId)).limit(1);
    const [drv] = await tx.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    return formatOrderRecord(updatedOrder, items, drv, undefined, acc);
  });
}

/* =========================================================
   5. pgNotifyDriverArrived (Arrival Notification)
   ========================================================= */

export async function pgNotifyDriverArrived(
  driverId: string,
  orderId: string,
  driverOperator: DriverOperatorInfo
): Promise<{ success: boolean; arrivedAt: string }> {
  const db = getDb();
  const trimmed = String(orderId || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  return await db.transaction(async (tx) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) conditions.push(eq(orders.id, trimmed));

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const order = orderRows[0];

    // Object-Level Authorization
    if (!order.driverId || order.driverId !== driverId) {
      throw new Error('هذا الطلب غير مسند إليك');
    }

    const arrivedAt = new Date();
    await tx
      .update(orders)
      .set({
        driverArrivedAt: order.driverArrivedAt || arrivedAt,
        updatedAt: arrivedAt,
      })
      .where(eq(orders.id, order.id));

    await tx.insert(auditLogs).values({
      actionType: 'delivery_arrived',
      actionLabel: 'وصول السائق لموقع الزبون',
      category: 'commerce',
      categoryLabel: 'الطلبات والتوصيل',
      operatorSnapshot: { role: 'driver', ...driverOperator },
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      details: `سجل السائق ${driverOperator.name} وصوله لموقع الزبون للطلبية ${order.orderNumber}`,
      severity: 'info',
    });

    return { success: true, arrivedAt: arrivedAt.toISOString() };
  });
}

/* =========================================================
   6. pgDeliverDriverOrder (Deliver & Cash Collection)
   ========================================================= */

export async function pgDeliverDriverOrder(
  driverId: string,
  orderId: string,
  driverOperator: DriverOperatorInfo,
  input?: DeliverOrderInput
): Promise<Order> {
  const db = getDb();
  const trimmed = String(orderId || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  return await db.transaction(async (tx) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) conditions.push(eq(orders.id, trimmed));

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const order = orderRows[0];

    // Object-Level Authorization
    if (!order.driverId || order.driverId !== driverId) {
      throw new Error('هذا الطلب غير مسند إليك ولا يمكنك إتمام تسليمه');
    }

    // Terminal State Checks
    if (order.status === 'cancelled' || order.collectionStatus === 'returned') {
      throw new Error('الطلب ملغى أو راجع ولا يمكن إتمام تسليمه');
    }

    // Idempotency check:
    // If the order was already marked delivered (e.g. concurrent race condition or duplicate submit),
    // return the existing state immediately without duplicating collected cash or audit moves!
    if (order.status === 'delivered') {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const [acc] = await tx.select().from(financialAccounts).where(eq(financialAccounts.id, order.accountId)).limit(1);
      const [drv] = await tx.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
      return formatOrderRecord(order, items, drv, undefined, acc);
    }

    // Determine Collection Status & Amounts Server-Side (Do NOT trust total from client)
    const orderTotal = toNumber(order.total);
    let finalCollectionStatus: DeliveryCollectionStatus = 'collected_cash';
    let finalCollectedAmount = 0;
    let finalRemainingDebt = 0;

    if (order.paymentMethod === 'cod' || order.paymentMethod === 'cash') {
      if (input?.collectionStatus === 'debt_unpaid') {
        finalCollectionStatus = 'debt_unpaid';
        finalCollectedAmount = 0;
        finalRemainingDebt = orderTotal;
      } else if (input?.collectionStatus === 'partial') {
        const rawCollected = toNumber(input.collectedAmount);
        const validCollected = Math.min(orderTotal, Math.max(0, rawCollected));
        finalCollectedAmount = validCollected;
        finalRemainingDebt = Math.max(0, orderTotal - validCollected);
        finalCollectionStatus = validCollected >= orderTotal ? 'collected_cash' : (validCollected > 0 ? 'partial' : 'debt_unpaid');
      } else {
        // Full cash collection on delivery
        finalCollectionStatus = 'collected_cash';
        finalCollectedAmount = orderTotal;
        finalRemainingDebt = 0;
      }
    } else if (order.paymentMethod === 'debt') {
      finalCollectionStatus = 'debt_unpaid';
      finalCollectedAmount = 0;
      finalRemainingDebt = orderTotal;
    } else {
      // Prepaid online / zaincash / qicard / bank transfer
      finalCollectionStatus = 'collected_cash';
      finalCollectedAmount = 0; // Digital payment already recorded, driver holds 0 cash
      finalRemainingDebt = 0;
    }

    const deliveredAt = order.deliveredAt || new Date();

    // Update order to delivered
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: 'delivered',
        deliveredAt,
        collectionStatus: finalCollectionStatus,
        collectedAmount: String(finalCollectedAmount.toFixed(2)),
        remainingDebtAmount: String(finalRemainingDebt.toFixed(2)),
        driverCashSettled: false, // Remains in driver custody until Admin Settlement phase!
        driverNotes: input?.notes
          ? (order.driverNotes ? `${order.driverNotes} | ${input.notes}` : input.notes)
          : order.driverNotes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // Audit Log
    await tx.insert(auditLogs).values({
      actionType: 'delivery_completed',
      actionLabel: 'إتمام تسليم الطلبية للزبون',
      category: 'commerce',
      categoryLabel: 'الطلبات والتوصيل',
      operatorSnapshot: { role: 'driver', ...driverOperator },
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      financialImpact: {
        total: orderTotal,
        collectedAmount: finalCollectedAmount,
        remainingDebt: finalRemainingDebt,
        collectionStatus: finalCollectionStatus,
        driverCashSettled: false,
      },
      details: `تم تسليم الطلبية ${order.orderNumber} للزبون بنجاح بواسطة السائق ${driverOperator.name}. المبلغ المحصل: ${finalCollectedAmount.toLocaleString()} د.ع، المتبقي كدين: ${finalRemainingDebt.toLocaleString()} د.ع`,
      severity: 'info',
    });

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const [acc] = await tx.select().from(financialAccounts).where(eq(financialAccounts.id, order.accountId)).limit(1);
    const [drv] = await tx.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    return formatOrderRecord(updatedOrder, items, drv, undefined, acc);
  });
}

/* =========================================================
   7. pgUpdateDriverDeliveryCollection (Adjust before settlement)
   ========================================================= */

export async function pgUpdateDriverDeliveryCollection(
  driverId: string,
  orderId: string,
  driverOperator: DriverOperatorInfo,
  input: DeliverOrderInput
): Promise<Order> {
  const db = getDb();
  const trimmed = String(orderId || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  return await db.transaction(async (tx) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) conditions.push(eq(orders.id, trimmed));

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const order = orderRows[0];

    // Object-Level Authorization
    if (!order.driverId || order.driverId !== driverId) {
      throw new Error('هذا الطلب غير مسند إليك');
    }

    if (order.driverCashSettled) {
      throw new Error('تمت تصفية عهدة هذه الطلبية رسمياً مع الإدارة مسبقاً ولا يمكن تعديلها');
    }

    if (order.status !== 'delivered') {
      throw new Error('لا يمكن تعديل مبلغ التحصيل لطلبية لم يتم تسليمها بعد');
    }

    const orderTotal = toNumber(order.total);
    let finalCollectionStatus: DeliveryCollectionStatus = input.collectionStatus || 'collected_cash';
    let finalCollectedAmount = 0;
    let finalRemainingDebt = 0;

    if (finalCollectionStatus === 'collected_cash') {
      finalCollectedAmount = orderTotal;
      finalRemainingDebt = 0;
    } else if (finalCollectionStatus === 'partial') {
      const raw = toNumber(input.collectedAmount);
      finalCollectedAmount = Math.min(orderTotal, Math.max(0, raw));
      finalRemainingDebt = Math.max(0, orderTotal - finalCollectedAmount);
      if (finalCollectedAmount >= orderTotal) finalCollectionStatus = 'collected_cash';
    } else if (finalCollectionStatus === 'debt_unpaid') {
      finalCollectedAmount = 0;
      finalRemainingDebt = orderTotal;
    }

    const [updatedOrder] = await tx
      .update(orders)
      .set({
        collectionStatus: finalCollectionStatus,
        collectedAmount: String(finalCollectedAmount.toFixed(2)),
        remainingDebtAmount: String(finalRemainingDebt.toFixed(2)),
        driverNotes: input.notes !== undefined ? input.notes : order.driverNotes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    await tx.insert(auditLogs).values({
      actionType: 'delivery_collection_updated',
      actionLabel: 'تعديل مبلغ تحصيل الطلبية قبل التصفية',
      category: 'commerce',
      categoryLabel: 'الطلبات والتوصيل',
      operatorSnapshot: { role: 'driver', ...driverOperator },
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      details: `قام السائق ${driverOperator.name} بتعديل مبلغ التحصيل للطلبية ${order.orderNumber} إلى ${finalCollectedAmount.toLocaleString()} د.ع`,
      severity: 'info',
    });

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const [acc] = await tx.select().from(financialAccounts).where(eq(financialAccounts.id, order.accountId)).limit(1);
    const [drv] = await tx.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    return formatOrderRecord(updatedOrder, items, drv, undefined, acc);
  });
}

/* =========================================================
   8. pgFailDriverDelivery (Failed Delivery Attempt)
   ========================================================= */

export async function pgFailDriverDelivery(
  driverId: string,
  orderId: string,
  driverOperator: DriverOperatorInfo,
  input: FailDeliveryInput
): Promise<Order> {
  const db = getDb();
  const trimmed = String(orderId || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  const validReasons: DeliveryFailureReason[] = [
    'customer_refused',
    'customer_unreachable',
    'wrong_address',
    'customer_requested_reschedule',
    'other',
  ];

  if (!validReasons.includes(input.reason)) {
    throw new Error(`سبب تعذر التسليم غير صالح: ${input.reason}`);
  }

  return await db.transaction(async (tx) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) conditions.push(eq(orders.id, trimmed));

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const order = orderRows[0];

    // Object-Level Authorization
    if (!order.driverId || order.driverId !== driverId) {
      throw new Error('هذا الطلب غير مسند إليك');
    }

    // Terminal State Checks
    if (order.status === 'delivered') {
      throw new Error('الطلب تم تسليمه بالفعل ولا يمكن تسجيل فشل التسليم له');
    }
    if (order.status === 'cancelled' || order.collectionStatus === 'returned') {
      throw new Error('الطلب ملغى أو راجع بالفعل');
    }

    const reasonNote = `[تعذر التسليم: ${input.reason}] ${input.notes || ''}`.trim();

    // Transition back to processing (pending supervisor / warehouse decision or reschedule)
    // Note: Inventory is NOT restored here; items are still with the driver until returned!
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        status: 'processing',
        driverNotes: order.driverNotes ? `${order.driverNotes} | ${reasonNote}` : reasonNote,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // Audit Log
    await tx.insert(auditLogs).values({
      actionType: 'delivery_failed',
      actionLabel: 'تسجيل تعذر/فشل تسليم الطلبية',
      category: 'commerce',
      categoryLabel: 'الطلبات والتوصيل',
      operatorSnapshot: { role: 'driver', ...driverOperator },
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      details: `سجل السائق ${driverOperator.name} تعذر تسليم الطلبية ${order.orderNumber}. السبب: ${input.reason}. الملاحظات: ${input.notes || 'لا يوجد'}`,
      severity: 'warning',
    });

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const [acc] = await tx.select().from(financialAccounts).where(eq(financialAccounts.id, order.accountId)).limit(1);
    const [drv] = await tx.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    return formatOrderRecord(updatedOrder, items, drv, undefined, acc);
  });
}

/* =========================================================
   9. pgReturnDriverOrder (Return to Warehouse & Inventory Restore)
   ========================================================= */

export async function pgReturnDriverOrder(
  driverId: string,
  orderId: string,
  driverOperator: DriverOperatorInfo,
  options?: { reason?: string }
): Promise<Order> {
  const db = getDb();
  const trimmed = String(orderId || '').trim();
  if (!trimmed) throw new Error('معرف الطلب مطلوب');

  // Verify object-level authorization first with lock
  const checkTx = await db.transaction(async (tx) => {
    const conditions = [eq(orders.orderNumber, trimmed)];
    if (isUuid(trimmed)) conditions.push(eq(orders.id, trimmed));

    const orderRows = await tx
      .select()
      .from(orders)
      .where(or(...conditions))
      .for('update');

    if (orderRows.length === 0) {
      throw new Error('الطلب غير موجود');
    }

    const order = orderRows[0];

    // Object-Level Authorization
    if (!order.driverId || order.driverId !== driverId) {
      throw new Error('هذا الطلب غير مسند إليك ولا يمكنك إرجاعه');
    }

    if (order.status === 'delivered' && toNumber(order.collectedAmount) > 0) {
      throw new Error('لا يمكن إرجاع طلبية تم تسليمها وتحصيل أموالها نقدياً بدون تسوية واسترداد مالي');
    }

    return order;
  });

  // Delegate directly to pgCancelOrder (Single Source of Truth)
  // This guarantees:
  // 1. Only restored once via `inventory_restored` flag
  // 2. Logged in `inventory_movements` as 'customer_return'
  // 3. Status set to 'cancelled' and collectionStatus set to 'returned'
  const returnedOrder = await pgCancelOrder(checkTx.id, {
    isReturn: true,
    reason: options?.reason || 'إرجاع البضاعة إلى المستودع من قبل السائق',
    operator: {
      role: 'driver',
      name: driverOperator.name,
      username: driverOperator.phone,
    },
  });

  return returnedOrder;
}
