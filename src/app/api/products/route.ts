import { NextResponse } from 'next/server';
import { getDomainDataSource } from '@/db/client';
import { getProducts, createProduct, getCategories } from '@/lib/db';
import { pgGetProducts, pgCreateProduct, pgGetCategories } from '@/lib/postgres-catalog';
import { auditAllProductsPricing } from '@/lib/pricing';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const query = searchParams.get('query') || undefined;
    const featured = searchParams.get('featured') === 'true';
    const audit = searchParams.get('audit') === 'true';

    const usePg = getDomainDataSource('CATALOG_BASE') === 'postgres';
    const products = usePg
      ? await pgGetProducts({ category, query, featured })
      : getProducts({ category, query, featured });
    const categories = usePg
      ? await pgGetCategories()
      : getCategories();

    const auditReport = audit ? auditAllProductsPricing(products) : undefined;

    return NextResponse.json({ success: true, products, categories, auditReport });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. RBAC Authentication & Authorization check
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'products') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بإضافة أو إدارة المنتجات والأسعار' },
        { status: 403 }
      );
    }

    const body = await request.json();
    // Strictly FORBID trusting operator, role, or username coming from client request body
    const { allowBelowCostOverride, overrideReason, operator: _ignoredOperator, ...productData } = body;

    // Trusted server-side operator identity derived strictly from authenticated session
    const trustedOperator = {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      role: admin.role,
      permissions: admin.permissions,
    };

    const usePg = getDomainDataSource('CATALOG_BASE') === 'postgres';
    const newProduct = usePg
      ? await pgCreateProduct(productData, {
          allowBelowCostOverride: Boolean(allowBelowCostOverride),
          overrideReason,
          operator: trustedOperator,
        })
      : createProduct(productData);

    return NextResponse.json({ success: true, product: newProduct }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

