-- ============================================================================
-- 0010: ORDER COUPON SNAPSHOT & COUPON ARCHIVAL
-- ============================================================================

-- 1. Historical Coupon Snapshot in orders table
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_id" uuid;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_code_snap" varchar(50);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_discount_type_snap" varchar(20);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_discount_value_snap" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_coupon_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_coupon_code_snap" ON "orders" USING btree ("coupon_code_snap");
--> statement-breakpoint

-- 2. Coupon Archival Columns in coupons table
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coupons_is_archived" ON "coupons" USING btree ("is_archived");
