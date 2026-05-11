"use client";

import { Loader2Icon } from "lucide-react";
import type { ReactElement } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function summarizeArgs(tool: string, input: unknown): string {
  if (input === undefined || input === null) {
    return `${tool}()`;
  }
  if (typeof input !== "object") {
    return `${tool}(${String(input)})`;
  }
  const o = input as Record<string, unknown>;
  switch (tool) {
    case "grep":
      return `grep(${JSON.stringify(o.pattern ?? "")}${o.pathGlob ? `, glob=${JSON.stringify(o.pathGlob)}` : ""})`;
    case "read_file": {
      const p = String(o.path ?? "");
      if (typeof o.startLine === "number" && typeof o.endLine === "number") {
        return `read ${p}:${o.startLine}-${o.endLine}`;
      }
      if (typeof o.startLine === "number") {
        return `read ${p}:${o.startLine}-`;
      }
      return `read ${p}`;
    }
    case "list_directory":
      return `list_directory(${JSON.stringify(o.path ?? ".")})`;
    case "find_files":
      return `find_files(${JSON.stringify(o.glob ?? "")})`;
    default:
      return `${tool}(${JSON.stringify(input)})`;
  }
}

function toolIsRunning(part: Record<string, unknown>): boolean {
  const s = part.state;
  if (typeof s !== "string") {
    return false;
  }
  return (
    s === "input-streaming" ||
    s === "input-available" ||
    s === "partial-call" ||
    s === "streaming"
  );
}

function extractInput(part: Record<string, unknown>): unknown {
  if ("input" in part) {
    return part.input;
  }
  return undefined;
}

/** Renders a compact label for AI SDK UI tool parts (`tool-*` or `dynamic-tool`). */
export function ToolCallChip({ part }: Readonly<{ part: unknown }>): ReactElement {
  if (typeof part !== "object" || part === null || !("type" in part)) {
    return (
      <Badge variant="outline" className="font-mono text-xs font-normal">
        tool
      </Badge>
    );
  }

  const p = part as Record<string, unknown>;
  const typ = String(p.type);

  if (typ === "dynamic-tool" && typeof p.toolName === "string") {
    const label = summarizeArgs(p.toolName, extractInput(p));
    const running = toolIsRunning(p);
    return (
      <Badge
        variant="secondary"
        className={cn("inline-flex items-center font-mono text-xs font-normal gap-1", running && "opacity-90")}
      >
        {running ? <Loader2Icon className="size-3 animate-spin shrink-0" aria-hidden /> : null}
        {label}
      </Badge>
    );
  }

  if (typ.startsWith("tool-")) {
    const tool = typ.slice("tool-".length);
    const label = summarizeArgs(tool, extractInput(p));
    const running = toolIsRunning(p);
    return (
      <Badge
        variant="secondary"
        className={cn("inline-flex items-center font-mono text-xs font-normal gap-1", running && "opacity-90")}
      >
        {running ? <Loader2Icon className="size-3 animate-spin shrink-0" aria-hidden /> : null}
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="font-mono text-xs font-normal">
      tool
    </Badge>
  );
}
