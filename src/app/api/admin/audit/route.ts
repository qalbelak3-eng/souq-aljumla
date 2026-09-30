import { NextResponse } from 'next/server';
import { getAuditLogs, logAuditEvent } from '@/lib/db';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }
    if (!hasPermission(admin, 'audit')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية لعرض سجل التدقيق' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const actionType = searchParams.get('actionType') || undefined;
    const operator = searchParams.get('operator') || undefined;
    const search = searchParams.get('search') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const requestedLimit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 200;
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500) : 200;

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
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }
    if (!hasPermission(admin, 'audit')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية لإضافة سجل تدقيق' }, { status: 403 });
    }

    const body = await request.json();
    const entry = logAuditEvent({
      ...body,
      operatorId: admin.id,
      operatorName: admin.name,
      operatorUsername: admin.username,
      operatorRole: admin.role,
    });
    return NextResponse.json({ success: true, log: entry });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
