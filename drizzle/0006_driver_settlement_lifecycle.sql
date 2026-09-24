-- ============================================================================
-- 0006: DRIVER SETTLEMENT LIFECYCLE & PARTIAL SETTLEMENT HARDENING
-- ============================================================================

-- 1. Support Reversals & Status in driver_settlements
ALTER TABLE "driver_settlements" DROP CONSTRAINT IF EXISTS "chk_settlement_type";
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "chk_settlement_type" CHECK ("driver_settlements"."type" IN ('normal', 'shortage', 'overage', 'shortage_repayment', 'reversal'));
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD COLUMN IF NOT EXISTS "is_reversed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD COLUMN IF NOT EXISTS "reversal_settlement_id" uuid;
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD COLUMN IF NOT EXISTS "reversal_of_id" uuid;
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD COLUMN IF NOT EXISTS "reversal_reason" text;
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD COLUMN IF NOT EXISTS "reversed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD COLUMN IF NOT EXISTS "reversed_by_staff_id" uuid;
--> statement-breakpoint
ALTER TABLE "driver_settlements" DROP CONSTRAINT IF EXISTS "driver_settlements_reversal_settlement_id_fk";
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_reversal_settlement_id_fk" FOREIGN KEY ("reversal_settlement_id") REFERENCES "public"."driver_settlements"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "driver_settlements" DROP CONSTRAINT IF EXISTS "driver_settlements_reversal_of_id_fk";
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_reversal_of_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."driver_settlements"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "driver_settlements" DROP CONSTRAINT IF EXISTS "driver_settlements_reversed_by_staff_id_fk";
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_reversed_by_staff_id_fk" FOREIGN KEY ("reversed_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_settlements_reversal_settlement_id" ON "driver_settlements" USING btree ("reversal_settlement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_settlements_reversal_of_id" ON "driver_settlements" USING btree ("reversal_of_id");
--> statement-breakpoint
ALTER TABLE "driver_settlements" DROP CONSTRAINT IF EXISTS "chk_settlement_no_self_reversal";
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "chk_settlement_no_self_reversal" CHECK ("reversal_settlement_id" IS NULL OR "reversal_settlement_id" != "id");
--> statement-breakpoint
ALTER TABLE "driver_settlements" DROP CONSTRAINT IF EXISTS "chk_settlement_no_self_reversal_of";
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "chk_settlement_no_self_reversal_of" CHECK ("reversal_of_id" IS NULL OR "reversal_of_id" != "id");
--> statement-breakpoint
ALTER TABLE "driver_settlements" DROP CONSTRAINT IF EXISTS "chk_settlement_reversal_consistency";
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "chk_settlement_reversal_consistency" CHECK (("is_reversed" = FALSE) OR ("is_reversed" = TRUE AND "reversal_settlement_id" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "driver_settlements" DROP CONSTRAINT IF EXISTS "chk_settlement_reversal_type_consistency";
--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "chk_settlement_reversal_type_consistency" CHECK (("type" != 'reversal') OR ("type" = 'reversal' AND "reversal_of_id" IS NOT NULL));
--> statement-breakpoint

-- 2. Enable Multi-Batch / Partial Settlement Allocations on settlement_orders
ALTER TABLE "settlement_orders" DROP CONSTRAINT IF EXISTS "settlement_orders_order_id_unique";
--> statement-breakpoint
ALTER TABLE "settlement_orders" ADD COLUMN IF NOT EXISTS "allocated_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "settlement_orders" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "settlement_orders" DROP CONSTRAINT IF EXISTS "chk_settlement_order_allocated_positive";
--> statement-breakpoint
ALTER TABLE "settlement_orders" ADD CONSTRAINT "chk_settlement_order_allocated_positive" CHECK ("allocated_amount" > 0);
--> statement-breakpoint

-- 3. Add settled_amount on orders to track cumulative settled amount
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "settled_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "chk_order_settled_amount_non_negative";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "chk_order_settled_amount_non_negative" CHECK ("settled_amount" >= 0);
--> statement-breakpoint

-- 4. Database Trigger: Protect driver_settlements Immutability
CREATE OR REPLACE FUNCTION enforce_driver_settlement_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CRITICAL: Driver settlements are immutable financial records and cannot be deleted. Use formal reversal instead.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- If already reversed, reject any changes
    IF OLD.is_reversed = TRUE THEN
      RAISE EXCEPTION 'CRITICAL: Already reversed settlement is permanently locked and cannot be modified.';
    END IF;

    -- Disallow changes to core financial and relationship fields
    IF (OLD.id IS DISTINCT FROM NEW.id) OR
       (OLD.settlement_number IS DISTINCT FROM NEW.settlement_number) OR
       (OLD.driver_id IS DISTINCT FROM NEW.driver_id) OR
       (OLD.expected_amount IS DISTINCT FROM NEW.expected_amount) OR
       (OLD.actual_amount IS DISTINCT FROM NEW.actual_amount) OR
       (OLD.staff_id IS DISTINCT FROM NEW.staff_id) OR
       (OLD.created_at IS DISTINCT FROM NEW.created_at) OR
       (OLD.reversal_of_id IS DISTINCT FROM NEW.reversal_of_id) THEN
      RAISE EXCEPTION 'CRITICAL: Core financial fields of a driver settlement are permanently immutable.';
    END IF;

    -- Reversal transition check: FALSE -> TRUE
    IF (OLD.is_reversed = FALSE AND NEW.is_reversed = TRUE) THEN
      IF NEW.reversal_settlement_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL: Reversing a settlement requires a valid reversal_settlement_id.';
      END IF;
      IF NEW.reversal_settlement_id = OLD.id THEN
        RAISE EXCEPTION 'CRITICAL: Self-reversal is forbidden.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_protect_driver_settlements ON driver_settlements;
--> statement-breakpoint
CREATE TRIGGER trg_protect_driver_settlements
BEFORE UPDATE OR DELETE ON driver_settlements
FOR EACH ROW EXECUTE FUNCTION enforce_driver_settlement_immutability();
