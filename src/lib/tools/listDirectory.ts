import fs from "fs/promises";
import path from "path";

import { ToolError } from "@/lib/errors";
import { resolveSessionPath } from "@/lib/paths";

import { listDirectoryInputSchema, listDirectoryOutputSchema } from "./schemas";

const SKIP = new Set([".git", "node_modules", "dist", ".next", "build", ".turbo"]);

export async function listDirectory(sessionId: string, rawInput: unknown) {
  const input = listDirectoryInputSchema.parse(rawInput);
  let dirPath: string;
  try {
    dirPath = resolveSessionPath(sessionId, input.path);
  } catch (err) {
    if (err instanceof ToolError) {
      return { ok: false as const, error: err };
    }
    throw err;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const mapped = await Promise.all(
      entries
        .filter((e) => !SKIP.has(e.name))
        .map(async (e) => {
          const name = e.name;
          if (e.isDirectory()) {
            return { name, type: "directory" as const };
          }
          if (e.isFile()) {
            const st = await fs.stat(path.join(dirPath, e.name)).catch(() => null);
            return {
              name,
              type: "file" as const,
              size: st?.size ?? 0,
            };
          }
          return null;
        }),
    );
    const sorted = mapped
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true as const, data: listDirectoryOutputSchema.parse({ entries: sorted }) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false as const, error: new ToolError("Path not found", "list_directory", "NOT_FOUND") };
    }
    if (code === "ENOTDIR") {
      return { ok: false as const, error: new ToolError("Path is not a directory", "list_directory", "IS_DIRECTORY") };
    }
    return {
      ok: false as const,
      error: new ToolError(
        err instanceof Error ? err.message : "Failed to list directory",
        "list_directory",
        "LIST_FAILED",
      ),
    };
  }
}
