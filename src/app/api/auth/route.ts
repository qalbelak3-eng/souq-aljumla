import { NextResponse } from 'next/server';
import { findUserByEmailOrPhone, createUser, updateUserProfile } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const identifier = searchParams.get('identifier') || searchParams.get('phone') || searchParams.get('email');
    if (!identifier) {
      return NextResponse.json({ success: false, error: 'Identifier required' }, { status: 400 });
    }
    const user = findUserByEmailOrPhone(identifier);
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, identifier, password, name, email, phone, accountType, businessName, businessType, city, address, avatar, storefrontImage, lat, lng, mapsUrl } = body;

    if (action === 'login') {
      if (!identifier || !identifier.trim()) {
        return NextResponse.json({ success: false, error: 'يرجى إدخال رقم الهاتف أو البريد الإلكتروني' }, { status: 400 });
      }

      const user = findUserByEmailOrPhone(identifier.trim());
      if (!user) {
        return NextResponse.json({ success: false, error: 'لم يتم العثور على حساب مسجل بهذا الرقم أو البريد' }, { status: 404 });
      }

      // إذا كان للمستخدم كلمة سر مسجلة مسبقاً، نتحقق منها
      if (user.password) {
        if (!password || !password.trim()) {
          return NextResponse.json({ success: false, error: 'يرجى إدخال كلمة السر الخاصة بحسابك' }, { status: 401 });
        }
        if (user.password !== password.trim()) {
          return NextResponse.json({ success: false, error: 'كلمة السر غير صحيحة، يرجى المحاولة مجدداً أو استعادة الحساب' }, { status: 401 });
        }
      } else if (password && password.trim()) {
        // إذا كان حساباً قديماً بدون كلمة سر وقام بإدخال كلمة سر الآن، نحفظها له تلقائياً
        user.password = password.trim();
        updateUserProfile(user.id, { password: password.trim() });
      }

      return NextResponse.json({
        success: true,
        user,
        message: 'تم تسجيل الدخول بنجاح ✓',
      });
    }

    if (action === 'register') {
      if (!name || !phone) {
        return NextResponse.json({ success: false, error: 'يرجى إدخال الاسم ورقم الهاتف' }, { status: 400 });
      }

      if (!password || !password.trim()) {
        return NextResponse.json({ success: false, error: 'يرجى إدخال كلمة السر الخاصة بالحساب' }, { status: 400 });
      }

      // Validate email format ONLY IF provided
      if (email && email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          return NextResponse.json({ success: false, error: 'يرجى إدخال بريد إلكتروني صحيح' }, { status: 400 });
        }
      }

      // Validate phone format
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 13) {
        return NextResponse.json({ success: false, error: 'يرجى إدخال رقم هاتف صحيح' }, { status: 400 });
      }

      const existingPhone = findUserByEmailOrPhone(phone);
      if (existingPhone) {
        return NextResponse.json({ success: false, error: 'يوجد حساب مسجل مسبقاً برقم الهاتف هذا' }, { status: 400 });
      }

      if (email && email.trim()) {
        const existingEmail = findUserByEmailOrPhone(email.trim());
        if (existingEmail) {
          return NextResponse.json({ success: false, error: 'يوجد حساب مسجل مسبقاً بهذا البريد الإلكتروني' }, { status: 400 });
        }
      }

      const isWholesale = accountType === 'wholesale' || accountType === 'merchant';
      const isMarket = accountType === 'market';

      if ((isWholesale || isMarket) && !businessName?.trim()) {
        return NextResponse.json({
          success: false,
          error: isMarket ? 'يرجى إدخال اسم الماركت / المحل التجاري' : 'يرجى إدخال اسم النشاط التجاري للتاجر'
        }, { status: 400 });
      }

      if (isMarket && !storefrontImage) {
        return NextResponse.json({
          success: false,
          error: 'يرجى التقاط أو رفع صورة واجهة الماركت (إجباري)'
        }, { status: 400 });
      }

      const newUser = createUser({
        name,
        email,
        phone,
        password: password?.trim() || undefined,
        accountType: accountType || 'individual',
        businessName,
        businessType: businessType || (isMarket ? 'ماركت ومحل تجاري' : isWholesale ? 'تجارة جملة وتوزيع' : undefined),
        city,
        address,
        storefrontImage,
        lat: lat ? Number(lat) : undefined,
        lng: lng ? Number(lng) : undefined,
        mapsUrl,
      });

      return NextResponse.json({
        success: true,
        user: newUser,
        message: isWholesale
          ? 'تم استلام طلب تاجر الجملة بنجاح! حسابك قيد المراجعة والتدقيق من قبل الإدارة لتفعيل الحساب وإرسال الفواتير.'
          : isMarket
          ? 'تم استلام طلب تسجيل الماركت بنجاح! يمكنك تصفح التطبيق، وسيقوم فريق الإدارة بالتواصل معك واعتماد حسابك لتفعيل إرسال فواتير الشراء.'
          : 'تم إنشاء الحساب وتفعيله بنجاح!',
      }, { status: 201 });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    console.error('API /api/auth POST error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ غير متوقع في الخادم' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { userId, updates } = body;

    if (!userId || !updates) {
      return NextResponse.json({ success: false, error: 'بيانات غير مكتملة' }, { status: 400 });
    }

    const updatedUser = updateUserProfile(userId, updates);
    if (!updatedUser) {
      return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'تم تحديث الملف الشخصي والصورة بنجاح ✓',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
