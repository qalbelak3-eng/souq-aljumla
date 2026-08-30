import { NextResponse } from 'next/server';
import { getAuditLogs, logAuditEvent } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const actionType = searchParams.get('actionType') || undefined;
    const operator = searchParams.get('operator') || undefined;
    const search = searchParams.get('search') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 200;

    const result = getAuditLogs({
      category,
      actionType,
      operator,
      search,
      dateFrom,
      dateTo,
      limit,
    });

    return NextResponse.json({ success: true, logs: result.logs, total: result.total });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entry = logAuditEvent(body);
    return NextResponse.json({ success: true, log: entry });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
