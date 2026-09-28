-- ============================================================================
-- 0015: COUPON REDEMPTION IDEMPOTENCY & CANONICAL PHONE (COMMERCE-2C1 HARDENING)
-- ============================================================================

-- 1. Migrate any existing non-canonical phone numbers in coupon_redemptions to canonical format (9647xxxxxxxxx)
UPDATE "coupon_redemptions"
SET "customer_phone" = '964' || SUBSTRING("customer_phone" FROM 2)
WHERE "customer_phone" LIKE '07%' AND LENGTH("customer_phone") = 11;
--> statement-breakpoint

-- 2. Add UNIQUE constraint on order_id to enforce strictly one redemption per order and prevent duplicate redemptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coupon_redemptions_order_id_unique'
  ) THEN
    -- Verify no duplicate order_id entries exist before adding constraint
    IF EXISTS (
      SELECT "order_id" FROM "coupon_redemptions" GROUP BY "order_id" HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot add UNIQUE constraint: duplicate order_id entries exist in coupon_redemptions';
    END IF;

    ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_unique" UNIQUE ("order_id");
  END IF;
END $$;
