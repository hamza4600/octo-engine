/**
 * Clone a tiny public repo and exercise all four investigation tools.
 * Run: npx tsx scripts/smoke.ts
 *
 * Requires .env.local with GitHub-accessible network (no auth for public repos).
 */
import { randomUUID } from "crypto";

import { checkRepoMetadata, cloneRepo, parseGithubUrl } from "../src/lib/repo";
import { findFilesTool } from "../src/lib/tools/findFiles";
import { grepTool } from "../src/lib/tools/grep";
import { listDirectory } from "../src/lib/tools/listDirectory";
import { readFileTool } from "../src/lib/tools/readFile";

const DEMO_URL = "https://github.com/hamza4600/go-scrapper";

async function main(): Promise<void> {
  const sessionId = randomUUID();
  const parsed = parseGithubUrl(DEMO_URL);

  console.log("metadata check…", parsed);
  const { defaultBranch } = await checkRepoMetadata(parsed);

  console.log("clone…", DEMO_URL, "→", sessionId);
  await cloneRepo(sessionId, DEMO_URL, defaultBranch);

  console.log("\n--- list_directory . ---");
  console.dir(await listDirectory(sessionId, { path: "." }), { depth: null });

  console.log("\n--- read_file package.json ---");
  console.dir(await readFileTool(sessionId, { path: "package.json" }), { depth: null });

  console.log("\n--- grep export ---");
  console.dir(await grepTool(sessionId, { pattern: "export" }), { depth: null });

  console.log("\n--- find_files *.json ---");
  console.dir(await findFilesTool(sessionId, { glob: "**/*.json" }), { depth: null });

  console.log("\nSmoke completed OK.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
