import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseStats, resetDatabaseSection } from '@/lib/db';

export async function GET() {
  try {
    const stats = getDatabaseStats();
    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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
