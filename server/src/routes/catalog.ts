import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Role } from '../generated/prisma/enums.js';
import { idParam, pageQuery, pageResult, paging } from '../http.js';
import { optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import {
  availableOffers, catalogQuery, findCatalog, findMapPoints, mapQuery, offerInclude, presentOffer,
  publicEstablishment, userAllergens,
} from '../services/catalog.js';

export const catalogRouter = Router();
const establishmentListQuery = paging.extend({ q: z.string().trim().min(1).max(120).optional() });

catalogRouter.get('/boxes', optionalAuth, async (request, response) => {
  const query = catalogQuery.parse(request.query);
  const customerId = request.auth?.role === Role.CUSTOMER ? request.auth.id : undefined;
  response.set('Cache-Control', 'no-store').json(pageResult(await findCatalog(query, customerId), query));
});

catalogRouter.get('/boxes/:id', optionalAuth, async (request, response) => {
  const { id } = idParam.parse(request.params);
  const customerId = request.auth?.role === Role.CUSTOMER ? request.auth.id : undefined;
  const [offer, profile] = await Promise.all([
    prisma.offer.findFirst({ where: { id, ...availableOffers() }, include: offerInclude }),
    userAllergens(customerId),
  ]);
  if (!offer) throw new ApiError(404, 'NOT_FOUND', 'Offer not found');
  response.set('Cache-Control', 'no-store').json(presentOffer(offer, profile));
});

catalogRouter.get('/establishments/map', async (request, response) => {
  const query = mapQuery.parse(request.query);
  response.json(pageResult(await findMapPoints(query), query));
});

catalogRouter.get('/establishments', async (request, response) => {
  const query = establishmentListQuery.parse(request.query);
  const rows = await prisma.establishment.findMany({
    where: {
      status: 'ACTIVE', offers: { some: availableOffers() },
      name: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    },
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }], ...pageQuery(query),
  });
  response.json(pageResult(rows, query));
});

catalogRouter.get('/establishments/:id', async (request, response) => {
  const { id } = idParam.parse(request.params);
  const venue = await prisma.establishment.findUnique({
    where: { id, status: 'ACTIVE' }, select: publicEstablishment,
  });
  if (!venue) throw new ApiError(404, 'NOT_FOUND', 'Establishment not found');
  const rating = await prisma.review.aggregate({ where: { establishmentId: id }, _avg: { rating: true }, _count: true });
  response.json({ ...venue, rating: rating._avg.rating, reviewCount: rating._count });
});

catalogRouter.get('/allergens', async (_request, response) => {
  response.json(await prisma.allergen.findMany({ orderBy: { id: 'asc' } }));
});
