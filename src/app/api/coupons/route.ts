import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import {
  pgGetCoupons,
  pgCreateCoupon,
  pgUpdateCoupon,
  pgDeleteCoupon,
} from '@/lib/postgres-coupons';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type AuthResult =
  | { authorized: true; admin: NonNullable<ReturnType<typeof getAuthenticatedAdmin>> }
  | { authorized: false; response: NextResponse };

function checkAdminAuth(request: Request): AuthResult {
  const admin = getAuthenticatedAdmin(request);
  if (!admin) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: 'غير مصرح: يرجى تسجيل الدخول كمدير نظام' },
        { status: 401 }
      ),
    };
  }

  if (!hasPermission(admin, 'offers') && !hasPermission(admin, 'settings')) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: 'غير مصرح: تتطلب هذه العملية صلاحيات إدارة العروض أو الإعدادات' },
        { status: 403 }
      ),
    };
  }

  return { authorized: true, admin };
}

export async function GET(request: Request) {
  try {
    const authCheck = checkAdminAuth(request);
    if (!authCheck.authorized) return authCheck.response;

    const coupons = await pgGetCoupons();
    return NextResponse.json({ success: true, coupons });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authCheck = checkAdminAuth(request);
    if (!authCheck.authorized) return authCheck.response;

    const body = await request.json();
    if (!body.code || !body.discountType || body.discountValue === undefined) {
      return NextResponse.json({ success: false, error: 'يرجى كتابة كود الخصم ونوع الخصم وقيمته' }, { status: 400 });
    }

    const admin = authCheck.admin;
    const newCoupon = await pgCreateCoupon(body, {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      role: admin.role,
    });

    return NextResponse.json({ success: true, coupon: newCoupon });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const authCheck = checkAdminAuth(request);
    if (!authCheck.authorized) return authCheck.response;

    const body = await request.json();
    const { id, code, ...updates } = body;
    const identifier = id || code;

    if (!identifier) {
      return NextResponse.json({ success: false, error: 'يرجى تحديد الكوبون المراد تعديله' }, { status: 400 });
    }

    const admin = authCheck.admin;
    const updated = await pgUpdateCoupon(identifier, updates, {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      role: admin.role,
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: 'الكوبون غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ success: true, coupon: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authCheck = checkAdminAuth(request);
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const code = searchParams.get('code');
    const identifier = id || code;

    if (!identifier) {
      return NextResponse.json({ success: false, error: 'يرجى تحديد الكوبون المراد حذفه' }, { status: 400 });
    }

    const admin = authCheck.admin;
    const deleted = await pgDeleteCoupon(identifier, {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      role: admin.role,
    });

    return NextResponse.json({ success: deleted });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
