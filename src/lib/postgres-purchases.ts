import { getDb, getPostgresClient } from '@/db/client';
import { purchaseInvoices, purchaseInvoiceItems, supplierRefundClaims, supplierRefunds } from '@/db/schema/purchases';
import { products, companies } from '@/db/schema/catalog';
import { inventoryMovements } from '@/db/schema/inventory';
import { financialAccounts } from '@/db/schema/accounts';
import { staffProfiles } from '@/db/schema/auth';
import { vouchers, cashVaultMovements } from '@/db/schema/accounting';
import { auditLogs } from '@/db/schema/operations';
import { PurchaseInvoice, PurchaseInvoiceItem, SupplierRefundClaim, SupplierRefund } from '@/types';
import { normalizePhoneForFinancialIdentity } from '@/lib/phone-utils';
import { validateOrderItemQuantity } from '@/lib/pricing';
import { transactionNumber } from '@/lib/postgres-accounting';
import { eq, and, or, sql, desc, asc, ilike, inArray, type SQL } from 'drizzle-orm';

export interface PgOperator {
  userId?: string;
  username?: string;
  name?: string;
  role?: string;
}

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function isUuid(value?: string | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function resolveStaffId(tx: any, operator?: PgOperator): Promise<string | null> {
  if (!operator?.userId) return null;
  if (isUuid(operator.userId)) {
    const rows = await tx
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(sql`${staffProfiles.id} = ${operator.userId} OR ${staffProfiles.authIdentityId} = ${operator.userId}`)
      .limit(1);
    if (rows.length > 0) return rows[0].id;
  }
  if (operator.username) {
    const rows = await tx
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(eq(staffProfiles.username, operator.username))
      .limit(1);
    if (rows.length > 0) return rows[0].id;
  }
  return null;
}

function formatPurchaseRecord(
  inv: any,
  items: any[],
  companyName?: string,
  supplierPhone?: string
): PurchaseInvoice {
  const formattedItems: PurchaseInvoiceItem[] = items.map((it) => {
    const qty = Number(it.quantity) || 0;
    const cost = toNumber(it.costPrice);
    const bpc = Number(it.boxesPerCarton) || 1;
    const ipb = Number(it.itemsPerBox) || 1;
    const totalPcs = Number(it.totalPieces) || qty * bpc * ipb;
    const pieceCost = toNumber(it.pieceCostPrice) || (totalPcs > 0 ? cost / (bpc * ipb) : 0);

    return {
      productId: it.productId,
      productName: it.productName || it.product?.name || 'صنف',
      productImage: it.productImage || it.product?.images?.[0] || '',
      company: it.companyName || companyName || '',
      unit: it.unit || 'كرتون',
      quantity: qty,
      costPrice: cost,
      total: toNumber(it.total),
      boxesPerCarton: bpc,
      itemsPerBox: ipb,
      totalBoxes: qty * bpc,
      totalPieces: totalPcs,
      pieceCostPrice: pieceCost,
      expiryDate: it.expiryDate || undefined,
    };
  });

  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    companyId: inv.companyId || undefined,
    companyName: inv.supplierNameSnap || companyName || 'مورد',
    supplierPhone: supplierPhone || undefined,
    supplierAccountId: inv.supplierAccountId,
    date: inv.invoiceDate ? String(inv.invoiceDate) : new Date(inv.createdAt).toISOString().split('T')[0],
    items: formattedItems,
    totalAmount: toNumber(inv.totalAmount),
    paymentMethod: inv.paymentMethod as any,
    paidAmount: toNumber(inv.paidAmount),
    remainingAmount: toNumber(inv.remainingAmount),
    status: inv.status as any,
    cancelledAt: inv.cancelledAt ? new Date(inv.cancelledAt).toISOString() : undefined,
    cancelledByStaffId: inv.cancelledByStaffId || undefined,
    cancellationReason: inv.cancellationReason || undefined,
    notes: inv.notes || '',
    createdAt: new Date(inv.createdAt).toISOString(),
  };
}

export async function pgGetPurchaseInvoices(options?: {
  companyId?: string;
  companyName?: string;
  supplierAccountId?: string;
  status?: 'active' | 'cancelled';
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<PurchaseInvoice[]> {
  const db = getDb();
  const conditions: SQL[] = [];

  if (options?.companyId && isUuid(options.companyId)) {
    conditions.push(eq(purchaseInvoices.companyId, options.companyId));
  }
  if (options?.supplierAccountId && isUuid(options.supplierAccountId)) {
    conditions.push(eq(purchaseInvoices.supplierAccountId, options.supplierAccountId));
  }
  if (options?.status) {
    conditions.push(eq(purchaseInvoices.status, options.status));
  }
  if (options?.search) {
    const q = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(purchaseInvoices.invoiceNumber, q),
        ilike(purchaseInvoices.supplierNameSnap, q),
        ilike(purchaseInvoices.notes, q)
      )!
    );
  }

  const query = db
    .select({
      invoice: purchaseInvoices,
      account: financialAccounts,
      company: companies,
    })
    .from(purchaseInvoices)
    .leftJoin(financialAccounts, eq(purchaseInvoices.supplierAccountId, financialAccounts.id))
    .leftJoin(companies, eq(purchaseInvoices.companyId, companies.id))
    .orderBy(desc(purchaseInvoices.createdAt));

  if (conditions.length > 0) {
    query.where(and(...conditions));
  }
  if (options?.limit) {
    query.limit(options.limit);
  }
  if (options?.offset) {
    query.offset(options.offset);
  }

  const invoiceRows = await query;
  if (invoiceRows.length === 0) return [];

  const invoiceIds = invoiceRows.map((r) => r.invoice.id);

  const itemsRows = await db
    .select({
      item: purchaseInvoiceItems,
      product: products,
    })
    .from(purchaseInvoiceItems)
    .leftJoin(products, eq(purchaseInvoiceItems.productId, products.id))
    .where(inArray(purchaseInvoiceItems.invoiceId, invoiceIds));

  const itemsByInvoiceId = new Map<string, any[]>();
  for (const row of itemsRows) {
    const list = itemsByInvoiceId.get(row.item.invoiceId) || [];
    list.push({
      ...row.item,
      productName: row.product?.name,
      productImage: row.product?.images?.[0],
    });
    itemsByInvoiceId.set(row.item.invoiceId, list);
  }

  return invoiceRows.map((r) => {
    const invItems = itemsByInvoiceId.get(r.invoice.id) || [];
    return formatPurchaseRecord(
      r.invoice,
      invItems,
      r.company?.name || r.invoice.supplierNameSnap,
      r.account?.phone || undefined
    );
  });
}

export async function pgGetPurchaseInvoiceById(idOrNumber: string): Promise<PurchaseInvoice | null> {
  const db = getDb();
  const trimmed = String(idOrNumber || '').trim();
  if (!trimmed) return null;

  const conditions = [eq(purchaseInvoices.invoiceNumber, trimmed)];
  if (isUuid(trimmed)) {
    conditions.push(eq(purchaseInvoices.id, trimmed));
  }

  const rows = await db
    .select({
      invoice: purchaseInvoices,
      account: financialAccounts,
      company: companies,
    })
    .from(purchaseInvoices)
    .leftJoin(financialAccounts, eq(purchaseInvoices.supplierAccountId, financialAccounts.id))
    .leftJoin(companies, eq(purchaseInvoices.companyId, companies.id))
    .where(or(...conditions))
    .limit(1);

  if (rows.length === 0) return null;
  const { invoice, account, company } = rows[0];

  const items = await db
    .select({
      item: purchaseInvoiceItems,
      product: products,
    })
    .from(purchaseInvoiceItems)
    .leftJoin(products, eq(purchaseInvoiceItems.productId, products.id))
    .where(eq(purchaseInvoiceItems.invoiceId, invoice.id));

  const itemsWithProduct = items.map((r) => ({
    ...r.item,
    productName: r.product?.name,
    productImage: r.product?.images?.[0],
  }));

  return formatPurchaseRecord(
    invoice,
    itemsWithProduct,
    company?.name || invoice.supplierNameSnap,
    account?.phone || undefined
  );
}

export interface PgCreatePurchaseInput {
  companyName: string;
  companyId?: string;
  supplierAccountId?: string;
  supplierPhone?: string;
  date?: string;
  paymentMethod?: 'cash' | 'credit' | 'partial';
  paidAmount?: number;
  remainingAmount?: number;
  notes?: string;
  items: Array<{
    productId: string;
    productName?: string;
    quantity: number;
    costPrice: number;
    boxesPerCarton?: number;
    itemsPerBox?: number;
    expiryDate?: string;
  }>;
}

export async function pgCreatePurchaseInvoice(
  input: PgCreatePurchaseInput,
  options?: { operator?: PgOperator; tx?: any }
): Promise<PurchaseInvoice> {
  const cName = String(input.companyName || (input as any).supplierName || '').trim();
  if (!cName) {
    throw new Error('اسم الشركة المجهزة أو المورد مطلوب');
  }

  if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('يرجى إضافة صنف واحد على الأقل في فاتورة الشراء');
  }

  for (const it of input.items) {
    const qtyCheck = validateOrderItemQuantity(it.quantity);
    if (!qtyCheck.valid || !qtyCheck.quantity) {
      throw new Error(qtyCheck.error || 'كمية الصنف غير صالحة');
    }
    const cost = toNumber(it.costPrice);
    if (cost < 0) {
      throw new Error('سعر التكلفة لا يمكن أن يكون سالباً');
    }
  }

  const executeCreate = async (tx: any) => {
    // 1. Resolve Supplier Account in financial_accounts
    let supplierAccount: any = null;

    if (input.supplierAccountId && isUuid(input.supplierAccountId)) {
      const rows = await tx
        .select()
        .from(financialAccounts)
        .where(and(eq(financialAccounts.id, input.supplierAccountId), eq(financialAccounts.category, 'supplier')))
        .limit(1);
      if (rows.length > 0) supplierAccount = rows[0];
    }

    if (!supplierAccount && input.supplierPhone) {
      const cleanPhone = normalizePhoneForFinancialIdentity(input.supplierPhone);
      if (cleanPhone) {
        const rows = await tx
          .select()
          .from(financialAccounts)
          .where(and(eq(financialAccounts.phone, cleanPhone), eq(financialAccounts.category, 'supplier')))
          .limit(1);
        if (rows.length > 0) supplierAccount = rows[0];
      }
    }

    if (!supplierAccount) {
      const rows = await tx
        .select()
        .from(financialAccounts)
        .where(
          and(
            eq(financialAccounts.category, 'supplier'),
            or(eq(financialAccounts.name, cName), eq(financialAccounts.businessName, cName))
          )
        )
        .limit(1);
      if (rows.length > 0) supplierAccount = rows[0];
    }

    // Auto-create supplier financial account if not found
    if (!supplierAccount) {
      const cleanPhone = normalizePhoneForFinancialIdentity(input.supplierPhone);
      const code = `SUP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const [newSupp] = await tx
        .insert(financialAccounts)
        .values({
          accountCode: code,
          name: cName,
          businessName: cName,
          phone: cleanPhone || null,
          category: 'supplier',
          pricingTier: 'general',
          isActive: true,
          notes: 'حساب مورد تم إنشاؤه تلقائياً عبر فاتورة شراء',
        })
        .returning();
      supplierAccount = newSupp;
    }

    // 2. Resolve Company ID (Optional)
    let companyId: string | null = null;
    if (input.companyId && isUuid(input.companyId)) {
      const cRows = await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, input.companyId)).limit(1);
      if (cRows.length > 0) companyId = cRows[0].id;
    }
    if (!companyId) {
      const cRows = await tx.select({ id: companies.id }).from(companies).where(eq(companies.name, cName)).limit(1);
      if (cRows.length > 0) companyId = cRows[0].id;
    }

    // 3. Generate Sequential Purchase Invoice Number (Fail-Fast Atomic Sequence)
    const seqRows: any = await tx.execute(sql`SELECT nextval('purchase_seq') as seq`);
    const seqVal = seqRows[0]?.seq || seqRows?.rows?.[0]?.seq;
    if (!seqVal) {
      throw new Error('فشل توليد رقم فاتورة الشراء من السلسلة purchase_seq');
    }
    const invoiceNumber = `PUR-${seqVal}`;

    // 4. Deterministic Product Locking to prevent Deadlocks
    const uniqueProductIds: string[] = Array.from(new Set<string>(input.items.map((i) => i.productId))).sort((a: string, b: string) => a.localeCompare(b));
    const lockedProducts = await tx
      .select()
      .from(products)
      .where(inArray(products.id, uniqueProductIds))
      .for('update');

    const productsMap = new Map<string, any>();
    for (const p of lockedProducts) {
      productsMap.set(p.id, p);
    }

    for (const pid of uniqueProductIds) {
      if (!productsMap.has(pid)) {
        throw new Error(`المنتج المطلوب بالمعرف (${pid}) غير موجود في النظام`);
      }
    }

    // 5. Calculate Items, Totals, and Piece Breakdowns
    const calculatedItems = input.items.map((item) => {
      const prod = productsMap.get(item.productId);
      const qty = Math.floor(Number(item.quantity));
      const cost = toNumber(item.costPrice);
      const bpc = Math.max(1, Number(item.boxesPerCarton || prod.boxesPerCarton) || 1);
      const ipb = Math.max(1, Number(item.itemsPerBox || prod.itemsPerBox) || 1);
      const piecesPerCarton = bpc * ipb;
      const totalPieces = qty * piecesPerCarton;
      const pieceCostPrice = piecesPerCarton > 0 ? Number((cost / piecesPerCarton).toFixed(4)) : 0;
      const total = qty * cost;

      return {
        productId: item.productId,
        productName: prod.name,
        quantity: qty,
        costPrice: cost,
        boxesPerCarton: bpc,
        itemsPerBox: ipb,
        totalPieces,
        pieceCostPrice,
        total,
        expiryDate: item.expiryDate || prod.expiryDate || null,
      };
    });

    const totalAmount = calculatedItems.reduce((sum, it) => sum + it.total, 0);
    const method = input.paymentMethod || 'cash';
    const paid = input.paidAmount !== undefined
      ? Math.min(totalAmount, Math.max(0, toNumber(input.paidAmount)))
      : (method === 'credit' ? 0 : totalAmount);
    const remaining = Math.max(0, totalAmount - paid);

    const invoiceDateStr = input.date ? input.date : new Date().toISOString().split('T')[0];

    // 6. Insert Purchase Invoice Row
    const [insertedInvoice] = await tx
      .insert(purchaseInvoices)
      .values({
        invoiceNumber,
        supplierAccountId: supplierAccount.id,
        companyId,
        supplierNameSnap: cName,
        invoiceDate: invoiceDateStr,
        totalAmount: String(totalAmount.toFixed(2)),
        paymentMethod: method,
        paidAmount: String(paid.toFixed(2)),
        remainingAmount: String(remaining.toFixed(2)),
        status: 'active',
        notes: input.notes?.trim() || null,
      })
      .returning();

    // 7. Insert Purchase Invoice Items
    for (const it of calculatedItems) {
      await tx.insert(purchaseInvoiceItems).values({
        invoiceId: insertedInvoice.id,
        productId: it.productId,
        quantity: it.quantity,
        costPrice: String(it.costPrice.toFixed(2)),
        total: String(it.total.toFixed(2)),
        boxesPerCarton: it.boxesPerCarton,
        itemsPerBox: it.itemsPerBox,
        totalPieces: it.totalPieces,
        pieceCostPrice: String(it.pieceCostPrice.toFixed(4)),
        expiryDate: it.expiryDate,
      });
    }

    const staffId = await resolveStaffId(tx, options?.operator);

    // 8. Update Product Stock and Record Inventory Inflows
    for (const it of calculatedItems) {
      const prod = productsMap.get(it.productId);
      const currentPieces = Number(prod.currentStockPieces) || 0;
      const newStockPieces = currentPieces + it.totalPieces;

      const updateFields: any = {
        currentStockPieces: newStockPieces,
        boxesPerCarton: it.boxesPerCarton,
        itemsPerBox: it.itemsPerBox,
        piecesPerCarton: it.boxesPerCarton * it.itemsPerBox,
      };

      if (it.costPrice > 0) {
        updateFields.costPrice = String(it.costPrice.toFixed(2));
        updateFields.pieceCostPrice = String(it.pieceCostPrice.toFixed(4));
        updateFields.boxCostPrice = String((it.costPrice / it.boxesPerCarton).toFixed(4));
      }
      if (it.expiryDate) {
        updateFields.expiryDate = it.expiryDate;
      }

      await tx
        .update(products)
        .set(updateFields)
        .where(eq(products.id, it.productId));

      await tx.insert(inventoryMovements).values({
        productId: it.productId,
        movementType: 'purchase',
        quantityPieces: it.totalPieces, // positive for stock inflow
        unitCostPieces: String(it.pieceCostPrice.toFixed(4)),
        totalCost: String(it.total.toFixed(2)),
        balanceAfterPieces: newStockPieces,
        referenceType: 'purchase_invoice',
        referenceId: insertedInvoice.id,
        referenceNumber: insertedInvoice.invoiceNumber,
        performedByStaffId: staffId,
        notes: `توريد بضاعة بفاتورة شراء ${insertedInvoice.invoiceNumber} (${it.quantity} كرتون = ${it.totalPieces} قطعة)`,
      });
    }

    // 9. Audit Log
    await tx.insert(auditLogs).values({
      actionType: 'purchase_created',
      actionLabel: 'إنشاء فاتورة شراء بضاعة',
      category: 'inventory',
      categoryLabel: 'المستودع والمشتريات',
      staffId,
      operatorSnapshot: options?.operator || null,
      targetType: 'purchase_invoice',
      targetId: insertedInvoice.id,
      targetReferenceNumber: insertedInvoice.invoiceNumber,
      financialImpact: {
        totalAmount,
        paidAmount: paid,
        remainingAmount: remaining,
      },
      details: `فاتورة شراء ${insertedInvoice.invoiceNumber} من المورد ${cName} بمبلغ ${totalAmount.toLocaleString()} د.ع`,
      severity: 'info',
    });

    return formatPurchaseRecord(insertedInvoice, calculatedItems, cName, supplierAccount.phone);
  };

  if (options?.tx) {
    return await executeCreate(options.tx);
  } else {
    const db = getDb();
    return await db.transaction(executeCreate);
  }
}

export async function pgCancelPurchaseInvoice(
  idOrNumber: string,
  reason?: string,
  options?: { operator?: PgOperator; tx?: any }
): Promise<PurchaseInvoice> {
  const trimmed = String(idOrNumber || '').trim();
  if (!trimmed) throw new Error('معرف فاتورة الشراء مطلوب');

  const executeCancel = async (tx: any) => {
    const conditions = [eq(purchaseInvoices.invoiceNumber, trimmed)];
    if (isUuid(trimmed)) {
      conditions.push(eq(purchaseInvoices.id, trimmed));
    }

    // 1. Identify Invoice and lock in strict global order
    const preRows = await tx
      .select({ id: purchaseInvoices.id, supplierAccountId: purchaseInvoices.supplierAccountId })
      .from(purchaseInvoices)
      .where(or(...conditions))
      .limit(1);

    if (preRows.length === 0) {
      throw new Error('فاتورة الشراء غير موجودة');
    }
    const preInv = preRows[0];

    // Level 1 Lock: financialAccounts FOR UPDATE (Unifies synchronization point across all supplier financial ops)
    await tx
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(eq(financialAccounts.id, preInv.supplierAccountId))
      .for('update');

    // Level 2 Lock: purchaseInvoices FOR UPDATE
    const invoiceRows = await tx
      .select()
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.id, preInv.id))
      .for('update');

    const invoice = invoiceRows[0];

    // Idempotency: If already cancelled, return existing state cleanly without re-reversing
    if (invoice.status === 'cancelled') {
      const items = await tx
        .select()
        .from(purchaseInvoiceItems)
        .where(eq(purchaseInvoiceItems.invoiceId, invoice.id));
      return formatPurchaseRecord(invoice, items);
    }

    const items = await tx
      .select()
      .from(purchaseInvoiceItems)
      .where(eq(purchaseInvoiceItems.invoiceId, invoice.id));

    // Level 4 Lock: Deterministic Product Locking FOR UPDATE (in sorted UUID order to prevent deadlocks)
    const uniqueProductIds: string[] = Array.from(new Set<string>(items.map((i: any) => String(i.productId)))).sort((a: string, b: string) => a.localeCompare(b));
    const lockedProducts = await tx
      .select()
      .from(products)
      .where(inArray(products.id, uniqueProductIds))
      .for('update');

    const productsMap = new Map<string, any>();
    for (const p of lockedProducts) {
      productsMap.set(p.id, p);
    }

    // 2. Verify Stock Sufficiency Before Reversing
    for (const it of items) {
      const prod = productsMap.get(it.productId);
      const curStock = Number(prod?.currentStockPieces) || 0;
      const reversePieces = Number(it.totalPieces) || 0;

      if (curStock < reversePieces) {
        throw new Error(
          `لا يمكن إلغاء فاتورة الشراء: الرصيد الحالي للمنتج (${prod?.name || it.productId}) هو ${curStock} قطعة، بينما المطلوب خصمه ${reversePieces} قطعة (تم بيع أو صرف جزء من الشحنة).`
        );
      }
    }

    const staffId = await resolveStaffId(tx, options?.operator);

    // 3. Reverse Product Stock and Record Purchase Reversal Inventory Outflow
    for (const it of items) {
      const prod = productsMap.get(it.productId);
      const curStock = Number(prod.currentStockPieces) || 0;
      const reversePieces = Number(it.totalPieces) || 0;
      const newStockPieces = curStock - reversePieces;

      await tx
        .update(products)
        .set({ currentStockPieces: newStockPieces })
        .where(eq(products.id, it.productId));

      await tx.insert(inventoryMovements).values({
        productId: it.productId,
        movementType: 'purchase_reversal',
        quantityPieces: -reversePieces, // signed negative for stock reversal
        unitCostPieces: String(it.pieceCostPrice),
        totalCost: String(it.total),
        balanceAfterPieces: newStockPieces,
        referenceType: 'purchase_invoice',
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        performedByStaffId: staffId,
        notes: `عكس فاتورة شراء ${invoice.invoiceNumber} (${it.quantity} كرتون = ${reversePieces} قطعة)${reason ? ' - سبب: ' + reason : ''}`,
      });
    }

    // 4. Update Invoice Row to Cancelled
    const [updatedInvoice] = await tx
      .update(purchaseInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledByStaffId: staffId,
        cancellationReason: reason?.trim() || null,
      })
      .where(eq(purchaseInvoices.id, invoice.id))
      .returning();

    // 5. Append-only Supplier Financial Reversal / Refund Claim (DB-Level Idempotency)
    // If invoice had a cash payment (paidAmount > 0), the company holds a receivable claim against the supplier
    const paidAmount = toNumber(invoice.paidAmount);
    if (paidAmount > 0) {
      const existingClaims = await tx
        .select()
        .from(supplierRefundClaims)
        .where(eq(supplierRefundClaims.purchaseInvoiceId, invoice.id))
        .limit(1);

      if (existingClaims.length === 0) {
        const claimSeqRows: any = await tx.execute(sql`SELECT nextval('supplier_claim_seq') as seq`);
        const claimSeq = claimSeqRows[0]?.seq || claimSeqRows?.rows?.[0]?.seq || 1001;
        const claimNumber = `CLAIM-${claimSeq}`;

        await tx.insert(supplierRefundClaims).values({
          claimNumber,
          purchaseInvoiceId: invoice.id,
          supplierAccountId: invoice.supplierAccountId,
          claimAmount: String(paidAmount.toFixed(2)),
          refundedAmount: '0.00',
          status: 'pending',
          notes: `مطالبة استرداد مالي عن إلغاء فاتورة شراء مدفوعة جزئياً أو كلياً: ${invoice.invoiceNumber}`,
        });
      }
    }

    // 6. Audit Log
    await tx.insert(auditLogs).values({
      actionType: 'purchase_cancelled',
      actionLabel: 'إلغاء فاتورة شراء وعكس المخزون والمطالبة المالية',
      category: 'inventory',
      categoryLabel: 'المستودع والمشتريات',
      staffId,
      operatorSnapshot: options?.operator || null,
      targetType: 'purchase_invoice',
      targetId: invoice.id,
      targetReferenceNumber: invoice.invoiceNumber,
      financialImpact: {
        totalAmount: toNumber(invoice.totalAmount),
        paidAmount: toNumber(invoice.paidAmount),
        remainingLiabilityCancelled: toNumber(invoice.remainingAmount),
        claimAmountCreated: paidAmount > 0 ? paidAmount : 0,
      },
      details: `إلغاء فاتورة الشراء ${invoice.invoiceNumber} وعكس كميات المخزون المستلمة${reason ? ' - السبب: ' + reason : ''}`,
      severity: 'warning',
    });

    return formatPurchaseRecord(updatedInvoice, items);
  };

  if (options?.tx) {
    return await executeCancel(options.tx);
  } else {
    const db = getDb();
    return await db.transaction(executeCancel);
  }
}

/**
 * تسجيل استرداد مالي فعلي من المورد (Supplier Cash / Bank Refund)
 * يربط بسند قبض رسمي (Receipt Voucher) ويسجل دخول نقدية إلى القاصة،
 * ويخفض رصيد مطالبة الاسترداد المسجلة عن إلغاء الفاتورة.
 */
export async function pgRecordSupplierRefund(
  inputOrClaimId:
    | string
    | {
        claimId?: string;
        invoiceId?: string;
        amount: number;
        paymentMethod?: string;
        notes?: string;
      },
  dataOrOptions?: any,
  maybeOptions?: { operator?: PgOperator; tx?: any }
) {
  let input: {
    claimId?: string;
    invoiceId?: string;
    amount: number;
    paymentMethod?: string;
    notes?: string;
  };
  let options: { operator?: PgOperator; tx?: any } | undefined;

  if (typeof inputOrClaimId === 'string') {
    input = {
      claimId: inputOrClaimId,
      ...(dataOrOptions || {}),
    };
    options = maybeOptions;
  } else {
    input = inputOrClaimId;
    options = dataOrOptions;
  }

  const executeRefund = async (tx: any) => {
    const refundAmount = toNumber(input.amount);
    if (refundAmount <= 0) {
      throw new Error('مبلغ الاسترداد يجب أن يكون أكبر من الصفر');
    }

    // 1. Resolve Claim
    let claimRow: any = null;
    if (input.claimId) {
      const rows = await tx
        .select()
        .from(supplierRefundClaims)
        .where(eq(supplierRefundClaims.id, input.claimId))
        .limit(1);
      if (rows.length > 0) claimRow = rows[0];
    } else if (input.invoiceId) {
      const rows = await tx
        .select()
        .from(supplierRefundClaims)
        .where(eq(supplierRefundClaims.purchaseInvoiceId, input.invoiceId))
        .limit(1);
      if (rows.length > 0) claimRow = rows[0];
    }

    if (!claimRow) {
      throw new Error('لم يتم العثور على مطالبة استرداد للمورد');
    }

    // 2. Strict Concurrency Lock Ordering:
    // Level 1 Lock: financialAccounts FOR UPDATE (Unifies synchronization point across all supplier financial ops)
    const [supplierAccount] = await tx
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.id, claimRow.supplierAccountId))
      .for('update');

    if (!supplierAccount) {
      throw new Error('حساب المورد المالي غير موجود');
    }

    // Level 3 Lock: supplierRefundClaims FOR UPDATE
    const [lockedClaim] = await tx
      .select()
      .from(supplierRefundClaims)
      .where(eq(supplierRefundClaims.id, claimRow.id))
      .for('update');

    if (lockedClaim.status === 'cancelled') {
      throw new Error('مطالبة الاسترداد ملغاة ولا يمكن استرداد مبالغ منها');
    }

    const claimAmount = toNumber(lockedClaim.claimAmount);
    const currentRefunded = toNumber(lockedClaim.refundedAmount);
    const remainingClaim = Math.max(0, claimAmount - currentRefunded);

    if (remainingClaim <= 0 || lockedClaim.status === 'completed') {
      throw new Error('تم استرداد كامل مبلغ المطالبة مسبقاً');
    }

    if (refundAmount > remainingClaim) {
      throw new Error(`مبلغ الاسترداد (${refundAmount.toLocaleString()} د.ع) يتجاوز الرصيد المتبقي للمطالبة (${remainingClaim.toLocaleString()} د.ع)`);
    }

    const staffId = await resolveStaffId(tx, options?.operator);
    const method = input.paymentMethod || 'cash';

    // 3. Issue Official Receipt Voucher (سند قبض رسمي من المورد)
    const receiptNumber = transactionNumber('RCV');
    const [voucher] = await tx
      .insert(vouchers)
      .values({
        receiptNumber,
        accountId: lockedClaim.supplierAccountId,
        voucherType: 'receipt',
        amount: String(refundAmount.toFixed(2)),
        paymentMethod: method,
        receivedByStaffId: staffId,
        notes: input.notes?.trim() || `استرداد مالي من المورد عن مطالبة رقم ${lockedClaim.claimNumber}`,
      })
      .returning();

    // 4. Record Real Cash Vault Inflow if Cash (Actual Money Received)
    let vaultMovementRow: any = null;
    if (method === 'cash') {
      const [vRow] = await tx
        .insert(cashVaultMovements)
        .values({
          transactionNumber: transactionNumber('CV'),
          type: 'inflow',
          category: 'supplier_refund',
          categoryLabel: 'استرداد مالي من مورد',
          amount: String(refundAmount.toFixed(2)),
          referenceType: 'voucher',
          referenceId: voucher.id,
          referenceNumber: voucher.receiptNumber,
          partyName: supplierAccount.businessName || supplierAccount.name,
          staffId,
          notes: input.notes?.trim() || `استرداد نقدي فعلي من المورد عن مطالبة ${lockedClaim.claimNumber}`,
        })
        .returning();
      vaultMovementRow = vRow;
    }

    // 5. Update Claim Refunded Amount & Status
    const newRefunded = currentRefunded + refundAmount;
    const newStatus = newRefunded >= claimAmount ? 'completed' : 'partially_refunded';
    const [updatedClaim] = await tx
      .update(supplierRefundClaims)
      .set({
        refundedAmount: String(newRefunded.toFixed(2)),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(supplierRefundClaims.id, lockedClaim.id))
      .returning();

    // 6. Record in supplier_refunds table
    const srefSeqRows: any = await tx.execute(sql`SELECT nextval('supplier_refund_seq') as seq`);
    const srefSeq = srefSeqRows[0]?.seq || srefSeqRows?.rows?.[0]?.seq || 1001;
    const refundNumber = `SREF-${srefSeq}`;

    const [insertedRefund] = await tx
      .insert(supplierRefunds)
      .values({
        refundNumber,
        claimId: lockedClaim.id,
        supplierAccountId: lockedClaim.supplierAccountId,
        amount: String(refundAmount.toFixed(2)),
        paymentMethod: method,
        voucherId: voucher.id,
        processedByStaffId: staffId,
        notes: input.notes?.trim() || null,
      })
      .returning();

    // 7. Audit Log
    await tx.insert(auditLogs).values({
      actionType: 'supplier_refund_received',
      actionLabel: 'استلام استرداد مالي من مورد',
      category: 'accounting',
      categoryLabel: 'المحاسبة والمالية',
      staffId,
      operatorSnapshot: options?.operator || null,
      targetType: 'supplier_refund',
      targetId: insertedRefund.id,
      targetReferenceNumber: refundNumber,
      financialImpact: {
        refundAmount,
        remainingClaim: Math.max(0, claimAmount - newRefunded),
      },
      details: `استلام استرداد مالي بمبلغ ${refundAmount.toLocaleString()} د.ع من المورد ${supplierAccount.name} عن المطالبة ${lockedClaim.claimNumber}`,
      severity: 'info',
    });

    return {
      success: true,
      refund: insertedRefund,
      claim: updatedClaim,
      voucher,
      vaultMovement: vaultMovementRow,
    };
  };

  if (options?.tx) {
    return await executeRefund(options.tx);
  } else {
    const db = getDb();
    return await db.transaction(executeRefund);
  }
}

export async function pgGetSupplierRefundClaims(filter?: string | { supplierAccountId?: string; purchaseInvoiceId?: string }) {
  const db = getDb();
  if (typeof filter === 'string' && filter.trim()) {
    const trimmed = filter.trim();
    return await db
      .select()
      .from(supplierRefundClaims)
      .where(or(eq(supplierRefundClaims.supplierAccountId, trimmed), eq(supplierRefundClaims.purchaseInvoiceId, trimmed)))
      .orderBy(desc(supplierRefundClaims.createdAt));
  } else if (filter && typeof filter === 'object') {
    const conditions = [];
    if (filter.supplierAccountId) conditions.push(eq(supplierRefundClaims.supplierAccountId, filter.supplierAccountId));
    if (filter.purchaseInvoiceId) conditions.push(eq(supplierRefundClaims.purchaseInvoiceId, filter.purchaseInvoiceId));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(supplierRefundClaims)
        .where(and(...conditions))
        .orderBy(desc(supplierRefundClaims.createdAt));
    }
  }
  return await db.select().from(supplierRefundClaims).orderBy(desc(supplierRefundClaims.createdAt));
}
