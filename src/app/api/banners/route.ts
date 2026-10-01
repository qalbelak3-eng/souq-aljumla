import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { pgGetBanners, pgCreateBanner, pgUpdateBanner, pgDeleteBanner } from '@/lib/postgres-banners';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function requireBannerAdmin(request: Request) {
  const admin = getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' }, { status: 401 });
  }
  if (!hasPermission(admin, 'banners') && admin.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'غير مصرح لك بإدارة البنرات' }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wantsAll = searchParams.get('all') === 'true';
    const position = searchParams.get('position') || undefined;
    const category = searchParams.get('category') || undefined;

    if (wantsAll) {
      const authError = requireBannerAdmin(request);
      if (authError) return authError;
    }

    const banners = await pgGetBanners(!wantsAll, position, category);
    return NextResponse.json({ success: true, banners });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireBannerAdmin(request);
    if (authError) return authError;

    const body = await request.json();
    const newBanner = await pgCreateBanner(body);
    try { revalidatePath('/'); } catch (e) {}
    return NextResponse.json({ success: true, banner: newBanner }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authError = requireBannerAdmin(request);
    if (authError) return authError;

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }
    const updated = await pgUpdateBanner(id, updates);
    try { revalidatePath('/'); } catch (e) {}
    return NextResponse.json({ success: true, banner: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authError = requireBannerAdmin(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }
    const deleted = await pgDeleteBanner(id);
    try { revalidatePath('/'); } catch (e) {}
    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
