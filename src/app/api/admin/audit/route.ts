import { NextResponse } from 'next/server';
import { getAuditLogs, logAuditEvent } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';

async function requireAuditAccess(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return null;

  const staff = await pgGetActiveStaffForSession({
    userId: session.userId,
    username: session.username,
  });
  if (!staff) return null;

  const permissions = staff.permissions || [];
  const allowed =
    session.role === 'admin' ||
    permissions.includes('*') ||
    permissions.includes('accounting') ||
    permissions.includes('audit');

  return { staff, forbidden: !allowed };
}

export async function GET(request: Request) {
  try {
    const access = await requireAuditAccess(request);
    if (!access) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }
    if (access.forbidden) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية استعراض سجل التدقيق' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const actionType = searchParams.get('actionType') || undefined;
    const operator = searchParams.get('operator') || undefined;
    const search = searchParams.get('search') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const requestedLimit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 200;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
      : 200;

    const result = getAuditLogs({ category, actionType, operator, search, dateFrom, dateTo, limit });
    return NextResponse.json({ success: true, logs: result.logs, total: result.total });
  } catch (error) {
    console.error('GET /api/admin/audit failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل سجل التدقيق' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAuditAccess(request);
    if (!access) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }
    if (access.forbidden) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إنشاء سجل تدقيق' }, { status: 403 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'بيانات سجل التدقيق غير صالحة' }, { status: 400 });
    }

    const entry = logAuditEvent(body);
    return NextResponse.json({ success: true, log: entry });
  } catch (error) {
    console.error('POST /api/admin/audit failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر إنشاء سجل التدقيق' }, { status: 500 });
  }
}
