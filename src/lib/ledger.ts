import { generateObject } from "ai";
import { z } from "zod";

import { modelSmall } from "@/lib/llm-provider";
import { log } from "@/lib/log";
import { ledgerExtractionInstructions } from "@/lib/prompts/ledger";
import { redis } from "@/lib/redis";
import { SESSION_TTL_SECONDS } from "@/lib/session";

const EXTRACT_TIMEOUT_MS = 30_000;
const LEDGER_LIST_CAP = 40;

const ledgerKey = (sessionId: string): string => `ledger:${sessionId}`;

const factsSchema = z.object({
  facts: z
    .array(
      z.object({
        fact: z.string(),
        /** Nullable (not omitted) so OpenAI JSON-schema `required` includes every key. */
        citation: z.string().nullable(),
      }),
    )
    .max(6),
});

export type LedgerFact = Readonly<{
  fact: string;
  citation?: string;
}>;

export async function extractFacts(answer: string): Promise<LedgerFact[]> {
  const trimmed = answer.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const { object } = await generateObject({
      model: modelSmall,
      schema: factsSchema,
      temperature: 0,
      system: ledgerExtractionInstructions(),
      prompt: `Answer text:\n\n${trimmed}`,
      abortSignal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    });

    return object.facts
      .map((f) => {
        const fact = f.fact.trim();
        const cite = f.citation?.trim();
        const row: LedgerFact =
          cite !== undefined && cite.length > 0 ? { fact, citation: cite } : { fact };
        return row;
      })
      .filter((f) => f.fact.length > 0);
  } catch (err) {
    log.warn("ledger.extract_failed", { err });
    return [];
  }
}

export async function appendLedger(
  sessionId: string,
  turnIndex: number,
  facts: ReadonlyArray<LedgerFact>,
): Promise<void> {
  if (facts.length === 0) {
    return;
  }

  try {
    const payloads = facts.map((f) =>
      JSON.stringify({
        turnIndex,
        fact: f.fact,
        ...(f.citation !== undefined && f.citation.length > 0 ? { citation: f.citation } : {}),
      }),
    );

    for (const p of payloads) {
      await redis.rpush(ledgerKey(sessionId), p);
    }
    await redis.ltrim(ledgerKey(sessionId), -LEDGER_LIST_CAP, -1);
    await redis.expire(ledgerKey(sessionId), SESSION_TTL_SECONDS);
  } catch (err) {
    log.warn("ledger.append_failed", { sessionId, err });
  }
}

export async function extractAndAppendLedger(sessionId: string, answer: string, turnIndex: number): Promise<void> {
  const facts = await extractFacts(answer);
  if (facts.length === 0) {
    return;
  }
  await appendLedger(sessionId, turnIndex, facts);
}
