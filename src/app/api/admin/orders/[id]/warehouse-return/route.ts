import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import { pgConfirmWarehouseReturnReceipt } from '@/lib/postgres-delivery';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Enforce admin authentication & 'orders' permission
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'orders')) {
      return NextResponse.json(
        { success: false, error: 'ليس لديك صلاحية إدارة المستودع والطلبات' },
        { status: 403 }
      );
    }

    const operator = {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      role: admin.role,
    };

    let notes: string | undefined = undefined;
    try {
      const body = await request.json();
      notes = body.notes || body.reason;
    } catch {
      // Body is optional
    }

    const order = await pgConfirmWarehouseReturnReceipt(params.id, operator, { notes });

    return NextResponse.json({
      success: true,
      order,
      message: 'تم فحص واستلام البضاعة في المستودع وإعادة المخزون بنجاح 📦✓',
    });
  } catch (error: any) {
    console.error('Error confirming warehouse return receipt:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء استلام البضاعة بالمستودع' },
      { status: 400 }
    );
  }
}
