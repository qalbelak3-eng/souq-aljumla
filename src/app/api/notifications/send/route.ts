import { NextResponse } from 'next/server';
import { sendWebPushNotification } from '@/lib/pushService';
import { getPushNotificationLogs, deletePushNotificationLog, clearAllPushNotificationLogs } from '@/lib/db';
import { getAuthenticatedAdmin } from '@/lib/auth';
import type { NotificationTargetAudience } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_TARGET_AUDIENCES: readonly NotificationTargetAudience[] = [
  'all',
  'wholesale',
  'market',
  'retail',
  'registered_no_orders',
  'inactive_30d',
  'few_orders',
  'active_vip',
];

function parseTargetAudience(value: unknown): NotificationTargetAudience {
  return typeof value === 'string' && VALID_TARGET_AUDIENCES.includes(value as NotificationTargetAudience)
    ? (value as NotificationTargetAudience)
    : 'all';
}

function requireMasterAdmin(request: Request) {
  const admin = getAuthenticatedAdmin(request);
  if (!admin) {
    return { admin: null, response: NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول' }, { status: 401 }) };
  }
  if (admin.role !== 'admin') {
    return { admin: null, response: NextResponse.json({ success: false, error: 'إدارة الإشعارات العامة محصورة بالمدير العام فقط' }, { status: 403 }) };
  }
  return { admin, response: null };
}

export async function GET(request: Request) {
  try {
    const auth = requireMasterAdmin(request);
    if (auth.response) return auth.response;

    const logs = getPushNotificationLogs();
    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = requireMasterAdmin(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const { title, message, body: bodyText, image, url, targetAudience, expiryHours } = body;

    const finalTitle = typeof title === 'string' ? title.trim() : '';
    const finalBody = typeof (bodyText || message) === 'string' ? (bodyText || message).trim() : '';

    if (!finalTitle || !finalBody) {
      return NextResponse.json({ success: false, error: 'يرجى كتابة عنوان ونص الإشعار' }, { status: 400 });
    }

    const result = await sendWebPushNotification({
      title: finalTitle,
      body: finalBody,
      image: typeof image === 'string' && image.trim() ? image.trim() : undefined,
      url: typeof url === 'string' && url.trim() ? url.trim() : '/',
      targetAudience: parseTargetAudience(targetAudience),
      sentBy: auth.admin!.name,
      expiryHours: typeof expiryHours === 'number' && Number.isFinite(expiryHours)
        ? Math.min(Math.max(expiryHours, 0), 168)
        : 0,
    });

    return NextResponse.json({
      success: true,
      message: `تم إرسال التنبيه بنجاح إلى ${result.successCount} جهاز من أصل ${result.totalTargeted} 🚀`,
      result,
    });
  } catch (error: any) {
    console.error('Error in /api/notifications/send:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = requireMasterAdmin(request);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const clearAll = searchParams.get('clearAll');

    if (clearAll === 'true') {
      clearAllPushNotificationLogs();
      return NextResponse.json({ success: true, message: 'تم مسح سجل الإشعارات بالكامل بنجاح' });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف الإشعار مطلوب للحذف' }, { status: 400 });
    }

    deletePushNotificationLog(id);
    return NextResponse.json({ success: true, message: 'تم حذف الإشعار بنجاح' });
  } catch (error: any) {
    console.error('Error in DELETE /api/notifications/send:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
