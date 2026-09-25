-- ============================================================================
-- 0007: SECURE CUSTOMER DELIVERY PIN & PROOF OF DELIVERY
-- ============================================================================

-- 1. Add Delivery PIN Security & Attempt Tracking Columns to orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_pin_hash" varchar(255);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_pin_seed" varchar(64);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_pin_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_pin_locked_until" timestamp with time zone;
--> statement-breakpoint

-- 2. Add Delivery Verification Metadata & Admin Override Columns to orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_proof_method" varchar(30);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_override_reason" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_override_by" uuid;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_override_by_name" varchar(150);
--> statement-breakpoint

-- 3. Constraints & Foreign Keys
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "chk_order_delivery_proof_method";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "chk_order_delivery_proof_method" CHECK ("delivery_proof_method" IS NULL OR "delivery_proof_method" IN ('customer_pin', 'admin_override'));
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "chk_order_delivery_pin_attempts_non_negative";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "chk_order_delivery_pin_attempts_non_negative" CHECK ("delivery_pin_attempts" >= 0);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_delivery_override_by_fk";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_override_by_fk" FOREIGN KEY ("delivery_override_by") REFERENCES "public"."auth_identities"("id") ON DELETE set null;
--> statement-breakpoint

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS "idx_orders_delivery_verified_at" ON "orders" USING btree ("delivery_verified_at");
