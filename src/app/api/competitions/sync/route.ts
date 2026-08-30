import { NextResponse } from 'next/server';
import { getLeaderboardFromOrders } from '@/lib/db';

export async function GET() {
  try {
    const data = getLeaderboardFromOrders();
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
