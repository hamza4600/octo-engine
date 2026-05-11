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

  const noExtractedCitations = programmatic.length === 0;
  // With zero citations there is nothing programmatically invalid; a judge "fail" here
  // means "claims not evidenced," not broken citations — surface as partial for UX.
  const effectiveJudge: "pass" | "partial" | "fail" =
    noExtractedCitations && judge.verdict === "fail" ? "partial" : judge.verdict;

  if (effectiveJudge === "fail") {
    return "fail";
  }
  if (effectiveJudge === "partial") {
    return "partial";
  }
  return "pass";
}
