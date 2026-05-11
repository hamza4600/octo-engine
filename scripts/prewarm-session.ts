/**
 * Pre-warm a session via POST /api/session (T63) — avoids paying clone cost at demo time.
 *
 * Usage:
 *   DEMO_BASE_URL=https://your-app.vercel.app npx tsx scripts/prewarm-session.ts
 *   npx tsx scripts/prewarm-session.ts http://localhost:3000
 *
 * Requires: reachable app with valid server env (OpenAI not needed for session alone; Upstash + clone need network).
 */
import { DEMO_TARGET_REPO_URL } from "./demo-config";

async function main(): Promise<void> {
  const baseArg = process.argv[2]?.replace(/\/$/, "");
  const base =
    baseArg ?? process.env.DEMO_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const res = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: DEMO_TARGET_REPO_URL }),
  });

  const body = (await res.json()) as {
    sessionId?: string;
    owner?: string;
    repo?: string;
    error?: string;
    code?: string;
  };

  if (!res.ok) {
    console.error("prewarm failed:", res.status, body);
    process.exitCode = 1;
    return;
  }

  if (!body.sessionId) {
    console.error("prewarm: missing sessionId in response", body);
    process.exitCode = 1;
    return;
  }

  console.log("Pre-warm OK — deploy/session path works for the demo repo.");
  console.log("  Repo:   ", DEMO_TARGET_REPO_URL);
  console.log("  Label:  ", `${body.owner}/${body.repo}`);
  console.log("  sessionId:", body.sessionId, "(Redis; UI ‘Prepare repo’ still creates a new session when you click.)");
  console.log("");
  console.log("Smoke URL:", `${base}/api/ping`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
