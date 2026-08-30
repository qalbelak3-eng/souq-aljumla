import { NextResponse } from 'next/server';
import { updateOffer, deleteOffer, getOfferById } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const offer = getOfferById(params.id);
    if (!offer) {
      return NextResponse.json({ success: false, error: 'العرض غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, offer });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updated = updateOffer(params.id, body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'العرض غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, offer: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = deleteOffer(params.id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'تعذر حذف العرض' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'تم حذف العرض بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
