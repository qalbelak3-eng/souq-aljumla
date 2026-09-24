import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import {
  pgGetDriverCustody,
  pgCreateDriverSettlement,
} from '@/lib/postgres-settlements';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/admin/drivers/[id]/settle
 * جلب تفاصيل العهدة النقدية للسائق والطلبات غير المصفاة وتاريخ التسويات
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
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
        { success: false, error: 'ليس لديك صلاحية استعراض عهدة السائقين المالية' },
        { status: 403 }
      );
    }

    const custody = await pgGetDriverCustody(params.id);
    if (!custody) {
      return NextResponse.json(
        { success: false, error: 'السائق المحدد غير موجود' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      custody,
    });
  } catch (error: any) {
    console.error('Error fetching driver custody:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب عهدة السائق' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/drivers/[id]/settle
 * تسجيل تسوية نقدية (كاملة أو جزئية) داخل معاملة ذرية وتوزيعها FIFO
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    // 1. Authenticate admin Server-Side
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' },
        { status: 401 }
      );
    }

    // 2. Strict permission check
    if (!hasPermission(admin, 'drivers') && !hasPermission(admin, 'accounting')) {
      return NextResponse.json(
        { success: false, error: 'ليس لديك صلاحية تصفية واستلام العهدة النقدية للسائقين' },
        { status: 403 }
      );
    }

    // 3. Extract amount and notes (Never trust operator/staff identity from body!)
    const body = await req.json().catch(() => ({}));
    const rawAmount = body.amount !== undefined ? body.amount : body.customAmount;
    const amount = Number(rawAmount);

    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ التسوية يجب أن يكون رقماً موجباً أكبر من صفر' },
        { status: 400 }
      );
    }

    const adminOperator = {
      userId: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
    };

    // 4. Execute atomic settlement in PostgreSQL
    const result = await pgCreateDriverSettlement(
      params.id,
      {
        amount,
        notes: body.notes,
      },
      adminOperator
    );

    return NextResponse.json({
      success: true,
      settlement: result.settlement,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      allocations: result.allocations,
      message: `تم تسجيل التسوية واستلام مبلغ (${amount.toLocaleString()} د.ع) بنجاح برقم ${result.settlement.settlementNumber}! ✅`,
    });
  } catch (error: any) {
    console.error('Error creating driver settlement:', error);
    const message = error.message || 'حدث خطأ أثناء تسجيل التسوية النقدية';
    const status = message.includes('أكبر من العهدة') || message.includes('غير موجود') || message.includes('موجباً')
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
