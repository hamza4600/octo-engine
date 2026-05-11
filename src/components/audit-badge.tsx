"use client";

import { Loader2Icon } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";

import { AuditDetailSheet, type AuditDetailPayload } from "@/components/audit-detail-sheet";
import {
  auditUnavailableBadgeLabel,
  auditUnavailableBadgeTitle,
} from "@/lib/audit-unavailable-copy";

const POLL_MS = 1000;
const MAX_POLLS = 15;

function badgeClass(phase: "pending" | "complete" | "unavailable", verdict?: string): string {
  if (phase === "pending") {
    return "bg-muted text-muted-foreground border-transparent";
  }
  if (phase === "unavailable") {
    return "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-400/40";
  }
  switch (verdict) {
    case "pass":
      return "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 border-emerald-600/40";
    case "partial":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/40";
    case "fail":
      return "bg-red-600/15 text-red-800 dark:text-red-200 border-red-600/40";
    case "unknown":
      return "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-400/40";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function badgeLabel(
  phase: "pending" | "complete" | "unavailable",
  verdict?: string,
  unavailableReason?: string,
): string {
  if (phase === "pending") return "Audit · pending";
  if (phase === "unavailable") return auditUnavailableBadgeLabel(unavailableReason);
  return `Audit · ${verdict ?? "done"}`;
}

export type AuditBadgeProps = Readonly<{
  sessionId: string;
  messageId: string;
}>;

export function AuditBadge({ sessionId, messageId }: AuditBadgeProps): React.ReactElement {
  const [phase, setPhase] = React.useState<"pending" | "complete" | "unavailable">("pending");
  const [payload, setPayload] = React.useState<AuditDetailPayload | null>(null);
  const [unavailableReason, setUnavailableReason] = React.useState<string | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    setPhase("pending");
    setPayload(null);
    setUnavailableReason(undefined);

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch(
          `/api/audit?sessionId=${encodeURIComponent(sessionId)}&messageId=${encodeURIComponent(messageId)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        if (json.status === "complete") {
          setUnavailableReason(undefined);
          setPayload(json as AuditDetailPayload);
          setPhase("complete");
          return;
        }
        if (json.status === "unavailable") {
          const r = json.reason;
          setUnavailableReason(typeof r === "string" ? r : undefined);
          setPhase("unavailable");
          return;
        }
      } catch {
        if (!cancelled) {
          setUnavailableReason("CLIENT_FETCH_ERROR");
          setPhase("unavailable");
        }
        return;
      }
      if (!cancelled && attempts < MAX_POLLS) {
        window.setTimeout(() => void tick(), POLL_MS);
      } else if (!cancelled && attempts >= MAX_POLLS) {
        setUnavailableReason("POLL_TIMEOUT");
        setPhase("unavailable");
      }
    };

    void tick();

    return () => {
      cancelled = true;
    };
  }, [sessionId, messageId]);

  const verdict = payload?.verdict;

  const unavailableTitle = phase === "unavailable" ? auditUnavailableBadgeTitle(unavailableReason) : undefined;

  return (
    <>
      <button
        type="button"
        className="mt-2 inline-flex"
        title={unavailableTitle}
        onClick={() => setSheetOpen(true)}
      >
        <Badge
          variant="outline"
          className={`cursor-pointer font-normal inline-flex items-center gap-1 ${badgeClass(phase, verdict)}`}
        >
          {phase === "pending" ? (
            <Loader2Icon className="size-3 animate-spin shrink-0" aria-hidden />
          ) : null}
          {badgeLabel(phase, verdict, unavailableReason)}
        </Badge>
      </button>
      <AuditDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        data={payload}
        badgePhase={phase}
        unavailableReason={unavailableReason}
      />
    </>
  );
}
