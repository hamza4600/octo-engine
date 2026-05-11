/**
 * Minimal JSON-line logger.
 *
 * One log = one line of JSON on stdout/stderr. Keeps Vercel log explorer happy
 * and is trivial to grep. Never log secrets or full file contents — pass IDs,
 * sizes, and reasons instead.
 *
 * Usage:
 *   log.info("clone.start", { sessionId, url })
 *   log.warn("tool.timeout", { sessionId, tool: "grep", ms: 15000 })
 *   log.error("openai.fail", { sessionId, err })
 */

export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const SECRET_KEY_PATTERN = /(token|secret|password|api[_-]?key|authorization)/i;

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(err.stack ? { stack: err.stack } : {}),
      ...("code" in err && err.code !== undefined ? { code: (err as { code?: unknown }).code } : {}),
    };
  }
  return { value: String(err) };
}

function redact(ctx: LogContext): LogContext {
  const out: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      out[k] = "[REDACTED]";
      continue;
    }
    if (k === "err" || k === "error") {
      out[k] = serializeError(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}

function emit(level: LogLevel, msg: string, ctx: LogContext = {}): void {
  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    msg,
    ...redact(ctx),
  });
  // stderr for warn/error so Vercel + most log forwarders surface them separately
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  info: (msg: string, ctx: LogContext = {}): void => emit("info", msg, ctx),
  warn: (msg: string, ctx: LogContext = {}): void => emit("warn", msg, ctx),
  error: (msg: string, ctx: LogContext = {}): void => emit("error", msg, ctx),
};
