import path from "path";
import { tmpdir } from "os";

import { ToolError } from "./errors";

/**
 * Absolute path to the cloned repo root for a session.
 * Matches deployment convention: tmpdir/sessions/{sessionId} (Linux `/tmp/sessions/...` on Vercel).
 */
export function sessionRoot(sessionId: string): string {
  return path.join(tmpdir(), "sessions", sessionId);
}

/**
 * Resolve a user-supplied relative path inside the session sandbox.
 * Rejects absolute paths and path traversal.
 */
export function resolveSessionPath(sessionId: string, userPath: string): string {
  const root = path.resolve(sessionRoot(sessionId));
  const trimmed = userPath.trim();
  if (trimmed === "") {
    return root;
  }
  const normalized = path.normalize(trimmed);
  if (path.isAbsolute(normalized)) {
    throw new ToolError("Absolute paths are not allowed", "sandbox", "PATH_ESCAPE");
  }
  const resolved = path.resolve(root, normalized);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ToolError("Path escapes session directory", "sandbox", "PATH_ESCAPE");
  }
  return resolved;
}
