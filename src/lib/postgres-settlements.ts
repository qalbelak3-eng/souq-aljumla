import { and, asc, desc, eq, gt, inArray, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  driverSettlements,
  settlementOrders,
  drivers,
  vehicles,
  orders,
  cashVaultMovements,
  auditLogs,
  staffProfiles,
  authIdentities,
} from '@/db/schema';
import {
  DriverSettlement,
  DriverSettlementAllocation,
  DriverSettlementStatus,
  DriverSettlementType,
} from '@/types';
import { toNumber, isUuid } from '@/lib/postgres-orders';

/* =========================================================
   Types & Interfaces
   ========================================================= */

export interface AdminOperatorInfo {
  userId?: string;
  username: string;
  name?: string;
  role?: string;
}

export interface DriverCustodySummary {
  driverId: string;
  driverName: string;
  driverPhone: string;
  isActive: boolean;
  totalCollectedCash: number;
  totalSettledCash: number;
  currentCashInHand: number;
  unsettledOrdersCount: number;
  lastSettlementDate?: string;
}

export interface DriverCustodyDetail {
  driver: {
    id: string;
    name: string;
    phone: string;
    isActive: boolean;
    vehicleInfo?: string;
  };
  totalCollectedCash: number;
  totalSettledCash: number;
  currentCashInHand: number;
  unsettledOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    deliveredAt?: string;
    paymentMethod: string;
    collectionStatus: string;
    orderTotal: number;
    collectedAmount: number;
    settledAmount: number;
    unsettledAmount: number;
    driverCashSettled: boolean;
  }>;
  recentSettlements: DriverSettlement[];
}

export interface CreateSettlementInput {
  amount: number;
  notes?: string;
}

export interface ReverseSettlementInput {
  reason: string;
}

/* =========================================================
   Helper: Ensure Staff Profile for FK constraints
   ========================================================= */

export async function ensureStaffProfile(
  tx: any,
  operator?: AdminOperatorInfo
): Promise<string> {
  const username = String(operator?.username || 'admin').trim().toLowerCase();

  // 1. Check existing staff profile by username
  const existing = await tx
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.username, username))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // 2. Create fallback auth identity if not present
  const adminPhone = `077000${Math.floor(100000 + Math.random() * 900000)}`;
  const [authId] = await tx
    .insert(authIdentities)
    .values({
      phone: adminPhone,
      passwordHash: 'MASTER_INTERNAL_ADMIN_AUTH',
      role: 'admin',
      isActive: true,
    })
    .returning();

  // 3. Create staff profile
  const [staff] = await tx
    .insert(staffProfiles)
    .values({
      authIdentityId: authId.id,
      username,
      name: operator?.name || (username === 'admin' ? 'المدير العام (Master Admin)' : username),
      jobTitle: operator?.role === 'admin' ? 'مدير النظام' : (operator?.role || 'موظف'),
      role: operator?.role || 'admin',
    })
    .returning();

  return staff.id;
}

/* =========================================================
   1. pgGetDriverCustody (Authoritative Source of Truth)
   ========================================================= */

export async function pgGetDriverCustody(driverId: string): Promise<DriverCustodyDetail | null> {
  const db = getDb();
  if (!driverId) return null;

  // 1. Driver info
  const driverRows = await db
    .select({
      driver: drivers,
      vehicle: vehicles,
    })
    .from(drivers)
    .leftJoin(vehicles, eq(drivers.defaultVehicleId, vehicles.id))
    .where(eq(drivers.id, driverId))
    .limit(1);

  if (driverRows.length === 0) return null;
  const { driver, vehicle } = driverRows[0];

  // 2. Query driver's orders that collected cash
  const driverOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.driverId, driverId),
        ne(orders.status, 'cancelled'),
        ne(orders.collectionStatus, 'returned'),
        gt(orders.collectedAmount, '0.00')
      )
    )
    .orderBy(asc(orders.deliveredAt), asc(orders.createdAt));

  let totalCollectedCash = 0;
  const unsettledOrders: DriverCustodyDetail['unsettledOrders'] = [];

  for (const o of driverOrders) {
    const collected = toNumber(o.collectedAmount);
    const settled = toNumber(o.settledAmount);
    totalCollectedCash += collected;

    if (!o.driverCashSettled || collected > settled) {
      unsettledOrders.push({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerNameSnap,
        customerPhone: o.customerPhoneSnap,
        deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : undefined,
        paymentMethod: o.paymentMethod,
        collectionStatus: o.collectionStatus,
        orderTotal: toNumber(o.total),
        collectedAmount: collected,
        settledAmount: settled,
        unsettledAmount: Math.max(0, collected - settled),
        driverCashSettled: o.driverCashSettled,
      });
    }
  }

  // 3. Query driver's active settlements
  const settlementRows = await db
    .select({
      settlement: driverSettlements,
      staff: staffProfiles,
    })
    .from(driverSettlements)
    .leftJoin(staffProfiles, eq(driverSettlements.staffId, staffProfiles.id))
    .where(eq(driverSettlements.driverId, driverId))
    .orderBy(desc(driverSettlements.createdAt));

  let totalSettledCash = 0;
  const recentSettlements: DriverSettlement[] = [];

  for (const row of settlementRows) {
    const s = row.settlement;
    const actual = toNumber(s.actualAmount);

    if (!s.isReversed && s.type !== 'reversal') {
      totalSettledCash += actual;
    }

    recentSettlements.push({
      id: s.id,
      settlementNumber: s.settlementNumber,
      driverId: s.driverId,
      driverName: driver.name,
      driverPhone: driver.phone,
      expectedAmount: toNumber(s.expectedAmount),
      actualAmount: actual,
      variance: toNumber(s.variance),
      type: s.type as DriverSettlementType,
      status: s.status as DriverSettlementStatus,
      orderIds: [],
      notes: s.notes || undefined,
      staffName: row.staff?.name || undefined,
      staffUsername: row.staff?.username || undefined,
      createdAt: s.createdAt.toISOString(),
      isReversed: s.isReversed,
      reversalSettlementId: s.reversalSettlementId || undefined,
      reversalOfId: s.reversalOfId || undefined,
      reversalReason: s.reversalReason || undefined,
      reversedAt: s.reversedAt ? s.reversedAt.toISOString() : undefined,
      reversedByStaffId: s.reversedByStaffId || undefined,
    });
  }

  const currentCashInHand = Math.max(0, totalCollectedCash - totalSettledCash);

  return {
    driver: {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      isActive: driver.isActive,
      vehicleInfo: vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : undefined,
    },
    totalCollectedCash,
    totalSettledCash,
    currentCashInHand,
    unsettledOrders,
    recentSettlements,
  };
}

/* =========================================================
   2. pgGetAllDriversCustodySummary (Admin Dashboard View)
   ========================================================= */

export async function pgGetAllDriversCustodySummary(): Promise<DriverCustodySummary[]> {
  const db = getDb();

  const driverRows = await db
    .select()
    .from(drivers)
    .orderBy(desc(drivers.createdAt));

  if (driverRows.length === 0) return [];

  // Query all active orders
  const allOrders = await db
    .select({
      driverId: orders.driverId,
      collectedAmount: orders.collectedAmount,
      settledAmount: orders.settledAmount,
      driverCashSettled: orders.driverCashSettled,
      status: orders.status,
      collectionStatus: orders.collectionStatus,
    })
    .from(orders)
    .where(
      and(
        ne(orders.status, 'cancelled'),
        ne(orders.collectionStatus, 'returned'),
        gt(orders.collectedAmount, '0.00')
      )
    );

  const collectedMap = new Map<string, { collected: number; unsettledCount: number }>();
  for (const o of allOrders) {
    if (!o.driverId) continue;
    const curr = collectedMap.get(o.driverId) || { collected: 0, unsettledCount: 0 };
    const col = toNumber(o.collectedAmount);
    const set = toNumber(o.settledAmount);
    curr.collected += col;
    if (!o.driverCashSettled || col > set) {
      curr.unsettledCount += 1;
    }
    collectedMap.set(o.driverId, curr);
  }

  // Query all active non-reversed settlements
  const allSettlements = await db
    .select({
      driverId: driverSettlements.driverId,
      actualAmount: driverSettlements.actualAmount,
      createdAt: driverSettlements.createdAt,
      isReversed: driverSettlements.isReversed,
      type: driverSettlements.type,
    })
    .from(driverSettlements)
    .where(
      and(
        eq(driverSettlements.isReversed, false),
        ne(driverSettlements.type, 'reversal')
      )
    )
    .orderBy(desc(driverSettlements.createdAt));

  const settledMap = new Map<string, { settled: number; lastDate?: string }>();
  for (const s of allSettlements) {
    const curr = settledMap.get(s.driverId) || { settled: 0 };
    curr.settled += toNumber(s.actualAmount);
    if (!curr.lastDate) {
      curr.lastDate = s.createdAt.toISOString();
    }
    settledMap.set(s.driverId, curr);
  }

  return driverRows.map((d) => {
    const colData = collectedMap.get(d.id) || { collected: 0, unsettledCount: 0 };
    const setData = settledMap.get(d.id) || { settled: 0 };
    const cashInHand = Math.max(0, colData.collected - setData.settled);

    return {
      driverId: d.id,
      driverName: d.name,
      driverPhone: d.phone,
      isActive: d.isActive,
      totalCollectedCash: colData.collected,
      totalSettledCash: setData.settled,
      currentCashInHand: cashInHand,
      unsettledOrdersCount: colData.unsettledCount,
      lastSettlementDate: setData.lastDate,
    };
  });
}

/* =========================================================
   3. pgCreateDriverSettlement (Atomic Single Transaction)
   ========================================================= */

export async function pgCreateDriverSettlement(
  driverId: string,
  input: CreateSettlementInput,
  adminOperator: AdminOperatorInfo
): Promise<{
  settlement: DriverSettlement;
  balanceBefore: number;
  balanceAfter: number;
  allocations: DriverSettlementAllocation[];
}> {
  const db = getDb();
  if (!driverId || !isUuid(driverId)) {
    throw new Error('معرف السائق غير صالح');
  }

  const settleAmount = toNumber(input.amount);
  if (isNaN(settleAmount) || settleAmount <= 0) {
    throw new Error('مبلغ التسوية يجب أن يكون رقماً موجباً أكبر من صفر');
  }

  return await db.transaction(async (tx) => {
    // Step 1: Lock driver row FOR UPDATE to prevent concurrent settlements
    const driverRows = await tx
      .select()
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .for('update');

    if (driverRows.length === 0) {
      throw new Error('السائق غير موجود');
    }
    const driver = driverRows[0];

    // Step 2: Lock unsettled orders FOR UPDATE in deterministic FIFO order
    const unsettledOrders = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.driverId, driverId),
          ne(orders.status, 'cancelled'),
          ne(orders.collectionStatus, 'returned'),
          gt(orders.collectedAmount, orders.settledAmount)
        )
      )
      .orderBy(asc(orders.deliveredAt), asc(orders.createdAt))
      .for('update');

    // Step 3: Compute authoritative custody balance inside lock
    const allDriverOrders = await tx
      .select({ collectedAmount: orders.collectedAmount })
      .from(orders)
      .where(
        and(
          eq(orders.driverId, driverId),
          ne(orders.status, 'cancelled'),
          ne(orders.collectionStatus, 'returned'),
          gt(orders.collectedAmount, '0.00')
        )
      );

    const totalCollected = allDriverOrders.reduce((sum, o) => sum + toNumber(o.collectedAmount), 0);

    const activeSettlements = await tx
      .select({ actualAmount: driverSettlements.actualAmount })
      .from(driverSettlements)
      .where(
        and(
          eq(driverSettlements.driverId, driverId),
          eq(driverSettlements.isReversed, false),
          ne(driverSettlements.type, 'reversal')
        )
      );

    const totalSettled = activeSettlements.reduce((sum, s) => sum + toNumber(s.actualAmount), 0);
    const currentCashInHand = Math.max(0, totalCollected - totalSettled);

    // Step 4: Strict validation against over-settlement
    if (settleAmount > currentCashInHand) {
      throw new Error(
        `مبلغ التسوية (${settleAmount.toLocaleString()} د.ع) أكبر من العهدة النقدية الفعلية للسائق (${currentCashInHand.toLocaleString()} د.ع)`
      );
    }

    // Step 5: Resolve Staff Profile ID Server-side
    const staffId = await ensureStaffProfile(tx, adminOperator);

    // Step 6: Generate sequential settlement number
    let settlementNumber = '';
    try {
      const seqRows: any = await tx.execute(sql`SELECT nextval('settlement_seq') as seq`);
      const seqVal = seqRows[0]?.seq || seqRows?.rows?.[0]?.seq;
      settlementNumber = `SET-${seqVal}`;
    } catch {
      const maxRows: any = await tx.execute(sql`
        SELECT COALESCE(MAX(SUBSTRING(settlement_number FROM '[0-9]+')::int), 1000) + 1 as seq
        FROM driver_settlements
      `);
      const maxVal = maxRows[0]?.seq || maxRows?.rows?.[0]?.seq || 1001;
      settlementNumber = `SET-${maxVal}`;
    }

    // Step 7: Insert driver settlement record
    const [insertedSettlement] = await tx
      .insert(driverSettlements)
      .values({
        settlementNumber,
        driverId: driver.id,
        expectedAmount: String(settleAmount.toFixed(2)),
        actualAmount: String(settleAmount.toFixed(2)),
        variance: '0.00',
        shortageAmount: '0.00',
        overageAmount: '0.00',
        type: 'normal',
        status: 'settled',
        staffId,
        notes: input.notes?.trim() || null,
      })
      .returning();

    // Step 8: Deterministic FIFO allocation across unsettled orders
    let remainingToAllocate = settleAmount;
    const allocations: DriverSettlementAllocation[] = [];

    for (const ord of unsettledOrders) {
      if (remainingToAllocate <= 0) break;

      const orderCollected = toNumber(ord.collectedAmount);
      const orderSettled = toNumber(ord.settledAmount);
      const orderUnsettled = Math.max(0, orderCollected - orderSettled);
      if (orderUnsettled <= 0) continue;

      const allocated = Math.min(remainingToAllocate, orderUnsettled);
      const newSettledAmount = orderSettled + allocated;
      const isFullySettled = newSettledAmount >= orderCollected;

      await tx.insert(settlementOrders).values({
        settlementId: insertedSettlement.id,
        orderId: ord.id,
        allocatedAmount: String(allocated.toFixed(2)),
      });

      await tx
        .update(orders)
        .set({
          settledAmount: String(newSettledAmount.toFixed(2)),
          driverCashSettled: isFullySettled,
          settlementId: insertedSettlement.id,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, ord.id));

      allocations.push({
        orderId: ord.id,
        orderNumber: ord.orderNumber,
        allocatedAmount: allocated,
      });

      remainingToAllocate -= allocated;
    }

    // Step 9: Record Cash Vault Inflow Movement (Transfer from driver custody -> company vault)
    let vaultNumber = '';
    try {
      const vSeqRows: any = await tx.execute(sql`SELECT nextval('vault_csh_seq') as seq`);
      const vSeqVal = vSeqRows[0]?.seq || vSeqRows?.rows?.[0]?.seq;
      vaultNumber = `CSH-${vSeqVal}`;
    } catch {
      const maxV: any = await tx.execute(sql`
        SELECT COALESCE(MAX(SUBSTRING(transaction_number FROM '[0-9]+')::int), 1000) + 1 as seq
        FROM cash_vault_movements
      `);
      const maxVal = maxV[0]?.seq || maxV?.rows?.[0]?.seq || 1001;
      vaultNumber = `CSH-${maxVal}`;
    }

    await tx.insert(cashVaultMovements).values({
      transactionNumber: vaultNumber,
      type: 'inflow',
      category: 'driver_settlement',
      categoryLabel: 'استلام وتصفية عهدة نقدية من السائق',
      amount: String(settleAmount.toFixed(2)),
      referenceType: 'settlement',
      referenceId: insertedSettlement.id,
      referenceNumber: insertedSettlement.settlementNumber,
      partyName: driver.name,
      staffId,
      notes: input.notes?.trim() || `تصفية عهدة السائق ${driver.name} (${insertedSettlement.settlementNumber})`,
    });

    // Step 10: Immutable Audit Log
    const balanceAfter = currentCashInHand - settleAmount;

    await tx.insert(auditLogs).values({
      actionType: 'driver_settlement_created',
      actionLabel: 'إنشاء تسوية واستلام عهدة نقدية',
      category: 'finance',
      categoryLabel: 'الحسابات والتسويات المالية',
      staffId,
      operatorSnapshot: adminOperator,
      targetType: 'driver_settlement',
      targetId: insertedSettlement.id,
      targetReferenceNumber: insertedSettlement.settlementNumber,
      financialImpact: {
        settlementId: insertedSettlement.id,
        settlementNumber: insertedSettlement.settlementNumber,
        driverId: driver.id,
        driverName: driver.name,
        amount: settleAmount,
        balanceBefore: currentCashInHand,
        balanceAfter,
        allocatedOrdersCount: allocations.length,
      },
      details: `استلام مبلغ ${settleAmount.toLocaleString()} د.ع من عهدة السائق ${driver.name}. الرصيد قبل: ${currentCashInHand.toLocaleString()} د.ع، الرصيد المتبقي: ${balanceAfter.toLocaleString()} د.ع`,
      severity: 'info',
    });

    const resultSettlement: DriverSettlement = {
      id: insertedSettlement.id,
      settlementNumber: insertedSettlement.settlementNumber,
      driverId: insertedSettlement.driverId,
      driverName: driver.name,
      driverPhone: driver.phone,
      expectedAmount: toNumber(insertedSettlement.expectedAmount),
      actualAmount: toNumber(insertedSettlement.actualAmount),
      variance: toNumber(insertedSettlement.variance),
      type: insertedSettlement.type as DriverSettlementType,
      status: insertedSettlement.status as DriverSettlementStatus,
      orderIds: allocations.map((a) => a.orderId),
      allocations,
      notes: insertedSettlement.notes || undefined,
      staffName: adminOperator.name || adminOperator.username,
      staffUsername: adminOperator.username,
      createdAt: insertedSettlement.createdAt.toISOString(),
      isReversed: false,
    };

    return {
      settlement: resultSettlement,
      balanceBefore: currentCashInHand,
      balanceAfter,
      allocations,
    };
  });
}

/* =========================================================
   4. pgReverseDriverSettlement (Formal Accounting Reversal)
   ========================================================= */

export async function pgReverseDriverSettlement(
  settlementId: string,
  input: ReverseSettlementInput,
  adminOperator: AdminOperatorInfo
): Promise<{
  originalSettlement: DriverSettlement;
  reversalSettlement: DriverSettlement;
  revertedAmount: number;
  newCustodyBalance: number;
}> {
  const db = getDb();
  const trimmedId = String(settlementId || '').trim();
  if (!trimmedId || !isUuid(trimmedId)) {
    throw new Error('معرف التسوية غير صالح');
  }

  const reason = input.reason?.trim();
  if (!reason) {
    throw new Error('سبب عكس التسوية مطلوب إلزامي');
  }

  return await db.transaction(async (tx) => {
    // Step 1: Lock target settlement row FOR UPDATE
    const settlementRows = await tx
      .select()
      .from(driverSettlements)
      .where(eq(driverSettlements.id, trimmedId))
      .for('update');

    if (settlementRows.length === 0) {
      throw new Error('التسوية غير موجودة');
    }
    const target = settlementRows[0];

    // Step 2: Validate reversal rules
    if (target.isReversed) {
      throw new Error('تم عكس هذه التسوية مسبقاً ولا يمكن عكسها مرة أخرى (منع العكس المزدوج)');
    }
    if (target.type === 'reversal') {
      throw new Error('لا يمكن عكس سجل تسوية عكسية');
    }

    // Step 3: Lock driver row FOR UPDATE
    const [driver] = await tx
      .select()
      .from(drivers)
      .where(eq(drivers.id, target.driverId))
      .for('update');

    // Step 4: Fetch linked allocations
    const linkedAllocations = await tx
      .select({
        orderId: settlementOrders.orderId,
        allocatedAmount: settlementOrders.allocatedAmount,
      })
      .from(settlementOrders)
      .where(eq(settlementOrders.settlementId, target.id));

    // Step 5: Roll back each order's settled amount atomically
    for (const alloc of linkedAllocations) {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, alloc.orderId))
        .for('update');

      if (order) {
        const allocAmount = toNumber(alloc.allocatedAmount);
        const currentSettled = toNumber(order.settledAmount);
        const orderCollected = toNumber(order.collectedAmount);
        const revertedSettled = Math.max(0, currentSettled - allocAmount);
        const isStillFullySettled = revertedSettled >= orderCollected && orderCollected > 0;

        await tx
          .update(orders)
          .set({
            settledAmount: String(revertedSettled.toFixed(2)),
            driverCashSettled: isStillFullySettled,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));
      }
    }

    // Step 6: Resolve Staff Profile ID Server-side
    const staffId = await ensureStaffProfile(tx, adminOperator);

    // Step 7: Generate sequential reversal settlement number
    let revNumber = '';
    try {
      const seqRows: any = await tx.execute(sql`SELECT nextval('settlement_seq') as seq`);
      const seqVal = seqRows[0]?.seq || seqRows?.rows?.[0]?.seq;
      revNumber = `REV-${seqVal}`;
    } catch {
      const maxRows: any = await tx.execute(sql`
        SELECT COALESCE(MAX(SUBSTRING(settlement_number FROM '[0-9]+')::int), 1000) + 1 as seq
        FROM driver_settlements
      `);
      const maxVal = maxRows[0]?.seq || maxRows?.rows?.[0]?.seq || 1001;
      revNumber = `REV-${maxVal}`;
    }

    // Step 8: Insert dedicated reversal settlement record
    const [reversalRecord] = await tx
      .insert(driverSettlements)
      .values({
        settlementNumber: revNumber,
        driverId: target.driverId,
        expectedAmount: '0.00',
        actualAmount: '0.00',
        variance: '0.00',
        shortageAmount: '0.00',
        overageAmount: '0.00',
        type: 'reversal',
        status: 'settled',
        staffId,
        reversalOfId: target.id,
        notes: `عكس تسوية ${target.settlementNumber}: ${reason}`,
      })
      .returning();

    // Step 9: Transition original settlement to is_reversed = true
    const [updatedOriginal] = await tx
      .update(driverSettlements)
      .set({
        isReversed: true,
        reversalSettlementId: reversalRecord.id,
        reversalReason: reason,
        reversedAt: new Date(),
        reversedByStaffId: staffId,
        status: 'reversed',
      })
      .where(eq(driverSettlements.id, target.id))
      .returning();

    // Step 10: Cash Vault Outflow Movement (Reversing previous cash vault inflow)
    let vaultNumber = '';
    try {
      const vSeqRows: any = await tx.execute(sql`SELECT nextval('vault_csh_seq') as seq`);
      const vSeqVal = vSeqRows[0]?.seq || vSeqRows?.rows?.[0]?.seq;
      vaultNumber = `CSH-${vSeqVal}`;
    } catch {
      const maxV: any = await tx.execute(sql`
        SELECT COALESCE(MAX(SUBSTRING(transaction_number FROM '[0-9]+')::int), 1000) + 1 as seq
        FROM cash_vault_movements
      `);
      const maxVal = maxV[0]?.seq || maxV?.rows?.[0]?.seq || 1001;
      vaultNumber = `CSH-${maxVal}`;
    }

    await tx.insert(cashVaultMovements).values({
      transactionNumber: vaultNumber,
      type: 'outflow',
      category: 'driver_settlement',
      categoryLabel: 'عكس تسوية عهدة نقدية للسائق',
      amount: target.actualAmount,
      referenceType: 'settlement',
      referenceId: target.id,
      referenceNumber: target.settlementNumber,
      partyName: driver?.name || 'سائق',
      staffId,
      notes: `عكس التسوية ${target.settlementNumber}: ${reason}`,
    });

    // Step 11: Audit Log
    const settledBack = toNumber(target.actualAmount);
    await tx.insert(auditLogs).values({
      actionType: 'driver_settlement_reversed',
      actionLabel: 'عكس تسوية واستعادة عهدة نقدية',
      category: 'finance',
      categoryLabel: 'الحسابات والتسويات المالية',
      staffId,
      operatorSnapshot: adminOperator,
      targetType: 'driver_settlement',
      targetId: target.id,
      targetReferenceNumber: target.settlementNumber,
      financialImpact: {
        originalSettlementId: target.id,
        reversalSettlementId: reversalRecord.id,
        driverId: target.driverId,
        revertedAmount: settledBack,
        reason,
      },
      details: `تم عكس التسوية ${target.settlementNumber} بمبلغ ${settledBack.toLocaleString()} د.ع وإعادة المبلغ لعهدة السائق. السبب: ${reason}`,
      severity: 'warning',
    });

    // Compute updated custody balance inside the transaction (via tx, not getDb())
    // so we see the reverted state before external commit
    const [collectedRow] = await tx.execute<{ total_collected: string }>(sql`
      SELECT COALESCE(SUM(collected_amount), 0) AS total_collected
      FROM orders
      WHERE driver_id = ${target.driverId}
        AND status != 'cancelled'
        AND collection_status != 'returned'
        AND collected_amount > 0
    `);
    const [settledRow] = await tx.execute<{ total_settled: string }>(sql`
      SELECT COALESCE(SUM(actual_amount), 0) AS total_settled
      FROM driver_settlements
      WHERE driver_id = ${target.driverId}
        AND is_reversed = false
        AND type != 'reversal'
    `);
    const newCustodyBalance = Math.max(
      0,
      Number(collectedRow?.total_collected ?? 0) - Number(settledRow?.total_settled ?? 0)
    );

    return {
      originalSettlement: {
        id: updatedOriginal.id,
        settlementNumber: updatedOriginal.settlementNumber,
        driverId: updatedOriginal.driverId,
        driverName: driver?.name,
        driverPhone: driver?.phone,
        expectedAmount: toNumber(updatedOriginal.expectedAmount),
        actualAmount: toNumber(updatedOriginal.actualAmount),
        variance: toNumber(updatedOriginal.variance),
        type: updatedOriginal.type as DriverSettlementType,
        status: updatedOriginal.status as DriverSettlementStatus,
        orderIds: linkedAllocations.map((a) => a.orderId),
        notes: updatedOriginal.notes || undefined,
        createdAt: updatedOriginal.createdAt.toISOString(),
        isReversed: true,
        reversalSettlementId: reversalRecord.id,
        reversalReason: reason,
        reversedAt: updatedOriginal.reversedAt ? updatedOriginal.reversedAt.toISOString() : undefined,
      },
      reversalSettlement: {
        id: reversalRecord.id,
        settlementNumber: reversalRecord.settlementNumber,
        driverId: reversalRecord.driverId,
        driverName: driver?.name,
        driverPhone: driver?.phone,
        expectedAmount: 0,
        actualAmount: 0,
        variance: 0,
        type: 'reversal',
        status: 'settled',
        orderIds: [],
        notes: reversalRecord.notes || undefined,
        createdAt: reversalRecord.createdAt.toISOString(),
        reversalOfId: target.id,
      },
      revertedAmount: settledBack,
      newCustodyBalance,
    };
  });
}

/* =========================================================
   5. pgGetDriverSettlementById
   ========================================================= */

export async function pgGetDriverSettlementById(settlementId: string): Promise<DriverSettlement | null> {
  const db = getDb();
  if (!settlementId || !isUuid(settlementId)) return null;

  const rows = await db
    .select({
      settlement: driverSettlements,
      driver: drivers,
      staff: staffProfiles,
    })
    .from(driverSettlements)
    .innerJoin(drivers, eq(driverSettlements.driverId, drivers.id))
    .leftJoin(staffProfiles, eq(driverSettlements.staffId, staffProfiles.id))
    .where(eq(driverSettlements.id, settlementId))
    .limit(1);

  if (rows.length === 0) return null;
  const { settlement: s, driver, staff } = rows[0];

  const allocationsRows = await db
    .select({
      orderId: settlementOrders.orderId,
      orderNumber: orders.orderNumber,
      allocatedAmount: settlementOrders.allocatedAmount,
    })
    .from(settlementOrders)
    .innerJoin(orders, eq(settlementOrders.orderId, orders.id))
    .where(eq(settlementOrders.settlementId, s.id));

  return {
    id: s.id,
    settlementNumber: s.settlementNumber,
    driverId: s.driverId,
    driverName: driver.name,
    driverPhone: driver.phone,
    expectedAmount: toNumber(s.expectedAmount),
    actualAmount: toNumber(s.actualAmount),
    variance: toNumber(s.variance),
    type: s.type as DriverSettlementType,
    status: s.status as DriverSettlementStatus,
    orderIds: allocationsRows.map((a) => a.orderId),
    allocations: allocationsRows.map((a) => ({
      orderId: a.orderId,
      orderNumber: a.orderNumber,
      allocatedAmount: toNumber(a.allocatedAmount),
    })),
    notes: s.notes || undefined,
    staffName: staff?.name || undefined,
    staffUsername: staff?.username || undefined,
    createdAt: s.createdAt.toISOString(),
    isReversed: s.isReversed,
    reversalSettlementId: s.reversalSettlementId || undefined,
    reversalOfId: s.reversalOfId || undefined,
    reversalReason: s.reversalReason || undefined,
    reversedAt: s.reversedAt ? s.reversedAt.toISOString() : undefined,
    reversedByStaffId: s.reversedByStaffId || undefined,
  };
}
