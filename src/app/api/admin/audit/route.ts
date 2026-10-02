import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import { pgGetAuditLogs, pgLogAuditEvent } from '@/lib/postgres-audit';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function requireAuditPermission(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return null;
  const staff = await pgGetActiveStaffForSession({ userId: session.userId, username: session.username });
  if (!staff) return null;
  const permissions = staff.permissions || [];
  const allowed = session.role === 'admin' || staff.role === 'admin' || staff.role === 'master' || permissions.includes('*') || permissions.includes('audit');
  return { session, staff, forbidden: !allowed };
}

export async function GET(request: Request) {
  try {
    const access = await requireAuditPermission(request);
    if (!access) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    if (access.forbidden) return NextResponse.json({ success: false, error: 'ليس لديك صلاحية لعرض سجل التدقيق' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const requestedLimit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 200;
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500) : 200;
    const result = await pgGetAuditLogs({ category: searchParams.get('category') || undefined, actionType: searchParams.get('actionType') || undefined, operator: searchParams.get('operator') || undefined, search: searchParams.get('search') || undefined, dateFrom: searchParams.get('dateFrom') || undefined, dateTo: searchParams.get('dateTo') || undefined, limit });
    return NextResponse.json({ success: true, logs: result.logs, total: result.total });
  } catch (error) {
    console.error('GET /api/admin/audit failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل سجل التدقيق' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAuditPermission(request);
    if (!access) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    if (access.forbidden) return NextResponse.json({ success: false, error: 'ليس لديك صلاحية لإضافة سجل تدقيق' }, { status: 403 });
    const body = await request.json();
    const actionType = typeof body?.actionType === 'string' ? body.actionType.trim() : '';
    if (!actionType) return NextResponse.json({ success: false, error: 'نوع العملية مطلوب' }, { status: 400 });
    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined;
    const entry = await pgLogAuditEvent({ ...body, actionType, staffId: access.staff.id, operatorSnapshot: { id: access.staff.id, name: access.staff.name, username: access.staff.username, role: access.staff.role }, ipAddress });
    return NextResponse.json({ success: true, log: entry });
  } catch (error) {
    console.error('POST /api/admin/audit failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر إضافة سجل التدقيق' }, { status: 500 });
  }
}
