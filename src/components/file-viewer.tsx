"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type FileLine = Readonly<{ n: number; text: string }>;

export type FileViewerSheetProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  path: string;
  highlightStart: number;
  highlightEnd: number;
}>;

export function FileViewerSheet({
  open,
  onOpenChange,
  sessionId,
  path,
  highlightStart,
  highlightEnd,
}: FileViewerSheetProps): React.ReactElement {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<FileLine[]>([]);
  const [truncated, setTruncated] = React.useState(false);

  const lo = Math.min(highlightStart, highlightEnd);
  const hi = Math.max(highlightStart, highlightEnd);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      const q = new URLSearchParams({
        sessionId,
        path,
        start: String(lo),
        end: String(hi),
      });
      try {
        const res = await fetch(`/api/file?${q.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as {
          error?: string;
          lines?: FileLine[];
          truncated?: boolean;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof json.error === "string" ? json.error : "Could not load file");
          setLines([]);
          return;
        }
        setLines(Array.isArray(json.lines) ? json.lines : []);
        setTruncated(Boolean(json.truncated));
      } catch {
        if (!cancelled) {
          setError("Network error loading file");
          setLines([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sessionId, path, lo, hi]);

  const highlightRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open || loading || lines.length === 0) return;
    const el = highlightRef.current?.querySelector<HTMLElement>(`[data-line-n="${lo}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [open, loading, lines, lo]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl flex flex-col w-full">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm break-all pr-8">{path}</SheetTitle>
          <SheetDescription>
            Lines {lo}
            {hi !== lo ? `–${hi}` : ""} (highlighted). Source from the cloned workspace for this session.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col min-h-0 px-4 pb-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading file…
            </div>
          ) : error ? (
            <div
              className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-center text-sm"
              role="alert"
            >
              <AlertCircleIcon className="size-5 text-destructive" />
              <p className="text-destructive">{error}</p>
              <p className="text-muted-foreground text-xs">The citation may be invalid or the path is outside the repo.</p>
            </div>
          ) : (
            <ScrollArea className="h-[min(70vh,560px)] rounded-md border bg-muted/30">
              <div ref={highlightRef} className="p-3 font-mono text-xs leading-relaxed">
                {lines.map((row) => (
                  <div
                    key={row.n}
                    data-line-n={row.n}
                    className={cn(
                      "flex gap-3 border-b border-border/40 py-0.5 pr-2 last:border-b-0",
                      row.n >= lo && row.n <= hi && "bg-primary/15 rounded-sm",
                    )}
                  >
                    <span className="w-10 shrink-0 select-none text-right text-muted-foreground tabular-nums">
                      {row.n}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-foreground">{row.text}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          {truncated && !error && !loading ? (
            <p className="mt-2 text-xs text-muted-foreground">Output truncated to the read cap (see tool limits).</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
