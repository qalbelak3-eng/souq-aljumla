import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import { pgGetOffers, pgCreateOffer } from '@/lib/postgres-offers';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const onlyActive = searchParams.get('active') === 'true';
    const productId = searchParams.get('productId') || undefined;

    const offers = await pgGetOffers({
      activeOnly: onlyActive,
      productId,
    });

    return NextResponse.json({ success: true, offers });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. RBAC Authentication & Authorization check (Requirement 5)
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'يجب تسجيل الدخول كمسؤول أولاً' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'offers') && !hasPermission(admin, 'products') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بإدارة العروض الترويجية. يرجى تسجيل الدخول بحساب مسؤول يملك صلاحية العروض.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      productId,
      originalPrice,
      originalWholesalePrice,
      offerPrice,
      offerWholesalePrice,
      badge,
      endDate,
      startDate,
      isActive,
    } = body;

    if (!productId || offerPrice === undefined || !endDate) {
      return NextResponse.json(
        { success: false, error: 'يرجى اختيار الصنف وتحديد سعر العرض وتاريخ الانتهاء' },
        { status: 400 }
      );
    }

    const newOffer = await pgCreateOffer(
      {
        productId,
        originalPrice: originalPrice !== undefined ? Number(originalPrice) : undefined,
        originalWholesalePrice: originalWholesalePrice ? Number(originalWholesalePrice) : undefined,
        offerPrice: Number(offerPrice),
        offerWholesalePrice: offerWholesalePrice ? Number(offerWholesalePrice) : undefined,
        badge: badge?.trim() || 'عرض خاص',
        startDate: startDate || null,
        endDate,
        isActive: isActive ?? true,
      },
      {
        name: admin.name,
        username: admin.username,
        role: admin.role,
      }
    );

    return NextResponse.json({ success: true, offer: newOffer }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
