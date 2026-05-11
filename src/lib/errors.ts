/**
 * Typed errors for API routes and lib code.
 * Each carries a stable `code` and HTTP status for route mapping.
 */

export type ValidationErrorCode = "INVALID_URL" | "VALIDATION";

export type RepoErrorCode =
  | "NOT_FOUND"
  | "TOO_LARGE"
  | "CLONE_FAILED"
  | "CLONE_TIMEOUT"
  | "METADATA_FAILED";

export type ToolErrorCode =
  | "NOT_FOUND"
  | "IS_DIRECTORY"
  | "BINARY"
  | "INVALID_RANGE"
  | "TIMEOUT"
  | "GREP_FAILED"
  | "PATH_ESCAPE"
  | "FIND_FAILED"
  | "LIST_FAILED";

export type LLMErrorCode = "UPSTREAM" | "RATE_LIMIT" | "INVALID_RESPONSE";

export type AuditErrorCode = "JUDGE_FAILED" | "PARSE_FAILED" | "STORAGE";

function statusForRepo(code: RepoErrorCode): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "TOO_LARGE":
      return 422;
    case "CLONE_TIMEOUT":
      return 504;
    default:
      return 422;
  }
}

function statusForTool(code: ToolErrorCode): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "TIMEOUT":
      return 504;
    default:
      return 422;
  }
}

function statusForLLM(code: LLMErrorCode): number {
  return code === "RATE_LIMIT" ? 429 : 502;
}

function statusForAudit(code: AuditErrorCode): number {
  return code === "STORAGE" ? 503 : 422;
}

export class ValidationError extends Error {
  readonly name = "ValidationError";

  constructor(
    message: string,
    readonly code: ValidationErrorCode = "VALIDATION",
    readonly httpStatus = 400,
  ) {
    super(message);
  }
}

export class RepoError extends Error {
  readonly name = "RepoError";

  constructor(
    message: string,
    readonly code: RepoErrorCode,
    readonly httpStatus = statusForRepo(code),
  ) {
    super(message);
  }
}

export class ToolError extends Error {
  readonly name = "ToolError";

  constructor(
    message: string,
    readonly tool: string,
    readonly code: ToolErrorCode,
    readonly httpStatus = statusForTool(code),
  ) {
    super(message);
  }
}

export class LLMError extends Error {
  readonly name = "LLMError";

  constructor(
    message: string,
    readonly code: LLMErrorCode,
    readonly httpStatus = statusForLLM(code),
  ) {
    super(message);
  }
}

export class AuditError extends Error {
  readonly name = "AuditError";

  constructor(
    message: string,
    readonly code: AuditErrorCode,
    readonly httpStatus = statusForAudit(code),
  ) {
    super(message);
  }
}

/** Redis / persistence failures (sessions, messages). */
export class StorageError extends Error {
  readonly name = "StorageError";
  readonly code = "STORAGE" as const;
  readonly httpStatus = 503;

  constructor(message: string) {
    super(message);
  }
}

export function toolErrorToResult(err: ToolError): { error: string; code: string; tool: string } {
  return { error: err.message, code: err.code, tool: err.tool };
}
