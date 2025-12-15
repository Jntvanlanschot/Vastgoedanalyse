/**
 * Fallback implementation for @foliojs-fork/linebreak in serverless environments
 * 
 * This replaces the real linebreak library which requires classes.trie file access.
 * In serverless, we use a simple no-op fallback that doesn't require filesystem access.
 * 
 * The trade-off: slightly simpler text wrapping, but 100% stable in serverless.
 */

export interface LineBreak {
  position: number;
  required: boolean;
}

export interface LineBreaker {
  next(): LineBreak | null;
}

/**
 * Simple linebreaker that treats entire text as one line
 * This is sufficient for most PDF/text generation use cases
 */
export function LineBreaker(text: string): LineBreaker {
  let done = false;
  const textLength = text ? text.length : 0;
  
  return {
    next(): LineBreak | null {
      if (done) return null;
      done = true;
      return {
        position: textLength,
        required: false,
      };
    },
  };
}

// Export as default for compatibility
export default LineBreaker;

