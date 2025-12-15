/**
 * Runtime monkey-patch for @foliojs-fork/fontkit and @foliojs-fork/linebreak
 * to prevent ENOENT errors when reading .trie files in Vercel serverless environments.
 * 
 * Problem: fontkit/linebreak do fs.readFileSync(__dirname + '/data.trie' or '/classes.trie')
 * In serverless, __dirname points to .next/server/chunks/... where the file doesn't exist.
 * 
 * Solution: Use embedded trie bytes from memory (no filesystem dependency).
 * 
 * This patch intercepts ALL .trie file reads and serves them from embedded buffers.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import embedded trie bytes with error handling
let dataTrie: Buffer | undefined;
let indicTrie: Buffer | undefined;
let useTrie: Buffer | undefined;
let classesTrie: Buffer | undefined;

try {
  const trieBytes = require('./fontkit-trie-bytes');
  dataTrie = trieBytes.dataTrie;
  indicTrie = trieBytes.indicTrie;
  useTrie = trieBytes.useTrie;
  classesTrie = trieBytes.classesTrie;
} catch (error) {
  console.warn('[fontkit-patch] Failed to import embedded trie bytes:', error);
}

// Map trie filenames to embedded buffers (only if loaded)
const embeddedTries: Map<string, Buffer> = new Map();

if (dataTrie) embeddedTries.set('data.trie', dataTrie);
if (indicTrie) embeddedTries.set('indic.trie', indicTrie);
if (useTrie) embeddedTries.set('use.trie', useTrie);
if (classesTrie && classesTrie.length > 0) {
  embeddedTries.set('classes.trie', classesTrie);
} else if (classesTrie !== undefined) {
  // Empty buffer - log warning but still add it
  console.warn('[fontkit-patch] ⚠ classes.trie is empty, but adding to cache anyway');
  embeddedTries.set('classes.trie', classesTrie);
}

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

  // Guard: check if critical embedded bytes are available
  if (!dataTrie || !indicTrie || !useTrie) {
    console.warn('[fontkit-patch] ⚠ Critical embedded trie bytes missing (exports undefined). Patch will NOT intercept trie loads.');
    console.warn('[fontkit-patch] Available:', {
      dataTrie: !!dataTrie,
      indicTrie: !!indicTrie,
      useTrie: !!useTrie,
      classesTrie: classesTrie !== undefined,
    });
    // Don't throw - just skip patching
    return;
  }

  try {
    console.info('[fontkit-patch] 🚀 Applying fontkit trie patch with embedded trie bytes...');
    console.info('[fontkit-patch] Embedded trie sizes:', {
      'data.trie': dataTrie?.length ?? 0,
      'indic.trie': indicTrie?.length ?? 0,
      'use.trie': useTrie?.length ?? 0,
      'classes.trie': classesTrie?.length ?? 0,
    });

    // Monkey-patch fs.readFileSync
    const originalReadFileSync = fs.readFileSync.bind(fs);

    fs.readFileSync = function patchedReadFileSync(
      filePath: any,
      ...args: any[]
    ): any {
      // Robust handling of different readFileSync argument types
      let p: string;
      
      // Handle different argument types
      if (typeof filePath === 'number') {
        // File descriptor - pass through to original
        return originalReadFileSync(filePath, ...args);
      } else if (Buffer.isBuffer(filePath)) {
        p = filePath.toString();
      } else if (filePath instanceof URL) {
        p = fileURLToPath(filePath);
      } else {
        p = String(filePath);
      }

      // GENERIC: Intercept ALL .trie file requests (not just specific names)
      if (p.endsWith('.trie') || p.includes('classes.trie') || p.includes('data.trie') || p.includes('indic.trie') || p.includes('use.trie')) {
        const name = path.basename(p);
        
        // Return embedded buffer if available
        if (embeddedTries.has(name)) {
          const buffer = embeddedTries.get(name)!;
          console.info(`[fontkit-patch] ✅ Served embedded ${name} from memory (${buffer.length} bytes)`);
          return buffer;
        }

        // If not in embedded cache, fail fast with clear error (no disk fallback)
        const error = new Error(
          `[fontkit-patch] ❌ TRIE FILE NOT EMBEDDED: ${name} requested from ${p}\n` +
          `Available embedded tries: ${Array.from(embeddedTries.keys()).join(', ')}\n` +
          `This file must be added to lib/fontkit-trie-bytes.ts and embedded in the patch.`
        );
        console.error(error.message);
        throw error;
      }

      // For all other files, use original readFileSync
      return originalReadFileSync(filePath, ...args);
    };

    patchApplied = true;
    console.info('[fontkit-patch] ✅ Patch applied successfully - using embedded trie bytes');
  } catch (error) {
    console.error('[fontkit-patch] ❌ Failed to apply patch:', error);
    // Don't throw - allow execution to continue
  }
}

// Auto-apply on module load
applyFontkitTriePatch();
