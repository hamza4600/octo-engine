"use client";

import { Loader2Icon } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyErrorForCode } from "@/lib/client-errors";
import { isGithubRepoUrl } from "@/lib/github-repo-url";

import { toast } from "sonner";

export type UrlBarProps = Readonly<{
  onSessionReady: (payload: { sessionId: string; owner: string; repo: string }) => void;
}>;

async function parseJsonError(res: Response): Promise<{ code?: string } | null> {
  try {
    return (await res.json()) as { code?: string };
  } catch {
    return null;
  }
}

export function UrlBar({ onSessionReady }: UrlBarProps): React.ReactElement {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [locked, setLocked] = React.useState<{ owner: string; repo: string } | null>(null);

  const submit = async (): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    if (!isGithubRepoUrl(trimmed)) {
      toast.error("Enter a valid GitHub repository URL: https://github.com/owner/repo");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      if (!res.ok) {
        const body = await parseJsonError(res);
        toast.error(friendlyErrorForCode(body?.code));
        return;
      }
      const data = (await res.json()) as { sessionId: string; owner: string; repo: string };
      toast.success(`Repository ready — you can ask questions about ${data.owner}/${data.repo}.`);
      setLocked({ owner: data.owner, repo: data.repo });
      onSessionReady({
        sessionId: data.sessionId,
        owner: data.owner,
        repo: data.repo,
      });
    } catch {
      toast.error(friendlyErrorForCode(undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor="github-url" className="text-sm font-medium">
          GitHub repository URL
        </label>
        <div className="flex gap-2">
          <Input
            id="github-url"
            placeholder="https://github.com/owner/repo"
            value={url}
            disabled={Boolean(locked) || busy}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            aria-busy={busy}
          />
          {!locked ? (
            <Button type="button" disabled={busy || !url.trim()} onClick={() => void submit()}>
              {busy ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Preparing
                </>
              ) : (
                "Prepare repo"
              )}
            </Button>
          ) : null}
        </div>
        {busy ? (
          <p className="text-xs text-muted-foreground">
            Cloning and scanning the repository — larger repos may take up to a minute.
          </p>
        ) : null}
      </div>
      {locked ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Ready</span>
          <Badge variant="secondary" className="font-mono">
            {locked.owner}/{locked.repo}
          </Badge>
        </div>
      ) : null}
    </div>
  );
}
