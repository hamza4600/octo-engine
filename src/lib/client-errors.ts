/**
 * Map server `code` fields to short user-facing strings (toasts).
 */
export function friendlyErrorForCode(code: string | undefined): string {
  switch (code) {
    case "VALIDATION":
    case "INVALID_URL":
      return "That input is not valid. Check the URL or message and try again.";
    case "NOT_FOUND":
      return "Repository was not found or is not accessible.";
    case "SESSION_NOT_FOUND":
      return "Session expired or missing. Paste the GitHub URL again.";
    case "REPO_MISSING":
      return "Repository files were lost from temporary storage. Paste the GitHub URL again to re-clone.";
    case "TOO_LARGE":
      return "Repository is too large for this demo.";
    case "CLONE_TIMEOUT":
    case "CLONE_FAILED":
      return "Could not clone the repository. Try again or pick a smaller repo.";
    case "METADATA_FAILED":
      return "Could not verify the repository with GitHub.";
    case "CONFIG":
      return "Service misconfiguration. Check server logs and environment variables.";
    case "STORAGE":
      return "Database unavailable. Try again in a moment.";
    case "RATE_LIMIT":
      return "Too many requests. Wait briefly and retry.";
    case "LLM_UPSTREAM":
    case "UPSTREAM":
      return "The AI provider returned an error. Retry in a moment.";
    case "INTERNAL":
      return "Server error while preparing the repository. Try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
