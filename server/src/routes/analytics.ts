import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { Role } from '../generated/prisma/enums.js';
import { auth, identity, requireRole } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { ownedVenue } from '../services/venues.js';

export const analyticsRouter = Router();
const timeZone = 'Europe/Kirov';
const dayMs = 86_400_000;
const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
const period = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
type AnalyticsDay = {
  date: string; completedOrders: number; soldUnits: number; soldBoxes: number;
  grossRevenue: number; commission: number; unsoldUnits: number; unsoldBoxes: number;
};

analyticsRouter.get('/establishments/me/analytics', auth, requireRole(Role.ESTABLISHMENT), async (request, response) => {
  const input = period.parse(request.query);
  const to = input.to ?? dateFormatter.format(new Date());
  const from = input.from ?? new Date(Date.parse(to) - 6 * dayMs).toISOString().slice(0, 10);
  const span = (Date.parse(to) - Date.parse(from)) / dayMs;
  if (span < 0 || span >= 90) throw new ApiError(400, 'INVALID_PERIOD', 'Date range must cover 1 to 90 days');
  const venue = await ownedVenue(identity(request).id);
  const daily = await prisma.$queryRaw<AnalyticsDay[]>`
    WITH dates AS (
      SELECT generate_series(${from}::date, ${to}::date, '1 day'::interval)::date AS day
    ), sales AS (
      SELECT (o."completedAt" AT TIME ZONE ${timeZone})::date AS day, count(*) AS orders,
        sum(items.units) AS units, sum(items.boxes) AS boxes,
        sum(o."totalAmount") AS gross, sum(o."commissionAmount") AS commission
      FROM "Order" o LEFT JOIN LATERAL (
        SELECT sum(i.quantity) AS units, sum(i.quantity) FILTER (WHERE f.type = 'SURPRISE_BOX') AS boxes
        FROM "OrderItem" i JOIN "Offer" f ON f.id = i."offerId" WHERE i."orderId" = o.id
      ) items ON true
      WHERE o."establishmentId" = ${venue}::uuid AND o.status = 'COMPLETED'
        AND o."completedAt" >= (${from}::date::timestamp AT TIME ZONE ${timeZone})
        AND o."completedAt" < ((${to}::date + 1)::timestamp AT TIME ZONE ${timeZone})
      GROUP BY 1
    ), unsold AS (
      SELECT ("pickupEndsAt" AT TIME ZONE ${timeZone})::date AS day, sum("remainingQuantity") AS units,
        sum("remainingQuantity") FILTER (WHERE type = 'SURPRISE_BOX') AS boxes
      FROM "Offer"
      WHERE "establishmentId" = ${venue}::uuid AND "pickupEndsAt" <= now()
        AND "pickupEndsAt" >= (${from}::date::timestamp AT TIME ZONE ${timeZone})
        AND "pickupEndsAt" < ((${to}::date + 1)::timestamp AT TIME ZONE ${timeZone})
      GROUP BY 1
    )
    SELECT dates.day::text AS date, coalesce(sales.orders, 0)::float8 AS "completedOrders",
      coalesce(sales.units, 0)::float8 AS "soldUnits", coalesce(sales.boxes, 0)::float8 AS "soldBoxes",
      coalesce(sales.gross, 0)::float8 AS "grossRevenue", coalesce(sales.commission, 0)::float8 AS commission,
      coalesce(unsold.units, 0)::float8 AS "unsoldUnits", coalesce(unsold.boxes, 0)::float8 AS "unsoldBoxes"
    FROM dates LEFT JOIN sales USING (day) LEFT JOIN unsold USING (day) ORDER BY day`;
  const totals = daily.reduce((sum, day) => ({
    completedOrders: sum.completedOrders + day.completedOrders, soldUnits: sum.soldUnits + day.soldUnits,
    soldBoxes: sum.soldBoxes + day.soldBoxes, grossRevenue: sum.grossRevenue + day.grossRevenue,
    commission: sum.commission + day.commission, unsoldUnits: sum.unsoldUnits + day.unsoldUnits,
    unsoldBoxes: sum.unsoldBoxes + day.unsoldBoxes,
  }), { completedOrders: 0, soldUnits: 0, soldBoxes: 0, grossRevenue: 0, commission: 0, unsoldUnits: 0, unsoldBoxes: 0 });
  response.set('Cache-Control', 'no-store').json({
    from, to, timeZone, totals: { ...totals, netRevenue: totals.grossRevenue - totals.commission },
    daily: daily.map((day) => ({ ...day, netRevenue: day.grossRevenue - day.commission })),
  });
});

analyticsRouter.get('/me/impact', auth, requireRole(Role.CUSTOMER), async (request, response) => {
  const customer = identity(request).id;
  const [impact] = await prisma.$queryRaw<{ grams: number }[]>`
    SELECT coalesce(sum(i.quantity::bigint * i."unitWeightGrams"), 0)::float8 AS grams
    FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
    WHERE o."customerId" = ${customer}::uuid AND o.status = 'COMPLETED'`;
  const savedKg = impact.grams / 1000;
  response.set('Cache-Control', 'no-store').json({
    savedKg, estimatedCo2Kg: Math.round(savedKg * config.CO2_KG_PER_KG * 100) / 100, co2Factor: config.CO2_KG_PER_KG,
  });
});
