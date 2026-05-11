import { spawn } from "child_process";

import { rgPath } from "@vscode/ripgrep";

import { ToolError } from "@/lib/errors";
import { sessionRoot } from "@/lib/paths";

import { grepInputSchema, grepOutputSchema } from "./schemas";

const GREP_TIMEOUT_MS = 15_000;
const MAX_TOTAL_MATCHES = 200;
const RG_MAX_COUNT_PER_FILE = "50";

type RgMatchJson = {
  type?: string;
  data?: {
    path?: { text?: string };
    lines?: { text?: string };
    line_number?: number;
  };
};

export async function grepTool(sessionId: string, rawInput: unknown) {
  const input = grepInputSchema.parse(rawInput);
  const cwd = sessionRoot(sessionId);

  const args = [
    "--json",
    "--max-count",
    RG_MAX_COUNT_PER_FILE,
    "--regexp",
    input.pattern,
    ".",
  ];
  if (input.pathGlob !== undefined && input.pathGlob.length > 0) {
    args.push("--glob", input.pathGlob);
  }

  const matches: { path: string; line: number; text: string }[] = [];
  let stderr = "";
  let stoppedForCap = false;
  let timedOut = false;

  const child = spawn(rgPath, args, {
    cwd,
    windowsHide: true,
  });

  const killTimer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, GREP_TIMEOUT_MS);

  try {
    await new Promise<void>((resolve, reject) => {
      const maybeFinish = (): void => {
        if (stoppedForCap) {
          child.kill("SIGKILL");
        }
      };

      child.stdout?.on("data", (chunk: Buffer) => {
        const lines = chunk.toString("utf8").split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          let parsed: RgMatchJson;
          try {
            parsed = JSON.parse(line) as RgMatchJson;
          } catch {
            continue;
          }
          if (parsed.type !== "match" || !parsed.data) continue;
          const p = parsed.data.path?.text ?? "";
          const ln = parsed.data.line_number ?? 0;
          const text = parsed.data.lines?.text?.replace(/\r?\n$/, "") ?? "";
          if (!p || ln < 1) continue;
          matches.push({ path: p.replace(/\\/g, "/"), line: ln, text });
          if (matches.length >= MAX_TOTAL_MATCHES) {
            stoppedForCap = true;
            maybeFinish();
            break;
          }
        }
      });

      child.stderr?.on("data", (c: Buffer) => {
        stderr += c.toString("utf8");
      });

      child.on("error", (err) => {
        reject(err);
      });

      child.on("close", (code) => {
        if (timedOut) {
          reject(new ToolError("grep timed out", "grep", "TIMEOUT"));
          return;
        }
        if (stoppedForCap) {
          resolve();
          return;
        }
        if (code === 0 || code === 1) {
          resolve();
          return;
        }
        reject(
          new ToolError(
            stderr.trim() || `ripgrep exited with code ${String(code)}`,
            "grep",
            "GREP_FAILED",
          ),
        );
      });
    });
  } catch (err) {
    if (err instanceof ToolError) {
      return { ok: false as const, error: err };
    }
    return {
      ok: false as const,
      error: new ToolError(
        err instanceof Error ? err.message : "grep failed",
        "grep",
        "GREP_FAILED",
      ),
    };
  } finally {
    clearTimeout(killTimer);
  }

  const truncated = stoppedForCap || matches.length >= MAX_TOTAL_MATCHES;

  return {
    ok: true as const,
    data: grepOutputSchema.parse({
      matches,
      truncated: truncated ? true : undefined,
    }),
  };
}
