export type SaleType = 'retail' | 'wholesale' | 'special';
export type BannerPosition = 'top' | 'middle' | 'all';

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  linkUrl?: string;
  badge?: string;
  isActive: boolean;
  order?: number;
  position?: BannerPosition; // 'top' (أعلى الصفحة) | 'middle' (بين الأكثر مبيعاً ووصل حديثاً) | 'all'
}

export interface Company {
  id: string;
  name: string;
  category: string;
  categories?: string[]; // الأقسام المتعددة التي تنتمي إليها الشركة
  logo?: string;
  color?: string;
  icon?: string;
  productsCount?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  costPrice?: number; // سعر الشراء / التكلفة
  price: number; // سعر البيع بالمفرد (أو سعر العرض أثناء العرض النشط)
  basePrice?: number; // السعر الأساسي الدائم بالمفرد
  baseWholesalePrice?: number; // سعر كرتون الجملة الأساسي الدائم
  originalPrice?: number; // السعر السابق قبل العرض بالمفرد (مثال: 30000)
  originalWholesalePrice?: number; // سعر الجملة السابق قبل الخصم
  offerBadge?: string; // شارة العرض (مثال: "🔥 عرض خاص")
  isOnOffer?: boolean; // هل المنتج عليه عرض حالياً
  retailUnit: string; // مثال: "كيس عائلي (85 جم)" أو "قطعة مفردة"
  wholesalePrice: number; // سعر كرتون الجملة (التاجر البرونزي 🥉)
  marketPrice?: number; // سعر كرتون الجملة لأصحاب الماركتات والمحلات 🏪
  wholesaleUnit: string; // مثال: "كرتون جملة (6 علب × 24 قطعة)"
  specialPrice?: number; // سعر كرتون الجملة الخاص (التاجر الفضي 🥈)
  vipPrice?: number; // سعر كرتون الجملة المخفض (التاجر الذهبي VIP 🥇)
  wholesaleMinQuantity?: number;
  
  // Wholesale Packaging Breakdown (هيكلية تقسيم الكرتون - علب وقطع)
  boxesPerCarton?: number; // عدد العلب أو الباكيتات داخل الكرتون (مثال: 6 علب)
  itemsPerBox?: number; // عدد القطع في كل علبة (مثال: 24 قطعة)
  itemsPerWholesaleUnit?: number; // إجمالي القطع في الكرتون = boxesPerCarton × itemsPerBox (مثال: 144 قطعة)
  boxCostPrice?: number; // تكلفة شراء العلبة الواحدة
  pieceCostPrice?: number; // تكلفة شراء القطعة المفردة
  boxPrice?: number; // سعر بيع العلبة المفردة (اختياري)
  
  category: string;
  company?: string; // الشركة المصنعة / الماركة
  companyLogo?: string;
  images: string[];
  stock: number;
  minStockAlert?: number; // حد التنبيه الأدنى لنفاد المخزون
  isFeatured?: boolean;
  isBestSeller?: boolean; // الأكثر طلباً ومبيعاً 🔥
  isNew?: boolean; // وصل حديثاً 🆕
  rating?: number;
  reviewsCount?: number;
  origin?: string; // بلد المنشأ (مثال: العراق / تركيا)
  offerEndDate?: string; // تاريخ ووقت انتهاء العرض التلقائي
  orderedWholesaleQty?: number; // إجمالي الكمية المطلوبة من قبل كبار التجار (الجملة)
  orderedMarketQty?: number; // إجمالي الكمية المطلوبة من قبل أصحاب الماركتات والمحلات
  orderedRetailQty?: number; // إجمالي الكمية المطلوبة من قبل الزبائن العاديين (المفرد)
  orderedTotalQty?: number; // إجمالي الكميات المطلوبة في كافة الفواتير
  createdAt: string;
}

export interface ProductOffer {
  id: string;
  productId: string;
  productName: string;
  productImage?: string;
  category: string;
  company?: string;
  originalPrice: number; // السعر الأصلي السابق للمفرد
  originalWholesalePrice?: number; // السعر الأصلي السابق للجملة
  offerPrice: number; // سعر العرض للمفرد
  offerWholesalePrice?: number; // سعر العرض لكرتون الجملة (اختياري)
  discountPercent?: number; // نسبة الخصم %
  badge: string; // نص شارة العرض (مثل: 🔥 عرض خاص)
  startDate?: string;
  endDate: string; // تاريخ ووقت انتهاء العرض
  isActive: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  image?: string;
  icon?: string;
  color?: string;
  count: number;
  description?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  saleType: SaleType;
  pricePerUnit: number;
  unitLabel: string;
}

export interface SavedAddress {
  id: string;
  title: string; // e.g. "موقع البيت 🏠" أو "موقع العمل 🏢" أو "الماركت 🏪"
  city: string;
  address: string;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
  isDefault?: boolean;
}

export interface CustomerInfo {
  name: string;
  businessName?: string;
  phone: string;
  email?: string;
  city: string;
  address: string;
  locationTitle?: string; // e.g. "موقع البيت" أو "موقع العمل"
  lat?: number;
  lng?: number;
  mapsUrl?: string; // رابط الخريطة
  storefrontImage?: string; // صورة واجهة الماركت
  notes?: string;
  isGuest: boolean;
  userId?: string;
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cod' | 'zaincash' | 'qicard' | 'bank_transfer' | 'online' | 'cash';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
  saleType: SaleType;
  unitLabel: string;
  image: string;
}

export type DeliveryCollectionStatus = 'pending' | 'collected_cash' | 'debt_unpaid' | 'partial' | 'returned';

export interface Vehicle {
  id: string;
  name: string; // مثال: "كيا حمل أبيض 2022" أو "ستوتة توصيل سريع"
  plateNumber: string; // رقم اللوحة (مثال: 45211 كربلاء - حمل)
  type: string; // "كيا حمل" | "بيك آب" | "ستوتة" | "دراجة شحن/نارية" | "فانيت" | "أخرى"
  modelYear?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  password?: string;
  vehicleInfo?: string; // الوصف العام أو السيارة الافتراضية
  defaultVehicleId?: string; // معرف السيارة الافتراضية
  isActive: boolean;
  currentCashInHand?: number; // إجمالي الكاش الموجود في عهدة السائق حالياً
  notes?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: CustomerInfo;
  items: OrderItem[];
  subtotal: number;
  deliveryFee?: number;
  discount: number;
  usedCashbackDiscount?: number; // مبلغ الخصم المستقطع من رصيد الأرباح والمكافآت (كاش باك)
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  whatsappSent?: boolean;
  notes?: string;
  paidAmount?: number;
  
  // Driver Assignment & Delivery Tracking (نظام السائقين والتوصيل)
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  driverAssignedAt?: string;
  vehicleId?: string; // معرف السيارة التي يقودها السائق في هذه الطلبية
  vehicleName?: string; // اسم وموديل السيارة
  vehiclePlate?: string; // رقم لوحة السيارة
  outForDeliveryAt?: string; // وقت خروج المندوب بالطريق للزبون
  collectionStatus?: DeliveryCollectionStatus; // حالة التحصيل: كاش / دين آجل / جزئي
  collectedAmount?: number; // المبلغ المحصل نقداً من السائق
  remainingDebtAmount?: number; // المبلغ المتبقي كدين على الزبون
  deliveredAt?: string;
  driverNotes?: string;
  driverCashSettled?: boolean; // هل تم استلام العهدة وتصفيتها من قبل الإدارة وإنشاء سند قبض
  driverCashSettledAt?: string;
  paymentReceiptNumber?: string; // رقم سند القبض الذي تم إنشاؤه في حساب العميل

  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'customer' | 'merchant' | 'admin' | 'driver';
export type MerchantStatus = 'pending' | 'approved' | 'rejected' | 'none';
export type MerchantTier = 'bronze' | 'silver' | 'gold';
export type AccountType = 'individual' | 'market' | 'wholesale' | 'merchant';

export interface User {
  id: string;
  phone: string;
  password?: string;
  name: string;
  email?: string;
  avatar?: string; // الصورة الشخصية للتاجر أو العميل
  storefrontImage?: string; // صورة واجهة الماركت
  role: UserRole;
  accountType?: AccountType;
  merchantStatus?: MerchantStatus;
  merchantTier?: MerchantTier; // برونزي 🥉 | فضي 🥈 | ذهبي VIP 🥇
  businessName?: string;
  businessType?: string;
  city?: string;
  address?: string;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
  savedAddresses?: SavedAddress[]; // العناوين والمواقع المحفوظة
  createdAt: string;
}

export interface CustomerWithStats extends User {
  totalOrdersCount: number;
  totalOrdersAmount: number;
  lastOrderDate?: string;
  hasPurchased: boolean;
}

export interface RegisterMerchantData {
  name: string;
  phone: string;
  password?: string;
  email?: string;
  businessName: string;
  businessType?: string;
  city?: string;
  address?: string;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
}

export interface Coupon {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number;
  isActive: boolean;
}

export interface DeliveryZone {
  id: string;
  name: string; // مثال: "المناطق القريبة والمركز (أقل من 5 كم)"
  distanceTier: 'close' | 'medium' | 'far' | 'custom';
  fee: number; // الكروة بالدينار العراقي (مثال: 2000)
  areas: string; // أسماء المناطق التابعة (مفصولة بفوارز)
  isDefault?: boolean;
}

export interface StoreSettings {
  storeName: string;
  storeTagline?: string;
  footerDescription?: string; // النص التعريفي أسفل شعار سوق الجملة في التذييل
  copyrightText?: string; // نص حقوق النشر في أسفل التذييل
  workingHours?: string; // أوقات وساعات العمل (تظهر في التذييل ومعلومات التواصل)
  phone: string; // هاتف المتجر العام
  whatsapp?: string;
  whatsappNumber?: string; // رقم واتساب استقبال وإرسال الفواتير والطلبيات (قسم المبيعات)
  supportWhatsappNumber?: string; // رقم واتساب الدعم الفني وخدمة العملاء (قسم الدعم والمساعدة)
  supportPhone?: string; // هاتف الاتصال المباشر للدعم الفني
  accountingWhatsappNumber?: string; // رقم واتساب قسم الحسابات والمحاسب (لاستقبال إشعارات التحصيل وتصفية العهد)
  email: string;
  address: string;
  currency: string;
  deliveryFee?: number;
  freeDeliveryThreshold?: number;
  minOrderAmount?: number; // الحد الأدنى لقيمة الطلبية بالدينار العراقي (مثال: 10000)
  deliveryPricingMode?: 'fixed' | 'distance_tiered' | 'per_km'; // نظام الكروة: ثابت، متدرج، أو بالكيلومتر
  deliveryZones?: DeliveryZone[]; // قائمة المناطق وتكلفة كل منطقة
  // موقع المخزن / نقطة انطلاق المندوب
  warehouseLat?: number;       // خط العرض للمخزن
  warehouseLng?: number;       // خط الطول للمخزن
  warehouseName?: string;      // اسم المخزن أو نقطة الانطلاق
  warehouseMapsUrl?: string;   // رابط خرائط Google للمخزن
  // تسعير الكيلومتر
  pricePerKm?: number;         // سعر الكيلومتر الواحد بالدينار العراقي (مثال: 500)
  minDeliveryFee?: number;     // أقل كروة ممكنة بالدينار (مثال: 1500)
  maxDeliveryFee?: number;     // أعلى كروة ممكنة بالدينار (مثال: 10000)
  cashbackPerItem?: number; // المبلغ المكتسب الافتراضي (150 د.ع)
  cashbackCustomerPerItem?: number; // للزبون العادي (المفرد)
  cashbackMarketPerItem?: number; // لأصحاب الماركتات
  cashbackMerchantPerItem?: number; // لتجار الجملة
  bannerText?: string;
  announcement?: string;
  enableGuestCheckout?: boolean;
  isStoreOpen?: boolean;
  banners?: Banner[];

  // Homepage Sections Controls (التحكم بأقسام الصفحة الرئيسية)
  showOffersSection?: boolean; // تفعيل قسم العروض والتخفيضات
  offersSectionTitle?: string;
  offersLimit?: number;

  showBestSellersSection?: boolean; // تفعيل قسم الأكثر طلباً ومبيعاً
  bestSellersSectionTitle?: string;
  bestSellersLimit?: number;

  showNewArrivalsSection?: boolean; // تفعيل قسم آخر المنتجات المضافة (وصل حديثاً)
  newArrivalsSectionTitle?: string;
  newArrivalsLimit?: number;

  // Leaderboard & Competitions Control (إدارة مسابقات الأكثر طلباً للمفرد والتجار)
  competitions?: CompetitionsSettings;

  // Popup Advertisement Modal (الإعلانات المنبثقة الترويجية المتتابعة)
  popupAd?: PopupAdSettings;
  popupAds?: PopupAdSettings[]; // قائمة بجميع البوسترات والإعلانات المنبثقة المتتابعة
}

export interface PopupAdSettings {
  id?: string;
  isEnabled: boolean; // تفعيل الإعلان المنبثق
  title: string; // عنوان الإعلان
  subtitle?: string; // وصف الإعلان
  image: string; // صورة الإعلان
  linkUrl: string; // رابط الوجهة عند النقر
  buttonText?: string; // نص الزر
  badge?: string; // شارة الإعلان
  showOncePerUser?: boolean; // يظهر مرة واحدة للزبون ولا يتكرر
  order?: number; // ترتيب الظهور المتتابع
}

export interface CompetitionLeader {
  id: string;
  rank: number;
  name: string; // اسم الماركت أو التاجر
  city?: string; // المحافظة / المنطقة (مثال: بغداد / كربلاء المقدسة)
  score: string; // حجم الطلبات والكراتين (مثال: "751 كرتون")
  prize?: string; // الجائزة (مثال: "قسيمة 500,000 د.ع")
  badge?: string; // 🥇, 🥈, 🥉
  avatar?: string; // صورة البروفايل أو واجهة المحل
  storefrontImage?: string;
}

export interface CompetitionTrack {
  id: 'customer' | 'retail' | 'wholesale';
  title: string; // مثال: "سباق الزبائن والعملاء الأكثر طلباً 🎁" أو "سباق ماركتات المفرد 🏪" أو "دوري كبار تجار الجملة 👑"
  subtitle: string; // الوصف: "الأكثر طلباً وسحباً يفوز بجوائز وتخفيضات كبرى!"
  prizeSummary: string; // ملخص الجوائز: "مجموع الجوائز 5,000,000 د.ع + بضاعة مجانية"
  endDate: string; // تاريخ ووقت الانتهاء للعداد التنازلي الحي
  isActive: boolean;
  leaders: CompetitionLeader[];
}

export interface CompetitionsSettings {
  isEnabled: boolean; // تفعيل / إظهار قسم المسابقات في الصفحة الرئيسية
  sectionTitle: string; // "🏆 سباق الأكثر طلباً والجوائز الكبرى"
  customerTrack?: CompetitionTrack; // مسار الزبائن الأفراد والعوائل 🎁
  retailTrack: CompetitionTrack; // مسار ماركتات المفرد 🏪
  wholesaleTrack: CompetitionTrack; // مسار تجار الجملة 👑
}

/* =========================================================================
   ACCOUNTING & PROFIT TYPES (النظام المحاسبي وكشوفات الحسابات والأرباح)
   ========================================================================= */

export type TransactionType = 'invoice' | 'payment' | 'return' | 'adjustment';

export interface AccountTransaction {
  id: string;
  date: string;
  type: TransactionType;
  typeLabel: string;
  referenceNumber: string;
  referenceId?: string;
  description: string;
  debit: number; // مدين (مشتريات / مبالغ مستحقة على العميل)
  credit: number; // دائن (دفعات مسددة / مقبوضات)
  balance: number; // الرصيد التراكمي بعد هذه الحركة
  paymentMethod?: string;
  notes?: string;
}

export interface PaymentRecord {
  id: string;
  receiptNumber: string;
  customerPhone: string;
  customerName: string;
  amount: number;
  paymentMethod: 'cash' | 'zaincash' | 'qicard' | 'bank_transfer' | 'other';
  notes?: string;
  receivedBy?: string;
  createdAt: string;
}

export interface CustomerAccountSummary {
  phone: string;
  name: string;
  businessName?: string;
  accountType?: string;
  city?: string;
  ordersCount: number;
  paymentsCount?: number;
  totalInvoiced: number; // إجمالي المشتريات
  totalPaid: number; // إجمالي المسدد
  remainingBalance: number; // الرصيد المتبقي (مطلوب)
  lastActivityDate: string;
}

export interface AccountStatement {
  customer: {
    name: string;
    phone: string;
    email?: string;
    businessName?: string;
    accountType: string;
    city?: string;
    address?: string;
  };
  summary: {
    totalInvoiced: number; // إجمالي المسحوبات / المشتريات
    totalPaid: number; // إجمالي المسدد والمدفوع
    remainingBalance: number; // الرصيد المتبقي المطلوب
    ordersCount: number;
    paymentsCount: number;
  };
  transactions: AccountTransaction[];
}

export interface ProfitReportItem {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  date: string;
  totalRevenue: number; // سعر البيع الإجمالي
  totalCost: number; // إجمالي سعر الشراء / التكلفة
  grossProfit: number; // صافي الربح
  marginPercentage: number; // نسبة هامش الربح
  itemsCount: number;
}

export interface ProductProfitItem {
  productId: string;
  productName: string;
  category: string;
  unitsSold: number;
  costPrice: number;
  sellingPriceAvg: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  marginPercentage: number;
}

export interface ProfitReportSummary {
  period: string;
  startDate?: string;
  endDate?: string;
  totalOrders: number;
  totalRevenue: number; // إجمالي المبيعات
  totalCost: number; // إجمالي تكلفة البضاعة المباعة (COGS)
  grossProfit: number; // صافي الأرباح المحققة
  marginPercentage: number; // نسبة هامش الربح الإجمالية
  ordersBreakdown: ProfitReportItem[];
  productsBreakdown: ProductProfitItem[];
}

export interface PurchaseInvoiceItem {
  productId: string;
  productName: string;
  company: string;
  unit: string;
  quantity: number; // عدد الكراتين المشتراة (مثال: 700 كرتون)
  costPrice: number; // سعر الشراء للكرتون الواحد (د.ع)
  total: number; // الإجمالي = الكمية × سعر شراء الكرتون
  boxesPerCarton?: number; // عدد العلب في الكرتون (مثال: 6)
  itemsPerBox?: number; // عدد القطع في العلبة (مثال: 24)
  totalBoxes?: number; // إجمالي العلب المشتراة = quantity × boxesPerCarton (مثال: 4,200 علبة)
  totalPieces?: number; // إجمالي القطع المشتراة = quantity × (boxesPerCarton × itemsPerBox) (مثال: 100,800 قطعة)
  pieceCostPrice?: number; // تكلفة شراء القطعة الواحدة = costPrice / (boxesPerCarton × itemsPerBox)
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string; // رقم الفاتورة (مثال: PUR-1001)
  companyId?: string;
  companyName: string; // الشركة المجهزة / الماركة
  date: string;
  items: PurchaseInvoiceItem[];
  totalAmount: number; // إجمالي مبلغ فاتورة الشراء
  paymentMethod: 'cash' | 'credit'; // نقداً أو آجل
  notes?: string;
  createdAt: string;
}

export interface UserComplaint {
  id: string;
  userId?: string;
  customerName: string;
  customerPhone: string;
  businessName?: string;
  text: string;
  status: 'pending' | 'reviewed' | 'resolved';
  adminReply?: string;
  createdAt: string;
}

/* =========================================================================
   STAFF & ROLE-BASED ACCESS CONTROL (نظام إدارة الموظفين والصلاحيات)
   ========================================================================= */

export type StaffRole = 'accountant' | 'warehouse' | 'purchasing' | 'supervisor' | 'marketing' | 'custom';

export type StaffPermission =
  | 'dashboard'
  | 'orders'
  | 'accounting'
  | 'reports'
  | 'products'
  | 'offers'
  | 'purchases'
  | 'companies'
  | 'merchants'
  | 'drivers'
  | 'categories'
  | 'banners'
  | 'settings'
  | 'complaints'
  | 'staff';

export interface StaffMember {
  id: string;
  name: string; // اسم الموظف الرباعي أو الثلاثي
  username: string; // اسم المستخدم الفريد للدخول
  password?: string; // كلمة المرور
  phone: string; // رقم هاتف الموظف
  jobTitle: string; // المسمى الوظيفي (مثال: محاسب رئيسي، مسؤول التجهيز والمستودع)
  role: StaffRole; // الدور العام
  permissions: string[]; // قائمة الأقسام المسموح له بالوصول إليها
  isActive: boolean; // حالة الحساب: نشط أو معطل
  notes?: string;
  createdAt: string;
  lastLoginAt?: string;
}

/* =========================================================================
   CASH VAULT 181 (صندوق النقدية الرئيسي - حساب 181)
   ========================================================================= */

export type CashMovementCategory =
  | 'sales_cash' // مبيعات نقدية مباشرة
  | 'debt_collection' // سند قبض وتحصيل دين من زبون
  | 'driver_settlement' // تصفية واستلام كاش من عهدة سائق
  | 'purchase_payment' // صرف وسداد فاتورة مشتريات
  | 'expense' // مصاريف تشغيلية ونثرية
  | 'owner_withdrawal' // مسحوبات شخصية / أرباح
  | 'deposit_adjustment'; // إيداع وتغذية الصندوق

export interface CashVaultMovement {
  id: string;
  transactionNumber: string; // رقم حركة الصندوق (مثال: CSH-1001)
  date: string;
  type: 'inflow' | 'outflow'; // مقبوضات (داخل للصندوق) أو مدفوعات (خارج من الصندوق)
  category: CashMovementCategory;
  categoryLabel: string;
  amount: number; // المبلغ بالدينار العراقي
  balanceAfter: number; // رصيد الصندوق بعد هذه الحركة
  referenceNumber?: string; // رقم الفاتورة أو سند القبض أو المعاملة
  referenceId?: string;
  partyName?: string; // اسم الطرف الآخر (الزبون / المجهز / السائق)
  performedBy: {
    name: string;
    username: string;
    role?: string;
  };
  notes?: string;
  createdAt: string;
}

export interface CashVaultSummary {
  accountCode: '181';
  accountName: string; // "نقدية لدى الصندوق (الصندوق 181)"
  currentBalance: number; // الرصيد النقدي الفعلي المتوفر بالصندوق
  todayInflow: number; // مقبوضات اليوم
  todayOutflow: number; // مدفوعات ومصروفات اليوم
  totalInflowAllTime: number; // إجمالي المقبوضات
  totalOutflowAllTime: number; // إجمالي المدفوعات
  movementsCount: number;
}

/* =========================================================================
   AUDIT LOG & ACTIVITY TRAIL (سجل الرقابة وتدقيق حركات الموظفين غير القابل للتلاعب)
   ========================================================================= */

export type AuditActionType =
  | 'order_created'
  | 'order_updated'
  | 'order_status_changed'
  | 'order_deleted'
  | 'payment_created'
  | 'payment_updated'
  | 'payment_deleted'
  | 'driver_custody_settled'
  | 'purchase_created'
  | 'purchase_deleted'
  | 'product_created'
  | 'product_updated'
  | 'product_deleted'
  | 'customer_created'
  | 'customer_updated'
  | 'customer_status_changed'
  | 'customer_deleted'
  | 'staff_login'
  | 'staff_created'
  | 'staff_updated'
  | 'staff_status_changed'
  | 'staff_deleted'
  | 'cash_deposit'
  | 'cash_withdrawal'
  | 'cash_expense';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actionType: AuditActionType;
  actionLabel: string; // مثال: "إصدار سند قبض نقدي" أو "تعديل فاتورة مبيعات"
  category: 'cash_vault' | 'accounting' | 'orders' | 'purchases' | 'inventory' | 'drivers' | 'staff' | 'auth';
  categoryLabel: string;
  operator: {
    id?: string;
    name: string;
    username: string;
    role: string;
    jobTitle?: string;
  };
  target?: {
    type: string;
    id?: string;
    name?: string;
    referenceNumber?: string;
  };
  financialImpact?: {
    amount?: number;
    previousBalance?: number;
    newBalance?: number;
    fundType?: 'cash_181' | 'bank_182' | 'debt';
  };
  details: string; // نص تفصيلي غير قابل للتعديل يوضح ما قام به الموظف بالتحديد
  severity: 'info' | 'warning' | 'danger'; // تحذيري للعمليات الحساسة كالحذف أو التعديل المالي
  ipAddress?: string;
}

export interface CustomerComplaint {
  id: string;
  userId?: string;
  customerName: string;
  customerPhone: string;
  businessName?: string;
  city?: string;
  text: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'archived';
  adminReply?: string;
  repliedAt?: string;
  repliedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
  userId?: string;
  userPhone?: string;
  userName?: string;
  accountType?: AccountType | 'visitor';
  userAgent?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet';
  createdAt: string;
  lastActiveAt?: string;
}

export interface PushNotificationLog {
  id: string;
  title: string;
  body: string;
  image?: string;
  icon?: string;
  badge?: string;
  url?: string;
  targetAudience: 'all' | 'wholesale' | 'market' | 'retail';
  targetAudienceLabel: string;
  sentCount: number;
  successCount: number;
  failureCount: number;
  sentBy?: string;
  createdAt: string;
}



