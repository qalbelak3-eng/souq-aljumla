import { NextResponse } from 'next/server';
import { findUserByEmailOrPhone, createUser, updateUserProfile, getUsers } from '@/lib/db';
import { signCustomerSession, CUSTOMER_SESSION_COOKIE_NAME, CUSTOMER_SESSION_DURATION_SECONDS, getAuthenticatedCustomer, getAuthenticatedAdmin, hasPermission, hashPassword, verifyPassword } from '@/lib/auth';
import { User } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function publicUser(user: User) {
  const { password: _password, ...safe } = user as User & { password?: string };
  return safe;
}
function normalizePassword(value?: string) {
  const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  return (value || '').trim().replace(/[٠-٩]/g, w => arabicDigits.indexOf(w).toString());
}
function issueCustomerSession(user: User) {
  return signCustomerSession({ userId: user.id, phone: user.phone, email: user.email, name: user.name, role: user.accountType || 'customer', exp: Math.floor(Date.now() / 1000) + CUSTOMER_SESSION_DURATION_SECONDS });
}
function setCustomerCookie(response: NextResponse, token: string) {
  response.cookies.set({ name: CUSTOMER_SESSION_COOKIE_NAME, value: token, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: CUSTOMER_SESSION_DURATION_SECONDS });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const identifier = searchParams.get('identifier') || searchParams.get('phone') || searchParams.get('email');
    const admin = await getAuthenticatedAdmin(request);
    const isAdmin = admin && (hasPermission(admin, 'merchants') || hasPermission(admin, 'orders') || admin.role === 'admin');
    if (isAdmin) {
      if (!identifier) return NextResponse.json({ success: false, error: 'المعرف مطلوب لعمليات الإدارة' }, { status: 400 });
      const user = findUserByEmailOrPhone(identifier) || getUsers().find(u => u.id === identifier);
      if (!user) return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
      return NextResponse.json({ success: true, user: publicUser(user) });
    }
    const customer = await getAuthenticatedCustomer(request);
    if (!customer) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (يتطلب تسجيل الدخول للاطلاع على بيانات الحساب)' }, { status: 401 });
    const user = getUsers().find(u => u.id === customer.id);
    if (!user) return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
    return NextResponse.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error('GET /api/auth failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحميل بيانات الحساب' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, identifier, password, name, email, phone, accountType, businessName, businessType, city, address, storefrontImage, lat, lng, mapsUrl } = body;
    if (action === 'login') {
      if (!identifier || !String(identifier).trim()) return NextResponse.json({ success: false, error: 'يرجى إدخال رقم الهاتف أو البريد الإلكتروني' }, { status: 400 });
      const user = findUserByEmailOrPhone(String(identifier).trim());
      if (!user) return NextResponse.json({ success: false, error: 'لم يتم العثور على حساب مسجل بهذا الرقم أو البريد' }, { status: 404 });
      const inputPass = normalizePassword(password);
      const stored = String(user.password || '');
      if (stored) {
        if (!inputPass) return NextResponse.json({ success: false, error: 'يرجى إدخال كلمة السر الخاصة بحسابك' }, { status: 401 });
        const hashed = stored.startsWith('scrypt:');
        const valid = hashed ? verifyPassword(inputPass, stored) : normalizePassword(stored) === inputPass;
        if (!valid) return NextResponse.json({ success: false, error: 'كلمة السر غير صحيحة، يرجى المحاولة مجدداً أو استعادة الحساب' }, { status: 401 });
        if (!hashed) updateUserProfile(user.id, { password: hashPassword(inputPass) });
      } else if (inputPass) {
        updateUserProfile(user.id, { password: hashPassword(inputPass) });
      }
      const token = issueCustomerSession(user);
      const response = NextResponse.json({ success: true, user: publicUser(user), token, message: 'تم تسجيل الدخول بنجاح ✓' });
      setCustomerCookie(response, token);
      return response;
    }
    if (action === 'register') {
      if (!name || !phone) return NextResponse.json({ success: false, error: 'يرجى إدخال الاسم ورقم الهاتف' }, { status: 400 });
      const cleanPassword = normalizePassword(password);
      if (!cleanPassword || cleanPassword.length < 6) return NextResponse.json({ success: false, error: 'كلمة السر يجب أن تكون 6 أحرف أو أرقام على الأقل' }, { status: 400 });
      if (email && String(email).trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return NextResponse.json({ success: false, error: 'يرجى إدخال بريد إلكتروني صحيح' }, { status: 400 });
      const cleanPhone = String(phone).replace(/\D/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 13) return NextResponse.json({ success: false, error: 'يرجى إدخال رقم هاتف صحيح' }, { status: 400 });
      if (findUserByEmailOrPhone(String(phone))) return NextResponse.json({ success: false, error: 'يوجد حساب مسجل مسبقاً برقم الهاتف هذا' }, { status: 400 });
      if (email && String(email).trim() && findUserByEmailOrPhone(String(email).trim())) return NextResponse.json({ success: false, error: 'يوجد حساب مسجل مسبقاً بهذا البريد الإلكتروني' }, { status: 400 });
      const isWholesale = accountType === 'wholesale' || accountType === 'merchant';
      const isMarket = accountType === 'market';
      if ((isWholesale || isMarket) && !String(businessName || '').trim()) return NextResponse.json({ success: false, error: isMarket ? 'يرجى إدخال اسم الماركت / المحل التجاري' : 'يرجى إدخال اسم النشاط التجاري للتاجر' }, { status: 400 });
      if (isMarket && !storefrontImage) return NextResponse.json({ success: false, error: 'يرجى التقاط أو رفع صورة واجهة الماركت (إجباري)' }, { status: 400 });
      const newUser = createUser({ name: String(name).trim(), email: email ? String(email).trim().toLowerCase() : undefined, phone: String(phone).trim(), password: hashPassword(cleanPassword), accountType: accountType || 'individual', businessName, businessType: businessType || (isMarket ? 'ماركت ومحل تجاري' : isWholesale ? 'تجارة جملة وتوزيع' : undefined), city, address, storefrontImage, lat: lat ? Number(lat) : undefined, lng: lng ? Number(lng) : undefined, mapsUrl });
      const token = issueCustomerSession(newUser);
      const response = NextResponse.json({ success: true, user: publicUser(newUser), token, message: isWholesale ? 'تم استلام طلب تاجر الجملة بنجاح! حسابك قيد المراجعة والتدقيق من قبل الإدارة لتفعيل الحساب وإرسال الفواتير.' : isMarket ? 'تم استلام طلب تسجيل الماركت بنجاح! يمكنك تصفح التطبيق، وسيقوم فريق الإدارة بالتواصل معك واعتماد حسابك لتفعيل إرسال فواتير الشراء.' : 'تم إنشاء الحساب وتفعيله بنجاح!' }, { status: 201 });
      setCustomerCookie(response, token);
      return response;
    }
    if (action === 'logout') { const response = NextResponse.json({ success: true, message: 'تم تسجيل الخروج بنجاح' }); response.cookies.delete(CUSTOMER_SESSION_COOKIE_NAME); return response; }
    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/auth failed:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ غير متوقع في الخادم' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const customer = await getAuthenticatedCustomer(request);
    if (!customer) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (يتطلب تسجيل الدخول كزبون لتعديل الملف الشخصي)' }, { status: 401 });
    const body = await request.json(); const raw = body.updates || body;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NextResponse.json({ success: false, error: 'بيانات التحديث غير صالحة' }, { status: 400 });
    const current = getUsers().find(u => u.id === customer.id);
    if (!current) return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
    const safe: Partial<User> = {};
    if (typeof raw.name === 'string' && raw.name.trim()) safe.name = raw.name.trim();
    for (const key of ['businessName','businessType','city','address','avatar','storefrontImage','mapsUrl'] as const) if (raw[key] !== undefined) (safe as any)[key] = typeof raw[key] === 'string' ? raw[key].trim() || undefined : undefined;
    if (Array.isArray(raw.savedAddresses)) safe.savedAddresses = raw.savedAddresses;
    if (raw.lat !== undefined) { const v = Number(raw.lat); if (raw.lat === '' || raw.lat === null) safe.lat = undefined; else if (!Number.isFinite(v) || v < -90 || v > 90) return NextResponse.json({ success: false, error: 'قيمة lat غير صالحة — يجب أن تكون بين -90 و 90' }, { status: 400 }); else safe.lat = v; }
    if (raw.lng !== undefined) { const v = Number(raw.lng); if (raw.lng === '' || raw.lng === null) safe.lng = undefined; else if (!Number.isFinite(v) || v < -180 || v > 180) return NextResponse.json({ success: false, error: 'قيمة lng غير صالحة — يجب أن تكون بين -180 و 180' }, { status: 400 }); else safe.lng = v; }
    if (typeof raw.password === 'string' && raw.password.trim()) { const p = normalizePassword(raw.password); if (p.length < 6) return NextResponse.json({ success: false, error: 'كلمة السر يجب أن تكون 6 أحرف أو أرقام على الأقل' }, { status: 400 }); safe.password = hashPassword(p); }
    let refresh = Boolean(safe.name);
    if (typeof raw.phone === 'string' && raw.phone.trim() && raw.phone.trim() !== current.phone) { const other = findUserByEmailOrPhone(raw.phone.trim()); if (other && other.id !== current.id) return NextResponse.json({ success: false, error: 'رقم الهاتف هذا مسجل مسبقاً لحساب آخر' }, { status: 400 }); safe.phone = raw.phone.trim(); refresh = true; }
    if (typeof raw.email === 'string') { const e = raw.email.trim().toLowerCase(); if (e && e !== (current.email || '').toLowerCase()) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return NextResponse.json({ success: false, error: 'يرجى إدخال بريد إلكتروني صحيح' }, { status: 400 }); const other = findUserByEmailOrPhone(e); if (other && other.id !== current.id) return NextResponse.json({ success: false, error: 'البريد الإلكتروني هذا مسجل مسبقاً لحساب آخر' }, { status: 400 }); safe.email = e; refresh = true; } else if (!e && current.email) { safe.email = undefined; refresh = true; } }
    const updated = updateUserProfile(customer.id, safe);
    if (!updated) return NextResponse.json({ success: false, error: 'فشل تحديث بيانات المستخدم' }, { status: 500 });
    const token = refresh ? issueCustomerSession(updated) : undefined;
    const response = NextResponse.json({ success: true, user: publicUser(updated), token, message: 'تم تحديث الملف الشخصي بنجاح ✓' });
    if (token) setCustomerCookie(response, token);
    return response;
  } catch (error) {
    console.error('PUT /api/auth failed:', error);
    return NextResponse.json({ success: false, error: 'تعذر تحديث الملف الشخصي' }, { status: 500 });
  }
}
