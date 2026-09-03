import { NextResponse } from 'next/server';
import { settleDriverCash } from '@/lib/db';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
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
