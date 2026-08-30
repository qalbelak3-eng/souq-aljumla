import { NextResponse } from 'next/server';
import { getCashVaultSummary, getCashVaultMovements, addCashVaultMovement } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const summary = getCashVaultSummary();
    const movements = getCashVaultMovements();
    return NextResponse.json({ success: true, summary, movements });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, category, categoryLabel, amount, partyName, notes, operator } = body;

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال مبلغ صحيح' }, { status: 400 });
    }

    const movement = addCashVaultMovement({
      type: type || 'inflow',
      category: category || (type === 'inflow' ? 'deposit_adjustment' : 'expense'),
      categoryLabel: categoryLabel || (type === 'inflow' ? 'إيداع نقدي' : 'مصروفات نقدية'),
      amount: Number(amount),
      partyName: partyName || 'صندوق المتجر (181)',
      notes: notes || '',
      performedBy: {
        name: operator?.name || 'المحاسب',
        username: operator?.username || 'accountant',
        role: operator?.role || 'staff',
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
