import { and, asc, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  financialAccounts,
  accountOpeningBalances,
  vouchers,
  cashVaultMovements,
  orders,
  purchaseInvoices,
} from '@/db/schema';

/* =========================================================
   Helpers
========================================================= */

function normalizePhone(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function accountCode(): string {
  return `ACC-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function transactionNumber(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

/* =========================================================
   Accounts
========================================================= */

export async function pgGetAllCustomerAccounts() {
  const db = getDb();

  const rows = await db
    .select({
      id: financialAccounts.id,
      accountCode: financialAccounts.accountCode,
      name: financialAccounts.name,
      businessName: financialAccounts.businessName,
      phone: financialAccounts.phone,
      category: financialAccounts.category,
      pricingTier: financialAccounts.pricingTier,
      fixedDiscountPercent: financialAccounts.fixedDiscountPercent,
      city: financialAccounts.city,
      address: financialAccounts.address,
      isActive: financialAccounts.isActive,
      notes: financialAccounts.notes,
      createdAt: financialAccounts.createdAt,
      openingType: accountOpeningBalances.type,
      openingAmount: accountOpeningBalances.amount,
      openingDate: accountOpeningBalances.entryDate,
    })
    .from(financialAccounts)
    .leftJoin(
      accountOpeningBalances,
      eq(accountOpeningBalances.accountId, financialAccounts.id),
    )
    .where(eq(financialAccounts.category, 'customer'))
    .orderBy(desc(financialAccounts.createdAt));

  return rows.map((row) => ({
    ...row,
    fixedDiscountPercent: toNumber(row.fixedDiscountPercent),
    openingAmount: toNumber(row.openingAmount),
  }));
}

export async function pgCreateAccountingAccount(data: {
  name: string;
  businessName?: string | null;
  phone?: string | null;
  email?: string | null;
  category?: 'customer' | 'supplier' | 'driver' | 'employee';
  pricingTier?: 'retail' | 'market' | 'wholesale' | 'special' | 'general';
  fixedDiscountPercent?: number;
  city?: string | null;
  address?: string | null;
  notes?: string | null;
  openingBalance?: number;
  openingBalanceType?: 'debit' | 'credit';
  operator?: {
    name?: string | null;
    username?: string | null;
    role?: string | null;
  };
}) {
  const db = getDb();

  const name = String(data.name || '').trim();
  if (!name) {
    throw new Error('اسم الحساب مطلوب');
  }

  const phone = normalizePhone(data.phone) || null;
  const openingBalance = Math.max(0, toNumber(data.openingBalance));

  return db.transaction(async (tx) => {
    if (phone) {
      const existing = await tx
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(eq(financialAccounts.phone, phone))
        .limit(1);

      if (existing.length) {
        throw new Error('يوجد حساب مسجل مسبقاً بنفس رقم الهاتف');
      }
    }

    const [account] = await tx
      .insert(financialAccounts)
      .values({
        accountCode: accountCode(),
        name,
        businessName: data.businessName?.trim() || null,
        phone,
        category: data.category || 'customer',
        pricingTier: data.pricingTier || 'retail',
        fixedDiscountPercent: String(
          Math.max(0, Math.min(100, toNumber(data.fixedDiscountPercent))),
        ),
        city: data.city?.trim() || null,
        address: data.address?.trim() || null,
        notes: data.notes?.trim() || null,
        isActive: true,
      })
      .returning();

    const email = data.email?.trim() || null;

    if (email) {
      const { accountContacts } = await import('@/db/schema');

      await tx.insert(accountContacts).values({
        accountId: account.id,
        type: 'email',
        value: email,
        label: 'البريد الإلكتروني',
        isPrimary: true,
      });
    }

    if (openingBalance > 0) {
      await tx.insert(accountOpeningBalances).values({
        accountId: account.id,
        type: data.openingBalanceType || 'debit',
        amount: String(openingBalance),
        notes: 'رصيد افتتاحي',
      });
    }

    return {
      success: true as const,
      user: {
        ...account,
        fixedDiscountPercent: toNumber(account.fixedDiscountPercent),
      },
      openingBalance,
      openingBalanceType:
        openingBalance > 0 ? data.openingBalanceType || 'debit' : null,
    };
  });
}

/* =========================================================
   Account lookup
========================================================= */

export async function pgFindAccount(identifier: string) {
  const db = getDb();
  const value = String(identifier || '').trim();
  const phone = normalizePhone(value);

  if (!value) return null;

  const conditions = [
    eq(financialAccounts.id, value),
    eq(financialAccounts.accountCode, value),
  ];

  if (phone) {
    conditions.push(eq(financialAccounts.phone, phone));
  }

  const rows = await db
    .select()
    .from(financialAccounts)
    .where(or(...conditions))
    .limit(1);

  return rows[0] || null;
}

/* =========================================================
   Payments / Vouchers
========================================================= */

export async function pgGetPayments(customerPhone?: string) {
  const db = getDb();
  const phone = normalizePhone(customerPhone);

  const base = db
    .select({
      id: vouchers.id,
      receiptNumber: vouchers.receiptNumber,
      accountId: vouchers.accountId,
      customerName: financialAccounts.name,
      customerPhone: financialAccounts.phone,
      voucherType: vouchers.voucherType,
      amount: vouchers.amount,
      paymentMethod: vouchers.paymentMethod,
      notes: vouchers.notes,
      isReversed: vouchers.isReversed,
      reversalVoucherId: vouchers.reversalVoucherId,
      reversalOfId: vouchers.reversalOfId,
      reversalReason: vouchers.reversalReason,
      createdAt: vouchers.createdAt,
    })
    .from(vouchers)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, vouchers.accountId),
    );

  const rows = phone
    ? await base
        .where(eq(financialAccounts.phone, phone))
        .orderBy(desc(vouchers.createdAt))
    : await base.orderBy(desc(vouchers.createdAt));

  return rows.map((row) => ({
    ...row,
    amount: toNumber(row.amount),
  }));
}

/* =========================================================
   Vault reads
========================================================= */

export async function pgGetCashVaultMovements(filter?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  const db = getDb();
  const conditions = [];

  if (filter?.dateFrom) {
    conditions.push(
      gte(cashVaultMovements.date, new Date(filter.dateFrom)),
    );
  }

  if (filter?.dateTo) {
    const end = new Date(filter.dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(cashVaultMovements.date, end));
  }

  const rows = conditions.length
    ? await db
        .select()
        .from(cashVaultMovements)
        .where(and(...conditions))
        .orderBy(desc(cashVaultMovements.date))
    : await db
        .select()
        .from(cashVaultMovements)
        .orderBy(desc(cashVaultMovements.date));

  return rows.map((row) => ({
    ...row,
    amount: toNumber(row.amount),
  }));
}

export async function pgGetCashVaultSummary() {
  const movements = await pgGetCashVaultMovements();

  let totalInflow = 0;
  let totalOutflow = 0;

  for (const movement of movements) {
    if (movement.type === 'inflow') {
      totalInflow += movement.amount;
    } else {
      totalOutflow += movement.amount;
    }
  }

  return {
    totalInflow,
    totalOutflow,
    balance: totalInflow - totalOutflow,
    movementsCount: movements.length,
  };
}

/* =========================================================
   Operator / staff helper
========================================================= */

type PgOperator = {
  name?: string | null;
  username?: string | null;
  role?: string | null;
};

async function pgResolveStaffId(
  tx: any,
  operator?: PgOperator,
): Promise<string | null> {
  const username = String(operator?.username || '').trim();
  if (!username) return null;

  const { staffProfiles } = await import('@/db/schema');

  const rows = await tx
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.username, username))
    .limit(1);

  return rows[0]?.id || null;
}

/* =========================================================
   Create voucher
========================================================= */

export async function pgAddPayment(data: {
  customerPhone: string;
  customerName: string;
  amount: number;
  paymentMethod?: string;
  notes?: string | null;
  receivedBy?: string | null;
  voucherType?: 'receipt' | 'disbursement';
  operatorName?: string | null;
  operatorUsername?: string | null;
  operatorRole?: string | null;
}) {
  const db = getDb();

  const phone = normalizePhone(data.customerPhone);
  const amount = toNumber(data.amount);

  if (!phone) throw new Error('رقم هاتف الحساب مطلوب');
  if (amount <= 0) throw new Error('مبلغ السند يجب أن يكون أكبر من الصفر');

  const method = ['cash', 'zaincash', 'qicard', 'bank_transfer', 'other'].includes(
    String(data.paymentMethod || ''),
  )
    ? String(data.paymentMethod)
    : 'cash';

  const voucherType =
    data.voucherType === 'disbursement' ? 'disbursement' : 'receipt';

  const operator: PgOperator = {
    name: data.operatorName,
    username: data.operatorUsername,
    role: data.operatorRole,
  };

  return db.transaction(async (tx) => {
    const accounts = await tx
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.phone, phone))
      .limit(1);

    const account = accounts[0];

    if (!account) {
      throw new Error('لم يتم العثور على الحساب المالي');
    }

    const staffId = await pgResolveStaffId(tx, operator);

    const receiptNumber = transactionNumber(
      voucherType === 'receipt' ? 'RCV' : 'PAY',
    );

    const [voucher] = await tx
      .insert(vouchers)
      .values({
        receiptNumber,
        accountId: account.id,
        voucherType,
        amount: String(amount),
        paymentMethod: method,
        receivedByStaffId: staffId,
        notes: data.notes?.trim() || null,
      })
      .returning();

    if (method === 'cash') {
      await tx.insert(cashVaultMovements).values({
        transactionNumber: transactionNumber('CV'),
        type: voucherType === 'receipt' ? 'inflow' : 'outflow',
        category:
          voucherType === 'receipt' ? 'debt_collection' : 'adjustment',
        categoryLabel:
          voucherType === 'receipt' ? 'سند قبض نقدي' : 'سند صرف نقدي',
        amount: String(amount),
        referenceType: 'voucher',
        referenceId: voucher.id,
        referenceNumber: voucher.receiptNumber,
        partyName:
          account.businessName ||
          account.name ||
          data.customerName ||
          null,
        staffId,
        notes: data.notes?.trim() || null,
      });
    }

    const { auditLogs } = await import('@/db/schema');

    await tx.insert(auditLogs).values({
      actionType:
        voucherType === 'receipt'
          ? 'voucher_receipt_created'
          : 'voucher_disbursement_created',
      actionLabel:
        voucherType === 'receipt' ? 'إصدار سند قبض' : 'إصدار سند صرف',
      category: 'accounting',
      categoryLabel: 'المحاسبة',
      staffId,
      operatorSnapshot: operator,
      targetType: 'voucher',
      targetId: voucher.id,
      targetReferenceNumber: voucher.receiptNumber,
      financialImpact: {
        amount,
        voucherType,
        paymentMethod: method,
      },
      details: `${voucherType === 'receipt' ? 'سند قبض' : 'سند صرف'} للحساب ${account.name}`,
      severity: 'info',
    });

    return {
      ...voucher,
      amount,
      customerName: account.name,
      customerPhone: account.phone,
      businessName: account.businessName,
      receivedBy: data.receivedBy || data.operatorName || null,
    };
  });
}

/* =========================================================
   Manual cash-vault movement
========================================================= */

export async function pgAddCashVaultMovement(data: {
  type: 'inflow' | 'outflow';
  category?: string;
  categoryLabel?: string;
  amount: number;
  partyName?: string | null;
  notes?: string | null;
  performedBy?: PgOperator;
}) {
  const db = getDb();
  const amount = toNumber(data.amount);

  if (amount <= 0) {
    throw new Error('مبلغ حركة الصندوق يجب أن يكون أكبر من الصفر');
  }

  const type = data.type === 'outflow' ? 'outflow' : 'inflow';

  const allowedCategories = [
    'sales_cash',
    'debt_collection',
    'driver_settlement',
    'purchase_payment',
    'expense',
    'owner_withdrawal',
    'deposit_adjustment',
    'adjustment',
  ];

  const requestedCategory = String(data.category || '');

  const category = allowedCategories.includes(requestedCategory)
    ? requestedCategory
    : type === 'inflow'
      ? 'deposit_adjustment'
      : 'expense';

  return db.transaction(async (tx) => {
    const staffId = await pgResolveStaffId(tx, data.performedBy);

    const [movement] = await tx
      .insert(cashVaultMovements)
      .values({
        transactionNumber: transactionNumber('CV'),
        type,
        category,
        categoryLabel:
          data.categoryLabel ||
          (type === 'inflow' ? 'إيداع نقدي' : 'مصروفات نقدية'),
        amount: String(amount),
        referenceType: 'manual',
        partyName: data.partyName || 'صندوق المتجر (181)',
        staffId,
        notes: data.notes?.trim() || null,
      })
      .returning();

    const { auditLogs } = await import('@/db/schema');

    await tx.insert(auditLogs).values({
      actionType: 'cash_vault_manual_movement',
      actionLabel:
        type === 'inflow' ? 'إضافة حركة داخلة للصندوق' : 'إضافة حركة خارجة من الصندوق',
      category: 'accounting',
      categoryLabel: 'الصندوق 181',
      staffId,
      operatorSnapshot: data.performedBy || null,
      targetType: 'cash_vault_movement',
      targetId: movement.id,
      targetReferenceNumber: movement.transactionNumber,
      financialImpact: {
        type,
        amount,
        category,
      },
      details: `${data.categoryLabel || category} - ${amount}`,
      severity: 'info',
    });

    return {
      ...movement,
      amount,
      performedBy: data.performedBy || null,
    };
  });
}

/* =========================================================
   Voucher reversal
========================================================= */

export async function pgReversePayment(
  paymentId: string,
  reason: string,
  operator?: PgOperator,
) {
  const db = getDb();

  const id = String(paymentId || '').trim();
  const reversalReason = String(reason || '').trim();

  if (!id) {
    return { success: false as const, error: 'معرف السند مطلوب' };
  }

  if (!reversalReason) {
    return { success: false as const, error: 'سبب عكس السند مطلوب' };
  }

  try {
    return await db.transaction(async (tx) => {
      /*
       * The symmetry trigger on vouchers is:
       * DEFERRABLE INITIALLY DEFERRED
       *
       * Therefore the reversal row and the update of the original
       * voucher may safely be completed inside this same transaction.
       */

      const originals = await tx
        .select({
          id: vouchers.id,
          receiptNumber: vouchers.receiptNumber,
          accountId: vouchers.accountId,
          voucherType: vouchers.voucherType,
          amount: vouchers.amount,
          paymentMethod: vouchers.paymentMethod,
          notes: vouchers.notes,
          isReversed: vouchers.isReversed,
          reversalVoucherId: vouchers.reversalVoucherId,
          reversalOfId: vouchers.reversalOfId,
          createdAt: vouchers.createdAt,
        })
        .from(vouchers)
        .where(eq(vouchers.id, id))
        .limit(1);

      const original = originals[0];

      if (!original) {
        return {
          success: false as const,
          error: 'السند المطلوب غير موجود',
        };
      }

      if (original.voucherType === 'reversal') {
        return {
          success: false as const,
          error: 'لا يمكن عكس سند عكس',
        };
      }

      if (original.isReversed) {
        return {
          success: false as const,
          error: 'تم عكس هذا السند مسبقاً',
        };
      }

      const accountRows = await tx
        .select({
          phone: financialAccounts.phone,
          name: financialAccounts.name,
        })
        .from(financialAccounts)
        .where(eq(financialAccounts.id, original.accountId))
        .limit(1);

      const originalAccount = accountRows[0];

      const staffId = await pgResolveStaffId(tx, operator);
      const amount = toNumber(original.amount);

      /*
       * 1. Create the reversal voucher.
       *
       * Its financial direction is represented by voucher_type=reversal
       * and reversal_of_id. We preserve the original amount/method.
       */
      const [reversal] = await tx
        .insert(vouchers)
        .values({
          receiptNumber: transactionNumber('REV'),
          accountId: original.accountId,
          voucherType: 'reversal',
          amount: String(amount),
          paymentMethod: original.paymentMethod,
          receivedByStaffId: staffId,
          reversalOfId: original.id,
          reversalReason,
          notes: `عكس السند ${original.receiptNumber}: ${reversalReason}`,
        })
        .returning();

      /*
       * 2. Mark the original as reversed and establish the other
       *    side of the symmetrical relationship.
       */
      await tx
        .update(vouchers)
        .set({
          isReversed: true,
          reversalVoucherId: reversal.id,
          reversalReason,
          reversedAt: new Date(),
          reversedByStaffId: staffId,
        })
        .where(eq(vouchers.id, original.id));

      /*
       * 3. Reverse the CASH effect in vault only when the original
       *    voucher was cash.
       *
       * Receipt originally increases cash -> reversal decreases it.
       * Disbursement originally decreases cash -> reversal increases it.
       */
      if (original.paymentMethod === 'cash') {
        const reversalVaultType =
          original.voucherType === 'receipt' ? 'outflow' : 'inflow';

        await tx.insert(cashVaultMovements).values({
          transactionNumber: transactionNumber('CVR'),
          type: reversalVaultType,
          category: 'adjustment',
          categoryLabel: 'عكس سند مالي',
          amount: String(amount),
          referenceType: 'voucher_reversal',
          referenceId: reversal.id,
          referenceNumber: reversal.receiptNumber,
          staffId,
          notes: `عكس السند ${original.receiptNumber}: ${reversalReason}`,
        });
      }

      /*
       * 4. Audit trail
       */
      const { auditLogs } = await import('@/db/schema');

      await tx.insert(auditLogs).values({
        actionType: 'voucher_reversed',
        actionLabel: 'عكس سند مالي',
        category: 'accounting',
        categoryLabel: 'المحاسبة',
        staffId,
        operatorSnapshot: operator || null,
        targetType: 'voucher',
        targetId: original.id,
        targetReferenceNumber: original.receiptNumber,
        financialImpact: {
          amount,
          originalVoucherType: original.voucherType,
          reversalVoucherId: reversal.id,
          reversalReceiptNumber: reversal.receiptNumber,
        },
        details: `عكس السند ${original.receiptNumber}: ${reversalReason}`,
        severity: 'warning',
      });

      return {
        success: true as const,
        originalPayment: {
          ...original,
          amount,
          customerPhone: originalAccount?.phone || null,
          customerName: originalAccount?.name || null,
          isReversed: true,
          reversalVoucherId: reversal.id,
          reversalReason,
        },
        reversalPayment: {
          ...reversal,
          amount,
        },
      };
    });
  } catch (error) {
    console.error('pgReversePayment failed:', error);

    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'حدث خطأ أثناء عكس السند',
    };
  }
}

/* =========================================================
   Financial calculation helpers
========================================================= */

function accountTypeLabel(category: string): string {
  switch (category) {
    case 'supplier':
      return 'مجهز / مورد 🏭';
    case 'employee':
      return 'موظف 💼';
    case 'driver':
      return 'مندوب توصيل 🚚';
    default:
      return 'زبون مباشر 👤';
  }
}

function openingSignedAmount(
  type: string | null | undefined,
  amount: unknown,
): number {
  const value = toNumber(amount);
  return type === 'credit' ? -value : value;
}

/*
 * Effect of a voucher on account balance.
 *
 * Positive = increases debit / amount owed to us.
 * Negative = decreases debit.
 *
 * Supplier accounting is reversed from customer accounting.
 */
function voucherBalanceEffect(
  category: string,
  voucherType: string,
  amount: number,
  originalVoucherType?: string | null,
): number {
  const supplier = category === 'supplier';

  if (voucherType === 'receipt') {
    return supplier ? amount : -amount;
  }

  if (voucherType === 'disbursement') {
    return supplier ? -amount : amount;
  }

  if (voucherType === 'reversal') {
    if (originalVoucherType === 'receipt') {
      return supplier ? -amount : amount;
    }

    if (originalVoucherType === 'disbursement') {
      return supplier ? amount : -amount;
    }
  }

  return 0;
}

/* =========================================================
   Account summaries
========================================================= */

export async function pgGetAccountSummaries() {
  const db = getDb();

  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.isActive, true));

  const result = [];

  for (const account of accounts) {
    const [opening] = await db
      .select()
      .from(accountOpeningBalances)
      .where(eq(accountOpeningBalances.accountId, account.id))
      .limit(1);

    let totalInvoiced = opening
      ? openingSignedAmount(opening.type, opening.amount)
      : 0;

    let totalPaid = 0;
    let ordersCount = 0;
    let lastActivityDate: Date | string = account.createdAt;

    if (account.category === 'supplier') {
      const purchases = await db
        .select()
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.supplierAccountId, account.id));

      for (const invoice of purchases) {
        totalInvoiced += toNumber(invoice.totalAmount);
        totalPaid += toNumber(invoice.paidAmount);
        ordersCount += 1;

        const date = invoice.invoiceDate || invoice.createdAt;
        if (
          date &&
          new Date(date).getTime() > new Date(lastActivityDate).getTime()
        ) {
          lastActivityDate = date;
        }
      }
    } else {
      const accountOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.accountId, account.id),
            sql`${orders.status} <> 'cancelled'`,
          ),
        );

      for (const order of accountOrders) {
        totalInvoiced += toNumber(order.total);
        totalPaid += toNumber(order.collectedAmount);
        ordersCount += 1;

        if (
          new Date(order.createdAt).getTime() >
          new Date(lastActivityDate).getTime()
        ) {
          lastActivityDate = order.createdAt;
        }
      }
    }

    const accountVouchers = await db
      .select({
        id: vouchers.id,
        voucherType: vouchers.voucherType,
        amount: vouchers.amount,
        isReversed: vouchers.isReversed,
        reversalOfId: vouchers.reversalOfId,
        createdAt: vouchers.createdAt,
      })
      .from(vouchers)
      .where(eq(vouchers.accountId, account.id))
      .orderBy(asc(vouchers.createdAt));

    const voucherById = new Map(
      accountVouchers.map((voucher) => [voucher.id, voucher]),
    );

    for (const voucher of accountVouchers) {
      /*
       * Original vouchers that were reversed remain in the immutable
       * ledger, but their financial effect is cancelled by the reversal
       * voucher. Therefore both rows are included.
       */
      const original =
        voucher.voucherType === 'reversal' && voucher.reversalOfId
          ? voucherById.get(voucher.reversalOfId)
          : null;

      const effect = voucherBalanceEffect(
        account.category,
        voucher.voucherType,
        toNumber(voucher.amount),
        original?.voucherType,
      );

      /*
       * Keep the old UI contract:
       * remainingBalance = totalInvoiced - totalPaid
       */
      totalPaid -= effect;

      if (
        new Date(voucher.createdAt).getTime() >
        new Date(lastActivityDate).getTime()
      ) {
        lastActivityDate = voucher.createdAt;
      }
    }

    result.push({
      phone: account.phone || account.accountCode,
      name: account.name,
      businessName: account.businessName || undefined,
      accountType: accountTypeLabel(account.category),
      category: account.category,
      pricingTier: account.pricingTier,
      fixedDiscountPercent: toNumber(account.fixedDiscountPercent),
      city: account.city || undefined,
      address: account.address || undefined,
      notes: account.notes || undefined,
      ordersCount,
      totalInvoiced,
      totalPaid,
      remainingBalance: totalInvoiced - totalPaid,
      lastActivityDate,
    });
  }

  return result.sort(
    (a, b) => b.remainingBalance - a.remainingBalance,
  );
}

/* =========================================================
   Customer / supplier statement
========================================================= */

export async function pgGetCustomerStatement(
  identifier: string,
  startDate?: string,
  endDate?: string,
) {
  const db = getDb();

  const account = await pgFindAccount(identifier);
  if (!account) return null;

  const [opening] = await db
    .select()
    .from(accountOpeningBalances)
    .where(eq(accountOpeningBalances.accountId, account.id))
    .limit(1);

  const allTransactions: Array<{
    id: string;
    date: Date | string;
    type: 'opening' | 'invoice' | 'payment';
    description: string;
    reference?: string;
    debit: number;
    credit: number;
    balance: number;
  }> = [];

  if (opening && toNumber(opening.amount) > 0) {
    const signed = openingSignedAmount(opening.type, opening.amount);

    allTransactions.push({
      id: opening.id,
      date: opening.entryDate,
      type: 'opening',
      description: opening.notes || 'رصيد افتتاحي',
      reference: 'OPENING',
      debit: signed > 0 ? signed : 0,
      credit: signed < 0 ? Math.abs(signed) : 0,
      balance: 0,
    });
  }

  if (account.category === 'supplier') {
    const purchases = await db
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.supplierAccountId, account.id));

    for (const invoice of purchases) {
      const total = toNumber(invoice.totalAmount);
      const paid = toNumber(invoice.paidAmount);

      allTransactions.push({
        id: invoice.id,
        date: invoice.invoiceDate || invoice.createdAt,
        type: 'invoice',
        description: `فاتورة شراء ${invoice.invoiceNumber}`,
        reference: invoice.invoiceNumber,
        debit: total,
        credit: paid,
        balance: 0,
      });
    }
  } else {
    const accountOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.accountId, account.id),
          sql`${orders.status} <> 'cancelled'`,
        ),
      );

    for (const order of accountOrders) {
      allTransactions.push({
        id: order.id,
        date: order.createdAt,
        type: 'invoice',
        description: `فاتورة مبيعات ${order.orderNumber}`,
        reference: order.orderNumber,
        debit: toNumber(order.total),
        credit: toNumber(order.collectedAmount),
        balance: 0,
      });
    }
  }

  const accountVouchers = await db
    .select()
    .from(vouchers)
    .where(eq(vouchers.accountId, account.id))
    .orderBy(asc(vouchers.createdAt));

  const voucherById = new Map(
    accountVouchers.map((voucher) => [voucher.id, voucher]),
  );

  for (const voucher of accountVouchers) {
    const original =
      voucher.voucherType === 'reversal' && voucher.reversalOfId
        ? voucherById.get(voucher.reversalOfId)
        : null;

    const effect = voucherBalanceEffect(
      account.category,
      voucher.voucherType,
      toNumber(voucher.amount),
      original?.voucherType,
    );

    const label =
      voucher.voucherType === 'receipt'
        ? 'سند قبض'
        : voucher.voucherType === 'disbursement'
          ? 'سند صرف'
          : 'عكس سند';

    allTransactions.push({
      id: voucher.id,
      date: voucher.createdAt,
      type: 'payment',
      description: `${label} ${voucher.receiptNumber}`,
      reference: voucher.receiptNumber,
      debit: effect > 0 ? effect : 0,
      credit: effect < 0 ? Math.abs(effect) : 0,
      balance: 0,
    });
  }

  allTransactions.sort(
    (a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let runningBalance = 0;

  for (const transaction of allTransactions) {
    runningBalance += transaction.debit - transaction.credit;
    transaction.balance = runningBalance;
  }

  const start = startDate
    ? new Date(
        startDate.includes('T')
          ? startDate
          : `${startDate}T00:00:00.000Z`,
      )
    : null;

  const end = endDate
    ? new Date(
        endDate.includes('T')
          ? endDate
          : `${endDate}T23:59:59.999Z`,
      )
    : null;

  const priorTransactions = allTransactions.filter((transaction) => {
    if (!start) return false;
    return new Date(transaction.date).getTime() < start.getTime();
  });

  const priorBalance = priorTransactions.reduce(
    (sum, transaction) =>
      sum + transaction.debit - transaction.credit,
    0,
  );

  const filteredTransactions = allTransactions.filter((transaction) => {
    const time = new Date(transaction.date).getTime();

    if (start && time < start.getTime()) return false;
    if (end && time > end.getTime()) return false;

    return true;
  });

  let periodBalance = priorBalance;

  for (const transaction of filteredTransactions) {
    periodBalance += transaction.debit - transaction.credit;
    transaction.balance = periodBalance;
  }

  const displayTransactions = [...filteredTransactions];

  if ((startDate || endDate) && priorBalance !== 0) {
    displayTransactions.unshift({
      id: 'prior-balance',
      date: start || allTransactions[0]?.date || new Date(),
      type: 'opening',
      description: 'رصيد ما قبل الفترة',
      reference: 'PRIOR',
      debit: priorBalance > 0 ? priorBalance : 0,
      credit: priorBalance < 0 ? Math.abs(priorBalance) : 0,
      balance: priorBalance,
    });
  }

  const periodInvoiced = filteredTransactions
    .filter((transaction) => transaction.type === 'invoice')
    .reduce((sum, transaction) => sum + transaction.debit, 0);

  const periodPaid = filteredTransactions
    .filter((transaction) => transaction.type === 'payment')
    .reduce(
      (sum, transaction) =>
        sum + transaction.credit - transaction.debit,
      0,
    );

  const allInvoiced = allTransactions
    .filter((transaction) => transaction.type === 'invoice')
    .reduce((sum, transaction) => sum + transaction.debit, 0);

  const allPaid = allTransactions
    .filter((transaction) => transaction.type === 'payment')
    .reduce(
      (sum, transaction) =>
        sum + transaction.credit - transaction.debit,
      0,
    );

  return {
    customer: {
      name: account.name,
      phone: account.phone || account.accountCode,
      email: undefined,
      businessName: account.businessName || undefined,
      accountType: accountTypeLabel(account.category),
      city: account.city || undefined,
      address: account.address || undefined,
    },
    summary: {
      totalInvoiced:
        startDate || endDate ? periodInvoiced : allInvoiced,
      totalPaid:
        startDate || endDate ? periodPaid : allPaid,
      remainingBalance: periodBalance,
      ordersCount: filteredTransactions.filter(
        (transaction) => transaction.type === 'invoice',
      ).length,
      paymentsCount: filteredTransactions.filter(
        (transaction) => transaction.type === 'payment',
      ).length,
    },
    transactions: displayTransactions,
  };
}
