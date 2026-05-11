/** Reasons persisted by POST /api/audit or implied by GET / client polling. */
export type AuditUnavailableReason =
  | "SESSION_NOT_FOUND"
  | "MESSAGE_NOT_FOUND"
  | "AUDIT_ERROR"
  | "REDIS_ERROR"
  | "POLL_TIMEOUT"
  | "CLIENT_FETCH_ERROR";

export function auditUnavailableBadgeLabel(reason: string | undefined): string {
  switch (reason) {
    case "SESSION_NOT_FOUND":
      return "Audit · session expired";
    case "MESSAGE_NOT_FOUND":
      return "Audit · reply not found";
    case "AUDIT_ERROR":
      return "Audit · run failed";
    case "REDIS_ERROR":
      return "Audit · Redis error";
    case "POLL_TIMEOUT":
      return "Audit · still pending";
    case "CLIENT_FETCH_ERROR":
      return "Audit · network error";
    default:
      return "Audit · unavailable";
  }
}

/** Short hint for hover / aria on the badge button. */
export function auditUnavailableBadgeTitle(reason: string | undefined): string {
  const { headline } = auditUnavailableHelp(reason);
  return `${headline} Open for steps to fix.`;
}

export function auditUnavailableHelp(reason: string | undefined): {
  headline: string;
  steps: string[];
} {
  switch (reason) {
    case "SESSION_NOT_FOUND":
      return {
        headline: "This chat session is missing on the server.",
        steps: [
          "Start a new investigation from the home flow so a fresh session is created.",
          "If you had the tab open a long time, the session may have expired (see session TTL in your deployment).",
          "Confirm Upstash Redis is configured: copy `.env.example` to `.env.local` and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.",
        ],
      };
    case "MESSAGE_NOT_FOUND":
      return {
        headline: "The assistant message text could not be loaded for auditing.",
        steps: [
          "Refresh the page and wait for the thread to reload; then check the badge again.",
          "If it keeps failing, the UI message id may not match what was stored after streaming — try sending another short message to generate a new reply.",
          "Check server logs for `audit.message_not_found` to confirm Redis/session message storage.",
        ],
      };
    case "AUDIT_ERROR":
      return {
        headline: "The audit job failed while running (citations or judge step).",
        steps: [
          "Ensure `OPENAI_API_KEY` is set and `OPENAI_SMALL_MODEL` is valid (see `.env.example`).",
          "Inspect server logs for `audit.post_failed` for the underlying error.",
          "If the judge times out, try a smaller model or retry after the API is healthy.",
        ],
      };
    case "REDIS_ERROR":
      return {
        headline: "Audit storage could not be read or written.",
        steps: [
          "Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env.local` match your Upstash database.",
          "From the Upstash console, confirm the database is running and not paused.",
          "Check server logs for `audit.get_failed` or connection errors.",
        ],
      };
    case "POLL_TIMEOUT":
      return {
        headline: "No audit result arrived within the usual wait window.",
        steps: [
          "The audit may still be running: wait a few seconds and refresh the page.",
          "Confirm `POST /api/audit` is reachable (chat `onFinish` triggers it after each assistant reply).",
          "If Redis or the judge is slow, consider increasing client poll limits in `audit-badge.tsx` (`MAX_POLLS` / `POLL_MS`).",
        ],
      };
    case "CLIENT_FETCH_ERROR":
      return {
        headline: "The browser could not reach the audit API.",
        steps: [
          "Check that the dev server or deployment is up and you are not offline.",
          "Look for blocked requests or CORS issues in the browser devtools Network tab for `/api/audit`.",
        ],
      };
    default:
      return {
        headline: "An audit could not be produced for this message.",
        steps: [
          "Open `.env.example` and ensure Redis plus OpenAI variables are set in `.env.local`.",
          "Refresh the page after a full assistant reply has finished streaming.",
          "Check server logs for audit or session errors if the problem continues.",
        ],
      };
  }
}
