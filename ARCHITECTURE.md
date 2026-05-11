   # Architecture

High-level component view, data flow, and the key decisions that shape this build.

---

## One-liner

A single-page Next.js chat app that clones a public GitHub repo to disk, runs an OpenAI tool-using agent against it (`grep`, `read_file`, `list_directory`, `find_files`), and audits every answer with both a deterministic citation check and an independent LLM judge.

---

## Component diagram

```
┌─────────────────────────────────── Browser (Next.js client) ──────────────────────────────────┐
│                                                                                               │
│   URL bar       Chat thread (useChat)        Tool-call chips        Audit badge + sheet       │
│       │                │                            │                       │                 │
└───────┼────────────────┼────────────────────────────┼───────────────────────┼─────────────────┘
        │                │                            │                       │
        │ POST /session  │ POST /chat (stream)        │ rendered live          │ GET /audit (poll)
        ▼                ▼                            │                       ▼
┌──────────────────────────────── Next.js route handlers (Node runtime) ────────────────────────┐
│                                                                                               │
│  /api/session              /api/chat                                  /api/audit              │
│  ┌──────────┐              ┌─────────────────────────────────┐        ┌──────────────────┐    │
│  │ clone    │              │ streamText({                     │        │ programmatic +    │   │
│  │ summary  │              │   model: gpt-4.1,                │        │ judge in parallel │   │
│  │ persist  │              │   tools: { grep, read_file, ... }│ on     │ persist verdict   │   │
│  └──────────┘              │   maxSteps: 12                   │ finish └──────────────────┘    │
│                            │ })                               │           ▲                   │
│                            │ onFinish → persist + fire audit ─┼───────────┘                   │
│                            └─────────────────────────────────┘                                │
└──────────┬─────────────────────────────┬──────────────────────────────────────────────────────┘
           │                             │
           ▼                             ▼
   ┌──────────────┐            ┌──────────────────────┐         ┌──────────────────────┐
   │ /tmp/sessions│            │ Upstash Redis        │         │ OpenAI               │
   │   /<id>/     │            │  session:<id>        │         │  agent: gpt-4.1      │
   │   (cloned    │            │  messages:<id>       │         │  judge:  gpt-4o-mini │
   │    repo)     │            │  ledger:<id>         │         │  ledger: gpt-4o-mini │
   └──────────────┘            │  audit:<id>:<msgId>  │         └──────────────────────┘
                               └──────────────────────┘
```

---

## Components

### Client (Next.js App Router)
- **`page.tsx`** — single page; manages `sessionId` in local state.
- **`url-bar.tsx`** — input, validates GitHub URL shape client-side, posts to `/api/session`.
- **`chat-thread.tsx`** — `useChat({ api: '/api/chat', body: { sessionId } })`; renders messages + streamed tool-call chips + audit badges.
- **`audit-badge.tsx`** — polls `/api/audit` for the current message; renders pass/partial/fail.
- **`citation-chip.tsx`** + **`file-viewer.tsx`** — click a citation, open a side Sheet with the file and the cited range highlighted.

### API routes (Node runtime, never Edge — ripgrep needs subprocess + filesystem)
- **`POST /api/session`** — clone repo, build summary, persist, return `sessionId`.
- **`POST /api/chat`** — streaming agent loop with tools and message history.
- **`POST /api/audit`** — runs both checks in parallel; **`GET /api/audit`** — read current verdict.
- **`GET /api/file`** — read a file slice for the file viewer (sandboxed).
- **`GET /api/ping`** — health.

### Services / lib
- **`lib/repo.ts`** — URL parsing, cloning, size checks.
- **`lib/tools/`** — the four agent tools, each with Zod input + output.
- **`lib/audit/`** — citation parser, programmatic check, judge.
- **`lib/ledger.ts`** — fact extraction + retrieval.
- **`lib/session.ts`** — Redis-backed session/message/ledger CRUD.
- **`lib/prompts/`** — `system.ts`, `judge.ts`, `ledger.ts` — prompts as code, not inline strings.

### External
- **OpenAI** — `gpt-4.1` (or `gpt-4o`) for the agent, `gpt-4o-mini` for judge + ledger.
- **Upstash Redis** — session, messages, ledger, audit verdicts. TTL 24h.
- **Filesystem** — `/tmp/sessions/<sessionId>/` holds the cloned repo for the function instance's lifetime.

---

## Data flow

### 1. Session creation
```
User pastes URL
   → POST /api/session { url }
   → parseGithubUrl → cloneRepo (--depth 1, 60s timeout, 80MB cap)
   → build initial summary (depth-2 tree + README first 80 lines)
   → Redis SET session:<id> { repoPath, owner, repo, summary }
   → return { sessionId }
```

### 2. Turn (chat)
```
User sends message
   → POST /api/chat { sessionId, messages }
   → load session + ledger from Redis
   → streamText({
       system: SYSTEM_PROMPT + repoSummary + ledgerBullets,
       messages,
       tools: { list_directory, read_file, grep, find_files },
       maxSteps: 12
     })
   → tool calls execute (paths sandboxed to session root)
   → tool results stream back to model
   → model emits final text with citations
   → onFinish:
       Redis RPUSH messages:<id> assistantMessage
       fire-and-forget POST /api/audit { sessionId, messageId }
       fire-and-forget extractFacts → RPUSH ledger:<id>
```

### 3. Audit (background)
```
POST /api/audit
   → parseCitations(answer)
   → parallel:
       a) programmaticCheck → for each citation, fs.read + line range check
       b) judge (gpt-4o-mini, fresh prompt, no chat history) → structured JSON verdict
   → Redis SET audit:<id>:<msgId> { programmatic, judge, mergedVerdict }
   → UI polling GET /api/audit picks it up
```

---

## Key design decisions

| # | Decision | Why |
|---|---|---|
| 1 | Single agent loop, single message thread | Anthropic's Claude Code, the most-used coding agent in production, does the same. Multi-agent orchestration adds bugs we don't have time to absorb. |
| 2 | Ripgrep + filesystem over embeddings | Embeddings need indexing time, storage, and chunking choices. Ripgrep is ~zero-setup, deterministic, and the agent can craft sophisticated queries. PRD timing rules this in. |
| 3 | Clone to `/tmp` over GitHub REST API | Real filesystem makes ripgrep trivial. `/tmp` survives across warm Vercel invocations. Trade-off: cold starts re-clone (5–20s for small repos) — surfaced as a "preparing" UI state. |
| 4 | Vercel AI SDK over raw OpenAI SDK | Built-in streaming + tool use + `useChat` hook collapses ~hours of UI work into ~minutes. |
| 5 | Audit = programmatic check + LLM judge from separate context | PRD explicitly forbids same-prompt self-scoring. Programmatic check is deterministic (best signal); judge catches semantic over-confidence. They're orthogonal — both contribute. |
| 6 | Facts ledger in Redis | Long conversations drift. The ledger is a small, citable record of what's been claimed so the agent (and judge) can spot contradictions. Cheap insurance. |
| 7 | Tools return errors as values, not thrown | If `read_file` throws, the whole turn dies. If it returns `{error: 'NOT_FOUND'}`, the agent reads it as a tool result and tries another path. Standard agent-loop pattern. |
| 8 | gpt-4.1 for agent, gpt-4o-mini for judge | Agent needs strong tool use across 8–15 turns. Judge needs JSON-clean structured output on small payloads — mini is plenty and ~20× cheaper. |
| 9 | Node runtime (not Edge) on `/api/chat` | Need `child_process` for ripgrep + `fs` for file reads. Edge can't do either. Pay the cold-start cost, get the capability. |
| 10 | TTL 24h on all session keys | No auth, no user accounts — sessions are demo-scoped. TTL is the cheapest cleanup mechanism. |

---

## What we're explicitly NOT building

- Auth, multi-user, billing
- Persistent cross-session memory or analytics
- Embeddings / vector search
- Repos > 50MB
- Multi-agent planner-executor splits
- Streaming the audit (it's polled — simpler, plenty fast for demo)
- Self-hosting the LLM
