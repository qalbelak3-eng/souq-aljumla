import { NextResponse } from 'next/server';
import { pgGetDriverByPhone } from '@/lib/postgres-drivers';
import {
  verifyPassword,
  signDriverSession,
  DRIVER_SESSION_COOKIE_NAME,
  DRIVER_SESSION_DURATION_SECONDS,
} from '@/lib/auth';
import { getDb } from '@/db/client';
import { authIdentities } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, password } = body;

    if (!phone || !password) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال رقم الهاتف وكلمة المرور' }, { status: 400 });
    }

    const driver = await pgGetDriverByPhone(phone);
    if (!driver) {
      return NextResponse.json({ success: false, error: 'رقم هاتف السائق غير مسجل في النظام' }, { status: 401 });
    }

    if (!driver.isActive) {
      return NextResponse.json(
        { success: false, error: 'تم تعطيل حساب السائق، يرجى مراجعة إدارة المتجر' },
        { status: 403 }
      );
    }

    const isPasswordValid = verifyPassword(password, driver.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json({ success: false, error: 'كلمة المرور غير صحيحة' }, { status: 401 });
    }

    // Sign secure driver session token
    const token = signDriverSession({
      driverId: driver.id,
      authIdentityId: driver.authIdentityId,
      phone: driver.phone,
      name: driver.name,
      role: 'driver',
      exp: Math.floor(Date.now() / 1000) + DRIVER_SESSION_DURATION_SECONDS,
    });

    // Update lastLoginAt in authIdentities
    try {
      const db = getDb();
      await db
        .update(authIdentities)
        .set({ lastLoginAt: new Date() })
        .where(eq(authIdentities.id, driver.authIdentityId));
    } catch (e) {
      // Non-blocking log update
      console.error('Failed to update driver lastLoginAt:', e);
    }

    const response = NextResponse.json({
      success: true,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        vehicleInfo: driver.vehicleInfo,
        currentCashInHand: driver.currentCashInHand || 0,
      },
      token,
      message: `مرحباً بك يا ${driver.name}! تم تسجيل الدخول بنجاح`,
    });

    response.cookies.set({
      name: DRIVER_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: DRIVER_SESSION_DURATION_SECONDS,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Error driver auth:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء تسجيل الدخول' },
      { status: 500 }
    );
  }
}
