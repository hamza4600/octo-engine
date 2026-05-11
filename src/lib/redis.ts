import { Redis } from "@upstash/redis";

import { env } from "./env";

/**
 * Upstash Redis client singleton.
 *
 * Module-level so we share a single client across route handlers and
 * Vercel keeps it warm between invocations on the same instance.
 * Server-only — never import from a client component.
 */
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});
