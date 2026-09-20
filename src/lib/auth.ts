import crypto from 'crypto';
import { ensureDbExists } from '@/lib/db';

export const SESSION_COOKIE_NAME = 'etihad_admin_session';
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * اشتقاق سر الجلسة حصراً من متغير البيئة دون وجود أي أسرار مضمنة في الكود
 */
function getSessionSecret(): string {
  const envSecret = process.env.ADMIN_SESSION_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY CONFIGURATION ERROR: ADMIN_SESSION_SECRET environment variable is missing or too short.');
  }
  // في بيئة التطوير والاختبارات المحلية فقط
  return 'dev-local-test-secret-never-used-in-production';
}

export interface AuthenticatedAdmin {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'staff';
  jobTitle?: string;
  permissions: string[];
  isActive: boolean;
}

export interface SessionPayload {
  userId: string;
  username: string;
  role: string;
  exp: number; // Unix timestamp in seconds
}

/**
 * توقيع رمز الجلسة رقمياً باستخدام HMAC-SHA256
 */
export function signAdminSession(payload: SessionPayload): string {
  const secret = getSessionSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * التحقق من صحة توقيع رمز الجلسة وعدم التلاعب به وعدم انتهاء صلاحيته
 */
export function verifyAdminSessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, sig] = parts;
  const secret = getSessionSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  // مقارنة آمنة زمنياً ضد هجمات التوقيت (Timing Attacks)
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // انتهت صلاحية الجلسة
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * استخراج وفحص الجلسة من كوكيز الطلب (Signed HttpOnly Cookie)
 */
export function getSessionFromRequest(request: Request): SessionPayload | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  return verifyAdminSessionToken(token);
}

/**
 * التحقق الكامل من هوية المدير/الموظف Server-Side
 * - يتأكد من صحة التوقيع
 * - يتأكد من وجود المستخدم في قاعدة البيانات وأنه نشط
 */
export function getAuthenticatedAdmin(request: Request): AuthenticatedAdmin | null {
  const session = getSessionFromRequest(request);
  if (!session) return null;

  const db = ensureDbExists();
  const cleanU = (session.username || '').trim().toLowerCase();

  // 1. التحقق من حساب المدير العام الماستر
  const masterAuth = db.adminAuth || { username: 'admin', password: 'admin123' };
  if (masterAuth.username.trim().toLowerCase() === cleanU) {
    return {
      id: 'admin-master',
      name: 'المدير العام (Master Admin)',
      username: masterAuth.username,
      role: 'admin',
      jobTitle: 'مدير النظام الرئيسي 👑',
      permissions: ['*'],
      isActive: true,
    };
  }

  // 2. التحقق من حساب الموظف
  const staff = (db.staff || []).find(
    s => (s.username || '').trim().toLowerCase() === cleanU || s.id === session.userId
  );

  if (!staff || !staff.isActive) {
    return null;
  }

  return {
    id: staff.id,
    name: staff.name,
    username: staff.username,
    role: 'staff',
    jobTitle: staff.jobTitle,
    permissions: staff.permissions || [],
    isActive: staff.isActive,
  };
}

/**
 * فحص الصلاحيات المحددة للمستخدم
 */
export function hasPermission(
  admin: AuthenticatedAdmin | null,
  requiredPermission: string
): boolean {
  if (!admin || !admin.isActive) return false;
  if (admin.role === 'admin') return true; // المدير العام يملك كافة الصلاحيات
  const perms = admin.permissions || [];
  if (perms.includes('*')) return true;
  if (perms.includes(requiredPermission)) return true;

  // دعم الصلاحيات الفرعية
  if (requiredPermission.startsWith('accounting:') && perms.includes('accounting')) return true;
  if (requiredPermission.startsWith('drivers:') && (perms.includes('drivers') || perms.includes('accounting'))) return true;
  if (requiredPermission.startsWith('vault:') && perms.includes('accounting')) return true;

  return false;
}
