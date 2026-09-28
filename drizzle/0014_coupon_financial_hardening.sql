-- ============================================================================
-- 0014: COUPON FINANCIAL HARDENING (COMMERCE-2C1)
-- ============================================================================

-- 1. Add financial hardening columns to coupons table
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "max_discount_amount" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "per_customer_limit" integer;
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "exclude_discounted_items" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_coupon_max_discount'
  ) THEN
    ALTER TABLE "coupons" ADD CONSTRAINT "chk_coupon_max_discount" CHECK ("max_discount_amount" IS NULL OR "max_discount_amount" > 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_coupon_per_customer_limit'
  ) THEN
    ALTER TABLE "coupons" ADD CONSTRAINT "chk_coupon_per_customer_limit" CHECK ("per_customer_limit" IS NULL OR "per_customer_limit" > 0);
  END IF;
END $$;
--> statement-breakpoint

-- 2. Create coupon_redemptions table for tracking per-customer usage
CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "coupon_id" uuid NOT NULL REFERENCES "coupons"("id") ON DELETE CASCADE,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "order_number" varchar(50) NOT NULL,
  "customer_id" uuid REFERENCES "financial_accounts"("id") ON DELETE SET NULL,
  "customer_phone" varchar(30) NOT NULL,
  "discount_amount" numeric(14, 2) NOT NULL,
  "redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coupon_redemptions_coupon_id" ON "coupon_redemptions" USING btree ("coupon_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coupon_redemptions_order_id" ON "coupon_redemptions" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coupon_redemptions_customer_id" ON "coupon_redemptions" USING btree ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coupon_redemptions_phone" ON "coupon_redemptions" USING btree ("customer_phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coupon_redemptions_coupon_phone" ON "coupon_redemptions" USING btree ("coupon_id", "customer_phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coupon_redemptions_coupon_customer" ON "coupon_redemptions" USING btree ("coupon_id", "customer_id");
--> statement-breakpoint

-- 3. Add historical snapshot columns to orders table
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_max_discount_snap" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_eligible_subtotal_snap" numeric(14, 2);
