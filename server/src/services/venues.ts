import { prisma } from '../db.js';
import { ApiError } from '../middlewares/errors.js';

export async function ownedVenue(ownerId: string) {
  const venue = await prisma.establishment.findUnique({ where: { ownerId }, select: { id: true } });
  if (!venue) throw new ApiError(404, 'NOT_FOUND', 'Establishment not found');
  return venue.id;
}
