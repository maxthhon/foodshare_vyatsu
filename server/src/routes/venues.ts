import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { EstablishmentCategory, OfferCategory, OfferSize, OfferType, Prisma, Role } from '../generated/prisma/client.js';
import { idParam, pageQuery, pageResult, paging } from '../http.js';
import { auth, identity, requireRole } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { allergenId, offerInclude, presentOffer } from '../services/catalog.js';
import { ownedVenue } from '../services/venues.js';

export const venueRouter = Router();
const venuePath = '/establishments/me';
const maxPrice = 10_000_000;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weekDay = z.enum(['daily', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const venueProfile = z.strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable(),
  logoUrl: z.url({ protocol: /^https?$/ }).nullable(),
  address: z.string().trim().min(1).max(250).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  publicPhone: z.string().trim().min(1).max(40).nullable(),
  publicEmail: z.email().max(254).nullable(),
  categories: z.array(z.enum(EstablishmentCategory)).max(4),
  businessHours: z.partialRecord(weekDay, z.strictObject({ opens: time, closes: time })).nullable(),
}).partial().refine((profile) => Object.keys(profile).length > 0)
  .refine(({ latitude, longitude }) => (latitude === undefined) === (longitude === undefined)
    && (latitude === null) === (longitude === null), { path: ['latitude', 'longitude'] });

const itemFields = z.strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  type: z.enum(OfferType),
  size: z.enum(OfferSize).nullable().optional(),
  category: z.enum(OfferCategory),
  originalPrice: z.number().int().min(1).max(maxPrice),
  price: z.number().int().min(1).max(maxPrice),
  weightGrams: z.number().int().min(1).max(100_000),
  allergenIds: z.array(allergenId).max(30),
});
const stockFields = z.strictObject({
  quantity: z.number().int().min(0).max(100_000),
  pickupStartsAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  pickupEndsAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  isAvailable: z.boolean().optional(),
});
const directOffer = itemFields.extend(stockFields.shape);
const fromTemplate = stockFields.extend({ templateId: z.uuid() });
const offerPatch = directOffer.partial().refine((data) => Object.keys(data).length > 0);
const itemPatch = itemFields.partial().refine((data) => Object.keys(data).length > 0);
const offerListQuery = paging.extend({ includeArchived: z.enum(['true', 'false']).default('false') });
const templateInclude = { allergens: offerInclude.allergens } satisfies Prisma.OfferTemplateInclude;
const emptyAllergens = new Set<string>();

function validateItem(data: z.infer<typeof itemFields>) {
  if (data.price > data.originalPrice || (data.type === OfferType.SURPRISE_BOX) !== Boolean(data.size)) {
    throw new ApiError(400, 'INVALID_OFFER', 'Check the offer price and box size');
  }
}

function validateSlot(startsAt: Date, endsAt: Date) {
  if (startsAt >= endsAt || endsAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'INVALID_PICKUP_WINDOW', 'Pickup window must be ordered and end in the future');
  }
}

async function checkedAllergenLinks(db: Prisma.TransactionClient, values: string[]) {
  const ids = [...new Set(values)];
  if (await db.allergen.count({ where: { id: { in: ids } } }) !== ids.length) {
    throw new ApiError(400, 'UNKNOWN_ALLERGEN', 'Unknown allergen');
  }
  return ids.map((id) => ({ allergenId: id }));
}

function presentTemplate({ allergens, ...data }: Prisma.OfferTemplateGetPayload<{ include: typeof templateInclude }>) {
  return { ...data, allergens: allergens.map(({ allergen }) => allergen) };
}

async function lockOwnedOffer(db: Prisma.TransactionClient, id: string, venue: string) {
  const result = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Offer" WHERE id = ${id}::uuid AND "establishmentId" = ${venue}::uuid
    FOR NO KEY UPDATE`;
  if (!result.length) throw new ApiError(404, 'NOT_FOUND', 'Offer not found');
  return db.offer.findUniqueOrThrow({ where: { id } });
}

venueRouter.use(venuePath, auth, requireRole(Role.ESTABLISHMENT), (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
});

venueRouter.put(venuePath, async (request, response) => {
  const venue = await ownedVenue(identity(request).id);
  const { businessHours, categories, ...fields } = venueProfile.parse(request.body);
  const data = await prisma.establishment.update({
    where: { id: venue },
    data: {
      ...fields, categories: categories && [...new Set(categories)],
      businessHours: businessHours === null ? Prisma.DbNull : businessHours,
    },
  });
  response.json(data);
});

const boxes = `${venuePath}/boxes`;
venueRouter.get(boxes, async (request, response) => {
  const page = offerListQuery.parse(request.query);
  const venue = await ownedVenue(identity(request).id);
  const rows = await prisma.offer.findMany({
    where: { establishmentId: venue, archivedAt: page.includeArchived === 'false' ? null : undefined },
    include: offerInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageQuery(page),
  });
  response.json(pageResult(rows.map((offer) => presentOffer(offer, emptyAllergens)), page));
});

venueRouter.get(`${boxes}/:id`, async (request, response) => {
  const venue = await ownedVenue(identity(request).id);
  const { id } = idParam.parse(request.params);
  const offer = await prisma.offer.findFirst({ where: { id, establishmentId: venue }, include: offerInclude });
  if (!offer) throw new ApiError(404, 'NOT_FOUND', 'Offer not found');
  response.json(presentOffer(offer, emptyAllergens));
});

venueRouter.post(boxes, async (request, response) => {
  const venue = await ownedVenue(identity(request).id);
  const input = z.union([directOffer, fromTemplate]).parse(request.body);
  const { quantity, pickupStartsAt, pickupEndsAt, isAvailable } = input;
  validateSlot(pickupStartsAt, pickupEndsAt);
  const offer = await prisma.$transaction(async (db) => {
    let details: z.infer<typeof itemFields>;
    let templateId: string | undefined;
    if ('templateId' in input) {
      templateId = input.templateId;
      // Keep the template available while copying it into a new standalone offer.
      const templateRows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "OfferTemplate"
        WHERE id = ${templateId}::uuid AND "establishmentId" = ${venue}::uuid FOR SHARE`;
      if (!templateRows.length) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
      const { allergens, ...template } = await db.offerTemplate.findUniqueOrThrow({
        where: { id: templateId }, include: templateInclude,
      });
      details = itemFields.parse({
        name: template.name, description: template.description, type: template.type, size: template.size,
        category: template.category, originalPrice: template.originalPrice, price: template.price,
        weightGrams: template.weightGrams, allergenIds: allergens.map(({ allergen }) => allergen.id),
      });
    } else {
      const { pickupStartsAt: _start, pickupEndsAt: _end, isAvailable: _active, quantity: _quantity, ...item } = input;
      details = item;
    }
    validateItem(details);
    const { allergenIds, ...data } = details;
    return db.offer.create({
      data: {
        ...data, quantity, remainingQuantity: quantity, pickupStartsAt, pickupEndsAt, isAvailable,
        establishmentId: venue, templateId, allergens: { create: await checkedAllergenLinks(db, allergenIds) },
      }, include: offerInclude,
    });
  });
  response.status(201).json(presentOffer(offer, emptyAllergens));
});

venueRouter.patch(`${boxes}/:id`, async (request, response) => {
  const venue = await ownedVenue(identity(request).id);
  const { id } = idParam.parse(request.params);
  const input = offerPatch.parse(request.body);
  const result = await prisma.$transaction(async (db) => {
    const previous = await lockOwnedOffer(db, id, venue);
    if (previous.archivedAt) throw new ApiError(409, 'OFFER_ARCHIVED', 'Offer is archived');
    const { allergenIds, quantity, ...changes } = input;
    const combined = { ...previous, ...changes, allergenIds: allergenIds ?? [] };
    validateItem(combined);
    const changesWindow = (changes.pickupStartsAt !== undefined && changes.pickupStartsAt.getTime() !== previous.pickupStartsAt.getTime())
      || (changes.pickupEndsAt !== undefined && changes.pickupEndsAt.getTime() !== previous.pickupEndsAt.getTime());
    const changesType = changes.type !== undefined && changes.type !== previous.type;
    if ((changesWindow || changesType) && await db.orderItem.count({ where: { offerId: id } }) > 0) {
      throw new ApiError(409, 'OFFER_HAS_ORDERS', 'Pickup window or offer type is already recorded in orders');
    }
    if ((changesWindow || quantity !== undefined || changesType) && previous.pickupEndsAt.getTime() <= Date.now()) {
      throw new ApiError(409, 'OFFER_CLOSED', 'The pickup window has ended');
    }
    if (changesWindow) validateSlot(combined.pickupStartsAt, combined.pickupEndsAt);
    const committed = previous.quantity - previous.remainingQuantity;
    if (quantity !== undefined && quantity < committed) {
      throw new ApiError(409, 'STOCK_ALREADY_COMMITTED', 'Quantity is below the amount committed to orders');
    }
    return db.offer.update({
      where: { id },
      data: {
        ...changes, quantity, remainingQuantity: quantity === undefined ? undefined : quantity - committed,
        allergens: allergenIds ? { deleteMany: {}, create: await checkedAllergenLinks(db, allergenIds) } : undefined,
      },
      include: offerInclude,
    });
  });
  response.json(presentOffer(result, emptyAllergens));
});

venueRouter.delete(`${boxes}/:id`, async (request, response) => {
  const venue = await ownedVenue(identity(request).id);
  const { id } = idParam.parse(request.params);
  await prisma.$transaction(async (db) => {
    const previous = await lockOwnedOffer(db, id, venue);
    if (!previous.archivedAt) await db.offer.update({ where: { id }, data: { archivedAt: new Date(), isAvailable: false } });
  });
  response.sendStatus(204);
});

const templates = `${venuePath}/templates`;
venueRouter.get(templates, async (request, response) => {
  const page = paging.parse(request.query);
  const venue = await ownedVenue(identity(request).id);
  const rows = await prisma.offerTemplate.findMany({
    where: { establishmentId: venue }, include: templateInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageQuery(page),
  });
  response.json(pageResult(rows.map(presentTemplate), page));
});

venueRouter.get(`${templates}/:id`, async (request, response) => {
  const venue = await ownedVenue(identity(request).id);
  const { id } = idParam.parse(request.params);
  const row = await prisma.offerTemplate.findFirst({ where: { id, establishmentId: venue }, include: templateInclude });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
  response.json(presentTemplate(row));
});

venueRouter.post(templates, async (request, response) => {
  const venue = await ownedVenue(identity(request).id);
  const input = itemFields.parse(request.body);
  validateItem(input);
  const { allergenIds, ...data } = input;
  const row = await prisma.$transaction(async (db) => db.offerTemplate.create({
    data: { ...data, establishmentId: venue, allergens: { create: await checkedAllergenLinks(db, allergenIds) } },
    include: templateInclude,
  }));
  response.status(201).json(presentTemplate(row));
});

venueRouter.patch(`${templates}/:id`, async (request, response) => {
  const venue = await ownedVenue(identity(request).id);
  const { id } = idParam.parse(request.params);
  const { allergenIds, ...changes } = itemPatch.parse(request.body);
  const row = await prisma.$transaction(async (db) => {
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "OfferTemplate"
      WHERE id = ${id}::uuid AND "establishmentId" = ${venue}::uuid FOR NO KEY UPDATE`;
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
    const previous = await db.offerTemplate.findUniqueOrThrow({ where: { id } });
    validateItem({ ...previous, ...changes, allergenIds: allergenIds ?? [] });
    return db.offerTemplate.update({
      where: { id },
      data: { ...changes, allergens: allergenIds ? { deleteMany: {}, create: await checkedAllergenLinks(db, allergenIds) } : undefined },
      include: templateInclude,
    });
  });
  response.json(presentTemplate(row));
});

venueRouter.delete(`${templates}/:id`, async (request, response) => {
  const venue = await ownedVenue(identity(request).id);
  const { id } = idParam.parse(request.params);
  const { count } = await prisma.offerTemplate.deleteMany({ where: { id, establishmentId: venue } });
  if (!count) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
  response.sendStatus(204);
});
