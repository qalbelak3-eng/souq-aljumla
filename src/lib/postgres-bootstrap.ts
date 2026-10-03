import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { authIdentities, staffProfiles } from '@/db/schema';
import { hashPassword } from '@/lib/password';

export interface BootstrapAdminOptions {
  username?: string;
  password?: string;
  name?: string;
  phone?: string;
}

export interface BootstrapResult {
  bootstrapped: boolean;
  message: string;
  adminId?: string;
  username?: string;
}

/**
 * دالة التهيئة الصريحة لحساب المدير العام (Master Admin) في PostgreSQL
 * - تعمل فقط إذا كانت قاعدة البيانات خالية من أي حساب إداري.
 * - تعتمد على المتغيرات البيئية INITIAL_ADMIN_USERNAME و INITIAL_ADMIN_PASSWORD أو المدخلات الصريحة.
 * - لا تحتوي على كلمات مرور افتراضية مدمجة في الكود.
 */
export async function pgBootstrapMasterAdmin(options?: BootstrapAdminOptions): Promise<BootstrapResult> {
  const db = getDb();

  // 1. التحقق من وجود حساب مدير عام بالفعل في قاعدة البيانات
  const existingAdmins = await db
    .select({
      id: staffProfiles.id,
      username: staffProfiles.username,
    })
    .from(staffProfiles)
    .where(or(eq(staffProfiles.role, 'admin'), eq(staffProfiles.role, 'master')))
    .limit(1);

  if (existingAdmins.length > 0) {
    return {
      bootstrapped: false,
      message: 'يوجد حساب إداري مسجل بالفعل في PostgreSQL',
      adminId: existingAdmins[0].id,
      username: existingAdmins[0].username,
    };
  }

  // 2. قراءة بيانات الاعتماد
  const username = (options?.username || process.env.INITIAL_ADMIN_USERNAME || '').trim().toLowerCase();
  const password = options?.password || process.env.INITIAL_ADMIN_PASSWORD || '';
  const name = (options?.name || process.env.INITIAL_ADMIN_NAME || 'المدير العام').trim();
  const phone = (options?.phone || process.env.INITIAL_ADMIN_PHONE || '07700000000').trim();

  if (!username || !password) {
    return {
      bootstrapped: false,
      message: 'لم يتم توفير اسم المستخدم أو كلمة المرور لتهيئة المدير العام (INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD)',
    };
  }

  if (password.length < 8) {
    return {
      bootstrapped: false,
      message: 'كلمة مرور المدير العام يجب ألا تقل عن 8 خانات',
    };
  }

  // 3. إنشاء هوية الدخول وملف الموظف داخل معاملة
  return await db.transaction(async (tx) => {
    const [identity] = await tx
      .insert(authIdentities)
      .values({
        phone,
        passwordHash: hashPassword(password),
        role: 'admin',
        isActive: true,
      })
      .returning({ id: authIdentities.id });

    const [staff] = await tx
      .insert(staffProfiles)
      .values({
        authIdentityId: identity.id,
        username,
        name,
        jobTitle: 'المدير العام',
        role: 'admin',
        permissions: ['*'],
      })
      .returning({ id: staffProfiles.id, username: staffProfiles.username });

    return {
      bootstrapped: true,
      message: 'تمت تهيئة حساب المدير العام بنجاح في PostgreSQL',
      adminId: staff.id,
      username: staff.username,
    };
  });
}
