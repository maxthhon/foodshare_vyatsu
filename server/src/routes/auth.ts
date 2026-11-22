import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { Prisma, Role } from '../generated/prisma/client.js';
import { rateLimit, bearerToken, requireBrowserOrigin } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import {
  authenticateAccess, createSession, readRefresh, revokeRefreshSession, revokeSession, rotateSession,
} from '../services/session.js';

export const authRouter = Router();
const accountFields = { id: true, name: true, email: true, role: true } as const;
type Account = Prisma.UserGetPayload<{ select: typeof accountFields }>;
const bcryptRounds = 12;
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), bcryptRounds);
const refreshCookie = 'foodshare_refresh';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: config.COOKIE_SECURE === 'true',
  path: '/api/auth',
} as const;

const credentials = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()).refine((email) => email.length <= 254),
  password: z.string().min(1).refine((password) => Buffer.byteLength(password, 'utf8') <= 72),
});
const registration = credentials.extend({
  name: z.string().trim().min(1).max(80),
  role: z.enum(Role),
  establishmentName: z.string().trim().min(1).max(120).optional(),
}).refine((input) => input.role === Role.ESTABLISHMENT || !input.establishmentName, {
  path: ['establishmentName'],
}).refine((input) => input.password.length >= 8, { path: ['password'] });

function cookieToken(request: Request) {
  const prefix = `${refreshCookie}=`;
  return request.get('cookie')?.split(';').map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function respondWithSession(response: Response, status: number, user: Account, tokens: Awaited<ReturnType<typeof createSession>>) {
  response.cookie(refreshCookie, tokens.refreshToken, { ...cookieOptions, maxAge: tokens.refreshTtl * 1000 });
  response.status(status).json({ user, accessToken: tokens.accessToken });
}

authRouter.use(requireBrowserOrigin, (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
});

authRouter.post('/register', rateLimit('register', 20, 60), async (request, response) => {
  const { email, password, name, role, establishmentName } = registration.parse(request.body);
  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const establishment = role === Role.ESTABLISHMENT
    ? { create: { name: establishmentName ?? name } }
    : undefined;

  let user: Account;
  try {
    user = await prisma.user.create({
      data: { email, name, role, passwordHash, establishment },
      select: accountFields,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError(409, 'EMAIL_IN_USE', 'Email is already registered');
    }
    throw error;
  }

  respondWithSession(response, 201, user, await createSession(user));
});

authRouter.post('/login', rateLimit('login', 30, 60), async (request, response) => {
  const { email, password } = credentials.parse(request.body);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...accountFields, passwordHash: true },
  });
  const matches = await bcrypt.compare(password, user?.passwordHash ?? await dummyHash);
  if (!user || !matches) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');

  const { id, name, role } = user;
  const account = { id, name, email: user.email, role };
  respondWithSession(response, 200, account, await createSession(account));
});

authRouter.post('/refresh', rateLimit('refresh', 120, 60), async (request, response) => {
  const claims = readRefresh(cookieToken(request) ?? '');
  const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: accountFields });
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
  respondWithSession(response, 200, user, await rotateSession(claims, user));
});

authRouter.post('/logout', async (request, response) => {
  const refresh = cookieToken(request);
  const access = bearerToken(request);
  try {
    if (access) await revokeSession((await authenticateAccess(access)).sessionId);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
  try {
    if (refresh) await revokeRefreshSession(readRefresh(refresh));
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
  response.clearCookie(refreshCookie, cookieOptions).sendStatus(204);
});
