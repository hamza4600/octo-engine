@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Codebase Investigator: a Next.js 16 (App Router, React 19, Node runtime) app that clones a public GitHub repo into the OS tmpdir, runs a tool-using OpenAI agent against it (`list_directory`, `read_file`, `grep`, `find_files`), and audits every assistant turn with both a deterministic citation check and an independent LLM judge.

Deeper context lives in `ARCHITECTURE.md` (components + data flow), `SYSTEM_DESIGN.md` (sequence diagrams, failure modes, perf budgets), `TASKS.md` (phased task list, `[x]` = done), and `setup-readme.md` (env vars + scripts). Read those before non-trivial work — don't rederive what's already documented.

## Commands

- `npm run dev` — Next.js dev server on :3000
- `npm run build` / `npm start` — prod build / serve
- `npm run lint` — ESLint (next/core-web-vitals + next/typescript)
- `npm run typecheck` — `tsc --noEmit` against strict config (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are on)
- `npm run format` — Prettier write
- `npm run smoke` — clones `sindresorhus/is-odd` and exercises all 4 agent tools end-to-end (needs env)
- `npm run test-parse` — `parseGithubUrl` cases
- `npm run test-citations` — `parseCitations` fixtures (the 8-case set in `scripts/test-citations.ts`)
- `npm run test-programmatic` — `programmaticCheck` (`FILE_NOT_FOUND` / `OUT_OF_RANGE` / `PATH_ESCAPE`)
- `npm run demo:prewarm` / `npm run demo:questions` — Phase 6 demo helpers

There is no Vitest/Jest suite — all "tests" are tsx scripts in `scripts/` invoked via the npm scripts above. Run individual cases by editing the fixture array in the relevant script and re-running it.

## Required env

`.env.local` must define `OPENAI_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Optional: `OPENAI_BASE_URL`, `OPENAI_CHAT_MODEL` (default `gpt-4o`), `OPENAI_SMALL_MODEL` (default `gpt-4o-mini`). `src/lib/env.ts` validates at import time and throws — the app will not boot with bad/missing values. Hit `GET /api/ping` to confirm both OpenAI and Redis are reachable.

## Architecture in one screen

Request lifecycle (full diagrams in `ARCHITECTURE.md`):

1. `POST /api/session` — `parseGithubUrl` → `checkRepoMetadata` (rejects private / >50MB) → `cloneRepo` (`--depth 1`, 60s timeout) → `buildRepoSummary` (depth-2 tree + first 80 README lines) → persist `session:{id}` in Redis (24h TTL) → return `sessionId`.
2. `POST /api/chat` — loads session + ledger, calls `ensureSessionRepo` (re-clones if tmpdir was evicted between warm invocations), then `streamText` with the 4 agent tools and `stepCountIs(12)`. On finish: persists the assistant message, fires `POST /api/audit` and `extractAndAppendLedger` as fire-and-forget.
3. `POST /api/audit` — runs `programmaticCheck` (fs-based, deterministic) and `judge` (`generateObject` with gpt-4o-mini, **zero chat history**, separate system prompt) in parallel, merges into a verdict, stores at `audit:{sessionId}:{messageId}` (+ `:status`). `GET /api/audit` returns `pending` / `unavailable` (with reason) / verdict.
4. `GET /api/file` — sandboxed file slice for the file-viewer Sheet.

### Layout

- `src/app/api/{session,chat,audit,file,ping}/route.ts` — every route is `runtime = "nodejs"` (ripgrep + fs needed; Edge cannot host them). `/api/chat` is `maxDuration = 300`. All responses set `Cache-Control: no-store`.
- `src/lib/tools/` — the 4 agent tools. Each has Zod input + output (`schemas.ts`), wraps fs/ripgrep calls, and **returns errors as values, never throws** — the agent reads `{error: "..."}` as a tool result and self-corrects. `index.ts` exports `createInvestigatorTools(sessionId)` which closes the sandbox over the session.
- `src/lib/audit/` — `parseCitations.ts` (regex extracts `path:LINE` and `path:START-END`, rejects Windows-style `\` paths), `programmaticCheck.ts`, `judge.ts`, `verdict.ts` (merge).
- `src/lib/prompts/` — `system.ts`, `judge.ts`, `ledger.ts`. Prompts live here as code, not inline in routes.
- `src/lib/{repo,session,ledger,paths,env,llm-provider,redis,log,errors}.ts` — services.
- `src/components/` — `url-bar.tsx`, `chat-thread.tsx` (uses `useChat` from `@ai-sdk/react`), `tool-call-chip.tsx`, `citation-chip.tsx`, `file-viewer.tsx`, `audit-badge.tsx` (polls `GET /api/audit` ~1s for ≤15s), `audit-detail-sheet.tsx`, plus shadcn primitives under `ui/`.

Imports use the `@/*` → `./src/*` path alias.

### Invariants worth knowing before editing

- **Sandbox everything that takes a path.** Tools and `/api/file` resolve user-supplied paths through `resolveSessionPath(sessionId, p)` in `src/lib/paths.ts`. It rejects absolute paths and any `..` escape. Never `path.resolve` user input yourself.
- **Tools don't throw on user-facing errors.** Wrap fs/spawn failures and return `{error, code}`. Throwing kills the whole streaming turn.
- **`ensureSessionRepo` is the cold-start recovery path.** Vercel may evict `/tmp/sessions/{id}` between invocations; chat re-clones from session metadata in Redis. Do not assume the directory exists just because the session record does.
- **Audit must stay in a separate context.** No chat history, no agent system prompt, different model. This is a product guarantee, not a perf tweak — preserve it when touching `/api/audit` or `src/lib/audit/judge.ts`.
- **Ripgrep is a native binary.** `next.config.ts` pins `serverExternalPackages: ["@vscode/ripgrep"]`; do not remove. Spawn via `spawn(args[])`, never a shell string.
- **Session/message/audit/ledger keys all carry 24h TTL.** There is no auth, no GC job — TTL is the cleanup.

### Next.js version warning (from AGENTS.md)

This is Next.js 16 with React 19. APIs, conventions, and file structure may differ from your training data. When in doubt, consult `node_modules/next/dist/docs/` for the relevant guide before writing code, and heed deprecation notices in build output.

## Working with TASKS.md

`TASKS.md` is the phased plan; checked items (`[x]`) are landed, `[ ]` are outstanding, `[~]` are partially done / blocked. When implementing a task, check the box in the same edit. Don't invent new phases — append to "Stretch" if needed.
