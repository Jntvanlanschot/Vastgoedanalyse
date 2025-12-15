/**
 * Runtime monkey-patch for @foliojs-fork/fontkit to prevent ENOENT errors
 * when reading data.trie in Vercel serverless environments.
 * 
 * Problem: fontkit does fs.readFileSync(__dirname + '/data.trie')
 * In serverless, __dirname points to .next/server/chunks/... where the file may not exist.
 * 
 * Solution: Pre-load trie files from all known locations and intercept fs.readFileSync.
 * If cache miss, allow disk read (don't block) - trie files may be bundled by Next.js.
 */

import fs from 'fs';
import path from 'path';

type TrieCache = Map<string, Buffer>;
const trieCache: TrieCache = new Map();

const TRIE_FILES = ['data.trie', 'indic.trie', 'use.trie'];

/**
 * Try to load a trie file from all known valid locations
 */
function tryLoadTrie(trieName: string): Buffer | null {
  const candidates = [
    // Vercel build-time path
    `/vercel/path0/node_modules/@foliojs-fork/fontkit/${trieName}`,
    // Vercel serverless runtime
    `/var/task/node_modules/@foliojs-fork/fontkit/${trieName}`,
    // Next.js bundled chunks (if outputFileTracingIncludes worked)
    `/var/task/.next/server/chunks/${trieName}`,
    // Local dev fallback
    path.join(process.cwd(), 'node_modules', '@foliojs-fork', 'fontkit', trieName),
    // Alternative serverless paths
    path.join('/var/task', 'node_modules', '@foliojs-fork', 'fontkit', trieName),
    path.join(process.cwd(), '.next', 'server', 'chunks', trieName),
  ];

  for (const candidatePath of candidates) {
    try {
      if (fs.existsSync(candidatePath)) {
        const buf = fs.readFileSync(candidatePath);
        console.info(`[fontkit-patch] ✓ Loaded ${trieName} from ${candidatePath} (${buf.length} bytes)`);
        return buf;
      }
    } catch (error) {
      // Continue to next candidate
    }
  }

  console.warn(`[fontkit-patch] ⚠ Could not preload ${trieName} from known locations (will try on-demand)`);
  return null;
}

/**
 * Apply the fontkit trie patch
 * Must be called BEFORE any pdfmake/fontkit imports
 */
export function applyFontkitTriePatch(): void {
  if (trieCache.size > 0) {
    // Already applied (idempotent)
    return;
  }

  console.info('[fontkit-patch] 🚀 Applying fontkit trie patch...');
  console.info('[fontkit-patch] Environment:', {
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
  });

  // Pre-load all trie files from all known locations
  for (const trie of TRIE_FILES) {
    const buf = tryLoadTrie(trie);
    if (buf) {
      trieCache.set(trie, buf);
      // Also cache by basename for different path formats
      trieCache.set(path.basename(trie), buf);
    }
  }

  console.info(`[fontkit-patch] Preload complete. Cache keys: [${Array.from(trieCache.keys()).join(', ')}]`);

  // Monkey-patch fs.readFileSync
  const originalReadFileSync = fs.readFileSync.bind(fs);

  fs.readFileSync = function patchedReadFileSync(
    filePath: any,
    ...args: any[]
  ): any {
    const p = String(filePath);

    // Check if this is a trie file request
    if (p.endsWith('.trie') && (p.includes('data.trie') || p.includes('indic.trie') || p.includes('use.trie'))) {
      const name = path.basename(p);
      
      // Try cache first
      if (trieCache.has(name)) {
        console.info(`[fontkit-patch] ✅ Intercepted readFileSync(${p}) -> returning cached ${name} (${trieCache.get(name)!.length} bytes)`);
        return trieCache.get(name)!;
      }

      // If not in cache, try to load on-demand from known locations
      const buf = tryLoadTrie(name);
      if (buf) {
        trieCache.set(name, buf);
        console.info(`[fontkit-patch] ✅ Loaded ${name} on-demand and intercepted readFileSync(${p})`);
        return buf;
      }

      // If still not found, allow original readFileSync to proceed
      // (file may be in .next/server/chunks if outputFileTracingIncludes worked)
      console.warn(`[fontkit-patch] ⚠ Cache miss for ${name}, allowing disk read for ${p}`);
      try {
        return originalReadFileSync(filePath, ...args);
      } catch (error) {
        // If disk read also fails, log and rethrow
        console.error('[fontkit-patch] ❌ Disk read also failed:', {
          attemptedPath: p,
          cwd: process.cwd(),
          cacheKeys: Array.from(trieCache.keys()),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    // For all other files, use original readFileSync
    return originalReadFileSync(filePath, ...args);
  };

  console.info('[fontkit-patch] ✅ Patch applied successfully');
}
