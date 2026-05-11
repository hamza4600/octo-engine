import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseCitations } from "@/lib/audit/parseCitations";
import { programmaticCheck } from "@/lib/audit/programmaticCheck";
import { runAuditJudge, type JudgeResult } from "@/lib/audit/judge";
import { mergeAuditVerdict, type OverallVerdict } from "@/lib/audit/verdict";
import { log } from "@/lib/log";
import { redis } from "@/lib/redis";
import {
  findAssistantMessageText,
  getLedgerBullets,
  getSession,
  SESSION_TTL_SECONDS,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const postSchema = z.object({
  sessionId: z.string().min(1),
  messageId: z.string().min(1),
});

function auditPayloadKey(sessionId: string, messageId: string): string {
  return `audit:${sessionId}:${messageId}`;
}

function auditStatusRedisKey(sessionId: string, messageId: string): string {
  return `audit:${sessionId}:${messageId}:status`;
}

type StoredAuditComplete = {
  status: "complete";
  verdict: OverallVerdict;
  programmatic: {
    totalCitations: number;
    valid: number;
    invalid: { citation: string; reason: string }[];
  };
  judge: JudgeResult;
};

async function persistUnavailable(sessionId: string, messageId: string): Promise<void> {
  const ttl = SESSION_TTL_SECONDS;
  const payload = JSON.stringify({ status: "unavailable" as const });
  await redis.set(auditPayloadKey(sessionId, messageId), payload, { ex: ttl });
  await redis.set(auditStatusRedisKey(sessionId, messageId), "unavailable", { ex: ttl });
}

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "VALIDATION" }, { status: 400, headers: NO_STORE });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "sessionId and messageId required", code: "VALIDATION" }, { status: 400, headers: NO_STORE });
  }

  const { sessionId, messageId } = parsed.data;
  const dataKey = auditPayloadKey(sessionId, messageId);
  const statusKey = auditStatusRedisKey(sessionId, messageId);

  try {
    const existing = await redis.get<string>(dataKey);
    if (existing) {
      try {
        const obj = JSON.parse(existing) as { status?: string };
        if (obj.status === "complete" || obj.status === "unavailable") {
          return NextResponse.json({ ok: true as const, cached: true }, { status: 200, headers: NO_STORE });
        }
      } catch {
        /* fall through */
      }
    }

    await redis.set(statusKey, "pending", { ex: SESSION_TTL_SECONDS });

    const session = await getSession(sessionId);
    if (!session) {
      await persistUnavailable(sessionId, messageId);
      return NextResponse.json({ ok: false as const, reason: "SESSION_NOT_FOUND" }, { status: 200, headers: NO_STORE });
    }

    const answer = await findAssistantMessageText(sessionId, messageId);
    if (answer === null) {
      log.warn("audit.message_not_found", { sessionId, messageId });
      await persistUnavailable(sessionId, messageId);
      return NextResponse.json({ ok: false as const, reason: "MESSAGE_NOT_FOUND" }, { status: 200, headers: NO_STORE });
    }

    const citations = parseCitations(answer);
    const [progRows, ledger] = await Promise.all([
      programmaticCheck(sessionId, citations),
      getLedgerBullets(sessionId),
    ]);

    const judgePayload = {
      answer,
      programmatic: {
        totalCitations: citations.length,
        validCount: progRows.filter((r) => r.valid).length,
        rows: progRows,
      },
      resolvedSnippets: progRows
        .filter((r) => r.valid && typeof r.snippet === "string")
        .map((r) => ({ citation: r.citation, snippet: r.snippet as string })),
      ledger,
    };

    const judge = await runAuditJudge(judgePayload);
    const verdict = mergeAuditVerdict(progRows, judge);

    const body: StoredAuditComplete = {
      status: "complete",
      verdict,
      programmatic: {
        totalCitations: citations.length,
        valid: progRows.filter((r) => r.valid).length,
        invalid: progRows
          .filter((r) => !r.valid)
          .map((r) => ({
            citation: r.citation,
            reason: r.reason ?? "INVALID",
          })),
      },
      judge,
    };

    await redis.set(dataKey, JSON.stringify(body), { ex: SESSION_TTL_SECONDS });
    await redis.set(statusKey, "complete", { ex: SESSION_TTL_SECONDS });

    return NextResponse.json({ ok: true as const }, { status: 200, headers: NO_STORE });
  } catch (err) {
    log.error("audit.post_failed", { sessionId, messageId, err });
    try {
      await persistUnavailable(sessionId, messageId);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: false as const }, { status: 200, headers: NO_STORE });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const messageId = req.nextUrl.searchParams.get("messageId");
  if (!sessionId || !messageId) {
    return NextResponse.json({ error: "sessionId and messageId required", code: "VALIDATION" }, { status: 400, headers: NO_STORE });
  }

  try {
    const dataKey = auditPayloadKey(sessionId, messageId);
    const raw = await redis.get<string>(dataKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.status === "unavailable") {
        return NextResponse.json({ status: "unavailable" as const }, { status: 200, headers: NO_STORE });
      }
      if (parsed.status === "complete") {
        return NextResponse.json(parsed as StoredAuditComplete, { status: 200, headers: NO_STORE });
      }
    }

    const status = await redis.get<string>(auditStatusRedisKey(sessionId, messageId));
    if (status === "unavailable") {
      return NextResponse.json({ status: "unavailable" as const }, { status: 200, headers: NO_STORE });
    }

    return NextResponse.json({ status: "pending" as const }, { status: 200, headers: NO_STORE });
  } catch (err) {
    log.error("audit.get_failed", { sessionId, messageId, err });
    return NextResponse.json({ status: "unavailable" as const }, { status: 200, headers: NO_STORE });
  }
}
