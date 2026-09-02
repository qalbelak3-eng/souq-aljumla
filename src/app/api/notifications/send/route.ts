import { NextResponse } from 'next/server';
import { sendWebPushNotification } from '@/lib/pushService';
import { getPushNotificationLogs, deletePushNotificationLog, clearAllPushNotificationLogs } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const logs = getPushNotificationLogs();
    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, message, body: bodyText, image, url, targetAudience, sentBy, expiryHours } = body;

    const finalTitle = (title || '').trim();
    const finalBody = (bodyText || message || '').trim();

    if (!finalTitle || !finalBody) {
      return NextResponse.json({ success: false, error: 'يرجى كتابة عنوان ونص الإشعار' }, { status: 400 });
    }

    const result = await sendWebPushNotification({
      title: finalTitle,
      body: finalBody,
      image: image ? image.trim() : undefined,
      url: url ? url.trim() : '/',
      targetAudience: targetAudience || 'all',
      sentBy: sentBy || 'مدير النظام',
      expiryHours: typeof expiryHours === 'number' ? expiryHours : 0,
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
