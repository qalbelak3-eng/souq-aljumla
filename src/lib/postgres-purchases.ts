import { getDb, getPostgresClient } from '@/db/client';
import { purchaseInvoices, purchaseInvoiceItems } from '@/db/schema/purchases';
import { products, companies } from '@/db/schema/catalog';
import { inventoryMovements } from '@/db/schema/inventory';
import { financialAccounts } from '@/db/schema/accounts';
import { staffProfiles } from '@/db/schema/auth';
import { auditLogs } from '@/db/schema/operations';
import { PurchaseInvoice, PurchaseInvoiceItem } from '@/types';
import { normalizePhoneForFinancialIdentity } from '@/lib/phone-utils';
import { validateOrderItemQuantity } from '@/lib/pricing';
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

    // 1. Lock Purchase Invoice Row FOR UPDATE
    const invoiceRows = await tx
      .select()
      .from(purchaseInvoices)
      .where(or(...conditions))
      .for('update');

    if (invoiceRows.length === 0) {
      throw new Error('فاتورة الشراء غير موجودة');
    }
    const invoice = invoiceRows[0];

    // Idempotency: If already cancelled, return existing state cleanly
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

    // 2. Deterministic Product Locking FOR UPDATE
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

    // 3. Verify Stock Sufficiency Before Reversing
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

    // 4. Reverse Product Stock and Record Purchase Reversal Inventory Outflow
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

    // 5. Update Invoice Row to Cancelled
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

    // 6. Audit Log
    await tx.insert(auditLogs).values({
      actionType: 'purchase_cancelled',
      actionLabel: 'إلغاء فاتورة شراء وعكس المخزون',
      category: 'inventory',
      categoryLabel: 'المستودع والمشتريات',
      staffId,
      operatorSnapshot: options?.operator || null,
      targetType: 'purchase_invoice',
      targetId: invoice.id,
      targetReferenceNumber: invoice.invoiceNumber,
      financialImpact: {
        totalAmount: toNumber(invoice.totalAmount),
        reversedAmount: toNumber(invoice.totalAmount),
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
