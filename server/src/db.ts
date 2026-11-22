import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from 'redis';
import { config } from './config.js';
import { PrismaClient } from './generated/prisma/client.js';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 3000 }),
});
export const redis = createClient({ url: config.REDIS_URL, disableOfflineQueue: true });
redis.on('error', () => console.error('Redis connection error'));
