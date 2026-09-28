-- ============================================================================
-- 0013: PRODUCT ACTIVE & ARCHIVED LIFECYCLE (PHASE COMMERCE-2B4)
-- ============================================================================

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_products_is_active" ON "products" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_products_is_archived" ON "products" USING btree ("is_archived");
