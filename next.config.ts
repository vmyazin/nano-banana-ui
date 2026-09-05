import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Worktrees have their own dependencies; do not resolve through another session.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
