import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: emit a self-contained server.js + minimal node_modules
  // under .next/standalone so the Docker runtime image stays small.
  output: "standalone",
};

export default nextConfig;
