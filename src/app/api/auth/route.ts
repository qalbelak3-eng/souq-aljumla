import { NextResponse } from 'next/server';
import { findUserByEmailOrPhone, createUser, updateUserProfile, getUsers } from '@/lib/db';
import {
  signCustomerSession,
  CUSTOMER_SESSION_COOKIE_NAME,
  CUSTOMER_SESSION_DURATION_SECONDS,
  getAuthenticatedCustomer,
  getAuthenticatedAdmin,
  hasPermission,
} from '@/lib/auth';
import { User } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const identifier = searchParams.get('identifier') || searchParams.get('phone') || searchParams.get('email');

    // 1. Check for Admin Session
    const admin = getAuthenticatedAdmin(request);
    const isAdmin = admin && (hasPermission(admin, 'merchants') || hasPermission(admin, 'orders') || admin.role === 'admin');

    if (isAdmin) {
      if (!identifier) {
        return NextResponse.json({ success: false, error: 'المعرف مطلوب لعمليات الإدارة' }, { status: 400 });
      }
      const user = findUserByEmailOrPhone(identifier) || getUsers().find(u => u.id === identifier);
      if (!user) {
        return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
      }
      return NextResponse.json({ success: true, user });
    }

    // 2. Customer Session Check:
    // Unauthenticated callers without an active customer session MUST NOT be able to inspect ANY user profile!
    const customer = getAuthenticatedCustomer(request);
    if (!customer) {
      return NextResponse.json({
        success: false,
        error: 'غير مصرح لك بالوصول (يتطلب تسجيل الدخول للاطلاع على بيانات الحساب)',
      }, { status: 401 });
    }

    // 3. Strict Customer Isolation:
    // The customer receives EXCLUSIVELY their own user profile corresponding to customer.id!
    const allUsers = getUsers();
    const user = allUsers.find(u => u.id === customer.id);
    if (!user) {
      return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
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

      const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
      const normalizePass = (p?: string) => (p || '').trim().replace(/[٠-٩]/g, (w) => arabicDigits.indexOf(w).toString());
      
      const inputPass = normalizePass(password);
      const userPass = normalizePass(user.password);

      // إذا كان للمستخدم كلمة سر مسجلة مسبقاً، نتحقق منها
      if (userPass) {
        if (!inputPass) {
          return NextResponse.json({ success: false, error: 'يرجى إدخال كلمة السر الخاصة بحسابك' }, { status: 401 });
        }
        if (inputPass !== userPass) {
          return NextResponse.json({ success: false, error: 'كلمة السر غير صحيحة، يرجى المحاولة مجدداً أو استعادة الحساب' }, { status: 401 });
        }
      } else if (inputPass) {
        // إذا كان حساباً قديماً بدون كلمة سر وقام بإدخال كلمة سر الآن، نحفظها له تلقائياً
        user.password = inputPass;
        updateUserProfile(user.id, { password: inputPass });
      }

      const customerToken = signCustomerSession({
        userId: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: user.accountType || 'customer',
        exp: Math.floor(Date.now() / 1000) + CUSTOMER_SESSION_DURATION_SECONDS,
      });

      const response = NextResponse.json({
        success: true,
        user,
        token: customerToken,
        message: 'تم تسجيل الدخول بنجاح ✓',
      });

      response.cookies.set({
        name: CUSTOMER_SESSION_COOKIE_NAME,
        value: customerToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: CUSTOMER_SESSION_DURATION_SECONDS,
      });

      return response;
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

      const customerToken = signCustomerSession({
        userId: newUser.id,
        phone: newUser.phone,
        email: newUser.email,
        name: newUser.name,
        role: newUser.accountType || 'customer',
        exp: Math.floor(Date.now() / 1000) + CUSTOMER_SESSION_DURATION_SECONDS,
      });

      const response = NextResponse.json({
        success: true,
        user: newUser,
        token: customerToken,
        message: isWholesale
          ? 'تم استلام طلب تاجر الجملة بنجاح! حسابك قيد المراجعة والتدقيق من قبل الإدارة لتفعيل الحساب وإرسال الفواتير.'
          : isMarket
          ? 'تم استلام طلب تسجيل الماركت بنجاح! يمكنك تصفح التطبيق، وسيقوم فريق الإدارة بالتواصل معك واعتماد حسابك لتفعيل إرسال فواتير الشراء.'
          : 'تم إنشاء الحساب وتفعيله بنجاح!',
      }, { status: 201 });

      response.cookies.set({
        name: CUSTOMER_SESSION_COOKIE_NAME,
        value: customerToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: CUSTOMER_SESSION_DURATION_SECONDS,
      });

      return response;
    }

    if (action === 'logout') {
      const response = NextResponse.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
      response.cookies.delete(CUSTOMER_SESSION_COOKIE_NAME);
      return response;
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    console.error('API /api/auth POST error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ غير متوقع في الخادم' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    // 1. Authenticate customer strictly from server-side session
    const authenticatedCustomer = getAuthenticatedCustomer(request);
    if (!authenticatedCustomer) {
      return NextResponse.json({
        success: false,
        error: 'غير مصرح لك بالوصول (يتطلب تسجيل الدخول كزبون لتعديل الملف الشخصي)',
      }, { status: 401 });
    }

    const body = await request.json();
    const rawUpdates = body.updates || body;

    if (!rawUpdates || typeof rawUpdates !== 'object') {
      return NextResponse.json({ success: false, error: 'بيانات التحديث غير صالحة' }, { status: 400 });
    }

    // 2. Fetch current user from database
    const allUsers = getUsers();
    const currentUser = allUsers.find(u => u.id === authenticatedCustomer.id);
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
    }

    // 3. Strict Whitelist of editable customer fields
    // SENSITIVE & ADMINISTRATIVE FIELDS MUST BE COMPLETELY EXCLUDED:
    // id, role, accountType, merchantStatus, category, pricingTier, fixedDiscountPercent, notes, merchantTier, permissions, balance, etc.
    const safeUpdates: Partial<User> = {};

    if (typeof rawUpdates.name === 'string' && rawUpdates.name.trim()) {
      safeUpdates.name = rawUpdates.name.trim();
    }
    if (rawUpdates.businessName !== undefined) {
      safeUpdates.businessName = typeof rawUpdates.businessName === 'string' ? rawUpdates.businessName.trim() : undefined;
    }
    if (rawUpdates.businessType !== undefined) {
      safeUpdates.businessType = typeof rawUpdates.businessType === 'string' ? rawUpdates.businessType.trim() : undefined;
    }
    if (rawUpdates.city !== undefined) {
      safeUpdates.city = typeof rawUpdates.city === 'string' ? rawUpdates.city.trim() : undefined;
    }
    if (rawUpdates.address !== undefined) {
      safeUpdates.address = typeof rawUpdates.address === 'string' ? rawUpdates.address.trim() : undefined;
    }
    if (rawUpdates.avatar !== undefined) {
      safeUpdates.avatar = typeof rawUpdates.avatar === 'string' ? rawUpdates.avatar.trim() : undefined;
    }
    if (rawUpdates.storefrontImage !== undefined) {
      safeUpdates.storefrontImage = typeof rawUpdates.storefrontImage === 'string' ? rawUpdates.storefrontImage.trim() : undefined;
    }
    if (rawUpdates.lat !== undefined) {
      if (rawUpdates.lat === null || rawUpdates.lat === '') {
        safeUpdates.lat = undefined;
      } else {
        const latVal = Number(rawUpdates.lat);
        if (isNaN(latVal) || latVal < -90 || latVal > 90) {
          return NextResponse.json({ success: false, error: 'قيمة lat غير صالحة — يجب أن تكون بين -90 و 90' }, { status: 400 });
        }
        safeUpdates.lat = latVal;
      }
    }
    if (rawUpdates.lng !== undefined) {
      if (rawUpdates.lng === null || rawUpdates.lng === '') {
        safeUpdates.lng = undefined;
      } else {
        const lngVal = Number(rawUpdates.lng);
        if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
          return NextResponse.json({ success: false, error: 'قيمة lng غير صالحة — يجب أن تكون بين -180 و 180' }, { status: 400 });
        }
        safeUpdates.lng = lngVal;
      }
    }
    if (rawUpdates.mapsUrl !== undefined) {
      safeUpdates.mapsUrl = typeof rawUpdates.mapsUrl === 'string' ? rawUpdates.mapsUrl.trim() : undefined;
    }
    if (Array.isArray(rawUpdates.savedAddresses)) {
      safeUpdates.savedAddresses = rawUpdates.savedAddresses;
    }
    if (typeof rawUpdates.password === 'string' && rawUpdates.password.trim()) {
      safeUpdates.password = rawUpdates.password.trim();
    }

    // 4. Handle Phone update with Uniqueness Check & Session Refresh
    let phoneChanged = false;
    if (typeof rawUpdates.phone === 'string' && rawUpdates.phone.trim()) {
      const cleanNewPhone = rawUpdates.phone.trim();
      const existingPhoneUser = findUserByEmailOrPhone(cleanNewPhone);
      if (existingPhoneUser && existingPhoneUser.id !== currentUser.id) {
        return NextResponse.json({
          success: false,
          error: 'رقم الهاتف هذا مسجل مسبقاً لحساب آخر',
        }, { status: 400 });
      }
      if (cleanNewPhone !== currentUser.phone) {
        safeUpdates.phone = cleanNewPhone;
        phoneChanged = true;
      }
    }

    // 5. Handle Email update with Uniqueness Check & Session Refresh
    let emailChanged = false;
    if (typeof rawUpdates.email === 'string') {
      const cleanNewEmail = rawUpdates.email.trim().toLowerCase();
      if (cleanNewEmail && cleanNewEmail !== (currentUser.email || '').toLowerCase()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanNewEmail)) {
          return NextResponse.json({ success: false, error: 'يرجى إدخال بريد إلكتروني صحيح' }, { status: 400 });
        }
        const existingEmailUser = findUserByEmailOrPhone(cleanNewEmail);
        if (existingEmailUser && existingEmailUser.id !== currentUser.id) {
          return NextResponse.json({
            success: false,
            error: 'البريد الإلكتروني هذا مسجل مسبقاً لحساب آخر',
          }, { status: 400 });
        }
        safeUpdates.email = cleanNewEmail;
        emailChanged = true;
      } else if (!cleanNewEmail && currentUser.email) {
        safeUpdates.email = undefined;
        emailChanged = true;
      }
    }

    // 6. Update user profile in DB using ONLY the authenticatedCustomer.id and safeUpdates
    const updatedUser = updateUserProfile(authenticatedCustomer.id, safeUpdates);
    if (!updatedUser) {
      return NextResponse.json({ success: false, error: 'فشل تحديث بيانات المستخدم' }, { status: 500 });
    }

    // 7. Refresh session token if phone, email, or name changed
    let newToken: string | undefined = undefined;
    if (phoneChanged || emailChanged || safeUpdates.name) {
      newToken = signCustomerSession({
        userId: updatedUser.id,
        phone: updatedUser.phone,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.accountType || 'customer',
        exp: Math.floor(Date.now() / 1000) + CUSTOMER_SESSION_DURATION_SECONDS,
      });
    }

    const response = NextResponse.json({
      success: true,
      user: updatedUser,
      token: newToken,
      message: 'تم تحديث الملف الشخصي بنجاح ✓',
    });

    if (newToken) {
      response.cookies.set({
        name: CUSTOMER_SESSION_COOKIE_NAME,
        value: newToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: CUSTOMER_SESSION_DURATION_SECONDS,
      });
    }

    return response;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
