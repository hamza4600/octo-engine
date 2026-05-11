import type { JudgeResult } from "./judge";
import type { ProgrammaticRow } from "./programmaticCheck";

export type OverallVerdict = "pass" | "partial" | "fail" | "unknown";

export function mergeAuditVerdict(programmatic: ProgrammaticRow[], judge: JudgeResult): OverallVerdict {
  const invalid = programmatic.filter((r) => !r.valid).length;
  if (invalid > 0) {
    return "fail";
  }
  if (judge.verdict === "unknown") {
    if (programmatic.length === 0) {
      return "pass";
    }
    return "partial";
  }
  if (judge.verdict === "fail") {
    return "fail";
  }
  if (judge.verdict === "partial") {
    return "partial";
  }
  return "pass";
}
