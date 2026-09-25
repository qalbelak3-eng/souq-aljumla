import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  drivers,
  vehicles,
  authIdentities,
  financialAccounts,
  orders,
  driverSettlements,
  auditLogs,
  nextAccountCodeSql,
} from '@/db/schema';
import { normalizeIraqiPhone } from '@/db/phone';
import { hashPassword } from '@/lib/auth';
import { Driver, Vehicle, DriverBaseStatus, DriverOperationalStatus } from '@/types';
import { computeDriverOperationalStatus } from '@/lib/dispatch-recommender';

/* =========================================================
   Types & Interfaces
   ========================================================= */

export interface DriverWithStats extends Driver {
  authIdentityId: string;
  authIdentityIsActive?: boolean;
  financialAccountId: string;
  activeDeliveries: number;
  completedDeliveries: number;
  totalDeliveredRevenue: number;
  currentCashInHand: number;
  operationalStatus: DriverOperationalStatus;
  effectiveStatus: DriverOperationalStatus;
}

export interface DriverWithAuth extends DriverWithStats {
  passwordHash?: string | null;
}

export interface VehicleWithStats extends Vehicle {
  activeDeliveries: number;
  completedDeliveries: number;
  totalDeliveredRevenue: number;
}

export interface CreateDriverInput {
  name: string;
  phone: string;
  password?: string;
  vehicleInfo?: string;
  defaultVehicleId?: string;
  operationalStatus?: DriverOperationalStatus;
  notes?: string;
  isActive?: boolean;
}

export interface UpdateDriverInput {
  name?: string;
  phone?: string;
  password?: string;
  vehicleInfo?: string;
  defaultVehicleId?: string;
  operationalStatus?: DriverOperationalStatus;
  notes?: string;
  isActive?: boolean;
}

export interface CreateVehicleInput {
  name: string;
  plateNumber: string;
  type?: string;
  modelYear?: string;
  notes?: string;
  isActive?: boolean;
}

export interface UpdateVehicleInput {
  name?: string;
  plateNumber?: string;
  type?: string;
  modelYear?: string;
  notes?: string;
  isActive?: boolean;
}

/* =========================================================
   Vehicles CRUD (PostgreSQL)
   ========================================================= */

/**
 * جلب قائمة المركبات في الأسطول مع إحصائيات التوصيل الحالية من PostgreSQL
 */
export async function pgGetVehicles(filters?: { isActive?: boolean }): Promise<VehicleWithStats[]> {
  const db = getDb();

  let query = db.select().from(vehicles);
  if (filters?.isActive !== undefined) {
    query = query.where(eq(vehicles.isActive, filters.isActive)) as any;
  }
  query = query.orderBy(desc(vehicles.createdAt)) as any;

  const vehicleRows = await query;
  if (vehicleRows.length === 0) return [];

  // Query stats from orders table
  const vehicleIds = vehicleRows.map((v) => v.id);
  const orderRows = await db
    .select({
      vehicleId: orders.vehicleId,
      status: orders.status,
      total: orders.total,
    })
    .from(orders)
    .where(inArray(orders.vehicleId, vehicleIds));

  const statsMap = new Map<string, { active: number; completed: number; revenue: number }>();
  for (const row of orderRows) {
    if (!row.vehicleId) continue;
    const curr = statsMap.get(row.vehicleId) || { active: 0, completed: 0, revenue: 0 };
    if (row.status === 'processing' || row.status === 'shipped') {
      curr.active += 1;
    } else if (row.status === 'delivered') {
      curr.completed += 1;
      curr.revenue += Number(row.total) || 0;
    }
    statsMap.set(row.vehicleId, curr);
  }

  return vehicleRows.map((v) => {
    const s = statsMap.get(v.id) || { active: 0, completed: 0, revenue: 0 };
    return {
      id: v.id,
      name: v.name,
      plateNumber: v.plateNumber,
      type: v.type,
      modelYear: v.modelYear || undefined,
      isActive: v.isActive,
      notes: v.notes || undefined,
      createdAt: v.createdAt.toISOString(),
      activeDeliveries: s.active,
      completedDeliveries: s.completed,
      totalDeliveredRevenue: s.revenue,
    };
  });
}

/**
 * جلب تفاصيل مركبة واحدة بواسطة المعرف
 */
export async function pgGetVehicleById(id: string): Promise<Vehicle | null> {
  const db = getDb();
  const rows = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  if (rows.length === 0) return null;
  const v = rows[0];
  return {
    id: v.id,
    name: v.name,
    plateNumber: v.plateNumber,
    type: v.type,
    modelYear: v.modelYear || undefined,
    isActive: v.isActive,
    notes: v.notes || undefined,
    createdAt: v.createdAt.toISOString(),
  };
}

/**
 * إنشاء مركبة جديدة مع فحص تفرد رقم اللوحة
 */
export async function pgCreateVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  const db = getDb();
  const cleanName = input.name?.trim();
  const cleanPlate = input.plateNumber?.trim();

  if (!cleanName || !cleanPlate) {
    throw new Error('يرجى إدخال اسم المركبة ورقم اللوحة');
  }

  // Check duplicate plate
  const existing = await db.select().from(vehicles).where(eq(vehicles.plateNumber, cleanPlate)).limit(1);
  if (existing.length > 0) {
    throw new Error('رقم لوحة المركبة مسجل مسبقاً في النظام');
  }

  const [created] = await db
    .insert(vehicles)
    .values({
      name: cleanName,
      plateNumber: cleanPlate,
      type: input.type?.trim() || 'كيا حمل',
      modelYear: input.modelYear?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: input.isActive !== false,
    })
    .returning();

  return {
    id: created.id,
    name: created.name,
    plateNumber: created.plateNumber,
    type: created.type,
    modelYear: created.modelYear || undefined,
    isActive: created.isActive,
    notes: created.notes || undefined,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * تعديل بيانات مركبة
 */
export async function pgUpdateVehicle(id: string, updates: UpdateVehicleInput): Promise<Vehicle | null> {
  const db = getDb();
  const current = await pgGetVehicleById(id);
  if (!current) return null;

  const updateFields: Record<string, any> = {};

  if (updates.name !== undefined) {
    updateFields.name = updates.name.trim();
  }
  if (updates.plateNumber !== undefined) {
    const cleanPlate = updates.plateNumber.trim();
    if (cleanPlate !== current.plateNumber) {
      const duplicate = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.plateNumber, cleanPlate))
        .limit(1);
      if (duplicate.length > 0 && duplicate[0].id !== id) {
        throw new Error('رقم لوحة المركبة مسجل مسبقاً لمركبة أخرى');
      }
      updateFields.plateNumber = cleanPlate;
    }
  }
  if (updates.type !== undefined) updateFields.type = updates.type.trim();
  if (updates.modelYear !== undefined) updateFields.modelYear = updates.modelYear.trim() || null;
  if (updates.notes !== undefined) updateFields.notes = updates.notes.trim() || null;
  if (updates.isActive !== undefined) updateFields.isActive = updates.isActive;

  if (Object.keys(updateFields).length === 0) {
    return current;
  }

  const [updated] = await db
    .update(vehicles)
    .set(updateFields)
    .where(eq(vehicles.id, id))
    .returning();

  return {
    id: updated.id,
    name: updated.name,
    plateNumber: updated.plateNumber,
    type: updated.type,
    modelYear: updated.modelYear || undefined,
    isActive: updated.isActive,
    notes: updated.notes || undefined,
    createdAt: updated.createdAt.toISOString(),
  };
}

/**
 * حذف أو إلغاء تفعيل المركبة بأمان (Logical Deactivation if referenced)
 */
export async function pgDeleteVehicle(id: string): Promise<{ success: boolean; deactivated: boolean; message: string }> {
  const db = getDb();
  const current = await pgGetVehicleById(id);
  if (!current) {
    throw new Error('المركبة غير موجودة');
  }

  // Check if vehicle is referenced in orders or drivers
  const orderRef = await db.select({ id: orders.id }).from(orders).where(eq(orders.vehicleId, id)).limit(1);
  const driverRef = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.defaultVehicleId, id)).limit(1);

  if (orderRef.length > 0 || driverRef.length > 0) {
    // Logical deactivation for data integrity
    await db.update(vehicles).set({ isActive: false }).where(eq(vehicles.id, id));
    return {
      success: true,
      deactivated: true,
      message: 'تم إلغاء تفعيل المركبة بنجاح نظراً لارتباطها بسجلات سابقة',
    };
  }

  // Safe physical delete
  await db.delete(vehicles).where(eq(vehicles.id, id));
  return {
    success: true,
    deactivated: false,
    message: 'تم حذف المركبة بنجاح',
  };
}

/* =========================================================
   Drivers CRUD (PostgreSQL)
   ========================================================= */

/**
 * إنشاء سائق جديد ذرياً داخل PostgreSQL Transaction واحدة:
 * 1. auth_identities (Role: driver, Hashed Password via scrypt)
 * 2. financial_accounts (Category: driver, Code: ACC-seq)
 * 3. drivers
 * مع Rollback كامل إذا فشلت أي خطوة.
 */
export async function pgCreateDriver(input: CreateDriverInput): Promise<DriverWithStats> {
  const db = getDb();
  const cleanName = input.name?.trim();
  const cleanPhone = normalizeIraqiPhone(input.phone);

  if (!cleanName || !cleanPhone) {
    throw new Error('يرجى إدخال اسم السائق ورقم هاتف عراقي صحيح');
  }

  if (!input.password || typeof input.password !== 'string' || input.password.trim().length < 6) {
    throw new Error('يرجى إدخال كلمة مرور صريحة وآمنة للسائق لا تقل عن 6 أحرف');
  }

  const plainPassword = input.password.trim();
  const hashedPassword = hashPassword(plainPassword);

  return await db.transaction(async (tx) => {
    // 1. Uniqueness check on phone across identities and drivers
    const existingAuth = await tx
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(eq(authIdentities.phone, cleanPhone))
      .limit(1);
    if (existingAuth.length > 0) {
      throw new Error('رقم الهاتف هذا مسجل مسبقاً في النظام');
    }

    const existingDriver = await tx
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.phone, cleanPhone))
      .limit(1);
    if (existingDriver.length > 0) {
      throw new Error('رقم الهاتف هذا مسجل مسبقاً لسائق آخر');
    }

    // 2. Insert into auth_identities
    const [authId] = await tx
      .insert(authIdentities)
      .values({
        phone: cleanPhone,
        passwordHash: hashedPassword,
        role: 'driver',
        isActive: input.isActive !== false,
      })
      .returning();

    // 3. Insert into financial_accounts
    const [finAcc] = await tx
      .insert(financialAccounts)
      .values({
        accountCode: nextAccountCodeSql,
        name: cleanName,
        phone: cleanPhone,
        category: 'driver',
        pricingTier: 'general',
        authIdentityId: authId.id,
        isActive: input.isActive !== false,
        notes: input.notes?.trim() || `حساب مالي لسائق التوصيل: ${cleanName}`,
      })
      .returning();

    // 4. Validate defaultVehicleId if provided
    let validVehicleId: string | null = null;
    if (
      input.defaultVehicleId !== undefined &&
      input.defaultVehicleId !== null &&
      input.defaultVehicleId !== '' &&
      input.defaultVehicleId !== 'none'
    ) {
      const [veh] = await tx
        .select({ id: vehicles.id, isActive: vehicles.isActive })
        .from(vehicles)
        .where(eq(vehicles.id, input.defaultVehicleId))
        .limit(1);
      if (!veh) {
        throw new Error('المركبة المحددة غير موجودة');
      }
      if (!veh.isActive) {
        throw new Error('المركبة المحددة معطلة ولا يمكن إسنادها');
      }
      validVehicleId = veh.id;
    }

    // 5. Insert into drivers
    const [newDriver] = await tx
      .insert(drivers)
      .values({
        authIdentityId: authId.id,
        financialAccountId: finAcc.id,
        defaultVehicleId: validVehicleId,
        name: cleanName,
        phone: cleanPhone,
        operationalStatus: input.operationalStatus || 'available',
        isActive: input.isActive !== false,
        notes: input.notes?.trim() || null,
      })
      .returning();

    const baseStatus = (newDriver.operationalStatus as DriverBaseStatus) || 'available';

    return {
      id: newDriver.id,
      authIdentityId: newDriver.authIdentityId,
      financialAccountId: newDriver.financialAccountId,
      name: newDriver.name,
      phone: newDriver.phone,
      defaultVehicleId: newDriver.defaultVehicleId || undefined,
      vehicleInfo: input.vehicleInfo?.trim() || undefined,
      isActive: newDriver.isActive,
      notes: newDriver.notes || undefined,
      operationalStatus: baseStatus,
      effectiveStatus: computeDriverOperationalStatus(baseStatus, 0),
      currentCashInHand: 0,
      activeDeliveries: 0,
      completedDeliveries: 0,
      totalDeliveredRevenue: 0,
      createdAt: newDriver.createdAt.toISOString(),
    };
  });
}

/**
 * جلب جميع السائقين مع إحصائيات التوصيل والعهدة النقدية الحالية
 */
export async function pgGetDrivers(filters?: { isActive?: boolean }): Promise<DriverWithStats[]> {
  const db = getDb();

  let query = db
    .select({
      driver: drivers,
      vehicle: vehicles,
    })
    .from(drivers)
    .leftJoin(vehicles, eq(drivers.defaultVehicleId, vehicles.id));

  if (filters?.isActive !== undefined) {
    query = query.where(eq(drivers.isActive, filters.isActive)) as any;
  }
  query = query.orderBy(desc(drivers.createdAt)) as any;

  const rows = await query;
  if (rows.length === 0) return [];

  const driverIds = rows.map((r) => r.driver.id);

  // Compute order statistics per driver from PostgreSQL orders table
  const driverOrders = await db
    .select({
      driverId: orders.driverId,
      status: orders.status,
      collectionStatus: orders.collectionStatus,
      collectedAmount: orders.collectedAmount,
      total: orders.total,
    })
    .from(orders)
    .where(inArray(orders.driverId, driverIds));

  // Query active settlements per driver from PostgreSQL driver_settlements table
  const activeSettlements = await db
    .select({
      driverId: driverSettlements.driverId,
      actualAmount: driverSettlements.actualAmount,
    })
    .from(driverSettlements)
    .where(
      and(
        inArray(driverSettlements.driverId, driverIds),
        eq(driverSettlements.isReversed, false),
        ne(driverSettlements.type, 'reversal')
      )
    );

  const settledMap = new Map<string, number>();
  for (const s of activeSettlements) {
    settledMap.set(s.driverId, (settledMap.get(s.driverId) || 0) + Number(s.actualAmount || 0));
  }

  const statsMap = new Map<string, { active: number; completed: number; revenue: number; collectedCash: number }>();

  for (const o of driverOrders) {
    if (!o.driverId) continue;
    const curr = statsMap.get(o.driverId) || { active: 0, completed: 0, revenue: 0, collectedCash: 0 };
    if (o.status === 'processing' || o.status === 'shipped') {
      curr.active += 1;
    } else if (o.status === 'delivered') {
      curr.completed += 1;
      curr.revenue += Number(o.total) || 0;
    }

    if (
      o.status !== 'cancelled' &&
      o.collectionStatus !== 'returned' &&
      Number(o.collectedAmount) > 0
    ) {
      curr.collectedCash += Number(o.collectedAmount) || 0;
    }

    statsMap.set(o.driverId, curr);
  }

  return rows.map(({ driver, vehicle }) => {
    const s = statsMap.get(driver.id) || { active: 0, completed: 0, revenue: 0, collectedCash: 0 };
    const totalSettled = settledMap.get(driver.id) || 0;
    const cashInHand = Math.max(0, s.collectedCash - totalSettled);

    const baseStatus = (driver.operationalStatus as DriverBaseStatus) || 'available';
    const effectiveStatus = computeDriverOperationalStatus(baseStatus, s.active);

    return {
      id: driver.id,
      authIdentityId: driver.authIdentityId,
      financialAccountId: driver.financialAccountId,
      name: driver.name,
      phone: driver.phone,
      defaultVehicleId: driver.defaultVehicleId || undefined,
      vehicleInfo: vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : undefined,
      isVehicleActive: vehicle ? vehicle.isActive : undefined,
      isActive: driver.isActive,
      notes: driver.notes || undefined,
      operationalStatus: baseStatus,
      effectiveStatus,
      currentCashInHand: cashInHand,
      activeDeliveries: s.active,
      completedDeliveries: s.completed,
      totalDeliveredRevenue: s.revenue,
      createdAt: driver.createdAt.toISOString(),
    };
  });
}

/**
 * جلب سائق واحد بواسطة المعرف
 */
export async function pgGetDriverById(id: string): Promise<DriverWithStats | null> {
  const db = getDb();
  const rows = await db
    .select({
      driver: drivers,
      vehicle: vehicles,
      auth: authIdentities,
    })
    .from(drivers)
    .innerJoin(authIdentities, eq(drivers.authIdentityId, authIdentities.id))
    .leftJoin(vehicles, eq(drivers.defaultVehicleId, vehicles.id))
    .where(eq(drivers.id, id))
    .limit(1);

  if (rows.length === 0) return null;
  const { driver, vehicle, auth } = rows[0];

  // Compute order statistics
  const driverOrders = await db
    .select({
      status: orders.status,
      collectionStatus: orders.collectionStatus,
      collectedAmount: orders.collectedAmount,
      total: orders.total,
    })
    .from(orders)
    .where(eq(orders.driverId, id));

  // Query active settlements
  const activeSettlements = await db
    .select({ actualAmount: driverSettlements.actualAmount })
    .from(driverSettlements)
    .where(
      and(
        eq(driverSettlements.driverId, id),
        eq(driverSettlements.isReversed, false),
        ne(driverSettlements.type, 'reversal')
      )
    );

  const totalSettled = activeSettlements.reduce((sum, s) => sum + Number(s.actualAmount || 0), 0);

  let active = 0;
  let completed = 0;
  let revenue = 0;
  let totalCollected = 0;

  for (const o of driverOrders) {
    if (o.status === 'processing' || o.status === 'shipped') {
      active += 1;
    } else if (o.status === 'delivered') {
      completed += 1;
      revenue += Number(o.total) || 0;
    }

    if (
      o.status !== 'cancelled' &&
      o.collectionStatus !== 'returned' &&
      Number(o.collectedAmount) > 0
    ) {
      totalCollected += Number(o.collectedAmount) || 0;
    }
  }

  const cashInHand = Math.max(0, totalCollected - totalSettled);

  const baseStatus = (driver.operationalStatus as DriverBaseStatus) || 'available';
  const effectiveStatus = computeDriverOperationalStatus(baseStatus, active);

  return {
    id: driver.id,
    authIdentityId: driver.authIdentityId,
    authIdentityIsActive: auth.isActive,
    financialAccountId: driver.financialAccountId,
    name: driver.name,
    phone: driver.phone,
    defaultVehicleId: driver.defaultVehicleId || undefined,
    vehicleInfo: vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : undefined,
    isVehicleActive: vehicle ? vehicle.isActive : undefined,
    isActive: driver.isActive,
    notes: driver.notes || undefined,
    operationalStatus: baseStatus,
    effectiveStatus,
    currentCashInHand: cashInHand,
    activeDeliveries: active,
    completedDeliveries: completed,
    totalDeliveredRevenue: revenue,
    createdAt: driver.createdAt.toISOString(),
  };
}

/**
 * جلب سائق بواسطة رقم الهاتف مع بيانات التحقق من كلمة المرور
 */
export async function pgGetDriverByPhone(phone: string): Promise<DriverWithAuth | null> {
  const db = getDb();
  const cleanPhone = normalizeIraqiPhone(phone);
  if (!cleanPhone) return null;

  const rows = await db
    .select({
      driver: drivers,
      auth: authIdentities,
      vehicle: vehicles,
    })
    .from(drivers)
    .innerJoin(authIdentities, eq(drivers.authIdentityId, authIdentities.id))
    .leftJoin(vehicles, eq(drivers.defaultVehicleId, vehicles.id))
    .where(eq(drivers.phone, cleanPhone))
    .limit(1);

  if (rows.length === 0) return null;
  const { driver, auth, vehicle } = rows[0];

  const rawBaseStatus = (driver.operationalStatus as DriverBaseStatus) || 'available';
  const effectiveStatus = computeDriverOperationalStatus(rawBaseStatus, 0);

  return {
    id: driver.id,
    authIdentityId: driver.authIdentityId,
    financialAccountId: driver.financialAccountId,
    name: driver.name,
    phone: driver.phone,
    passwordHash: auth.passwordHash,
    defaultVehicleId: driver.defaultVehicleId || undefined,
    vehicleInfo: vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : undefined,
    isActive: driver.isActive && auth.isActive,
    operationalStatus: rawBaseStatus,
    effectiveStatus: effectiveStatus,
    notes: driver.notes || undefined,
    currentCashInHand: 0,
    activeDeliveries: 0,
    completedDeliveries: 0,
    totalDeliveredRevenue: 0,
    createdAt: driver.createdAt.toISOString(),
  };
}

/**
 * تعديل بيانات السائق في قاعدة البيانات داخل Transaction
 */
export async function pgUpdateDriver(id: string, updates: UpdateDriverInput): Promise<DriverWithStats | null> {
  const db = getDb();
  const current = await pgGetDriverById(id);
  if (!current) return null;

  await db.transaction(async (tx) => {
    const driverUpdates: Record<string, any> = {};
    let phoneChanged = false;
    let newPhone: string | null = null;

    if (updates.name !== undefined) {
      driverUpdates.name = updates.name.trim();
      await tx
        .update(financialAccounts)
        .set({ name: updates.name.trim() })
        .where(eq(financialAccounts.id, current.financialAccountId));
    }

    if (updates.phone !== undefined) {
      newPhone = normalizeIraqiPhone(updates.phone);
      if (!newPhone) {
        throw new Error('يرجى إدخال رقم هاتف عراقي صحيح');
      }
      if (newPhone !== current.phone) {
        // Verify uniqueness
        const dupAuth = await tx
          .select({ id: authIdentities.id })
          .from(authIdentities)
          .where(eq(authIdentities.phone, newPhone))
          .limit(1);
        if (dupAuth.length > 0 && dupAuth[0].id !== current.authIdentityId) {
          throw new Error('رقم الهاتف الجديد مسجل مسبقاً في النظام');
        }

        const dupDriver = await tx
          .select({ id: drivers.id })
          .from(drivers)
          .where(eq(drivers.phone, newPhone))
          .limit(1);
        if (dupDriver.length > 0 && dupDriver[0].id !== id) {
          throw new Error('رقم الهاتف الجديد مسجل مسبقاً لسائق آخر');
        }

        driverUpdates.phone = newPhone;
        phoneChanged = true;

        await tx
          .update(authIdentities)
          .set({ phone: newPhone })
          .where(eq(authIdentities.id, current.authIdentityId));

        await tx
          .update(financialAccounts)
          .set({ phone: newPhone })
          .where(eq(financialAccounts.id, current.financialAccountId));
      }
    }

    if (updates.password !== undefined) {
      if (typeof updates.password !== 'string' || updates.password.trim().length < 6) {
        throw new Error('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف');
      }
      const newHash = hashPassword(updates.password.trim());
      await tx
        .update(authIdentities)
        .set({ passwordHash: newHash })
        .where(eq(authIdentities.id, current.authIdentityId));
    }

    if (updates.defaultVehicleId !== undefined) {
      if (updates.defaultVehicleId === 'none' || !updates.defaultVehicleId) {
        driverUpdates.defaultVehicleId = null;
      } else {
        const [veh] = await tx
          .select({ id: vehicles.id, isActive: vehicles.isActive })
          .from(vehicles)
          .where(eq(vehicles.id, updates.defaultVehicleId))
          .limit(1);
        if (!veh) {
          throw new Error('المركبة المحددة غير موجودة');
        }
        if (!veh.isActive) {
          throw new Error('المركبة المحددة معطلة ولا يمكن إسنادها');
        }
        driverUpdates.defaultVehicleId = veh.id;
      }
    }

    if (updates.notes !== undefined) {
      driverUpdates.notes = updates.notes.trim() || null;
    }

    if (updates.isActive !== undefined) {
      driverUpdates.isActive = updates.isActive;
      await tx
        .update(authIdentities)
        .set({ isActive: updates.isActive })
        .where(eq(authIdentities.id, current.authIdentityId));

      await tx
        .update(financialAccounts)
        .set({ isActive: updates.isActive })
        .where(eq(financialAccounts.id, current.financialAccountId));
    }

    if (updates.operationalStatus !== undefined) {
      driverUpdates.operationalStatus = updates.operationalStatus;
    }

    if (Object.keys(driverUpdates).length > 0) {
      await tx.update(drivers).set(driverUpdates).where(eq(drivers.id, id));
    }
  });

  return await pgGetDriverById(id);
}

/**
 * حذف السائق أو إلغاء تفعيله بأمان (Logical Deactivation if referenced)
 */
export async function pgDeleteDriver(id: string): Promise<{ success: boolean; deactivated: boolean; message: string }> {
  const db = getDb();
  const current = await pgGetDriverById(id);
  if (!current) {
    throw new Error('السائق غير موجود');
  }

  // Logical deactivation across driver, auth_identity, and financial_account
  await db.transaction(async (tx) => {
    await tx.update(drivers).set({ isActive: false }).where(eq(drivers.id, id));
    await tx.update(authIdentities).set({ isActive: false }).where(eq(authIdentities.id, current.authIdentityId));
    await tx
      .update(financialAccounts)
      .set({ isActive: false, archivedAt: new Date() })
      .where(eq(financialAccounts.id, current.financialAccountId));
  });

  return {
    success: true,
    deactivated: true,
    message: 'تم إلغاء تفعيل حساب السائق بنجاح',
  };
}

export interface UpdateDriverOperationalStatusInput {
  driverId: string;
  operationalStatus: DriverBaseStatus;
  operator?: {
    id: string;
    name: string;
    phone?: string;
    role?: string;
  };
}

/**
 * تحديث الحالة التشغيلية للسائق Server-side مع حماية الطلبات النشطة والـ Audit Log
 * - الحالات المسموح باختيارها يدوياً: 'available' | 'break' | 'off_duty'
 * - لا يسمح باختيار 'busy' يدوياً (حالة تشغيلية مشتقة من activeDeliveries)
 * - يمنع 'off_duty' إذا كان بحوزة السائق طلب بحالة 'shipped' (خارج للتوصيل)
 * - لا يسجل audit log متكرر إذا أرسل السائق نفس الحالة (Idempotent)
 */
export async function pgUpdateDriverOperationalStatus(
  input: UpdateDriverOperationalStatusInput
): Promise<DriverWithStats> {
  const db = getDb();
  const targetStatus = String(input.operationalStatus || '').toLowerCase().trim();

  if (targetStatus === 'busy') {
    throw new Error('حالة الانشغال (busy) تشغيلية تلقائية ولا يمكن اختيارها يدوياً');
  }

  if (!['available', 'break', 'off_duty'].includes(targetStatus)) {
    throw new Error('الحالة التشغيلية المحددة غير صالحة');
  }

  const driverId = String(input.driverId || '').trim();
  if (!driverId) {
    throw new Error('معرف السائق مطلوب');
  }

  await db.transaction(async (tx) => {
    // 1. Lock driver row
    const [driverRow] = await tx
      .select({
        driver: drivers,
        auth: authIdentities,
      })
      .from(drivers)
      .innerJoin(authIdentities, eq(drivers.authIdentityId, authIdentities.id))
      .where(eq(drivers.id, driverId))
      .for('update')
      .limit(1);

    if (!driverRow) {
      throw new Error('السائق غير موجود');
    }

    if (!driverRow.driver.isActive || !driverRow.auth.isActive) {
      throw new Error('حساب السائق معطل ولا يمكن تعديل حالته التشغيلية');
    }

    const currentStatus = (driverRow.driver.operationalStatus as DriverBaseStatus) || 'available';

    // 2. Protection: If transitioning to off_duty, check if driver has any shipped order
    if (targetStatus === 'off_duty') {
      const shippedOrders = await tx
        .select({ id: orders.id, orderNumber: orders.orderNumber })
        .from(orders)
        .where(and(eq(orders.driverId, driverId), eq(orders.status, 'shipped')))
        .limit(1);

      if (shippedOrders.length > 0) {
        throw new Error('لديك طلب خارج للتوصيل. أكمل الطلب أو أعده قبل إنهاء الدوام.');
      }
    }

    // 3. Idempotency: If status is already the target status, do not insert duplicate audit log
    if (currentStatus === targetStatus) {
      const unchanged = await pgGetDriverById(driverId);
      if (!unchanged) throw new Error('تعذر جلب بيانات السائق');
      return unchanged;
    }

    // 4. Update status in database
    await tx
      .update(drivers)
      .set({ operationalStatus: targetStatus as any })
      .where(eq(drivers.id, driverId));

    // 5. Insert audit log
    await tx.insert(auditLogs).values({
      actionType: 'driver_status_change',
      actionLabel: 'تغيير الحالة التشغيلية للسائق',
      category: 'operations',
      categoryLabel: 'العمليات والتوصيل',
      operatorSnapshot: input.operator || {
        id: driverRow.driver.id,
        name: driverRow.driver.name,
        phone: driverRow.driver.phone,
        role: 'driver',
      },
      targetType: 'driver',
      targetId: driverRow.driver.id,
      targetReferenceNumber: driverRow.driver.phone,
      details: `تغيرت حالة السائق ${driverRow.driver.name} من (${currentStatus}) إلى (${targetStatus})`,
      severity: 'info',
    });
  });

  const updated = await pgGetDriverById(driverId);
  if (!updated) throw new Error('تعذر جلب بيانات السائق بعد التحديث');
  return updated;
}
