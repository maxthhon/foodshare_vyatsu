import cors from 'cors';
import express from 'express';
import { config, corsOrigins } from './config.js';
import { prisma, redis } from './db.js';
import { errorHandler } from './middlewares/errors.js';
import { authRouter } from './routes/auth.js';
import { analyticsRouter } from './routes/analytics.js';
import { catalogRouter } from './routes/catalog.js';
import { customerRouter } from './routes/customer.js';
import { orderRouter } from './routes/orders.js';
import { profileRouter } from './routes/profile.js';
import { venueRouter } from './routes/venues.js';
import { startReservationWorker } from './services/orders.js';

const app = express();
app.disable('x-powered-by');
app.use('/api', cors({ origin: corsOrigins, credentials: true }));
app.use('/api', express.json({ limit: '16kb' }));

app.get('/api/health', async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    response.json({ status: 'ok' });
  } catch {
    response.status(503).json({ status: 'unavailable' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api', profileRouter);
app.use('/api', orderRouter);
app.use('/api', analyticsRouter);
app.use('/api', venueRouter);
app.use('/api', catalogRouter);
app.use('/api', customerRouter);
app.use('/api', (_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
});
app.use(errorHandler);

void redis.connect().catch(() => console.error('Could not start Redis client'));

const port = config.SERVER_PORT;
app.listen(port, '0.0.0.0', (error) => {
  if (error) {
    console.error('FoodShare API could not listen on port %d: %s', port, error.message);
    if (redis.isOpen) redis.destroy();
    process.exitCode = 1;
    return;
  }
  startReservationWorker();
  console.info('FoodShare API listening on port %d', port);
});
