import { ValidationError } from "./errors";

export type ParsedGithubUrl = {
  owner: string;
  repo: string;
};

const GITHUB_REPO_URL =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?(?:\/)?$/i;

type ParseResult =
  | { ok: true; owner: string; repo: string }
  | { ok: false; kind: "invalid_url" | "not_https_github" | "bad_repo_path" };

function parseGithubRepoUrlResult(urlString: string): ParseResult {
  const trimmed = urlString.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, kind: "invalid_url" };
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    return { ok: false, kind: "not_https_github" };
  }
  const match = parsed.href.match(GITHUB_REPO_URL);
  if (!match?.[1] || !match[2]) {
    return { ok: false, kind: "bad_repo_path" };
  }
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  return { ok: true, owner, repo };
}

/** Same rules as the session API: https://github.com/{owner}/{repo} only. */
export function parseGithubUrl(urlString: string): ParsedGithubUrl {
  const r = parseGithubRepoUrlResult(urlString);
  if (r.ok) {
    return { owner: r.owner, repo: r.repo };
  }
  switch (r.kind) {
    case "invalid_url":
      throw new ValidationError("Invalid URL", "INVALID_URL");
    case "not_https_github":
      throw new ValidationError("Only https://github.com URLs are supported", "INVALID_URL");
    case "bad_repo_path":
      throw new ValidationError("Expected https://github.com/{owner}/{repo}", "INVALID_URL");
  }
}

export function isGithubRepoUrl(urlString: string): boolean {
  return parseGithubRepoUrlResult(urlString).ok;
}
