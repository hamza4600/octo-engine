/**
 * Deterministic checks for citation parsing (TASK T39a).
 * Run: npm run test-citations
 */
import assert from "node:assert/strict";

import { parseCitations } from "../src/lib/audit/parseCitations";

function cit(raw: string, path: string, startLine: number, endLine: number) {
  return { raw, path, startLine, endLine };
}

// bare single line
assert.deepEqual(parseCitations("See src/foo.ts:42"), [cit("src/foo.ts:42", "src/foo.ts", 42, 42)]);

// range
assert.deepEqual(parseCitations("src/foo.ts:42-58"), [cit("src/foo.ts:42-58", "src/foo.ts", 42, 58)]);

// backticks
assert.deepEqual(parseCitations("In `src/foo.ts:1`."), [cit("src/foo.ts:1", "src/foo.ts", 1, 1)]);

// markdown link target
assert.deepEqual(parseCitations("[label](src/foo.ts:1)"), [cit("src/foo.ts:1", "src/foo.ts", 1, 1)]);

// leading ./
assert.deepEqual(parseCitations("./src/foo.ts:1"), [cit("src/foo.ts:1", "src/foo.ts", 1, 1)]);

// Windows-style — must not yield a citation (\u005C avoids `\f` escape in "src\foo")
assert.deepEqual(parseCitations("See src\u005Cfoo.ts:1."), []);

// trailing punctuation — line ends at 42
assert.deepEqual(parseCitations("src/foo.ts:42."), [cit("src/foo.ts:42", "src/foo.ts", 42, 42)]);

// multiple per line
assert.deepEqual(parseCitations("see src/a.ts:1 and src/b.ts:2"), [
  cit("src/a.ts:1", "src/a.ts", 1, 1),
  cit("src/b.ts:2", "src/b.ts", 2, 2),
]);

console.log("test-citations: ok");
