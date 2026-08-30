import { NextResponse } from 'next/server';
import { getCustomerStatement } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const identifier = searchParams.get('phone') || searchParams.get('identifier') || searchParams.get('email');
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    if (!identifier || !identifier.trim()) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال رقم الهاتف أو البريد الإلكتروني للبحث عن كشف الحساب' },
        { status: 400 }
      );
    }

    const statement = getCustomerStatement(identifier.trim(), startDate, endDate);

    if (!statement) {
      return NextResponse.json(
        {
          success: false,
          error: 'لم يتم العثور على أي حركات أو فواتير مسجلة لهذا الرقم',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      statement,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في جلب كشف الحساب' },
      { status: 500 }
    );
  }
}
