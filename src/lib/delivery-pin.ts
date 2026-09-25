import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits auth tag

/**
 * الحصول على مفتاح تشفير الـ PIN المستقل المخصص
 * منفصل تماماً عن مفاتيح الجلسات والـ JWT
 * مع فشل آمن في بيئة الإنتاج إذا لم يتم ضبطه
 */
export function getPinEncryptionKey(): Buffer {
  const envKey = process.env.DELIVERY_PIN_ENCRYPTION_KEY;
  if (envKey && envKey.trim()) {
    const trimmed = envKey.trim();
    if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    const b64Buf = Buffer.from(trimmed, 'base64');
    if (b64Buf.length === 32) {
      return b64Buf;
    }
    if (Buffer.byteLength(trimmed, 'utf8') === 32) {
      return Buffer.from(trimmed, 'utf8');
    }
    return crypto.createHash('sha256').update(`delivery_pin_dedicated_key:${trimmed}`).digest();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY CONFIGURATION ERROR: DELIVERY_PIN_ENCRYPTION_KEY must be configured in production environment.');
  }

  // مفتاح مخصص حصري للتطوير والاختبار المحلي (مستقل تماماً عن أسرار الجلسات)
  return crypto.createHash('sha256').update('etihad-dev-isolated-delivery-pin-aes-256-gcm-key-v1').digest();
}

/**
 * توليد رمز PIN عشوائي غير متوقع من 4 أرقام
 */
export function generateRandomPin(): string {
  const num = crypto.randomInt(0, 10000);
  return num.toString().padStart(4, '0');
}

/**
 * تشفير الـ PIN باستخدام Authenticated Encryption (AES-256-GCM) مع IV عشوائي لكل طلب
 * الصيغة الناتجة: iv:authTag:ciphertext (base64url)
 */
export function encryptPin(pin: string): string {
  if (!pin || typeof pin !== 'string') {
    throw new Error('رمز الـ PIN مطلوب للتشفير');
  }
  const key = getPinEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(pin.trim(), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64url')}:${authTag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

/**
 * فك تشفير الـ PIN المشفر باستخدام AES-256-GCM والتحقق من سلامة Auth Tag
 * يعيد null إذا تم التلاعب بالبيانات أو كان المفتاح غير مطابق
 */
export function decryptPin(encryptedPayload?: string | null): string | null {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') return null;
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) return null;

  const [ivB64, tagB64, cipherB64] = parts;
  try {
    const key = getPinEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');
    const ciphertext = Buffer.from(cipherB64, 'base64url');

    if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) {
      return null;
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const pin = decrypted.toString('utf8');
    if (/^\d{4}$/.test(pin)) {
      return pin;
    }
    return null;
  } catch {
    // فشل التحقق من Auth Tag أو التلاعب بالـ Ciphertext
    return null;
  }
}

/**
 * تشفير الـ PIN للتحقق باستخدام scrypt وملح عشوائي آمن (Cryptographically secure hash)
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
 * توليد حزمة أمان الـ PIN الكاملة للطلب الجديد (PIN عشوائي، هاش scrypt، وتشفير AES-256-GCM)
 */
export function generateOrderPinData(): { pin: string; hash: string; encrypted: string } {
  const pin = generateRandomPin();
  const hash = hashPin(pin);
  const encrypted = encryptPin(pin);
  return { pin, hash, encrypted };
}
