-- ============================================================================
-- 0012: HISTORICAL PRICING TIER SNAPSHOTS (PHASE COMMERCE-2B3)
-- ============================================================================

-- 1. Customer Pricing Identity Snapshots in orders table
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_account_type_snap" varchar(30);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_merchant_tier_snap" varchar(30);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_customer_account_type_snap" ON "orders" USING btree ("customer_account_type_snap");
--> statement-breakpoint

-- 2. Pricing Tier Applied Snapshot in order_items table
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "pricing_tier_snap" varchar(50);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_pricing_tier_snap" ON "order_items" USING btree ("pricing_tier_snap");
