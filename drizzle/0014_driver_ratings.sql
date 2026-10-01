CREATE TABLE IF NOT EXISTS "driver_ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "order_number" varchar(50) NOT NULL,
  "customer_auth_identity_id" uuid NOT NULL,
  "customer_name" varchar(150) NOT NULL,
  "customer_phone" varchar(20) NOT NULL,
  "rating" numeric(2,1) NOT NULL,
  "tag" varchar(100),
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chk_driver_rating_range" CHECK ("driver_ratings"."rating" >= 1 AND "driver_ratings"."rating" <= 5)
);
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
