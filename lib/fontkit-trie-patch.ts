/**
 * Runtime monkey-patch for @foliojs-fork/fontkit to prevent ENOENT errors
 * when reading data.trie in Vercel serverless environments.
 * 
 * Problem: fontkit does fs.readFileSync(__dirname + '/data.trie')
 * In serverless, __dirname points to .next/server/chunks/... where the file doesn't exist.
 * 
 * Solution: Use embedded trie bytes from memory (no filesystem dependency).
 */

import fs from 'fs';
import path from 'path';
import { dataTrie, indicTrie, useTrie } from './fontkit-trie-bytes';

// Map trie filenames to embedded buffers
const embeddedTries: Map<string, Buffer> = new Map([
  ['data.trie', dataTrie],
  ['indic.trie', indicTrie],
  ['use.trie', useTrie],
]);

let patchApplied = false;

/**
 * Apply the fontkit trie patch
 * Must be called BEFORE any pdfmake/fontkit imports
 */
export function applyFontkitTriePatch(): void {
  if (patchApplied) {
    // Already applied (idempotent)
    return;
  }

  console.info('[fontkit-patch] 🚀 Applying fontkit trie patch with embedded trie bytes...');
  console.info('[fontkit-patch] Embedded trie sizes:', {
    'data.trie': dataTrie.length,
    'indic.trie': indicTrie.length,
    'use.trie': useTrie.length,
  });

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
      
      // Return embedded buffer if available
      if (embeddedTries.has(name)) {
        const buffer = embeddedTries.get(name)!;
        console.info(`[fontkit-patch] ✅ Served embedded ${name} from memory (${buffer.length} bytes)`);
        return buffer;
      }

      // If not in embedded cache, try original readFileSync (fallback)
      console.warn(`[fontkit-patch] ⚠ Requested trie file ${name} not in embedded cache, attempting disk read for ${p}`);
      return originalReadFileSync(filePath, ...args);
    }

    // For all other files, use original readFileSync
    return originalReadFileSync(filePath, ...args);
  };

  patchApplied = true;
  console.info('[fontkit-patch] ✅ Patch applied successfully - using embedded trie bytes');
}

// Auto-apply on module load
applyFontkitTriePatch();
