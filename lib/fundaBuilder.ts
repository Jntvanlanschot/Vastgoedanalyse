import { BuurtWithDistance } from './nearestBuurten';

export interface ApifyInput {
  includeSold: boolean;
  includeUnderOffer: boolean;
  maxItems: number;
  proxyConfiguration: {
    useApifyProxy: boolean;
  };
  searchUrls: string[];
}

/**
 * Build selected_area strings from buurten data
 * @param buurten Array of buurten with distance
 * @returns Array of selected_area strings in format "municipalitySlug/fundaSlug"
 */
export function buildSelectedAreaFromBuurten(buurten: BuurtWithDistance[]): string[] {
  return buurten.map(buurt => `${buurt.municipalitySlug}/${buurt.fundaSlug}`);
}

/**
 * Build a Funda search URL with selected areas
 * @param selectedAreaStrings Array of selected_area strings
 * @returns Complete Funda URL
 */
export function buildFundaSearchUrl(selectedAreaStrings: string[]): string {
  if (!selectedAreaStrings || selectedAreaStrings.length === 0) {
    throw new Error('At least one selected area must be provided');
  }

  // Skip validation for now to prevent errors

  // Build the complete Funda URL without URL encoding
  const baseUrl = 'https://www.funda.nl/zoeken/koop';
  const selectedAreaParam = JSON.stringify(selectedAreaStrings);
  const availabilityParam = JSON.stringify(['negotiations', 'unavailable']);
  
  return `${baseUrl}?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;
}

/**
 * Build Apify input JSON for Funda scraper
 * @param selectedAreaUrl The Funda URL with selected areas
 * @returns Apify input configuration
 */
export function buildApifyInput(selectedAreaUrl: string): ApifyInput {
  return {
    includeSold: true,
    includeUnderOffer: true,
    maxItems: 150,
    proxyConfiguration: {
      useApifyProxy: true
    },
    searchUrls: [selectedAreaUrl]
  };
}

/**
 * Build complete Apify input from buurten data
 * @param buurten Array of buurten with distance
 * @returns Apify input configuration ready for copying
 */
export function buildApifyInputFromBuurten(buurten: BuurtWithDistance[]): ApifyInput {
  const selectedAreas = buildSelectedAreaFromBuurten(buurten);
  const fundaUrl = buildFundaSearchUrl(selectedAreas);
  return buildApifyInput(fundaUrl);
}

/**
 * Format Apify input as pretty JSON string
 * @param apifyInput Apify input configuration
 * @returns Formatted JSON string
 */
export function formatApifyInputAsJson(apifyInput: ApifyInput): string {
  return JSON.stringify(apifyInput, null, 2);
}

