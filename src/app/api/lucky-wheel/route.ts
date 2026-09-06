import { NextResponse } from 'next/server';
import { getLuckyWheelSettings, updateLuckyWheelSettings } from '@/lib/db';

export async function GET() {
  try {
    const settings = getLuckyWheelSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const updated = updateLuckyWheelSettings(body);
    return NextResponse.json({ success: true, settings: updated, message: 'تم حفظ وتحديث إعدادات وجوائز چرخ الحظ بنجاح! 🎡' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
