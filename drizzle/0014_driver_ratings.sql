CREATE TABLE IF NOT EXISTS "driver_ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "order_number" varchar(50) NOT NULL,
  "customer_auth_identity_id" uuid,
  "customer_name" varchar(150) NOT NULL,
  "customer_phone" varchar(20) NOT NULL,
  "rating" numeric(2,1) NOT NULL,
  "tag" varchar(100),
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chk_driver_rating_range" CHECK ("driver_ratings"."rating" >= 1 AND "driver_ratings"."rating" <= 5)
);
--> statement-breakpoint
ALTER TABLE "driver_ratings" ADD COLUMN IF NOT EXISTS "customer_auth_identity_id" uuid;
--> statement-breakpoint
UPDATE "driver_ratings" dr
SET "customer_auth_identity_id" = COALESCE(
  (SELECT fa.auth_identity_id FROM orders o JOIN financial_accounts fa ON o.account_id = fa.id WHERE o.id = dr.order_id AND fa.auth_identity_id IS NOT NULL LIMIT 1),
  (SELECT auth_identity_id FROM financial_accounts WHERE phone = dr.customer_phone AND auth_identity_id IS NOT NULL LIMIT 1),
  (SELECT id FROM auth_identities WHERE phone = dr.customer_phone AND is_active = true LIMIT 1)
)
WHERE dr.customer_auth_identity_id IS NULL;
--> statement-breakpoint
DO $$
DECLARE
  unlinked_count integer;
BEGIN
  SELECT count(*) INTO unlinked_count FROM "driver_ratings" WHERE "customer_auth_identity_id" IS NULL;
  IF unlinked_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_FAILED: Cannot enforce NOT NULL on driver_ratings.customer_auth_identity_id. Found % unlinked historical rating row(s) without matching customer auth identity.', unlinked_count;
  END IF;

  ALTER TABLE "driver_ratings" ALTER COLUMN "customer_auth_identity_id" SET NOT NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_customer_auth_identity_id_auth_identities_id_fk" FOREIGN KEY ("customer_auth_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_driver_ratings_order_customer" ON "driver_ratings" USING btree ("order_id", "customer_auth_identity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_driver_ratings_driver_id" ON "driver_ratings" USING btree ("driver_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_driver_ratings_order_id" ON "driver_ratings" USING btree ("order_id");
