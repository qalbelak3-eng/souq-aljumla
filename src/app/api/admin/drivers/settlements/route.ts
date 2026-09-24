import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import {
  pgGetAllDriversCustodySummary,
  pgGetDriverSettlementById,
} from '@/lib/postgres-settlements';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/admin/drivers/settlements
 * استعراض ملخص العهد النقدية لجميع السائقين أو جلب تفاصيل تسوية محددة
 */
export async function GET(req: Request) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' },
        { status: 401 }
      );
    }

    if (!hasPermission(admin, 'drivers') && !hasPermission(admin, 'accounting')) {
      return NextResponse.json(
        { success: false, error: 'ليس لديك صلاحية استعراض عهد وتسويات السائقين' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const settlementId = searchParams.get('settlementId');

    if (settlementId) {
      const settlement = await pgGetDriverSettlementById(settlementId);
      if (!settlement) {
        return NextResponse.json(
          { success: false, error: 'التسوية غير موجودة' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, settlement });
    }

    const summaries = await pgGetAllDriversCustodySummary();
    return NextResponse.json({
      success: true,
      summaries,
    });
  } catch (error: any) {
    console.error('Error in driver settlements route:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب ملخص التسويات' },
      { status: 500 }
    );
  }
}
