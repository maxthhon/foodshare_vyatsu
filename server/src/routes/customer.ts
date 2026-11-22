import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Prisma, Role } from '../generated/prisma/client.js';
import { idParam, pageQuery, pageResult, paging } from '../http.js';
import { auth, identity, requireRole } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { availableOffers, offerInclude, presentOffer, userAllergens } from '../services/catalog.js';

export const customerRouter = Router();
const reviewQuery = paging.extend({ establishmentId: z.uuid() });
const reviewInput = z.strictObject({
  orderId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(1000).optional(),
});
const reviewSelect = {
  id: true, establishmentId: true, rating: true, comment: true, createdAt: true, customer: { select: { name: true } },
} satisfies Prisma.ReviewSelect;

customerRouter.use('/favorites', auth, requireRole(Role.CUSTOMER), (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
});

customerRouter.get('/favorites', async (request, response) => {
  const page = paging.parse(request.query);
  const userId = identity(request).id;
  const [rows, profile] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId, offer: availableOffers() },
      orderBy: [{ createdAt: 'desc' }, { offerId: 'desc' }],
      select: { offer: { include: offerInclude } }, ...pageQuery(page),
    }),
    userAllergens(userId),
  ]);
  response.json(pageResult(rows.map(({ offer }) => presentOffer(offer, profile)), page));
});

customerRouter.put('/favorites/:id', async (request, response) => {
  const { id: offerId } = idParam.parse(request.params);
  const userId = identity(request).id;
  const offer = await prisma.offer.findFirst({ where: { id: offerId, ...availableOffers() }, select: { id: true } });
  if (!offer) throw new ApiError(404, 'NOT_FOUND', 'Offer not found');
  await prisma.favorite.createMany({ data: [{ userId, offerId }], skipDuplicates: true });
  response.sendStatus(204);
});

customerRouter.delete('/favorites/:id', async (request, response) => {
  const { id: offerId } = idParam.parse(request.params);
  await prisma.favorite.deleteMany({ where: { userId: identity(request).id, offerId } });
  response.sendStatus(204);
});

customerRouter.get('/reviews', async (request, response) => {
  const page = reviewQuery.parse(request.query);
  const venue = await prisma.establishment.findUnique({
    where: { id: page.establishmentId, status: 'ACTIVE' }, select: { id: true },
  });
  if (!venue) throw new ApiError(404, 'NOT_FOUND', 'Establishment not found');
  const rows = await prisma.review.findMany({
    where: { establishmentId: venue.id }, select: reviewSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageQuery(page),
  });
  response.json(pageResult(rows, page));
});

customerRouter.post('/reviews', auth, requireRole(Role.CUSTOMER), async (request, response) => {
  const { orderId, rating, comment } = reviewInput.parse(request.body);
  const customerId = identity(request).id;
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId }, select: { status: true, establishmentId: true },
  });
  if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
  if (order.status !== 'COMPLETED') throw new ApiError(409, 'ORDER_NOT_COMPLETED', 'Only completed orders can be reviewed');
  try {
    const review = await prisma.review.create({
      data: { orderId, customerId, establishmentId: order.establishmentId, rating, comment }, select: reviewSelect,
    });
    response.status(201).json(review);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError(409, 'REVIEW_EXISTS', 'The order already has a review');
    }
    throw error;
  }
});
