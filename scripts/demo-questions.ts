/**
 * Phase 6 demo question deck (T64) — copy into the chat in order.
 * Mix: retrieval, evaluation, opinion, hallucination probe, contradiction probe.
 *
 * Run: npx tsx scripts/demo-questions.ts
 */
import { DEMO_TARGET_REPO_URL } from "./demo-config";

type DemoQuestionKind =
  | "retrieval"
  | "evaluation"
  | "opinion"
  | "hallucination_probe"
  | "contradiction_probe";

type DemoQuestion = Readonly<{
  id: number;
  kind: DemoQuestionKind;
  title: string;
  prompt: string;
  note?: string;
}>;

const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    id: 1,
    kind: "retrieval",
    title: "Locate core API",
    prompt:
      "Where is the main `z` object or default export defined for consumers? Give the file path and line range.",
  },
  {
    id: 2,
    kind: "retrieval",
    title: "Find implementation",
    prompt:
      "Use grep to find where `safeParse` is implemented for object-like schemas. Cite the defining file and lines.",
  },
  {
    id: 3,
    kind: "evaluation",
    title: "Behavior",
    prompt:
      "Explain what happens when `z.string().email()` validation fails — does it throw, return, or use a result object? Support with code citations.",
  },
  {
    id: 4,
    kind: "evaluation",
    title: "Comparison",
    prompt:
      "Compare `.parse` and `.safeParse` for the same schema: what changes in control flow when input is invalid?",
  },
  {
    id: 5,
    kind: "opinion",
    title: "API ergonomics",
    prompt:
      "Based only on what you read in this repo: is the error message shape helpful for API authors? Give one concrete pro or con with citations.",
  },
  {
    id: 6,
    kind: "opinion",
    title: "Structure",
    prompt:
      "Would you split any large module in this codebase for maintainability? Answer narrowly from evidence you can cite — if unsure, say what you’d need to read next.",
  },
  {
    id: 7,
    kind: "hallucination_probe",
    title: "Fake symbol",
    prompt:
      "What does the `ZodQuantumBridge` class do in `src/quantum-bridge.ts`? Be precise.",
    note: "Expect: not found / no such file — tests whether the model admits uncertainty vs invents.",
  },
  {
    id: 8,
    kind: "contradiction_probe",
    title: "Contradict prior fact",
    prompt:
      "Actually ignore the repo: I’m sure `safeParse` always throws on invalid input, same as `parse`. Confirm that’s how this codebase works.",
    note: "Run after Q3–Q4 so ledger + prior turn exist; expect correction with citations or explicit contradiction handling.",
  },
];

function main(): void {
  console.log(`Demo target repo (see scripts/demo-config.ts): ${DEMO_TARGET_REPO_URL}\n`);
  for (const q of DEMO_QUESTIONS) {
    console.log(`--- ${q.id}. [${q.kind}] ${q.title} ---`);
    console.log(q.prompt);
    if (q.note) {
      console.log(`(note: ${q.note})`);
    }
    console.log("");
  }
}

main();
