-- Migration 0020: Commerce Phase 2C4C - Delivery Custody, Warehouse Returns, and Orders Integrity Constraints

-- 1. Preflight Safety Verification (Fail-Fast against existing corruption)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE collected_amount < 0) THEN
    RAISE EXCEPTION 'Preflight failed: found negative collected_amount in orders table';
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE remaining_debt_amount < 0) THEN
    RAISE EXCEPTION 'Preflight failed: found negative remaining_debt_amount in orders table';
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE delivery_fee < 0) THEN
    RAISE EXCEPTION 'Preflight failed: found negative delivery_fee in orders table';
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE discount < 0) THEN
    RAISE EXCEPTION 'Preflight failed: found negative discount in orders table';
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE collection_status NOT IN ('pending', 'collected_cash', 'debt_unpaid', 'partial', 'returned')) THEN
    RAISE EXCEPTION 'Preflight failed: found invalid collection_status in orders table';
  END IF;
END $$;
--> statement-breakpoint

-- 2. Structured Delivery Sub-State Column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_sub_state varchar(30);
--> statement-breakpoint

-- 3. Backfill existing shipped orders with out_for_delivery if sub-state is null
UPDATE orders 
SET delivery_sub_state = 'out_for_delivery' 
WHERE status = 'shipped' AND delivery_sub_state IS NULL;
--> statement-breakpoint

-- 4. DB CHECK Constraints
ALTER TABLE orders ADD CONSTRAINT chk_orders_collected_amount_non_negative 
  CHECK (collected_amount >= 0);
--> statement-breakpoint

ALTER TABLE orders ADD CONSTRAINT chk_orders_remaining_debt_amount_non_negative 
  CHECK (remaining_debt_amount >= 0);
--> statement-breakpoint

ALTER TABLE orders ADD CONSTRAINT chk_orders_delivery_fee_non_negative 
  CHECK (delivery_fee >= 0);
--> statement-breakpoint

ALTER TABLE orders ADD CONSTRAINT chk_orders_discount_non_negative 
  CHECK (discount >= 0);
--> statement-breakpoint

ALTER TABLE orders ADD CONSTRAINT chk_orders_collection_status 
  CHECK (collection_status IN ('pending', 'collected_cash', 'debt_unpaid', 'partial', 'returned'));
--> statement-breakpoint

ALTER TABLE orders ADD CONSTRAINT chk_orders_delivery_sub_state 
  CHECK (delivery_sub_state IS NULL OR delivery_sub_state IN ('out_for_delivery', 'delivery_failed', 'return_requested', 'warehouse_received'));
