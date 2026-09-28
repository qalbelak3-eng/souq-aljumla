-- Migration 0017: Commerce-2C3 Order Lifecycle & Financial Reversal Integrity

-- 1. Update orders.status CHECK constraint to include 'returned'
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "chk_order_status";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "chk_order_status" 
  CHECK ("status" IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'));
--> statement-breakpoint

-- 2. Update cashback_ledger.type CHECK constraint to include 'clawback'
ALTER TABLE "cashback_ledger" DROP CONSTRAINT IF EXISTS "chk_cashback_type";
--> statement-breakpoint
ALTER TABLE "cashback_ledger" ADD CONSTRAINT "chk_cashback_type" 
  CHECK ("type" IN ('earned', 'redeemed', 'reversed', 'expired', 'adjustment', 'clawback'));
--> statement-breakpoint

-- 3. Add Partial Unique Index for cashback_ledger clawback
-- An order can have earned cashback clawed back at most ONCE
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashback_ledger_order_clawback" 
ON "cashback_ledger" ("order_id") 
WHERE "type" = 'clawback' AND "order_id" IS NOT NULL;
--> statement-breakpoint

-- 4. Add columns to coupon_redemptions to track release lifecycle without hard delete
ALTER TABLE "coupon_redemptions" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD COLUMN IF NOT EXISTS "released_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" DROP CONSTRAINT IF EXISTS "chk_coupon_redemptions_status";
--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "chk_coupon_redemptions_status" 
  CHECK ("status" IN ('active', 'released'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coupon_redemptions_status" ON "coupon_redemptions" ("status");
