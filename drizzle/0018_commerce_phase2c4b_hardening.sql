-- Migration 0018: Commerce-2C4B Purchases, Merchant Identity & Return/Refund Hardening

-- 1. Extend financial_accounts for PostgreSQL-Authoritative Merchant Identity
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "merchant_status" varchar(20) DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "merchant_tier" varchar(20);
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "business_type" varchar(150);
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "storefront_image" text;
--> statement-breakpoint
ALTER TABLE "financial_accounts" DROP CONSTRAINT IF EXISTS "chk_account_merchant_status";
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "chk_account_merchant_status" 
  CHECK ("merchant_status" IN ('none', 'pending', 'approved', 'rejected'));
--> statement-breakpoint
ALTER TABLE "financial_accounts" DROP CONSTRAINT IF EXISTS "chk_account_merchant_tier";
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "chk_account_merchant_tier" 
  CHECK ("merchant_tier" IS NULL OR "merchant_tier" IN ('bronze', 'silver', 'gold'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_accounts_merchant_status" ON "financial_accounts" ("merchant_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_accounts_merchant_tier" ON "financial_accounts" ("merchant_tier");
--> statement-breakpoint

-- Backfill existing financial_accounts based on current pricing_tier
UPDATE "financial_accounts"
SET "merchant_status" = 'approved',
    "merchant_tier" = CASE
      WHEN "pricing_tier" = 'special' THEN 'silver'
      WHEN "pricing_tier" = 'wholesale' AND "merchant_tier" IS NULL THEN 'bronze'
      ELSE "merchant_tier"
    END
WHERE "pricing_tier" IN ('market', 'wholesale', 'special')
  AND "category" = 'customer'
  AND "is_active" = true;
--> statement-breakpoint

-- 2. Extend purchase_invoices for Immutable Audit Soft-Cancellation
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "cancelled_by_staff_id" uuid REFERENCES "staff_profiles"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;
--> statement-breakpoint
ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "chk_purchase_invoice_status";
--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "chk_purchase_invoice_status" 
  CHECK ("status" IN ('active', 'cancelled'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchase_invoices_status" ON "purchase_invoices" ("status");
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS purchase_seq START WITH 1001;
--> statement-breakpoint

-- 3. Extend inventory_movements check constraint to include 'purchase_reversal'
ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "chk_inventory_movement_type";
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "chk_inventory_movement_type" 
  CHECK ("movement_type" IN ('purchase', 'purchase_reversal', 'sale', 'customer_return', 'order_cancellation', 'damage_spoilage', 'manual_adjustment'));
--> statement-breakpoint

-- 4. Extend orders for Customer Refund Tracking
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refunded_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refund_status" varchar(30) DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "chk_order_refund_status";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "chk_order_refund_status" 
  CHECK ("refund_status" IN ('none', 'pending', 'refunded'));
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "chk_order_refunded_amount";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "chk_order_refunded_amount" 
  CHECK ("refunded_amount" >= 0);
--> statement-breakpoint

-- 5. Create order_refunds table with DB-level idempotency
CREATE TABLE IF NOT EXISTS "order_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "refund_number" varchar(50) NOT NULL UNIQUE,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "account_id" uuid NOT NULL REFERENCES "financial_accounts"("id") ON DELETE RESTRICT,
  "amount" numeric(14, 2) NOT NULL,
  "method" varchar(30) DEFAULT 'cash' NOT NULL,
  "status" varchar(20) DEFAULT 'completed' NOT NULL,
  "reason" text,
  "processed_by_staff_id" uuid REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "voucher_id" uuid REFERENCES "vouchers"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chk_refund_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "chk_refund_status" CHECK ("status" IN ('pending', 'completed', 'cancelled')),
  CONSTRAINT "chk_refund_method" CHECK ("method" IN ('cash', 'store_credit', 'electronic', 'bank_transfer', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_order_refunds_order_id" ON "order_refunds" ("order_id") WHERE "status" != 'cancelled';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_refunds_account_id" ON "order_refunds" ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_refunds_order_id" ON "order_refunds" ("order_id");
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS refund_seq START WITH 1001;
