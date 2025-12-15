/**
 * Runtime monkey-patch for @foliojs-fork/fontkit to prevent ENOENT errors
 * when reading data.trie in Vercel serverless environments.
 * 
 * Problem: fontkit does fs.readFileSync(__dirname + '/data.trie')
 * In serverless, __dirname points to .next/server/chunks/... where the file doesn't exist.
 * 
 * Solution: Pre-load trie files from node_modules into memory and intercept
 * fs.readFileSync calls for these specific files.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// Track if patch has been applied (idempotent)
let patchApplied = false;

// In-memory cache for trie files
const trieCache: Map<string, Buffer> = new Map();

/**
 * Resolve fontkit trie file path from node_modules
 */
function resolveFontkitTrie(filename: string): string | null {
  try {
    // Strategy 1: Try require.resolve to get package root
    let fontkitRoot: string | null = null;
    try {
      const packageJsonPath = require.resolve('@foliojs-fork/fontkit/package.json');
      fontkitRoot = join(packageJsonPath, '..');
    } catch (e) {
      // Fallback to cwd-based path
      fontkitRoot = join(process.cwd(), 'node_modules', '@foliojs-fork', 'fontkit');
    }

    if (fontkitRoot) {
      // Try root directory first (for data.trie, indic.trie, use.trie)
      const rootPath = join(fontkitRoot, filename);
      if (existsSync(rootPath)) {
        return rootPath;
      }

      // Try shapers directory (for ArabicShaper.js which uses src/opentype/shapers/data.trie)
      const shapersPath = join(fontkitRoot, 'src', 'opentype', 'shapers', filename);
      if (existsSync(shapersPath)) {
        return shapersPath;
      }
    }

    // Strategy 2: Try cwd-based paths (for local dev)
    const cwdPaths = [
      join(process.cwd(), 'node_modules', '@foliojs-fork', 'fontkit', filename),
      join(process.cwd(), 'node_modules', '@foliojs-fork', 'fontkit', 'src', 'opentype', 'shapers', filename),
    ];

    for (const path of cwdPaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return null;
  } catch (error) {
    console.error(`[fontkit-patch] Error resolving ${filename}:`, error);
    return null;
  }
}

/**
 * Pre-load all known trie files into memory
 */
function preloadTrieFiles(): void {
  const trieFiles = ['data.trie', 'indic.trie', 'use.trie'];
  
  for (const filename of trieFiles) {
    const resolvedPath = resolveFontkitTrie(filename);
    if (resolvedPath) {
      try {
        const buffer = readFileSync(resolvedPath);
        trieCache.set(filename, buffer);
        trieCache.set(join(process.cwd(), filename), buffer); // Also cache by absolute path
        trieCache.set(resolvedPath, buffer);
        console.log(`[fontkit-patch] Pre-loaded ${filename} from ${resolvedPath} (${buffer.length} bytes)`);
      } catch (error) {
        console.error(`[fontkit-patch] Failed to pre-load ${filename}:`, error);
      }
    } else {
      console.warn(`[fontkit-patch] Could not resolve ${filename}, fontkit may fail at runtime`);
    }
  }
}

/**
 * Monkey-patch fs.readFileSync to intercept fontkit trie file reads
 */
function patchFsReadFileSync(): void {
  const originalFs = require('fs');
  const originalReadFileSync = originalFs.readFileSync;

  originalFs.readFileSync = function (path: string | Buffer | URL, ...args: any[]): any {
    const pathStr = typeof path === 'string' ? path : path.toString();
    
    // Check if this is a fontkit trie file request
    if (pathStr.includes('data.trie') || pathStr.includes('indic.trie') || pathStr.includes('use.trie')) {
      // Try to find in cache by various path formats
      let cached = trieCache.get(pathStr);
      
      if (!cached) {
        // Try to match by filename only
        const filename = pathStr.split(/[/\\]/).pop() || '';
        cached = trieCache.get(filename);
      }
      
      if (!cached) {
        // Try to resolve and load on-demand
        const resolvedPath = resolveFontkitTrie(pathStr.split(/[/\\]/).pop() || '');
        if (resolvedPath && existsSync(resolvedPath)) {
          cached = readFileSync(resolvedPath);
          trieCache.set(pathStr, cached);
          console.log(`[fontkit-patch] Loaded trie on-demand: ${pathStr} -> ${resolvedPath}`);
        }
      }
      
      if (cached) {
        console.log(`[fontkit-patch] Intercepted readFileSync(${pathStr}), returning cached buffer (${cached.length} bytes)`);
        return cached;
      }
      
      // If we can't find it, log and throw a clear error
      console.error('[fontkit-patch] BLOCKED disk access attempt:', {
        attemptedPath: pathStr,
        cwd: process.cwd(),
        __dirname: typeof __dirname !== 'undefined' ? __dirname : 'N/A',
        stack: new Error().stack,
      });
      throw new Error(
        `Fontkit attempted to read ${pathStr} from disk — blocked. ` +
        `This file should be loaded from node_modules, not from .next/server/chunks. ` +
        `Check fontkit-trie-patch.ts initialization.`
      );
    }
    
    // For all other files, use original readFileSync
    return originalReadFileSync.call(this, path, ...args);
  };
  
  console.log('[fontkit-patch] fs.readFileSync monkey-patch applied');
}

/**
 * Apply the patch (idempotent)
 */
export function applyFontkitPatch(): void {
  if (patchApplied) {
    return;
  }
  
  console.log('[fontkit-patch] Applying fontkit trie patch...');
  console.log('[fontkit-patch] Environment:', {
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
  });
  
  // Pre-load trie files into memory
  preloadTrieFiles();
  
  // Patch fs.readFileSync
  patchFsReadFileSync();
  
  patchApplied = true;
  console.log('[fontkit-patch] Patch applied successfully');
}

// Auto-apply on module load
applyFontkitPatch();

