# System Design

Sequence diagrams, state lifecycles, failure modes, and scaling considerations. Architecture (the *what*) is in `ARCHITECTURE.md`; this is the *how it behaves over time*.

---

## Sequence: full turn lifecycle

```
User      Browser                 Next.js API              Redis            OpenAI          /tmp
 │           │                         │                     │                 │              │
 │ paste URL │                         │                     │                 │              │
 ├──────────▶│ POST /api/session       │                     │                 │              │
 │           ├────────────────────────▶│ parseGithubUrl      │                 │              │
 │           │                         │ cloneRepo (60s max) │                 │              │
 │           │                         ├──────────────────── git clone ────────┼─────────────▶│
 │           │                         │ build summary       │                 │              │
 │           │                         ├────────────────────▶│ SET session:<id>│              │
 │           │ {sessionId}             │                     │                 │              │
 │           │◀────────────────────────│                     │                 │              │
 │ "ready"   │                         │                     │                 │              │
 │           │                         │                     │                 │              │
 │ ask Q     │                         │                     │                 │              │
 ├──────────▶│ POST /api/chat (stream) │                     │                 │              │
 │           ├────────────────────────▶│ load session+ledger │                 │              │
 │           │                         ├────────────────────▶│ GET …           │              │
 │           │                         │ streamText(...)     │                 │              │
 │           │                         ├─────────────────────┼────────────────▶│ tool_call:   │
 │           │                         │                     │                 │  grep("…")   │
 │           │                         │ execute tool        │                 │              │
 │           │                         ├─────────────────────┼─────────────────┼─────────────▶│
 │           │ tool-call chip          │                     │                 │              │
 │           │◀──── stream ────────────│                     │                 │ tool_result  │
 │           │                         ├─────────────────────┼────────────────▶│              │
 │           │ … repeats up to maxSteps│                     │                 │              │
 │           │ final tokens            │                     │                 │              │
 │           │◀──── stream ────────────│                     │                 │              │
 │           │                         │ onFinish:           │                 │              │
 │           │                         ├────────────────────▶│ RPUSH messages  │              │
 │           │                         ├──fire-and-forget POST /api/audit ──▶  │              │
 │           │                         ├──fire-and-forget extractFacts ────────▶ (gpt-4o-mini)│
 │           │                         │                     │                 │              │
 │           │ poll GET /api/audit (1s)│                     │                 │              │
 │           ├────────────────────────▶│ GET audit:<id>:<msg>│                 │              │
 │           │ pending                 │                     │                 │              │
 │           │◀────────────────────────│                     │                 │              │
 │           │                         │ (audit completes)   │                 │              │
 │           │ verdict                 │                     │                 │              │
 │           │◀────────────────────────│                     │                 │              │
 │ badge ✓   │                         │                     │                 │              │
```

---

## Sequence: audit (separate-context guarantee)

```
/api/audit
   │
   ├── parseCitations(answer.text)  →  [{path, startLine, endLine}]
   │
   ├── parallel ───────────────┬──────────────────────────┐
   │                           │                          │
   ▼                           ▼                          │
programmaticCheck             judge (gpt-4o-mini)         │
  for each citation:            input ONLY:               │
    sandbox-resolve path           - answer text          │
    fs.exists?                     - resolved snippets    │
    line in range?                 - facts ledger         │
    optional: substring         system prompt: judge.ts   │
    return                      NO chat history           │
    {citation, valid,           NO agent system prompt    │
     reason, snippet?}          temperature 0             │
                                generateObject (Zod)      │
                                returns                   │
                                {verdict, claims,         │
                                 risks, contradictions}   │
   │                           │                          │
   └─────────── merge ─────────┘                          │
                │                                         │
                ▼                                         │
       SET audit:<id>:<msgId> {programmatic, judge,       │
                               mergedVerdict}             │
                ▼                                         │
            Redis (TTL 24h)                               │
```

**The "separate context" guarantee in code:**
- Different model (gpt-4o-mini vs gpt-4.1)
- Different system prompt file (`prompts/judge.ts` vs `prompts/system.ts`)
- Zero chat history sent to the judge — only the answer string + resolved snippets + ledger
- Different process call (separate HTTP request to OpenAI)
- Plus: programmatic check is fully deterministic, no LLM at all

---

## State lifecycle

### Session
```
                ┌──────────┐  POST /session
        ────────▶ creating  ├─────────────┐
                └──────────┘              │
                     │                    ▼
                     │           ┌─────────────────┐  clone fail
                     │           │  cloning        ├──────────────▶ failed
                     │           └─────────────────┘
                     │                    │ ok
                     ▼                    ▼
              ┌──────────┐         ┌──────────┐    every msg     ┌──────────┐
              │  ready   │◀────────│ summarized│ ──────────────▶ │  active  │
              └──────────┘         └──────────┘                  └─────┬────┘
                                                                      │ 24h TTL
                                                                      ▼
                                                                  expired
```

### Message
```
   user input ─▶ pending ─▶ streaming ─▶ complete ─┬─▶ audited
                                                    └─▶ audit-failed (grey badge)
```

### Audit
```
   queued ─▶ programmatic running ─┬─▶ both done ─▶ stored
            │                       │
            └─▶ judge running ──────┘
                  │
                  └─▶ judge timeout / error ─▶ partial verdict (programmatic only)
```

---

## Failure modes and recovery

| Failure | Detection | Behavior | User sees |
|---|---|---|---|
| Bad GitHub URL | Zod parse | 400 from `/api/session` | Toast: "Not a valid GitHub URL" |
| Repo > 50MB | post-clone size check | `RepoError('TOO_LARGE')`, delete `/tmp/<id>`, 422 | Toast: "Repo too large for the demo" |
| Clone timeout (60s) | `Promise.race` with timer | kill child process, 504 | Toast: "Clone took too long — try a smaller repo" |
| Repo not found / private | git stderr exit | `RepoError('NOT_FOUND')`, 404 | Toast: "Repo not found or private" |
| Tool error (file missing, ripgrep fails) | tool wrapper | **return as tool result**, agent retries | invisible — agent self-corrects |
| Tool exceeds 15s | spawn timeout | kill, return `{error: 'TIMEOUT'}` as tool result | agent picks another path |
| OpenAI 429 (rate limit) | API status | bubble, 429 with retry-after | Toast: "Rate-limited, try again" + retry button |
| OpenAI 5xx | API status | one retry with backoff, then 502 | Toast: "Model is having issues" |
| Stream interrupted mid-turn | AI SDK `onError` | log, emit error chunk, persist what we have | partial assistant message + retry button |
| Judge JSON parse fail | Zod | one retry with stricter prompt; if still fails, store `{verdict: 'unknown'}` | grey badge: "Audit unavailable" |
| Programmatic check finds invalid citation | logic | mark invalid, included in verdict | red/amber badge with the bad citations listed |
| Redis unreachable | Upstash client error | 503 from `/api/chat`, surface in UI | Toast: "Storage unavailable" |
| `/tmp/<id>` evicted (cold start) | `fs.exists` false in tool | re-clone from session metadata in Redis | brief "re-preparing" indicator, then resumes |
| Vercel function timeout (300s) | platform | client times out, message marked failed | Toast: "Turn took too long" + retry |

---

## Concurrency and rate limits

- One in-flight chat request per session at a time. Client disables input until the stream ends.
- Audit runs concurrent with the next user-typing window — never blocks the chat input.
- OpenAI tier-1 dev keys: ~500 RPM for `gpt-4.1`, plenty for one demo user. No client-side throttling needed.
- Upstash free tier: 10k commands/day — well under our budget (~30 commands per turn).

---

## Performance budgets

| Operation | Target p50 | Notes |
|---|---|---|
| Clone (small repo, ~5MB) | < 8s | `--depth 1` keeps it fast |
| First token (chat) | < 2s | depends on OpenAI; AI SDK streams immediately |
| Tool call (grep) | < 1s | ripgrep on 5–20k LOC is sub-100ms; overhead is spawn + parse |
| Tool call (read 200 lines) | < 200ms | filesystem |
| Full turn (3–5 tool calls) | 5–15s | dominated by model latency |
| Audit (programmatic) | < 500ms | pure I/O over a few files |
| Audit (judge) | < 4s | small payload, mini model |
| End-to-end first answer (cold session) | < 25s | clone + summary + first turn |

---

## Scaling notes (out of scope, but explained)

If this graduated past demo:
- Move clones to a persistent volume (Fly.io / Render with disks) so cold starts don't re-clone.
- Replace tools with an indexed search service (Sourcegraph or a homegrown ctags + ripgrep cache).
- Add embeddings for "find similar code" tools — but only as a *complement* to ripgrep, not a replacement.
- Per-user auth + per-user session quotas.
- Move the judge to an async queue (Inngest / QStash) and webhook the verdict back to the client.
- Migrate from Redis to Postgres for messages — Redis is great for session-scoped, bad for analytics.
- Track judge-vs-human agreement over time as the system's true quality metric.

---

## Security

- **Path traversal**: every tool resolves user input against the session root and rejects anything that escapes (`!resolvedPath.startsWith(sessionRoot)`).
- **Shell injection**: ripgrep spawned via `spawn(args[])`, never via shell string interpolation.
- **Public repos only**: simple-git over HTTPS without credentials; private repos fail naturally with 404.
- **Secrets**: only in server env; never in client bundle. `next.config.js` doesn't expose them.
- **Rate limiting**: out of scope for demo; would add `@upstash/ratelimit` per-IP if it shipped.
- **Untrusted repo content**: file contents are passed to the LLM, not executed. We never run repo code.
