import {
  ProfitReportSummary,
  ProfitReportItem,
  ProductProfitItem,
  InventoryReportSummary,
  InventoryMovementItem,
  DailyReconciliationSummary,
} from '@/types';
import { pgGetOrders } from '@/lib/postgres-orders';
import { pgGetProducts } from '@/lib/postgres-catalog';
import { pgGetPayments, pgGetCashVaultMovements } from '@/lib/postgres-accounting';
import { pgGetPurchaseInvoices } from '@/lib/postgres-purchases';

/**
 * توقيت العراق الرسمي: Asia/Baghdad (UTC+3) ثابت على مدار العام بدون توقيت صيفي.
 */
function parseBaghdadDateRange(startDateStr?: string, endDateStr?: string): { startMs?: number; endMs?: number } {
  let startMs: number | undefined;
  let endMs: number | undefined;

  if (startDateStr) {
    const raw = startDateStr.trim();
    if (raw.includes('T')) {
      startMs = new Date(raw).getTime();
    } else {
      startMs = new Date(`${raw}T00:00:00.000+03:00`).getTime();
    }
  }

  if (endDateStr) {
    const raw = endDateStr.trim();
    if (raw.includes('T')) {
      endMs = new Date(raw).getTime();
    } else {
      endMs = new Date(`${raw}T23:59:59.999+03:00`).getTime();
    }
  }

  return { startMs, endMs };
}

export function getTodayBaghdadStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function pgGetProfitReport(startDate?: string, endDate?: string): Promise<ProfitReportSummary> {
  const [allOrders, allProducts] = await Promise.all([
    pgGetOrders(),
    pgGetProducts(),
  ]);

  let orders = allOrders.filter((o) => o && o.status !== 'cancelled');

  const { startMs, endMs } = parseBaghdadDateRange(startDate, endDate);
  if (startMs !== undefined) {
    orders = orders.filter((o) => new Date(o.createdAt).getTime() >= startMs);
  }
  if (endMs !== undefined) {
    orders = orders.filter((o) => new Date(o.createdAt).getTime() <= endMs);
  }

  let totalRevenue = 0;
  let totalCost = 0;
  let totalGrossProfit = 0;
  let totalUnknownCostItems = 0;

  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      category: string;
      unitsSold: number;
      costPrice: number;
      totalRevenue: number;
      totalCost: number;
      hasIncompleteCostData?: boolean;
      isCostUnknown?: boolean;
    }
  >();

  const ordersBreakdown: ProfitReportItem[] = orders.map((order) => {
    let orderCost = 0;
    let orderItemsCount = 0;
    let orderHasIncompleteCost = false;
    let orderUnknownCostItemsCount = 0;
    let orderGrossProfit = 0;

    (order.items || []).forEach((item) => {
      const prod = allProducts.find((p) => p.id === item.productId || p.name === item.name);
      const itemsPerBox = Math.max(1, prod?.itemsPerWholesaleUnit || 24);

      const isSinglePiece =
        item.saleType === 'retail' ||
        (item.unitLabel &&
          (item.unitLabel.includes('مفرد') ||
            item.unitLabel.includes('قطعة') ||
            item.unitLabel.includes('قوطية')));

      let pieceCost = 0;
      let cartonCost = 0;
      let isCostKnown = false;

      // 1. الأولوية المطلقة: التكلفة التاريخية المثبتة في لقطة الطلب (unit_cost_pieces_snap)
      if (typeof item.costPrice === 'number' && !isNaN(item.costPrice) && item.costPrice > 0) {
        pieceCost = item.costPrice;
        cartonCost = pieceCost * itemsPerBox;
        isCostKnown = true;
      } else if (typeof prod?.costPrice === 'number' && !isNaN(prod.costPrice) && prod.costPrice > 0) {
        // 2. البديل الثانوي: تكلفة الكرتون المسجلة في كتالوج المنتجات
        cartonCost = prod.costPrice;
        pieceCost = Math.round(cartonCost / itemsPerBox);
        isCostKnown = true;
      } else if (typeof prod?.boxCostPrice === 'number' && !isNaN(prod.boxCostPrice) && prod.boxCostPrice > 0) {
        cartonCost = prod.boxCostPrice;
        pieceCost = Math.round(cartonCost / itemsPerBox);
        isCostKnown = true;
      }

      const qty = item.quantity || 0;
      const lineRevenue = (item.price || 0) * qty;

      if (isCostKnown) {
        const unitCost = isSinglePiece ? pieceCost : cartonCost;
        const lineCost = unitCost * qty;
        const lineProfit = lineRevenue - lineCost;

        orderCost += lineCost;
        orderGrossProfit += lineProfit;
      } else {
        orderHasIncompleteCost = true;
        orderUnknownCostItemsCount += qty;
      }
      orderItemsCount += qty;

      const pKey = item.productId || item.name;
      const existing = productMap.get(pKey);
      if (existing) {
        existing.unitsSold += qty;
        existing.totalRevenue += lineRevenue;
        if (isCostKnown) {
          existing.totalCost += (isSinglePiece ? pieceCost : cartonCost) * qty;
        } else {
          existing.hasIncompleteCostData = true;
          existing.isCostUnknown = true;
        }
      } else {
        productMap.set(pKey, {
          productId: item.productId,
          productName: item.name,
          category: prod?.category || 'عام',
          unitsSold: qty,
          costPrice: isCostKnown ? (isSinglePiece ? pieceCost : cartonCost) : 0,
          totalRevenue: lineRevenue,
          totalCost: isCostKnown ? ((isSinglePiece ? pieceCost : cartonCost) * qty) : 0,
          hasIncompleteCostData: !isCostKnown,
          isCostUnknown: !isCostKnown,
        });
      }
    });

    const orderRevenue = order.total || 0;
    const finalOrderGrossProfit = orderHasIncompleteCost
      ? orderGrossProfit
      : (orderRevenue - orderCost);
    const margin = orderRevenue > 0 ? Math.round((finalOrderGrossProfit / orderRevenue) * 100) : 0;

    totalRevenue += orderRevenue;
    totalCost += orderCost;
    totalGrossProfit += finalOrderGrossProfit;
    if (orderHasIncompleteCost) {
      totalUnknownCostItems += orderUnknownCostItemsCount;
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || 'زبون',
      customerPhone: order.customer?.phone || '',
      date: order.createdAt,
      totalRevenue: orderRevenue,
      totalCost: orderCost,
      grossProfit: finalOrderGrossProfit,
      marginPercentage: margin,
      itemsCount: orderItemsCount,
      hasIncompleteCostData: orderHasIncompleteCost,
      unknownCostItemsCount: orderUnknownCostItemsCount,
    };
  });

  const productsBreakdown: ProductProfitItem[] = [];
  productMap.forEach((val) => {
    const grossProfit = val.isCostUnknown ? 0 : (val.totalRevenue - val.totalCost);
    const margin = val.totalRevenue > 0 && !val.isCostUnknown ? Math.round((grossProfit / val.totalRevenue) * 100) : 0;
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
      hasIncompleteCostData: val.hasIncompleteCostData,
      isCostUnknown: val.isCostUnknown,
    });
  });

  productsBreakdown.sort((a, b) => b.grossProfit - a.grossProfit);

  const grossProfit = totalGrossProfit;
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
    ordersBreakdown,
    productsBreakdown,
    hasIncompleteCostData: totalUnknownCostItems > 0,
    unknownCostItemsCount: totalUnknownCostItems,
  };
}

export async function pgGetInventoryReport(startDate?: string, endDate?: string): Promise<InventoryReportSummary> {
  const [allProducts, allOrders] = await Promise.all([
    pgGetProducts(),
    pgGetOrders(),
  ]);

  const now = new Date();
  let orders = allOrders.filter((o) => o && o.status !== 'cancelled');

  const { startMs, endMs } = parseBaghdadDateRange(startDate, endDate);
  if (startMs !== undefined) {
    orders = orders.filter((o) => new Date(o.createdAt).getTime() >= startMs);
  }
  if (endMs !== undefined) {
    orders = orders.filter((o) => new Date(o.createdAt).getTime() <= endMs);
  }

  const movementMap = new Map<
    string,
    {
      retailQty: number;
      wholesaleQty: number;
      equivalentPieces: number;
      revenue: number;
      cost: number;
    }
  >();

  orders.forEach((order) => {
    if (!Array.isArray(order.items)) return;
    order.items.forEach((item) => {
      const prod = allProducts.find((p) => p.id === item.productId || p.name === item.name);
      const itemsPerBox = Math.max(1, prod?.itemsPerWholesaleUnit || 24);
      const isSinglePiece =
        item.saleType === 'retail' ||
        (item.unitLabel &&
          (item.unitLabel.includes('مفرد') ||
            item.unitLabel.includes('قطعة') ||
            item.unitLabel.includes('قوطية')));

      const pKey = item.productId || item.name;
      const current = movementMap.get(pKey) || {
        retailQty: 0,
        wholesaleQty: 0,
        equivalentPieces: 0,
        revenue: 0,
        cost: 0,
      };

      const qty = item.quantity || 0;
      const lineRevenue = (item.price || 0) * qty;

      let pieceCost = 0;
      let cartonCost = 0;
      if (typeof item.costPrice === 'number' && item.costPrice > 0) {
        pieceCost = item.costPrice;
        cartonCost = pieceCost * itemsPerBox;
      } else if (prod?.costPrice && prod.costPrice > 0) {
        cartonCost = prod.costPrice;
        pieceCost = Math.round(cartonCost / itemsPerBox);
      } else if (prod?.boxCostPrice && prod.boxCostPrice > 0) {
        cartonCost = prod.boxCostPrice;
        pieceCost = Math.round(cartonCost / itemsPerBox);
      }

      const lineCost = (isSinglePiece ? pieceCost : cartonCost) * qty;

      if (isSinglePiece) {
        current.retailQty += qty;
        current.equivalentPieces += qty;
      } else {
        current.wholesaleQty += qty;
        current.equivalentPieces += qty * itemsPerBox;
      }
      current.revenue += lineRevenue;
      current.cost += lineCost;

      movementMap.set(pKey, current);
    });
  });

  let totalStockUnits = 0;
  let totalStockValueCost = 0;
  let totalStockValueWholesale = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let expiredCount = 0;
  let nearExpiryCount = 0;

  const allInventory: InventoryMovementItem[] = allProducts.map((prod) => {
    const movement = movementMap.get(prod.id) || movementMap.get(prod.name) || {
      retailQty: 0,
      wholesaleQty: 0,
      equivalentPieces: 0,
      revenue: 0,
      cost: 0,
    };

    const stock = Number(prod.stock) || 0;
    const minAlert = prod.minStockAlert ?? 15;
    const itemsPerBox = Math.max(1, prod.itemsPerWholesaleUnit || 24);
    const cartonCost = prod.boxCostPrice || prod.costPrice || 0;
    const wholesalePrice = prod.wholesalePrice || (prod.price * itemsPerBox);

    const stockCostVal = stock * cartonCost;
    const stockWholesaleVal = stock * wholesalePrice;

    totalStockUnits += stock;
    totalStockValueCost += stockCostVal;
    totalStockValueWholesale += stockWholesaleVal;

    if (stock === 0) {
      outOfStockCount++;
    } else if (stock <= minAlert) {
      lowStockCount++;
    }

    let expiryStatus: 'expired' | 'warning' | 'valid' | 'none' = 'none';
    let daysUntilExpiry: number | undefined = undefined;

    if (prod.expiryDate) {
      const expTime = new Date(prod.expiryDate).getTime();
      daysUntilExpiry = Math.ceil((expTime - now.getTime()) / (1000 * 60 * 60 * 24));
      const alertDays = prod.expiryAlertDays ?? 30;

      if (daysUntilExpiry < 0) {
        expiryStatus = 'expired';
        if (stock > 0) expiredCount++;
      } else if (daysUntilExpiry <= alertDays) {
        expiryStatus = 'warning';
        if (stock > 0) nearExpiryCount++;
      } else {
        expiryStatus = 'valid';
      }
    }

    const grossProfit = movement.revenue - movement.cost;

    return {
      productId: prod.id,
      productName: prod.name,
      productImage: prod.images?.[0] || '',
      category: prod.category || 'عام',
      company: prod.company || '',
      currentStock: stock,
      minStockAlert: minAlert,
      costPrice: cartonCost,
      wholesalePrice,
      retailPrice: prod.price,
      unitsSoldRetail: movement.retailQty,
      unitsSoldWholesale: movement.wholesaleQty,
      totalEquivalentSoldPieces: movement.equivalentPieces,
      totalSalesRevenue: movement.revenue,
      totalCostOfSold: movement.cost,
      grossProfit,
      expiryDate: prod.expiryDate,
      productionDate: prod.productionDate,
      expiryAlertDays: prod.expiryAlertDays,
      daysUntilExpiry,
      expiryStatus,
      stockValueCost: stockCostVal,
      stockValueWholesale: stockWholesaleVal,
    };
  });

  const bestSellers = [...allInventory]
    .filter((i) => i.totalEquivalentSoldPieces > 0)
    .sort((a, b) => b.totalEquivalentSoldPieces - a.totalEquivalentSoldPieces);

  const lowestSellers = [...allInventory].sort(
    (a, b) => a.totalEquivalentSoldPieces - b.totalEquivalentSoldPieces
  );

  const nearOrExpiredItems = [...allInventory]
    .filter((i) => i.expiryStatus === 'expired' || i.expiryStatus === 'warning' || (i.expiryDate && i.currentStock > 0))
    .sort((a, b) => (a.daysUntilExpiry ?? 9999) - (b.daysUntilExpiry ?? 9999));

  return {
    period: startDate && endDate ? `${startDate} إلى ${endDate}` : 'جميع الفترات',
    startDate,
    endDate,
    totalProductsCount: allInventory.length,
    totalStockUnits,
    totalStockValueCost,
    totalStockValueWholesale,
    lowStockCount,
    outOfStockCount,
    expiredCount,
    nearExpiryCount,
    bestSellers,
    lowestSellers,
    allInventory,
    nearOrExpiredItems,
  };
}

export async function pgGetDailyReconciliationReport(dateStr?: string): Promise<DailyReconciliationSummary> {
  const targetDate = dateStr ? dateStr.trim() : getTodayBaghdadStr();
  const startMs = new Date(`${targetDate}T00:00:00.000+03:00`).getTime();
  const endMs = new Date(`${targetDate}T23:59:59.999+03:00`).getTime();

  const [allOrders, allPayments, allPurchases, allVaultMovements] = await Promise.all([
    pgGetOrders(),
    pgGetPayments(),
    pgGetPurchaseInvoices(),
    pgGetCashVaultMovements(),
  ]);

  // 1. مبيعات وطلبيات اليوم المحددة بتوقيت العراق (Asia/Baghdad)
  const dayOrders = allOrders.filter((o) => {
    if (!o || o.status === 'cancelled') return false;
    const t = new Date(o.createdAt).getTime();
    return t >= startMs && t <= endMs;
  });

  let totalSalesRevenue = 0;
  let cashSalesCollected = 0;
  let creditSalesUnpaid = 0;

  dayOrders.forEach((o) => {
    totalSalesRevenue += o.total || 0;
    const collected =
      o.collectedAmount !== undefined
        ? o.collectedAmount
        : o.paymentMethod === 'cod'
        ? o.status === 'delivered'
          ? o.total
          : 0
        : o.total;
    cashSalesCollected += collected;
    creditSalesUnpaid += Math.max(0, (o.total || 0) - collected);
  });

  // 2. تحصيلات السائقين والعهد النقدية
  let driverSettlementsCount = 0;
  let driverCashTurnover = 0;
  dayOrders.forEach((o) => {
    if (o.driverId && (o.collectionStatus === 'collected_cash' || o.status === 'delivered')) {
      driverSettlementsCount++;
      driverCashTurnover += o.collectedAmount || (o.paymentMethod === 'cod' ? o.total : 0);
    }
  });

  // 3. السندات المالية المقيدة اليوم بتوقيت بغداد
  const dayPayments = allPayments.filter((p) => {
    const t = new Date(p.createdAt).getTime();
    return t >= startMs && t <= endMs;
  });

  let receiptVouchersCount = 0;
  let receiptVouchersTotal = 0;
  let disbursementVouchersCount = 0;
  let disbursementVouchersTotal = 0;
  let reversalVouchersCount = 0;
  let reversalVouchersTotal = 0;

  dayPayments.forEach((p) => {
    const isReversal = p.voucherType === 'reversal' || p.receiptNumber?.startsWith('REV-');
    const isDisb = p.voucherType === 'disbursement' || p.receiptNumber?.startsWith('DSB');

    if (isReversal) {
      reversalVouchersCount++;
      reversalVouchersTotal += p.amount || 0;
    } else if (isDisb) {
      disbursementVouchersCount++;
      disbursementVouchersTotal += p.amount || 0;
    } else {
      receiptVouchersCount++;
      receiptVouchersTotal += p.amount || 0;
    }
  });

  // 4. مشتريات الموردين بتوقيت بغداد
  const dayPurchases = allPurchases.filter((inv) => {
    if (inv.status === 'cancelled') return false;
    const t = new Date(inv.date || inv.createdAt).getTime();
    return t >= startMs && t <= endMs;
  });

  let purchasesTotalAmount = 0;
  let purchasesCashPaid = 0;
  let purchasesCredit = 0;

  dayPurchases.forEach((inv) => {
    purchasesTotalAmount += inv.totalAmount || 0;
    const isCash = inv.paymentMethod === 'cash';
    const isCredit = inv.paymentMethod === 'credit';
    const paid = isCash ? inv.totalAmount : isCredit ? 0 : inv.paidAmount || 0;
    purchasesCashPaid += paid;
    purchasesCredit += Math.max(0, (inv.totalAmount || 0) - paid);
  });

  // 5. مطابقة الصندوق 181 (Vault) ورصيد الافتتاح والإغلاق
  let vaultOpeningBalance = 0;
  let vaultTotalIn = 0;
  let vaultTotalOut = 0;

  const dayVaultMovements: any[] = [];

  allVaultMovements.forEach((m) => {
    const t = new Date(m.date).getTime();
    const amt = Number(m.amount) || 0;
    const isIncome = m.type === 'inflow';

    if (t < startMs) {
      vaultOpeningBalance += isIncome ? amt : -amt;
    } else if (t <= endMs) {
      dayVaultMovements.push(m);
      if (isIncome) {
        vaultTotalIn += amt;
      } else {
        vaultTotalOut += amt;
      }
    }
  });

  const vaultNetDailyChange = vaultTotalIn - vaultTotalOut;
  const vaultClosingBalance = vaultOpeningBalance + vaultNetDailyChange;

  return {
    date: targetDate,
    ordersCount: dayOrders.length,
    totalSalesRevenue,
    cashSalesCollected,
    creditSalesUnpaid,
    driverSettlementsCount,
    driverCashTurnover,
    receiptVouchersCount,
    receiptVouchersTotal,
    disbursementVouchersCount,
    disbursementVouchersTotal,
    reversalVouchersCount,
    reversalVouchersTotal,
    purchasesCount: dayPurchases.length,
    purchasesTotalAmount,
    purchasesCashPaid,
    purchasesCredit,
    vaultOpeningBalance,
    vaultTotalIn,
    vaultTotalOut,
    vaultNetDailyChange,
    vaultClosingBalance,
    orders: dayOrders,
    payments: dayPayments,
    purchases: dayPurchases,
    vaultMovements: dayVaultMovements,
  };
}
