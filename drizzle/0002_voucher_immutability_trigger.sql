-- ============================================================================
-- 1. VOUCHER IMMUTABILITY TRIGGER (DB-2A Item 1)
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
    -- إذا كان السند معكوساً سابقاً، يُمنع لمسه أو تعديله نهائياً
    IF OLD.is_reversed = TRUE THEN
      RAISE EXCEPTION 'CRITICAL: Already reversed voucher cannot be modified or re-reversed.';
    END IF;

    -- منع تعديل البيانات الأساسية (المبلغ، الحساب، رقم السند، طريقة الدفع، نوع السند، تاريخ الإنشاء)
    IF (OLD.amount IS DISTINCT FROM NEW.amount) OR
       (OLD.account_id IS DISTINCT FROM NEW.account_id) OR
       (OLD.receipt_number IS DISTINCT FROM NEW.receipt_number) OR
       (OLD.voucher_type IS DISTINCT FROM NEW.voucher_type) OR
       (OLD.payment_method IS DISTINCT FROM NEW.payment_method) OR
       (OLD.created_at IS DISTINCT FROM NEW.created_at) THEN
      RAISE EXCEPTION 'CRITICAL: Modifying financial voucher core fields (amount, account, receipt_number, type, payment_method, created_at) is strictly forbidden.';
    END IF;

    -- التحقق من صحة عملية العكس
    IF NEW.is_reversed = TRUE THEN
      IF NEW.reversal_voucher_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL: Reversing a voucher requires a valid reversal_voucher_id.';
      END IF;
      IF NEW.reversal_voucher_id = OLD.id THEN
        RAISE EXCEPTION 'CRITICAL: Self-reversal is forbidden.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_vouchers ON vouchers;
CREATE TRIGGER trg_protect_vouchers
BEFORE UPDATE OR DELETE ON vouchers
FOR EACH ROW EXECUTE FUNCTION enforce_voucher_immutability();


-- ============================================================================
-- 2. VOUCHER REVERSAL BIDIRECTIONAL INTEGRITY (DEFERRED CONSTRAINT TRIGGER) (DB-2A Targeted Fix #1)
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_voucher_reversal_symmetry()
RETURNS TRIGGER AS $$
DECLARE
  paired_row RECORD;
BEGIN
  -- الحالة أ: إذا كان السند أصلياً ومؤشراً كمعكوس
  IF NEW.is_reversed = TRUE THEN
    IF NEW.reversal_voucher_id IS NULL THEN
      RAISE EXCEPTION 'CRITICAL: Symmetrical check failed: is_reversed=TRUE requires reversal_voucher_id on voucher %.', NEW.receipt_number;
    END IF;

    SELECT id, receipt_number, voucher_type, reversal_of_id, is_reversed
    INTO paired_row
    FROM vouchers
    WHERE id = NEW.reversal_voucher_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRITICAL: Linked reversal voucher (id: %) does not exist.', NEW.reversal_voucher_id;
    END IF;

    -- التحقق أن السند المقابل نوعه reversal ويشير قطعيًا إلى هذا السند الأصلي
    IF paired_row.voucher_type != 'reversal' THEN
      RAISE EXCEPTION 'CRITICAL: Linked voucher % must be of voucher_type = reversal.', paired_row.receipt_number;
    END IF;

    IF paired_row.reversal_of_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'CRITICAL: Asymmetrical reversal pair detected: Voucher % points to % as reversal, but % points to % as original.',
        NEW.receipt_number, paired_row.receipt_number, paired_row.receipt_number, paired_row.reversal_of_id;
    END IF;
  END IF;

  -- الحالة ب: إذا كان السند نفسه عبارة عن سند عكس
  IF NEW.voucher_type = 'reversal' THEN
    IF NEW.reversal_of_id IS NULL THEN
      RAISE EXCEPTION 'CRITICAL: Symmetrical check failed: voucher_type=reversal requires reversal_of_id on voucher %.', NEW.receipt_number;
    END IF;

    SELECT id, receipt_number, voucher_type, reversal_voucher_id, is_reversed
    INTO paired_row
    FROM vouchers
    WHERE id = NEW.reversal_of_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRITICAL: Original voucher (id: %) being reversed does not exist.', NEW.reversal_of_id;
    END IF;

    -- التحقق أن السند الأصلي مؤشر كمعكوس ويشير قطعيًا إلى سند العكس هذا
    IF paired_row.voucher_type = 'reversal' THEN
      RAISE EXCEPTION 'CRITICAL: Original voucher % cannot be of type reversal.', paired_row.receipt_number;
    END IF;

    IF paired_row.is_reversed != TRUE THEN
      RAISE EXCEPTION 'CRITICAL: Original voucher % must be flagged is_reversed=TRUE.', paired_row.receipt_number;
    END IF;

    IF paired_row.reversal_voucher_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'CRITICAL: Asymmetrical reversal pair detected: Reversal % points to % as original, but % points to % as reversal.',
        NEW.receipt_number, paired_row.receipt_number, paired_row.receipt_number, paired_row.reversal_voucher_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verify_reversal_symmetry ON vouchers;
CREATE CONSTRAINT TRIGGER trg_verify_reversal_symmetry
AFTER INSERT OR UPDATE ON vouchers
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION verify_voucher_reversal_symmetry();


-- ============================================================================
-- 3. FINANCIAL ACCOUNT ARCHIVE-ONLY POLICY TRIGGER (DB-2A Targeted Fix #2)
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_financial_account_archive_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CRITICAL: Financial accounts cannot be deleted from the database. Set is_active = FALSE and archived_at = NOW() to archive the account.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_financial_account_delete ON financial_accounts;
CREATE TRIGGER trg_prevent_financial_account_delete
BEFORE DELETE ON financial_accounts
FOR EACH ROW EXECUTE FUNCTION enforce_financial_account_archive_only();
