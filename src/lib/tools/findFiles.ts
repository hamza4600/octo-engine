import fg from "fast-glob";

import { ToolError } from "@/lib/errors";
import { sessionRoot } from "@/lib/paths";

import { findFilesInputSchema, findFilesOutputSchema } from "./schemas";

const MAX_FILES = 100;

const DEFAULT_IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/build/**",
  "**/.turbo/**",
];

export async function findFilesTool(sessionId: string, rawInput: unknown) {
  const input = findFilesInputSchema.parse(rawInput);
  const cwd = sessionRoot(sessionId);

  try {
    const paths = await fg(input.glob, {
      cwd,
      ignore: DEFAULT_IGNORE,
      dot: false,
      onlyFiles: true,
      unique: true,
      suppressErrors: true,
    });

    const sliced = paths.slice(0, MAX_FILES);
    const truncated = paths.length > MAX_FILES;

    const normalized = sliced.map((p) => p.replace(/\\/g, "/"));

    return {
      ok: true as const,
      data: findFilesOutputSchema.parse({
        paths: normalized,
        truncated: truncated ? true : undefined,
      }),
    };
  } catch (err) {
    return {
      ok: false as const,
      error: new ToolError(
        err instanceof Error ? err.message : "findFiles failed",
        "find_files",
        "FIND_FAILED",
      ),
    };
  }
}
