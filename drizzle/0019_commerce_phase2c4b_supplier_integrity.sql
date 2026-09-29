-- Migration 0019: Commerce-2C4B Supplier Financial Integrity & Reversal Hardening

-- 1. Fail-Fast Data Check on purchase_invoices before applying constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "purchase_invoices"
    WHERE "paid_amount" < 0
       OR "remaining_amount" < 0
       OR "paid_amount" > "total_amount"
       OR ("paid_amount" + "remaining_amount") != "total_amount"
  ) THEN
    RAISE EXCEPTION 'Existing purchase_invoices fail financial integrity check constraints';
  END IF;
END $$;
--> statement-breakpoint

-- 2. Add Mathematical Check Constraints on purchase_invoices
ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "chk_purchase_paid_non_negative";
--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "chk_purchase_paid_non_negative" 
  CHECK ("paid_amount" >= 0);
--> statement-breakpoint
ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "chk_purchase_remaining_non_negative";
--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "chk_purchase_remaining_non_negative" 
  CHECK ("remaining_amount" >= 0);
--> statement-breakpoint
ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "chk_purchase_paid_le_total";
--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "chk_purchase_paid_le_total" 
  CHECK ("paid_amount" <= "total_amount");
--> statement-breakpoint
ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "chk_purchase_amounts_balance";
--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "chk_purchase_amounts_balance" 
  CHECK ("paid_amount" + "remaining_amount" = "total_amount");
--> statement-breakpoint

-- 3. Sequences for Supplier Claims and Supplier Refunds
CREATE SEQUENCE IF NOT EXISTS supplier_claim_seq START WITH 1001;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS supplier_refund_seq START WITH 1001;
--> statement-breakpoint

-- 4. Create supplier_refund_claims table for tracking receivables from cancelled paid purchases
CREATE TABLE IF NOT EXISTS "supplier_refund_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "claim_number" varchar(50) NOT NULL UNIQUE,
  "purchase_invoice_id" uuid NOT NULL REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT,
  "supplier_account_id" uuid NOT NULL REFERENCES "financial_accounts"("id") ON DELETE RESTRICT,
  "claim_amount" numeric(14, 2) NOT NULL,
  "refunded_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_supplier_refund_claims_purchase_invoice_id" 
  ON "supplier_refund_claims" ("purchase_invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_claims_supplier_id" 
  ON "supplier_refund_claims" ("supplier_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_claims_status" 
  ON "supplier_refund_claims" ("status");
--> statement-breakpoint
ALTER TABLE "supplier_refund_claims" DROP CONSTRAINT IF EXISTS "chk_claim_amount_positive";
--> statement-breakpoint
ALTER TABLE "supplier_refund_claims" ADD CONSTRAINT "chk_claim_amount_positive" 
  CHECK ("claim_amount" > 0);
--> statement-breakpoint
ALTER TABLE "supplier_refund_claims" DROP CONSTRAINT IF EXISTS "chk_claim_refunded_non_negative";
--> statement-breakpoint
ALTER TABLE "supplier_refund_claims" ADD CONSTRAINT "chk_claim_refunded_non_negative" 
  CHECK ("refunded_amount" >= 0);
--> statement-breakpoint
ALTER TABLE "supplier_refund_claims" DROP CONSTRAINT IF EXISTS "chk_claim_refunded_le_claim";
--> statement-breakpoint
ALTER TABLE "supplier_refund_claims" ADD CONSTRAINT "chk_claim_refunded_le_claim" 
  CHECK ("refunded_amount" <= "claim_amount");
--> statement-breakpoint
ALTER TABLE "supplier_refund_claims" DROP CONSTRAINT IF EXISTS "chk_claim_status";
--> statement-breakpoint
ALTER TABLE "supplier_refund_claims" ADD CONSTRAINT "chk_claim_status" 
  CHECK ("status" IN ('pending', 'partially_refunded', 'completed', 'cancelled'));
--> statement-breakpoint

-- 5. Create supplier_refunds table for actual cash refunds received from suppliers
CREATE TABLE IF NOT EXISTS "supplier_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "refund_number" varchar(50) NOT NULL UNIQUE,
  "claim_id" uuid NOT NULL REFERENCES "supplier_refund_claims"("id") ON DELETE RESTRICT,
  "supplier_account_id" uuid NOT NULL REFERENCES "financial_accounts"("id") ON DELETE RESTRICT,
  "amount" numeric(14, 2) NOT NULL,
  "payment_method" varchar(20) DEFAULT 'cash' NOT NULL,
  "voucher_id" uuid REFERENCES "vouchers"("id") ON DELETE SET NULL,
  "processed_by_staff_id" uuid REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_refunds_claim_id" 
  ON "supplier_refunds" ("claim_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_supplier_refunds_account_id" 
  ON "supplier_refunds" ("supplier_account_id");
--> statement-breakpoint
ALTER TABLE "supplier_refunds" DROP CONSTRAINT IF EXISTS "chk_srefund_amount_positive";
--> statement-breakpoint
ALTER TABLE "supplier_refunds" ADD CONSTRAINT "chk_srefund_amount_positive" 
  CHECK ("amount" > 0);
--> statement-breakpoint

-- 6. Update cash_vault_movements category check constraint to include 'supplier_refund'
ALTER TABLE "cash_vault_movements" DROP CONSTRAINT IF EXISTS "chk_vault_category";
--> statement-breakpoint
ALTER TABLE "cash_vault_movements" ADD CONSTRAINT "chk_vault_category" 
  CHECK ("category" IN ('sales_cash', 'debt_collection', 'driver_settlement', 'purchase_payment', 'expense', 'owner_withdrawal', 'deposit_adjustment', 'adjustment', 'supplier_refund'));
