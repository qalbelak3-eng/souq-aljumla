import { NextResponse } from 'next/server';
import { pgGetAccountSummaries, pgCreateAccountingAccount } from '@/lib/postgres-accounting';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'accounting')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية الاطلاع على دليل الحسابات' }, { status: 403 });
    }

    const accounts = await pgGetAccountSummaries();
    const customerAccounts = accounts.filter(a => a.category !== 'supplier');
    const supplierAccounts = accounts.filter(a => a.category === 'supplier');

    const totalMarketDebt = customerAccounts.reduce((sum, a) => sum + Math.max(0, a.remainingBalance), 0);
    const totalSupplierPayables = supplierAccounts.reduce((sum, a) => sum + Math.max(0, a.remainingBalance), 0);
    const totalMarketInvoiced = customerAccounts.reduce((sum, a) => sum + a.totalInvoiced, 0);
    const totalSupplierPurchases = supplierAccounts.reduce((sum, a) => sum + a.totalInvoiced, 0);
    const totalMarketPaid = customerAccounts.reduce((sum, a) => sum + a.totalPaid, 0);
    const totalSupplierPaid = supplierAccounts.reduce((sum, a) => sum + a.totalPaid, 0);

    return NextResponse.json({
      success: true,
      accounts,
      totalCount: accounts.length,
      totalMarketDebt,
      totalSupplierPayables,
      totalMarketInvoiced,
      totalSupplierPurchases,
      totalMarketPaid,
      totalSupplierPaid,
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
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'accounting')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إنشاء الحسابات وتعيين الأرصدة' }, { status: 403 });
    }

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
      openingBalanceType,
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

    // اشتقاق هوية المنفذ حصراً من جلسة السيرفر وتجاهل أي هوية واردة في Body
    const operator = {
      name: admin.name,
      username: admin.username,
      role: admin.role,
    };

    let initialBalanceAmount = 0;
    let initialBalanceType: 'debit' | 'credit' =
      selectedCategory === 'supplier' ? 'credit' : 'debit';

    if (typeof openingBalance === 'object' && openingBalance !== null) {
      initialBalanceAmount = Number(openingBalance.amount) || 0;
      if (openingBalance.type === 'credit' || openingBalance.type === 'debit') {
        initialBalanceType = openingBalance.type;
      }
    } else if (openingBalance !== undefined) {
      initialBalanceAmount = Number(openingBalance) || 0;
      if (openingBalanceType === 'credit' || openingBalanceType === 'debit') {
        initialBalanceType = openingBalanceType;
      }
    }

    const result = await pgCreateAccountingAccount({
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
      openingBalance: initialBalanceAmount,
      openingBalanceType: initialBalanceType,
      operator,
    });

    return NextResponse.json({
      success: true,
      user: result.user,
      openingBalance: result.openingBalance,
      openingBalanceType: result.openingBalanceType,
      message: 'تم إضافة الحساب بنجاح',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء إنشاء الحساب' },
      { status: 500 }
    );
  }
}
