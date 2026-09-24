import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  drivers,
  vehicles,
  authIdentities,
  financialAccounts,
  orders,
  nextAccountCodeSql,
} from '@/db/schema';
import { normalizeIraqiPhone } from '@/db/phone';
import { hashPassword } from '@/lib/auth';
import { Driver, Vehicle } from '@/types';

/* =========================================================
   Types & Interfaces
   ========================================================= */

export interface DriverWithStats extends Driver {
  authIdentityId: string;
  financialAccountId: string;
  activeDeliveries: number;
  completedDeliveries: number;
  totalDeliveredRevenue: number;
  currentCashInHand: number;
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
  notes?: string;
  isActive?: boolean;
}

export interface UpdateDriverInput {
  name?: string;
  phone?: string;
  password?: string;
  vehicleInfo?: string;
  defaultVehicleId?: string;
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

  const plainPassword = input.password?.trim() || '123';
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
    if (input.defaultVehicleId && input.defaultVehicleId !== 'none') {
      const [veh] = await tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.id, input.defaultVehicleId))
        .limit(1);
      if (veh) validVehicleId = veh.id;
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
        isActive: input.isActive !== false,
        notes: input.notes?.trim() || null,
      })
      .returning();

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
      driverCashSettled: orders.driverCashSettled,
    })
    .from(orders)
    .where(inArray(orders.driverId, driverIds));

  const statsMap = new Map<string, { active: number; completed: number; revenue: number; cashInHand: number }>();

  for (const o of driverOrders) {
    if (!o.driverId) continue;
    const curr = statsMap.get(o.driverId) || { active: 0, completed: 0, revenue: 0, cashInHand: 0 };
    if (o.status === 'processing' || o.status === 'shipped') {
      curr.active += 1;
    } else if (o.status === 'delivered') {
      curr.completed += 1;
      curr.revenue += Number(o.total) || 0;
    }

    // Cash in hand is unsettled collected cash from non-cancelled, non-returned orders
    if (
      !o.driverCashSettled &&
      o.status !== 'cancelled' &&
      o.collectionStatus !== 'returned' &&
      Number(o.collectedAmount) > 0
    ) {
      curr.cashInHand += Number(o.collectedAmount) || 0;
    }

    statsMap.set(o.driverId, curr);
  }

  return rows.map(({ driver, vehicle }) => {
    const s = statsMap.get(driver.id) || { active: 0, completed: 0, revenue: 0, cashInHand: 0 };
    return {
      id: driver.id,
      authIdentityId: driver.authIdentityId,
      financialAccountId: driver.financialAccountId,
      name: driver.name,
      phone: driver.phone,
      defaultVehicleId: driver.defaultVehicleId || undefined,
      vehicleInfo: vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : undefined,
      isActive: driver.isActive,
      notes: driver.notes || undefined,
      currentCashInHand: s.cashInHand,
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
    })
    .from(drivers)
    .leftJoin(vehicles, eq(drivers.defaultVehicleId, vehicles.id))
    .where(eq(drivers.id, id))
    .limit(1);

  if (rows.length === 0) return null;
  const { driver, vehicle } = rows[0];

  // Compute order statistics
  const driverOrders = await db
    .select({
      status: orders.status,
      collectionStatus: orders.collectionStatus,
      collectedAmount: orders.collectedAmount,
      total: orders.total,
      driverCashSettled: orders.driverCashSettled,
    })
    .from(orders)
    .where(eq(orders.driverId, id));

  let active = 0;
  let completed = 0;
  let revenue = 0;
  let cashInHand = 0;

  for (const o of driverOrders) {
    if (o.status === 'processing' || o.status === 'shipped') {
      active += 1;
    } else if (o.status === 'delivered') {
      completed += 1;
      revenue += Number(o.total) || 0;
    }

    if (
      !o.driverCashSettled &&
      o.status !== 'cancelled' &&
      o.collectionStatus !== 'returned' &&
      Number(o.collectedAmount) > 0
    ) {
      cashInHand += Number(o.collectedAmount) || 0;
    }
  }

  return {
    id: driver.id,
    authIdentityId: driver.authIdentityId,
    financialAccountId: driver.financialAccountId,
    name: driver.name,
    phone: driver.phone,
    defaultVehicleId: driver.defaultVehicleId || undefined,
    vehicleInfo: vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : undefined,
    isActive: driver.isActive,
    notes: driver.notes || undefined,
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

    if (updates.password && updates.password.trim().length > 0) {
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
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(eq(vehicles.id, updates.defaultVehicleId))
          .limit(1);
        if (veh) {
          driverUpdates.defaultVehicleId = veh.id;
        }
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
