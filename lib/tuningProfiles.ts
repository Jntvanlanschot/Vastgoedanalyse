/**
 * Named tuning profiles (10 slots), stored in localStorage.
 * Each slot holds a name + a full set of similarity weights.
 * Shared by the /tuning page (save/load) and the upload page (select).
 */
import { SimilarityWeights, DEFAULT_WEIGHTS } from '@/lib/workflow/calculateSimilarity';

export const SLOT_COUNT = 10;
const PROFILES_KEY = 'tuningProfiles';
const ACTIVE_PROFILE_KEY = 'activeTuningProfile';

export interface TuningProfile {
  name: string;
  weights: SimilarityWeights;
}

/** Always returns an array of exactly SLOT_COUNT entries (null = empty slot). */
export function loadProfiles(): Array<TuningProfile | null> {
  const empty = Array<TuningProfile | null>(SLOT_COUNT).fill(null);
  if (typeof window === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return empty;
    return empty.map((_, i) => {
      const slot = parsed[i];
      if (slot && typeof slot.name === 'string' && slot.weights) {
        return { name: slot.name, weights: { ...DEFAULT_WEIGHTS, ...slot.weights } };
      }
      return null;
    });
  } catch (e) {
    console.error('Failed to load tuning profiles:', e);
    return empty;
  }
}

export function saveProfiles(profiles: Array<TuningProfile | null>): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.error('Failed to save tuning profiles:', e);
  }
}

/** Index of the profile used for analyses, or -1 for the standard (default) weights. */
export function getActiveProfileIndex(): number {
  if (typeof window === 'undefined') return -1;
  const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (raw === null) return -1;
  const i = parseInt(raw, 10);
  return Number.isInteger(i) && i >= 0 && i < SLOT_COUNT ? i : -1;
}

export function setActiveProfileIndex(index: number): void {
  try {
    if (index < 0) localStorage.removeItem(ACTIVE_PROFILE_KEY);
    else localStorage.setItem(ACTIVE_PROFILE_KEY, String(index));
  } catch (e) {
    console.error('Failed to set active tuning profile:', e);
  }
}

/**
 * Weights to apply for analyses given the active profile selection.
 * Returns undefined when standard/default weights should be used
 * (so the workflow falls back to its built-in defaults).
 */
export function getActiveWeights(): SimilarityWeights | undefined {
  const index = getActiveProfileIndex();
  if (index < 0) return undefined;
  const profile = loadProfiles()[index];
  return profile ? profile.weights : undefined;
}
