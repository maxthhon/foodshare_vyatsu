import { z } from 'zod';

function originList(value: string) {
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}

const env = z.object({
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLIENT_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PICKUP_SECRET: z.string().min(32),
  RESERVATION_TTL_MINUTES: z.coerce.number().positive().max(60).default(15),
  PLATFORM_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(18),
  CO2_KG_PER_KG: z.coerce.number().min(0).default(2.5),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
}).superRefine((value, context) => {
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
    context.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'Must differ from the access secret' });
  }
  if ([value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET].includes(value.PICKUP_SECRET)) {
    context.addIssue({ code: 'custom', path: ['PICKUP_SECRET'], message: 'Must differ from the JWT secrets' });
  }
}).safeParse(process.env);

if (!env.success) {
  const keys = env.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Invalid or missing environment variables: ${keys}`);
}

export const config = env.data;
export const corsOrigins = originList(config.CORS_ORIGINS);
export const browserOrigins = new Set([
  ...corsOrigins,
  `http://localhost:${config.CLIENT_PORT}`,
  `http://127.0.0.1:${config.CLIENT_PORT}`,
]);
