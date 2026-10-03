CREATE TABLE IF NOT EXISTS "company_categories" (
	"company_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "company_categories_company_id_category_id_pk" PRIMARY KEY("company_id","category_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_categories" ADD CONSTRAINT "company_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_company_categories_category_id" ON "company_categories" USING btree ("category_id");
