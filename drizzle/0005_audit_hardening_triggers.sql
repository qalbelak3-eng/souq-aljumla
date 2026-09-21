-- ============================================================================
-- 1. ORDER LIFECYCLE: ARCHIVE / CANCEL-ONLY POLICY TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_order_archive_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CRITICAL: Orders cannot be deleted from the database. Use UPDATE orders SET status = ''cancelled'' to cancel an order.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_order_delete ON orders;
CREATE TRIGGER trg_prevent_order_delete
BEFORE DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION enforce_order_archive_only();


-- ============================================================================
-- 2. PURCHASE INVOICE: ARCHIVE-ONLY POLICY TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_purchase_invoice_archive_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CRITICAL: Purchase invoices are immutable historical financial records and cannot be deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_purchase_invoice_delete ON purchase_invoices;
CREATE TRIGGER trg_prevent_purchase_invoice_delete
BEFORE DELETE ON purchase_invoices
FOR EACH ROW EXECUTE FUNCTION enforce_purchase_invoice_archive_only();


-- ============================================================================
-- 3. DRIVER SETTLEMENT REPAYMENT INTEGRITY VALIDATION TRIGGER (Amendment A)
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_driver_repayment_integrity()
RETURNS TRIGGER AS $$
DECLARE
  target_settlement RECORD;
BEGIN
  -- يتم التحقق عند وجود repayment_of_id
  IF NEW.repayment_of_id IS NOT NULL THEN
    -- 1. منع الإشارة الذاتية
    IF NEW.id IS NOT NULL AND NEW.repayment_of_id = NEW.id THEN
      RAISE EXCEPTION 'CRITICAL: Driver settlement repayment cannot reference itself.';
    END IF;

    -- 2. جلب التسوية المستهدفة
    SELECT id, driver_id, type, repayment_of_id
    INTO target_settlement
    FROM driver_settlements
    WHERE id = NEW.repayment_of_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRITICAL: Target shortage settlement (id: %) does not exist.', NEW.repayment_of_id;
    END IF;

    -- 3. التحقق أن التسوية المستهدفة تعود لنفس السائق حتماً
    IF target_settlement.driver_id != NEW.driver_id THEN
      RAISE EXCEPTION 'CRITICAL: Repayment settlement driver (%) does not match original shortage settlement driver (%).',
        NEW.driver_id, target_settlement.driver_id;
    END IF;

    -- 4. التحقق أن التسوية المستهدفة هي تسوية نقص حصراً
    IF target_settlement.type != 'shortage' THEN
      RAISE EXCEPTION 'CRITICAL: Repayment target must be of type ''shortage'', but found type ''%''.', target_settlement.type;
    END IF;

    -- 5. منع سلاسل السداد المتعددة (repayment cannot target another repayment)
    IF target_settlement.type = 'shortage_repayment' OR target_settlement.repayment_of_id IS NOT NULL THEN
      RAISE EXCEPTION 'CRITICAL: Repayment chaining is strictly forbidden; cannot repay a repayment settlement.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verify_driver_repayment ON driver_settlements;
CREATE TRIGGER trg_verify_driver_repayment
BEFORE INSERT OR UPDATE OF repayment_of_id, driver_id, type ON driver_settlements
FOR EACH ROW EXECUTE FUNCTION verify_driver_repayment_integrity();


-- ============================================================================
-- 4. VOUCHER IMMUTABILITY: EXPLICIT ALLOWLIST REPLACEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_voucher_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. منع حذف أي سند مالي نهائياً
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CRITICAL: Financial vouchers are immutable and cannot be deleted. Use formal reversal instead.';
  END IF;

  -- 2. في حالة التعديل UPDATE:
  IF TG_OP = 'UPDATE' THEN
    -- الحظر المطلق: إذا كان السند معكوساً سابقاً، يمنع لمسه نهائياً بأي شكل
    IF OLD.is_reversed = TRUE THEN
      RAISE EXCEPTION 'CRITICAL: Already reversed voucher is permanently locked and cannot be modified under any circumstances.';
    END IF;

    -- الأعمدة الأساسية التي لا يمكن تعديلها تحت أي ظرف كان
    IF (OLD.id IS DISTINCT FROM NEW.id) OR
       (OLD.amount IS DISTINCT FROM NEW.amount) OR
       (OLD.account_id IS DISTINCT FROM NEW.account_id) OR
       (OLD.receipt_number IS DISTINCT FROM NEW.receipt_number) OR
       (OLD.voucher_type IS DISTINCT FROM NEW.voucher_type) OR
       (OLD.payment_method IS DISTINCT FROM NEW.payment_method) OR
       (OLD.created_at IS DISTINCT FROM NEW.created_at) OR
       (OLD.reversal_of_id IS DISTINCT FROM NEW.reversal_of_id) THEN
      RAISE EXCEPTION 'CRITICAL: Core financial fields of a voucher are permanently immutable.';
    END IF;

    -- الحالة أ: عملية عكس نظامية (Reversal Transition: FALSE -> TRUE)
    IF (OLD.is_reversed = FALSE AND NEW.is_reversed = TRUE) THEN
      -- التحقق من وجود رقم سند العكس المقابل
      IF NEW.reversal_voucher_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL: Reversing a voucher requires a valid reversal_voucher_id.';
      END IF;
      IF NEW.reversal_voucher_id = OLD.id THEN
        RAISE EXCEPTION 'CRITICAL: Self-reversal is forbidden.';
      END IF;

      -- التحقق من قائمة السماح (Allowlist): يمنع تعديل أي حقل إداري أثناء تنفيذ العكس
      IF (OLD.notes IS DISTINCT FROM NEW.notes) OR
         (OLD.received_by_staff_id IS DISTINCT FROM NEW.received_by_staff_id) THEN
        RAISE EXCEPTION 'CRITICAL: Administrative fields (notes, received_by_staff_id) cannot be modified during reversal transition.';
      END IF;

    -- الحالة ب: تعديل إداري على سند غير معكوس (Administrative Update: FALSE -> FALSE)
    ELSIF (OLD.is_reversed = FALSE AND NEW.is_reversed = FALSE) THEN
      -- قائمة السماح: يُسمح فقط بتعديل notes أو received_by_staff_id
      -- أي مساس بحقول العكس ممنوع منعاً باتاً
      IF (NEW.reversal_voucher_id IS NOT NULL) OR
         (NEW.reversal_reason IS NOT NULL) OR
         (NEW.reversed_at IS NOT NULL) OR
         (NEW.reversed_by_staff_id IS NOT NULL) THEN
        RAISE EXCEPTION 'CRITICAL: Reversal metadata fields can only be populated when transitioning is_reversed to TRUE.';
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 5. INVENTORY MOVEMENTS: IMMUTABLE AUDIT LOG & INSERT VALIDATION
-- ============================================================================

-- منع التعديل والحذف نهائياً (Append-Only Immutable Ledger)
CREATE OR REPLACE FUNCTION enforce_inventory_movement_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CRITICAL: Inventory movements are immutable audit log records and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_inventory_movements ON inventory_movements;
CREATE TRIGGER trg_protect_inventory_movements
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION enforce_inventory_movement_immutability();

-- التحقق من صحة المرجع عند الإدخال (Reference Integrity on INSERT)
CREATE OR REPLACE FUNCTION verify_inventory_movement_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_type = 'order' THEN
    IF NEW.reference_id IS NULL THEN
      RAISE EXCEPTION 'CRITICAL: Inventory movement of type order requires a valid reference_id.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM orders WHERE id = NEW.reference_id) THEN
      RAISE EXCEPTION 'CRITICAL: Inventory movement references nonexistent order ID: %.', NEW.reference_id;
    END IF;
  ELSIF NEW.reference_type = 'purchase_invoice' THEN
    IF NEW.reference_id IS NULL THEN
      RAISE EXCEPTION 'CRITICAL: Inventory movement of type purchase_invoice requires a valid reference_id.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM purchase_invoices WHERE id = NEW.reference_id) THEN
      RAISE EXCEPTION 'CRITICAL: Inventory movement references nonexistent purchase invoice ID: %.', NEW.reference_id;
    END IF;
  ELSIF NEW.reference_type = 'manual' THEN
    IF NEW.performed_by_staff_id IS NULL THEN
      RAISE EXCEPTION 'CRITICAL: Manual inventory adjustment requires performed_by_staff_id.';
    END IF;
    -- For manual adjustments, reference_id is optional and can be NULL.
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verify_inventory_movement_ref ON inventory_movements;
CREATE TRIGGER trg_verify_inventory_movement_ref
BEFORE INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION verify_inventory_movement_reference();
