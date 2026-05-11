import { createWriteStream } from "node:fs";
import fs from "fs/promises";
import path from "path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import extract from "extract-zip";

import { log } from "@/lib/log";

import { RepoError } from "./errors";
import { parseGithubUrl, type ParsedGithubUrl } from "./github-repo-url";
import { sessionRoot } from "./paths";

export type { ParsedGithubUrl } from "./github-repo-url";
export { parseGithubUrl } from "./github-repo-url";

/** GitHub `size` field is KB (see GitHub REST API docs). */
const MAX_METADATA_SIZE_KB = 50_000;

/** Working tree after download must not exceed this (CHECKLIST). */
const MAX_ON_DISK_BYTES = 80 * 1024 * 1024;

const CLONE_TIMEOUT_MS = 60_000;
const METADATA_TIMEOUT_MS = 10_000;

type GithubRepoApi = {
  private?: boolean;
  size?: number;
  default_branch?: string;
};

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "codebase-investigator-mvp",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export type RepoMetadata = {
  defaultBranch: string;
};

export async function checkRepoMetadata(parsed: ParsedGithubUrl): Promise<RepoMetadata> {
  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: githubHeaders(),
    });
    if (res.status === 404) {
      throw new RepoError("Repository not found or not accessible", "NOT_FOUND");
    }
    if (!res.ok) {
      throw new RepoError(`GitHub API error (${res.status})`, "METADATA_FAILED");
    }
    const body = (await res.json()) as GithubRepoApi;
    if (body.private === true) {
      throw new RepoError("Repository is private or not accessible", "NOT_FOUND");
    }
    if (typeof body.size === "number" && body.size > MAX_METADATA_SIZE_KB) {
      throw new RepoError("Repository exceeds maximum size (50MB metadata limit)", "TOO_LARGE");
    }
    const defaultBranch =
      typeof body.default_branch === "string" && body.default_branch.trim().length > 0
        ? body.default_branch.trim()
        : null;
    if (defaultBranch === null) {
      throw new RepoError("GitHub did not return a default branch for this repository", "METADATA_FAILED");
    }
    return { defaultBranch };
  } catch (err) {
    if (err instanceof RepoError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new RepoError("GitHub metadata request timed out", "METADATA_FAILED");
    }
    throw new RepoError(
      err instanceof Error ? err.message : "Failed to verify repository metadata",
      "METADATA_FAILED",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function directorySizeBytes(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(full);
    } else if (entry.isFile()) {
      const st = await fs.stat(full);
      total += st.size;
    }
  }
  return total;
}

async function streamResponseBodyToFile(res: Response, filePath: string): Promise<void> {
  if (!res.body) {
    throw new RepoError("Empty response body from GitHub", "CLONE_FAILED");
  }
  const webStream = res.body as unknown as import("stream/web").ReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(webStream), createWriteStream(filePath));
}

/**
 * Download GitHub zipball and extract so `sessionRoot(sessionId)` is the repo root (no `.git`).
 * Requires `defaultBranch` from {@link checkRepoMetadata}.
 */
export async function cloneRepo(sessionId: string, url: string, defaultBranch: string): Promise<void> {
  const parsed = parseGithubUrl(url);

  const dest = sessionRoot(sessionId);
  const stagingDir = path.join(tmpdir(), `sessions-staging-${sessionId}`);
  const zipPath = path.join(tmpdir(), `sessions-zip-${sessionId}.zip`);

  await fs.rm(dest, { recursive: true, force: true }).catch(() => undefined);
  await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  await fs.unlink(zipPath).catch(() => undefined);

  const zipUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/zipball/${encodeURIComponent(
    defaultBranch,
  )}`;
  log.info("clone.start", { sessionId, owner: parsed.owner, repo: parsed.repo, defaultBranch });

  const controller = new AbortController();
  let cloneTimedOut = false;
  const timer = setTimeout(() => {
    cloneTimedOut = true;
    controller.abort();
  }, CLONE_TIMEOUT_MS);

  try {
    const res = await fetch(zipUrl, {
      signal: controller.signal,
      headers: githubHeaders(),
      redirect: "follow",
    });
    if (res.status === 404) {
      throw new RepoError("Repository archive not found or branch missing", "NOT_FOUND");
    }
    if (!res.ok) {
      throw new RepoError(`GitHub archive error (${res.status})`, "CLONE_FAILED");
    }
    await streamResponseBodyToFile(res, zipPath);
    await fs.mkdir(stagingDir, { recursive: true });
    await extract(zipPath, { dir: stagingDir });
    await flattenGithubZipRoot(stagingDir, dest);
  } catch (err) {
    await fs.rm(dest, { recursive: true, force: true }).catch(() => undefined);
    if (err instanceof RepoError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (cloneTimedOut || (err instanceof Error && err.name === "AbortError")) {
      throw new RepoError("Clone timed out", "CLONE_TIMEOUT");
    }
    if (/timeout|timed out/i.test(message)) {
      throw new RepoError("Clone timed out", "CLONE_TIMEOUT");
    }
    throw new RepoError(`Clone failed: ${message}`, "CLONE_FAILED");
  } finally {
    clearTimeout(timer);
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.unlink(zipPath).catch(() => undefined);
  }

  let bytes = 0;
  try {
    bytes = await directorySizeBytes(dest);
  } catch (sizeErr) {
    log.warn("clone.size_check_failed", { sessionId, err: sizeErr });
  }
  if (bytes > MAX_ON_DISK_BYTES) {
    await fs.rm(dest, { recursive: true, force: true }).catch(() => undefined);
    throw new RepoError("Repository exceeds maximum size after clone", "TOO_LARGE");
  }

  log.info("clone.done", { sessionId, bytes });
}

/** GitHub zipballs contain a single top-level directory `{owner}-{repo}-{sha}`. */
async function flattenGithubZipRoot(stagingDir: string, dest: string): Promise<void> {
  const entries = await fs.readdir(stagingDir, { withFileTypes: true });
  const only = entries[0];
  if (entries.length !== 1 || only === undefined || !only.isDirectory()) {
    throw new RepoError("Unexpected archive layout from GitHub", "CLONE_FAILED");
  }
  const inner = path.join(stagingDir, only.name);
  await fs.mkdir(dest, { recursive: true });
  const innerNames = await fs.readdir(inner);
  for (const name of innerNames) {
    await fs.rename(path.join(inner, name), path.join(dest, name));
  }
}
