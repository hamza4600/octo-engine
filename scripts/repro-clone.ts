/**
 * Reproduces the cloneRepo path to verify files actually land on disk.
 * Run: npx tsx scripts/repro-clone.ts
 */
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { checkRepoMetadata, cloneRepo, parseGithubUrl } from "../src/lib/repo";
import { sessionRoot } from "../src/lib/paths";

async function main(): Promise<void> {
  const url = process.argv[2] ?? process.env.REPRO_URL ?? "https://github.com/hamza4600/go-scrapper";
  const sid = `repro-${randomUUID()}`;
  const root = sessionRoot(sid);
  console.log("[repro] session root:", root);

  const parsed = parseGithubUrl(url);
  const meta = await checkRepoMetadata(parsed);
  console.log("[repro] default branch:", meta.defaultBranch);

  await cloneRepo(sid, url, meta.defaultBranch);

  console.log("[repro] reading root");
  const entries = await fs.readdir(root, { withFileTypes: true });
  console.log(
    entries.map((e) => `  ${e.isDirectory() ? "D" : "F"} ${e.name}`).join("\n") || "  (empty)",
  );

  await fs.rm(root, { recursive: true, force: true });
  console.log("[repro] cleanup ok");
}

main().catch((err) => {
  console.error("[repro] failed:", err);
  process.exit(1);
});
