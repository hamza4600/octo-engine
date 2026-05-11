"use client";

import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The page hit an unexpected error. You can retry, or refresh the tab if the problem continues.
        </p>
      </div>
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
