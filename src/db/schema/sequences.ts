import { pgSequence } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const orderNumberSeq = pgSequence('order_number_seq', {
  startWith: 1000,
  increment: 1,
});

export const voucherReceiptSeq = pgSequence('voucher_receipt_seq', {
  startWith: 1000,
  increment: 1,
});

export const voucherDisbSeq = pgSequence('voucher_disb_seq', {
  startWith: 1000,
  increment: 1,
});

export const voucherRevSeq = pgSequence('voucher_rev_seq', {
  startWith: 1000,
  increment: 1,
});

export const vaultCshSeq = pgSequence('vault_csh_seq', {
  startWith: 1000,
  increment: 1,
});

export const purchaseSeq = pgSequence('purchase_seq', {
  startWith: 1000,
  increment: 1,
});

export const settlementSeq = pgSequence('settlement_seq', {
  startWith: 1000,
  increment: 1,
});

export const accountCodeSeq = pgSequence('account_code_seq', {
  startWith: 1000,
  increment: 1,
});

// Strongly-typed SQL expressions to generate formatted sequence values without MAX()+1 (DB-2A Item 6)
export const nextOrderNumberSql = sql`'INV-' || nextval('order_number_seq')`;
export const nextReceiptNumberSql = sql`'REC-' || nextval('voucher_receipt_seq')`;
export const nextDisbursementNumberSql = sql`'DSB-' || nextval('voucher_disb_seq')`;
export const nextReversalNumberSql = sql`'REV-' || nextval('voucher_rev_seq')`;
export const nextVaultTransactionNumberSql = sql`'CSH-' || nextval('vault_csh_seq')`;
export const nextPurchaseInvoiceNumberSql = sql`'PUR-' || nextval('purchase_seq')`;
export const nextSettlementNumberSql = sql`'SET-' || nextval('settlement_seq')`;
export const nextAccountCodeSql = sql`'ACC-' || nextval('account_code_seq')`;
