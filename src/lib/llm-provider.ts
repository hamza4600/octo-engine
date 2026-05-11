import { createOpenAI } from "@ai-sdk/openai";

import { env } from "@/lib/env";

/**
 * OpenAI Chat Completions via `@ai-sdk/openai`.
 * Use `llm.chat("model-id")` so behavior stays correct if `OPENAI_BASE_URL` points at an OpenAI-compatible host.
 */
export const llm = createOpenAI({
  name: "openai",
  apiKey: env.OPENAI_API_KEY,
  ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
});

/** Main agent (`streamText` + tools). Override with `OPENAI_CHAT_MODEL`. */
export const modelChat = llm.chat(env.OPENAI_CHAT_MODEL);

/** Judge + ledger extraction (`generateObject`). Override with `OPENAI_SMALL_MODEL`. */
export const modelSmall = llm.chat(env.OPENAI_SMALL_MODEL);
