import { NextResponse } from "next/server";
import { z } from "zod";

import { RepoError, StorageError, ValidationError } from "@/lib/errors";
import { log } from "@/lib/log";
import { createSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "no-store" } as const;

const bodySchema = z.object({
  url: z.string().min(1, "url is required"),
});

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "VALIDATION" }, { status: 400, headers: NO_STORE });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors.url?.[0] ?? "Validation failed", code: "VALIDATION" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const session = await createSession(parsed.data.url);
    return NextResponse.json(
      {
        sessionId: session.sessionId,
        owner: session.owner,
        repo: session.repo,
        defaultBranch: session.defaultBranch,
        summary: session.summary,
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus, headers: NO_STORE });
    }
    if (err instanceof RepoError) {
      log.warn("session.repo_error", { code: err.code, message: err.message });
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus, headers: NO_STORE });
    }
    if (err instanceof StorageError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus, headers: NO_STORE });
    }
    log.error("session.unexpected_error", { err });
    return NextResponse.json(
      { error: "Failed to prepare repository", code: "INTERNAL" },
      { status: 500, headers: NO_STORE },
    );
  }
}
