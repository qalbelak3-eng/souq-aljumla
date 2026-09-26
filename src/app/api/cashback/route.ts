import { NextResponse } from 'next/server';
import { getAuthenticatedCustomer, getAuthenticatedAdmin } from '@/lib/auth';
import { pgGetCustomerCashbackSummary, pgResolveCustomerAccount } from '@/lib/postgres-cashback';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryPhone = searchParams.get('phone');
    const queryAccountId = searchParams.get('accountId');

    const customerSession = getAuthenticatedCustomer(request);
    const admin = getAuthenticatedAdmin(request);

    // If neither customer nor admin is logged in, return 0 balance for guest
    if (!customerSession && !admin) {
      // If a guest requests without authentication, do not leak another customer's balance
      return NextResponse.json({
        success: true,
        authenticated: false,
        availableBalance: 0,
        pendingCashback: 0,
        totalEarned: 0,
        totalRedeemed: 0,
        totalReversed: 0,
        accountId: null,
        history: [],
      });
    }

    let targetUserId = customerSession?.id;
    let targetPhone = customerSession?.phone;
    let targetAccountId = queryAccountId || undefined;

    // Admin can inspect any customer's cashback via phone or accountId
    if (admin) {
      if (queryPhone) targetPhone = queryPhone;
      if (queryAccountId) targetAccountId = queryAccountId;
    }

    const summary = await pgGetCustomerCashbackSummary({
      accountId: targetAccountId,
      userId: targetUserId,
      phone: targetPhone,
    });

    return NextResponse.json({
      success: true,
      authenticated: true,
      ...summary,
    });
  } catch (error: any) {
    console.error('Error fetching cashback summary:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء جلب رصيد الأرباح' },
      { status: 500 }
    );
  }
}
