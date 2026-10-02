import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import { pgGetDatabaseStats, pgResetDatabaseSection } from '@/lib/postgres-reset';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function requireMaster(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return null;
  const staff = await pgGetActiveStaffForSession({ userId: session.userId, username: session.username });
  if (!staff) return null;
  const master = session.role === 'admin' || staff.role === 'admin' || staff.role === 'master' || (staff.permissions || []).includes('*');
  return { staff, forbidden: !master };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireMaster(req);
    if (!access) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    if (access.forbidden) return NextResponse.json({ success: false, error: 'هذه الصفحة محصورة بصلاحيات المدير العام فقط' }, { status: 403 });
    const stats = await pgGetDatabaseStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('GET /api/admin/reset failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل إحصائيات PostgreSQL' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireMaster(req);
    if (!access) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    if (access.forbidden) return NextResponse.json({ success: false, error: 'هذه العملية الحساسة محصورة بصلاحيات المدير العام فقط (Master Admin)' }, { status: 403 });

    const body = await req.json();
    const target = typeof body?.target === 'string' ? body.target.trim() : '';
    if (!target) return NextResponse.json({ success: false, error: 'Target section required' }, { status: 400 });

    const result = await pgResetDatabaseSection(target, access.staff.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/admin/reset failed:', error);
    const message = error instanceof Error ? error.message : '';
    const safe = message === 'قسم التصفير غير معروف';
    return NextResponse.json({ success: false, error: safe ? message : 'تعذر تصفير القسم في PostgreSQL' }, { status: safe ? 400 : 500 });
  }
}
