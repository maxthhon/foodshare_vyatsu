import { Router } from 'express';
import { z } from 'zod';
import { OrderStatus, Role } from '../generated/prisma/enums.js';
import { idParam, idempotencyKey, pageQuery, pageResult, paging } from '../http.js';
import { auth, identity, rateLimit, requireRole } from '../middlewares/auth.js';
import { cancelOrder, confirmPickup, listOrders, listPayments, markReady, orderView, payOrder, reserveOrder } from '../services/orders.js';
import { ownedVenue } from '../services/venues.js';

export const orderRouter = Router();
const statusQuery = paging.extend({ status: z.enum(OrderStatus).optional() });
const orderInput = z.strictObject({
  items: z.array(z.strictObject({
    offerId: z.uuid().transform((value) => value.toLowerCase()), quantity: z.number().int().min(1).max(100),
  })).min(1).max(20).refine((items) => new Set(items.map((item) => item.offerId)).size === items.length),
});
const paymentInput = z.strictObject({ outcome: z.enum(['success', 'failure']) });
const pickupProof = z.union([
  z.strictObject({ pin: z.string().regex(/^\d{4}$/) }),
  z.strictObject({ qrToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
]);

orderRouter.use('/orders', auth, requireRole(Role.CUSTOMER), (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
});

orderRouter.post('/orders', rateLimit('reserve', 90, 60), async (request, response) => {
  const key = idempotencyKey.parse(request.get('Idempotency-Key'));
  const { items } = orderInput.parse(request.body);
  const customerId = identity(request).id;
  const result = await reserveOrder(customerId, key, items);
  response.status(result.created ? 201 : 200).json(await orderView(result.id, { customerId }));
});

orderRouter.get('/orders', async (request, response) => {
  const page = statusQuery.parse(request.query);
  const { skip, take } = pageQuery(page);
  response.json(pageResult(await listOrders({ customerId: identity(request).id }, page.status, skip, take), page));
});

orderRouter.get('/orders/:id', async (request, response) => {
  const { id } = idParam.parse(request.params);
  response.json(await orderView(id, { customerId: identity(request).id }));
});

orderRouter.post('/orders/:id/cancel', async (request, response) => {
  const { id } = idParam.parse(request.params);
  const customerId = identity(request).id;
  await cancelOrder(id, customerId);
  response.json(await orderView(id, { customerId }));
});

orderRouter.post('/orders/:id/payments', rateLimit('payment', 60, 60), async (request, response) => {
  const { id } = idParam.parse(request.params);
  const key = idempotencyKey.parse(request.get('Idempotency-Key'));
  const { outcome } = paymentInput.parse(request.body);
  const result = await payOrder(id, identity(request).id, key, outcome);
  response.status(result.created ? 201 : 200).json({ payment: result.payment, orderStatus: result.status });
});

orderRouter.get('/orders/:id/payments', async (request, response) => {
  const { id } = idParam.parse(request.params);
  const page = paging.parse(request.query);
  const { skip, take } = pageQuery(page);
  response.json(pageResult(await listPayments(id, identity(request).id, skip, take), page));
});

const venueOrders = '/establishments/me/orders';
orderRouter.use(venueOrders, auth, requireRole(Role.ESTABLISHMENT), (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
});

orderRouter.get(venueOrders, async (request, response) => {
  const page = statusQuery.parse(request.query);
  const { skip, take } = pageQuery(page);
  const establishmentId = await ownedVenue(identity(request).id);
  response.json(pageResult(await listOrders({ establishmentId }, page.status, skip, take), page));
});

orderRouter.post(`${venueOrders}/:id/ready`, async (request, response) => {
  const { id } = idParam.parse(request.params);
  const establishmentId = await ownedVenue(identity(request).id);
  await markReady(id, establishmentId);
  response.json(await orderView(id, { establishmentId }));
});

orderRouter.post(`${venueOrders}/:id/confirm`, rateLimit('pickup', 30, 60), async (request, response) => {
  const { id } = idParam.parse(request.params);
  const proof = pickupProof.parse(request.body);
  const establishmentId = await ownedVenue(identity(request).id);
  await confirmPickup(id, establishmentId, proof);
  response.json(await orderView(id, { establishmentId }));
});
