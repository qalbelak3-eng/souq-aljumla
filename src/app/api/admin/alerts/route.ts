import { NextResponse } from 'next/server';
import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { orders, financialAccounts, products, drivers, productOffers, customerComplaints } from '@/db/schema';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function requireDashboardPermission(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return null;
  const staff = await pgGetActiveStaffForSession({ userId: session.userId, username: session.username });
  if (!staff) return null;
  const permissions = staff.permissions || [];
  const allowed = session.role === 'admin' || staff.role === 'admin' || staff.role === 'master' || permissions.includes('*') || permissions.includes('dashboard');
  return { forbidden: !allowed };
}

export async function GET(request: Request) {
  try {
    const access = await requireDashboardPermission(request);
    if (!access) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    if (access.forbidden) return NextResponse.json({ success: false, error: 'ليس لديك صلاحية لعرض التنبيهات الإدارية' }, { status: 403 });

    const db = getDb();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const [pendingOrdersRow, custodyRows, recentOrdersRows, pendingMerchantsRows, lowStockRow, expiredRow, warningRows, driverRows, debtsRow, offersRow, complaintsRow] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.status, 'pending')),
      db.select({ driverId: orders.driverId, amount: orders.collectedAmount }).from(orders).where(and(eq(orders.status, 'delivered'), eq(orders.driverCashSettled, false), inArray(orders.collectionStatus, ['collected_cash', 'partial']))),
      db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, total: orders.total, driverId: orders.driverId, customerTitle: orders.customerNameSnap, collectionStatus: orders.collectionStatus, driverArrivedAt: orders.driverArrivedAt }).from(orders).orderBy(desc(orders.createdAt)).limit(50),
      db.select({ id: financialAccounts.id, name: financialAccounts.name, businessName: financialAccounts.businessName, city: financialAccounts.city }).from(financialAccounts).where(eq(financialAccounts.merchantStatus, 'pending')).limit(10),
      db.select({ count: sql<number>`count(*)::int` }).from(products).where(lte(products.currentStockPieces, products.minStockAlert)),
      db.select({ count: sql<number>`count(*)::int` }).from(products).where(and(gt(products.currentStockPieces, 0), sql`${products.expiryDate} IS NOT NULL`, lte(products.expiryDate, today))),
      db.select({ expiryDate: products.expiryDate, expiryAlertDays: products.expiryAlertDays, stock: products.currentStockPieces }).from(products).where(and(gt(products.currentStockPieces, 0), sql`${products.expiryDate} IS NOT NULL`, gt(products.expiryDate, today))),
      db.select({ id: drivers.id, name: drivers.name }).from(drivers),
      db.select({ count: sql<number>`count(*)::int` }).from(orders).where(gt(orders.remainingDebtAmount, '0')),
      db.select({ count: sql<number>`count(*)::int` }).from(productOffers).where(and(eq(productOffers.isActive, true), eq(productOffers.isArchived, false), gt(productOffers.endDate, now))),
      db.select({ count: sql<number>`count(*)::int` }).from(customerComplaints).where(inArray(customerComplaints.status, ['pending', 'in_progress'])),
    ]);

    const pendingMerchantsCountRows = await db.select({ count: sql<number>`count(*)::int` }).from(financialAccounts).where(eq(financialAccounts.merchantStatus, 'pending'));
    const driverIdsWithCustody = new Set(custodyRows.map((row) => row.driverId).filter(Boolean));
    const totalCustodyAmount = custodyRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const cashByDriver = new Map<string, number>();
    for (const row of custodyRows) if (row.driverId) cashByDriver.set(row.driverId, (cashByDriver.get(row.driverId) || 0) + Number(row.amount || 0));

    const warningExpiryProductsCount = warningRows.filter((row) => {
      if (!row.expiryDate) return false;
      const exp = new Date(`${row.expiryDate}T00:00:00Z`).getTime();
      const daysLeft = (exp - now.getTime()) / 86400000;
      return daysLeft <= Number(row.expiryAlertDays ?? 30);
    }).length;
    const expiredProductsCount = Number(expiredRow[0]?.count || 0);

    return NextResponse.json({
      success: true,
      pendingOrdersCount: Number(pendingOrdersRow[0]?.count || 0),
      pendingMerchantsCount: Number(pendingMerchantsCountRows[0]?.count || 0),
      lowStockCount: Number(lowStockRow[0]?.count || 0),
      expiredProductsCount,
      warningExpiryProductsCount,
      totalExpiryAlertsCount: expiredProductsCount + warningExpiryProductsCount,
      driversCustodyCount: driverIdsWithCustody.size,
      totalCustodyAmount,
      unsettledDebtsCount: Number(debtsRow[0]?.count || 0),
      activeOffersCount: Number(offersRow[0]?.count || 0),
      pendingComplaintsCount: Number(complaintsRow[0]?.count || 0),
      recentOrders: recentOrdersRows.map((row) => ({ id: row.id, orderNumber: row.orderNumber, status: row.status, total: Number(row.total || 0), driverName: row.driverId ? (driverRows.find((d) => d.id === row.driverId)?.name || 'المندوب') : 'المندوب', customerTitle: row.customerTitle || 'زبون', collectionStatus: row.collectionStatus, driverArrivedAt: row.driverArrivedAt || null })),
      recentPendingMerchants: pendingMerchantsRows.map((m) => ({ id: m.id, name: m.name, businessName: m.businessName || m.name, city: m.city || 'كربلاء' })),
      driverCashList: driverRows.map((d) => ({ id: d.id, name: d.name, cashInHand: cashByDriver.get(d.id) || 0 })),
    });
  } catch (error) {
    console.error('GET /api/admin/alerts failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل التنبيهات الإدارية' }, { status: 500 });
  }
}
