import { NextResponse } from 'next/server';
import { savePushSubscription, getPushSubscriptions } from '@/lib/db';
import { VAPID_PUBLIC_KEY } from '@/lib/pushService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const subscriptions = getPushSubscriptions('all');
    return NextResponse.json({
      success: true,
      vapidPublicKey: VAPID_PUBLIC_KEY,
      totalSubscribers: subscriptions.length,
      wholesaleCount: subscriptions.filter(s => s.accountType === 'wholesale' || s.accountType === 'merchant').length,
      marketCount: subscriptions.filter(s => s.accountType === 'market').length,
      retailCount: subscriptions.filter(s => !s.accountType || s.accountType === 'individual' || s.accountType === 'visitor').length,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { subscription, userId, userPhone, userName, accountType, deviceType } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ success: false, error: 'بيانات الاشتراك غير مكتملة' }, { status: 400 });
    }

    const saved = savePushSubscription({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      userId,
      userPhone,
      userName,
      accountType: accountType || 'visitor',
      deviceType: deviceType || 'mobile',
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'تم تفعيل واستلام إشعارات المتجر بنجاح 🔔',
      subscription: saved,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
