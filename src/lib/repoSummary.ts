import type { Dirent } from "fs";
import fs from "fs/promises";
import path from "path";

const SKIP_DIR = new Set([
  ".git",
  "node_modules",
  "dist",
  ".next",
  "build",
  ".turbo",
]);

const README_NAMES = ["readme.md", "README.md", "Readme.md", "readme.txt", "README.txt"];

/** Directory levels below repo root to expand (root = 0; value 2 ⇒ root + two nested levels). */
const TREE_DEPTH_LIMIT = 2;

const README_MAX_LINES = 80;

export type RepoSummary = {
  tree: string;
  readmeExcerpt: string;
};

async function treeLines(absDir: string, indent: string, depthFromRoot: number): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sorted = entries
    .filter((e) => !SKIP_DIR.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = [];
  for (const e of sorted) {
    const mark = e.isDirectory() ? "/" : "";
    lines.push(`${indent}${e.name}${mark}`);
    if (e.isDirectory() && depthFromRoot < TREE_DEPTH_LIMIT) {
      lines.push(
        ...(await treeLines(path.join(absDir, e.name), `${indent}  `, depthFromRoot + 1)),
      );
    }
  }
  return lines;
}

async function readFirstReadme(repoRoot: string): Promise<string | null> {
  for (const name of README_NAMES) {
    const full = path.join(repoRoot, name);
    try {
      const st = await fs.stat(full);
      if (st.isFile()) {
        const raw = await fs.readFile(full, "utf8");
        return raw;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function buildRepoSummary(repoRoot: string): Promise<RepoSummary> {
  const tree = (await treeLines(repoRoot, "", 0)).join("\n");
  const readmeRaw = await readFirstReadme(repoRoot);
  const readmeExcerpt = readmeRaw
    ? readmeRaw
        .split(/\r?\n/)
        .slice(0, README_MAX_LINES)
        .join("\n")
        .trimEnd()
    : "";

  return {
    tree: tree.length > 0 ? tree : "(empty repository tree)",
    readmeExcerpt:
      readmeExcerpt.length > 0 ? readmeExcerpt : "(no README at repository root — use tools to explore)",
  };
}
