/**
 * تطبيع أرقام الهواتف العراقية إلى صيغة قياسية موحدة
 * يضمن عدم تكرار الحسابات للزبون الواحد بصيغ مختلفة
 */
import {
  toLocalIraqiPhone,
  toCanonicalIraqiPhone,
  validateIraqiPhone,
  isValidIraqiPhone,
  normalizePhoneForFinancialIdentity,
  extractDigitsLegacy,
} from '@/lib/phone-utils';

export function normalizeIraqiPhone(rawPhone?: string | null): string | null {
  return toLocalIraqiPhone(rawPhone);
}

export {
  toCanonicalIraqiPhone,
  toLocalIraqiPhone,
  validateIraqiPhone,
  isValidIraqiPhone,
  normalizePhoneForFinancialIdentity,
  extractDigitsLegacy,
};
