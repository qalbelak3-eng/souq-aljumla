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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, email, accountType, businessName, businessType, city, address, password, notes } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم الزبون / التاجر' }, { status: 400 });
    }

    if (!phone || !phone.trim()) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال رقم الهاتف' }, { status: 400 });
    }

    const { findUserByEmailOrPhone, createUser } = await import('@/lib/db');
    const existing = findUserByEmailOrPhone(phone.trim());
    if (existing) {
      return NextResponse.json({ success: false, error: 'يوجد زبون / تاجر مسجل مسبقاً برقم الهاتف هذا' }, { status: 400 });
    }

    const type = (accountType || 'market') as AccountType;
    const isMerchant = type === 'wholesale' || type === 'merchant';
    const isMarket = type === 'market';

    const newUser = createUser({
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : undefined,
      password: password ? password.trim() : '123456',
      role: 'customer',
      accountType: type,
      merchantStatus: isMerchant || isMarket ? 'approved' : undefined,
      merchantTier: isMerchant ? 'gold' : isMarket ? 'silver' : undefined,
      businessName: businessName ? businessName.trim() : (isMarket ? `ماركت ${name.trim()}` : isMerchant ? `تجارة ${name.trim()}` : undefined),
      businessType: businessType ? businessType.trim() : (isMarket ? 'ميني ماركت وبقالة' : isMerchant ? 'تجارة مواد غذائية جملة' : undefined),
      city: city ? city.trim() : 'كربلاء المقدسة',
      address: address ? address.trim() : 'مركز المدينة',
    });

    return NextResponse.json({
      success: true,
      message: 'تمت إضافة الزبون / التاجر بنجاح وتفعيل حسابه مباشرة! 👤✅',
      user: newUser,
    });
  } catch (error: any) {
    console.error('Error in POST /api/admin/merchants:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
