import fs from 'fs';
import path from 'path';
import {
  Product,
  ProductOffer,
  Order,
  StoreSettings,
  User,
  Coupon,
  Category,
  MerchantStatus,
  MerchantTier,
  AccountType,
  SavedAddress,
  Banner,
  AccountTransaction,
  PaymentRecord,
  CustomerAccountSummary,
  AccountStatement,
  ProfitReportSummary,
  ProfitReportItem,
  ProductProfitItem,
  Company,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  Driver,
  Vehicle,
  DeliveryCollectionStatus,
  CustomerWithStats,
  StaffMember,
  CashVaultMovement,
  CashVaultSummary,
  CashMovementCategory,
  AuditLogEntry,
  AuditActionType,
  CustomerComplaint,
  PushSubscriptionRecord,
  PushNotificationLog,
  DriverRating
} from '@/types';
import { initialProducts, initialCategories, initialSettings, initialCoupons, initialBanners } from '@/data/initialData';

const IS_SERVERLESS = process.env.NETLIFY === 'true' || process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
const DATA_DIR = IS_SERVERLESS ? path.join('/tmp', 'souq_data') : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'store_db.json');
const SOURCE_DB_FILE = path.join(process.cwd(), 'data', 'store_db.json');

export interface AdminCredentials {
  username: string;
  passwordHash: string;
}

interface DatabaseSchema {
  products: Product[];
  categories: Category[];
  orders: Order[];
  settings: StoreSettings;
  users: User[];
  coupons: Coupon[];
  banners?: Banner[];
  payments?: PaymentRecord[];
  companies?: Company[];
  offers?: ProductOffer[];
  purchaseInvoices?: PurchaseInvoice[];
  drivers?: Driver[];
  vehicles?: Vehicle[];
  staff?: StaffMember[];
  auditLogs?: AuditLogEntry[];
  cashVaultMovements?: CashVaultMovement[];
  complaints?: CustomerComplaint[];
  pushSubscriptions?: PushSubscriptionRecord[];
  pushNotificationLogs?: PushNotificationLog[];
  driverRatings?: DriverRating[];
  adminAuth: {
    username: string;
    password: string;
  };
}

const initialUsers: User[] = [
  {
    id: "usr-1787249816778",
    name: "محمد علي",
    email: "qalbelak3@gmail.com",
    phone: "07708020686",
    role: "customer",
    accountType: "merchant",
    merchantStatus: "approved",
    businessName: "اسواق الصافي",
    businessType: "ميني ماركت وبقالة",
    city: "كربلاء المقدسة",
    address: "السناتر",
    createdAt: "2026-08-20T18:16:56.778Z",
  },
  {
    id: "usr-merchant-1",
    name: "علي الكرخي",
    email: "ali@mansour-market.iq",
    phone: "07712345678",
    role: "customer",
    accountType: "merchant",
    merchantStatus: "approved",
    businessName: "أسواق المنصور المركزية",
    businessType: "سوبرماركت وأسواق غذائية",
    city: "بغداد - الكرخ",
    address: "شارع 14 رمضان",
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr-customer-1",
    name: "أحمد السعدي",
    email: "ahmed@example.com",
    phone: "07709876543",
    role: "customer",
    accountType: "individual",
    city: "بغداد - الرصافة",
    address: "شارع فلسطين",
    createdAt: new Date().toISOString(),
  },
];

let inMemoryDb: DatabaseSchema | null = null;

function ensureDbExists(): DatabaseSchema {
  if (inMemoryDb) {
    return inMemoryDb;
  }

  const defaultAdmin = {
    username: "admin",
    password: "admin123"
  };

  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      if (raw && raw.trim().length > 0) {
        inMemoryDb = JSON.parse(raw) as DatabaseSchema;
        return inMemoryDb;
      }
    }
  } catch {}

  try {
    if (fs.existsSync(SOURCE_DB_FILE)) {
      const sourceRaw = fs.readFileSync(SOURCE_DB_FILE, 'utf-8');
      if (sourceRaw && sourceRaw.trim().length > 0) {
        inMemoryDb = JSON.parse(sourceRaw) as DatabaseSchema;
        return inMemoryDb;
      }
    }
  } catch {}

  inMemoryDb = {
    products: initialProducts,
    categories: initialCategories,
    orders: [],
    settings: initialSettings,
    users: initialUsers,
    coupons: initialCoupons,
    banners: initialBanners,
    payments: [],
    purchaseInvoices: [],
    offers: [],
    pushSubscriptions: [],
    pushNotificationLogs: [],
    adminAuth: defaultAdmin,
  };
  return inMemoryDb;
}

function saveDb(data: DatabaseSchema) {
  inMemoryDb = data;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(DB_FILE, jsonStr, 'utf-8');

    // 🛡️ Automatic Backup: حفظ نسخة احتياطية حية دائمة
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    fs.writeFileSync(path.join(backupDir, 'store_db_latest.backup.json'), jsonStr, 'utf-8');
  } catch (e) {
    console.error('saveDb serverless disk write error (using in-memory):', e);
  }
}

// Products CRUD with Automatic Active Offers Overlay & Real Order Analytics
export function getProducts(filters?: { category?: string; query?: string; featured?: boolean }): Product[] {
  const db = ensureDbExists();
  let list = db.products;

  // Active unexpired offers overlay
  const now = new Date();
  const activeOffers = (db.offers || []).filter(o => o.isActive && new Date(o.endDate) > now);
  const offerMap = new Map<string, ProductOffer>();
  activeOffers.forEach(o => offerMap.set(o.productId, o));

  // Compute real order quantities per product by wholesale, market, and regular retail customers
  const wholesaleOrderCounts = new Map<string, number>();
  const marketOrderCounts = new Map<string, number>();
  const retailOrderCounts = new Map<string, number>();
  const totalOrderCounts = new Map<string, number>();

  const usersMap = new Map<string, User>();
  (db.users || []).forEach(u => {
    if (u.id) usersMap.set(u.id, u);
    if (u.phone) usersMap.set(u.phone, u);
  });

  (db.orders || []).forEach(o => {
    if (!o || !Array.isArray(o.items) || o.status === 'cancelled') return;

    const customerUser =
      (o.customer?.userId ? usersMap.get(o.customer.userId) : undefined) ||
      (o.customer?.phone ? usersMap.get(o.customer.phone) : undefined);

    const isWholesaleCust =
      customerUser?.accountType === 'wholesale' ||
      customerUser?.accountType === 'merchant' ||
      customerUser?.role === 'merchant' ||
      customerUser?.businessType === 'wholesale' ||
      (typeof o.customer?.businessName === 'string' && o.customer.businessName.includes('جملة'));

    const isMarketCust =
      !isWholesaleCust &&
      (customerUser?.accountType === 'market' ||
       customerUser?.businessType === 'market' ||
       Boolean(o.customer?.businessName));

    o.items.forEach(item => {
      if (!item || !item.productId) return;
      const qty = Number(item.quantity) || 0;
      totalOrderCounts.set(item.productId, (totalOrderCounts.get(item.productId) || 0) + qty);

      if (isWholesaleCust || item.saleType === 'wholesale') {
        wholesaleOrderCounts.set(item.productId, (wholesaleOrderCounts.get(item.productId) || 0) + qty);
      } else if (isMarketCust) {
        marketOrderCounts.set(item.productId, (marketOrderCounts.get(item.productId) || 0) + qty);
      } else {
        retailOrderCounts.set(item.productId, (retailOrderCounts.get(item.productId) || 0) + qty);
      }
    });
  });

  list = list.map(p => {
    const offer = offerMap.get(p.id);
    const orderedWholesaleQty = wholesaleOrderCounts.get(p.id) || 0;
    const orderedMarketQty = marketOrderCounts.get(p.id) || 0;
    const orderedRetailQty = retailOrderCounts.get(p.id) || 0;
    const orderedTotalQty = totalOrderCounts.get(p.id) || 0;

    const trueBasePrice = offer ? (offer.originalPrice || p.price) : p.price;
    const trueBaseWholesalePrice = offer ? (offer.originalWholesalePrice || p.wholesalePrice) : p.wholesalePrice;

    let prod: Product = {
      ...p,
      basePrice: trueBasePrice,
      baseWholesalePrice: trueBaseWholesalePrice,
      orderedWholesaleQty,
      orderedMarketQty,
      orderedRetailQty,
      orderedTotalQty,
    };

    if (offer) {
      prod = {
        ...prod,
        isOnOffer: true,
        price: offer.offerPrice,
        originalPrice: offer.originalPrice || p.price,
        wholesalePrice: (offer.offerWholesalePrice && offer.offerWholesalePrice > 0) ? offer.offerWholesalePrice : p.wholesalePrice,
        originalWholesalePrice: (offer.offerWholesalePrice && offer.offerWholesalePrice > 0) ? (offer.originalWholesalePrice || p.wholesalePrice) : undefined,
        offerBadge: offer.badge || '🔥 عرض خاص',
        offerEndDate: offer.endDate,
        basePrice: trueBasePrice,
        baseWholesalePrice: trueBaseWholesalePrice,
      };
    }
    return prod;
  });

  if (filters?.category && filters.category !== 'الكل') {
    list = list.filter(p => p.category === filters.category);
  }

  if (filters?.featured) {
    list = list.filter(p => p.isFeatured);
  }

  if (filters?.query) {
    const q = filters.query.toLowerCase().trim();
    list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }

  return list;
}

export function getProductById(id: string): Product | undefined {
  const db = ensureDbExists();
  const product = db.products.find(p => p.id === id);
  if (!product) return undefined;

  const now = new Date();
  const activeOffer = (db.offers || []).find(o => o.productId === id && o.isActive && new Date(o.endDate) > now);
  const trueBasePrice = activeOffer ? (activeOffer.originalPrice || product.price) : product.price;
  const trueBaseWholesalePrice = activeOffer ? (activeOffer.originalWholesalePrice || product.wholesalePrice) : product.wholesalePrice;

  if (activeOffer) {
    return {
      ...product,
      isOnOffer: true,
      price: activeOffer.offerPrice,
      originalPrice: activeOffer.originalPrice || product.price,
      wholesalePrice: (activeOffer.offerWholesalePrice && activeOffer.offerWholesalePrice > 0) ? activeOffer.offerWholesalePrice : product.wholesalePrice,
      originalWholesalePrice: (activeOffer.offerWholesalePrice && activeOffer.offerWholesalePrice > 0) ? (activeOffer.originalWholesalePrice || product.wholesalePrice) : undefined,
      offerBadge: activeOffer.badge || '🔥 عرض خاص',
      offerEndDate: activeOffer.endDate,
      basePrice: trueBasePrice,
      baseWholesalePrice: trueBaseWholesalePrice,
    };
  }

  return {
    ...product,
    basePrice: trueBasePrice,
    baseWholesalePrice: trueBaseWholesalePrice,
  };
}

export function createProduct(product: Omit<Product, 'id' | 'createdAt'>): Product {
  const db = ensureDbExists();
  const newProduct: Product = {
    ...product,
    costPrice: product.costPrice ?? (product.wholesalePrice ? Math.round(product.wholesalePrice * 0.8) : Math.round(product.price * 0.7)),
    specialPrice: product.specialPrice ?? (product.wholesalePrice ? Math.round(product.wholesalePrice * 0.95) : Math.round(product.price * 0.9)),
    id: 'prod-' + Date.now(),
    createdAt: new Date().toISOString(),
  };
  db.products.unshift(newProduct);
  saveDb(db);
  return newProduct;
}

export function updateProduct(id: string, updates: Partial<Product>): Product | null {
  const db = ensureDbExists();
  const index = db.products.findIndex(p => p.id === id);
  if (index === -1) return null;

  db.products[index] = { ...db.products[index], ...updates };

  // Sync / update db.offers to prevent stale offers from overriding updated product prices
  if (db.offers && Array.isArray(db.offers)) {
    const offerIdx = db.offers.findIndex(o => o.productId === id);
    if (offerIdx !== -1) {
      if (updates.isOnOffer === false) {
        db.offers.splice(offerIdx, 1);
      } else {
        if (updates.price !== undefined) db.offers[offerIdx].offerPrice = updates.price;
        if (updates.wholesalePrice !== undefined) db.offers[offerIdx].offerWholesalePrice = updates.wholesalePrice;
        if (updates.originalPrice !== undefined) db.offers[offerIdx].originalPrice = updates.originalPrice;
        if (updates.originalWholesalePrice !== undefined) db.offers[offerIdx].originalWholesalePrice = updates.originalWholesalePrice;
        if (updates.offerBadge !== undefined) db.offers[offerIdx].badge = updates.offerBadge;
      }
    }
  }

  saveDb(db);
  return db.products[index];
}

export function deleteProduct(id: string): boolean {
  const db = ensureDbExists();
  const initialLength = db.products.length;
  db.products = db.products.filter(p => p.id !== id);
  if (db.products.length !== initialLength) {
    // Also remove any active/inactive offers referencing this product
    if (db.offers) {
      db.offers = db.offers.filter(o => o.productId !== id);
    }
    saveDb(db);
    return true;
  }
  return false;
}

// Categories Management (CRUD)
export function getCategories(): Category[] {
  const db = ensureDbExists();
  return db.categories;
}

export function createCategory(cat: { name: string; image?: string; icon?: string; color?: string; description?: string }): Category {
  const db = ensureDbExists();
  const slug = cat.name.toLowerCase().replace(/\s+/g, '-');
  const newCat: Category = {
    id: 'cat-' + Date.now(),
    name: cat.name.trim(),
    slug,
    image: cat.image?.trim() || '',
    icon: cat.icon?.trim() || 'basket',
    color: cat.color?.trim() || '#16a34a',
    description: cat.description?.trim(),
    count: 0,
  };
  db.categories.push(newCat);
  saveDb(db);
  return newCat;
}

export function updateCategory(id: string, updates: Partial<Category>): Category | null {
  const db = ensureDbExists();
  const index = db.categories.findIndex(c => c.id === id);
  if (index === -1) return null;

  db.categories[index] = { ...db.categories[index], ...updates };
  saveDb(db);
  return db.categories[index];
}

export function deleteCategory(id: string): boolean {
  const db = ensureDbExists();
  const initialLength = db.categories.length;
  db.categories = db.categories.filter(c => c.id !== id);
  if (db.categories.length !== initialLength) {
    saveDb(db);
    return true;
  }
  return false;
}

// Orders Management
export function getOrders(): Order[] {
  const db = ensureDbExists();
  return db.orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getOrderById(id: string): Order | undefined {
  const db = ensureDbExists();
  return db.orders.find(o => o.id === id || o.orderNumber === id);
}

export function createOrder(orderData: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>): Order {
  const db = ensureDbExists();
  const now = new Date();
  
  // Calculate maximum sequence monotonically to prevent duplicate invoice numbers if orders are deleted
  const maxSeq = (db.orders || []).reduce((max, o) => {
    const num = parseInt(o.orderNumber?.replace(/\D/g, '') || '0', 10);
    return num > max ? num : max;
  }, 1000);
  const nextOrderSeq = maxSeq + 1;
  const orderNumber = `INV-${nextOrderSeq}`;
  
  // Attach costPrice snapshot to each item if available
  const enrichedItems = (orderData.items || []).map(item => {
    const prod = db.products.find(p => p.id === item.productId);
    return {
      ...item,
      costPrice: item.costPrice ?? prod?.costPrice ?? (item.saleType === 'wholesale' ? Math.round(item.price * 0.8) : Math.round(item.price * 0.7)),
    };
  });

  const newOrder: Order = {
    ...orderData,
    items: enrichedItems,
    id: 'ord-' + Date.now(),
    orderNumber,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // 📦 AUTOMATIC REAL-TIME STOCK DEDUCTION UPON SALE
  for (const item of enrichedItems) {
    const prodIdx = db.products.findIndex(p => p.id === item.productId || (item.name && p.name === item.name));
    if (prodIdx > -1) {
      const prod = db.products[prodIdx];
      const piecesPerCarton = prod.itemsPerWholesaleUnit || (prod.boxesPerCarton && prod.itemsPerBox ? prod.boxesPerCarton * prod.itemsPerBox : 1) || 1;
      let deductedStock = 0;
      if (item.saleType === 'wholesale') {
        deductedStock = Number(item.quantity) || 1;
      } else {
        const qtyPieces = Number(item.quantity) || 1;
        deductedStock = piecesPerCarton > 1 ? Number((qtyPieces / piecesPerCarton).toFixed(2)) : qtyPieces;
      }
      db.products[prodIdx].stock = Math.max(0, Number(((db.products[prodIdx].stock || 0) - deductedStock).toFixed(2)));
    }
  }

  db.orders.unshift(newOrder);
  saveDb(db);
  return newOrder;
}

export function updateOrderStatus(id: string, status: Order['status']): Order | null {
  const db = ensureDbExists();
  const index = db.orders.findIndex(o => o.id === id || o.orderNumber === id);
  if (index === -1) return null;

  const oldStatus = db.orders[index].status;
  db.orders[index].status = status;
  db.orders[index].updatedAt = new Date().toISOString();

  // If order was cancelled, restore inventory
  if (status === 'cancelled' && oldStatus !== 'cancelled') {
    for (const item of db.orders[index].items || []) {
      const prodIdx = db.products.findIndex(p => p.id === item.productId || (item.name && p.name === item.name));
      if (prodIdx > -1) {
        const prod = db.products[prodIdx];
        const piecesPerCarton = prod.itemsPerWholesaleUnit || (prod.boxesPerCarton && prod.itemsPerBox ? prod.boxesPerCarton * prod.itemsPerBox : 1) || 1;
        let restoredStock = 0;
        if (item.saleType === 'wholesale') {
          restoredStock = Number(item.quantity) || 1;
        } else {
          const qtyPieces = Number(item.quantity) || 1;
          restoredStock = piecesPerCarton > 1 ? Number((qtyPieces / piecesPerCarton).toFixed(2)) : qtyPieces;
        }
        db.products[prodIdx].stock = Number(((db.products[prodIdx].stock || 0) + restoredStock).toFixed(2));
      }
    }
  } else if (oldStatus === 'cancelled' && status !== 'cancelled') {
    // If uncancelled, re-deduct inventory
    for (const item of db.orders[index].items || []) {
      const prodIdx = db.products.findIndex(p => p.id === item.productId || (item.name && p.name === item.name));
      if (prodIdx > -1) {
        const prod = db.products[prodIdx];
        const piecesPerCarton = prod.itemsPerWholesaleUnit || (prod.boxesPerCarton && prod.itemsPerBox ? prod.boxesPerCarton * prod.itemsPerBox : 1) || 1;
        let deductedStock = 0;
        if (item.saleType === 'wholesale') {
          deductedStock = Number(item.quantity) || 1;
        } else {
          const qtyPieces = Number(item.quantity) || 1;
          deductedStock = piecesPerCarton > 1 ? Number((qtyPieces / piecesPerCarton).toFixed(2)) : qtyPieces;
        }
        db.products[prodIdx].stock = Math.max(0, Number(((db.products[prodIdx].stock || 0) - deductedStock).toFixed(2)));
      }
    }
  }

  saveDb(db);
  return db.orders[index];
}

export function updateOrder(id: string, updates: Partial<Order>, adjustInventory: boolean = true): Order | null {
  const db = ensureDbExists();
  const index = db.orders.findIndex(o => o.id === id || o.orderNumber === id);
  if (index === -1) return null;

  const oldOrder = db.orders[index];

  // If items are being updated and adjustInventory is true:
  if (adjustInventory && updates.items) {
    const oldItemsMap = new Map<string, number>();
    oldOrder.items.forEach(it => {
      oldItemsMap.set(it.productId, (oldItemsMap.get(it.productId) || 0) + it.quantity);
    });

    const newItemsMap = new Map<string, number>();
    updates.items.forEach(it => {
      newItemsMap.set(it.productId, (newItemsMap.get(it.productId) || 0) + it.quantity);
    });

    const allProductIds = new Set([...Array.from(oldItemsMap.keys()), ...Array.from(newItemsMap.keys())]);
    allProductIds.forEach(prodId => {
      const oldQty = oldItemsMap.get(prodId) || 0;
      const newQty = newItemsMap.get(prodId) || 0;
      const diff = oldQty - newQty; // If diff > 0, items returned -> restore to stock
      
      const prodIdx = db.products.findIndex(p => p.id === prodId);
      if (prodIdx > -1) {
        db.products[prodIdx].stock = Math.max(0, (db.products[prodIdx].stock || 0) + diff);
      }
    });
  }

  let subtotal = updates.subtotal ?? oldOrder.subtotal;
  let deliveryFee = updates.deliveryFee ?? oldOrder.deliveryFee;
  let discount = updates.discount ?? oldOrder.discount;
  let total = updates.total ?? oldOrder.total;

  if (updates.items) {
    subtotal = updates.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    total = Math.max(0, subtotal + (deliveryFee || 0) - (discount || 0));
  }

  db.orders[index] = {
    ...oldOrder,
    ...updates,
    subtotal,
    deliveryFee,
    discount,
    total,
    updatedAt: new Date().toISOString(),
  };

  saveDb(db);
  return db.orders[index];
}

export function deleteOrder(id: string, restoreInventory: boolean = true): boolean {
  const db = ensureDbExists();
  const index = db.orders.findIndex(o => o.id === id || o.orderNumber === id);
  if (index === -1) return false;

  const order = db.orders[index];
  if (restoreInventory && order.items && order.status !== 'cancelled') {
    order.items.forEach(it => {
      const prodIdx = db.products.findIndex(p => p.id === it.productId);
      if (prodIdx > -1) {
        db.products[prodIdx].stock = (db.products[prodIdx].stock || 0) + it.quantity;
      }
    });
  }

  db.orders.splice(index, 1);
  saveDb(db);
  return true;
}

// Settings
export function getSettings(): StoreSettings {
  const db = ensureDbExists();
  const settings = db.settings || initialSettings;

  if (settings && settings.competitions) {
    try {
      if (!settings.competitions.customerTrack) {
        settings.competitions.customerTrack = {
          id: 'customer',
          title: 'سباق الزبائن والعملاء الأكثر طلباً 🎁',
          subtitle: 'اطلب واجمع مشترياتك المنزلية لتفوز بقسائم تسوق شهرية مجانية وهدايا قيمة!',
          prizeSummary: '🥇 المركز الأول: قسيمة تسوق مجانية بقيمة 150,000 د.ع + شحن مجاني لمدة شهر',
          endDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
          isActive: true,
          leaders: [],
        };
      }
      const realLeaders = getLeaderboardFromOrders();
      if (settings.competitions.customerTrack) {
        settings.competitions.customerTrack.leaders = realLeaders.customerLeaders || [];
      }
      if (settings.competitions.retailTrack) {
        settings.competitions.retailTrack.leaders = realLeaders.retailLeaders || [];
      }
      if (settings.competitions.wholesaleTrack) {
        settings.competitions.wholesaleTrack.leaders = realLeaders.wholesaleLeaders || [];
      }
    } catch {
      // fallback
    }
  }

  // Ensure popupAds list exists and is synchronized
  if (settings) {
    if (!Array.isArray(settings.popupAds) || settings.popupAds.length === 0) {
      if (settings.popupAd) {
        settings.popupAds = [{
          ...settings.popupAd,
          id: settings.popupAd.id || 'popup-1',
          order: 1,
        }];
      } else {
        settings.popupAds = [];
      }
    }
  }

  return settings;
}

export function updateSettings(newSettings: Partial<StoreSettings>): StoreSettings {
  const db = ensureDbExists();
  db.settings = { ...db.settings, ...newSettings };
  saveDb(db);
  return db.settings;
}

// Admin & Staff Authentication Engine
export interface AdminAuthResult {
  success: boolean;
  error?: string;
  admin?: {
    id: string;
    name: string;
    username: string;
    role: 'admin' | 'staff';
    jobTitle: string;
    permissions: string[];
    isActive: boolean;
  };
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const db = ensureDbExists();
  const auth = db.adminAuth || { username: "admin", password: "admin123" };
  return auth.username.trim() === username.trim() && auth.password.trim() === password.trim();
}

export function authenticateAdminOrStaff(username: string, password: string): AdminAuthResult {
  const db = ensureDbExists();
  const cleanU = username.trim().toLowerCase();
  const cleanP = password.trim();

  // 1. Check Master Admin Credentials
  const masterAuth = db.adminAuth || { username: "admin", password: "admin123" };
  if (masterAuth.username.trim().toLowerCase() === cleanU && masterAuth.password.trim() === cleanP) {
    return {
      success: true,
      admin: {
        id: 'admin-master',
        name: 'المدير العام (Master Admin)',
        username: masterAuth.username,
        role: 'admin',
        jobTitle: 'مدير النظام الرئيسي 👑',
        permissions: ['*'], // Full access to everything
        isActive: true,
      },
    };
  }

  // 2. Check Staff Members
  const staff = (db.staff || []).find(
    (s) => (s.username || '').trim().toLowerCase() === cleanU || (s.phone || '').replace(/\D/g, '') === cleanU.replace(/\D/g, '')
  );

  if (staff) {
    if (!staff.isActive) {
      return { success: false, error: 'تم تجميد هذا الحساب من قبل الإدارة. يرجى مراجعة المسؤول.' };
    }
    if ((staff.password || '').trim() === cleanP) {
      staff.lastLoginAt = new Date().toISOString();
      saveDb(db);
      return {
        success: true,
        admin: {
          id: staff.id,
          name: staff.name,
          username: staff.username,
          role: 'staff',
          jobTitle: staff.jobTitle || 'موظف النظام',
          permissions: staff.permissions || [],
          isActive: true,
        },
      };
    }
  }

  return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
}

export function updateAdminCredentials(username: string, password: string): boolean {
  const db = ensureDbExists();
  db.adminAuth = { username: username.trim(), password: password.trim() };
  saveDb(db);
  return true;
}

// =========================================================================
// STAFF MEMBERS MANAGEMENT (إدارة الموظفين وفريق العمل وتحديد الصلاحيات)
// =========================================================================

export function getStaffMembers(): StaffMember[] {
  const db = ensureDbExists();
  return (db.staff || []).map((s) => ({
    ...s,
    password: s.password ? '••••••••' : undefined,
  }));
}

export function getStaffMemberById(id: string): StaffMember | undefined {
  const db = ensureDbExists();
  return (db.staff || []).find((s) => s.id === id);
}

export function createStaffMember(data: Omit<StaffMember, 'id' | 'createdAt'>): { success: boolean; error?: string; staff?: StaffMember } {
  const db = ensureDbExists();
  if (!db.staff) db.staff = [];

  const cleanUsername = data.username.trim().toLowerCase();

  // Check master admin collision
  if (cleanUsername === (db.adminAuth?.username || 'admin').toLowerCase()) {
    return { success: false, error: 'اسم المستخدم هذا محجوز لمدير النظام الرئيسي' };
  }

  // Check existing staff collision
  const exists = db.staff.some((s) => s.username.trim().toLowerCase() === cleanUsername);
  if (exists) {
    return { success: false, error: 'يوجد موظف مسجل مسبقاً بنفس اسم المستخدم' };
  }

  const newStaff: StaffMember = {
    ...data,
    id: `stf-${Date.now()}`,
    username: cleanUsername,
    name: data.name.trim(),
    phone: data.phone.trim(),
    jobTitle: data.jobTitle.trim(),
    role: data.role || 'custom',
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
    isActive: data.isActive !== false,
    createdAt: new Date().toISOString(),
  };

  db.staff.unshift(newStaff);
  saveDb(db);

  return { success: true, staff: newStaff };
}

export function updateStaffMember(id: string, updates: Partial<StaffMember>): { success: boolean; error?: string; staff?: StaffMember } {
  const db = ensureDbExists();
  if (!db.staff) db.staff = [];

  const index = db.staff.findIndex((s) => s.id === id);
  if (index === -1) return { success: false, error: 'لم يتم العثور على الموظف' };

  if (updates.username) {
    const cleanUsername = updates.username.trim().toLowerCase();
    if (cleanUsername === (db.adminAuth?.username || 'admin').toLowerCase()) {
      return { success: false, error: 'اسم المستخدم هذا محجوز لمدير النظام الرئيسي' };
    }
    const exists = db.staff.some((s) => s.id !== id && s.username.trim().toLowerCase() === cleanUsername);
    if (exists) {
      return { success: false, error: 'اسم المستخدم مستخدم بالفعل لموظف آخر' };
    }
    updates.username = cleanUsername;
  }

  // If password update is empty, keep existing password
  if (!updates.password || updates.password.includes('••••')) {
    delete updates.password;
  }

  db.staff[index] = {
    ...db.staff[index],
    ...updates,
  };

  saveDb(db);
  return { success: true, staff: db.staff[index] };
}

export function deleteStaffMember(id: string): boolean {
  const db = ensureDbExists();
  if (!db.staff) return false;
  const index = db.staff.findIndex((s) => s.id === id);
  if (index === -1) return false;
  db.staff.splice(index, 1);
  saveDb(db);
  return true;
}

// Users & Registered Customers Management with Live Activity & Order Statistics
export function getUsers(): User[] {
  const db = ensureDbExists();
  return db.users;
}

export function getCustomersWithStats(
  filterStatus?: MerchantStatus,
  filterAccountType?: AccountType | 'all' | 'retail'
): CustomerWithStats[] {
  const db = ensureDbExists();
  const users = db.users || [];
  const orders = db.orders || [];

  // Compute stats accurately per user by matching each non-cancelled order uniquely
  let list: CustomerWithStats[] = users.map((u) => {
    const cleanUserPhone = u.phone ? u.phone.replace(/\D/g, '') : '';
    
    let count = 0;
    let totalAmount = 0;
    let lastDate: string | undefined = undefined;

    orders.forEach((ord) => {
      if (!ord || ord.status === 'cancelled') return;
      const oPhone = ord.customer?.phone ? ord.customer.phone.replace(/\D/g, '') : '';
      const matchesUser = (ord.customer?.userId && ord.customer.userId === u.id) || (cleanUserPhone && oPhone === cleanUserPhone);
      
      if (matchesUser) {
        count += 1;
        totalAmount += (ord.total || 0);
        if (!lastDate || new Date(ord.createdAt) > new Date(lastDate)) {
          lastDate = ord.createdAt;
        }
      }
    });

    return {
      ...u,
      totalOrdersCount: count,
      totalOrdersAmount: totalAmount,
      lastOrderDate: lastDate,
      hasPurchased: count > 0,
    };
  });

  if (filterStatus && filterStatus !== ('all' as any)) {
    list = list.filter((u) => u.merchantStatus === filterStatus);
  }

  if (filterAccountType && filterAccountType !== 'all') {
    if (filterAccountType === 'retail' || filterAccountType === ('individual' as any)) {
      list = list.filter(
        (u) =>
          u.accountType === 'individual' ||
          (u as any).accountType === 'retail' ||
          (!u.accountType && u.role === 'customer')
      );
    } else if (filterAccountType === 'wholesale') {
      list = list.filter(
        (u) =>
          u.accountType === 'wholesale' ||
          u.accountType === 'merchant' ||
          (u.role === 'merchant' && u.accountType !== 'market')
      );
    } else if (filterAccountType === 'market') {
      list = list.filter((u) => u.accountType === 'market');
    } else {
      list = list.filter((u) => u.accountType === filterAccountType);
    }
  }

  return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

export function getMerchants(filterStatus?: MerchantStatus, filterAccountType?: AccountType): CustomerWithStats[] {
  return getCustomersWithStats(filterStatus, filterAccountType);
}

export function updateMerchantStatus(userId: string, status: MerchantStatus): User | null {
  const db = ensureDbExists();
  const index = db.users.findIndex(u => u.id === userId);
  if (index === -1) return null;

  db.users[index].merchantStatus = status;
  if (db.users[index].accountType !== 'market' && !db.users[index].merchantTier) {
    db.users[index].merchantTier = 'bronze';
  }
  saveDb(db);
  return db.users[index];
}

export function updateMerchantTier(userId: string, tier: MerchantTier): User | null {
  const db = ensureDbExists();
  const index = db.users.findIndex(u => u.id === userId);
  if (index === -1) return null;

  db.users[index].merchantTier = tier;
  if (db.users[index].accountType === 'market') {
    db.users[index].accountType = 'wholesale';
    db.users[index].role = 'merchant';
  }
  saveDb(db);
  return db.users[index];
}

export function updateUserAccountType(userId: string, accountType: AccountType, tier?: MerchantTier): User | null {
  const db = ensureDbExists();
  const index = db.users.findIndex(u => u.id === userId);
  if (index === -1) return null;

  db.users[index].accountType = accountType;
  if (accountType === 'wholesale' || accountType === 'merchant') {
    db.users[index].role = 'merchant';
    if (!db.users[index].merchantStatus) db.users[index].merchantStatus = 'pending';
    if (tier) db.users[index].merchantTier = tier;
    else if (!db.users[index].merchantTier) db.users[index].merchantTier = 'bronze';
  } else if (accountType === 'market') {
    db.users[index].role = 'customer';
    if (!db.users[index].merchantStatus) db.users[index].merchantStatus = 'pending';
    db.users[index].merchantTier = undefined;
  } else {
    db.users[index].role = 'customer';
    db.users[index].merchantStatus = undefined;
    db.users[index].merchantTier = undefined;
  }

  saveDb(db);
  return db.users[index];
}

export function findUserByEmailOrPhone(identifier: string): User | undefined {
  const db = ensureDbExists();
  const clean = identifier.trim().toLowerCase();
  const cleanPhone = identifier.replace(/\D/g, '');
  return db.users.find(
    u => (u.email && u.email.toLowerCase() === clean) || (u.phone && u.phone.replace(/\D/g, '') === cleanPhone)
  );
}

export function createUser(userData: {
  name: string;
  email?: string;
  phone: string;
  password?: string;
  role?: UserRole;
  accountType?: AccountType;
  merchantStatus?: MerchantStatus;
  merchantTier?: MerchantTier;
  businessName?: string;
  businessType?: string;
  city?: string;
  address?: string;
  storefrontImage?: string;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
  savedAddresses?: SavedAddress[];
}): User {
  const db = ensureDbExists();
  const accType = userData.accountType || 'individual';
  const isWholesale = accType === 'wholesale' || accType === 'merchant';
  const isMarket = accType === 'market';
  
  const newUser: User = {
    id: 'usr-' + Date.now(),
    name: userData.name.trim(),
    email: userData.email?.trim().toLowerCase() || undefined,
    phone: userData.phone.trim(),
    password: userData.password?.trim() || undefined,
    role: userData.role || (isWholesale ? 'merchant' : 'customer'),
    accountType: accType,
    merchantStatus: userData.merchantStatus !== undefined ? userData.merchantStatus : ((isWholesale || isMarket) ? 'pending' : undefined),
    merchantTier: userData.merchantTier !== undefined ? userData.merchantTier : (isWholesale ? 'bronze' : undefined),
    businessName: userData.businessName?.trim(),
    businessType: userData.businessType?.trim(),
    city: userData.city?.trim() || 'كربلاء المقدسة',
    address: userData.address?.trim() || '',
    storefrontImage: userData.storefrontImage,
    lat: userData.lat,
    lng: userData.lng,
    mapsUrl: userData.mapsUrl,
    savedAddresses: userData.savedAddresses || (userData.address ? [{
      id: 'addr-1',
      title: accType === 'market' ? 'موقع الماركت 🏪' : 'موقع التوصيل الأساسي 📍',
      city: userData.city?.trim() || 'كربلاء المقدسة',
      address: userData.address.trim(),
      lat: userData.lat,
      lng: userData.lng,
      mapsUrl: userData.mapsUrl,
      isDefault: true,
    }] : []),
    createdAt: new Date().toISOString(),
  };

  db.users.unshift(newUser);
  saveDb(db);
  return newUser;
}

export function updateUserProfile(userId: string, updates: Partial<User>): User | null {
  const db = ensureDbExists();
  const index = db.users.findIndex(u => u.id === userId);
  if (index === -1) return null;

  db.users[index] = {
    ...db.users[index],
    ...updates,
  };
  saveDb(db);
  return db.users[index];
}

// Coupons
export function validateCoupon(code: string, subtotal: number): { valid: boolean; coupon?: Coupon; discount: number; message: string } {
  const db = ensureDbExists();
  const c = db.coupons.find(cp => cp.code.toUpperCase() === code.trim().toUpperCase() && cp.isActive);
  
  if (!c) {
    return { valid: false, discount: 0, message: "كود الخصم غير صالح أو منتهي" };
  }

  if (c.minOrderAmount && subtotal < c.minOrderAmount) {
    return { valid: false, discount: 0, message: `الحد الأدنى لتطبيق هذا الكوبون هو ${c.minOrderAmount.toLocaleString()} د.ع` };
  }

  let discount = 0;
  if (c.discountType === 'percentage') {
    discount = Math.round((subtotal * c.discountValue) / 100);
  } else {
    discount = Math.min(subtotal, c.discountValue);
  }

  return { valid: true, coupon: c, discount, message: `تم تطبيق خصم ${discount.toLocaleString()} د.ع بنجاح!` };
}

// Banners
export function getBanners(onlyActive = true, position?: string): Banner[] {
  const db = ensureDbExists();
  let list = db.banners || initialBanners;
  if (onlyActive) {
    list = list.filter(b => b.isActive);
  }
  if (position && position !== 'all') {
    list = list.filter(b => {
      const bannerPos = b.position || 'top';
      return bannerPos === position || bannerPos === 'all';
    });
  }
  return list.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function createBanner(bannerData: Omit<Banner, 'id'>): Banner {
  const db = ensureDbExists();
  if (!db.banners) db.banners = [...initialBanners];
  const newBanner: Banner = {
    ...bannerData,
    position: bannerData.position || 'top',
    id: `banner-${Date.now()}`,
    isActive: bannerData.isActive ?? true,
    order: bannerData.order ?? (db.banners.length + 1),
  };
  db.banners.push(newBanner);
  saveDb(db);
  return newBanner;
}

export function updateBanner(id: string, updates: Partial<Banner>): Banner | null {
  const db = ensureDbExists();
  if (!db.banners) db.banners = [...initialBanners];
  const idx = db.banners.findIndex(b => b.id === id);
  if (idx === -1) return null;
  db.banners[idx] = { ...db.banners[idx], ...updates };
  saveDb(db);
  return db.banners[idx];
}

export function deleteBanner(id: string): boolean {
  const db = ensureDbExists();
  if (!db.banners) db.banners = [...initialBanners];
  const initialLength = db.banners.length;
  db.banners = db.banners.filter(b => b.id !== id);
  if (db.banners.length !== initialLength) {
    saveDb(db);
    return true;
  }
  return false;
}

export const initialCompanies: Company[] = [
  { id: "comp-1", name: "شركة ليز (Lay's)", category: "سناك وشيبس ومقرمشات", logo: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=200", icon: "🥔" },
  { id: "comp-2", name: "شركة البطل", category: "سناك وشيبس ومقرمشات", logo: "", icon: "🍿" },
  { id: "comp-3", name: "شركة سفن دايز (7Days)", category: "كرواسون وسويس رول وكيك", logo: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=200", icon: "🥐" },
  { id: "comp-4", name: "شركة أولكر (Ülker)", category: "كرواسون وسويس رول وكيك", logo: "", icon: "🍰" },
  { id: "comp-5", name: "شركة وايلد تايجر (Wild Tiger)", category: "مشروبات طاقة وعصائر", logo: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?q=80&w=200", icon: "⚡" },
  { id: "comp-6", name: "شركة راني (Rani)", category: "مشروبات طاقة وعصائر", logo: "", icon: "🧃" },
  { id: "comp-7", name: "شركة التونسا (Altunsa)", category: "معجون طماطم وصلصات", logo: "https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?q=80&w=200", icon: "🥫" },
  { id: "comp-8", name: "شركة زير (Zergül)", category: "معجون طماطم وصلصات", logo: "", icon: "🍅" },
  { id: "comp-9", name: "شركة تيفاني (Tiffany)", category: "بسكويت وحلويات وويفر", logo: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?q=80&w=200", icon: "🍪" },
  { id: "comp-10", name: "شركة كيندر (Kinder)", category: "بسكويت وحلويات وويفر", logo: "", icon: "🍫" },
];

// Companies Management (CRUD)
export function getCompanies(filterCategory?: string): Company[] {
  const db = ensureDbExists();
  if (!db.companies || db.companies.length === 0) {
    db.companies = [...initialCompanies];
    saveDb(db);
  }
  
  let list = db.companies.map(c => {
    const cats = (c.categories && c.categories.length > 0) ? c.categories : [c.category];
    const pCount = db.products.filter(p => p.company === c.name || (cats.includes(p.category) && p.name.includes(c.name))).length;
    return { ...c, categories: cats, productsCount: pCount };
  });

  if (filterCategory && filterCategory !== 'الكل') {
    list = list.filter(c => (c.categories && c.categories.includes(filterCategory)) || c.category === filterCategory);
  }
  return list;
}

export function createCompany(data: { name: string; category?: string; categories?: string[]; logo?: string; icon?: string }): Company {
  const db = ensureDbExists();
  if (!db.companies) db.companies = [...initialCompanies];
  
  const cats = data.categories && data.categories.length > 0 ? data.categories : (data.category ? [data.category.trim()] : []);
  const mainCat = cats[0] || data.category?.trim() || 'عام';

  const newComp: Company = {
    id: `comp-${Date.now()}`,
    name: data.name.trim(),
    category: mainCat,
    categories: cats,
    logo: data.logo?.trim() || '',
    icon: data.icon?.trim() || '🏢',
    productsCount: 0,
  };

  db.companies.push(newComp);
  saveDb(db);
  return newComp;
}

export function updateCompany(id: string, updates: Partial<Company>): Company | null {
  const db = ensureDbExists();
  if (!db.companies) db.companies = [...initialCompanies];
  const idx = db.companies.findIndex(c => c.id === id);
  if (idx === -1) return null;

  const cats = updates.categories && updates.categories.length > 0
    ? updates.categories
    : (updates.category ? [updates.category] : db.companies[idx].categories || [db.companies[idx].category]);

  const mainCat = cats[0] || updates.category || db.companies[idx].category;

  db.companies[idx] = {
    ...db.companies[idx],
    ...updates,
    category: mainCat,
    categories: cats,
  };
  saveDb(db);
  return db.companies[idx];
}

export function deleteCompany(id: string): boolean {
  const db = ensureDbExists();
  if (!db.companies) db.companies = [...initialCompanies];
  const initLen = db.companies.length;
  db.companies = db.companies.filter(c => c.id !== id);
  if (db.companies.length !== initLen) {
    saveDb(db);
    return true;
  }
  return false;
}

// =========================================================================
// OFFERS & DISCOUNTS ENGINE (نظام إدارة العروض والتخفيضات الذكية مع الصلاحية التلقائية)
// =========================================================================

export function getOffers(onlyActive = false): ProductOffer[] {
  const db = ensureDbExists();
  let list = db.offers || [];
  
  if (onlyActive) {
    const now = new Date();
    list = list.filter(o => o.isActive && new Date(o.endDate) > now);
  }

  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getOfferById(id: string): ProductOffer | null {
  const db = ensureDbExists();
  const list = db.offers || [];
  return list.find(o => o.id === id) || null;
}

export function createOffer(data: Omit<ProductOffer, 'id' | 'createdAt'>): ProductOffer {
  const db = ensureDbExists();
  if (!db.offers) db.offers = [];

  // Deactivate any prior active offer for the same product
  db.offers = db.offers.map(o => {
    if (o.productId === data.productId) {
      return { ...o, isActive: false };
    }
    return o;
  });

  const origPrice = Number(data.originalPrice) || 0;
  const offPrice = Number(data.offerPrice) || 0;
  const discountPercent = origPrice > 0 && offPrice < origPrice
    ? Math.round(((origPrice - offPrice) / origPrice) * 100)
    : undefined;

  const newOffer: ProductOffer = {
    ...data,
    id: `offer-${Date.now()}`,
    originalPrice: origPrice,
    offerPrice: offPrice,
    discountPercent,
    isActive: data.isActive ?? true,
    createdAt: new Date().toISOString(),
  };

  db.offers.unshift(newOffer);
  saveDb(db);
  return newOffer;
}

export function updateOffer(id: string, updates: Partial<ProductOffer>): ProductOffer | null {
  const db = ensureDbExists();
  if (!db.offers) db.offers = [];
  const idx = db.offers.findIndex(o => o.id === id);
  if (idx === -1) return null;

  const current = db.offers[idx];
  const origPrice = updates.originalPrice !== undefined ? Number(updates.originalPrice) : current.originalPrice;
  const offPrice = updates.offerPrice !== undefined ? Number(updates.offerPrice) : current.offerPrice;
  const discountPercent = origPrice > 0 && offPrice < origPrice
    ? Math.round(((origPrice - offPrice) / origPrice) * 100)
    : undefined;

  db.offers[idx] = {
    ...current,
    ...updates,
    originalPrice: origPrice,
    offerPrice: offPrice,
    discountPercent: discountPercent ?? current.discountPercent,
  };

  saveDb(db);
  return db.offers[idx];
}

export function deleteOffer(id: string): boolean {
  const db = ensureDbExists();
  if (!db.offers) db.offers = [];
  const initLen = db.offers.length;
  db.offers = db.offers.filter(o => o.id !== id);
  if (db.offers.length !== initLen) {
    saveDb(db);
    return true;
  }
  return false;
}

// Automatically calculate competition leaders from real store orders & invoices
export function getLeaderboardFromOrders(): { customerLeaders: any[]; retailLeaders: any[]; wholesaleLeaders: any[] } {
  const db = ensureDbExists();
  const orders = (db.orders || []).filter(o => o.status !== 'cancelled');

  const customerMap = new Map<string, { name: string; city: string; ordersCount: number; totalSpend: number }>();
  const marketMap = new Map<string, { name: string; city: string; cartons: number; totalSpend: number }>();
  const wholesaleMap = new Map<string, { name: string; city: string; cartons: number; totalSpend: number }>();

  orders.forEach(order => {
    const phone = order.customer?.phone || '';
    const name = order.customer?.businessName || order.customer?.name || 'عميل المتجر';
    const city = order.customer?.city || 'كربلاء المقدسة';
    const key = phone || name;
    const accType = (order.customer as any)?.accountType || 'individual';

    const wholesaleCartons = (order.items || [])
      .filter(i => i.saleType === 'wholesale')
      .reduce((s, i) => s + Number(i.quantity || 0), 0);

    const retailPieces = (order.items || [])
      .filter(i => i.saleType === 'retail')
      .reduce((s, i) => s + Number(i.quantity || 0), 0);

    if (accType === 'wholesale' || accType === 'merchant' || (wholesaleCartons > 0 && !accType.includes('individual'))) {
      const prev = wholesaleMap.get(key) || { name, city, cartons: 0, totalSpend: 0 };
      wholesaleMap.set(key, {
        name,
        city,
        cartons: prev.cartons + wholesaleCartons + Math.floor(retailPieces / 24),
        totalSpend: prev.totalSpend + Number(order.total || 0),
      });
    } else if (accType === 'market' || Boolean(order.customer?.businessName && !accType.includes('individual'))) {
      const prev = marketMap.get(key) || { name, city, cartons: 0, totalSpend: 0 };
      marketMap.set(key, {
        name,
        city,
        cartons: prev.cartons + wholesaleCartons + Math.max(1, retailPieces),
        totalSpend: prev.totalSpend + Number(order.total || 0),
      });
    } else {
      // Individual Customer
      const prev = customerMap.get(key) || { name, city, ordersCount: 0, totalSpend: 0 };
      customerMap.set(key, {
        name,
        city,
        ordersCount: prev.ordersCount + 1,
        totalSpend: prev.totalSpend + Number(order.total || 0),
      });
    }
  });

  const customerLeaders = Array.from(customerMap.values())
    .sort((a, b) => b.ordersCount !== a.ordersCount ? b.ordersCount - a.ordersCount : b.totalSpend - a.totalSpend)
    .slice(0, 10)
    .map((c, idx) => ({
      id: `c-lead-${idx + 1}-${Date.now()}`,
      rank: idx + 1,
      name: c.name,
      city: c.city,
      score: `${c.ordersCount} طلبية (${c.totalSpend.toLocaleString()} د.ع)`,
      prize: idx === 0 ? 'قسيمة 150,000 د.ع 🥇' : idx === 1 ? 'قسيمة 100,000 د.ع 🥈' : idx === 2 ? 'قسيمة 50,000 د.ع 🥉' : 'شحن مجاني 📦',
      badge: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '⭐',
    }));

  const retailLeaders = Array.from(marketMap.values())
    .sort((a, b) => b.cartons - a.cartons)
    .slice(0, 10)
    .map((c, idx) => ({
      id: `r-lead-${idx + 1}-${Date.now()}`,
      rank: idx + 1,
      name: c.name,
      city: c.city,
      score: `${c.cartons.toLocaleString()} كرتون`,
      prize: idx === 0 ? 'قسيمة 500,000 د.ع 🥇' : idx === 1 ? 'قسيمة 300,000 د.ع 🥈' : idx === 2 ? 'قسيمة 150,000 د.ع 🥉' : 'شحن مجاني 📦',
      badge: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '⭐',
    }));

  const wholesaleLeaders = Array.from(wholesaleMap.values())
    .sort((a, b) => b.cartons - a.cartons)
    .slice(0, 10)
    .map((c, idx) => ({
      id: `w-lead-${idx + 1}-${Date.now()}`,
      rank: idx + 1,
      name: c.name,
      city: c.city,
      score: `${c.cartons.toLocaleString()} كرتون`,
      prize: idx === 0 ? 'بضاعة مجانية 1,500,000 د.ع 🥇' : idx === 1 ? 'بضاعة مجانية 1,000,000 د.ع 🥈' : idx === 2 ? 'بضاعة مجانية 500,000 د.ع 🥉' : 'تخفيض إضافي 3% ⭐',
      badge: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '⭐',
    }));

  return { customerLeaders, retailLeaders, wholesaleLeaders };
}

// =========================================================================
// PURCHASE INVOICES ENGINE (فواتير المشتريات والتوريد مع الشركات المجهزة)
// =========================================================================

export function getPurchaseInvoices(companyName?: string): PurchaseInvoice[] {
  const db = ensureDbExists();
  const list = db.purchaseInvoices || [];
  if (companyName && companyName !== 'الكل') {
    return list.filter(inv => inv.companyName === companyName);
  }
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getPurchaseInvoiceById(id: string): PurchaseInvoice | null {
  const db = ensureDbExists();
  const list = db.purchaseInvoices || [];
  return list.find(inv => inv.id === id) || null;
}

export function createPurchaseInvoice(data: {
  companyName: string;
  companyId?: string;
  date?: string;
  paymentMethod: 'cash' | 'credit';
  notes?: string;
  items: Array<{
    productId: string;
    productName: string;
    company: string;
    unit: string;
    quantity: number;
    costPrice: number;
    boxesPerCarton?: number;
    itemsPerBox?: number;
  }>;
}): PurchaseInvoice {
  const db = ensureDbExists();
  if (!db.purchaseInvoices) db.purchaseInvoices = [];

  const invoiceItems: PurchaseInvoiceItem[] = data.items.map(item => {
    const prod = db.products.find(p => p.id === item.productId || p.name === item.productName);
    const boxes = item.boxesPerCarton || prod?.boxesPerCarton || 6;
    const piecesPerBox = item.itemsPerBox || prod?.itemsPerBox || 24;
    const totalPiecesInCarton = boxes * piecesPerBox;
    const qty = Number(item.quantity) || 1;
    const cost = Number(item.costPrice) || 0;

    return {
      productId: item.productId,
      productName: item.productName,
      company: item.company || data.companyName,
      unit: item.unit || 'كرتون',
      quantity: qty,
      costPrice: cost,
      total: qty * cost,
      boxesPerCarton: boxes,
      itemsPerBox: piecesPerBox,
      totalBoxes: qty * boxes,
      totalPieces: qty * totalPiecesInCarton,
      pieceCostPrice: totalPiecesInCarton > 0 ? Math.round((cost / totalPiecesInCarton) * 10) / 10 : 0,
    };
  });

  const totalAmount = invoiceItems.reduce((sum, it) => sum + it.total, 0);
  const now = new Date();
  const invoiceNum = `PUR-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${(db.purchaseInvoices.length + 1).toString().padStart(3, '0')}`;

  const newInvoice: PurchaseInvoice = {
    id: `pur-${Date.now()}`,
    invoiceNumber: invoiceNum,
    companyId: data.companyId || '',
    companyName: data.companyName,
    date: data.date || now.toISOString().split('T')[0],
    items: invoiceItems,
    totalAmount,
    paymentMethod: data.paymentMethod || 'cash',
    notes: data.notes || '',
    createdAt: now.toISOString(),
  };

  // AUTOMATICALLY INCREMENT PRODUCT STOCK & UPDATE COST PRICE & PACKAGING
  for (const item of invoiceItems) {
    const prodIdx = db.products.findIndex(p => p.id === item.productId || p.name === item.productName);
    if (prodIdx > -1) {
      db.products[prodIdx].stock = (db.products[prodIdx].stock || 0) + item.quantity;
      if (item.costPrice > 0) {
        db.products[prodIdx].costPrice = item.costPrice;
      }
      if (item.boxesPerCarton) {
        db.products[prodIdx].boxesPerCarton = item.boxesPerCarton;
      }
      if (item.itemsPerBox) {
        db.products[prodIdx].itemsPerBox = item.itemsPerBox;
        db.products[prodIdx].itemsPerWholesaleUnit = (item.boxesPerCarton || db.products[prodIdx].boxesPerCarton || 1) * item.itemsPerBox;
      }
    }
  }

  db.purchaseInvoices.unshift(newInvoice);
  saveDb(db);
  return newInvoice;
}

export function deletePurchaseInvoice(id: string): boolean {
  const db = ensureDbExists();
  if (!db.purchaseInvoices) db.purchaseInvoices = [];
  const initLen = db.purchaseInvoices.length;
  db.purchaseInvoices = db.purchaseInvoices.filter(inv => inv.id !== id);
  if (db.purchaseInvoices.length !== initLen) {
    saveDb(db);
    return true;
  }
  return false;
}

// Low Stock Alert Engine (أصناف قاربت على النفاذ)
export function getLowStockProducts(): Product[] {
  const db = ensureDbExists();
  return db.products.filter(p => p.stock <= (p.minStockAlert ?? 15));
}

/* =========================================================================
   ACCOUNTING & STATEMENT ENGINE (المحرك المحاسبي وكشوفات الحسابات وسندات القبض)
   ========================================================================= */

// Payment Receipts / Vouchers (سندات القبض والدفعات)
export function getPayments(customerPhone?: string): PaymentRecord[] {
  const db = ensureDbExists();
  const list = db.payments || [];
  if (customerPhone) {
    const cleanPhone = customerPhone.replace(/\D/g, '');
    return list.filter(p => p.customerPhone.replace(/\D/g, '') === cleanPhone);
  }
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addPayment(paymentData: {
  customerPhone: string;
  customerName: string;
  amount: number;
  paymentMethod: 'cash' | 'zaincash' | 'qicard' | 'bank_transfer' | 'other';
  notes?: string;
  receivedBy?: string;
  operatorName?: string;
  operatorUsername?: string;
}): PaymentRecord {
  const db = ensureDbExists();
  if (!db.payments) db.payments = [];
  
  const now = new Date();
  const maxPaySeq = (db.payments || []).reduce((max, p) => {
    const num = parseInt(p.receiptNumber?.replace(/\D/g, '') || '0', 10);
    return num > max ? num : max;
  }, 1000);
  const nextPaySeq = maxPaySeq + 1;
  const receiptNumber = `REC-${nextPaySeq}`;

  const newPayment: PaymentRecord = {
    id: `pay-${Date.now()}`,
    receiptNumber,
    customerPhone: paymentData.customerPhone.trim(),
    customerName: paymentData.customerName.trim(),
    amount: Number(paymentData.amount) || 0,
    paymentMethod: paymentData.paymentMethod || 'cash',
    notes: paymentData.notes?.trim() || '',
    receivedBy: paymentData.receivedBy || paymentData.operatorName || 'الإدارة',
    createdAt: now.toISOString(),
  };

  db.payments.unshift(newPayment);
  saveDb(db);

  // Automatically log to Audit Trail
  logAuditEvent({
    actionType: 'payment_created',
    actionLabel: 'إصدار سند قبض نقدي 🧾',
    category: 'accounting',
    categoryLabel: 'المحاسبة وسندات القبض',
    operator: {
      name: paymentData.operatorName || paymentData.receivedBy || 'المحاسب',
      username: paymentData.operatorUsername || 'accountant',
      role: 'staff',
    },
    target: {
      type: 'payment',
      id: newPayment.id,
      referenceNumber: receiptNumber,
      name: newPayment.customerName,
    },
    financialImpact: {
      amount: newPayment.amount,
      fundType: newPayment.paymentMethod === 'cash' ? 'cash_181' : 'bank_182',
    },
    details: `قام المحاسب بإصدار سند قبض نقدي جديد برقم (${receiptNumber}) بمبلغ ${newPayment.amount.toLocaleString()} د.ع لحساب العميل: ${newPayment.customerName} (${newPayment.customerPhone})`,
    severity: 'info',
  });

  return newPayment;
}

export function updatePayment(
  id: string,
  updates: Partial<PaymentRecord>,
  operator?: { name: string; username: string }
): PaymentRecord | null {
  const db = ensureDbExists();
  if (!db.payments) return null;
  const idx = db.payments.findIndex(p => p.id === id);
  if (idx === -1) return null;

  const oldRec = { ...db.payments[idx] };
  db.payments[idx] = {
    ...db.payments[idx],
    ...updates,
    amount: updates.amount !== undefined ? Number(updates.amount) : db.payments[idx].amount,
  };
  saveDb(db);

  // Automatically log to Audit Trail
  logAuditEvent({
    actionType: 'payment_updated',
    actionLabel: 'تعديل سند قبض ⚠️',
    category: 'accounting',
    categoryLabel: 'المحاسبة وسندات القبض',
    operator: {
      name: operator?.name || 'المحاسب',
      username: operator?.username || 'accountant',
      role: 'staff',
    },
    target: {
      type: 'payment',
      id,
      referenceNumber: oldRec.receiptNumber,
      name: oldRec.customerName,
    },
    financialImpact: {
      amount: db.payments[idx].amount,
      previousBalance: oldRec.amount,
      newBalance: db.payments[idx].amount,
      fundType: 'cash_181',
    },
    details: `تم تعديل بيانات سند القبض (${oldRec.receiptNumber}) للعميل (${oldRec.customerName}) من مبلغ ${oldRec.amount.toLocaleString()} د.ع إلى ${db.payments[idx].amount.toLocaleString()} د.ع`,
    severity: 'warning',
  });

  return db.payments[idx];
}

export function deletePayment(id: string, operator?: { name: string; username: string }): boolean {
  const db = ensureDbExists();
  if (!db.payments) return false;
  const idx = db.payments.findIndex(p => p.id === id);
  if (idx === -1) return false;

  const deletedRec = db.payments[idx];
  db.payments.splice(idx, 1);
  saveDb(db);

  // Automatically log to Audit Trail
  logAuditEvent({
    actionType: 'payment_deleted',
    actionLabel: 'حذف سند قبض 🚨',
    category: 'accounting',
    categoryLabel: 'المحاسبة وسندات القبض',
    operator: {
      name: operator?.name || 'المدير العام',
      username: operator?.username || 'admin',
      role: 'admin',
    },
    target: {
      type: 'payment',
      id,
      referenceNumber: deletedRec.receiptNumber,
      name: deletedRec.customerName,
    },
    financialImpact: {
      amount: deletedRec.amount,
      fundType: 'cash_181',
    },
    details: `تم حذف سند القبض (${deletedRec.receiptNumber}) نهائياً بمبلغ ${deletedRec.amount.toLocaleString()} د.ع الخاص بالعميل (${deletedRec.customerName})`,
    severity: 'danger',
  });

  return true;
}

// =========================================================================
// AUDIT TRAIL & TAMPER-PROOF SECURITY LOGGING (سجل الرقابة وتدقيق حركات الموظفين)
// =========================================================================

export function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
  const db = ensureDbExists();
  if (!db.auditLogs) db.auditLogs = [];

  const newLog: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
    severity: entry.severity || 'info',
  };

  db.auditLogs.unshift(newLog);

  // Keep up to 5000 records
  if (db.auditLogs.length > 5000) {
    db.auditLogs = db.auditLogs.slice(0, 5000);
  }

  saveDb(db);
  return newLog;
}

export function getAuditLogs(filters?: {
  category?: string;
  actionType?: string;
  operator?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): { logs: AuditLogEntry[]; total: number } {
  const db = ensureDbExists();
  let list = db.auditLogs || [];

  if (filters) {
    if (filters.category && filters.category !== 'all') {
      list = list.filter((l) => l.category === filters.category);
    }
    if (filters.actionType && filters.actionType !== 'all') {
      list = list.filter((l) => l.actionType === filters.actionType);
    }
    if (filters.operator && filters.operator !== 'all') {
      const q = filters.operator.toLowerCase();
      list = list.filter(
        (l) =>
          l.operator.username.toLowerCase().includes(q) ||
          l.operator.name.toLowerCase().includes(q) ||
          l.operator.id === filters.operator
      );
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(
        (l) =>
          l.details.toLowerCase().includes(q) ||
          l.actionLabel.toLowerCase().includes(q) ||
          l.operator.name.toLowerCase().includes(q) ||
          (l.target?.referenceNumber && l.target.referenceNumber.toLowerCase().includes(q)) ||
          (l.target?.name && l.target.name.toLowerCase().includes(q))
      );
    }
    if (filters.dateFrom) {
      const fromTime = new Date(filters.dateFrom).getTime();
      list = list.filter((l) => new Date(l.timestamp).getTime() >= fromTime);
    }
    if (filters.dateTo) {
      const toTime = new Date(filters.dateTo).getTime();
      list = list.filter((l) => new Date(l.timestamp).getTime() <= toTime + 86400000);
    }
  }

  const total = list.length;
  const limit = filters?.limit || 100;
  return { logs: list.slice(0, limit), total };
}

// =========================================================================
// CASH VAULT 181 ENGINE (صندوق النقدية الرئيسي - حساب 181)
// =========================================================================

export function getCashVaultMovements(filter?: { dateFrom?: string; dateTo?: string }): CashVaultMovement[] {
  const db = ensureDbExists();
  const rawMovements: {
    date: string;
    type: 'inflow' | 'outflow';
    category: CashMovementCategory;
    categoryLabel: string;
    amount: number;
    referenceNumber: string;
    partyName: string;
    performedBy: { name: string; username: string };
    notes: string;
  }[] = [];

  // 1. Direct Cash Sales from Delivered/Completed Orders that have not generated a payment receipt voucher yet
  (db.orders || []).forEach((o) => {
    if (o.status !== 'delivered') return; // Only delivered orders count as real collected cash
    if (o.driverCashSettled && o.paymentReceiptNumber) return; // If already settled into db.payments, it will be ingested by step 2 to avoid double-counting

    const isDirectCash = o.paymentMethod === 'cash' || o.collectionStatus === 'collected_cash' || o.collectionStatus === 'partial';
    const collectedAmt = Number(o.collectedAmount !== undefined ? o.collectedAmount : (isDirectCash ? o.total : 0));
    
    if (collectedAmt > 0) {
      rawMovements.push({
        date: o.deliveredAt || o.updatedAt || o.createdAt,
        type: 'inflow',
        category: 'sales_cash',
        categoryLabel: 'مقبوضات مبيعات نقدية (مسلمة)',
        amount: collectedAmt,
        referenceNumber: `INV-${o.orderNumber}`,
        partyName: o.customer.businessName || o.customer.name,
        performedBy: {
          name: o.driverName ? `السائق (${o.driverName})` : 'المبيعات',
          username: 'sales',
        },
        notes: `مبيعات نقدية مستلمة لطلبية #${o.orderNumber}`,
      });
    }
  });

  // 2. Cash Receipts (سندات القبض النقدية)
  (db.payments || []).forEach((p) => {
    if (p.paymentMethod === 'cash') {
      rawMovements.push({
        date: p.createdAt,
        type: 'inflow',
        category: 'debt_collection',
        categoryLabel: 'سند قبض نقدي (تسديد زبون)',
        amount: Number(p.amount) || 0,
        referenceNumber: p.receiptNumber,
        partyName: p.customerName,
        performedBy: {
          name: p.receivedBy || 'المحاسب',
          username: 'accountant',
        },
        notes: p.notes || `تسديد دفعة نقدية لحساب الزبون ${p.customerName}`,
      });
    }
  });

  // 3. Manual Cash Movements in Vault (إيداعات ومسحوبات ومصاريف)
  (db.cashVaultMovements || []).forEach((m) => {
    rawMovements.push({
      date: m.date || m.createdAt,
      type: m.type,
      category: m.category,
      categoryLabel: m.categoryLabel,
      amount: Number(m.amount) || 0,
      referenceNumber: m.transactionNumber,
      partyName: m.partyName || 'صندوق المتجر (181)',
      performedBy: m.performedBy,
      notes: m.notes || '',
    });
  });

  // 4. Cash Purchases Outflow (فواتير مشتريات نقدية)
  (db.purchaseInvoices || []).forEach((p) => {
    if (p.paymentMethod === 'cash') {
      rawMovements.push({
        date: p.date || p.createdAt,
        type: 'outflow',
        category: 'purchase_payment',
        categoryLabel: 'سداد فاتورة مشتريات وتوريد',
        amount: Number(p.totalAmount) || 0,
        referenceNumber: p.invoiceNumber,
        partyName: p.companyName,
        performedBy: { name: 'مسؤول المشتريات', username: 'purchasing' },
        notes: `شراء بضاعة نقدية من شركة ${p.companyName}`,
      });
    }
  });

  // Sort chronological ascending to calculate running balance
  rawMovements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = 0;
  const result: CashVaultMovement[] = rawMovements.map((m, idx) => {
    if (m.type === 'inflow') {
      runningBalance += m.amount;
    } else {
      runningBalance -= m.amount;
    }

    return {
      id: `csh-tx-${idx + 1}`,
      transactionNumber: m.referenceNumber || `CSH-${1000 + idx + 1}`,
      date: m.date,
      type: m.type,
      category: m.category,
      categoryLabel: m.categoryLabel,
      amount: m.amount,
      balanceAfter: runningBalance,
      referenceNumber: m.referenceNumber,
      partyName: m.partyName,
      performedBy: m.performedBy,
      notes: m.notes,
      createdAt: m.date,
    };
  });

  // Return descending (newest first)
  return result.reverse();
}

export function getCashVaultSummary(): CashVaultSummary {
  const movements = getCashVaultMovements();
  const currentBalance = movements.length > 0 ? movements[0].balanceAfter : 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  let todayInflow = 0;
  let todayOutflow = 0;
  let totalInflowAllTime = 0;
  let totalOutflowAllTime = 0;

  movements.forEach((m) => {
    const isToday = m.date && m.date.startsWith(todayStr);
    if (m.type === 'inflow') {
      totalInflowAllTime += m.amount;
      if (isToday) todayInflow += m.amount;
    } else {
      totalOutflowAllTime += m.amount;
      if (isToday) todayOutflow += m.amount;
    }
  });

  return {
    accountCode: '181',
    accountName: 'نقدية لدى الصندوق (الصندوق 181)',
    currentBalance,
    todayInflow,
    todayOutflow,
    totalInflowAllTime,
    totalOutflowAllTime,
    movementsCount: movements.length,
  };
}

export function addCashVaultMovement(data: {
  type: 'inflow' | 'outflow';
  category: CashMovementCategory;
  categoryLabel: string;
  amount: number;
  partyName?: string;
  notes?: string;
  performedBy: { name: string; username: string; role?: string };
}): CashVaultMovement {
  const db = ensureDbExists();
  if (!db.cashVaultMovements) db.cashVaultMovements = [];

  const nextSeq = 1000 + (db.cashVaultMovements?.length || 0) + 1;
  const transactionNumber = `CSH-${nextSeq}`;
  const now = new Date().toISOString();

  const newMovement: CashVaultMovement = {
    id: `csh-${Date.now()}`,
    transactionNumber,
    date: now,
    type: data.type,
    category: data.category,
    categoryLabel: data.categoryLabel,
    amount: Number(data.amount) || 0,
    balanceAfter: 0,
    partyName: data.partyName || 'صندوق المتجر (181)',
    performedBy: data.performedBy,
    notes: data.notes || '',
    createdAt: now,
  };

  db.cashVaultMovements.push(newMovement);
  saveDb(db);

  // Automatically log to Audit Trail
  logAuditEvent({
    actionType: data.type === 'inflow' ? 'cash_deposit' : data.category === 'expense' ? 'cash_expense' : 'cash_withdrawal',
    actionLabel: data.type === 'inflow' ? `إيداع نقدي في الصندوق (${data.categoryLabel})` : `صرف نقدي من الصندوق (${data.categoryLabel})`,
    category: 'cash_vault',
    categoryLabel: 'الصندوق المالي 181',
    operator: {
      name: data.performedBy.name,
      username: data.performedBy.username,
      role: data.performedBy.role || 'staff',
    },
    target: {
      type: 'cash',
      referenceNumber: transactionNumber,
      name: data.partyName,
    },
    financialImpact: {
      amount: data.amount,
      fundType: 'cash_181',
    },
    details: `قام ${data.performedBy.name} بتسجيل ${data.type === 'inflow' ? 'إيداع' : 'صرف'} نقدي في حساب الصندوق 181 بمبلغ ${Number(data.amount).toLocaleString()} د.ع - ${data.notes || data.categoryLabel}`,
    severity: data.type === 'outflow' ? 'warning' : 'info',
  });

  return newMovement;
}

// Helper to format/shorten reference numbers
function formatShortRef(ref: string, defaultPrefix: string): string {
  if (!ref) return ref;
  if (ref.startsWith('ETI-')) {
    const parts = ref.split('-');
    return `INV-${parts[parts.length - 1]}`;
  }
  if (ref.startsWith('PAY-') || ref.startsWith('pay-')) {
    const parts = ref.split('-');
    return `REC-${parts[parts.length - 1]}`;
  }
  if (ref.startsWith('REC-DRV-') || (ref.startsWith('REC-') && ref.length > 9)) {
    const parts = ref.split('-');
    return `REC-${parts[parts.length - 1]}`;
  }
  return ref;
}

// Get detailed Account Statement for ANY customer/guest by phone number
export function getCustomerStatement(identifier: string, startDate?: string, endDate?: string): AccountStatement | null {
  const db = ensureDbExists();
  const cleanPhone = identifier.replace(/\D/g, '');
  const cleanLower = identifier.trim().toLowerCase();

  // Find user if registered
  const user = db.users.find(
    u => (u.phone && u.phone.replace(/\D/g, '') === cleanPhone) || (u.email && u.email.toLowerCase() === cleanLower)
  );

  // Find all orders for this customer (by phone, email, or userId)
  const orders = db.orders.filter(o => {
    if (o.status === 'cancelled') return false; // ignore cancelled orders in statement
    const oPhone = o.customer.phone ? o.customer.phone.replace(/\D/g, '') : '';
    const oEmail = o.customer.email ? o.customer.email.toLowerCase() : '';
    return (
      (cleanPhone && oPhone === cleanPhone) ||
      (cleanLower && oEmail === cleanLower) ||
      (user && o.customer.userId === user.id)
    );
  });

  // Find all payment vouchers for this customer
  const payments = (db.payments || []).filter(p => {
    const pPhone = p.customerPhone ? p.customerPhone.replace(/\D/g, '') : '';
    return cleanPhone && pPhone === cleanPhone;
  });

  if (orders.length === 0 && payments.length === 0 && !user) {
    return null;
  }

  // Derive customer info
  const primaryOrder = orders[0];
  const customerName = user?.name || primaryOrder?.customer.name || payments[0]?.customerName || 'عميل المتجر';
  const customerPhone = user?.phone || primaryOrder?.customer.phone || payments[0]?.customerPhone || identifier;
  const businessName = user?.businessName || primaryOrder?.customer.businessName;
  const accountType = user?.accountType === 'merchant' ? 'تاجر / ماركت' : 'زبون عادي / زائر';
  const city = user?.city || primaryOrder?.customer.city || 'العراق';
  const address = user?.address || primaryOrder?.customer.address || '';

  // Construct Ledger Transactions (سجل الحركات)
  type RawTx = {
    date: string;
    type: 'invoice' | 'payment';
    referenceNumber: string;
    referenceId?: string;
    description: string;
    debit: number;
    credit: number;
    paymentMethod?: string;
    notes?: string;
  };

  const rawTxList: RawTx[] = [];

  // Invoices from orders
  orders.forEach(o => {
    rawTxList.push({
      date: o.createdAt,
      type: 'invoice',
      referenceNumber: formatShortRef(o.orderNumber, 'INV'),
      referenceId: o.id,
      description: 'فاتورة مبيعات',
      debit: o.total,
      credit: 0,
      paymentMethod: o.paymentMethod === 'cod' ? 'دفع عند الاستلام' : o.paymentMethod,
      notes: o.notes || '',
    });
  });

  // Payments / Receipts
  payments.forEach(p => {
    rawTxList.push({
      date: p.createdAt,
      type: 'payment',
      referenceNumber: formatShortRef(p.receiptNumber, 'REC'),
      referenceId: p.id,
      description: 'سند قبض',
      debit: 0,
      credit: p.amount,
      paymentMethod: p.paymentMethod,
      notes: p.notes || '',
    });
  });

  // Sort chronologically ascending from oldest to newest to calculate running balance
  rawTxList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let currentBalance = 0;
  let totalInvoiced = 0;
  let totalPaid = 0;

  const startMs = startDate ? new Date(startDate + 'T00:00:00.000Z').getTime() : 0;
  const endMs = endDate ? new Date(endDate + 'T23:59:59.999Z').getTime() : Infinity;

  const allTransactions: AccountTransaction[] = rawTxList.map((tx, idx) => {
    totalInvoiced += tx.debit;
    totalPaid += tx.credit;
    currentBalance += (tx.debit - tx.credit);

    return {
      id: `tx-${idx + 1}-${tx.referenceNumber}`,
      date: tx.date,
      type: tx.type,
      typeLabel: tx.type === 'invoice' ? 'فاتورة مبيعات 📦' : 'سند قبض / تسديد 💵',
      referenceNumber: tx.referenceNumber,
      referenceId: tx.referenceId,
      description: tx.description,
      debit: tx.debit,
      credit: tx.credit,
      balance: currentBalance,
      paymentMethod: tx.paymentMethod,
      notes: tx.notes,
    };
  });

  // Filter by date range if specified
  const filteredTransactions = allTransactions.filter(tx => {
    const txMs = new Date(tx.date).getTime();
    return txMs >= startMs && txMs <= endMs;
  });

  const periodInvoiced = filteredTransactions.reduce((sum, tx) => sum + tx.debit, 0);
  const periodPaid = filteredTransactions.reduce((sum, tx) => sum + tx.credit, 0);

  // If filtered by date, calculate opening balance from prior transactions
  const priorTxList = allTransactions.filter(tx => new Date(tx.date).getTime() < startMs);
  const priorBalance = priorTxList.length > 0 ? priorTxList[priorTxList.length - 1].balance : 0;

  const displayTransactions: AccountTransaction[] = [];
  if (startDate && priorBalance !== 0) {
    displayTransactions.push({
      id: 'tx-opening-balance',
      date: startDate,
      type: 'adjustment',
      typeLabel: 'رصيد سابق مدوّر ⚖️',
      referenceNumber: 'BAL-PREV',
      description: 'رصيد سابق مدوّر قبل الفترة المحددة',
      debit: priorBalance > 0 ? priorBalance : 0,
      credit: priorBalance < 0 ? Math.abs(priorBalance) : 0,
      balance: priorBalance,
    });
  }

  filteredTransactions.forEach(t => displayTransactions.push(t));

  return {
    customer: {
      name: customerName,
      phone: customerPhone,
      email: user?.email || primaryOrder?.customer.email,
      businessName,
      accountType,
      city,
      address,
    },
    summary: {
      totalInvoiced: startDate || endDate ? periodInvoiced : totalInvoiced,
      totalPaid: startDate || endDate ? periodPaid : totalPaid,
      remainingBalance: currentBalance,
      ordersCount: filteredTransactions.filter(t => t.type === 'invoice').length,
      paymentsCount: filteredTransactions.filter(t => t.type === 'payment').length,
    },
    transactions: displayTransactions,
  };
}

// Get all customer accounts summary for Admin accounting dashboard
export function getAllCustomerAccounts(): CustomerAccountSummary[] {
  const db = ensureDbExists();
  const phoneMap = new Map<string, {
    name: string;
    businessName?: string;
    accountType?: string;
    city?: string;
    ordersCount: number;
    totalInvoiced: number;
    totalPaid: number;
    lastDate: string;
  }>();

  // 1. Ingest registered users
  db.users.forEach(u => {
    if (!u.phone) return;
    const clean = u.phone.replace(/\D/g, '');
    const formattedType =
      u.accountType === 'wholesale'
        ? 'تاجر جملة 👑'
        : u.accountType === 'market'
        ? 'ماركت 🏪'
        : 'زبون عادي 👤';

    phoneMap.set(clean, {
      name: u.name,
      businessName: u.businessName && u.businessName !== u.name ? u.businessName : undefined,
      accountType: formattedType,
      city: u.city,
      ordersCount: 0,
      totalInvoiced: 0,
      totalPaid: 0,
      lastDate: u.createdAt,
    });
  });

  // 2. Ingest Orders
  db.orders.forEach(o => {
    if (o.status === 'cancelled') return;
    const clean = (o.customer.phone || '').replace(/\D/g, '');
    if (!clean) return;

    const userForOrder = db.users.find(u => u.phone && u.phone.replace(/\D/g, '') === clean);
    const ordType = userForOrder
      ? (userForOrder.accountType === 'wholesale' ? 'تاجر جملة 👑' : userForOrder.accountType === 'market' ? 'ماركت 🏪' : 'زبون عادي 👤')
      : (o.customer.businessName ? 'ماركت / متجر 🏪' : 'زبون مباشر 👤');

    const existing = phoneMap.get(clean);
    if (existing) {
      existing.ordersCount += 1;
      existing.totalInvoiced += o.total;
      if (new Date(o.createdAt).getTime() > new Date(existing.lastDate).getTime()) {
        existing.lastDate = o.createdAt;
      }
      if (!existing.name && o.customer.name) existing.name = o.customer.name;
      if (!existing.city && o.customer.city) existing.city = o.customer.city;
      if (!existing.businessName && o.customer.businessName && o.customer.businessName !== existing.name) {
        existing.businessName = o.customer.businessName;
      }
    } else {
      phoneMap.set(clean, {
        name: o.customer.name || 'عميل المتجر',
        businessName: o.customer.businessName && o.customer.businessName !== o.customer.name ? o.customer.businessName : undefined,
        accountType: ordType,
        city: o.customer.city,
        ordersCount: 1,
        totalInvoiced: o.total,
        totalPaid: 0,
        lastDate: o.createdAt,
      });
    }
  });

  // 3. Ingest Payments
  (db.payments || []).forEach(p => {
    const clean = (p.customerPhone || '').replace(/\D/g, '');
    if (!clean) return;

    const existing = phoneMap.get(clean);
    if (existing) {
      existing.totalPaid += p.amount;
      if (new Date(p.createdAt).getTime() > new Date(existing.lastDate).getTime()) {
        existing.lastDate = p.createdAt;
      }
    } else {
      phoneMap.set(clean, {
        name: p.customerName,
        accountType: 'زبون مباشر 👤',
        ordersCount: 0,
        totalInvoiced: 0,
        totalPaid: p.amount,
        lastDate: p.createdAt,
      });
    }
  });

  const list: CustomerAccountSummary[] = [];
  phoneMap.forEach((val, phone) => {
    list.push({
      phone,
      name: val.name,
      businessName: val.businessName,
      accountType: val.accountType,
      city: val.city,
      ordersCount: val.ordersCount,
      totalInvoiced: val.totalInvoiced,
      totalPaid: val.totalPaid,
      remainingBalance: val.totalInvoiced - val.totalPaid,
      lastActivityDate: val.lastDate,
    });
  });

  // Sort by highest remaining debt first
  return list.sort((a, b) => b.remainingBalance - a.remainingBalance);
}

/* =========================================================================
   PROFIT & SALES REPORT ENGINE (محرك تقارير الأرباح والمبيعات الحقيقية)
   ========================================================================= */

export function getProfitReport(startDate?: string, endDate?: string): ProfitReportSummary {
  const db = ensureDbExists();
  let orders = db.orders.filter(o => o.status !== 'cancelled');

  if (startDate) {
    const start = new Date(startDate.includes('T') ? startDate : startDate + 'T00:00:00.000Z').getTime();
    orders = orders.filter(o => new Date(o.createdAt).getTime() >= start);
  }
  if (endDate) {
    const end = new Date(endDate.includes('T') ? endDate : endDate + 'T23:59:59.999Z').getTime();
    orders = orders.filter(o => new Date(o.createdAt).getTime() <= end);
  }

  let totalRevenue = 0;
  let totalCost = 0;

  const productMap = new Map<string, {
    productId: string;
    productName: string;
    category: string;
    unitsSold: number;
    costPrice: number;
    totalRevenue: number;
    totalCost: number;
  }>();

  const ordersBreakdown: ProfitReportItem[] = orders.map(order => {
    let orderCost = 0;
    let orderItemsCount = 0;

    order.items.forEach(item => {
      const prod = db.products.find(p => p.id === item.productId);
      const itemsPerBox = Math.max(1, prod?.itemsPerWholesaleUnit || 24);
      
      const baseCartonCost = item.costPrice || prod?.costPrice || (prod?.wholesalePrice ? Math.round(prod.wholesalePrice * 0.8) : Math.round((prod?.price || item.price) * itemsPerBox * 0.7));
      const pieceCost = Math.round(baseCartonCost / itemsPerBox);

      // Check if item is single piece or wholesale carton based on saleType
      const isSinglePiece = item.saleType === 'retail' || (item.unitLabel && (item.unitLabel.includes('مفرد') || item.unitLabel.includes('قطعة') || item.unitLabel.includes('قوطية')));
      const unitCost = isSinglePiece ? pieceCost : baseCartonCost;

      const lineCost = unitCost * item.quantity;
      const lineRevenue = item.price * item.quantity;

      orderCost += lineCost;
      orderItemsCount += item.quantity;

      // Product breakdown aggregate
      const pKey = item.productId || item.name;
      const existing = productMap.get(pKey);
      if (existing) {
        existing.unitsSold += item.quantity;
        existing.totalRevenue += lineRevenue;
        existing.totalCost += lineCost;
      } else {
        productMap.set(pKey, {
          productId: item.productId,
          productName: item.name,
          category: prod?.category || 'عام',
          unitsSold: item.quantity,
          costPrice: unitCost,
          totalRevenue: lineRevenue,
          totalCost: lineCost,
        });
      }
    });

    const orderRevenue = order.total;
    const orderGrossProfit = orderRevenue - orderCost;
    const margin = orderRevenue > 0 ? Math.round((orderGrossProfit / orderRevenue) * 100) : 0;

    totalRevenue += orderRevenue;
    totalCost += orderCost;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      date: order.createdAt,
      totalRevenue: orderRevenue,
      totalCost: orderCost,
      grossProfit: orderGrossProfit,
      marginPercentage: margin,
      itemsCount: orderItemsCount,
    };
  });

  const productsBreakdown: ProductProfitItem[] = [];
  productMap.forEach((val) => {
    const grossProfit = val.totalRevenue - val.totalCost;
    const margin = val.totalRevenue > 0 ? Math.round((grossProfit / val.totalRevenue) * 100) : 0;
    productsBreakdown.push({
      productId: val.productId,
      productName: val.productName,
      category: val.category,
      unitsSold: val.unitsSold,
      costPrice: val.costPrice,
      sellingPriceAvg: val.unitsSold > 0 ? Math.round(val.totalRevenue / val.unitsSold) : 0,
      totalRevenue: val.totalRevenue,
      totalCost: val.totalCost,
      grossProfit,
      marginPercentage: margin,
    });
  });

  // Sort products by highest gross profit first
  productsBreakdown.sort((a, b) => b.grossProfit - a.grossProfit);

  const grossProfit = totalRevenue - totalCost;
  const marginPercentage = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;

  return {
    period: startDate && endDate ? `${startDate} إلى ${endDate}` : 'جميع الفترات',
    startDate,
    endDate,
    totalOrders: orders.length,
    totalRevenue,
    totalCost,
    grossProfit,
    marginPercentage,
    ordersBreakdown: ordersBreakdown.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    productsBreakdown,
  };
}

/* =========================================================================
   DRIVER & DELIVERY MANAGEMENT FUNCTIONS (نظام إدارة وحسابات السائقين)
   ========================================================================= */

export function getDrivers(): Driver[] {
  const db = ensureDbExists();
  return db.drivers || [];
}

export function getDriverById(id: string): Driver | undefined {
  const drivers = getDrivers();
  return drivers.find((d) => d.id === id);
}

export function getDriverByPhone(phone: string): Driver | undefined {
  const drivers = getDrivers();
  const cleanPhone = phone.replace(/\D/g, '');
  return drivers.find((d) => d.phone.replace(/\D/g, '') === cleanPhone);
}

export function saveDriver(driverData: Partial<Driver>): Driver {
  const db = ensureDbExists();
  if (!db.drivers) db.drivers = [];

  const randomPin = Math.floor(1000 + Math.random() * 9000).toString();

  const newDriver: Driver = {
    id: driverData.id || `drv-${Date.now()}`,
    name: driverData.name || 'سائق جديد',
    phone: driverData.phone || '',
    password: driverData.password || randomPin,
    vehicleInfo: driverData.vehicleInfo || '',
    isActive: driverData.isActive !== false,
    currentCashInHand: driverData.currentCashInHand || 0,
    notes: driverData.notes || '',
    createdAt: driverData.createdAt || new Date().toISOString(),
  };

  db.drivers.push(newDriver);
  saveDb(db);
  return newDriver;
}

export function updateDriver(id: string, updates: Partial<Driver>): Driver | null {
  const db = ensureDbExists();
  if (!db.drivers) return null;

  const idx = db.drivers.findIndex((d) => d.id === id);
  if (idx === -1) return null;

  db.drivers[idx] = {
    ...db.drivers[idx],
    ...updates,
  };

  saveDb(db);
  return db.drivers[idx];
}

export function deleteDriver(id: string): boolean {
  const db = ensureDbExists();
  if (!db.drivers) return false;

  const initialLength = db.drivers.length;
  db.drivers = db.drivers.filter((d) => d.id !== id);

  if (db.drivers.length !== initialLength) {
    saveDb(db);
    return true;
  }
  return false;
}

export function settleDriverCash(
  driverId: string,
  options?: { customAmount?: number; notes?: string }
): { driver: Driver | null; settledAmount: number; createdReceiptsCount: number } {
  const db = ensureDbExists();
  if (!db.drivers) return { driver: null, settledAmount: 0, createdReceiptsCount: 0 };

  const idx = db.drivers.findIndex((d) => d.id === driverId);
  if (idx === -1) return { driver: null, settledAmount: 0, createdReceiptsCount: 0 };

  const driver = db.drivers[idx];
  let settledAmount = options?.customAmount !== undefined ? Number(options.customAmount) : (driver.currentCashInHand || 0);

  const payments = db.payments || [];

  // Find all orders assigned to this driver with collected cash not yet settled
  const unsettledOrders = (db.orders || []).filter(
    (o) => o.driverId === driverId && (o.collectedAmount || 0) > 0 && !o.driverCashSettled
  );

  let createdReceiptsCount = 0;

  // Calculate highest existing receipt sequence monotonically
  const maxPaymentSeq = payments.reduce((max, p) => {
    const num = parseInt(p.receiptNumber?.replace(/\D/g, '') || '0', 10);
    return num > max ? num : max;
  }, 1000);

  unsettledOrders.forEach((order, oIdx) => {
    // Clean and short sequential receipt number: #REC-1005, #REC-1006
    const nextSeq = maxPaymentSeq + oIdx + 1;
    const receiptNumber = `REC-${nextSeq}`;
    
    let collected = order.collectedAmount || order.total;
    if (options?.customAmount !== undefined && unsettledOrders.length === 1) {
      collected = Number(options.customAmount);
      order.collectedAmount = collected;
      order.remainingDebtAmount = Math.max(0, order.total - collected);
      if (collected < order.total) {
        order.collectionStatus = collected > 0 ? 'partial' : 'debt_unpaid';
      }
    }

    // Create Official Accounting Payment Receipt Voucher (سند قبض رسمي يضاف لكشف حساب الزبون)
    const paymentRecord: PaymentRecord = {
      id: `pay-drv-${nextSeq}-${Date.now().toString().slice(-4)}`,
      receiptNumber,
      customerPhone: order.customer.phone,
      customerName: order.customer.name,
      amount: collected,
      paymentMethod: 'cash',
      receivedBy: `تصفية عهدة السائق: ${driver.name}`,
      notes: options?.notes 
        ? `${options.notes} (تسديد فاتورة #${order.orderNumber} عبر تصفية عهدة السائق ${driver.name})`
        : `سند قبض نقدي تلقائي - تسديد فاتورة رقم #${order.orderNumber} عبر تصفية عهدة السائق (${driver.name})`,
      createdAt: new Date().toISOString(),
    };

    payments.unshift(paymentRecord);

    // Mark order as settled in accounting
    order.driverCashSettled = true;
    order.driverCashSettledAt = new Date().toISOString();
    order.paymentReceiptNumber = receiptNumber;
    order.updatedAt = new Date().toISOString();

    createdReceiptsCount++;
  });

  db.payments = payments;

  // Zero out the driver's cash in hand
  db.drivers[idx].currentCashInHand = 0;

  saveDb(db);
  return { driver: db.drivers[idx], settledAmount, createdReceiptsCount };
}

// ==================== FLEET & VEHICLES MANAGEMENT FUNCTIONS ====================

export function getVehicles(): Vehicle[] {
  const db = ensureDbExists();
  return db.vehicles || [];
}

export function getVehicleById(id: string): Vehicle | null {
  const db = ensureDbExists();
  return (db.vehicles || []).find((v) => v.id === id) || null;
}

export function saveVehicle(vehicleData: Partial<Vehicle>): Vehicle {
  const db = ensureDbExists();
  if (!db.vehicles) db.vehicles = [];

  if (vehicleData.id) {
    const idx = db.vehicles.findIndex((v) => v.id === vehicleData.id);
    if (idx !== -1) {
      db.vehicles[idx] = {
        ...db.vehicles[idx],
        ...vehicleData,
      } as Vehicle;

      // Update orders referencing this vehicle
      const updatedVeh = db.vehicles[idx];
      if (db.orders) {
        db.orders.forEach((ord) => {
          if (ord.vehicleId === updatedVeh.id) {
            ord.vehicleName = updatedVeh.name;
            ord.vehiclePlate = updatedVeh.plateNumber;
          }
        });
      }

      saveDb(db);
      return db.vehicles[idx];
    }
  }

  const newVehicle: Vehicle = {
    id: vehicleData.id || `veh-${Date.now()}`,
    name: vehicleData.name || 'سيارة حمل',
    plateNumber: vehicleData.plateNumber || '',
    type: vehicleData.type || 'كيا حمل',
    modelYear: vehicleData.modelYear || '',
    isActive: vehicleData.isActive !== false,
    notes: vehicleData.notes || '',
    createdAt: new Date().toISOString(),
  };

  db.vehicles.push(newVehicle);
  saveDb(db);
  return newVehicle;
}

export function deleteVehicle(id: string): boolean {
  const db = ensureDbExists();
  if (!db.vehicles) return false;
  const initialLength = db.vehicles.length;
  db.vehicles = db.vehicles.filter((v) => v.id !== id);
  if (db.vehicles.length !== initialLength) {
    saveDb(db);
    return true;
  }
  return false;
}

export function assignDriverToOrder(orderId: string, driverId: string, vehicleId?: string): Order | null {
  const db = ensureDbExists();
  const orderIdx = db.orders.findIndex((o) => o.id === orderId);
  if (orderIdx === -1) return null;

  if (!driverId || driverId === 'none') {
    // Unassign driver
    db.orders[orderIdx].driverId = undefined;
    db.orders[orderIdx].driverName = undefined;
    db.orders[orderIdx].driverPhone = undefined;
    db.orders[orderIdx].driverAssignedAt = undefined;
    db.orders[orderIdx].vehicleId = undefined;
    db.orders[orderIdx].vehicleName = undefined;
    db.orders[orderIdx].vehiclePlate = undefined;
  } else {
    const driver = (db.drivers || []).find((d) => d.id === driverId);
    if (!driver) return null;

    db.orders[orderIdx].driverId = driver.id;
    db.orders[orderIdx].driverName = driver.name;
    db.orders[orderIdx].driverPhone = driver.phone;
    db.orders[orderIdx].driverAssignedAt = new Date().toISOString();

    if (vehicleId && vehicleId !== 'none') {
      const vehicle = (db.vehicles || []).find((v) => v.id === vehicleId);
      if (vehicle) {
        db.orders[orderIdx].vehicleId = vehicle.id;
        db.orders[orderIdx].vehicleName = vehicle.name;
        db.orders[orderIdx].vehiclePlate = vehicle.plateNumber;
      }
    } else if (vehicleId === 'none') {
      db.orders[orderIdx].vehicleId = undefined;
      db.orders[orderIdx].vehicleName = undefined;
      db.orders[orderIdx].vehiclePlate = undefined;
    }
    
    // Automatically transition to processing if still pending
    if (db.orders[orderIdx].status === 'pending') {
      db.orders[orderIdx].status = 'processing';
    }
  }

  db.orders[orderIdx].updatedAt = new Date().toISOString();
  saveDb(db);
  return db.orders[orderIdx];
}

export function startDriverDelivery(orderId: string, driverId: string): { success: boolean; order?: Order; error?: string } {
  const db = ensureDbExists();
  const orderIdx = db.orders.findIndex((o) => o.id === orderId);
  if (orderIdx === -1) return { success: false, error: 'الطلبية غير موجودة' };

  db.orders[orderIdx].status = 'shipped'; // خرج مع المندوب للتوصيل
  db.orders[orderIdx].outForDeliveryAt = new Date().toISOString();
  db.orders[orderIdx].updatedAt = new Date().toISOString();

  saveDb(db);
  return { success: true, order: db.orders[orderIdx] };
}

export function completeDriverDelivery(
  orderId: string,
  driverId: string,
  data: {
    collectionStatus: DeliveryCollectionStatus;
    collectedAmount?: number;
    notes?: string;
  }
): { success: boolean; order?: Order; error?: string } {
  const db = ensureDbExists();
  const orderIdx = db.orders.findIndex((o) => o.id === orderId);
  if (orderIdx === -1) return { success: false, error: 'الطلبية غير موجودة' };

  const order = db.orders[orderIdx];

  // If returned / cancelled
  if (data.collectionStatus === 'returned') {
    order.status = 'cancelled';
    order.collectionStatus = 'returned';
    order.driverNotes = data.notes || 'تم رفض الاستلام من الزبون / إرجاع الطلب';
    order.updatedAt = new Date().toISOString();
    saveDb(db);
    return { success: true, order };
  }

  // Completed delivery
  order.status = 'delivered';
  order.collectionStatus = data.collectionStatus;
  order.deliveredAt = new Date().toISOString();
  order.driverNotes = data.notes || '';
  order.updatedAt = new Date().toISOString();

  let cashCollected = 0;

  if (data.collectionStatus === 'collected_cash') {
    cashCollected = order.total;
    order.collectedAmount = order.total;
    order.remainingDebtAmount = 0;
    order.paidAmount = order.total;
  } else if (data.collectionStatus === 'debt_unpaid') {
    cashCollected = 0;
    order.collectedAmount = 0;
    order.remainingDebtAmount = order.total;
    order.paidAmount = 0;
  } else if (data.collectionStatus === 'partial') {
    cashCollected = Math.min(order.total, Math.max(0, data.collectedAmount || 0));
    order.collectedAmount = cashCollected;
    order.remainingDebtAmount = order.total - cashCollected;
    order.paidAmount = cashCollected;
  }

  // Update Driver Cash in hand
  if (cashCollected > 0 && db.drivers) {
    const driverIdx = db.drivers.findIndex((d) => d.id === driverId);
    if (driverIdx !== -1) {
      db.drivers[driverIdx].currentCashInHand = (db.drivers[driverIdx].currentCashInHand || 0) + cashCollected;
    }
  }

  saveDb(db);
  return { success: true, order };
}

// =========================================================================
// SYSTEM RESET & DATA CLEARING ENGINE (محرك تصفير الجداول وإعادة الضبط الشامل والجزئي)
// =========================================================================

export interface DatabaseStats {
  productsCount: number;
  categoriesCount: number;
  companiesCount: number;
  ordersCount: number;
  paymentsCount: number;
  purchasesCount: number;
  merchantsCount: number;
  driversCount: number;
  vehiclesCount: number;
  bannersCount: number;
  offersCount: number;
  couponsCount: number;
  staffCount?: number;
}

export function getDatabaseStats(): DatabaseStats {
  const db = ensureDbExists();
  return {
    productsCount: (db.products || []).length,
    categoriesCount: (db.categories || []).length,
    companiesCount: (db.companies || []).length,
    ordersCount: (db.orders || []).length,
    paymentsCount: (db.payments || []).length,
    purchasesCount: (db.purchaseInvoices || []).length,
    merchantsCount: (db.users || []).length,
    driversCount: (db.drivers || []).length,
    vehiclesCount: (db.vehicles || []).length,
    bannersCount: (db.banners || []).length,
    offersCount: (db.offers || []).length,
    couponsCount: (db.coupons || []).length,
    staffCount: (db.staff || []).length,
  };
}

export function resetDatabaseSection(target: string): { success: boolean; message: string; stats: DatabaseStats } {
  const db = ensureDbExists();

  switch (target) {
    case 'products':
      db.products = [];
      db.offers = []; // also clear offers referencing products
      break;

    case 'categories':
      db.categories = [];
      break;

    case 'companies':
      db.companies = [];
      break;

    case 'orders':
      db.orders = [];
      break;

    case 'accounting':
      db.payments = [];
      // Also clear debts from existing orders if kept
      if (db.orders) {
        db.orders.forEach(o => {
          o.paidAmount = o.total;
          o.remainingDebtAmount = 0;
          o.collectionStatus = 'collected_cash';
        });
      }
      break;

    case 'purchases':
      db.purchaseInvoices = [];
      break;

    case 'merchants':
      db.users = [];
      break;

    case 'staff':
      db.staff = [];
      break;

    case 'drivers':
      db.drivers = [];
      db.vehicles = [];
      if (db.orders) {
        db.orders.forEach(o => {
          o.driverId = undefined;
          o.driverName = undefined;
          o.driverPhone = undefined;
          o.vehicleId = undefined;
          o.vehicleName = undefined;
        });
      }
      break;

    case 'banners':
      db.banners = [];
      break;

    case 'offers':
      db.offers = [];
      break;

    case 'all':
      // Full Factory Reset (All tables wiped clean, preserving admin credentials & core settings)
      db.products = [];
      db.categories = [];
      db.companies = [];
      db.orders = [];
      db.payments = [];
      db.purchaseInvoices = [];
      db.users = [];
      db.drivers = [];
      db.vehicles = [];
      db.banners = [];
      db.offers = [];
      db.coupons = [];
      db.staff = [];
      break;

    default:
      return { success: false, message: 'نوع التصفير غير صالح', stats: getDatabaseStats() };
  }

  saveDb(db);
  return {
    success: true,
    message: 'تمت عملية التصفير بنجاح وتوثيق نسخة احتياطية فورية ✓',
    stats: getDatabaseStats(),
  };
}

// ==========================================
// 💬 CUSTOMER COMPLAINTS & FEEDBACK ENGINE
// ==========================================

export function getComplaints(filters?: { phone?: string; userId?: string; status?: string }): CustomerComplaint[] {
  const db = ensureDbExists();
  let list = db.complaints || [];

  if (filters?.phone) {
    const cleanP = filters.phone.replace(/\D/g, '');
    list = list.filter(c => c.customerPhone.replace(/\D/g, '') === cleanP);
  }

  if (filters?.userId) {
    list = list.filter(c => c.userId === filters.userId);
  }

  if (filters?.status && filters.status !== 'all') {
    list = list.filter(c => c.status === filters.status);
  }

  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addComplaint(data: {
  userId?: string;
  customerName: string;
  customerPhone: string;
  businessName?: string;
  city?: string;
  text: string;
}): CustomerComplaint {
  const db = ensureDbExists();
  if (!db.complaints) db.complaints = [];

  const newComp: CustomerComplaint = {
    id: 'comp_' + Date.now(),
    userId: data.userId,
    customerName: data.customerName.trim(),
    customerPhone: data.customerPhone.trim(),
    businessName: data.businessName?.trim(),
    city: data.city?.trim() || 'كربلاء المقدسة',
    text: data.text.trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  db.complaints.unshift(newComp);
  saveDb(db);
  return newComp;
}

export function updateComplaint(
  id: string,
  updates: {
    status?: 'pending' | 'in_progress' | 'resolved' | 'archived';
    adminReply?: string;
    operator?: { name: string; username: string; role: string };
  }
): CustomerComplaint | null {
  const db = ensureDbExists();
  if (!db.complaints) return null;

  const idx = db.complaints.findIndex(c => c.id === id);
  if (idx === -1) return null;

  const old = db.complaints[idx];
  const now = new Date().toISOString();

  db.complaints[idx] = {
    ...old,
    status: updates.status || old.status,
    adminReply: updates.adminReply !== undefined ? updates.adminReply : old.adminReply,
    repliedAt: updates.adminReply ? now : old.repliedAt,
    repliedBy: updates.operator?.name || old.repliedBy,
    updatedAt: now,
  };

  saveDb(db);
  return db.complaints[idx];
}

export function deleteComplaint(id: string): boolean {
  const db = ensureDbExists();
  if (!db.complaints) return false;

  const initLen = db.complaints.length;
  db.complaints = db.complaints.filter(c => c.id !== id);
  if (db.complaints.length !== initLen) {
    saveDb(db);
    return true;
  }
  return false;
}

// ==========================================
// ⭐ DRIVER RATINGS & PERFORMANCE ENGINE
// ==========================================

export function calculateRatingTierLabel(score: number): string {
  if (score >= 4.8) return 'ممتاز 🌟';
  if (score >= 4.0) return 'جيد جداً 🟢';
  if (score >= 3.0) return 'جيد 🟡';
  if (score >= 2.0) return 'عادي 🟠';
  return 'ضعيف 🔴';
}

export function addDriverRating(data: {
  driverId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  rating: number; // 1 to 5
  tag?: string;
  comment?: string;
}): DriverRating {
  const db = ensureDbExists();
  if (!db.driverRatings) db.driverRatings = [];

  const ratingLabelMap: Record<number, string> = {
    5: 'ممتاز 🌟',
    4: 'جيد جداً 🟢',
    3: 'جيد 🟡',
    2: 'عادي 🟠',
    1: 'سيء 🔴',
  };

  const driver = (db.drivers || []).find((d) => d.id === data.driverId);

  const newRating: DriverRating = {
    id: 'rate_' + Date.now(),
    driverId: data.driverId,
    driverName: driver?.name || 'مندوب التوصيل',
    orderId: data.orderId,
    orderNumber: data.orderNumber,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    rating: Math.max(1, Math.min(5, data.rating)),
    ratingLabel: ratingLabelMap[data.rating] || 'ممتاز 🌟',
    tag: data.tag,
    comment: data.comment?.trim(),
    createdAt: new Date().toISOString(),
  };

  db.driverRatings.unshift(newRating);

  // Recalculate Driver Average Rating
  if (db.drivers) {
    const driverIdx = db.drivers.findIndex((d) => d.id === data.driverId);
    if (driverIdx !== -1) {
      const driverRatings = db.driverRatings.filter((r) => r.driverId === data.driverId);
      const totalScore = driverRatings.reduce((sum, r) => sum + r.rating, 0);
      const avg = Number((totalScore / driverRatings.length).toFixed(1));
      
      db.drivers[driverIdx].averageRating = avg;
      db.drivers[driverIdx].ratingsCount = driverRatings.length;
      db.drivers[driverIdx].ratingTierLabel = calculateRatingTierLabel(avg);
    }
  }

  saveDb(db);
  return newRating;
}

export function getDriverRatings(driverId?: string): DriverRating[] {
  const db = ensureDbExists();
  const list = db.driverRatings || [];
  if (driverId && driverId !== 'all') {
    return list.filter((r) => r.driverId === driverId);
  }
  return list;
}

// ==========================================
// Web Push Notifications & Subscriptions Management
// ==========================================

export function savePushSubscription(sub: Omit<PushSubscriptionRecord, 'id' | 'createdAt'>): PushSubscriptionRecord {
  const db = ensureDbExists();
  if (!db.pushSubscriptions) db.pushSubscriptions = [];

  // Check if endpoint already exists and update or create
  const existingIndex = db.pushSubscriptions.findIndex(s => s.endpoint === sub.endpoint);
  const now = new Date().toISOString();

  if (existingIndex > -1) {
    db.pushSubscriptions[existingIndex] = {
      ...db.pushSubscriptions[existingIndex],
      ...sub,
      lastActiveAt: now,
    };
    saveDb(db);
    return db.pushSubscriptions[existingIndex];
  }

  const newRecord: PushSubscriptionRecord = {
    ...sub,
    id: `push-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: now,
    lastActiveAt: now,
  };

  db.pushSubscriptions.unshift(newRecord);
  saveDb(db);
  return newRecord;
}

export function getPushSubscriptions(targetAudience: 'all' | 'wholesale' | 'market' | 'retail' = 'all'): PushSubscriptionRecord[] {
  const db = ensureDbExists();
  const list = db.pushSubscriptions || [];

  if (targetAudience === 'all') return list;

  return list.filter((sub) => {
    if (!sub.accountType || sub.accountType === 'visitor') {
      return targetAudience === 'retail';
    }
    if (targetAudience === 'wholesale') {
      return sub.accountType === 'wholesale' || sub.accountType === 'merchant';
    }
    if (targetAudience === 'market') {
      return sub.accountType === 'market';
    }
    if (targetAudience === 'retail') {
      return sub.accountType === 'individual' || sub.accountType === ('retail' as any);
    }
    return true;
  });
}

export function deletePushSubscription(endpoint: string): boolean {
  const db = ensureDbExists();
  if (!db.pushSubscriptions) return false;

  const initLen = db.pushSubscriptions.length;
  db.pushSubscriptions = db.pushSubscriptions.filter(s => s.endpoint !== endpoint);
  if (db.pushSubscriptions.length !== initLen) {
    saveDb(db);
    return true;
  }
  return false;
}

export function getPushNotificationLogs(): PushNotificationLog[] {
  const db = ensureDbExists();
  return db.pushNotificationLogs || [];
}

export function recordPushNotificationLog(log: Omit<PushNotificationLog, 'id' | 'createdAt'>): PushNotificationLog {
  const db = ensureDbExists();
  if (!db.pushNotificationLogs) db.pushNotificationLogs = [];

  const now = new Date();
  let expiresAt: string | undefined = undefined;

  if (log.expiryHours && log.expiryHours > 0) {
    const expDate = new Date(now.getTime() + log.expiryHours * 60 * 60 * 1000);
    expiresAt = expDate.toISOString();
  }

  const newLog: PushNotificationLog = {
    ...log,
    id: `notif-${Date.now()}`,
    expiresAt: expiresAt || log.expiresAt,
    createdAt: now.toISOString(),
  };

  db.pushNotificationLogs.unshift(newLog);
  saveDb(db);
  return newLog;
}

export function deletePushNotificationLog(id: string): boolean {
  const db = ensureDbExists();
  if (!db.pushNotificationLogs) return false;

  const initialLen = db.pushNotificationLogs.length;
  db.pushNotificationLogs = db.pushNotificationLogs.filter((log) => log.id !== id);

  if (db.pushNotificationLogs.length !== initialLen) {
    saveDb(db);
    return true;
  }
  return false;
}

export function clearAllPushNotificationLogs(): boolean {
  const db = ensureDbExists();
  db.pushNotificationLogs = [];
  saveDb(db);
  return true;
}


