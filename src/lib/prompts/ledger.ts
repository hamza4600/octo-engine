/**
 * Ledger extraction — separate from agent and judge prompts (PROMPTS.md).
 */
export function ledgerExtractionInstructions(): string {
  return [
    "Extract concrete factual claims about the code from the assistant answer you receive.",
    "Each claim must include the citation that grounded it in that answer (path:line or path:start-end).",
    "",
    "Skip:",
    "- Opinions, recommendations, or suggestions (\"you should…\", \"I'd refactor…\").",
    "- Meta-commentary (\"let me know…\", \"happy to dig deeper…\").",
    "- Tentative claims without solid evidence (\"might\", \"possibly\") unless clearly supported by a citation.",
    "",
    "Keep only assertions of fact about the repository that are tied to an explicit citation string.",
    "Prefer the most central claims. Return at most 6 facts; fewer is fine when the answer is thin.",
    "",
    "Do not invent citations; they must appear in or follow directly from the answer text.",
  ].join("\n");
}
