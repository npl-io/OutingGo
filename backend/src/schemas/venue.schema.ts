import { z } from 'zod';

export const PAGE_SIZES: readonly number[] = [10, 20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;

const MAX_Q_LENGTH = 100;
const MAX_SORT_ITEMS = 3;
const OPEN_AT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRICE_LEVEL_LIST_PATTERN = /^[1-4](,[1-4])*$/;

export type SortField = 'name' | 'district' | 'priceLevel' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface SortItem {
  field: SortField;
  direction: SortDirection;
}

const DEFAULT_SORT: SortItem[] = [{ field: 'name', direction: 'asc' }];

// Query-string params that are present but empty ("?q=") count as absent.
function emptyToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}

function optionalParam<T extends z.ZodType>(schema: T) {
  return z.preprocess(emptyToUndefined, schema.optional());
}

const positiveIntString = z
  .string()
  .regex(/^\d+$/, 'Must be a positive integer')
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value) && value >= 1, 'Must be a positive integer');

const textParam = z.string().trim();

const sortSchema = z.string().transform((value, ctx): SortItem[] => {
  const parts = value.split(',');
  if (parts.length > MAX_SORT_ITEMS) {
    ctx.issues.push({
      code: 'custom',
      message: `At most ${MAX_SORT_ITEMS} sort fields are allowed`,
      input: value,
    });
    return z.NEVER;
  }

  const items: SortItem[] = [];
  for (const part of parts) {
    // Items look like "name" or "name:desc"; the pattern restricts both groups.
    const match = /^(name|district|priceLevel|createdAt)(?::(asc|desc))?$/.exec(part);
    if (match === null) {
      ctx.issues.push({
        code: 'custom',
        message: 'Sort items must look like "field:asc" or "field:desc"',
        input: value,
      });
      return z.NEVER;
    }
    items.push({
      field: match[1] as SortField,
      direction: (match[2] ?? 'asc') as SortDirection,
    });
  }

  if (new Set(items.map((item) => item.field)).size !== items.length) {
    ctx.issues.push({ code: 'custom', message: 'Sort fields must not repeat', input: value });
    return z.NEVER;
  }
  return items;
});

const priceLevelSchema = z
  .string()
  .regex(PRICE_LEVEL_LIST_PATTERN, 'priceLevel must be a comma-separated list of 1-4')
  .transform((value) => value.split(',').map((item) => Number(item)))
  .refine((levels) => new Set(levels).size === levels.length, 'priceLevel must not repeat');

export const venueListQuerySchema = z.object({
  q: optionalParam(
    textParam.max(MAX_Q_LENGTH).transform((value) => (value === '' ? undefined : value)),
  ),
  categoryId: optionalParam(positiveIntString),
  district: optionalParam(textParam.transform((value) => (value === '' ? undefined : value))),
  priceLevel: optionalParam(priceLevelSchema),
  openAt: optionalParam(z.string().regex(OPEN_AT_PATTERN, 'openAt must be HH:MM (24h)')),
  sort: z.preprocess(emptyToUndefined, sortSchema.default(DEFAULT_SORT)),
  page: z.preprocess(emptyToUndefined, positiveIntString.default(1)),
  pageSize: z.preprocess(
    emptyToUndefined,
    positiveIntString
      .refine((value) => PAGE_SIZES.includes(value), `pageSize must be one of ${PAGE_SIZES.join(', ')}`)
      .default(DEFAULT_PAGE_SIZE),
  ),
});

export const venueIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .refine((value) => Number.isSafeInteger(Number(value)) && Number(value) >= 1, 'id must be a positive integer'),
});

export type VenueListQuery = z.output<typeof venueListQuerySchema>;
