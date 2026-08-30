import { NextResponse } from 'next/server';
import { getMerchants, updateMerchantStatus, updateMerchantTier, updateUserAccountType } from '@/lib/db';
import { MerchantStatus, MerchantTier, AccountType } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as MerchantStatus | null;
    const type = searchParams.get('type') as AccountType | null;
    const merchants = getMerchants(status || undefined, type || undefined);
    return NextResponse.json({ success: true, merchants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { userId, status, tier, accountType, password } = body;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'يرجى تحديد معرف المستخدم' }, { status: 400 });
    }

    let updatedUser = null;

    if (password !== undefined) {
      const { updateUserProfile } = await import('@/lib/db');
      updatedUser = updateUserProfile(userId, { password: password.trim() });
    }

    if (accountType) {
      updatedUser = updateUserAccountType(userId, accountType as AccountType, tier as MerchantTier);
    }

    if (status) {
      updatedUser = updateMerchantStatus(userId, status as MerchantStatus);
    }

    if (tier && !accountType) {
      updatedUser = updateMerchantTier(userId, tier as MerchantTier);
    }

    if (!updatedUser) {
      return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث تصنيف وبيانات الحساب بنجاح ✅',
      user: updatedUser,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
