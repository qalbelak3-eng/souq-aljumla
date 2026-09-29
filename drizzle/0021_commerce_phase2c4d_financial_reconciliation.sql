-- Migration 0021: Commerce Phase 2C4D - Customer Payment Separation, Refund Claims Lifecycle, and Financial Reconciliation

-- 1. Preflight Safety Verification (Fail-Fast against corrupt/negative numbers)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE collected_amount < 0) THEN
    RAISE EXCEPTION 'Preflight failed: found negative collected_amount in orders table';
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE remaining_debt_amount < 0) THEN
    RAISE EXCEPTION 'Preflight failed: found negative remaining_debt_amount in orders table';
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE delivery_fee < 0) THEN
    RAISE EXCEPTION 'Preflight failed: found negative delivery_fee in orders table';
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE discount < 0) THEN
    RAISE EXCEPTION 'Preflight failed: found negative discount in orders table';
  END IF;
END $$;
--> statement-breakpoint

-- 2. Ensure Required Sequences
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1000;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS settlement_seq START WITH 1000;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS vault_csh_seq START WITH 1000;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS refund_seq START WITH 1000;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS customer_claim_seq START WITH 1000;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS customer_refund_seq START WITH 1000;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS voucher_receipt_seq START WITH 1000;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS voucher_disb_seq START WITH 1000;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS voucher_rev_seq START WITH 1000;
--> statement-breakpoint

-- 3. Add paid_amount to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount numeric(14, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint

-- 4. Backfill paid_amount for historical orders
UPDATE orders 
SET paid_amount = total 
WHERE payment_method IN ('online', 'zaincash', 'qicard', 'bank_transfer') 
  AND status IN ('delivered', 'returned');
--> statement-breakpoint

UPDATE orders 
SET paid_amount = collected_amount 
WHERE paid_amount = 0 AND collected_amount > 0;
--> statement-breakpoint

-- 5. Update chk_order_refund_status on orders to allow 'partially_refunded'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_refund_status;
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT chk_order_refund_status 
  CHECK (refund_status IN ('none', 'pending', 'partially_refunded', 'refunded'));
--> statement-breakpoint

-- 6. Update chk_vault_category on cash_vault_movements to allow 'customer_refund'
ALTER TABLE cash_vault_movements DROP CONSTRAINT IF EXISTS chk_vault_category;
--> statement-breakpoint
ALTER TABLE cash_vault_movements ADD CONSTRAINT chk_vault_category 
  CHECK (category IN (
    'sales_cash',
    'debt_collection',
    'driver_settlement',
    'purchase_payment',
    'expense',
    'owner_withdrawal',
    'deposit_adjustment',
    'adjustment',
    'supplier_refund',
    'customer_refund'
  ));
--> statement-breakpoint

-- 7. Add Check Constraints on orders
ALTER TABLE orders ADD CONSTRAINT chk_orders_paid_amount_non_negative 
  CHECK (paid_amount >= 0);
--> statement-breakpoint

ALTER TABLE orders ADD CONSTRAINT chk_orders_collected_le_paid 
  CHECK (collected_amount <= paid_amount + 0.01);
--> statement-breakpoint

ALTER TABLE orders ADD CONSTRAINT chk_orders_settled_le_collected 
  CHECK (settled_amount <= collected_amount + 0.01);
--> statement-breakpoint

ALTER TABLE orders ADD CONSTRAINT chk_orders_refunded_le_paid 
  CHECK (refunded_amount <= paid_amount + 0.01);
--> statement-breakpoint

-- 8. Create customer_refund_claims table
CREATE TABLE IF NOT EXISTS customer_refund_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number varchar(50) NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  claim_amount numeric(14, 2) NOT NULL,
  refunded_amount numeric(14, 2) DEFAULT '0.00' NOT NULL,
  status varchar(30) DEFAULT 'pending' NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT chk_cclaim_amount_positive CHECK (claim_amount > 0),
  CONSTRAINT chk_cclaim_refunded_non_negative CHECK (refunded_amount >= 0),
  CONSTRAINT chk_cclaim_refunded_le_claim CHECK (refunded_amount <= claim_amount),
  CONSTRAINT chk_cclaim_status CHECK (status IN ('pending', 'partially_refunded', 'completed'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_refund_claims_order_id 
  ON customer_refund_claims (order_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customer_refund_claims_account_id 
  ON customer_refund_claims (account_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customer_refund_claims_status 
  ON customer_refund_claims (status);
--> statement-breakpoint

-- 9. Create customer_refunds table (append-only ledger of actual refund payments)
CREATE TABLE IF NOT EXISTS customer_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_number varchar(50) NOT NULL UNIQUE,
  claim_id uuid NOT NULL REFERENCES customer_refund_claims(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL,
  method varchar(30) DEFAULT 'cash' NOT NULL,
  voucher_id uuid REFERENCES vouchers(id) ON DELETE SET NULL,
  processed_by_staff_id uuid REFERENCES staff_profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT chk_crefund_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_crefund_method CHECK (method IN ('cash', 'store_credit', 'electronic', 'bank_transfer', 'other'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_customer_refunds_claim_id 
  ON customer_refunds (claim_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customer_refunds_order_id 
  ON customer_refunds (order_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customer_refunds_account_id 
  ON customer_refunds (account_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customer_refunds_voucher_id 
  ON customer_refunds (voucher_id);
