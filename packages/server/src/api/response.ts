import { v4 as uuid } from 'uuid';
import type { ApiMeta } from '@cortex/shared';

/** Current API version string. */
export const API_VERSION = '1.0.0';

/**
 * Build a standard API response metadata object.
 * Used by all REST API routes to ensure consistent response format.
 *
 * @returns ApiMeta with timestamp, version, and unique request ID
 */
export function buildMeta(): ApiMeta {
  return {
    timestamp: new Date().toISOString(),
    version: API_VERSION,
    request_id: uuid(),
  };
}

/**
 * Build a standard API response with data and metadata.
 *
 * @param data - The response payload
 * @returns Wrapped response with data and meta fields
 */
export function apiResponse<T>(data: T): { data: T; meta: ApiMeta } {
  return { data, meta: buildMeta() };
}

/**
 * Build a paginated API response with data, total count, and metadata.
 *
 * @param data - Array of response items
 * @param total - Total count of matching items
 * @returns Wrapped response with data, total, and meta fields
 */
export function paginatedResponse<T>(data: T[], total: number): { data: T[]; total: number; meta: ApiMeta } {
  return { data, total, meta: buildMeta() };
}
