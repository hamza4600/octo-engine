# Codebase Investigator

Ask a public GitHub repo questions in plain English. Get answers with file-and-line citations. Every answer is independently audited before you see the verdict.

## The audit, in three sentences

Every assistant answer goes through two independent checks in parallel before its verdict is shown. A deterministic programmatic check parses each `path:line` citation, opens the file inside the session's sandbox, and confirms the line range actually exists. A second LLM judge — different model, no chat history, its own system prompt — re-reads only the answer and the resolved snippets to decide whether the claims are supported. The merged verdict (`pass` / `fail` / `unavailable`) is attached to the message, with the failing citations called out by reason.

## Live demo

<!-- TODO(T58): replace this placeholder with the live Vercel URL after `vercel deploy --prod`. -->
**Deploy URL:** `https://<your-app>.vercel.app` *(not yet deployed)*

## What it does

- Clones a public GitHub repo (`--depth 1`, ≤50MB) into the OS tmpdir under a sandboxed session directory.
- Runs an OpenAI agent against the repo with four tools: `list_directory`, `read_file`, `grep`, `find_files`.
- Audits every assistant turn with a deterministic citation check plus an independent LLM judge.
- Persists session, messages, audits, and a ledger of established findings in Upstash Redis (24h TTL — no auth, no GC, no DB).

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, paste a public GitHub URL, click **Prepare repo**, then ask a question.

Health check: `GET /api/ping` should return `{"ok":true,"llm":"ok","redis":"ok"}`.

## Required env

Create `.env.local`:

```bash
OPENAI_API_KEY=sk-...
UPSTASH_REDIS_REST_URL=https://....upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

Optional: `OPENAI_BASE_URL`, `OPENAI_CHAT_MODEL` (default `gpt-4o`), `OPENAI_SMALL_MODEL` (default `gpt-4o-mini`). Env is validated at boot via `src/lib/env.ts` — missing values fail fast with a Zod error.

Sign up: [OpenAI API keys](https://platform.openai.com/api-keys), [Upstash Redis](https://upstash.com/).

## How it works

Request lifecycle:

1. `POST /api/session` — parse URL → check repo metadata (size, visibility) → clone → build a depth-2 tree + README excerpt → store in Redis.
2. `POST /api/chat` — stream the agent with tool calls capped at 12 steps; on finish, persist the assistant message and fire `/api/audit` + ledger extraction.
3. `POST /api/audit` — runs programmatic check + LLM judge in parallel, merges into a verdict, polls back to the UI within ~1s.
4. `GET /api/file` — sandboxed file slice for the citation chip → file viewer flow.

Deeper dives:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — components and data flow.
- [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) — sequence diagrams, failure modes, perf budgets.
- [`setup-readme.md`](./setup-readme.md) — developer setup, scripts, troubleshooting.
- [`TASKS.md`](./TASKS.md) — phased task list.

Built on [Next.js 16](https://nextjs.org/) (App Router, React 19, Node runtime) and the [Vercel AI SDK](https://ai-sdk.dev/).

## Limits

- Public repos only — private auth is out of scope.
- Repo size cap: 50MB (rejected during metadata check).
- No user accounts; sessions and audits are keyed by random IDs with a 24h TTL.
- Cold-start may pay clone cost; warm invocations re-use the sandbox until tmpdir is evicted (re-cloned automatically).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on :3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` / `npm run typecheck` | ESLint + strict TS |
| `npm run smoke` | Clone `sindresorhus/is-odd` and exercise all four agent tools |
| `npm run test-parse` / `test-citations` / `test-programmatic` | Targeted fixture tests in `scripts/` |
| `npm run smoke:deploy` | End-to-end smoke against a deployed `$DEPLOY_URL` |
| `npm run demo:prewarm` / `demo:questions` | Demo helpers |

## License

No license file is included. Treat as source-available for evaluation; ask before reuse.
