import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { browserOrigins } from '../config.js';
import { redis } from '../db.js';
import type { Role } from '../generated/prisma/enums.js';
import { authenticateAccess } from '../services/session.js';
import { ApiError } from './errors.js';

declare global {
  namespace Express {
    interface Request {
      auth?: Awaited<ReturnType<typeof authenticateAccess>>;
    }
  }
}

export const auth: RequestHandler = async (request, _response, next) => {
  const token = bearerToken(request);
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
  request.auth = await authenticateAccess(token);
  next();
};

export const optionalAuth: RequestHandler = (request, response, next) => {
  if (request.get('authorization')) return auth(request, response, next);
  next();
};

export function bearerToken(request: Request) {
  return /^Bearer (\S+)$/i.exec(request.get('authorization') ?? '')?.[1];
}

export function identity(request: Request) {
  if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
  return request.auth;
}

export function requireRole(role: Role): RequestHandler {
  return (request, _response, next) => {
    if (identity(request).role !== role) throw new ApiError(403, 'FORBIDDEN', 'Role is not allowed');
    next();
  };
}

export const requireBrowserOrigin: RequestHandler = (request, _response, next) => {
  const origin = request.get('origin');
  if (origin && !browserOrigins.has(origin)) {
    throw new ApiError(403, 'FORBIDDEN_ORIGIN', 'Origin is not allowed');
  }
  next();
};

export function rateLimit(action: string, limit: number, seconds: number): RequestHandler {
  return async (request, response, next) => {
    const subject = request.auth?.id ?? request.ip ?? 'unknown';
    const key = createHash('sha256').update(subject).digest('hex');
    const count = await redis.eval(
      `local count = redis.call('INCR', KEYS[1])
       if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
       return count`,
      { keys: [`auth:limit:${action}:${key}`], arguments: [String(seconds)] },
    );
    if (typeof count === 'number' && count > limit) {
      response.set('Retry-After', String(seconds));
      throw new ApiError(429, 'RATE_LIMITED', 'Too many requests');
    }
    next();
  };
}
