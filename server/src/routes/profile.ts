import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Role } from '../generated/prisma/enums.js';
import { auth, identity, requireRole } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { allergenId } from '../services/catalog.js';

export const profileRouter = Router();
const profileSelect = {
  id: true, name: true, email: true, role: true,
  allergens: { select: { allergen: { select: { id: true, name: true } } }, orderBy: { allergenId: 'asc' as const } },
} as const;
const profilePatch = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  allergenIds: z.array(allergenId).max(30).optional(),
}).refine((data) => Object.keys(data).length > 0);

profileRouter.get('/me', auth, async (request, response) => {
  const user = await prisma.user.findUnique({
    where: { id: identity(request).id },
    select: profileSelect,
  });
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
  response.set('Cache-Control', 'no-store').json({
    ...user,
    allergens: user.allergens.map(({ allergen }) => allergen),
  });
});

profileRouter.patch('/me', auth, async (request, response) => {
  const account = identity(request);
  const { name, allergenIds } = profilePatch.parse(request.body);
  if (allergenIds && account.role !== Role.CUSTOMER) {
    throw new ApiError(403, 'FORBIDDEN', 'Allergen preferences are only available to customers');
  }
  const ids = allergenIds && [...new Set(allergenIds)];
  const user = await prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM "User" WHERE id = ${account.id}::uuid FOR NO KEY UPDATE`;
    if (ids && await db.allergen.count({ where: { id: { in: ids } } }) !== ids.length) {
      throw new ApiError(400, 'UNKNOWN_ALLERGEN', 'Unknown allergen');
    }
    return db.user.update({
      where: { id: account.id },
      data: { name, allergens: ids ? { deleteMany: {}, create: ids.map((id) => ({ allergenId: id })) } : undefined },
      select: profileSelect,
    });
  });
  response.set('Cache-Control', 'no-store').json({
    ...user, allergens: user.allergens.map(({ allergen }) => allergen),
  });
});

profileRouter.get('/establishments/me', auth, requireRole(Role.ESTABLISHMENT), async (request, response) => {
  const establishment = await prisma.establishment.findUnique({ where: { ownerId: identity(request).id } });
  if (!establishment) throw new ApiError(404, 'NOT_FOUND', 'Establishment not found');
  response.set('Cache-Control', 'no-store').json(establishment);
});
