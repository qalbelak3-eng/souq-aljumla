import { NextResponse } from 'next/server';
import { settleDriverCash } from '@/lib/db';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'drivers') && !hasPermission(admin, 'accounting')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية تصفية عهدة السائقين' }, { status: 403 });
    }

    let customAmount: number | undefined;
    let notes: string | undefined;
    let orderAdjustments: Record<string, { collectedAmount: number; collectionStatus?: any }> | undefined;

    try {
      const body = await req.json();
      if (body.customAmount !== undefined && body.customAmount !== '') {
        customAmount = Number(body.customAmount);
      }
      if (body.notes) {
        notes = body.notes;
      }
      if (body.orderAdjustments) {
        orderAdjustments = body.orderAdjustments;
      }
    } catch (e) {
      // Body might be empty
    }

    const { driver, settledAmount, createdReceiptsCount } = settleDriverCash(params.id, {
      customAmount,
      notes,
      orderAdjustments,
    });

    if (!driver) {
      return NextResponse.json({ success: false, error: 'السائق غير موجود' }, { status: 404 });
    }

    const receiptsText = createdReceiptsCount > 0 ? ` وتم إنشاء (${createdReceiptsCount}) سند قبض وخصمها من حسابات الزبائن والتجار` : '';

    return NextResponse.json({
      success: true,
      driver,
      settledAmount,
      createdReceiptsCount,
      message: `تم تصفية واستلام العهدة النقدية بمبلغ (${settledAmount.toLocaleString()} د.ع) بنجاح${receiptsText}! ✅`,
    });
  } catch (error) {
    console.error('Error settling driver cash:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء تصفية العهدة النقدية' }, { status: 500 });
  }
}
