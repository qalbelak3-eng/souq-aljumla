import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getBanners, createBanner, updateBanner, deleteBanner } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === 'true';
    const position = searchParams.get('position') || undefined;
    const category = searchParams.get('category') || undefined;
    const banners = getBanners(!all, position, category);
    return NextResponse.json({ success: true, banners });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newBanner = createBanner(body);
    try { revalidatePath('/'); } catch (e) {}
    return NextResponse.json({ success: true, banner: newBanner }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }
    const updated = updateBanner(id, updates);
    try { revalidatePath('/'); } catch (e) {}
    return NextResponse.json({ success: true, banner: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }
    const deleted = deleteBanner(id);
    try { revalidatePath('/'); } catch (e) {}
    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
