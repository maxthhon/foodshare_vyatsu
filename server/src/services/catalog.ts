import { z } from 'zod';
import { prisma } from '../db.js';
import { EstablishmentCategory, EstablishmentStatus, OfferCategory, OfferType, Prisma } from '../generated/prisma/client.js';
import { pageQuery, paging } from '../http.js';

const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);
export const allergenId = z.string().regex(/^[a-z][a-z0-9_-]{0,49}$/);
const excludedAllergens = z.string().max(500).transform((value) => value.split(',').map((tag) => tag.trim()).filter(Boolean))
  .pipe(z.array(allergenId).max(30));
const catalogFields = paging.extend({
  q: z.string().trim().min(1).max(120).optional(),
  type: z.enum(OfferType).optional(),
  category: z.enum(OfferCategory).optional(),
  establishmentCategory: z.enum(EstablishmentCategory).optional(),
  establishmentId: z.uuid().optional(),
  minPrice: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
  maxPrice: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
  lat: latitude.optional(),
  lng: longitude.optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  excludeAllergens: excludedAllergens.optional(),
});
type CatalogFields = z.infer<typeof catalogFields>;
type Bounds = { north?: number; south?: number; west?: number; east?: number };

function validateCatalog(query: CatalogFields, context: z.RefinementCtx) {
  if ((query.lat === undefined) !== (query.lng === undefined) || (query.radiusKm !== undefined && query.lat === undefined)) {
    context.addIssue({ code: 'custom', path: ['lat', 'lng'], message: 'Latitude and longitude are required together' });
  }
  if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
    context.addIssue({ code: 'custom', path: ['maxPrice'], message: 'Maximum price must be at least the minimum price' });
  }
}

export const catalogQuery = catalogFields.superRefine(validateCatalog);
export const mapQuery = catalogFields.extend({
  north: latitude.optional(), south: latitude.optional(), west: longitude.optional(), east: longitude.optional(),
}).superRefine((query, context) => {
  validateCatalog(query, context);
  const bounds = [query.north, query.south, query.west, query.east];
  if (bounds.some((value) => value !== undefined) && (bounds.some((value) => value === undefined) || query.north! <= query.south!)) {
    context.addIssue({ code: 'custom', path: ['north', 'south', 'west', 'east'], message: 'Invalid map bounds' });
  }
});

export const publicEstablishment = {
  id: true, name: true, description: true, logoUrl: true, address: true, latitude: true, longitude: true,
  publicPhone: true, publicEmail: true, businessHours: true, categories: true, deliveryEnabled: true,
} satisfies Prisma.EstablishmentSelect;
export const offerInclude = {
  establishment: { select: publicEstablishment },
  allergens: { select: { allergen: { select: { id: true, name: true } } }, orderBy: { allergenId: 'asc' } },
} satisfies Prisma.OfferInclude;

export function availableOffers(now = new Date()): Prisma.OfferWhereInput {
  return {
    isAvailable: true, archivedAt: null, remainingQuantity: { gt: 0 }, pickupEndsAt: { gt: now },
    establishment: { status: EstablishmentStatus.ACTIVE },
  };
}

export async function userAllergens(userId?: string) {
  if (!userId) return new Set<string>();
  const allergies = await prisma.userAllergen.findMany({ where: { userId }, select: { allergenId: true } });
  return new Set(allergies.map(({ allergenId }) => allergenId));
}

export function presentOffer(
  { allergens: links, ...offer }: Prisma.OfferGetPayload<{ include: typeof offerInclude }>,
  profile: Set<string>,
  distanceKm: number | null = null,
) {
  const allergens = links.map(({ allergen }) => allergen);
  return {
    ...offer, allergens, distanceKm,
    discountPercent: Math.round((offer.originalPrice - offer.price) * 100 / offer.originalPrice),
    containsUserAllergens: allergens.some((allergen) => profile.has(allergen.id)),
  };
}

function distanceExpression(query: CatalogFields) {
  if (query.lat === undefined || query.lng === undefined) return Prisma.sql`NULL::float8`;
  return Prisma.sql`12742.0176 * asin(least(1.0, sqrt(
    power(sin(radians(e.latitude - ${query.lat}::float8) / 2), 2) +
    cos(radians(${query.lat}::float8)) * cos(radians(e.latitude)) *
    power(sin(radians(e.longitude - ${query.lng}::float8) / 2), 2)
  )))`;
}

function conditions(query: CatalogFields & Bounds, map: boolean) {
  const filters: Prisma.Sql[] = [
    Prisma.sql`o."isAvailable" AND o."archivedAt" IS NULL AND o."remainingQuantity" > 0
      AND o."pickupEndsAt" > now() AND e.status = 'ACTIVE'`,
  ];
  if (map || query.lat !== undefined) filters.push(Prisma.sql`e.latitude IS NOT NULL AND e.longitude IS NOT NULL`);
  if (query.lat !== undefined) {
    const latitudeSpan = (query.radiusKm ?? 10) / 110;
    filters.push(Prisma.sql`e.latitude BETWEEN ${query.lat - latitudeSpan} AND ${query.lat + latitudeSpan}`);
  }
  if (query.north !== undefined && query.south !== undefined && query.west !== undefined && query.east !== undefined) {
    filters.push(Prisma.sql`e.latitude BETWEEN ${query.south} AND ${query.north}`);
    filters.push(query.west <= query.east
      ? Prisma.sql`e.longitude BETWEEN ${query.west} AND ${query.east}`
      : Prisma.sql`(e.longitude >= ${query.west} OR e.longitude <= ${query.east})`);
  }
  if (query.establishmentId) filters.push(Prisma.sql`e.id = ${query.establishmentId}::uuid`);
  if (query.establishmentCategory) {
    filters.push(Prisma.sql`${query.establishmentCategory}::"EstablishmentCategory" = ANY(e.categories)`);
  }
  if (query.type) filters.push(Prisma.sql`o.type = ${query.type}::"OfferType"`);
  if (query.category) filters.push(Prisma.sql`o.category = ${query.category}::"OfferCategory"`);
  if (query.minPrice !== undefined) filters.push(Prisma.sql`o.price >= ${query.minPrice}`);
  if (query.maxPrice !== undefined) filters.push(Prisma.sql`o.price <= ${query.maxPrice}`);
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
    filters.push(Prisma.sql`(o.name ILIKE ${pattern} OR o.description ILIKE ${pattern} OR e.name ILIKE ${pattern})`);
  }
  if (query.excludeAllergens?.length) {
    filters.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "OfferAllergen" a WHERE a."offerId" = o.id AND a."allergenId" IN (${Prisma.join(query.excludeAllergens)})
    )`);
  }
  return Prisma.join(filters, ' AND ');
}

const radiusCondition = (query: CatalogFields) => query.lat === undefined
  ? Prisma.empty
  : Prisma.sql`WHERE distance <= ${query.radiusKm ?? 10}`;

export async function findCatalog(query: CatalogFields, userId?: string) {
  const { skip, take } = pageQuery(query);
  const [rows, profile] = await Promise.all([
    prisma.$queryRaw<{ id: string; distance: number | null }[]>`
      SELECT id, distance FROM (
        SELECT o.id, o."pickupEndsAt", ${distanceExpression(query)} AS distance
        FROM "Offer" o JOIN "Establishment" e ON e.id = o."establishmentId"
        WHERE ${conditions(query, false)}
      ) matching ${radiusCondition(query)}
      ORDER BY distance NULLS LAST, "pickupEndsAt", id
      LIMIT ${take} OFFSET ${skip}`,
    userAllergens(userId),
  ]);
  const offers = await prisma.offer.findMany({
    where: { id: { in: rows.map(({ id }) => id) }, ...availableOffers() }, include: offerInclude,
  });
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  return rows.flatMap(({ id, distance }) => {
    const offer = byId.get(id);
    return offer ? [presentOffer(offer, profile, distance)] : [];
  });
}

type MapPoint = {
  id: string; name: string; address: string | null; latitude: number; longitude: number;
  availableOffers: number; minPrice: number; distanceKm: number | null;
};
export function findMapPoints(query: CatalogFields & Bounds) {
  const { skip, take } = pageQuery(query);
  return prisma.$queryRaw<MapPoint[]>`
    SELECT id, name, address, latitude, longitude, "availableOffers", "minPrice", distance AS "distanceKm"
    FROM (
      SELECT e.id, e.name, e.address, e.latitude, e.longitude,
        count(*)::int AS "availableOffers", min(o.price) AS "minPrice", ${distanceExpression(query)} AS distance
      FROM "Offer" o JOIN "Establishment" e ON e.id = o."establishmentId"
      WHERE ${conditions(query, true)}
      GROUP BY e.id
    ) matching ${radiusCondition(query)}
    ORDER BY distance NULLS LAST, name, id
    LIMIT ${take} OFFSET ${skip}`;
}
