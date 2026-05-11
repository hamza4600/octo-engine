import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_CHAT_MODEL: z.string().min(1).optional(),
  OPENAI_SMALL_MODEL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
});

export type Env = z.infer<typeof envSchema> & {
  OPENAI_CHAT_MODEL: string;
  OPENAI_SMALL_MODEL: string;
};

function normalizeSecret(value: string): string {
  const t = value.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function loadEnv(): Env {
  const raw = { ...process.env };
  if (typeof raw.OPENAI_API_KEY === "string") {
    raw.OPENAI_API_KEY = normalizeSecret(raw.OPENAI_API_KEY);
  }
  if (typeof raw.UPSTASH_REDIS_REST_TOKEN === "string") {
    raw.UPSTASH_REDIS_REST_TOKEN = normalizeSecret(raw.UPSTASH_REDIS_REST_TOKEN);
  }

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const flat = result.error.flatten();
    const detail = JSON.stringify(flat.fieldErrors, null, 2);
    throw new Error(`Invalid environment variables:\n${detail}`);
  }
  const d = result.data;
  return {
    ...d,
    OPENAI_CHAT_MODEL: d.OPENAI_CHAT_MODEL ?? "gpt-4o",
    OPENAI_SMALL_MODEL: d.OPENAI_SMALL_MODEL ?? "gpt-4o-mini",
  };
}

/** Validated server-side env. Throws at import time if vars are missing or invalid. */
export const env = loadEnv();
