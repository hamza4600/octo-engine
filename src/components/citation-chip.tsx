"use client";

import type { Components } from "react-markdown";
import * as React from "react";

import { FileViewerSheet } from "@/components/file-viewer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parsePathAndLines, type ParsedCitation } from "@/lib/audit/parseCitations";

export type CitationChipProps = Readonly<{
  sessionId: string;
  citation: ParsedCitation;
}>;

export function CitationChip({ sessionId, citation }: CitationChipProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        className="inline align-baseline mx-0.5"
        onClick={() => setOpen(true)}
        title="Open file at cited lines"
      >
        <Badge
          variant="outline"
          className={cn(
            "cursor-pointer rounded px-1.5 py-0 font-mono text-[0.8em] font-normal",
            "border-primary/40 bg-primary/5 hover:bg-primary/10",
          )}
        >
          {citation.raw}
        </Badge>
      </button>
      <FileViewerSheet
        open={open}
        onOpenChange={setOpen}
        sessionId={sessionId}
        path={citation.path}
        highlightStart={citation.startLine}
        highlightEnd={citation.endLine}
      />
    </>
  );
}

/** Inline-only `code`: citation pattern → chip; fenced blocks keep normal `<code className=…>`. */
export function citationMarkdownComponents(sessionId: string): Partial<Components> {
  return {
    code: ({ className, children, ...props }) => {
      const text = String(children).replace(/\n$/, "");
      const isBlock = Boolean(className);
      if (!isBlock) {
        const cit = parsePathAndLines(text);
        if (cit) {
          return <CitationChip sessionId={sessionId} citation={cit} />;
        }
      }
      return (
        <code
          className={cn(
            "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] [pre>&]:bg-transparent [pre>&]:p-0",
            className,
          )}
          {...props}
        >
          {children}
        </code>
      );
    },
  };
}
