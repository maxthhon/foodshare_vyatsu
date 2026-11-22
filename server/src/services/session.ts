import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { redis } from '../db.js';
import { Role } from '../generated/prisma/enums.js';
import { ApiError } from '../middlewares/errors.js';

const issuer = 'foodshare';
const accessTtl = 15 * 60;
export const refreshTtl = 7 * 24 * 60 * 60;
const baseClaims = z.object({ sub: z.uuid(), sid: z.uuid(), exp: z.number().int() });
const accessClaims = baseClaims.extend({ role: z.enum(Role) });
const refreshClaims = baseClaims.extend({ jti: z.uuid() });
type Identity = { id: string; role: Role };
type RefreshClaims = z.infer<typeof refreshClaims>;

function unauthorized() {
  return new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
}

function verify<T extends z.ZodType>(token: string, kind: 'access' | 'refresh', schema: T): z.infer<T> {
  const secret = kind === 'access' ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET;
  try {
    return schema.parse(jwt.verify(token, secret, {
      issuer,
      audience: `foodshare:${kind}`,
      algorithms: ['HS256'],
    }));
  } catch {
    throw unauthorized();
  }
}

function tokenPair(user: Identity, sid: string, jti: string, ttl: number) {
  const accessToken = jwt.sign({ sid, role: user.role }, config.JWT_ACCESS_SECRET, {
    algorithm: 'HS256', subject: user.id, issuer, audience: 'foodshare:access', expiresIn: Math.min(accessTtl, ttl),
  });
  const refreshToken = jwt.sign({ sid }, config.JWT_REFRESH_SECRET, {
    algorithm: 'HS256', subject: user.id, issuer, audience: 'foodshare:refresh', jwtid: jti, expiresIn: ttl,
  });
  return { accessToken, refreshToken, refreshTtl: ttl };
}

function sessionKey(sid: string) {
  return `auth:session:${sid}`;
}

export async function createSession(user: Identity) {
  const sid = randomUUID();
  const jti = randomUUID();
  const tokens = tokenPair(user, sid, jti, refreshTtl);
  await redis.set(sessionKey(sid), jti, { EX: refreshTtl });
  return tokens;
}

export async function authenticateAccess(token: string) {
  const claims = verify(token, 'access', accessClaims);
  if (!(await redis.exists(sessionKey(claims.sid)))) throw unauthorized();
  return { id: claims.sub, role: claims.role, sessionId: claims.sid };
}

export function readRefresh(token: string) {
  return verify(token, 'refresh', refreshClaims);
}

export async function rotateSession(claims: RefreshClaims, user: Identity) {
  const ttl = claims.exp - Math.floor(Date.now() / 1000);
  if (ttl <= 0) throw unauthorized();

  const nextId = randomUUID();
  const tokens = tokenPair(user, claims.sid, nextId, ttl);
  const rotated = await redis.eval(
    `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
     redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
     return 1`,
    { keys: [sessionKey(claims.sid)], arguments: [claims.jti, nextId] },
  );
  if (rotated !== 1) throw unauthorized();
  return tokens;
}

export async function revokeSession(sid: string) {
  await redis.del(sessionKey(sid));
}

export async function revokeRefreshSession(claims: RefreshClaims) {
  await redis.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
     return 0`,
    { keys: [sessionKey(claims.sid)], arguments: [claims.jti] },
  );
}
