import crypto from 'crypto';
import { ensureDbExists } from '@/lib/db';

export const SESSION_COOKIE_NAME = 'etihad_admin_session';
export const CUSTOMER_SESSION_COOKIE_NAME = 'etihad_customer_session';
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const CUSTOMER_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60; // 30 days

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
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const payload = verifyAdminSessionToken(token);
    if (payload && (payload.role === 'admin' || payload.role === 'staff')) {
      return payload;
    }
  }

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

/* =========================================================
   Customer Session Authentication
   ========================================================= */

export interface CustomerSessionPayload {
  userId: string;
  phone: string;
  email?: string;
  name?: string;
  role?: string;
  exp: number; // Unix timestamp in seconds
}

export interface AuthenticatedCustomer {
  id: string;
  phone: string;
  email?: string;
  name: string;
  accountType?: string;
  role?: string;
  merchantStatus?: string;
  pricingTier?: string;
  isActive: boolean;
}

/**
 * توقيع رمز جلسة الزبون رقمياً باستخدام HMAC-SHA256
 */
export function signCustomerSession(payload: CustomerSessionPayload): string {
  const secret = getSessionSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * التحقق من صحة توقيع رمز جلسة الزبون وعدم انتهائها
 */
export function verifyCustomerSessionToken(token: string): CustomerSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, sig] = parts;
  const secret = getSessionSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as CustomerSessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * استخراج وفحص هوية الزبون Server-Side من الكوكيز الموقعة أو ترويسة Authorization
 * والتحقق من أن المستخدم ما زال موجوداً وفعالاً في قاعدة البيانات
 */
export function getAuthenticatedCustomer(request: Request): AuthenticatedCustomer | null {
  let token: string | null = null;

  // 1. Check Bearer Authorization header
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Check Signed HttpOnly Cookie
  if (!token) {
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CUSTOMER_SESSION_COOKIE_NAME}=([^;]+)`));
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  if (!token) return null;

  const payload = verifyCustomerSessionToken(token);
  if (!payload || !payload.userId) return null;

  // Server-side database verification:
  // Must verify that payload.userId still points to an existing and active user in the database!
  // Return the fresh trusted identity from the record, NOT stale payload values.
  const db = ensureDbExists();
  const user = (db.users || []).find((u) => u.id === payload.userId);
  if (!user) {
    return null; // User does not exist or was deleted
  }

  // Check if account is disabled/inactive
  if ((user as any).isActive === false || (user as any).disabled === true || (user as any).status === 'disabled') {
    return null; // User is disabled/inactive
  }

  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    name: user.name,
    accountType: user.accountType || 'individual',
    role: user.role,
    merchantStatus: user.merchantStatus,
    pricingTier: user.pricingTier,
    isActive: (user as any).isActive !== false,
  };
}

/* =========================================================
   Order Access Token (Cryptographic Guest Order Tracking)
   ========================================================= */

export interface OrderTokenPayload {
  orderId: string;
  orderNumber?: string;
  phone?: string;
  exp: number; // Unix timestamp in seconds
}

/**
 * توقيع رمز وصول للطلبية (Order Access Token) يتيح للزبون الضيف تتبع طلبيته بأمان تام
 */
export function signOrderAccessToken(payload: OrderTokenPayload): string {
  const secret = getSessionSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * التحقق من صحة رمز الوصول للطلبية ومطابقته لرقم الطلبية وعدم انتهائه
 */
export function verifyOrderAccessToken(token: string, expectedOrderId?: string): OrderTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, sig] = parts;
  const secret = getSessionSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as OrderTokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (expectedOrderId && payload.orderId !== expectedOrderId) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * استخراج رمز الوصول للطلبية من المعلمات أو الترويسة أو الكوكيز
 */
export function getOrderAccessTokenFromRequest(request: Request, orderId?: string): string | null {
  // 1. Query param ?token=...
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (token) return token;
  } catch {}

  // 2. Custom header x-order-token: ...
  const headerToken = request.headers.get('x-order-token');
  if (headerToken) return headerToken;

  // 3. Bearer token if it looks like an order token
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (orderId && verifyOrderAccessToken(bearer, orderId)) {
      return bearer;
    }
  }

  // 4. Scoped cookie
  const cookieHeader = request.headers.get('cookie') || '';
  if (orderId) {
    const specificMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)etihad_order_token_${orderId}=([^;]+)`));
    if (specificMatch) return decodeURIComponent(specificMatch[1]);
  }
  const generalMatch = cookieHeader.match(/(?:^|;\s*)etihad_order_token=([^;]+)/);
  if (generalMatch) return decodeURIComponent(generalMatch[1]);

  return null;
}

