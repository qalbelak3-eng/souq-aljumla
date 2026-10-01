import { NextResponse } from 'next/server';
import { savePushSubscription, getPushAudienceStats } from '@/lib/db';
import { VAPID_PUBLIC_KEY } from '@/lib/pushService';
import { getAuthenticatedCustomer } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const stats = getPushAudienceStats();
    return NextResponse.json({
      success: true,
      vapidPublicKey: VAPID_PUBLIC_KEY,
      ...stats,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { subscription, deviceType } = body;

    if (
      !subscription ||
      typeof subscription.endpoint !== 'string' ||
      !subscription.endpoint.trim() ||
      !subscription.keys ||
      typeof subscription.keys.p256dh !== 'string' ||
      !subscription.keys.p256dh.trim() ||
      typeof subscription.keys.auth !== 'string' ||
      !subscription.keys.auth.trim()
    ) {
      return NextResponse.json({ success: false, error: 'بيانات الاشتراك غير مكتملة' }, { status: 400 });
    }

    // Never trust identity fields supplied by the browser. If a valid customer
    // session exists, bind the push subscription to the fresh server-side user.
    // Otherwise keep it as an anonymous visitor subscription.
    const customer = getAuthenticatedCustomer(request);

    const saved = savePushSubscription({
      endpoint: subscription.endpoint.trim(),
      keys: {
        p256dh: subscription.keys.p256dh.trim(),
        auth: subscription.keys.auth.trim(),
      },
      userId: customer?.id,
      userPhone: customer?.phone,
      userName: customer?.name,
      accountType: customer?.accountType || 'visitor',
      deviceType: typeof deviceType === 'string' && deviceType.trim() ? deviceType.trim() : 'mobile',
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
