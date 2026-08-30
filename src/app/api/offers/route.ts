import { NextResponse } from 'next/server';
import { getOffers, createOffer } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const onlyActive = searchParams.get('active') === 'true';
    const offers = getOffers(onlyActive);
    return NextResponse.json({ success: true, offers });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      productId,
      productName,
      productImage,
      category,
      company,
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

    const newOffer = createOffer({
      productId,
      productName: productName || 'صنف',
      productImage: productImage || '',
      category: category || '',
      company: company || '',
      originalPrice: Number(originalPrice) || 0,
      originalWholesalePrice: originalWholesalePrice ? Number(originalWholesalePrice) : undefined,
      offerPrice: Number(offerPrice),
      offerWholesalePrice: offerWholesalePrice ? Number(offerWholesalePrice) : undefined,
      badge: badge?.trim() || '🔥 عرض خاص',
      startDate: startDate || new Date().toISOString(),
      endDate: endDate,
      isActive: isActive ?? true,
    });

    return NextResponse.json({ success: true, offer: newOffer }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
