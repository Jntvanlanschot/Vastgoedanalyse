import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable ESLint during builds (but keep it in development)
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript errors during builds (but keep type checking in development)
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  // Keep Turbopack for faster builds
  turbopack: {
    // Enable Turbopack for faster builds
  },
};

export default nextConfig;
