-- ============================================================================
-- 0008: AUTHENTICATED ENCRYPTION FOR CUSTOMER DELIVERY PIN (SECURITY HARDENING)
-- ============================================================================

-- 1. Add delivery_pin_encrypted column (stores AES-256-GCM iv:authTag:ciphertext)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_pin_encrypted" text;
--> statement-breakpoint

-- 2. Drop deprecated delivery_pin_seed column
ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_pin_seed";
