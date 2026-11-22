import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { EstablishmentStatus, OrderStatus, PaymentStatus, Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../middlewares/errors.js';
import { notifications } from './notifications.js';
import { paymentService, type PaymentOutcome } from './payment.js';
import { generatePickup, readPickup, verifyPickup, type PickupProof } from './pickup.js';
import { clearReservationTimer, scheduledReservations, setReservationTimer } from './reservation-timer.js';

const orderSelect = {
  id: true, establishmentId: true, status: true, pickupMethod: true,
  pickupStartsAt: true, pickupEndsAt: true, expiresAt: true, totalAmount: true,
  commissionBps: true, commissionAmount: true, completedAt: true, createdAt: true, updatedAt: true,
  establishment: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
  items: { orderBy: { offerId: 'asc' }, select: {
    offerId: true, offerName: true, quantity: true, unitPrice: true, unitWeightGrams: true,
    pickupStartsAt: true, pickupEndsAt: true,
  } },
} satisfies Prisma.OrderSelect;
export const paymentSelect = {
  id: true, orderId: true, provider: true, status: true, amount: true, refundedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.PaymentSelect;

type Transaction = Prisma.TransactionClient;
type Scope = { customerId: string } | { establishmentId: string };
type ReservationItem = { offerId: string; quantity: number };
const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.OrderOrderByWithRelationInput[];

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Order not found');
const invalidStatus = () => new ApiError(409, 'INVALID_ORDER_STATUS', 'Action is unavailable for the current order status');
const expired = () => new ApiError(409, 'RESERVATION_EXPIRED', 'Reservation expired');
const duplicateKey = () => new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key already used with different data');

function hashRequest(body: unknown) {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export async function orderView(orderId: string, scope: Scope) {
  const customerView = 'customerId' in scope;
  const data = await prisma.order.findFirst({
    where: { id: orderId, ...scope },
    select: { ...orderSelect, pickupCredentialsCiphertext: customerView },
  });
  if (!data) throw notFound();
  const { pickupCredentialsCiphertext, ...order } = data;
  if (!customerView) return order;
  const canPickup = order.status === OrderStatus.PAID || order.status === OrderStatus.READY;
  return { ...order, pickup: canPickup && pickupCredentialsCiphertext ? readPickup(order.id, pickupCredentialsCiphertext) : null };
}

export function listOrders(scope: Scope, status: OrderStatus | undefined, skip: number, take: number) {
  return prisma.order.findMany({ where: { ...scope, status }, select: orderSelect, orderBy, skip, take });
}

export async function reserveOrder(customerId: string, key: string, items: ReservationItem[]) {
  const sorted = items.map(({ offerId, quantity }) => ({ offerId, quantity }))
    .sort((left, right) => left.offerId.localeCompare(right.offerId));
  const requestHash = hashRequest(sorted);
  const ids = sorted.map((item) => item.offerId);
  const result = await prisma.$transaction(async (db) => {
    // Serialize a customer's idempotency checks before acquiring offer locks in a stable order.
    await db.$queryRaw`SELECT id FROM "User" WHERE id = ${customerId}::uuid FOR NO KEY UPDATE`;
    const existing = await db.order.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey: key } },
      select: { id: true, requestHash: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) throw duplicateKey();
      return { id: existing.id, created: false } as const;
    }

    await db.$queryRaw`SELECT id FROM "Offer"
      WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY id FOR NO KEY UPDATE`;
    const offers = await db.offer.findMany({
      where: { id: { in: ids } }, orderBy: { id: 'asc' },
      include: { establishment: { select: { status: true } } },
    });
    const now = Date.now();
    const expiresAt = new Date(now + Math.round(config.RESERVATION_TTL_MINUTES * 60_000));
    if (offers.length !== ids.length || offers.some((offer) => !offer.isAvailable || offer.archivedAt
      || offer.establishment.status !== EstablishmentStatus.ACTIVE)) {
      throw new ApiError(409, 'OFFER_UNAVAILABLE', 'An offer is no longer available');
    }
    const establishmentId = offers[0].establishmentId;
    if (offers.some((offer) => offer.establishmentId !== establishmentId)) {
      throw new ApiError(400, 'MIXED_ESTABLISHMENTS', 'All offers must belong to the same establishment');
    }
    const pickupStartsAt = new Date(Math.max(...offers.map((offer) => offer.pickupStartsAt.getTime())));
    const pickupEndsAt = new Date(Math.min(...offers.map((offer) => offer.pickupEndsAt.getTime())));
    if (pickupStartsAt >= pickupEndsAt || pickupEndsAt.getTime() <= now || pickupEndsAt < expiresAt) {
      throw new ApiError(409, 'PICKUP_WINDOW_UNAVAILABLE', 'The common pickup window cannot accommodate the reservation');
    }
    const amounts = new Map(sorted.map(({ offerId, quantity }) => [offerId, quantity]));
    const lines = offers.map((offer) => {
      const quantity = amounts.get(offer.id)!;
      if (offer.remainingQuantity < quantity) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'An offer has insufficient stock');
      return {
        offerId: offer.id, offerName: offer.name, quantity, unitPrice: offer.price, unitWeightGrams: offer.weightGrams,
        pickupStartsAt: offer.pickupStartsAt, pickupEndsAt: offer.pickupEndsAt,
      };
    });
    const totalAmount = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    if (totalAmount > 2_147_483_647) throw new ApiError(400, 'ORDER_TOTAL_TOO_LARGE', 'Order total exceeds the allowed amount');
    const commissionBps = Math.round(config.PLATFORM_COMMISSION_PERCENT * 100);
    for (const line of lines) {
      await db.offer.update({ where: { id: line.offerId }, data: { remainingQuantity: { decrement: line.quantity } } });
    }
    const order = await db.order.create({
      data: {
        customerId, establishmentId, expiresAt, pickupStartsAt, pickupEndsAt, totalAmount, commissionBps,
        commissionAmount: Math.round(totalAmount * commissionBps / 10_000), idempotencyKey: key, requestHash,
        items: { create: lines },
      },
      select: { id: true },
    });
    return { id: order.id, expiresAt, created: true } as const;
  });
  if (result.created) await setReservationTimer(result.id, result.expiresAt);
  return result;
}

async function lockedOrder(db: Transaction, orderId: string, scope?: Scope) {
  let ownership = Prisma.empty;
  if (scope) ownership = 'customerId' in scope
    ? Prisma.sql`AND "customerId" = ${scope.customerId}::uuid`
    : Prisma.sql`AND "establishmentId" = ${scope.establishmentId}::uuid`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order" WHERE id = ${orderId}::uuid ${ownership} FOR NO KEY UPDATE`;
  if (!rows.length) throw notFound();
  return db.order.findUniqueOrThrow({ where: { id: orderId } });
}

async function releaseStock(db: Transaction, orderId: string, status: 'CANCELLED' | 'EXPIRED') {
  const items = await db.orderItem.findMany({
    where: { orderId }, select: { offerId: true, quantity: true }, orderBy: { offerId: 'asc' },
  });
  for (const item of items) {
    await db.offer.update({ where: { id: item.offerId }, data: { remainingQuantity: { increment: item.quantity } } });
  }
  await db.order.update({
    where: { id: orderId },
    data: { status, pickupPinHash: null, pickupQrHash: null, pickupCredentialsCiphertext: null },
  });
}

async function expiredTransition(orderId: string) {
  notifications.publish('reservation_expired');
  await clearReservationTimer(orderId);
}

export async function cancelOrder(orderId: string, customerId: string) {
  const outcome = await prisma.$transaction(async (db) => {
    const order = await lockedOrder(db, orderId, { customerId });
    if (order.status === OrderStatus.CANCELLED) return 'cancelled';
    if (order.status === OrderStatus.EXPIRED) return 'already-expired';
    if (order.status === OrderStatus.RESERVED && order.expiresAt.getTime() <= Date.now()) {
      await releaseStock(db, orderId, OrderStatus.EXPIRED);
      return 'expired';
    }
    if (order.status !== OrderStatus.RESERVED && order.status !== OrderStatus.PAID) throw invalidStatus();
    if (order.status === OrderStatus.PAID) {
      const payment = await db.payment.findFirst({
        where: { orderId, status: PaymentStatus.SUCCEEDED }, select: { id: true, amount: true },
      });
      if (!payment) throw new Error('Paid order has no successful payment');
      await db.payment.update({ where: { id: payment.id }, data: paymentService.refund(payment.amount) });
    }
    await releaseStock(db, orderId, OrderStatus.CANCELLED);
    return 'cancelled';
  });
  if (outcome === 'expired') await expiredTransition(orderId);
  if (outcome !== 'cancelled') throw expired();
  await clearReservationTimer(orderId);
}

async function attemptPayment(orderId: string, customerId: string, key: string, outcome: PaymentOutcome) {
  const requestHash = hashRequest(outcome);
  return prisma.$transaction(async (db) => {
    const order = await lockedOrder(db, orderId, { customerId });
    const prior = await db.payment.findUnique({
      where: { orderId_idempotencyKey: { orderId, idempotencyKey: key } },
      select: { ...paymentSelect, requestHash: true },
    });
    if (prior) {
      if (prior.requestHash !== requestHash) throw duplicateKey();
      const { requestHash: _hash, ...payment } = prior;
      return { payment, created: false, status: order.status } as const;
    }
    if (order.status === OrderStatus.EXPIRED) return { expired: true, changed: false } as const;
    if (order.status !== OrderStatus.RESERVED) throw invalidStatus();
    if (order.expiresAt.getTime() <= Date.now()) {
      await releaseStock(db, orderId, OrderStatus.EXPIRED);
      return { expired: true, changed: true } as const;
    }
    const charge = paymentService.charge(order.totalAmount, outcome);
    const payment = await db.payment.create({
      data: { orderId, amount: order.totalAmount, idempotencyKey: key, requestHash, ...charge }, select: paymentSelect,
    });
    if (charge.status === PaymentStatus.FAILED) return { payment, created: true, status: order.status } as const;

    await db.order.update({
      where: { id: orderId }, data: { status: OrderStatus.PAID, ...generatePickup(orderId, order.establishmentId) },
    });
    return { payment, created: true, status: OrderStatus.PAID } as const;
  });
}

export async function payOrder(orderId: string, customerId: string, key: string, outcome: PaymentOutcome) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const result = await attemptPayment(orderId, customerId, key, outcome);
      if ('expired' in result) {
        if (result.changed) await expiredTransition(orderId);
        throw expired();
      }
      if (result.created && result.status === OrderStatus.PAID) {
        notifications.publish('payment_succeeded');
        await clearReservationTimer(orderId);
      }
      return result;
    } catch (error) {
      // A rare simultaneous PIN or QR collision is rejected by PostgreSQL and retried with fresh credentials.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  throw new ApiError(503, 'PICKUP_CODE_UNAVAILABLE', 'Could not allocate a pickup code. Retry payment.');
}

export async function listPayments(orderId: string, customerId: string, skip: number, take: number) {
  const order = await prisma.order.findFirst({ where: { id: orderId, customerId }, select: { id: true } });
  if (!order) throw notFound();
  return prisma.payment.findMany({ where: { orderId }, orderBy, select: paymentSelect, skip, take });
}

export async function markReady(orderId: string, establishmentId: string) {
  const changed = await prisma.$transaction(async (db) => {
    const order = await lockedOrder(db, orderId, { establishmentId });
    if (order.status === OrderStatus.READY) return false;
    if (order.status !== OrderStatus.PAID) throw invalidStatus();
    await db.order.update({ where: { id: orderId }, data: { status: OrderStatus.READY } });
    return true;
  });
  if (changed) notifications.publish('order_ready');
}

export async function confirmPickup(orderId: string, establishmentId: string, proof: PickupProof) {
  await prisma.$transaction(async (db) => {
    const order = await lockedOrder(db, orderId, { establishmentId });
    if (order.status !== OrderStatus.READY) throw invalidStatus();
    if (!verifyPickup(order, proof)) throw new ApiError(422, 'INVALID_PICKUP_CODE', 'PIN or QR token is incorrect');
    await db.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.COMPLETED, completedAt: new Date(),
        pickupPinHash: null, pickupQrHash: null, pickupCredentialsCiphertext: null,
      },
    });
  });
}

async function expireOne(id: string, now: Date) {
  const result = await prisma.$transaction(async (db) => {
    const order = await lockedOrder(db, id).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
    if (!order || order.status !== OrderStatus.RESERVED) return 'processed';
    if (order.expiresAt > now) return 'waiting';
    await releaseStock(db, id, OrderStatus.EXPIRED);
    return 'expired';
  });
  if (result === 'expired') await expiredTransition(id);
  if (result === 'processed') await clearReservationTimer(id);
}

export function startReservationWorker() {
  let running = false;
  const batchSize = 50;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const scheduled = await scheduledReservations(now, batchSize);
      // The database deadline recovers lost Redis keys and orders committed just before a process restart.
      const overdue = await prisma.order.findMany({
        where: { status: OrderStatus.RESERVED, expiresAt: { lte: now } },
        select: { id: true }, orderBy: { expiresAt: 'asc' }, take: batchSize,
      });
      for (const id of new Set([...scheduled, ...overdue.map((order) => order.id)])) {
        await expireOne(id, now);
      }
    } catch {
      console.error('Reservation expiration check failed');
    } finally {
      running = false;
    }
  }, 2000);
  timer.unref();
}
