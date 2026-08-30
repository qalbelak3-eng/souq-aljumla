import { NextResponse } from 'next/server';
import { getDrivers, saveDriver, getOrders } from '@/lib/db';

export async function GET() {
  try {
    const drivers = getDrivers();
    const orders = getOrders();

    const driversWithStats = drivers.map((d) => {
      const driverOrders = orders.filter((o) => o.driverId === d.id);
      const activeDeliveries = driverOrders.filter((o) => o.status === 'processing' || o.status === 'shipped').length;
      const completedDeliveries = driverOrders.filter((o) => o.status === 'delivered').length;
      const totalDeliveredRevenue = driverOrders
        .filter((o) => o.status === 'delivered')
        .reduce((sum, o) => sum + o.total, 0);

      return {
        ...d,
        activeDeliveries,
        completedDeliveries,
        totalDeliveredRevenue,
      };
    });

    return NextResponse.json({
      success: true,
      drivers: driversWithStats,
    });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء جلب قائمة السائقين' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, phone, password, vehicleInfo, notes } = body;

    if (!name || !phone) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم السائق ورقم الهاتف' }, { status: 400 });
    }

    const newDriver = saveDriver({
      name,
      phone,
      password: password || '123',
      vehicleInfo: vehicleInfo || '',
      notes: notes || '',
      isActive: true,
      currentCashInHand: 0,
    });

    return NextResponse.json({
      success: true,
      driver: newDriver,
      message: 'تم إضافة السائق بنجاح',
    });
  } catch (error) {
    console.error('Error creating driver:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء إضافة السائق' }, { status: 500 });
  }
}
