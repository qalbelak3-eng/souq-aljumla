import crypto from 'crypto';

/**
 * اشتقاق سر تشفير الـ PIN من بيئة النظام
 */
function getPinSecret(): string {
  const envSecret = process.env.ADMIN_SESSION_SECRET || process.env.JWT_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY CONFIGURATION ERROR: PIN secret is missing or too short.');
  }
  return 'dev-local-test-pin-secret-never-used-in-production';
}

/**
 * توليد ملح/بذرة عشوائية للطلب
 */
export function generatePinSeed(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * اشتقاق PIN من 4 أرقام حصرياً للطلب بواسطة مفتاح السيرفر السري وبذرة الطلب
 * لا يتم تخزين هذا الـ PIN كنص صريح في قاعدة البيانات مطلقاً
 */
export function deriveOrderPin(orderId: string, seed: string): string {
  if (!orderId || !seed) {
    throw new Error('معرف الطلب وبذرة الرمز مطلوبة لاشتقاق PIN');
  }
  const secret = getPinSecret();
  const hmac = crypto.createHmac('sha256', secret).update(`${orderId}:${seed}`).digest();
  const num = hmac.readUInt32BE(0) % 10000;
  return num.toString().padStart(4, '0');
}

/**
 * تشفير الـ PIN باستخدام scrypt وملح عشوائي آمن (Cryptographically secure hash)
 */
export function hashPin(pin: string): string {
  if (!pin || typeof pin !== 'string') {
    throw new Error('الـ PIN مطلوب للتشفير');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(pin.trim(), salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * التحقق من صحة الـ PIN بمقارنة آمنة زمنياً ضد هجمات التوقيت
 */
export function verifyPin(pin: string, hash?: string | null): boolean {
  if (!pin || !hash || typeof hash !== 'string') return false;
  const parts = hash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  try {
    const derivedKey = crypto.scryptSync(pin.trim(), salt, 64);
    const derivedHex = derivedKey.toString('hex');
    if (derivedHex.length !== originalHex.length) return false;
    return crypto.timingSafeEqual(Buffer.from(derivedHex, 'hex'), Buffer.from(originalHex, 'hex'));
  } catch {
    return false;
  }
}

/**
 * توليد حزمة أمان الـ PIN الكاملة للطلب الجديد (PIN مشتق، بذرة عشوائية، وهاش مشفر)
 */
export function generateOrderPinData(orderId: string): { pin: string; seed: string; hash: string } {
  const seed = generatePinSeed();
  const pin = deriveOrderPin(orderId, seed);
  const hash = hashPin(pin);
  return { pin, seed, hash };
}
