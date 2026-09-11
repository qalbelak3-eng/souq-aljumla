import { NextResponse } from 'next/server';
import { ensureDbExists, getAllCustomerAccounts } from '@/lib/db';
import { Order, User, Product, Driver, ProductOffer, CustomerComplaint } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = ensureDbExists();

    const rawOrders: Order[] = Array.isArray(db.orders) ? db.orders : [];
    const orders: Order[] = rawOrders.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const users: User[] = Array.isArray(db.users) ? db.users : [];
    const products: Product[] = Array.isArray(db.products) ? db.products : [];
    const drivers: Driver[] = Array.isArray(db.drivers) ? db.drivers : [];
    const offers: ProductOffer[] = Array.isArray(db.offers) ? db.offers : [];
    const complaints: CustomerComplaint[] = Array.isArray(db.complaints) ? db.complaints : [];

    // 1. Orders stats
    const pendingOrders = orders.filter((o: Order) => o.status === 'pending');
    const pendingOrdersCount = pendingOrders.length;

    // Delivered cash orders custody
    const unsettledCashOrders = orders.filter(
      (o: Order) =>
        o.driverId &&
        o.status === 'delivered' &&
        !o.driverCashSettled &&
        (o.collectionStatus === 'collected_cash' || o.collectionStatus === 'partial' || !o.collectionStatus)
    );
    const driverIdsWithCustody = new Set(unsettledCashOrders.map((o: Order) => o.driverId));
    const custodySum = unsettledCashOrders.reduce(
      (sum: number, o: Order) => sum + Number(o.collectedAmount || o.total || 0),
      0
    );

    // Recent orders for notification detection (newest 50 orders)
    const recentOrders = orders.slice(0, 50).map((o: Order) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      total: Number(o.total || 0),
      driverName: o.driverName || 'المندوب',
      customerTitle: o.customer?.businessName || o.customer?.name || 'زبون',
      collectionStatus: o.collectionStatus,
      driverArrivedAt: o.driverArrivedAt || null,
    }));

    // 2. Merchants stats
    const pendingMerchants = users.filter((u: User) => u.merchantStatus === 'pending');
    const pendingMerchantsCount = pendingMerchants.length;
    const recentPendingMerchants = pendingMerchants.slice(0, 10).map((m: User) => ({
      id: m.id,
      name: m.name,
      businessName: m.businessName || m.name,
      city: m.city || 'كربلاء',
    }));

    // 3. Products low stock & Expiry warnings
    const lowStockCount = products.filter((p: Product) => Number(p.stock || 0) <= 5).length;
    const nowTime = Date.now();
    const expiredProductsCount = products.filter((p: Product) => {
      if (!p.expiryDate || Number(p.stock || 0) <= 0) return false;
      return new Date(p.expiryDate).getTime() <= nowTime;
    }).length;

    const warningExpiryProductsCount = products.filter((p: Product) => {
      if (!p.expiryDate || Number(p.stock || 0) <= 0) return false;
      const expTime = new Date(p.expiryDate).getTime();
      if (expTime <= nowTime) return false;
      const alertDays = p.expiryAlertDays ?? 30;
      const daysLeft = (expTime - nowTime) / (1000 * 60 * 60 * 24);
      return daysLeft <= alertDays;
    }).length;

    const totalExpiryAlertsCount = expiredProductsCount + warningExpiryProductsCount;

    // 4. Drivers cash stats
    const driversWithCustody = drivers.filter(
      (d: Driver) => (Number(d.currentCashInHand) || 0) > 0
    );
    const driversCustodyCount = Math.max(driverIdsWithCustody.size, driversWithCustody.length);
    const driverTotalCash = driversWithCustody.reduce(
      (sum: number, d: Driver) => sum + (Number(d.currentCashInHand) || 0),
      0
    );
    const totalCustodyAmount = Math.max(custodySum, driverTotalCash);

    const driverCashList = drivers.map((d: Driver) => ({
      id: d.id,
      name: d.name,
      cashInHand: Number(d.currentCashInHand || 0),
    }));

    // 5. Unsettled debts
    const accounts = getAllCustomerAccounts();
    const unsettledDebtsCount = accounts.filter((acc) => Number(acc.remainingBalance || 0) > 0).length;

    // 6. Active offers
    const nowIso = new Date().toISOString();
    const activeOffersCount = offers.filter((o: ProductOffer) => {
      if (o.isActive === false) return false;
      if (o.endDate && o.endDate < nowIso) return false;
      return true;
    }).length;

    // 7. Complaints
    const pendingComplaintsCount = complaints.filter(
      (c: CustomerComplaint) => c.status === 'pending' || c.status === 'in_progress'
    ).length;

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
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
