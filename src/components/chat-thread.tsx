"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isReasoningUIPart, isTextUIPart } from "ai";
import { Loader2Icon, SendHorizontalIcon } from "lucide-react";
import * as React from "react";
import Markdown from "react-markdown";

import { AuditBadge } from "@/components/audit-badge";
import { citationMarkdownComponents } from "@/components/citation-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToolCallChip } from "@/components/tool-call-chip";
import { friendlyErrorForCode } from "@/lib/client-errors";

import { toast } from "sonner";

export type ChatThreadProps = Readonly<{
  sessionId: string;
  repoLabel: string | null;
}>;

function isToolLikePart(part: unknown): boolean {
  if (typeof part !== "object" || part === null || !("type" in part)) return false;
  const t = String((part as { type: string }).type);
  return t === "dynamic-tool" || t.startsWith("tool-");
}

async function parseChatErrorResponse(res: Response): Promise<{ message: string; code?: string } | null> {
  try {
    const data = (await res.json()) as { error?: string; code?: string };
    if (typeof data.error === "string") {
      return data.code !== undefined
        ? { message: data.error, code: data.code }
        : { message: data.error };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function ChatThread({ sessionId, repoLabel }: ChatThreadProps): React.ReactElement {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const mdComponents = React.useMemo(() => citationMarkdownComponents(sessionId), [sessionId]);

  const { messages, sendMessage, status, error } = useChat({
    id: sessionId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
          const parsed = await parseChatErrorResponse(res.clone());
          const msg = parsed ? friendlyErrorForCode(parsed.code) : friendlyErrorForCode(undefined);
          toast.error(msg);
        }
        return res;
      },
    }),
    onError: () => {
      toast.error(friendlyErrorForCode(undefined));
    },
  });

  React.useEffect(() => {
    if (error) {
      toast.error(friendlyErrorForCode(undefined));
    }
  }, [error]);

  const busy = status === "submitted" || status === "streaming";

  return (
    <Card className="flex flex-1 flex-col min-h-[420px] overflow-hidden border-border">
      <div className="border-b px-4 py-2 text-sm text-muted-foreground">
        {repoLabel ? (
          <span>
            Investigating <span className="font-medium text-foreground">{repoLabel}</span>
          </span>
        ) : (
          "Investigating repository"
        )}
      </div>

      <ScrollArea className="flex-1 min-h-[280px] px-4 py-3">
        <div className="flex flex-col gap-4">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              {m.role === "user" ? (
                <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground text-sm">
                  <div className="flex flex-wrap gap-1.5 mb-2 empty:hidden">
                    {m.parts?.map((part, i) =>
                      isToolLikePart(part) ? <ToolCallChip key={`${m.id}-tool-${i}`} part={part} /> : null,
                    )}
                  </div>
                  <div className="max-w-none space-y-2 break-words text-sm [&_p]:my-1 [&_pre]:overflow-x-auto [&_pre]:text-xs">
                    {m.parts?.map((part, i) =>
                      isTextUIPart(part) ? (
                        <Markdown components={mdComponents} key={`${m.id}-txt-${i}`}>
                          {part.text}
                        </Markdown>
                      ) : isReasoningUIPart(part) ? (
                        <pre key={`${m.id}-reason-${i}`} className="text-muted-foreground whitespace-pre-wrap text-xs">
                          {part.text}
                        </pre>
                      ) : null,
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex max-w-[92%] flex-col items-start gap-1">
                  <div className="w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <div className="flex flex-wrap gap-1.5 mb-2 empty:hidden">
                      {m.parts?.map((part, i) =>
                        isToolLikePart(part) ? <ToolCallChip key={`${m.id}-tool-${i}`} part={part} /> : null,
                      )}
                    </div>
                    <div className="max-w-none space-y-2 break-words text-sm [&_p]:my-1 [&_pre]:overflow-x-auto [&_pre]:text-xs">
                      {m.parts?.map((part, i) =>
                        isTextUIPart(part) ? (
                          <Markdown components={mdComponents} key={`${m.id}-txt-${i}`}>
                            {part.text}
                          </Markdown>
                        ) : isReasoningUIPart(part) ? (
                          <pre
                            key={`${m.id}-reason-${i}`}
                            className="text-muted-foreground whitespace-pre-wrap text-xs"
                          >
                            {part.text}
                          </pre>
                        ) : null,
                      )}
                    </div>
                  </div>
                  <AuditBadge sessionId={sessionId} messageId={m.id} />
                </div>
              )}
            </div>
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Loader2Icon className="size-3.5 animate-spin shrink-0" aria-hidden />
              <span>{status === "submitted" ? "Thinking…" : "Running tools or streaming answer…"}</span>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const el = inputRef.current;
          const text = el?.value.trim();
          if (!text || busy) return;
          void sendMessage({ text });
          if (el) el.value = "";
        }}
      >
        <Input ref={inputRef} placeholder="Ask about this repository…" disabled={busy} className="flex-1" />
        <Button type="submit" disabled={busy}>
          <SendHorizontalIcon className="size-4" />
          Send
        </Button>
      </form>
    </Card>
  );
}
