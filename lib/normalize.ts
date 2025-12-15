import slugify from 'slugify';

/**
 * Normalize a street name for consistent comparison and storage
 * - NFD normalization to handle diacritics
 * - Strip diacritics and special characters
 * - Convert to lowercase
 * - Trim whitespace and collapse multiple spaces
 */
export function normalizeName(str: string): string {
  if (!str) return '';
  
  return str
    .normalize('NFD') // Decompose diacritics
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Collapse multiple spaces
}

/**
 * Create a composite key for street identification
 * Combines normalized name with admin area for disambiguation
 */
export function makeStreetKey(name?: string, adminArea?: string): string {
  const normalizedName = normalizeName(name || '');
  const normalizedAdmin = normalizeName(adminArea || '');
  return `${normalizedName}|${normalizedAdmin}`;
}

/**
 * Normalize a selection array for consistent comparison
 * - Deduplicate using Set
 * - Sort alphabetically (case-insensitive, without locale data dependency)
 */
export function normalizeSelection(selection: string[]): string[] {
  const normalized = selection
    .map(name => normalizeName(name))
    .filter(name => name.length > 0);
  
  const unique = Array.from(new Set(normalized));
  
  // Custom sort without Intl.Collator to avoid locale data dependencies in serverless
  return unique.sort((a, b) => {
    // Case-insensitive comparison, ignore punctuation (pure string comparison, no Intl)
    const aClean = a.replace(/[^\w\s]/g, '').toLowerCase();
    const bClean = b.replace(/[^\w\s]/g, '').toLowerCase();
    if (aClean < bClean) return -1;
    if (aClean > bClean) return 1;
    return 0;
  });
}

/**
 * Check if two arrays contain the same elements (order-independent)
 * Useful for preventing unnecessary re-renders
 */
export function shallowEqualUnordered(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  
  const setA = new Set(a);
  const setB = new Set(b);
  
  if (setA.size !== setB.size) return false;
  
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  
  return true;
}