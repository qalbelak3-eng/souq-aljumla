import { NextResponse } from 'next/server';
import { getCashVaultSummary, getCashVaultMovements, addCashVaultMovement } from '@/lib/db';
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
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية الاطلاع على الصندوق 181' }, { status: 403 });
    }

    const summary = getCashVaultSummary();
    const movements = getCashVaultMovements();
    return NextResponse.json({ success: true, summary, movements });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    }
    if (!hasPermission(admin, 'accounting')) {
      return NextResponse.json({ success: false, error: 'ليس لديك صلاحية إضافة حركات نقدية في الصندوق 181' }, { status: 403 });
    }

    const body = await request.json();
    const { type, category, categoryLabel, amount, partyName, notes } = body;

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال مبلغ صحيح' }, { status: 400 });
    }

    // اشتقاق هوية المنفذ حصراً من جلسة السيرفر
    const movement = addCashVaultMovement({
      type: type || 'inflow',
      category: category || (type === 'inflow' ? 'deposit_adjustment' : 'expense'),
      categoryLabel: categoryLabel || (type === 'inflow' ? 'إيداع نقدي' : 'مصروفات نقدية'),
      amount: Number(amount),
      partyName: partyName || 'صندوق المتجر (181)',
      notes: notes || '',
      performedBy: {
        name: admin.name,
        username: admin.username,
        role: admin.role,
      },
    });

    const summary = getCashVaultSummary();
    return NextResponse.json({
      success: true,
      message: 'تم تسجيل حركة الصندوق وتوثيقها في سجل الرقابة بنجاح ✓',
      movement,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
