import crypto from 'crypto';

export function hashPassword(password: string): string {
  if (!password || typeof password !== 'string') throw new Error('كلمة المرور مطلوبة للتشفير');
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password.trim(), salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, hash?: string | null): boolean {
  if (!password || !hash || typeof hash !== 'string') return false;
  const parts = hash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  try {
    const derivedKey = crypto.scryptSync(password.trim(), salt, 64);
    const derivedHex = derivedKey.toString('hex');
    if (derivedHex.length !== originalHex.length) return false;
    return crypto.timingSafeEqual(Buffer.from(derivedHex, 'hex'), Buffer.from(originalHex, 'hex'));
  } catch {
    return false;
  }
}
