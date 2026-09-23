import { NextResponse } from 'next/server';
import { pgGetCustomerStatement } from '@/lib/postgres-accounting';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'accounting')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية الاطلاع على كشف الحساب' }, { status: 403 });
    }

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

    const statement = await pgGetCustomerStatement(identifier.trim(), startDate, endDate);

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
