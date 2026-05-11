# Codebase Investigator — Task List

Granular ordered tasks. Work top to bottom. Estimates are budgets, not promises — if a task blows past 1.5x, stop and reassess.

Format: `[ ] T## (Xm) Task — file(s) touched`

---

## Phase 0 — Setup (45m budget)

- [x] T01 (5m) Run `npx create-next-app@latest codebase-investigator --ts --tailwind --app --src-dir --eslint`
- [x] T02 (3m) `cd codebase-investigator`, init git, first commit
- [x] T03 (3m) Install runtime deps: `npm i ai @ai-sdk/openai simple-git @vscode/ripgrep fast-glob @upstash/redis zod`
- [x] T04 (3m) Install dev deps: `npm i -D @types/node tsx`
- [x] T05 (5m) `npx shadcn init`; add components: button, input, card, badge, sheet, scroll-area, separator, sonner
- [x] T06 (5m) Strict `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [x] T07 (3m) `.prettierrc` + `.eslintrc` baseline; add `lint`, `typecheck`, `format` npm scripts
- [ ] T08 (5m) Create Upstash Redis DB (free tier); copy REST URL + token
- [x] T09 (3m) Create `.env.local` with `OPENAI_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`; verify `.gitignore`
- [x] T10 (5m) `src/lib/env.ts` — Zod-validated env loader; throws on missing
- [x] T11 (3m) `src/lib/log.ts` — minimal JSON-line logger (`info`, `warn`, `error` with context)
- [x] T12 (3m) `src/lib/redis.ts` — Upstash client singleton
- [x] T13 (5m) `src/app/api/ping/route.ts` — calls OpenAI (1-token completion) + Redis set/get; returns `{ok, openai, redis}`
- [x] T13a (3m) Verify Vercel **Pro** plan active before any deploy work. Hobby caps `maxDuration` at 60s — would force `maxSteps: 6` and rule out larger demo repos. Note plan in `TECH_DOCS.md` if it changes.
- [~] T14 (2m) Hit `/api/ping` from browser; both green — route reachable & env validation fires correctly; **two greens blocked on T08** (Upstash) + populating `.env.local`
- [~] T15 (2m) Link Vercel project: `vercel link` (no deploy) — must be run interactively by you (login prompt); not run yet

---

## Phase 1 — Repo ingestion + tools (1.5h budget)

- [ ] T16 (5m) `src/lib/errors.ts` — `ValidationError`, `RepoError`, `ToolError`, `LLMError`, `AuditError` classes with `code` + `httpStatus`
- [ ] T17 (10m) `src/lib/repo.ts::parseGithubUrl(url)` + unit-test inline with `tsx scripts/test-parse.ts`
- [ ] T18a (5m) `src/lib/repo.ts::checkRepoMetadata({owner, repo})` — fetch `https://api.github.com/repos/{owner}/{repo}` (no auth, public only). Reject if `private: true` (RepoError NOT_FOUND) or `size > 50000` KB (RepoError TOO_LARGE). Avoids the 60s clone-then-fail UX. Call from `/api/session` BEFORE `cloneRepo`.
- [ ] T18 (15m) `src/lib/repo.ts::cloneRepo(sessionId, url)` — simple-git, `--depth 1`, 60s timeout, post-clone size check (defense-in-depth — metadata can lie), throws typed `RepoError`
- [ ] T19 (5m) `src/lib/tools/schemas.ts` — Zod schemas for all 4 tool inputs + outputs
- [ ] T20 (5m) `src/lib/paths.ts::resolveSessionPath(sessionId, p)` — sandbox helper, rejects path escapes
- [ ] T21 (10m) `src/lib/tools/listDirectory.ts` — readdir + sort + skip-list; returns `{entries: [{name, type, size}]}`
- [ ] T22 (15m) `src/lib/tools/readFile.ts` — read, slice by lines, line-number prefix, binary detect, 400-line cap
- [ ] T23 (15m) `src/lib/tools/grep.ts` — spawn `@vscode/ripgrep` with `--json --max-count 50`, parse stream, 15s timeout, 200-hit cap
- [ ] T24 (10m) `src/lib/tools/findFiles.ts` — fast-glob with default ignores, 100-match cap
- [ ] T25 (5m) `src/lib/tools/index.ts` — AI SDK tool registry mapping each tool through Zod
- [ ] T26 (15m) `scripts/smoke.ts` — clone `sindresorhus/is-odd`, exercise all 4 tools, print results

---

## Phase 2 — Agent loop + chat UI (2h budget)

- [ ] T27 (5m) `src/lib/prompts/system.ts` — single export, citation rules + investigation rules + contradiction rule + never-invent rule
- [ ] T28 (10m) `src/lib/session.ts` — `createSession(url)`, `getSession(id)`, `appendMessage(id, msg)`; Redis-backed; 24h TTL
- [ ] T29 (10m) `src/lib/repoSummary.ts` — depth-2 tree + first 80 lines of README; called once at session create
- [ ] T30 (15m) `src/app/api/session/route.ts` POST — Zod-validate `{url}`, call `cloneRepo` + `repoSummary`, persist, return `{sessionId}`. Error mapping: 400/422/500.
- [ ] T31 (25m) `src/app/api/chat/route.ts` POST — `streamText` with tools, `maxSteps: 12`, system prompt + ledger injection, `onFinish` persists + triggers audit. `runtime = 'nodejs'`, `maxDuration = 300`.
- [ ] T32 (5m) Tool execute wrappers: catch `ToolError` and return as tool result (so agent recovers, doesn't crash turn)
- [ ] T33 (15m) `src/components/chat-thread.tsx` (`'use client'`) — `useChat()` wired to `/api/chat`, message list with markdown
- [ ] T34 (10m) `src/components/tool-call-chip.tsx` — compact rendering for tool-invocation parts (`grep("foo")`, `read src/x.ts:1-80`)
- [ ] T35 (10m) `src/components/url-bar.tsx` — GitHub URL input → "preparing repo" → locked-in chip with repo name
- [ ] T36 (10m) `src/app/page.tsx` — wire URL bar + chat thread; manage `sessionId` in local state
- [ ] T36a (10m) `src/app/api/file/route.ts` GET — Zod-validate `{sessionId, path, start?, end?}` from query string, sandbox via `resolveSessionPath`, return `{path, lines: [{n, text}]}`. Required by T53 file-viewer Sheet. URI-decode the `path` param; cap returned slice at 400 lines.
- [ ] T37 (5m) Sonner toast on session/chat errors; map server `code` → friendly message
- [ ] T38 (10m) End-to-end smoke: paste URL → chat → see tool calls stream → cited answer

---

## Phase 3 — Audit layer (1.5h budget)

- [x] T39 (10m) `src/lib/audit/parseCitations.ts` — regex extract `path:LINE` and `path:START-END`, dedupe
- [x] T39a (5m) `scripts/test-citations.ts` — assert `parseCitations` against 8 fixtures: bare `src/foo.ts:42`, range `src/foo.ts:42-58`, inside backticks `` `src/foo.ts:1` ``, inside markdown link `[x](src/foo.ts:1)`, leading dot `./src/foo.ts:1`, Windows-style `src\\foo.ts:1` (must be rejected), trailing punctuation `src/foo.ts:42.`, multiple per line `see src/a.ts:1 and src/b.ts:2`. Run with `npx tsx`.
- [x] T40 (15m) `src/lib/audit/programmaticCheck.ts` — for each citation: file exists? lines in range? return `{citation, valid, reason, snippet}[]`. Bonus: `scripts/test-programmatic-check.ts` covers FILE_NOT_FOUND / OUT_OF_RANGE / PATH_ESCAPE.
- [x] T41 (5m) `src/lib/prompts/judge.ts` — separate, terse system prompt for the judge
- [x] T42 (20m) `src/lib/audit/judge.ts` — `generateObject` with gpt-4o-mini, Zod schema for `{verdict, claims, risks, contradictions}`, no chat history bleed, temperature 0
- [x] T43 (15m) `src/app/api/audit/route.ts` — POST runs both checks in parallel, persists to `audit:{sessionId}:{messageId}`; GET returns the audit (or `pending`/`unavailable` w/ reason)
- [x] T44 (10m) Hook audit trigger from `/api/chat` `onFinish` (fire-and-forget POST, don't await)
- [x] T45 (15m) `src/components/audit-badge.tsx` — green/amber/red, polls GET `/api/audit` every 1s for ≤15s
- [x] T46 (10m) `src/components/audit-detail-sheet.tsx` — opens on badge click, lists per-claim verdicts, invalid citations, contradictions

---

## Phase 4 — Facts ledger (45m budget)

- [ ] T47 (5m) `src/lib/prompts/ledger.ts` — extraction prompt
- [ ] T48 (15m) `src/lib/ledger.ts::extractFacts(answer)` — gpt-4o-mini, Zod-validated `{fact, citation}[]`
- [ ] T49 (10m) `appendLedger(sessionId, facts)` — Redis list, cap last 40
- [ ] T50 (10m) Inject ledger into `/api/chat` system prompt as bulleted "Established findings so far"
- [ ] T51 (5m) Pass ledger into judge payload so it can flag contradictions

---

## Phase 5 — Polish + deploy (1h budget)

- [ ] T52 (10m) `src/components/citation-chip.tsx` — clickable; opens file viewer Sheet
- [ ] T53 (10m) `src/components/file-viewer.tsx` — fetch file, render with line numbers, highlight cited range
- [ ] T54 (5m) Loading states for all async UI (cloning, thinking, tool exec, audit pending)
- [ ] T55 (5m) `src/app/error.tsx` and `src/app/not-found.tsx`
- [ ] T56 (5m) Empty state on landing: 3-line how-to + sample URL
- [ ] T56a (10m) `README.md` already drafted — verify links resolve, drop in the live deploy URL once T58 is done, confirm "audit decision in 3 sentences" is above the fold on GitHub's rendered preview. (Promoted from stretch S01 — required deliverable.)
- [ ] T57 (5m) `Cache-Control: no-store` on all `/api/*` responses
- [ ] T58 (10m) `vercel deploy --prod`; set env vars in Vercel dashboard
- [ ] T59 (5m) Enable Fluid Compute in Vercel project settings
- [ ] T60 (5m) Verify `maxDuration` in deployed function logs
- [ ] T61 (10m) Smoke deployed URL end-to-end

---

## Phase 6 — Demo prep (30m budget)

- [ ] T62 (5m) Pick target repo (`colinhacks/zod` or similar 5–20k LOC)
- [ ] T63 (10m) Pre-warm session against deployed URL (so the demo doesn't pay clone cost)
- [ ] T64 (10m) Script 6–8 questions: 2 retrieval, 2 evaluation, 2 opinion, 1 hallucination probe, 1 contradiction probe
- [ ] T65 (5m) Run-through #1, note rough edges
- [ ] T66 (5m) Run-through #2, fix any quick wins; freeze

---

## Stretch (only if time remains)

- [ ] S02 Short screen recording as backup
- [ ] S03 Add `git_log(path)` tool for "what changed recently" questions
- [ ] S04 Persist session list per-user in localStorage so reviewers can revisit prior chats

> S01 (README with design notes) was promoted to T56a — it's a required deliverable, not stretch.
