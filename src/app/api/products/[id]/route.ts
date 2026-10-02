import { NextResponse } from 'next/server';
import { pgGetProductById, pgUpdateProduct, pgDeleteProduct } from '@/lib/postgres-catalog';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const product = await pgGetProductById(params.id);
    if (!product) {
      return NextResponse.json({ success: false, error: 'المنتج غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, product });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    // 1. RBAC Authentication & Authorization check
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'products') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بتعديل أو إدارة المنتجات والأسعار' },
        { status: 403 }
      );
    }

    const body = await request.json();
    // Strictly FORBID trusting operator, role, or username coming from client request body
    const { allowBelowCostOverride, overrideReason, operator: _ignoredOperator, ...updates } = body;

    // Trusted server-side operator identity derived strictly from authenticated session
    const trustedOperator = {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      role: admin.role,
      permissions: admin.permissions,
    };

    const updated = await pgUpdateProduct(params.id, updates, {
      allowBelowCostOverride: Boolean(allowBelowCostOverride),
      overrideReason,
      operator: trustedOperator,
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: 'المنتج غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, product: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    // 1. RBAC Authentication & Authorization check
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'products') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بحذف المنتجات' },
        { status: 403 }
      );
    }

    const trustedOperator = {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      role: admin.role,
      permissions: admin.permissions,
    };

    const result = await pgDeleteProduct(params.id, trustedOperator);
    if (!result.success) {
      return NextResponse.json({ success: false, error: 'تعذر حذف المنتج' }, { status: 404 });
    }
    const message = result.action === 'archived'
      ? 'تمت أرشفة المنتج وتعطيله بنجاح لوجود سجل مبيعات مرتبط به'
      : 'تم حذف المنتج نهائياً بنجاح';
    return NextResponse.json({ success: true, action: result.action, message });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
