import fs from "fs/promises";

import { resolveSessionPath } from "@/lib/paths";

import type { ParsedCitation } from "./parseCitations";

const SNIPPET_MAX_LINES = 30;

export type ProgrammaticReason = "FILE_NOT_FOUND" | "OUT_OF_RANGE" | "PATH_ESCAPE";

export type ProgrammaticRow = {
  citation: string;
  valid: boolean;
  reason?: ProgrammaticReason;
  snippet?: string;
};

async function readLineSlice(
  absPath: string,
  startLine: number,
  endLine: number,
): Promise<{ ok: true; lines: string[] } | { ok: false; reason: ProgrammaticReason }> {
  try {
    const st = await fs.stat(absPath);
    if (!st.isFile()) {
      return { ok: false, reason: "FILE_NOT_FOUND" };
    }
    const buf = await fs.readFile(absPath);
    if (buf.includes(0)) {
      return { ok: false, reason: "FILE_NOT_FOUND" };
    }
    const all = buf.toString("utf8").split(/\r?\n/);
    const startIdx = startLine - 1;
    const exclusiveEnd = endLine;
    const expectedLen = endLine - startLine + 1;
    if (startIdx < 0 || startIdx >= all.length) {
      return { ok: false, reason: "OUT_OF_RANGE" };
    }
    const slice = all.slice(startIdx, exclusiveEnd);
    if (slice.length < expectedLen) {
      return { ok: false, reason: "OUT_OF_RANGE" };
    }
    return { ok: true, lines: slice };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, reason: "FILE_NOT_FOUND" };
    }
    return { ok: false, reason: "FILE_NOT_FOUND" };
  }
}

export async function programmaticCheck(
  sessionId: string,
  citations: ParsedCitation[],
): Promise<ProgrammaticRow[]> {
  const rows: ProgrammaticRow[] = [];

  for (const c of citations) {
    const citation = c.raw;
    let absPath: string;
    try {
      absPath = resolveSessionPath(sessionId, c.path);
    } catch {
      rows.push({
        citation,
        valid: false,
        reason: "PATH_ESCAPE",
      });
      continue;
    }

    const sliceResult = await readLineSlice(absPath, c.startLine, c.endLine);
    if (!sliceResult.ok) {
      rows.push({ citation, valid: false, reason: sliceResult.reason });
      continue;
    }

    const capped = sliceResult.lines.slice(0, SNIPPET_MAX_LINES);
    const snippet = capped.map((line, i) => `${String(c.startLine + i).padStart(4, " ")}| ${line}`).join("\n");

    rows.push({
      citation,
      valid: true,
      snippet,
    });
  }

  return rows;
}
