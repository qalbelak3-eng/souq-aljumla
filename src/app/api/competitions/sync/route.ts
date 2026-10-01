import { NextResponse } from 'next/server';
import { pgGetOrders } from '@/lib/postgres-orders';
import type { CompetitionLeader } from '@/types';

function classifyOrder(order: any): 'customer' | 'retail' | 'wholesale' {
  const accountType = String(order.customerAccountTypeSnap || '').toLowerCase();
  const merchantTier = String(order.customerMerchantTierSnap || '').toLowerCase();
  const businessName = String(order.customer?.businessName || '');

  if (
    accountType === 'wholesale' ||
    accountType === 'merchant' ||
    merchantTier === 'gold' ||
    merchantTier === 'silver' ||
    merchantTier === 'bronze' ||
    businessName.includes('جملة') ||
    (Array.isArray(order.items) && order.items.some((item: any) => item?.saleType === 'wholesale'))
  ) {
    return 'wholesale';
  }

  if (accountType === 'market' || Boolean(businessName)) {
    return 'retail';
  }

  return 'customer';
}

function buildLeaderboard(orders: any[], track: 'customer' | 'retail' | 'wholesale'): CompetitionLeader[] {
  const totals = new Map<string, {
    id: string;
    name: string;
    city?: string;
    storefrontImage?: string;
    quantity: number;
  }>();

  for (const order of orders) {
    if (!order || order.status === 'cancelled' || order.status === 'returned') continue;
    if (classifyOrder(order) !== track) continue;

    const key = String(order.customer?.userId || order.customer?.phone || order.customer?.name || order.id);
    const quantity = Array.isArray(order.items)
      ? order.items.reduce((sum: number, item: any) => sum + (Number(item?.quantity) || 0), 0)
      : 0;

    if (quantity <= 0) continue;

    const current = totals.get(key);
    if (current) {
      current.quantity += quantity;
    } else {
      totals.set(key, {
        id: key,
        name: String(order.customer?.businessName || order.customer?.name || 'عميل'),
        city: order.customer?.city || undefined,
        storefrontImage: order.customer?.storefrontImage || undefined,
        quantity,
      });
    }
  }

  return Array.from(totals.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 50)
    .map((entry, index) => ({
      id: entry.id,
      rank: index + 1,
      name: entry.name,
      city: entry.city,
      score: `${entry.quantity.toLocaleString('en-US')} ${track === 'wholesale' ? 'وحدة/كرتون' : 'قطعة'}`,
      badge: index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : undefined,
      storefrontImage: entry.storefrontImage,
    }));
}

export async function GET() {
  try {
    const orders = await pgGetOrders();

    return NextResponse.json({
      success: true,
      customerLeaders: buildLeaderboard(orders, 'customer'),
      retailLeaders: buildLeaderboard(orders, 'retail'),
      wholesaleLeaders: buildLeaderboard(orders, 'wholesale'),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to build competition leaderboard' },
      { status: 500 }
    );
  }
}
