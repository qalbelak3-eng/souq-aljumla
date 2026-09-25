-- Migration 0009: Driver Operational Status & Availability
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS operational_status VARCHAR(20) DEFAULT 'available' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_driver_operational_status'
  ) THEN
    ALTER TABLE drivers
    ADD CONSTRAINT chk_driver_operational_status
    CHECK (operational_status IN ('available', 'busy', 'break', 'off_duty'));
  END IF;
END $$;
