import { NextResponse } from 'next/server';
import { getDailyReconciliationReport } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;

    const report = getDailyReconciliationReport(date);
    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب تقرير المطابقة اليومية' },
      { status: 500 }
    );
  }
}
