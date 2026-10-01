import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { pgGetActiveStaffForSession } from '@/lib/postgres-session-auth';
import { pgConfirmWarehouseReturnReceipt } from '@/lib/postgres-delivery';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function requireOrdersPermission(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return null;

  const staff = await pgGetActiveStaffForSession({
    userId: session.userId,
    username: session.username,
  });
  if (!staff) return null;

  const permissions = staff.permissions || [];
  const allowed =
    session.role === 'admin' ||
    permissions.includes('*') ||
    permissions.includes('orders');

  return { session, staff, forbidden: !allowed };
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const access = await requireOrdersPermission(request);
    if (!access) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' },
        { status: 401 }
      );
    }
    if (access.forbidden) {
      return NextResponse.json(
        { success: false, error: 'ليس لديك صلاحية إدارة المستودع والطلبات' },
        { status: 403 }
      );
    }

    const operator = {
      id: access.staff.id,
      name: access.staff.name,
      username: access.staff.username,
      role: access.session.role === 'admin' ? 'admin' : 'staff',
    };

    let notes: string | undefined;
    try {
      const body = await request.json();
      const rawNotes = body?.notes ?? body?.reason;
      if (typeof rawNotes === 'string' && rawNotes.trim()) {
        notes = rawNotes.trim().slice(0, 1000);
      }
    } catch {
      // Body is optional.
    }

    const orderId = typeof params?.id === 'string' ? params.id.trim() : '';
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'رقم الطلب غير صالح' }, { status: 400 });
    }

    const order = await pgConfirmWarehouseReturnReceipt(orderId, operator, { notes });

    return NextResponse.json({
      success: true,
      order,
      message: 'تم فحص واستلام البضاعة في المستودع وإعادة المخزون بنجاح 📦✓',
    });
  } catch (error) {
    console.error('Error confirming warehouse return receipt:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء استلام البضاعة بالمستودع' },
      { status: 500 }
    );
  }
}
