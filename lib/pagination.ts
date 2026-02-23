import { encodeCursor, decodeCursor, ApiError } from "./api-helpers";

export interface PaginationItem {
  _id: string;
  updatedAt: Date;
  [key: string]: unknown;
}

export interface PaginationResult<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Given a sorted list of items (already fetched as limit+1), slice to limit
 * and compute the next cursor from the last item.
 */
export function buildPaginationResult<T extends PaginationItem>(
  items: T[],
  limit: number
): PaginationResult<T> {
  if (items.length > limit) {
    const sliced = items.slice(0, limit);
    const last = sliced[sliced.length - 1];
    return {
      items: sliced,
      nextCursor: encodeCursor({
        updatedAt: last.updatedAt.toISOString(),
        _id: last._id,
      }),
    };
  }
  return { items, nextCursor: null };
}

export { encodeCursor, decodeCursor, ApiError };
