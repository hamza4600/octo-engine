import fs from "fs/promises";
import path from "path";
import simpleGit from "simple-git";

import { log } from "@/lib/log";

import { RepoError } from "./errors";
import { parseGithubUrl, type ParsedGithubUrl } from "./github-repo-url";
import { sessionRoot } from "./paths";

export type { ParsedGithubUrl } from "./github-repo-url";
export { parseGithubUrl } from "./github-repo-url";

/** GitHub `size` field is KB (see GitHub REST API docs). */
const MAX_METADATA_SIZE_KB = 50_000;

/** Post-clone working tree + `.git` must not exceed this (CHECKLIST). */
const MAX_ON_DISK_BYTES = 80 * 1024 * 1024;

const CLONE_TIMEOUT_MS = 60_000;
const METADATA_TIMEOUT_MS = 10_000;

type GithubRepoApi = {
  private?: boolean;
  size?: number;
};

export async function checkRepoMetadata(parsed: ParsedGithubUrl): Promise<void> {
  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "codebase-investigator-mvp",
      },
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

export async function cloneRepo(sessionId: string, url: string): Promise<void> {
  const parsed = parseGithubUrl(url);

  const dest = sessionRoot(sessionId);
  await fs.rm(dest, { recursive: true, force: true }).catch(() => undefined);

  const cloneUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
  log.info("clone.start", { sessionId, owner: parsed.owner, repo: parsed.repo });

  const git = simpleGit();

  try {
    await Promise.race([
      git.clone(cloneUrl, dest, ["--depth", "1", "--single-branch"]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new RepoError("Clone timed out", "CLONE_TIMEOUT")), CLONE_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    await fs.rm(dest, { recursive: true, force: true }).catch(() => undefined);
    if (err instanceof RepoError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/timeout|timed out/i.test(message)) {
      throw new RepoError("Clone timed out", "CLONE_TIMEOUT");
    }
    throw new RepoError(`Clone failed: ${message}`, "CLONE_FAILED");
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

/** Current checked-out branch after shallow clone (typically default branch). */
export async function readDefaultBranch(sessionId: string): Promise<string> {
  const git = simpleGit(sessionRoot(sessionId));
  const ref = await git.revparse(["--abbrev-ref", "HEAD"]);
  const trimmed = ref.trim();
  return trimmed.length > 0 ? trimmed : "main";
}
