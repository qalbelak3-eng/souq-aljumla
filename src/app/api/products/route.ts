import { NextResponse } from 'next/server';
import { getDomainDataSource } from '@/db/client';
import { getProducts, createProduct, getCategories } from '@/lib/db';
import { pgGetProducts, pgCreateProduct, pgGetCategories } from '@/lib/postgres-catalog';
import { auditAllProductsPricing } from '@/lib/pricing';

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
    const body = await request.json();
    const { allowBelowCostOverride, overrideReason, operator, ...productData } = body;
    const usePg = getDomainDataSource('CATALOG_BASE') === 'postgres';
    const newProduct = usePg
      ? await pgCreateProduct(productData, { allowBelowCostOverride, overrideReason, operator })
      : createProduct(productData);
    return NextResponse.json({ success: true, product: newProduct }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

