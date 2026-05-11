import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ToolError } from "@/lib/errors";
import { getSession } from "@/lib/session";
import { readFileTool } from "@/lib/tools/readFile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const querySchema = z.object({
  sessionId: z.string().min(1),
  path: z.string().min(1),
  start: z.coerce.number().int().min(1).optional(),
  end: z.coerce.number().int().min(1).optional(),
});

function httpForToolError(err: ToolError): number {
  return err.httpStatus;
}

export async function GET(req: NextRequest): Promise<Response> {
  const rawPath = req.nextUrl.searchParams.get("path") ?? "";
  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    decodedPath = rawPath;
  }

  const parsed = querySchema.safeParse({
    sessionId: req.nextUrl.searchParams.get("sessionId"),
    path: decodedPath,
    start: req.nextUrl.searchParams.get("start") ?? undefined,
    end: req.nextUrl.searchParams.get("end") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", code: "VALIDATION" },
      { status: 400, headers: NO_STORE },
    );
  }

  const session = await getSession(parsed.data.sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found", code: "SESSION_NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }

  const result = await readFileTool(parsed.data.sessionId, {
    path: parsed.data.path,
    startLine: parsed.data.start,
    endLine: parsed.data.end,
  });

  if (!result.ok) {
    const status = httpForToolError(result.error);
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status, headers: NO_STORE },
    );
  }

  const displayPath = parsed.data.path.replace(/\\/g, "/");

  return NextResponse.json(
    {
      path: displayPath,
      lines: result.data.lines,
      truncated: result.data.truncated,
    },
    { status: 200, headers: NO_STORE },
  );
}
