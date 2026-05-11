import { tool, zodSchema } from "ai";

import { type ToolError, toolErrorToResult } from "@/lib/errors";

import { findFilesTool } from "./findFiles";
import { grepTool } from "./grep";
import {
  findFilesInputSchema,
  grepInputSchema,
  listDirectoryInputSchema,
  readFileInputSchema,
} from "./schemas";
import { listDirectory } from "./listDirectory";
import { readFileTool } from "./readFile";

function formatToolResult(
  r: { ok: true; data: Record<string, unknown> } | { ok: false; error: ToolError },
): Record<string, unknown> {
  if (!r.ok) {
    return toolErrorToResult(r.error);
  }
  return r.data;
}

/**
 * AI SDK tool definitions bound to a session (cloned repo root under {@link sessionRoot}).
 * Tool failures are returned as structured objects so the agent can self-correct (TASKS T32).
 */
export function createInvestigatorTools(sessionId: string) {
  return {
    list_directory: tool({
      description:
        "List files and subdirectories in a path relative to the repository root. Skips .git, node_modules, build outputs.",
      inputSchema: zodSchema(listDirectoryInputSchema),
      execute: async (input) => formatToolResult(await listDirectory(sessionId, input)),
    }),

    read_file: tool({
      description:
        "Read a text file relative to the repo root. Optional 1-based startLine/endLine (inclusive). Output is capped at 400 lines.",
      inputSchema: zodSchema(readFileInputSchema),
      execute: async (input) => formatToolResult(await readFileTool(sessionId, input)),
    }),

    grep: tool({
      description:
        "Search file contents with ripgrep (regex). Optional pathGlob filters paths (e.g. *.ts). Results capped at 200 matches.",
      inputSchema: zodSchema(grepInputSchema),
      execute: async (input) => formatToolResult(await grepTool(sessionId, input)),
    }),

    find_files: tool({
      description:
        "Find files by glob pattern relative to repo root (fast-glob). Results capped at 100 paths.",
      inputSchema: zodSchema(findFilesInputSchema),
      execute: async (input) => formatToolResult(await findFilesTool(sessionId, input)),
    }),
  } as const;
}

export type InvestigatorTools = ReturnType<typeof createInvestigatorTools>;
