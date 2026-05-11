import { generateText } from "ai";
import { NextResponse } from "next/server";

import { modelSmall } from "@/lib/llm-provider";
import { log } from "@/lib/log";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "fail";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

async function checkLlm(): Promise<CheckStatus> {
  try {
    await generateText({
      model: modelSmall,
      prompt: "ping",
      maxOutputTokens: 1,
      abortSignal: AbortSignal.timeout(10_000),
    });
    return "ok";
  } catch (err) {
    log.error("ping.llm.fail", { err });
    return "fail";
  }
}

async function checkRedis(): Promise<CheckStatus> {
  const probeKey = `ping:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    await redis.set(probeKey, "1", { ex: 30 });
    const value = await redis.get<string>(probeKey);
    await redis.del(probeKey);
    if (String(value ?? "") !== "1") {
      log.error("ping.redis.fail", { reason: "roundtrip_mismatch", got: value });
      return "fail";
    }
    return "ok";
  } catch (err) {
    log.error("ping.redis.fail", { err });
    return "fail";
  }
}

export async function GET(): Promise<NextResponse> {
  const [llmStatus, redisStatus] = await Promise.all([checkLlm(), checkRedis()]);
  const ok = llmStatus === "ok" && redisStatus === "ok";

  const body = ok
    ? { ok, llm: llmStatus, redis: redisStatus, provider: "openai" as const }
    : { ok, llm: llmStatus, redis: redisStatus, provider: "openai" as const, code: "CONFIG" as const };

  log.info("ping", { ok, llm: llmStatus, redis: redisStatus, provider: "openai" });

  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: NO_STORE_HEADERS,
  });
}
