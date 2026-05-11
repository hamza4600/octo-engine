/**
 * Deterministic checks for programmaticCheck (TASK T40).
 * Run: npm run test-programmatic
 *
 * Builds a real session sandbox under tmpdir, drops a fixture file, and asserts
 * the four reason codes plus the happy-path snippet shape.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { parseCitations } from "../src/lib/audit/parseCitations";
import { programmaticCheck } from "../src/lib/audit/programmaticCheck";
import { sessionRoot } from "../src/lib/paths";

const sessionId = `test-${randomUUID()}`;
const root = sessionRoot(sessionId);
const fileRel = "src/foo.ts";
const fileAbs = path.join(root, fileRel);

const fixture = [
  "export function greet(name: string) {",
  "  return `hello, ${name}`;",
  "}",
  "",
  "export const ANSWER = 42;",
].join("\n");

async function setup(): Promise<void> {
  await fs.mkdir(path.dirname(fileAbs), { recursive: true });
  await fs.writeFile(fileAbs, fixture, "utf8");
}

async function teardown(): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
}

async function main(): Promise<void> {
  await setup();
  try {
    const text = [
      "valid single: src/foo.ts:1",
      "valid range: src/foo.ts:1-3",
      "out of range: src/foo.ts:99",
      "missing file: src/missing.ts:1",
      "escape: [oops](../escape.ts:1)",
    ].join("\n");

    const citations = parseCitations(text);
    const rows = await programmaticCheck(sessionId, citations);
    const byCitation = new Map(rows.map((r) => [r.citation, r] as const));

    const validSingle = byCitation.get("src/foo.ts:1");
    assert.ok(validSingle, "expected row for src/foo.ts:1");
    assert.equal(validSingle.valid, true);
    assert.ok(validSingle.snippet?.includes("export function greet"), "snippet should contain line 1");

    const validRange = byCitation.get("src/foo.ts:1-3");
    assert.ok(validRange, "expected row for src/foo.ts:1-3");
    assert.equal(validRange.valid, true);
    assert.ok(validRange.snippet?.includes("hello, ${name}"), "range snippet should contain line 2");
    assert.ok(validRange.snippet?.split("\n").length === 3, "range snippet should be 3 lines");

    const outOfRange = byCitation.get("src/foo.ts:99");
    assert.ok(outOfRange, "expected row for src/foo.ts:99");
    assert.equal(outOfRange.valid, false);
    assert.equal(outOfRange.reason, "OUT_OF_RANGE");

    const missing = byCitation.get("src/missing.ts:1");
    assert.ok(missing, "expected row for src/missing.ts:1");
    assert.equal(missing.valid, false);
    assert.equal(missing.reason, "FILE_NOT_FOUND");

    const escape = byCitation.get("../escape.ts:1");
    assert.ok(escape, "expected row for ../escape.ts:1");
    assert.equal(escape.valid, false);
    assert.equal(escape.reason, "PATH_ESCAPE");

    console.log("test-programmatic-check: ok");
  } finally {
    await teardown();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
