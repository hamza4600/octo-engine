/**
 * Extract repository-relative citations like path/file.ts:LINE or path/file.ts:START-END.
 * Invalid segments are skipped; never throws.
 */

export type ParsedCitation = {
  /** Canonical display key */
  raw: string;
  /** Normalized repo-relative path */
  path: string;
  startLine: number;
  endLine: number;
};

const LINE_TAIL = /:(\d+)(?:-(\d+))?$/;

function dedupeKey(c: ParsedCitation): string {
  return `${c.path}:${c.startLine}:${c.endLine}`;
}

/** Strip `./`; reject paths with Windows separators. */
function normalizeRawPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.includes("\\")) {
    return null;
  }
  let p = trimmed;
  if (p.startsWith("./")) {
    p = p.slice(2);
  }
  return p.length > 0 ? p : null;
}

export function parsePathAndLines(fragment: string): ParsedCitation | null {
  try {
    const m = fragment.trim().match(LINE_TAIL);
    if (!m?.[1]) {
      return null;
    }
    const pathRaw = fragment.trim().slice(0, m.index);
    const normalizedPath = normalizeRawPath(pathRaw);
    if (!normalizedPath || !normalizedPath.includes(".")) {
      return null;
    }
    let startLine = Number(m[1]);
    let endLine = m[2] !== undefined ? Number(m[2]) : startLine;
    if (!Number.isFinite(startLine) || startLine < 1 || !Number.isFinite(endLine) || endLine < 1) {
      return null;
    }
    if (endLine < startLine) {
      const tmp = startLine;
      startLine = endLine;
      endLine = tmp;
    }
    const raw = `${normalizedPath}:${startLine}${endLine !== startLine ? `-${endLine}` : ""}`;
    return {
      raw,
      path: normalizedPath,
      startLine,
      endLine,
    };
  } catch {
    return null;
  }
}

function addUnique(map: Map<string, ParsedCitation>, c: ParsedCitation | null): void {
  if (!c) return;
  map.set(dedupeKey(c), c);
}

/**
 * Scan prose / markdown for citations. Deduped by path + line range.
 */
export function parseCitations(text: string): ParsedCitation[] {
  try {
    const unique = new Map<string, ParsedCitation>();

    const linkRe = /\[([^\]]*)\]\(([^)]+\.\w+:\d+(?:-\d+)?)\)/g;
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(text)) !== null) {
      const target = lm[2];
      if (typeof target === "string") {
        addUnique(unique, parsePathAndLines(target));
      }
    }

    const tickRe = /`([^`]*\.\w+:\d+(?:-\d+)?)`/g;
    while ((lm = tickRe.exec(text)) !== null) {
      const inner = lm[1];
      if (typeof inner === "string") {
        addUnique(unique, parsePathAndLines(inner));
      }
    }

    /**
     * Bare paths: not immediately after `\` (Windows) or a word char (avoids `oo.ts` inside `foo.ts`).
     */
    const bareRe =
      /(?<![\\])(?<!\w)((?:\.\/)?[a-zA-Z0-9][a-zA-Z0-9_\-\.\/]*\.\w+):(\d+)(?:-(\d+))?\b/g;
    while ((lm = bareRe.exec(text)) !== null) {
      const pathPart = lm[1];
      const a = lm[2];
      if (typeof pathPart !== "string" || typeof a !== "string") {
        continue;
      }
      const frag = `${pathPart}:${a}${lm[3] !== undefined ? `-${lm[3]}` : ""}`;
      addUnique(unique, parsePathAndLines(frag));
    }

    return [...unique.values()];
  } catch {
    return [];
  }
}
