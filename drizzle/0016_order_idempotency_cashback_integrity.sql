-- Migration 0016: Commerce-2C2 Order-Level Idempotency & Cashback Ledger DB Integrity

-- 1. Pre-check: Ensure no duplicate cashback entries exist for earned, redeemed, or reversed
DO $$
BEGIN
  IF EXISTS (
    SELECT "order_id", "type"
    FROM "cashback_ledger"
    WHERE "order_id" IS NOT NULL AND "type" IN ('earned', 'redeemed', 'reversed')
    GROUP BY "order_id", "type"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot apply migration 0016: duplicate order entries exist in cashback_ledger';
  END IF;
END $$;
--> statement-breakpoint

-- 2. Add idempotency_key and request_fingerprint to orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "request_fingerprint" varchar(64);
--> statement-breakpoint

-- 3. Add Partial Unique Index for orders.idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS "uq_orders_idempotency_key" 
ON "orders" ("idempotency_key") 
WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint

-- 4. Add Partial Unique Indexes on cashback_ledger to enforce DB-level integrity
-- An order can earn cashback at most ONCE
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashback_ledger_order_earned" 
ON "cashback_ledger" ("order_id") 
WHERE "type" = 'earned' AND "order_id" IS NOT NULL;
--> statement-breakpoint

-- An order can redeem cashback at most ONCE
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashback_ledger_order_redeemed" 
ON "cashback_ledger" ("order_id") 
WHERE "type" = 'redeemed' AND "order_id" IS NOT NULL;
--> statement-breakpoint

-- An order can have redeemed cashback reversed at most ONCE
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashback_ledger_order_reversed" 
ON "cashback_ledger" ("order_id") 
WHERE "type" = 'reversed' AND "order_id" IS NOT NULL;
