import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { driverRatings, financialAccounts, orders } from '@/db/schema';

export async function pgGetDriverRatings(driverId?: string) {
  const db = getDb();
  const base = db.select().from(driverRatings);
  return driverId
    ? base.where(eq(driverRatings.driverId, driverId)).orderBy(desc(driverRatings.createdAt))
    : base.orderBy(desc(driverRatings.createdAt));
}

export async function pgAddDriverRating(input: {
  customerAuthIdentityId: string;
  orderId: string;
  rating: number;
  tag?: string | null;
  comment?: string | null;
}) {
  const db = getDb();
  const rating = Number(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw new Error('INVALID_RATING');

  return db.transaction(async (tx) => {
    // Ownership is derived from PostgreSQL identity/account linkage, never from client-supplied name/phone.
    const [account] = await tx.select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(and(
        eq(financialAccounts.authIdentityId, input.customerAuthIdentityId),
        eq(financialAccounts.isActive, true),
      ))
      .limit(1);
    if (!account) throw new Error('CUSTOMER_ACCOUNT_NOT_FOUND');

    const [order] = await tx.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      accountId: orders.accountId,
      driverId: orders.driverId,
      status: orders.status,
      customerName: orders.customerNameSnap,
      customerPhone: orders.customerPhoneSnap,
    }).from(orders).where(eq(orders.id, input.orderId)).limit(1);

    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.accountId !== account.id) throw new Error('ORDER_NOT_OWNED');
    if (order.status !== 'delivered') throw new Error('ORDER_NOT_DELIVERED');
    if (!order.driverId) throw new Error('ORDER_HAS_NO_DRIVER');

    const [existing] = await tx.select({ id: driverRatings.id })
      .from(driverRatings)
      .where(and(
        eq(driverRatings.orderId, order.id),
        eq(driverRatings.customerAuthIdentityId, input.customerAuthIdentityId),
      ))
      .limit(1);
    if (existing) throw new Error('RATING_ALREADY_EXISTS');

    const [created] = await tx.insert(driverRatings).values({
      driverId: order.driverId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerAuthIdentityId: input.customerAuthIdentityId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      rating: rating.toFixed(1),
      tag: input.tag?.trim() || null,
      comment: input.comment?.trim() || null,
    }).returning();
    return created;
  });
}
