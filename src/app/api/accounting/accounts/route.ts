import { NextResponse } from 'next/server';
import { getAllCustomerAccounts, createAccountingAccount } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const accounts = getAllCustomerAccounts();
    return NextResponse.json({
      success: true,
      accounts,
      totalCount: accounts.length,
      totalMarketDebt: accounts.reduce((sum, a) => sum + Math.max(0, a.remainingBalance), 0),
      totalMarketInvoiced: accounts.reduce((sum, a) => sum + a.totalInvoiced, 0),
      totalMarketPaid: accounts.reduce((sum, a) => sum + a.totalPaid, 0),
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في جلب بيانات الحسابات' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      category,
      name,
      businessName,
      phone,
      email,
      city,
      address,
      pricingTier,
      fixedDiscountPercent,
      notes,
      openingBalance,
      operator
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال اسم الحساب بشكل صحيح' },
        { status: 400 }
      );
    }

    if (!phone || !phone.trim()) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال رقم هاتف الحساب' },
        { status: 400 }
      );
    }

    const validCategories = ['customer', 'supplier', 'employee', 'driver'];
    const selectedCategory = validCategories.includes(category) ? category : 'customer';

    const result = createAccountingAccount({
      category: selectedCategory,
      name,
      businessName,
      phone,
      email,
      city,
      address,
      pricingTier,
      fixedDiscountPercent: fixedDiscountPercent ? Number(fixedDiscountPercent) : undefined,
      notes,
      openingBalance,
      operator,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'فشل إنشاء الحساب' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      user: result.user,
      openingBalance: result.openingBalance,
      message: 'تم إضافة الحساب بنجاح',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء إنشاء الحساب' },
      { status: 500 }
    );
  }
}
