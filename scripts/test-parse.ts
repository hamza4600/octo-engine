/**
 * Quick assertions for parseGithubUrl — run: npx tsx scripts/test-parse.ts
 */
import { ValidationError } from "../src/lib/errors";
import { parseGithubUrl } from "../src/lib/repo";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const ok: Array<[string, { owner: string; repo: string }]> = [
  ["https://github.com/foo/bar", { owner: "foo", repo: "bar" }],
  ["https://github.com/foo/bar.git", { owner: "foo", repo: "bar" }],
  ["https://github.com/foo/bar/", { owner: "foo", repo: "bar" }],
  ["https://github.com/foo/bar/tree/main/src", { owner: "foo", repo: "bar" }],
  ["https://github.com/acme/widget.ext", { owner: "acme", repo: "widget.ext" }],
];

for (const [url, expected] of ok) {
  const r = parseGithubUrl(url);
  assert(r.owner === expected.owner && r.repo === expected.repo, `parse ${url}`);
}

function assertThrows(url: string): void {
  try {
    parseGithubUrl(url);
    throw new Error(`expected ValidationError for ${url}`);
  } catch (e) {
    assert(e instanceof ValidationError, `wrong error type for ${url}`);
  }
}

assertThrows("https://gitlab.com/foo/bar");
assertThrows("not-a-url");

console.log("parseGithubUrl tests passed.");
