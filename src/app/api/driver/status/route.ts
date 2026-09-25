import { NextResponse } from 'next/server';
import { getAuthenticatedDriver } from '@/lib/auth';
import { pgGetDriverById, pgUpdateDriverOperationalStatus } from '@/lib/postgres-drivers';
import { DriverBaseStatus } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/driver/status
 * استعلام السائق عن حالته التشغيلية الحالية والحالة الفعلية المحتسبة
 */
export async function GET(req: Request) {
  try {
    const driver = await getAuthenticatedDriver(req);
    if (!driver) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (جلسة السائق غير مسجلة أو معطلة)' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const queryDriverId = searchParams.get('driverId');
    if (queryDriverId && queryDriverId !== driver.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك باستعراض حالة سائق آخر' },
        { status: 403 }
      );
    }

    const driverProfile = await pgGetDriverById(driver.id);
    if (!driverProfile) {
      return NextResponse.json(
        { success: false, error: 'تعذر جلب بيانات السائق' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      driverId: driverProfile.id,
      name: driverProfile.name,
      operationalStatus: driverProfile.operationalStatus,
      effectiveStatus: driverProfile.effectiveStatus,
      activeDeliveries: driverProfile.activeDeliveries,
    });
  } catch (error: any) {
    console.error('Error fetching driver operational status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب الحالة التشغيلية' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/driver/status
 * تحديث السائق لحالته التشغيلية حصراً من جلسته الحالية Server-Side
 * الحالات المقبولة: 'available' | 'break' | 'off_duty'
 */
export async function PUT(req: Request) {
  try {
    const driver = await getAuthenticatedDriver(req);
    if (!driver) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (جلسة السائق غير مسجلة أو معطلة)' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetStatus = String(body.status || body.operationalStatus || '').toLowerCase().trim();

    // فحص عزل هوية السائق: إذا أرسل العميل معرفاً صريحاً في الـ body يجب أن يطابق جلسته حصراً
    if (body.driverId && String(body.driverId).trim() !== driver.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بتغيير حالة سائق آخر' },
        { status: 403 }
      );
    }

    // منع اختيار busy يدوياً
    if (targetStatus === 'busy') {
      return NextResponse.json(
        { success: false, error: 'حالة الانشغال (busy) تشغيلية تلقائية ولا يمكن اختيارها يدوياً' },
        { status: 400 }
      );
    }

    if (!['available', 'break', 'off_duty'].includes(targetStatus)) {
      return NextResponse.json(
        { success: false, error: 'يرجى اختيار حالة تشغيلية صحيحة (متاح، استراحة، إنهاء الدوام)' },
        { status: 400 }
      );
    }

    const updated = await pgUpdateDriverOperationalStatus({
      driverId: driver.id,
      operationalStatus: targetStatus as DriverBaseStatus,
      operator: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        role: 'driver',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'تم تحديث الحالة التشغيلية بنجاح',
      driverId: updated.id,
      operationalStatus: updated.operationalStatus,
      effectiveStatus: updated.effectiveStatus,
      activeDeliveries: updated.activeDeliveries,
    });
  } catch (error: any) {
    console.error('Error updating driver operational status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء تحديث الحالة التشغيلية' },
      { status: 400 }
    );
  }
}
