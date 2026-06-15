/**
 * Calculate similarity scores between reference property and candidate properties
 * TypeScript port of calculate_simple_similarity_score from api_workflow.py
 */

import { ParsedProperty } from './parseRealworksProperty';

export interface ReferenceData {
  address_full?: string;
  street_name?: string;
  area_m2?: number;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  energy_label?: string;
  has_garden?: boolean;
  has_balcony?: boolean;
  has_terrace?: boolean;
  year_built?: number;
  sale_date?: string;
  neighbourhood?: string;
  latitude?: number;
  longitude?: number;
}

export interface CandidateProperty extends ParsedProperty {
  rw_sale_price?: number;
  rw_area_m2?: number;
  rw_bedrooms?: number;
  rw_rooms?: number;
  rw_energy_label?: string;
  rw_has_garden?: boolean;
  rw_has_balcony?: boolean;
  rw_has_terrace?: boolean;
  rw_year_built?: number;
  rw_sale_date?: string;
  latitude?: number;
  longitude?: number;
  street?: string;
  'address/street_name'?: string;
  'address/neighbourhood'?: string;
}

interface StreetSimilarityCache {
  [streetName: string]: any[]; // StreetProfile objects
}

export interface SimilarityWeights {
  weight_street_name: number;
  weight_osm_street: number;
  weight_area: number;
  weight_distance: number;
  weight_garden: number;
  weight_rooms: number;
  weight_balcony: number;
  weight_energy_label: number;
  weight_sale_date: number;
  weight_year_built: number;
  gracht_penalty: number;
}

// Optimized weights from Python (production defaults)
export const DEFAULT_WEIGHTS: SimilarityWeights = {
  weight_street_name: 0.1,
  weight_osm_street: 0.1,
  weight_area: 0.33,
  weight_distance: 0.18,
  weight_garden: 0.02,
  weight_rooms: 0.05,
  weight_balcony: 0.11,
  weight_energy_label: 0.5,
  weight_sale_date: 0.11,
  weight_year_built: 0.01,
  gracht_penalty: 0.0035,
};

/**
 * Validate untrusted weight input (e.g. from a request body).
 * Returns only known keys with finite numbers clamped to 0..1,
 * or undefined when nothing usable was provided.
 */
export function sanitizeWeights(input: unknown): Partial<SimilarityWeights> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const result: Partial<SimilarityWeights> = {};
  for (const key of Object.keys(DEFAULT_WEIGHTS) as Array<keyof SimilarityWeights>) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = Math.min(1, Math.max(0, value));
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Per-feature subscores (each 0..1), independent of weights.
 * gracht_mismatch flags whether the gracht penalty applies.
 */
export interface FeatureScores {
  street_name: number;
  osm_street: number;
  area: number;
  distance: number;
  garden: number;
  rooms: number;
  balcony: number;
  sale_date: number;
  year_built: number;
  energy_label: number;
  gracht_mismatch: boolean;
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  // Create matrix
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen > 0 ? 1 - distance / maxLen : 0;
}

/**
 * Calculate OSM street similarity (simplified - uses cache if available)
 */
function calculateOsmStreetSimilarity(
  row: CandidateProperty,
  referenceData: ReferenceData,
  streetSimilarityCache?: StreetSimilarityCache
): number {
  if (!streetSimilarityCache) return 0.5; // Neutral if no cache
  
  const refStreet = (referenceData.street_name || '').toLowerCase().trim();
  if (!refStreet) return 0.5;
  
  // Get street from row
  const rowStreet = (
    row.street ||
    row['address/street_name'] ||
    ''
  ).toLowerCase().trim();
  
  if (!rowStreet) return 0.5;
  
  // Check if streets are in cache and similar
  const refStreets = streetSimilarityCache[refStreet] || [];
  if (refStreets.length === 0) return 0.5;
  
  // Check if row street is in the similar streets list
  for (const similarStreet of refStreets) {
    if (typeof similarStreet === 'string') {
      if (similarStreet.toLowerCase().trim() === rowStreet) {
        return 1.0; // Perfect match
      }
    } else if (similarStreet.name && similarStreet.name.toLowerCase().trim() === rowStreet) {
      return similarStreet.similarity || 0.8; // Use similarity score if available
    }
  }
  
  return 0.3; // Not in similar list
}

/**
 * Calculate area similarity
 */
function calculateAreaSimilarity(refArea: number | undefined, rowArea: number | undefined): number {
  if (!refArea || !rowArea || refArea <= 0 || rowArea <= 0) return 0.5;
  
  const areaDiff = Math.abs(rowArea - refArea);
  const areaScore = Math.max(0, 1 - areaDiff / refArea);
  return areaScore;
}

/**
 * Calculate distance similarity (if coordinates available)
 */
function calculateDistanceSimilarity(
  refLat: number | undefined,
  refLon: number | undefined,
  rowLat: number | undefined,
  rowLon: number | undefined
): number {
  if (!refLat || !refLon || !rowLat || !rowLon) return 0.5;
  
  // Haversine distance
  const R = 6371; // Earth radius in km
  const dLat = (rowLat - refLat) * Math.PI / 180;
  const dLon = (rowLon - refLon) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(refLat * Math.PI / 180) * Math.cos(rowLat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  
  // Convert to similarity (closer = higher score, max 5km = 0 score)
  const maxDistance = 5; // km
  const distanceScore = Math.max(0, 1 - distance / maxDistance);
  return distanceScore;
}

/**
 * Calculate energy label similarity
 */
function calculateEnergyLabelSimilarity(refLabel: string | undefined, rowLabel: string | undefined): number {
  const energyLabels = ['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
  
  if (!refLabel || !rowLabel) return 0.5;
  
  const refIndex = energyLabels.indexOf(refLabel.toUpperCase());
  const rowIndex = energyLabels.indexOf(rowLabel.toUpperCase());
  
  if (refIndex === -1 || rowIndex === -1) return 0.5;
  
  const energyDiff = Math.abs(refIndex - rowIndex);
  const energyScore = Math.max(0, 1 - energyDiff / energyLabels.length);
  return energyScore;
}

/**
 * Calculate year built similarity
 */
function calculateYearBuiltSimilarity(refYear: number | undefined, rowYear: number | undefined): number {
  if (!refYear || !rowYear) return 0.5;
  
  const yearDiff = Math.abs(rowYear - refYear);
  const maxDiff = 50; // 50 years = 0 score
  const yearScore = Math.max(0, 1 - yearDiff / maxDiff);
  return yearScore;
}

/**
 * Calculate sale date similarity (recency)
 */
function calculateSaleDateSimilarity(refDate: string | undefined, rowDate: string | undefined): number {
  if (!refDate || !rowDate) return 0.5;
  
  try {
    const ref = new Date(refDate);
    const row = new Date(rowDate);
    const diffDays = Math.abs((row.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
    
    // More recent = higher score (max 365 days = 0 score)
    const maxDays = 365;
    const dateScore = Math.max(0, 1 - diffDays / maxDays);
    return dateScore;
  } catch {
    return 0.5;
  }
}

/**
 * Calculate all per-feature subscores for a candidate vs the reference property.
 * Weights are NOT applied here — combine with combineFeatureScores().
 */
export function calculateFeatureScores(
  row: CandidateProperty,
  referenceData: ReferenceData,
  streetSimilarityCache?: StreetSimilarityCache
): FeatureScores {
  // Check for gracht mismatch (HEAVY penalty!)
  const refStreet = (referenceData.street_name || '').toLowerCase().trim();
  const rowStreet = (
    row.street ||
    row['address/street_name'] ||
    ''
  ).toLowerCase().trim();

  const refIsGracht = refStreet.includes('gracht');
  const rowIsGracht = rowStreet.includes('gracht');

  // 1. Street similarity
  let streetScore = 0;
  if (refStreet && rowStreet) {
    streetScore = refStreet === rowStreet
      ? 1.0 // Same street = perfect match
      : calculateStringSimilarity(refStreet, rowStreet);
  }

  // 2. OSM-based street similarity
  const osmStreetScore = calculateOsmStreetSimilarity(row, referenceData, streetSimilarityCache);

  // 3. Area similarity
  const areaScore = calculateAreaSimilarity(referenceData.area_m2, row.rw_area_m2 || row.area_m2);

  // 4. Distance similarity
  const distanceScore = calculateDistanceSimilarity(
    referenceData.latitude,
    referenceData.longitude,
    row.latitude,
    row.longitude
  );

  // 5. Garden similarity
  const refGarden = referenceData.has_garden || false;
  const rowGarden = row.rw_has_garden ?? row.has_garden ?? false;
  const gardenScore = refGarden === rowGarden ? 1.0 : 0.5;

  // 6. Rooms similarity
  const refRooms = referenceData.rooms || 0;
  const rowRooms = row.rw_rooms || row.rooms || 0;
  let roomScore = 0.5;
  if (refRooms > 0 && rowRooms > 0) {
    const roomDiff = Math.abs(rowRooms - refRooms);
    roomScore = Math.max(0, 1 - roomDiff / Math.max(refRooms, 1));
  }

  // 7. Balcony/Terrace similarity
  const refBalcony = referenceData.has_balcony || referenceData.has_terrace || false;
  const rowBalcony = row.rw_has_balcony ?? row.rw_has_terrace ?? row.has_balcony ?? row.has_terrace ?? false;
  const balconyScore = refBalcony === rowBalcony ? 1.0 : 0.5;

  // 8. Sale date similarity
  const saleDateScore = calculateSaleDateSimilarity(
    referenceData.sale_date,
    row.rw_sale_date || row.sale_date
  );

  // 9. Year built similarity
  const yearScore = calculateYearBuiltSimilarity(
    referenceData.year_built,
    row.rw_year_built || row.year_built
  );

  // 10. Energy label similarity
  const refEnergy = referenceData.energy_label || 'B';
  const rowEnergy = row.rw_energy_label || row.energy_label || 'Unknown';
  const energyScore = calculateEnergyLabelSimilarity(refEnergy, rowEnergy);

  return {
    street_name: streetScore,
    osm_street: osmStreetScore,
    area: areaScore,
    distance: distanceScore,
    garden: gardenScore,
    rooms: roomScore,
    balcony: balconyScore,
    sale_date: saleDateScore,
    year_built: yearScore,
    energy_label: energyScore,
    gracht_mismatch: refIsGracht !== rowIsGracht,
  };
}

/**
 * Combine per-feature subscores into a single similarity score using the given weights.
 * Pure function — safe to use client-side for live re-ranking.
 */
export function combineFeatureScores(
  features: FeatureScores,
  weights: SimilarityWeights = DEFAULT_WEIGHTS
): number {
  const w = weights;

  // Energy label is just another weighted feature: it gets a higher default
  // weight (more important) but never overrides the rest. Score is the
  // weighted average over all features, normalized by the sum of weights,
  // so only the ratios between weights matter.
  const score =
    w.weight_street_name * features.street_name +
    w.weight_osm_street * features.osm_street +
    w.weight_area * features.area +
    w.weight_distance * features.distance +
    w.weight_garden * features.garden +
    w.weight_rooms * features.rooms +
    w.weight_balcony * features.balcony +
    w.weight_sale_date * features.sale_date +
    w.weight_year_built * features.year_built +
    w.weight_energy_label * features.energy_label;

  const totalWeight =
    w.weight_street_name +
    w.weight_osm_street +
    w.weight_area +
    w.weight_distance +
    w.weight_garden +
    w.weight_rooms +
    w.weight_balcony +
    w.weight_sale_date +
    w.weight_year_built +
    w.weight_energy_label;

  const similarity = totalWeight > 0 ? Math.min(1.0, score / totalWeight) : 0.0;

  // Apply gracht penalty to the ENTIRE score
  const grachtPenalty = features.gracht_mismatch ? w.gracht_penalty : 1.0;

  return Math.min(1.0, similarity * grachtPenalty); // Cap at 1.0
}

/**
 * Calculate similarity score between reference property and candidate property
 */
export function calculateSimpleSimilarityScore(
  row: CandidateProperty,
  referenceData: ReferenceData,
  streetSimilarityCache?: StreetSimilarityCache,
  weights: SimilarityWeights = DEFAULT_WEIGHTS
): number {
  try {
    const features = calculateFeatureScores(row, referenceData, streetSimilarityCache);
    return combineFeatureScores(features, weights);
  } catch (error) {
    console.error('Error calculating similarity score:', error);
    return 0.0;
  }
}

