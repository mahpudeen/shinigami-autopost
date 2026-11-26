import os from "node:os";
import type { NextConfig } from "next";

function getLocalNetworkIps(): string[] {
  const ips = new Set<string>(["127.0.0.1", "localhost"]);
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && entry.address) {
        ips.add(entry.address);
      }
    }
  }
  return Array.from(ips);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getLocalNetworkIps(),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
