import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { financialAccounts } from '@/db/schema/accounts';
import { authIdentities } from '@/db/schema/auth';
import { orders } from '@/db/schema/orders';
import { auditLogs } from '@/db/schema/operations';
import { getAuthenticatedAdmin, hasPermission, hashPassword } from '@/lib/auth';
import { normalizePhoneForFinancialIdentity } from '@/lib/phone-utils';
import { MerchantStatus, MerchantTier, AccountType, CustomerWithStats } from '@/types';
import { eq, and, or, sql, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isUuid(val?: string | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || ''));
}

export async function GET(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (يتطلب تسجيل الدخول كمسؤول)' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'merchants') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بإدارة أو استعراض التجار' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') as MerchantStatus | null;
    const typeFilter = searchParams.get('type') as AccountType | null;

    const db = getDb();

    // Query accounts with order aggregated statistics from PostgreSQL
    const accountRows = await db
      .select({
        account: financialAccounts,
        totalOrdersCount: sql<number>`COALESCE(count(${orders.id}) FILTER (WHERE ${orders.status} != 'cancelled'), 0)::int`,
        totalOrdersAmount: sql<number>`COALESCE(sum(${orders.total}) FILTER (WHERE ${orders.status} != 'cancelled'), 0)::float`,
        lastOrderDate: sql<string | null>`max(${orders.createdAt})::text`,
      })
      .from(financialAccounts)
      .leftJoin(orders, eq(orders.accountId, financialAccounts.id))
      .where(eq(financialAccounts.category, 'customer'))
      .groupBy(financialAccounts.id)
      .orderBy(desc(financialAccounts.createdAt));

    let merchants: CustomerWithStats[] = accountRows.map((r) => {
      const a = r.account;
      const accountType: AccountType =
        a.pricingTier === 'market' ? 'market' : a.pricingTier === 'wholesale' ? 'wholesale' : 'individual';

      const role = accountType === 'wholesale' ? 'merchant' : 'customer';

      return {
        id: a.id,
        name: a.name,
        phone: a.phone || '',
        businessName: a.businessName || undefined,
        businessType: a.businessType || undefined,
        city: a.city || undefined,
        address: a.address || undefined,
        storefrontImage: a.storefrontImage || undefined,
        accountType,
        pricingTier: a.pricingTier as any,
        merchantStatus: (a.merchantStatus as MerchantStatus) || 'none',
        merchantTier: (a.merchantTier as MerchantTier) || undefined,
        role,
        isActive: a.isActive,
        createdAt: new Date(a.createdAt).toISOString(),
        totalOrdersCount: r.totalOrdersCount || 0,
        totalOrdersAmount: r.totalOrdersAmount || 0,
        lastOrderDate: r.lastOrderDate || undefined,
        hasPurchased: (r.totalOrdersCount || 0) > 0,
      };
    });

    if (statusFilter && statusFilter !== ('all' as any)) {
      merchants = merchants.filter((m) => m.merchantStatus === statusFilter);
    }
    if (typeFilter && typeFilter !== ('all' as any)) {
      merchants = merchants.filter((m) => m.accountType === typeFilter);
    }

    return NextResponse.json({ success: true, merchants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (يتطلب تسجيل الدخول كمسؤول)' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'merchants') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بتعديل بيانات أو رتبة التاجر' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const targetId = String(body.accountId || body.userId || '').trim();
    const { status, tier, accountType, password } = body;

    if (!targetId) {
      return NextResponse.json({ success: false, error: 'يرجى تحديد معرف التاجر / الحساب' }, { status: 400 });
    }

    const db = getDb();

    const updatedAccount = await db.transaction(async (tx) => {
      // 1. Locate account row
      let account: any = null;
      if (isUuid(targetId)) {
        const rows = await tx
          .select()
          .from(financialAccounts)
          .where(
            or(
              eq(financialAccounts.id, targetId),
              eq(financialAccounts.authIdentityId, targetId)
            )
          )
          .for('update');
        if (rows.length > 0) account = rows[0];
      }

      if (!account) {
        const cleanPhone = normalizePhoneForFinancialIdentity(targetId);
        if (cleanPhone) {
          const rows = await tx
            .select()
            .from(financialAccounts)
            .where(eq(financialAccounts.phone, cleanPhone))
            .for('update');
          if (rows.length > 0) account = rows[0];
        }
      }

      if (!account) {
        return null;
      }

      // 2. Prepare field updates
      const updateFields: any = {};

      if (status) {
        const validStatuses: MerchantStatus[] = ['none', 'pending', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
          throw new Error('حالة التاجر غير صالحة');
        }
        updateFields.merchantStatus = status;

        if (status === 'approved' && !updateFields.merchantTier && !account.merchantTier) {
          if (account.pricingTier === 'wholesale') {
            updateFields.merchantTier = 'bronze';
          }
        }
      }

      if (tier) {
        const validTiers: MerchantTier[] = ['bronze', 'silver', 'gold'];
        if (!validTiers.includes(tier)) {
          throw new Error('رتبة التاجر غير صالحة');
        }
        updateFields.merchantTier = tier;
        updateFields.pricingTier = 'wholesale';
      }

      if (accountType) {
        if (accountType === 'wholesale' || accountType === 'merchant') {
          updateFields.pricingTier = 'wholesale';
          if (!updateFields.merchantTier && !account.merchantTier) {
            updateFields.merchantTier = tier || 'bronze';
          }
          if (!updateFields.merchantStatus && account.merchantStatus === 'none') {
            updateFields.merchantStatus = 'pending';
          }
        } else if (accountType === 'market') {
          updateFields.pricingTier = 'market';
          updateFields.merchantTier = null;
          if (!updateFields.merchantStatus && account.merchantStatus === 'none') {
            updateFields.merchantStatus = 'pending';
          }
        } else if (accountType === 'supplier') {
          updateFields.category = 'supplier';
          updateFields.pricingTier = 'general';
          updateFields.merchantStatus = 'approved';
          updateFields.merchantTier = null;
        } else {
          updateFields.pricingTier = 'retail';
          updateFields.merchantTier = null;
          updateFields.merchantStatus = 'none';
        }
      }

      // Update password in auth_identities if provided
      if (password && typeof password === 'string' && password.trim()) {
        const pHash = hashPassword(password.trim());
        if (account.authIdentityId) {
          await tx
            .update(authIdentities)
            .set({ passwordHash: pHash })
            .where(eq(authIdentities.id, account.authIdentityId));
        } else if (account.phone) {
          const [newAuth] = await tx
            .insert(authIdentities)
            .values({
              phone: account.phone,
              passwordHash: pHash,
              role: 'customer',
              isActive: true,
            })
            .returning();
          updateFields.authIdentityId = newAuth.id;
        }
      }

      const [resAccount] = await tx
        .update(financialAccounts)
        .set(updateFields)
        .where(eq(financialAccounts.id, account.id))
        .returning();

      // Audit log
      await tx.insert(auditLogs).values({
        actionType: 'merchant_updated',
        actionLabel: 'تحديث حالة أو رتبة التاجر',
        category: 'accounts',
        categoryLabel: 'الحسابات والتجار',
        staffId: admin.id !== 'admin-master' && isUuid(admin.id) ? admin.id : null,
        operatorSnapshot: {
          id: admin.id,
          name: admin.name,
          username: admin.username,
          role: admin.role,
        },
        targetType: 'account',
        targetId: resAccount.id,
        targetReferenceNumber: resAccount.accountCode,
        financialImpact: null,
        details: `تحديث تصنيف الحساب ${resAccount.name} (${resAccount.phone}) - الحالة: ${resAccount.merchantStatus}, الرتبة: ${resAccount.merchantTier || 'غير محدد'}, التسعير: ${resAccount.pricingTier}`,
        severity: 'info',
      });

      return resAccount;
    });

    if (!updatedAccount) {
      return NextResponse.json({ success: false, error: 'حساب التاجر غير موجود' }, { status: 404 });
    }

    const formattedUser: Partial<CustomerWithStats> = {
      id: updatedAccount.id,
      name: updatedAccount.name,
      phone: updatedAccount.phone || '',
      businessName: updatedAccount.businessName || undefined,
      businessType: updatedAccount.businessType || undefined,
      accountType:
        updatedAccount.pricingTier === 'market'
          ? 'market'
          : updatedAccount.pricingTier === 'wholesale'
          ? 'wholesale'
          : 'individual',
      pricingTier: updatedAccount.pricingTier as any,
      merchantStatus: (updatedAccount.merchantStatus as MerchantStatus) || 'none',
      merchantTier: (updatedAccount.merchantTier as MerchantTier) || undefined,
      role: updatedAccount.pricingTier === 'wholesale' ? 'merchant' : 'customer',
      isActive: updatedAccount.isActive,
    };

    return NextResponse.json({
      success: true,
      message: 'تم تحديث تصنيف وبيانات الحساب بنجاح في قاعدة البيانات السيادية ✅',
      user: formattedUser,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بالوصول (يتطلب تسجيل الدخول كمسؤول)' },
        { status: 401 }
      );
    }
    if (!hasPermission(admin, 'merchants') && admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'غير مصرح لك بإضافة تجار جدد' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, phone, accountType, businessName, businessType, city, address, password, notes } = body;

    const trimmedName = String(name || '').trim();
    const trimmedPhone = normalizePhoneForFinancialIdentity(phone);

    if (!trimmedName) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال اسم الزبون / التاجر' }, { status: 400 });
    }
    if (!trimmedPhone) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال رقم هاتف عراقي صالح' }, { status: 400 });
    }

    const db = getDb();

    // Check existing
    const existing = await db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.phone, trimmedPhone))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ success: false, error: 'يوجد حساب مسجل مسبقاً برقم الهاتف هذا' }, { status: 400 });
    }

    const type = (accountType || 'market') as AccountType;
    const isSupplier = type === 'supplier';
    const isWholesale = type === 'wholesale' || type === 'merchant';
    const isMarket = type === 'market';

    const pricingTier = isWholesale ? 'wholesale' : isMarket ? 'market' : 'retail';
    const merchantTier: MerchantTier | undefined = isWholesale ? 'gold' : isMarket ? 'silver' : undefined;
    const merchantStatus: MerchantStatus = 'approved';

    const newAccount = await db.transaction(async (tx) => {
      let authIdentityId: string | null = null;
      if (password && typeof password === 'string' && password.trim()) {
        const pHash = hashPassword(password.trim());
        const [auth] = await tx
          .insert(authIdentities)
          .values({
            phone: trimmedPhone,
            passwordHash: pHash,
            role: isWholesale ? 'merchant' : 'customer',
            isActive: true,
          })
          .returning();
        authIdentityId = auth.id;
      }

      const code = `ACC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const [acc] = await tx
        .insert(financialAccounts)
        .values({
          accountCode: code,
          name: trimmedName,
          businessName: businessName?.trim() || null,
          businessType: businessType?.trim() || (isSupplier ? 'شركة توريد' : isMarket ? 'ميني ماركت' : isWholesale ? 'تجارة جملة' : null),
          phone: trimmedPhone,
          category: isSupplier ? 'supplier' : 'customer',
          pricingTier,
          merchantStatus,
          merchantTier: merchantTier || null,
          city: city?.trim() || 'كربلاء المقدسة',
          address: address?.trim() || null,
          authIdentityId,
          isActive: true,
          notes: notes?.trim() || 'حساب تاجر تم إنشاؤه واعتماده من لوحة الإدارة',
        })
        .returning();

      await tx.insert(auditLogs).values({
        actionType: 'merchant_created',
        actionLabel: 'إنشاء حساب تاجر معتمد',
        category: 'accounts',
        categoryLabel: 'الحسابات والتجار',
        staffId: admin.id !== 'admin-master' && isUuid(admin.id) ? admin.id : null,
        operatorSnapshot: {
          id: admin.id,
          name: admin.name,
          username: admin.username,
          role: admin.role,
        },
        targetType: 'account',
        targetId: acc.id,
        targetReferenceNumber: acc.accountCode,
        financialImpact: null,
        details: `إنشاء حساب ${acc.name} (${acc.phone}) - الفئة: ${acc.pricingTier} - الرتبة: ${acc.merchantTier || 'لا يوجد'}`,
        severity: 'info',
      });

      return acc;
    });

    const formattedUser: Partial<CustomerWithStats> = {
      id: newAccount.id,
      name: newAccount.name,
      phone: newAccount.phone || '',
      businessName: newAccount.businessName || undefined,
      businessType: newAccount.businessType || undefined,
      accountType: type,
      pricingTier: newAccount.pricingTier as any,
      merchantStatus: newAccount.merchantStatus as MerchantStatus,
      merchantTier: (newAccount.merchantTier as MerchantTier) || undefined,
      role: isWholesale ? 'merchant' : 'customer',
      isActive: newAccount.isActive,
    };

    return NextResponse.json({
      success: true,
      message: 'تمت إضافة الزبون / التاجر بنجاح وتفعيل حسابه مباشرة في PostgreSQL! 👤✅',
      user: formattedUser,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
