CREATE TABLE IF NOT EXISTS "lucky_wheel_settings" (
  "id" integer PRIMARY KEY NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chk_lucky_wheel_settings_singleton" CHECK ("lucky_wheel_settings"."id" = 1)
);
--> statement-breakpoint
INSERT INTO "lucky_wheel_settings" ("id", "settings")
VALUES (1, '{}'::jsonb)
ON CONFLICT ("id") DO NOTHING;
