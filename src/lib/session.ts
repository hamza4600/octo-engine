import { randomUUID } from "crypto";
import fs from "fs/promises";

import { redis } from "@/lib/redis";
import { log } from "@/lib/log";

import { StorageError } from "./errors";

import { checkRepoMetadata, cloneRepo, parseGithubUrl } from "./repo";
import { RepoError } from "./errors";
import { sessionRoot } from "./paths";
import type { RepoSummary } from "./repoSummary";
import { buildRepoSummary } from "./repoSummary";

const TTL_SECONDS = 24 * 60 * 60;
const MESSAGES_CAP = 200;

export type SessionRecord = {
  sessionId: string;
  url: string;
  owner: string;
  repo: string;
  repoPath: string;
  defaultBranch: string;
  summary: RepoSummary;
  createdAt: number;
};

type LedgerRow = {
  turnIndex?: number;
  fact: string;
  citation?: string;
};

function sessionKey(id: string): string {
  return `session:${id}`;
}

function messagesKey(id: string): string {
  return `messages:${id}`;
}

function ledgerKey(id: string): string {
  return `ledger:${id}`;
}

const LEDGER_INJECT_MAX_CHARS = 8000;

export async function getLedgerBullets(sessionId: string): Promise<string[]> {
  try {
    const rows = await redis.lrange<string>(ledgerKey(sessionId), 0, -1);
    if (!rows.length) return [];
    const out: string[] = [];
    for (const raw of rows) {
      try {
        const j =
          typeof raw === "string"
            ? (JSON.parse(raw) as LedgerRow)
            : typeof raw === "object" && raw !== null
              ? (raw as LedgerRow)
              : null;
        if (!j || typeof j.fact !== "string") {
          continue;
        }
        out.push(typeof j.citation === "string" && j.citation.length > 0 ? `${j.fact} (${j.citation})` : j.fact);
      } catch {
        continue;
      }
    }
    let capped = out.slice(-40);
    while (capped.length > 0) {
      const approx = capped.reduce((acc, b) => acc + b.length + 3, 0);
      if (approx <= LEDGER_INJECT_MAX_CHARS) {
        break;
      }
      capped = capped.slice(1);
    }
    return capped;
  } catch (err) {
    log.warn("ledger.read_failed", { sessionId, err });
    return [];
  }
}

/** Loads session metadata from Redis. Returns null if missing. */
export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  try {
    const data = await redis.hgetall<Record<string, string>>(sessionKey(sessionId));
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    const url = data.url;
    const owner = data.owner;
    const repo = data.repo;
    const repoPath = data.repoPath;
    const defaultBranch = data.defaultBranch;
    const createdAt = Number(data.createdAt);
    if (!url || !owner || !repo || !repoPath || !defaultBranch || Number.isNaN(createdAt)) {
      return null;
    }
    let summary: RepoSummary;
    try {
      summary = JSON.parse(data.summary ?? "{}") as RepoSummary;
      if (typeof summary.tree !== "string" || typeof summary.readmeExcerpt !== "string") {
        summary = { tree: "", readmeExcerpt: "" };
      }
    } catch {
      summary = { tree: "", readmeExcerpt: "" };
    }
    return {
      sessionId,
      url,
      owner,
      repo,
      repoPath,
      defaultBranch,
      summary,
      createdAt,
    };
  } catch (err) {
    log.error("session.get_failed", { sessionId, err });
    return null;
  }
}

export async function createSession(url: string): Promise<SessionRecord> {
  const parsed = parseGithubUrl(url);
  const { defaultBranch } = await checkRepoMetadata(parsed);

  const sessionId = `ses_${randomUUID().replace(/-/g, "")}`;
  const root = sessionRoot(sessionId);

  await cloneRepo(sessionId, url, defaultBranch);
  const summary = await buildRepoSummary(root);
  const now = Date.now();

  const record: SessionRecord = {
    sessionId,
    url: url.trim(),
    owner: parsed.owner,
    repo: parsed.repo,
    repoPath: root,
    defaultBranch,
    summary,
    createdAt: now,
  };

  try {
    await redis.hset(sessionKey(sessionId), {
      url: record.url,
      owner: record.owner,
      repo: record.repo,
      repoPath: record.repoPath,
      defaultBranch: record.defaultBranch,
      summary: JSON.stringify(summary),
      createdAt: String(now),
    });
    await redis.expire(sessionKey(sessionId), TTL_SECONDS);
  } catch (err) {
    log.error("session.redis_write_failed", { sessionId, err });
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
    throw new StorageError("Could not persist session");
  }

  log.info("session.created", { sessionId, owner: parsed.owner, repo: parsed.repo });
  return record;
}

const inFlightRepoEnsure = new Map<string, Promise<void>>();

async function repoExistsOnDisk(repoPath: string): Promise<boolean> {
  try {
    const st = await fs.stat(repoPath);
    if (!st.isDirectory()) return false;
    const entries = await fs.readdir(repoPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * Ensure the session's cloned repo exists on disk. Redis can outlive `/tmp`
 * (Vercel cross-invocation, OS cleanup of TEMP, antivirus). Re-clones from the
 * stored url + default branch when the dir is missing or empty. Concurrent
 * callers for the same sessionId share one in-flight clone.
 */
export async function ensureSessionRepo(session: SessionRecord): Promise<void> {
  if (await repoExistsOnDisk(session.repoPath)) return;

  const existing = inFlightRepoEnsure.get(session.sessionId);
  if (existing) {
    await existing;
    return;
  }

  const promise = (async () => {
    log.warn("session.repo_missing_reclone", {
      sessionId: session.sessionId,
      repoPath: session.repoPath,
    });
    try {
      await cloneRepo(session.sessionId, session.url, session.defaultBranch);
      log.info("session.repo_reclone_done", { sessionId: session.sessionId });
    } catch (err) {
      log.error("session.repo_reclone_failed", { sessionId: session.sessionId, err });
      if (err instanceof RepoError) {
        throw err;
      }
      throw new RepoError(
        err instanceof Error ? err.message : "Failed to re-clone repository",
        "CLONE_FAILED",
      );
    }
  })();

  inFlightRepoEnsure.set(session.sessionId, promise);
  try {
    await promise;
  } finally {
    inFlightRepoEnsure.delete(session.sessionId);
  }
}

/** Latest persisted assistant UI message text by id (Redis messages list; audit path). */
export async function findAssistantMessageText(sessionId: string, messageId: string): Promise<string | null> {
  try {
    const rawList = await redis.lrange<string>(messagesKey(sessionId), 0, -1);
    for (let i = rawList.length - 1; i >= 0; i--) {
      try {
        const rawItem = rawList[i];
        const msg: Record<string, unknown> | null =
          typeof rawItem === "string"
            ? (JSON.parse(rawItem) as Record<string, unknown>)
            : typeof rawItem === "object" && rawItem !== null
              ? (rawItem as Record<string, unknown>)
              : null;
        if (!msg) {
          continue;
        }
        if (msg.id !== messageId || msg.role !== "assistant") {
          continue;
        }
        return extractAssistantPlainText(msg);
      } catch {
        continue;
      }
    }
    return null;
  } catch (err) {
    log.warn("session.messages_scan_failed", { sessionId, messageId, err });
    return null;
  }
}

function extractAssistantPlainText(msg: Record<string, unknown>): string {
  if (typeof msg.content === "string") {
    return msg.content;
  }
  const parts = msg.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  let out = "";
  for (const p of parts) {
    if (typeof p !== "object" || p === null || !("type" in p)) {
      continue;
    }
    const typed = p as { type: string; text?: unknown };
    if (typed.type === "text" && typeof typed.text === "string") {
      out += typed.text;
    }
  }
  return out;
}

/** Plain text from a persisted or streaming assistant UI message (for ledger / audit). */
export function uiAssistantPlainText(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    return "";
  }
  return extractAssistantPlainText(payload as Record<string, unknown>);
}

export async function getMessagesCount(sessionId: string): Promise<number> {
  try {
    const n = await redis.llen(messagesKey(sessionId));
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  } catch (err) {
    log.warn("session.messages_len_failed", { sessionId, err });
    return 0;
  }
}

export async function appendAssistantMessage(sessionId: string, payload: unknown): Promise<void> {
  try {
    const raw = JSON.stringify(payload);
    await redis.rpush(messagesKey(sessionId), raw);
    await redis.ltrim(messagesKey(sessionId), -MESSAGES_CAP, -1);
    await redis.expire(messagesKey(sessionId), TTL_SECONDS);
  } catch (err) {
    log.error("session.append_message_failed", { sessionId, err });
    throw err;
  }
}

export const SESSION_TTL_SECONDS = TTL_SECONDS;
