import buurtenData from '@/data/buurten_centers.json';
import overridesData from '@/data/funda_buurt_overrides.json';

export interface BuurtData {
  buurt: string;
  stad: string;
  center_lon: number;
  center_lat: number;
}

export interface ProcessedBuurt {
  name: string;
  municipalitySlug: string;
  fundaSlug: string;
  centroid: [number, number]; // [lng, lat]
}

/**
 * Convert a municipality name to a slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Validate if a centroid is valid
 */
function isValidCentroid(lng: number, lat: number): boolean {
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    !isNaN(lng) &&
    !isNaN(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * Validate if a funda slug contains only allowed characters
 */
function isValidFundaSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Load and validate all buurten data
 */
export function loadAllBuurten(): ProcessedBuurt[] {
  const processedBuurten: ProcessedBuurt[] = [];
  const warnings: string[] = [];

  for (const buurt of buurtenData as BuurtData[]) {
    // Validate centroid
    if (!isValidCentroid(buurt.center_lon, buurt.center_lat)) {
      warnings.push(`Invalid centroid for ${buurt.buurt}, ${buurt.stad}: [${buurt.center_lon}, ${buurt.center_lat}]`);
      continue;
    }

    // Generate municipality slug
    const municipalitySlug = slugify(buurt.stad);
    if (!municipalitySlug) {
      warnings.push(`Could not generate municipality slug for: ${buurt.stad}`);
      continue;
    }

    // Generate funda slug with overrides
    let fundaSlug = overridesData[buurt.buurt] || slugify(buurt.buurt);
    
    if (!fundaSlug) {
      warnings.push(`Could not generate funda slug for: ${buurt.buurt}`);
      continue;
    }

    // Validate funda slug
    if (!isValidFundaSlug(fundaSlug)) {
      warnings.push(`Invalid funda slug for ${buurt.buurt}: "${fundaSlug}" (only a-z, 0-9, - allowed)`);
      // Try to fix it
      fundaSlug = fundaSlug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!isValidFundaSlug(fundaSlug)) {
        continue; // Skip if still invalid
      }
    }

    processedBuurten.push({
      name: buurt.buurt,
      municipalitySlug,
      fundaSlug,
      centroid: [buurt.center_lon, buurt.center_lat]
    });
  }

  // Log warnings in development
  if (process.env.NODE_ENV === 'development' && warnings.length > 0) {
    console.warn('Buurten validation warnings:', warnings);
  }

  return processedBuurten;
}

/**
 * Get all unique municipalities
 */
export function getAllMunicipalities(): string[] {
  const municipalities = new Set<string>();
  const processedBuurten = loadAllBuurten();
  
  for (const buurt of processedBuurten) {
    municipalities.add(buurt.municipalitySlug);
  }
  
  return Array.from(municipalities).sort();
}

/**
 * Find buurten by municipality
 */
export function getBuurtenByMunicipality(municipalitySlug: string): ProcessedBuurt[] {
  const processedBuurten = loadAllBuurten();
  return processedBuurten.filter(buurt => buurt.municipalitySlug === municipalitySlug);
}


