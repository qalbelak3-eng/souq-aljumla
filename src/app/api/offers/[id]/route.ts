import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import { pgGetOfferById, pgUpdateOffer, pgDeleteOffer } from '@/lib/postgres-offers';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const offer = await pgGetOfferById(params.id);
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
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' }, { status: 401 });
    }
    if (!hasPermission(admin, 'offers') && !hasPermission(admin, 'products') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بتعديل العروض الترويجية' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updated = await pgUpdateOffer(
      params.id,
      body,
      {
        name: admin.name,
        username: admin.username,
        role: admin.role,
      }
    );

    return NextResponse.json({ success: true, offer: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' }, { status: 401 });
    }
    if (!hasPermission(admin, 'offers') && !hasPermission(admin, 'products') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بحذف أو أرشفة العروض الترويجية' },
        { status: 403 }
      );
    }

    const result = await pgDeleteOffer(params.id, {
      name: admin.name,
      username: admin.username,
      role: admin.role,
    });

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      archived: result.archived,
      message: result.message,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
