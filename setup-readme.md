# Running Codebase Investigator (developer setup)

This file lives next to phase notes (`phase0.md` … `phase6.md`) and is updated as features land. **Authoritative API/redis detail:** repo-root `TECH_DOCS.md` in `Code-Investigation`.

---

## What you need

| Requirement | Notes |
|-------------|--------|
| **Node.js** | 18+ (same as `ai` package). |
| **npm** | Used in scripts below; `pnpm`/`yarn` work if you adapt commands. |
| **OpenAI API key** | Server-side only — [API keys](https://platform.openai.com/api-keys). |
| **Upstash Redis** | Free tier is fine. Create a Redis database and copy **REST URL** + **REST TOKEN**. |
| **Git + network** | Clone runs `git` against GitHub; allow outbound HTTPS to `github.com` and `api.github.com`. |

---

## Environment variables

Create **`codebase-investigator/.env.local`** (never commit it — already gitignored):

```bash
OPENAI_API_KEY=sk-...
UPSTASH_REDIS_REST_URL=https://....upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

- **`OPENAI_API_KEY`** — `/api/ping`, `/api/chat`, audit judge, ledger extraction (`src/lib/llm-provider.ts`).
- **`OPENAI_CHAT_MODEL`** / **`OPENAI_SMALL_MODEL`** — optional; defaults `gpt-4o` (agent) and `gpt-4o-mini` (judge, ledger, ping).
- **`OPENAI_BASE_URL`** — optional; set for Azure OpenAI, proxies, or other OpenAI-compatible endpoints.
- **`UPSTASH_*`** — sessions (`session:{id}`), messages list (`messages:{id}`), **audit** keys `audit:{sessionId}:{messageId}` (+ `:status`), and Phase 4 ledger list `ledger:{sessionId}`.

Optional later:

- **`NEXT_PUBLIC_APP_URL`** — only if client-side code needs an absolute app URL (most flows use relative `/api/...`).

Env vars are validated at startup via `src/lib/env.ts`; missing values prevent the app from booting (fail fast).

---

## Install and dev

```bash
cd codebase-investigator
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000): paste a **public** GitHub URL → **Prepare repo** → chat.

Health check:

```bash
# Browser or curl
GET http://localhost:3000/api/ping
```

Expect `{"ok":true,"llm":"ok","redis":"ok","provider":"openai"}` when keys are correct.

---

## Implemented phases (high level)

| Phase | What works |
|-------|------------|
| **0** | Strict TS, shadcn, Redis + LLM ping (`/api/ping`). |
| **1** | Clone + sandbox tools (`list_directory`, `read_file`, `grep`, `find_files`), smoke scripts. |
| **2** | `POST /api/session`, streaming **`POST /api/chat`** (tools + citations guidance), UI (`UrlBar`, `ChatThread`), `GET /api/file`, Sonner toasts, chat **`onFinish`** triggers audit POST. |
| **3** | Citation parse + programmatic check + **separate** judge call, Redis-backed **`/api/audit`**, **`AuditBadge`** + detail sheet on assistant messages. See [`phase3.md`](phase3.md). |
| **4** | After each assistant turn: **`extractFacts`** → `ledger:{sessionId}` (cap 40, `turnIndex`); next chat injects **Established findings** (≤8KB); judge uses same bullets. See [`phase4.md`](phase4.md). |
| **6** | Demo repo config (`scripts/demo-config.ts`), **`npm run demo:prewarm`**, **`npm run demo:questions`**. Run-throughs: [`phase6.md`](phase6.md). |

Clone output directory: OS tmp (`sessionRoot`) → e.g. `/tmp/sessions/{sessionId}` on Linux/Vercel.

---

## Production build note (@vscode/ripgrep)

`next.config.ts` sets `serverExternalPackages: ["@vscode/ripgrep"]` so Turbopack does not try to bundle the **`rg.exe` / native binary**. If you see bundle errors about `rg.exe`, confirm this setting is present.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build |
| `npm run lint` / `npm run typecheck` | Quality gates |
| `npm run smoke` | Clone `sindresorhus/is-odd` + exercise tools (needs env + GitHub) |
| `npm run test-parse` | URL parsing sanity |
| `npm run test-citations` | `parseCitations` fixtures (Phase 3) |
| `npm run demo:questions` | Print Phase 6 demo question deck |
| `npm run demo:prewarm` | `POST /api/session` for demo repo (prod or local) |

---

## Model configuration

Configured in **`src/lib/llm-provider.ts`** with `OPENAI_CHAT_MODEL` (agent stream) and `OPENAI_SMALL_MODEL` (judge + ledger). Defaults: **`gpt-4o`** and **`gpt-4o-mini`**. See [OpenAI models](https://platform.openai.com/docs/models).

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| App won’t start | Missing/malformed `.env.local` — read the thrown Zod message in the terminal. |
| `/api/ping` 503 | Bad OpenAI key or Redis URL/token; check OpenAI usage/billing and Upstash dashboard. |
| Clone/metadata failures | Private repo, rate limit, firewall blocking GitHub API, or repo > limits (see `TASKS.md` / `CHECKLIST.md`). |
| Chat streams then errors | Provider outage / quota; check server logs (`src/lib/log.ts` JSON lines). |
| Audit badge stays **pending** or **unavailable** | Redis/network error, assistant message not found in `messages:{id}`, or missing citations with soft failures — check logs for `audit.*`. |

---

## After Phase 6

Demo prep: **[`phase6.md`](phase6.md)**. Stretch items remain in root **`TASKS.md`** (S02–S04).
