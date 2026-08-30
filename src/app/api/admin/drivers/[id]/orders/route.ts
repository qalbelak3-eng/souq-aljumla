import { NextResponse } from 'next/server';
import { getDriverById, getOrders, getVehicles } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const driver = getDriverById(params.id);
    if (!driver) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }

    const allOrders = getOrders();
    const vehicles = getVehicles();

    const driverOrders = allOrders
      .filter((o) => o.driverId === params.id || (o.driverName && o.driverName === driver.name))
      .map((o) => {
        if (o.vehicleId) {
          const veh = vehicles.find((v) => v.id === o.vehicleId);
          if (veh) {
            return {
              ...o,
              vehicleName: veh.name,
              vehiclePlate: veh.plateNumber,
            };
          }
        }
        return o;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Calculate Driver Stats
    const deliveredOrders = driverOrders.filter((o) => o.status === 'delivered');
    const totalDeliveredRevenue = deliveredOrders.reduce((sum, o) => sum + o.total, 0);
    const totalCashCollected = deliveredOrders
      .filter((o) => o.collectionStatus === 'collected_cash' || o.collectionStatus === 'partial')
      .reduce((sum, o) => sum + (o.collectedAmount !== undefined ? o.collectedAmount : o.total), 0);
    const totalDebtRecorded = deliveredOrders
      .filter((o) => o.collectionStatus === 'debt_unpaid' || o.collectionStatus === 'partial')
      .reduce((sum, o) => sum + (o.remainingDebtAmount !== undefined ? o.remainingDebtAmount : o.total), 0);

    return NextResponse.json({
      success: true,
      driver,
      orders: driverOrders,
      stats: {
        totalAssigned: driverOrders.length,
        totalDelivered: deliveredOrders.length,
        totalActive: driverOrders.filter((o) => o.status === 'processing' || o.status === 'shipped').length,
        totalReturned: driverOrders.filter((o) => o.collectionStatus === 'returned' || o.status === 'cancelled').length,
        totalDeliveredRevenue,
        totalCashCollected,
        totalDebtRecorded,
        currentCashInHand: driver.currentCashInHand || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching driver orders:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء جلب سجل طلبيات السائق' }, { status: 500 });
  }
}
