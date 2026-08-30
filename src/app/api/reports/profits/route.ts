import { NextResponse } from 'next/server';
import { getProfitReport } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const report = getProfitReport(startDate, endDate);
    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في استخراج تقرير الأرباح' },
      { status: 500 }
    );
  }
}
