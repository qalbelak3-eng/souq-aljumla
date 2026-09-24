import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import { pgGetDriverById } from '@/lib/postgres-drivers';
import { pgGetDriverOrders } from '@/lib/postgres-delivery';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'drivers') && !hasPermission(admin, 'orders')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية الوصول إلى سجل طلبيات السائقين' }, { status: 403 });
    }

    const resolvedParams = await params;
    const driverId = resolvedParams?.id;

    const driver = await pgGetDriverById(driverId);
    if (!driver) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }

    const { activeOrders, historyOrders } = await pgGetDriverOrders(driverId);
    const allDriverOrders = [...activeOrders, ...historyOrders];

    const deliveredOrders = allDriverOrders.filter((o) => o.status === 'delivered');
    const totalDeliveredRevenue = deliveredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalCashCollected = deliveredOrders
      .filter((o) => o.collectionStatus === 'collected_cash' || o.collectionStatus === 'partial')
      .reduce((sum, o) => sum + (o.collectedAmount || 0), 0);
    const totalDebtRecorded = deliveredOrders
      .filter((o) => o.collectionStatus === 'debt_unpaid' || o.collectionStatus === 'partial')
      .reduce((sum, o) => sum + (o.remainingDebtAmount || 0), 0);

    return NextResponse.json({
      success: true,
      driver,
      orders: allDriverOrders,
      stats: {
        totalAssigned: allDriverOrders.length,
        totalDelivered: deliveredOrders.length,
        totalActive: activeOrders.length,
        totalReturned: allDriverOrders.filter((o) => o.collectionStatus === 'returned' || o.status === 'cancelled').length,
        totalDeliveredRevenue,
        totalCashCollected,
        totalDebtRecorded,
        currentCashInHand: driver.currentCashInHand || 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching driver orders:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب سجل طلبيات السائق' },
      { status: 500 }
    );
  }
}
