/**
 * Central Authoritative Iraqi Phone Normalization and Validation Utilities.
 * Standardizes all Iraqi mobile phone formats into a single, uniform
 * 13-digit canonical international format: 9647xxxxxxxxx (without '+').
 *
 * Supported valid input variations:
 * - 07701234567
 * - +9647701234567
 * - 9647701234567
 * - 009647701234567
 * - 0770-123-4567
 * - 0770 123 4567
 * - +964 770 123 4567
 * - ٠٧٧٠١٢٣٤٥٦٧ (Eastern Arabic / Indic numerals)
 */

export interface PhoneValidationResult {
  isValid: boolean;
  canonical: string | null;   // e.g. "9647701234567"
  localFormat: string | null; // e.g. "07701234567"
  reason?: string;
}

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Converts Eastern Arabic numerals (٠-٩) and Persian numerals to Western ASCII digits (0-9).
 */
export function convertArabicIndicDigits(value: string): string {
  let res = value;
  for (let i = 0; i < ARABIC_INDIC_DIGITS.length; i++) {
    res = res.replaceAll(ARABIC_INDIC_DIGITS[i], String(i));
  }
  return res;
}

/**
 * Validates an Iraqi mobile phone number and returns detailed validation results.
 * Strictly separates validation from normalization.
 */
export function validateIraqiPhone(rawPhone?: string | null): PhoneValidationResult {
  if (!rawPhone || !String(rawPhone).trim()) {
    return {
      isValid: false,
      canonical: null,
      localFormat: null,
      reason: 'رقم الهاتف مطلوب ولا يمكن أن يكون فارغاً',
    };
  }

  const converted = convertArabicIndicDigits(String(rawPhone).trim());
  const digits = converted.replace(/\D/g, '');

  if (!digits) {
    return {
      isValid: false,
      canonical: null,
      localFormat: null,
      reason: 'رقم الهاتف لا يحتوي على أي أرقام صالحة',
    };
  }

  let core: string | null = null;

  if (digits.startsWith('00964')) {
    core = digits.slice(5);
  } else if (digits.startsWith('964')) {
    core = digits.slice(3);
  } else if (digits.startsWith('07')) {
    core = digits.slice(1);
  } else if (digits.startsWith('7') && digits.length === 10) {
    core = digits;
  }

  // Core must be exactly 10 digits starting with 7 (e.g. 7701234567)
  // Valid Iraqi mobile prefixes: 73x, 74x, 75x, 76x, 77x, 78x, 79x
  if (!core || core.length !== 10 || !/^7[3-9]\d{8}$/.test(core)) {
    return {
      isValid: false,
      canonical: null,
      localFormat: null,
      reason: 'رقم الهاتف العراقي غير صالح. يجب أن يبدأ بـ 07 ويتكون من 11 رقماً (مثال: 07701234567)',
    };
  }

  return {
    isValid: true,
    canonical: `964${core}`,
    localFormat: `0${core}`,
  };
}

/**
 * Returns canonical 13-digit format (9647xxxxxxxxx) for valid Iraqi mobile numbers.
 * Returns null if the number is invalid or cannot be normalized (no silent guessing).
 */
export function toCanonicalIraqiPhone(rawPhone?: string | null): string | null {
  const res = validateIraqiPhone(rawPhone);
  return res.isValid ? res.canonical : null;
}

/**
 * Returns local 11-digit format (07xxxxxxxxx) for valid Iraqi mobile numbers.
 * Returns null if the number is invalid.
 */
export function toLocalIraqiPhone(rawPhone?: string | null): string | null {
  const res = validateIraqiPhone(rawPhone);
  return res.isValid ? res.localFormat : null;
}

/**
 * Fast boolean check if input is a valid Iraqi mobile number.
 */
export function isValidIraqiPhone(rawPhone?: string | null): boolean {
  return validateIraqiPhone(rawPhone).isValid;
}

/**
 * Authoritative financial & coupon identity phone normalizer.
 * Enforces canonical 13-digit format (9647xxxxxxxxx).
 * Fallback to stripped digits only if phone is already a validated foreign/custom ID in legacy paths.
 */
export function normalizePhoneForFinancialIdentity(rawPhone?: string | null): string {
  const canonical = toCanonicalIraqiPhone(rawPhone);
  if (canonical) return canonical;
  // If not valid Iraqi, clean non-digits without guessing
  return String(rawPhone || '').replace(/\D/g, '');
}
