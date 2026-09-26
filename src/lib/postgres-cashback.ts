import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  cashbackLedger,
  financialAccounts,
  orders,
  auditLogs,
} from '@/db/schema';

export interface CashbackSummary {
  availableBalance: number;
  pendingCashback: number;
  totalEarned: number;
  totalRedeemed: number;
  totalReversed: number;
  accountId: string | null;
  history: Array<{
    id: string;
    type: string;
    amount: number;
    orderId?: string | null;
    orderNumber?: string | null;
    notes?: string | null;
    createdAt: string;
  }>;
}

function normalizePhone(phone?: string | null): string {
  return String(phone || '').replace(/\D/g, '');
}

function toNumber(val: any): number {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calculates net spendable balance directly from PostgreSQL cashback_ledger table:
 * Balance = sum(earned) + sum(reversed) + sum(adjustment) - sum(redeemed) - sum(expired)
 */
export async function pgGetAccountCashbackBalance(accountId: string, tx?: any): Promise<number> {
  if (!accountId) return 0;
  const db = tx || getDb();

  const rows = await db
    .select({
      type: cashbackLedger.type,
      amount: cashbackLedger.amount,
    })
    .from(cashbackLedger)
    .where(eq(cashbackLedger.accountId, accountId));

  let balance = 0;
  for (const row of rows) {
    const amt = toNumber(row.amount);
    if (row.type === 'earned' || row.type === 'reversed' || row.type === 'adjustment') {
      balance += amt;
    } else if (row.type === 'redeemed' || row.type === 'expired') {
      balance -= amt;
    }
  }

  return Math.max(0, Number(balance.toFixed(2)));
}

/**
 * Resolves a customer's financial account by accountId, userId, or normalized phone.
 */
export async function pgResolveCustomerAccount(
  identifiers: { accountId?: string; userId?: string; phone?: string },
  tx?: any
): Promise<any | null> {
  const db = tx || getDb();
  const isUuid = (s?: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

  if (identifiers.accountId && isUuid(identifiers.accountId)) {
    const rows = await db
      .select()
      .from(financialAccounts)
      .where(and(eq(financialAccounts.id, identifiers.accountId), eq(financialAccounts.category, 'customer')))
      .limit(1);
    if (rows.length > 0) return rows[0];
  }

  if (identifiers.userId && isUuid(identifiers.userId)) {
    const rows = await db
      .select()
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.category, 'customer'),
          sql`${financialAccounts.authIdentityId} = ${identifiers.userId} OR ${financialAccounts.id} = ${identifiers.userId}`
        )
      )
      .limit(1);
    if (rows.length > 0) return rows[0];
  }

  const cleanPhone = normalizePhone(identifiers.phone);
  if (cleanPhone) {
    const rows = await db
      .select()
      .from(financialAccounts)
      .where(and(eq(financialAccounts.phone, cleanPhone), eq(financialAccounts.category, 'customer')))
      .limit(1);
    if (rows.length > 0) return rows[0];
  }

  return null;
}

/**
 * Returns comprehensive cashback details:
 * - availableBalance: real spendable balance from delivered orders
 * - pendingCashback: expected cashback from undelivered orders (pending, processing, shipped)
 * - totalEarned: lifetime earned
 * - totalRedeemed: lifetime spent
 * - history: chronological ledger entries
 */
export async function pgGetCustomerCashbackSummary(
  identifiers: { accountId?: string; userId?: string; phone?: string },
  tx?: any
): Promise<CashbackSummary> {
  const db = tx || getDb();
  const emptySummary: CashbackSummary = {
    availableBalance: 0,
    pendingCashback: 0,
    totalEarned: 0,
    totalRedeemed: 0,
    totalReversed: 0,
    accountId: null,
    history: [],
  };

  const account = await pgResolveCustomerAccount(identifiers, db);
  if (!account) return emptySummary;

  const accountId = account.id;

  // 1. Available spendable balance
  const availableBalance = await pgGetAccountCashbackBalance(accountId, db);

  // 2. Pending cashback from in-flight orders
  const inFlightOrderRows = await db
    .select({
      earnedCashback: orders.earnedCashback,
    })
    .from(orders)
    .where(
      and(
        eq(orders.accountId, accountId),
        inArray(orders.status, ['pending', 'processing', 'shipped'])
      )
    );

  const pendingCashback = inFlightOrderRows.reduce((sum: number, r: { earnedCashback: any }) => sum + toNumber(r.earnedCashback), 0);

  // 3. Ledger records and history
  const ledgerRows = await db
    .select({
      id: cashbackLedger.id,
      type: cashbackLedger.type,
      amount: cashbackLedger.amount,
      orderId: cashbackLedger.orderId,
      notes: cashbackLedger.notes,
      createdAt: cashbackLedger.createdAt,
      orderNumber: orders.orderNumber,
    })
    .from(cashbackLedger)
    .leftJoin(orders, eq(cashbackLedger.orderId, orders.id))
    .where(eq(cashbackLedger.accountId, accountId))
    .orderBy(desc(cashbackLedger.createdAt));

  let totalEarned = 0;
  let totalRedeemed = 0;
  let totalReversed = 0;

  const history = ledgerRows.map((r: any) => {
    const amt = toNumber(r.amount);
    if (r.type === 'earned') totalEarned += amt;
    else if (r.type === 'redeemed') totalRedeemed += amt;
    else if (r.type === 'reversed') totalReversed += amt;

    return {
      id: r.id,
      type: r.type,
      amount: amt,
      orderId: r.orderId,
      orderNumber: r.orderNumber || null,
      notes: r.notes || null,
      createdAt: new Date(r.createdAt).toISOString(),
    };
  });

  return {
    availableBalance,
    pendingCashback: Number(pendingCashback.toFixed(2)),
    totalEarned: Number(totalEarned.toFixed(2)),
    totalRedeemed: Number(totalRedeemed.toFixed(2)),
    totalReversed: Number(totalReversed.toFixed(2)),
    accountId,
    history,
  };
}

/**
 * Atomically validates and redeems cashback during order creation.
 * Serializes concurrent requests on the customer's financial account with FOR UPDATE.
 * Strictly prevents double-spend and over-spending.
 */
export async function pgRedeemCashbackInOrder(
  tx: any,
  options: {
    accountId: string;
    orderId: string;
    orderNumber?: string;
    requestedAmount: number;
    subtotal: number;
    notes?: string;
  }
): Promise<{ appliedDiscount: number; remainingBalance: number }> {
  const { accountId, orderId, orderNumber, requestedAmount, subtotal, notes } = options;

  if (!accountId) {
    throw new Error('معرف الحساب المالي للعميل مطلوب لخصم رصيد الأرباح');
  }

  // Row-level lock on the customer's financial account to prevent race condition double-spends
  await tx
    .select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, accountId))
    .for('update');

  // Idempotency check: if already redeemed for this orderId, return existing amount
  const existingRedeemed = await tx
    .select()
    .from(cashbackLedger)
    .where(and(eq(cashbackLedger.orderId, orderId), eq(cashbackLedger.type, 'redeemed')))
    .limit(1);

  if (existingRedeemed.length > 0) {
    const currentBal = await pgGetAccountCashbackBalance(accountId, tx);
    return {
      appliedDiscount: toNumber(existingRedeemed[0].amount),
      remainingBalance: currentBal,
    };
  }

  const currentBalance = await pgGetAccountCashbackBalance(accountId, tx);
  const reqAmount = Number(requestedAmount.toFixed(2));

  if (reqAmount <= 0) {
    return { appliedDiscount: 0, remainingBalance: currentBalance };
  }

  if (currentBalance <= 0) {
    throw new Error('رصيد الأرباح المتاح لديك هو 0 د.ع ولا يمكن استخدام رصيد أرباح في هذا الطلب');
  }

  if (reqAmount > currentBalance) {
    throw new Error(
      `رصيد الأرباح المتاح لديك (${currentBalance.toLocaleString()} د.ع) غير كافٍ للمبلغ المطلوب (${reqAmount.toLocaleString()} د.ع)`
    );
  }

  // Max allowable cashback discount cannot exceed items subtotal
  const maxAllowable = Math.max(0, subtotal);
  const appliedDiscount = Math.min(reqAmount, currentBalance, maxAllowable);

  if (appliedDiscount <= 0) {
    return { appliedDiscount: 0, remainingBalance: currentBalance };
  }

  await tx.insert(cashbackLedger).values({
    accountId,
    type: 'redeemed',
    amount: String(appliedDiscount.toFixed(2)),
    orderId,
    notes: notes || `استخدام رصيد أرباح في الطلبية رقم ${orderNumber || orderId}`,
  });

  const remainingBalance = Math.max(0, Number((currentBalance - appliedDiscount).toFixed(2)));
  return { appliedDiscount, remainingBalance };
}

/**
 * Credits earned cashback to customer account upon successful order delivery.
 * Strictly Idempotent: repeated calls will not credit duplicate cashback.
 */
export async function pgCreditOrderDeliveredCashback(
  tx: any,
  orderId: string
): Promise<{ credited: boolean; amount: number }> {
  if (!orderId) return { credited: false, amount: 0 };

  const orderRows = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .for('update');

  if (orderRows.length === 0) return { credited: false, amount: 0 };
  const order = orderRows[0];

  if (order.status !== 'delivered') {
    return { credited: false, amount: 0 };
  }

  const earned = toNumber(order.earnedCashback);
  if (earned <= 0) {
    return { credited: false, amount: 0 };
  }

  // Idempotency: check if earned cashback already credited for this order
  const existing = await tx
    .select({ id: cashbackLedger.id, amount: cashbackLedger.amount })
    .from(cashbackLedger)
    .where(and(eq(cashbackLedger.orderId, orderId), eq(cashbackLedger.type, 'earned')))
    .limit(1);

  if (existing.length > 0) {
    return { credited: false, amount: toNumber(existing[0].amount) };
  }

  await tx.insert(cashbackLedger).values({
    accountId: order.accountId,
    type: 'earned',
    amount: String(earned.toFixed(2)),
    orderId: order.id,
    notes: `مكافأة رصيد أرباح بعد تسليم الطلبية رقم ${order.orderNumber}`,
  });

  try {
    await tx.insert(auditLogs).values({
      actionType: 'cashback_earned',
      actionLabel: 'منح كاشباك بعد التسليم',
      category: 'accounting',
      categoryLabel: 'المحاسبة والكاشباك',
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      financialImpact: { earnedCashback: earned },
      details: `تم منح ${earned.toLocaleString()} د.ع كاشباك للعميل بعد تسليم الطلبية ${order.orderNumber}`,
      severity: 'info',
    });
  } catch (e) {
    console.error('Audit log failed for cashback credit:', e);
  }

  return { credited: true, amount: earned };
}

/**
 * Reverses (refunds) redeemed cashback to customer account upon order cancellation.
 * Strictly Idempotent: repeated calls will not reverse duplicate amounts.
 */
export async function pgReverseOrderRedeemedCashback(
  tx: any,
  orderId: string,
  reason?: string
): Promise<{ reversed: boolean; amount: number }> {
  if (!orderId) return { reversed: false, amount: 0 };

  const orderRows = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .for('update');

  if (orderRows.length === 0) return { reversed: false, amount: 0 };
  const order = orderRows[0];

  const used = toNumber(order.usedCashbackDiscount);
  if (used <= 0) {
    return { reversed: false, amount: 0 };
  }

  // Idempotency: check if reversal was already executed for this order
  const existingReversal = await tx
    .select({ id: cashbackLedger.id, amount: cashbackLedger.amount })
    .from(cashbackLedger)
    .where(and(eq(cashbackLedger.orderId, orderId), eq(cashbackLedger.type, 'reversed')))
    .limit(1);

  if (existingReversal.length > 0) {
    return { reversed: false, amount: toNumber(existingReversal[0].amount) };
  }

  await tx.insert(cashbackLedger).values({
    accountId: order.accountId,
    type: 'reversed',
    amount: String(used.toFixed(2)),
    orderId: order.id,
    notes: reason || `استرجاع رصيد أرباح مستخدم لإلغاء الطلبية رقم ${order.orderNumber}`,
  });

  try {
    await tx.insert(auditLogs).values({
      actionType: 'cashback_reversed',
      actionLabel: 'استرجاع كاشباك ملغي',
      category: 'accounting',
      categoryLabel: 'المحاسبة والكاشباك',
      targetType: 'order',
      targetId: order.id,
      targetReferenceNumber: order.orderNumber,
      financialImpact: { reversedCashback: used },
      details: `تم استرجاع ${used.toLocaleString()} د.ع رصيد أرباح للعميل لإلغاء الطلبية ${order.orderNumber}`,
      severity: 'info',
    });
  } catch (e) {
    console.error('Audit log failed for cashback reversal:', e);
  }

  return { reversed: true, amount: used };
}
