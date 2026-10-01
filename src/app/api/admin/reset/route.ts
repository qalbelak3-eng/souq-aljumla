import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseStats, resetDatabaseSection } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function requireActiveAdmin(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return null;

  const staff = await pgGetActiveStaffForSession({
    userId: session.userId,
    username: session.username,
  });
  if (!staff) return null;

  return {
    ...staff,
    role: session.role === 'admin' ? 'admin' as const : 'staff' as const,
  };
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireActiveAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }

    const stats = getDatabaseStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('GET /api/admin/reset failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل إحصائيات قاعدة البيانات' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireActiveAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }

    // تصفير أقسام النظام وقاعدة البيانات محصور حصراً بالمدير العام الماستر (Master Admin)
    if (admin.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'هذه العملية الحساسة محصورة بصلاحيات المدير العام فقط (Master Admin)' }, { status: 403 });
    }

    const body = await req.json();
    const target = typeof body?.target === 'string' ? body.target.trim() : '';
    if (!target) {
      return NextResponse.json({ success: false, error: 'القسم المطلوب للتصفير غير صالح' }, { status: 400 });
    }

    const result = resetDatabaseSection(target);
    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/admin/reset failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تنفيذ عملية التصفير' }, { status: 500 });
  }
}
