import { NextResponse } from 'next/server';
import { getLuckyWheelSettings, updateLuckyWheelSettings } from '@/lib/db';
import { getAuthenticatedAdmin } from '@/lib/auth';

export async function GET() {
  try {
    // Public read is intentional: the storefront needs the active wheel settings.
    const settings = getLuckyWheelSettings();
    return NextResponse.json({ success: true, settings });
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
    if (admin.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'تعديل إعدادات وجوائز چرخ الحظ محصور بالمدير العام فقط' }, { status: 403 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'بيانات إعدادات چرخ الحظ غير صالحة' }, { status: 400 });
    }

    const updated = updateLuckyWheelSettings(body);
    return NextResponse.json({ success: true, settings: updated, message: 'تم حفظ وتحديث إعدادات وجوائز چرخ الحظ بنجاح! 🎡' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
