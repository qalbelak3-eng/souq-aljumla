-- ============================================================================
-- 0011: PROMOTIONAL OFFERS SNAPSHOT & ARCHIVAL
-- ============================================================================

-- 1. Archival columns in product_offers table
ALTER TABLE "product_offers" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_offers" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offers_is_archived" ON "product_offers" USING btree ("is_archived");
--> statement-breakpoint

-- 2. Historical Offer Snapshot columns in order_items table
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "original_price_snap" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "offer_id_snap" uuid;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "offer_discount_snap" numeric(14, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_offer_id_snap_fk";
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_offer_id_snap_fk" FOREIGN KEY ("offer_id_snap") REFERENCES "public"."product_offers"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_offer_id_snap" ON "order_items" USING btree ("offer_id_snap");
