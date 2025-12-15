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
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    /**
     * Ensure fontkit's trie data files are bundled into the serverless function
     * for the Realworks workflow API route. At runtime, fontkit does:
     *
     *   fs.readFileSync(__dirname + '/data.trie')
     *
     * When Next.js bundles this into .next/server/chunks, __dirname points to
     * that chunk directory, so the corresponding data.trie must be traced and
     * copied there. These includes guarantee that.
     */
    outputFileTracingIncludes: {
      "app/api/upload-realworks/route": [
        "./node_modules/@foliojs-fork/fontkit/data.trie",
        "./node_modules/@foliojs-fork/fontkit/src/opentype/shapers/data.trie",
        "./node_modules/@foliojs-fork/fontkit/src/opentype/shapers/indic.trie",
        "./node_modules/@foliojs-fork/fontkit/src/opentype/shapers/use.trie",
      ],
    },
  },
};

export default nextConfig;
