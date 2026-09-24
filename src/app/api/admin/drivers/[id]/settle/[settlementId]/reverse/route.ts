import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import { pgReverseDriverSettlement } from '@/lib/postgres-settlements';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/admin/drivers/[id]/settle/[settlementId]/reverse
 * عكس تسوية عهدة نقدية معتمدة واستعادة العهدة النقدية وحركة الصندوق ذرياً
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string; settlementId: string } }
) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' },
        { status: 401 }
      );
    }

    // Only authorized accounting staff/admin can execute formal financial reversals
    if (!hasPermission(admin, 'accounting')) {
      return NextResponse.json(
        { success: false, error: 'ليس لديك صلاحية عكس التسويات المالية (صلاحية المحاسبة مطلوبة)' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason || '').trim();

    if (!reason) {
      return NextResponse.json(
        { success: false, error: 'يرجى كتابة سبب رسمي واضح لعكس هذه التسوية' },
        { status: 400 }
      );
    }

    const adminOperator = {
      userId: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
    };

    const result = await pgReverseDriverSettlement(
      params.settlementId,
      { reason },
      adminOperator
    );

    return NextResponse.json({
      success: true,
      originalSettlement: result.originalSettlement,
      reversalSettlement: result.reversalSettlement,
      revertedAmount: result.revertedAmount,
      newCustodyBalance: result.newCustodyBalance,
      message: `تم عكس التسوية ${result.originalSettlement.settlementNumber} بنجاح وإعادة مبلغ (${result.revertedAmount.toLocaleString()} د.ع) إلى عهدة السائق! 🔄`,
    });
  } catch (error: any) {
    console.error('Error reversing driver settlement:', error);
    const message = error.message || 'حدث خطأ أثناء عكس التسوية';
    const status = message.includes('مسبقاً') || message.includes('غير موجود') || message.includes('مطلوب')
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
