"use client";

import * as React from "react";

import { ChatThread } from "@/components/chat-thread";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UrlBar } from "@/components/url-bar";

const SAMPLE_URL = "https://github.com/hamza4600/go-scrapper";

export default function HomePage(): React.ReactElement {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [repoLabel, setRepoLabel] = React.useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col min-h-screen bg-background">
      <header className="border-b px-4 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Codebase Investigator</h1>
          <p className="text-sm text-muted-foreground">
            Paste a public GitHub URL. After the repo is cloned, ask questions — the assistant uses grep and file reads
            with citations.
          </p>
          <UrlBar
            onSessionReady={({ sessionId: sid, owner, repo }) => {
              setSessionId(sid);
              setRepoLabel(`${owner}/${repo}`);
            }}
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4">
        {sessionId ? (
          <ChatThread key={sessionId} sessionId={sessionId} repoLabel={repoLabel} />
        ) : (
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Get started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Paste a public GitHub URL above and choose <span className="text-foreground">Prepare repo</span>.</li>
                <li>Wait while the app clones the repository (may take up to a minute).</li>
                <li>
                  Ask a question; answers cite real lines — click a citation chip to open the file viewer.
                </li>
              </ol>
              <p>
                Sample:{" "}
                <span className="font-mono text-foreground text-xs break-all" translate="no">
                  {SAMPLE_URL}
                </span>
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
