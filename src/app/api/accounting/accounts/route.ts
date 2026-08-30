import { NextResponse } from 'next/server';
import { getAllCustomerAccounts } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const accounts = getAllCustomerAccounts();
    return NextResponse.json({
      success: true,
      accounts,
      totalCount: accounts.length,
      totalMarketDebt: accounts.reduce((sum, a) => sum + Math.max(0, a.remainingBalance), 0),
      totalMarketInvoiced: accounts.reduce((sum, a) => sum + a.totalInvoiced, 0),
      totalMarketPaid: accounts.reduce((sum, a) => sum + a.totalPaid, 0),
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في جلب بيانات الحسابات' },
      { status: 500 }
    );
  }
}
