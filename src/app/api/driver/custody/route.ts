import { NextResponse } from 'next/server';
import { getAuthenticatedDriver } from '@/lib/auth';
import { pgGetDriverCustody } from '@/lib/postgres-settlements';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/driver/custody
 * يستعرض السائق عهدته النقدية الحالية فقط:
 * - النقد المحصل
 * - النقد المسلّم للإدارة
 * - المتبقي في عهدته حالياً
 * - سجل تسوياته السابقة
 *
 * مع أمان مشدد: الهوية تستخرج حصراً من جلسة السائق Server-side ولا يمكن للسائق تزوير المعرف.
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

    // Object-level isolation: If driver sends query ?driverId=..., enforce that it matches their own ID
    const { searchParams } = new URL(req.url);
    const queryDriverId = searchParams.get('driverId');
    if (queryDriverId && queryDriverId !== driver.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك باستعراض عهدة سائق آخر' },
        { status: 403 }
      );
    }

    const custody = await pgGetDriverCustody(driver.id);
    if (!custody) {
      return NextResponse.json(
        { success: false, error: 'تعذر جلب بيانات عهدة السائق' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      custody: {
        totalCollectedCash: custody.totalCollectedCash,
        totalSettledCash: custody.totalSettledCash,
        currentCashInHand: custody.currentCashInHand,
        unsettledOrdersCount: custody.unsettledOrders.length,
        unsettledOrders: custody.unsettledOrders,
        recentSettlements: custody.recentSettlements,
      },
    });
  } catch (error: any) {
    console.error('Error fetching driver custody:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب العهدة النقدية' },
      { status: 500 }
    );
  }
}
