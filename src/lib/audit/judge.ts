import { generateObject } from "ai";
import { z } from "zod";

import { modelSmall } from "@/lib/llm-provider";
import { log } from "@/lib/log";
import { judgeSystemInstructions } from "@/lib/prompts/judge";

import type { ProgrammaticRow } from "./programmaticCheck";

const JUDGE_TIMEOUT_MS = 30_000;

export const judgeOutputSchema = z.object({
  verdict: z.enum(["pass", "partial", "fail"]),
  claims: z.array(
    z.object({
      text: z.string(),
      supported: z.boolean(),
      evidence: z.string().optional(),
    }),
  ),
  risks: z.array(z.string()),
  contradictions: z.array(z.string()),
});

export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

export type JudgeUnknown = {
  verdict: "unknown";
  error?: string;
  claims: [];
  risks: string[];
  contradictions: [];
};

export type JudgeResult = JudgeOutput | JudgeUnknown;

export type JudgePayload = {
  answer: string;
  programmatic: {
    totalCitations: number;
    validCount: number;
    rows: ProgrammaticRow[];
  };
  resolvedSnippets: { citation: string; snippet: string }[];
  ledger: string[];
};

function buildUserPrompt(payload: JudgePayload): string {
  return JSON.stringify(payload, null, 2);
}

async function runJudge(promptText: string): Promise<JudgeResult> {
  try {
    const { object } = await generateObject({
      model: modelSmall,
      schema: judgeOutputSchema,
      temperature: 0,
      system: judgeSystemInstructions(),
      prompt: promptText,
      abortSignal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
    });
    return object;
  } catch (err) {
    log.warn("audit.judge.failed", { err });
    return {
      verdict: "unknown",
      error: err instanceof Error ? err.message : "judge_failed",
      claims: [],
      risks: [],
      contradictions: [],
    };
  }
}

/** Separate OpenAI call — no investigator chat history or system prompt leakage. */
export async function runAuditJudge(payload: JudgePayload): Promise<JudgeResult> {
  const promptText = buildUserPrompt(payload);
  let first = await runJudge(promptText);
  if (first.verdict !== "unknown") {
    return first;
  }
  const retryPrompt =
    promptText +
    "\n\nIMPORTANT: Output valid JSON only with keys verdict, claims, risks, contradictions. verdict must be pass|partial|fail.";
  first = await runJudge(retryPrompt);
  return first;
}
