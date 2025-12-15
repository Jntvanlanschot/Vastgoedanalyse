/**
 * Runtime monkey-patch for @foliojs-fork/fontkit to prevent ENOENT errors
 * when reading data.trie in Vercel serverless environments.
 * 
 * Problem: fontkit does fs.readFileSync(__dirname + '/data.trie')
 * In serverless, __dirname points to .next/server/chunks/... where the file doesn't exist.
 * 
 * Solution: Pre-load trie files from node_modules into memory using require.resolve
 * to get the correct package path, and intercept fs.readFileSync calls.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

// Track if patch has been applied (idempotent)
let patchApplied = false;

// In-memory cache for trie files
const trieCache: Map<string, Buffer> = new Map();

// Fontkit package root (resolved once)
let fontkitRoot: string | null = null;

/**
 * Resolve fontkit package root using require.resolve (works in serverless)
 */
function getFontkitRoot(): string | null {
  if (fontkitRoot) {
    return fontkitRoot;
  }

  try {
    // Use require.resolve to get the actual package.json location
    // This works even in bundled serverless environments
    const packageJsonPath = require.resolve('@foliojs-fork/fontkit/package.json');
    fontkitRoot = dirname(packageJsonPath);
    console.log('[fontkit-patch] Resolved fontkit root:', fontkitRoot);
    return fontkitRoot;
  } catch (error) {
    console.error('[fontkit-patch] Failed to resolve fontkit package:', error);
    // Fallback to cwd-based path
    const fallback = join(process.cwd(), 'node_modules', '@foliojs-fork', 'fontkit');
    if (existsSync(fallback)) {
      fontkitRoot = fallback;
      console.log('[fontkit-patch] Using fallback fontkit root:', fontkitRoot);
      return fontkitRoot;
    }
    return null;
  }
}

/**
 * Resolve fontkit trie file path from node_modules
 */
function resolveFontkitTrie(filename: string): string | null {
  const root = getFontkitRoot();
  if (!root) {
    return null;
  }

  // Try root directory first (for data.trie, indic.trie, use.trie)
  const rootPath = join(root, filename);
  if (existsSync(rootPath)) {
    console.log(`[fontkit-patch] Resolved ${filename} to root: ${rootPath}`);
    return rootPath;
  }

  // Try shapers directory (for ArabicShaper.js which uses src/opentype/shapers/data.trie)
  const shapersPath = join(root, 'src', 'opentype', 'shapers', filename);
  if (existsSync(shapersPath)) {
    console.log(`[fontkit-patch] Resolved ${filename} to shapers: ${shapersPath}`);
    return shapersPath;
  }

  console.warn(`[fontkit-patch] Could not resolve ${filename} in fontkit root: ${root}`);
  return null;
}

/**
 * Pre-load all known trie files into memory
 */
function preloadTrieFiles(): void {
  const trieFiles = ['data.trie', 'indic.trie', 'use.trie'];
  
  console.log('[fontkit-patch] Pre-loading trie files...');
  console.log('[fontkit-patch] Runtime environment:', {
    cwd: process.cwd(),
    fontkitRoot: getFontkitRoot(),
  });
  
  for (const filename of trieFiles) {
    const resolvedPath = resolveFontkitTrie(filename);
    if (resolvedPath) {
      try {
        const buffer = readFileSync(resolvedPath);
        // Cache by multiple keys for different path formats fontkit might use
        trieCache.set(filename, buffer);
        trieCache.set(resolvedPath, buffer);
        trieCache.set(join(process.cwd(), filename), buffer);
        // Also cache common __dirname patterns
        trieCache.set(`./${filename}`, buffer);
        trieCache.set(`/${filename}`, buffer);
        console.log(`[fontkit-patch] ✓ Pre-loaded ${filename} from ${resolvedPath} (${buffer.length} bytes)`);
      } catch (error) {
        console.error(`[fontkit-patch] ✗ Failed to pre-load ${filename}:`, error);
      }
    } else {
      console.warn(`[fontkit-patch] ⚠ Could not resolve ${filename}, fontkit may fail at runtime`);
    }
  }
  
  console.log(`[fontkit-patch] Pre-load complete. Cache size: ${trieCache.size} entries`);
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
      console.log(`[fontkit-patch] 🔍 Intercepted readFileSync attempt for: ${pathStr}`);
      
      // Try to find in cache by various path formats
      let cached = trieCache.get(pathStr);
      
      if (!cached) {
        // Try to match by filename only
        const filename = pathStr.split(/[/\\]/).pop() || '';
        cached = trieCache.get(filename);
        if (cached) {
          console.log(`[fontkit-patch] ✓ Found in cache by filename: ${filename}`);
        }
      }
      
      if (!cached) {
        // Try common path variations
        const variations = [
          `./${pathStr.split(/[/\\]/).pop()}`,
          `/${pathStr.split(/[/\\]/).pop()}`,
          pathStr.replace(/^.*[/\\]/, ''),
        ];
        for (const variant of variations) {
          cached = trieCache.get(variant);
          if (cached) {
            console.log(`[fontkit-patch] ✓ Found in cache by variant: ${variant}`);
            break;
          }
        }
      }
      
      if (!cached) {
        // Try to resolve and load on-demand
        const filename = pathStr.split(/[/\\]/).pop() || '';
        const resolvedPath = resolveFontkitTrie(filename);
        if (resolvedPath && existsSync(resolvedPath)) {
          try {
            cached = readFileSync(resolvedPath);
            trieCache.set(pathStr, cached);
            console.log(`[fontkit-patch] ✓ Loaded trie on-demand: ${pathStr} -> ${resolvedPath} (${cached.length} bytes)`);
          } catch (error) {
            console.error(`[fontkit-patch] ✗ Failed to load on-demand:`, error);
          }
        }
      }
      
      if (cached) {
        console.log(`[fontkit-patch] ✅ Returning cached buffer for ${pathStr} (${cached.length} bytes)`);
        return cached;
      }
      
      // If we can't find it, log detailed error and throw
      console.error('[fontkit-patch] ❌ BLOCKED disk access attempt:', {
        attemptedPath: pathStr,
        cwd: process.cwd(),
        fontkitRoot: getFontkitRoot(),
        cacheKeys: Array.from(trieCache.keys()),
        stack: new Error().stack,
      });
      throw new Error(
        `Fontkit attempted to read ${pathStr} from disk — blocked. ` +
        `Trie file should be loaded from node_modules (@foliojs-fork/fontkit), ` +
        `not from .next/server/chunks. ` +
        `Fontkit root: ${getFontkitRoot() || 'NOT RESOLVED'}. ` +
        `Check fontkit-trie-patch.ts initialization.`
      );
    }
    
    // For all other files, use original readFileSync
    return originalReadFileSync.call(this, path, ...args);
  };
  
  console.log('[fontkit-patch] ✅ fs.readFileSync monkey-patch applied');
}

/**
 * Apply the patch (idempotent)
 */
export function applyFontkitPatch(): void {
  if (patchApplied) {
    return;
  }
  
  console.log('[fontkit-patch] 🚀 Applying fontkit trie patch...');
  console.log('[fontkit-patch] Environment:', {
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
  });
  
  // Pre-load trie files into memory
  preloadTrieFiles();
  
  // Patch fs.readFileSync
  patchFsReadFileSync();
  
  patchApplied = true;
  console.log('[fontkit-patch] ✅ Patch applied successfully');
}

// Auto-apply on module load
applyFontkitPatch();
