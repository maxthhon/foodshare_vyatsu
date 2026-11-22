import { redis } from '../db.js';

const pending = 'reservations:deadlines';
const timerKey = (id: string) => `reservations:ttl:${id}`;

export async function setReservationTimer(id: string, expiresAt: Date) {
  const deadline = expiresAt.getTime();
  const ttl = deadline - Date.now();
  if (ttl <= 0 || !redis.isReady) return;
  try {
    await redis.multi()
      .set(timerKey(id), 'reserved', { PX: ttl })
      .zAdd(pending, { score: deadline, value: id })
      .exec();
  } catch {
    console.error('Reservation timer unavailable');
  }
}

export async function clearReservationTimer(id: string) {
  if (!redis.isReady) return;
  try {
    await redis.multi().del(timerKey(id)).zRem(pending, id).exec();
  } catch {
    console.error('Reservation timer cleanup unavailable');
  }
}

export async function scheduledReservations(now: Date, limit: number) {
  if (!redis.isReady) return [];
  try {
    return await redis.zRangeByScore(pending, '-inf', now.getTime(), { LIMIT: { offset: 0, count: limit } });
  } catch {
    return [];
  }
}
