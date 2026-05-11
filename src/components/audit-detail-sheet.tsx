"use client";

import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { auditUnavailableHelp } from "@/lib/audit-unavailable-copy";

/** Mirrors `GET /api/audit` successful payload — kept UI-local to avoid bundling server audit modules. */
export type AuditDetailPayload = {
  status: "complete";
  verdict: string;
  programmatic: {
    totalCitations: number;
    valid: number;
    invalid: { citation: string; reason: string }[];
  };
  judge: {
    verdict: string;
    error?: string;
    claims?: { text: string; supported: boolean; evidence?: string }[];
    risks?: string[];
    contradictions?: string[];
  };
};

export type AuditDetailSheetProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AuditDetailPayload | null;
  /** Drives empty / error copy when `data` is null. */
  badgePhase?: "pending" | "complete" | "unavailable";
  /** Server or client reason when `badgePhase` is `unavailable`. */
  unavailableReason: string | undefined;
}>;

export function AuditDetailSheet({
  open,
  onOpenChange,
  data,
  badgePhase,
  unavailableReason,
}: AuditDetailSheetProps): React.ReactElement {
  const unavailableCopy = badgePhase === "unavailable" ? auditUnavailableHelp(unavailableReason) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Audit detail</SheetTitle>
          <SheetDescription>
            Programmatic citation checks plus an independent model review (no investigator prompt reuse).
          </SheetDescription>
        </SheetHeader>

        {data ? (
          <ScrollArea className="h-[calc(100vh-8rem)] px-4 pb-6">
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-foreground">Overall</p>
                <p className="text-muted-foreground capitalize">{data.verdict}</p>
              </div>

              <Separator />

              <div>
                <p className="font-medium text-foreground">Programmatic</p>
                <p className="text-muted-foreground">
                  {data.programmatic.valid}/{data.programmatic.totalCitations} citations verified
                </p>
                {data.programmatic.invalid.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    {data.programmatic.invalid.map((inv) => (
                      <li key={inv.citation}>
                        <span className="font-mono text-xs">{inv.citation}</span> — {inv.reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">All cited ranges resolved to files.</p>
                )}
              </div>

              <Separator />

              <div>
                <p className="font-medium text-foreground">Judge ({data.judge.verdict})</p>
                {data.judge.error ? (
                  <p className="text-muted-foreground text-xs mt-1">{data.judge.error}</p>
                ) : null}

                {data.judge.claims && data.judge.claims.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {data.judge.claims.map((cl, i) => (
                      <li key={i} className="rounded-md border bg-muted/30 p-2">
                        <p>{cl.text}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {cl.supported ? "Supported" : "Unsupported"}
                          {cl.evidence ? ` · ${cl.evidence}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {data.judge.risks && data.judge.risks.length > 0 ? (
                  <div className="mt-3">
                    <p className="font-medium text-foreground">Risks</p>
                    <ul className="list-disc pl-4 text-muted-foreground">
                      {data.judge.risks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {data.judge.contradictions && data.judge.contradictions.length > 0 ? (
                  <div className="mt-3">
                    <p className="font-medium text-foreground">Contradictions vs ledger</p>
                    <ul className="list-disc pl-4 text-muted-foreground">
                      {data.judge.contradictions.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </ScrollArea>
        ) : badgePhase === "unavailable" && unavailableCopy ? (
          <ScrollArea className="h-[calc(100vh-8rem)] px-4 pb-6">
            <div className="space-y-3 text-sm">
              <p className="font-medium text-foreground">{unavailableCopy.headline}</p>
              <p className="text-muted-foreground">Try the following:</p>
              <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
                {unavailableCopy.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </ScrollArea>
        ) : badgePhase === "pending" ? (
          <p className="text-sm text-muted-foreground px-4">Audit is still running. Close and check again in a moment.</p>
        ) : (
          <p className="text-sm text-muted-foreground px-4">No audit data loaded.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
