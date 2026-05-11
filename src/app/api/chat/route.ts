import {
  convertToModelMessages,
  generateId,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  type UIMessage,
  UI_MESSAGE_STREAM_HEADERS,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestOrigin } from "@/lib/get-request-origin";
import { extractAndAppendLedger } from "@/lib/ledger";
import { modelChat } from "@/lib/llm-provider";
import { log } from "@/lib/log";
import { buildAgentSystemPrompt } from "@/lib/prompts/system";
import { appendAssistantMessage, ensureSessionRepo, getLedgerBullets, getMessagesCount, getSession, uiAssistantPlainText } from "@/lib/session";
import { RepoError } from "@/lib/errors";
import { createInvestigatorTools } from "@/lib/tools/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" } as const;

const bodySchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(z.unknown()),
});

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "VALIDATION" }, { status: 400, headers: NO_STORE });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "sessionId and messages are required", code: "VALIDATION" },
      { status: 400, headers: NO_STORE },
    );
  }

  const { sessionId, messages: rawMessages } = parsed.data;

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found", code: "SESSION_NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }

  try {
    await ensureSessionRepo(session);
  } catch (err) {
    const code = err instanceof RepoError ? err.code : "REPO_MISSING";
    log.error("chat.repo_unavailable", { sessionId, code, err });
    return NextResponse.json(
      { error: "Repository files are unavailable. Paste the GitHub URL again to re-create the session.", code },
      { status: 503, headers: NO_STORE },
    );
  }

  const tools = createInvestigatorTools(sessionId);

  const validated = await safeValidateUIMessages({
    messages: rawMessages,
  });

  if (!validated.success) {
    log.warn("chat.messages_invalid", { sessionId, err: validated.error.message });
    return NextResponse.json(
      { error: validated.error.message, code: "VALIDATION" },
      { status: 400, headers: NO_STORE },
    );
  }

  const uiMessages = validated.data;

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(uiMessages, { tools });
  } catch (err) {
    log.error("chat.convert_messages_failed", { sessionId, err });
    return NextResponse.json(
      { error: "Could not convert messages for the model", code: "VALIDATION" },
      { status: 400, headers: NO_STORE },
    );
  }

  const ledgerBullets = await getLedgerBullets(sessionId);
  const system = buildAgentSystemPrompt(session.summary, ledgerBullets);

  try {
    const result = streamText({
      model: modelChat,
      system,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(12),
      maxRetries: 1,
      timeout: 90_000,
      onStepFinish: ({ finishReason, usage, stepNumber }) => {
        log.info("chat.step_finish", {
          sessionId,
          stepNumber,
          finishReason,
          usage,
        });
      },
    });

    const streamHeaders = new Headers(UI_MESSAGE_STREAM_HEADERS);
    streamHeaders.set("Cache-Control", "no-store");

    return result.toUIMessageStreamResponse({
      originalMessages: uiMessages as UIMessage[],
      generateMessageId: generateId,
      headers: Object.fromEntries(streamHeaders.entries()),
      onError: (error: unknown) => {
        log.error("chat.stream_error", { sessionId, err: error });
        return "The assistant hit an error. Try again.";
      },
      onFinish: async ({ responseMessage }) => {
        let persisted = false;
        try {
          await appendAssistantMessage(sessionId, responseMessage);
          persisted = true;
        } catch (err) {
          log.error("chat.persist_assistant_failed", { sessionId, err });
        }
        if (persisted) {
          const turnIndex = await getMessagesCount(sessionId);
          const text = uiAssistantPlainText(responseMessage);
          void extractAndAppendLedger(sessionId, text, turnIndex).catch(() => undefined);
          const origin = getRequestOrigin(req);
          void fetch(`${origin}/api/audit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              messageId: responseMessage.id,
            }),
          }).catch(() => undefined);
        }
      },
    });
  } catch (err) {
    log.error("chat.llm_start_failed", { sessionId, err });
    return NextResponse.json({ error: "Assistant failed to start", code: "LLM_UPSTREAM" }, { status: 502, headers: NO_STORE });
  }
}
