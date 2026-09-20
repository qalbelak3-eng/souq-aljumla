import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseStats, resetDatabaseSection } from '@/lib/db';
import { getAuthenticatedAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }

    const stats = getDatabaseStats();
    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }

    // تصفير أقسام النظام وقاعدة البيانات محصور حصراً بالمدير العام الماستر (Master Admin)
    if (admin.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'هذه العملية الحساسة محصورة بصلاحيات المدير العام فقط (Master Admin)' }, { status: 403 });
    }

    const body = await req.json();
    const { target } = body;

    if (!target) {
      return NextResponse.json({ success: false, error: 'Target section required' }, { status: 400 });
    }

    const result = resetDatabaseSection(target);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
