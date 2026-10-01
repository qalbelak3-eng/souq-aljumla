import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import { pgGetOrders } from '@/lib/postgres-orders';
import { pgGetProducts } from '@/lib/postgres-catalog';
import { pgGetDrivers } from '@/lib/postgres-drivers';
import { getPostgresClient } from '@/db/client';
import { Order } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }

    const staff = await pgGetActiveStaffForSession({
      userId: session.userId,
      username: session.username,
    });
    if (!staff) {
      return NextResponse.json({ success: false, error: 'الجلسة غير صالحة أو الحساب غير فعال' }, { status: 401 });
    }

    const sql = getPostgresClient();
    const [orders, products, drivers, pendingMerchantRows, debtRows, offerRows, complaintRows] = await Promise.all([
      pgGetOrders(),
      pgGetProducts({ includeInactive: true }),
      pgGetDrivers(),
      sql`
        SELECT id, name, business_name as "businessName", city
        FROM financial_accounts
        WHERE category = 'customer'
          AND merchant_status = 'pending'
          AND archived_at IS NULL
        ORDER BY created_at DESC
        LIMIT 10;
      `,
      sql`
        SELECT COUNT(*)::int as count
        FROM financial_accounts fa
        WHERE fa.category = 'customer'
          AND fa.archived_at IS NULL
          AND (
            COALESCE((
              SELECT SUM(CASE WHEN ob.type = 'debit' THEN ob.amount ELSE -ob.amount END)
              FROM account_opening_balances ob
              WHERE ob.account_id = fa.id
            ), 0)
            + COALESCE((
              SELECT SUM(o.remaining_debt_amount)
              FROM orders o
              WHERE o.account_id = fa.id
                AND o.status <> 'cancelled'
            ), 0)
            - COALESCE((
              SELECT SUM(CASE
                WHEN v.voucher_type = 'receipt' THEN v.amount
                WHEN v.voucher_type = 'payment' THEN -v.amount
                ELSE 0
              END)
              FROM vouchers v
              WHERE v.account_id = fa.id
                AND v.is_reversed = false
            ), 0)
          ) > 0;
      `,
      sql`
        SELECT COUNT(*)::int as count
        FROM product_offers
        WHERE is_active = true
          AND (is_archived IS NULL OR is_archived = false)
          AND (start_date IS NULL OR start_date <= NOW())
          AND end_date > NOW();
      `,
      sql`
        SELECT COUNT(*)::int as count
        FROM customer_complaints
        WHERE status IN ('pending', 'in_progress');
      `,
    ]);

    const sortedOrders: Order[] = orders
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const pendingOrdersCount = sortedOrders.filter((o) => o.status === 'pending').length;

    const unsettledCashOrders = sortedOrders.filter(
      (o) =>
        o.driverId &&
        o.status === 'delivered' &&
        !o.driverCashSettled &&
        (o.collectionStatus === 'collected_cash' || o.collectionStatus === 'partial' || !o.collectionStatus)
    );
    const driverIdsWithCustody = new Set(unsettledCashOrders.map((o) => o.driverId));
    const custodySum = unsettledCashOrders.reduce(
      (sum, o) => sum + Number(o.collectedAmount || o.total || 0),
      0
    );

    const recentOrders = sortedOrders.slice(0, 50).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      total: Number(o.total || 0),
      driverName: o.driverName || 'المندوب',
      customerTitle: o.customer?.businessName || o.customer?.name || 'زبون',
      collectionStatus: o.collectionStatus,
      driverArrivedAt: o.driverArrivedAt || null,
    }));

    const pendingMerchantsCountRows = await sql`
      SELECT COUNT(*)::int as count
      FROM financial_accounts
      WHERE category = 'customer'
        AND merchant_status = 'pending'
        AND archived_at IS NULL;
    `;
    const pendingMerchantsCount = Number(pendingMerchantsCountRows[0]?.count || 0);
    const recentPendingMerchants = pendingMerchantRows.map((m: any) => ({
      id: String(m.id),
      name: String(m.name || ''),
      businessName: m.businessName || m.name || '',
      city: m.city || 'كربلاء',
    }));

    const lowStockCount = products.filter((p) => Number(p.stock || 0) <= Number(p.minStockAlert ?? 5)).length;
    const nowTime = Date.now();
    const expiredProductsCount = products.filter((p) => {
      if (!p.expiryDate || Number(p.stock || 0) <= 0) return false;
      return new Date(p.expiryDate).getTime() <= nowTime;
    }).length;
    const warningExpiryProductsCount = products.filter((p) => {
      if (!p.expiryDate || Number(p.stock || 0) <= 0) return false;
      const expTime = new Date(p.expiryDate).getTime();
      if (expTime <= nowTime) return false;
      const alertDays = p.expiryAlertDays ?? 30;
      const daysLeft = (expTime - nowTime) / (1000 * 60 * 60 * 24);
      return daysLeft <= alertDays;
    }).length;
    const totalExpiryAlertsCount = expiredProductsCount + warningExpiryProductsCount;

    const driversWithCustody = drivers.filter((d) => Number(d.currentCashInHand || 0) > 0);
    const driversCustodyCount = Math.max(driverIdsWithCustody.size, driversWithCustody.length);
    const driverTotalCash = driversWithCustody.reduce(
      (sum, d) => sum + Number(d.currentCashInHand || 0),
      0
    );
    const totalCustodyAmount = Math.max(custodySum, driverTotalCash);
    const driverCashList = drivers.map((d) => ({
      id: d.id,
      name: d.name,
      cashInHand: Number(d.currentCashInHand || 0),
    }));

    const unsettledDebtsCount = Number(debtRows[0]?.count || 0);
    const activeOffersCount = Number(offerRows[0]?.count || 0);
    const pendingComplaintsCount = Number(complaintRows[0]?.count || 0);

    return NextResponse.json({
      success: true,
      pendingOrdersCount,
      pendingMerchantsCount,
      lowStockCount,
      expiredProductsCount,
      warningExpiryProductsCount,
      totalExpiryAlertsCount,
      driversCustodyCount,
      totalCustodyAmount,
      unsettledDebtsCount,
      activeOffersCount,
      pendingComplaintsCount,
      recentOrders,
      recentPendingMerchants,
      driverCashList,
    });
  } catch (error) {
    console.error('GET /api/admin/alerts failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل تنبيهات الإدارة' }, { status: 500 });
  }
}
