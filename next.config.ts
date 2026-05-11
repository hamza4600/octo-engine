import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Ripgrep ships a native binary; do not bundle it with Turbopack. */
  serverExternalPackages: ["@vscode/ripgrep"],
};

export default nextConfig;
