import { z } from 'zod';

export const idParam = z.object({ id: z.uuid() });
export const paging = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type Page = z.infer<typeof paging>;

export function pageResult<T>(rows: T[], page: Page) {
  return { items: rows.slice(0, page.limit), page: page.page, limit: page.limit, hasMore: rows.length > page.limit };
}

export function pageQuery(page: Page) {
  return { skip: (page.page - 1) * page.limit, take: page.limit + 1 };
}

export const idempotencyKey = z.string().trim().min(1).max(128).regex(/^[\x21-\x7e]+$/);
