import { createReadStream } from "fs";
import fs from "fs/promises";
import readline from "readline";

import { ToolError } from "@/lib/errors";
import { resolveSessionPath } from "@/lib/paths";

import { readFileInputSchema, readFileOutputSchema } from "./schemas";

const MAX_OUTPUT_LINES = 400;
const STREAM_THRESHOLD_BYTES = 1024 * 1024;

async function sniffBinary(filePath: string): Promise<boolean> {
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fh.read(buf, 0, 8192, 0);
    const slice = buf.subarray(0, bytesRead);
    return slice.includes(0);
  } finally {
    await fh.close();
  }
}

async function readAllLinesStreaming(filePath: string): Promise<string[]> {
  const lines: string[] = [];
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    lines.push(line);
  }
  return lines;
}

async function readAllLines(filePath: string, size: number): Promise<string[]> {
  if (size > STREAM_THRESHOLD_BYTES) {
    return readAllLinesStreaming(filePath);
  }
  const buf = await fs.readFile(filePath);
  if (buf.includes(0)) {
    throw new ToolError("File appears to be binary", "read_file", "BINARY");
  }
  const text = buf.toString("utf8");
  return text.split(/\r?\n/);
}

export async function readFileTool(sessionId: string, rawInput: unknown) {
  const input = readFileInputSchema.parse(rawInput);

  if (input.startLine !== undefined && input.endLine !== undefined && input.startLine > input.endLine) {
    return {
      ok: false as const,
      error: new ToolError("startLine must be <= endLine", "read_file", "INVALID_RANGE"),
    };
  }

  let filePath: string;
  try {
    filePath = resolveSessionPath(sessionId, input.path);
  } catch (err) {
    if (err instanceof ToolError) {
      return { ok: false as const, error: err };
    }
    throw err;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return { ok: false as const, error: new ToolError("Path is a directory", "read_file", "IS_DIRECTORY") };
    }
    if (!stat.isFile()) {
      return { ok: false as const, error: new ToolError("Not a regular file", "read_file", "NOT_FOUND") };
    }

    const binary = await sniffBinary(filePath);
    if (binary) {
      return { ok: false as const, error: new ToolError("File appears to be binary", "read_file", "BINARY") };
    }

    const allLines = await readAllLines(filePath, stat.size);

    let startIdx = 0;
    let endIdx = allLines.length;
    if (input.startLine !== undefined) {
      startIdx = Math.max(0, input.startLine - 1);
    }
    if (input.endLine !== undefined) {
      endIdx = Math.min(allLines.length, input.endLine);
    } else if (input.startLine !== undefined) {
      endIdx = Math.min(allLines.length, startIdx + MAX_OUTPUT_LINES);
    }

    if (input.startLine !== undefined && input.endLine !== undefined) {
      const span = input.endLine - input.startLine + 1;
      if (span > MAX_OUTPUT_LINES) {
        return {
          ok: false as const,
          error: new ToolError(
            `Line range cannot exceed ${MAX_OUTPUT_LINES} lines`,
            "read_file",
            "INVALID_RANGE",
          ),
        };
      }
    }

    const slice = allLines.slice(startIdx, endIdx);
    let truncated = false;
    let linesOut = slice;
    if (input.startLine === undefined && input.endLine === undefined && slice.length > MAX_OUTPUT_LINES) {
      linesOut = slice.slice(0, MAX_OUTPUT_LINES);
      truncated = true;
    }

    const lines = linesOut.map((text, i) => ({
      n: startIdx + i + 1,
      text,
    }));

    const displayPath = input.path.replace(/\\/g, "/");
    return {
      ok: true as const,
      data: readFileOutputSchema.parse({
        path: displayPath,
        lines,
        truncated: truncated ? true : undefined,
      }),
    };
  } catch (err) {
    if (err instanceof ToolError) {
      return { ok: false as const, error: err };
    }
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false as const, error: new ToolError("File not found", "read_file", "NOT_FOUND") };
    }
    return {
      ok: false as const,
      error: new ToolError(
        err instanceof Error ? err.message : "Failed to read file",
        "read_file",
        "NOT_FOUND",
      ),
    };
  }
}
