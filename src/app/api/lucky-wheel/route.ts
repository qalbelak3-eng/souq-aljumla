import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/lib/auth';
import { pgGetLuckyWheelSettings, pgUpdateLuckyWheelSettings } from '@/lib/postgres-lucky-wheel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Public read is intentional: the storefront needs the active wheel settings.
    const settings = await pgGetLuckyWheelSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('GET /api/lucky-wheel failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل إعدادات چرخ الحظ' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }
    if (admin.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'تعديل إعدادات وجوائز چرخ الحظ محصور بالمدير العام فقط' }, { status: 403 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'بيانات إعدادات چرخ الحظ غير صالحة' }, { status: 400 });
    }

    const updated = await pgUpdateLuckyWheelSettings(body);
    return NextResponse.json({ success: true, settings: updated, message: 'تم حفظ وتحديث إعدادات وجوائز چرخ الحظ بنجاح! 🎡' });
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'INVALID_SETTINGS' || code === 'INVALID_PRIZES' || code === 'TOO_MANY_PRIZES' || code.startsWith('INVALID_PRIZE_') || code.startsWith('INVALID_PROBABILITY_')) {
      return NextResponse.json({ success: false, error: 'بيانات إعدادات أو جوائز چرخ الحظ غير صالحة' }, { status: 400 });
    }
    if (code === 'INVALID_PROBABILITY_TOTAL') {
      return NextResponse.json({ success: false, error: 'يجب أن يكون مجموع احتمالات الجوائز 100%' }, { status: 400 });
    }

    console.error('POST /api/lucky-wheel failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر حفظ إعدادات چرخ الحظ' }, { status: 500 });
  }
}
