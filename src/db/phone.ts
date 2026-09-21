/**
 * تطبيع أرقام الهواتف العراقية إلى صيغة قياسية موحدة (07xxxxxxxxx)
 * يضمن عدم تكرار الحسابات للزبون الواحد بصيغ مختلفة مثل:
 * 07801234567, +9647801234567, 009647801234567, 7801234567
 * (DB-2A Item 4: Phone Normalization Strategy)
 */
export function normalizeIraqiPhone(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;

  // إزالة البادئة الدولية 00964 أو 964
  let cleaned = digits;
  if (cleaned.startsWith('00964')) {
    cleaned = cleaned.slice(5);
  } else if (cleaned.startsWith('964')) {
    cleaned = cleaned.slice(3);
  }

  // إذا كان يبدأ بـ 7 وطوله 10 أرقام، نضيف صفر البداية المحلي ليصبح 07xxxxxxxxx
  if (cleaned.startsWith('7') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }

  return cleaned;
}
