ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "avatar" text;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "latitude" double precision;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "longitude" double precision;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "maps_url" text;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "saved_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL;

DO $$ BEGIN
  ALTER TABLE "financial_accounts" ADD CONSTRAINT "chk_account_latitude" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "financial_accounts" ADD CONSTRAINT "chk_account_longitude" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
