import { NextResponse } from 'next/server';
import { getVehicles, saveVehicle, getOrders } from '@/lib/db';

export async function GET() {
  try {
    const vehicles = getVehicles();
    const orders = getOrders();

    const vehiclesWithStats = vehicles.map((v) => {
      const activeDeliveries = orders.filter(
        (o) => o.vehicleId === v.id && (o.status === 'processing' || o.status === 'shipped')
      ).length;

      const completedDeliveries = orders.filter(
        (o) => o.vehicleId === v.id && o.status === 'delivered'
      ).length;

      return {
        ...v,
        activeDeliveries,
        completedDeliveries,
      };
    });

    return NextResponse.json({
      success: true,
      vehicles: vehiclesWithStats,
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء جلب قائمة السيارات' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, plateNumber, type, modelYear, notes, isActive } = body;

    if (!name || !plateNumber) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم المركبة ورقم اللوحة' }, { status: 400 });
    }

    const newVehicle = saveVehicle({
      name,
      plateNumber,
      type: type || 'كيا حمل',
      modelYear: modelYear || '',
      notes: notes || '',
      isActive: isActive !== false,
    });

    return NextResponse.json({
      success: true,
      vehicle: newVehicle,
      message: 'تمت إضافة المركبة بنجاح! 🚗',
    });
  } catch (error) {
    console.error('Error creating vehicle:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء إضافة المركبة' }, { status: 500 });
  }
}
