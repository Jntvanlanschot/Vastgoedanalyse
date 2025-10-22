/**
 * Convert a street name to a Funda-compatible slug
 * Examples: "Eerste Laurierdwarsstraat" → "eerste-laurierdwarsstraat"
 *           "César Franckstraat" → "cesar-franckstraat"
 */
export function slugifyStreetName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove diacritics (accents)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace spaces with dashes
    .replace(/\s+/g, '-')
    // Remove non-alphanumeric characters except dashes
    .replace(/[^a-z0-9-]/g, '')
    // Collapse multiple consecutive dashes
    .replace(/-+/g, '-')
    // Remove leading/trailing dashes
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert a city name to a Funda-compatible slug
 * Defaults to "amsterdam" if empty or undefined
 */
export function cityToSlug(city?: string): string {
  if (!city || city.trim() === '') {
    return 'amsterdam';
  }
  
  return city
    .toLowerCase()
    .trim()
    // Remove diacritics (accents)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace spaces with dashes
    .replace(/\s+/g, '-')
    // Remove non-alphanumeric characters except dashes
    .replace(/[^a-z0-9-]/g, '')
    // Collapse multiple consecutive dashes
    .replace(/-+/g, '-')
    // Remove leading/trailing dashes
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert a wijk name to a Funda-compatible slug with 'wijk-' prefix
 * Examples: "Oud-West" → "wijk-oud-west"
 *           "De Pijp" → "wijk-de-pijp"
 */
export function wijkToSlug(name: string): string {
  return `wijk-${name
    .toLowerCase()
    .trim()
    // Remove diacritics (accents)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace spaces with dashes
    .replace(/\s+/g, '-')
    // Remove non-alphanumeric characters except dashes
    .replace(/[^a-z0-9-]/g, '')
    // Collapse multiple consecutive dashes
    .replace(/-+/g, '-')
    // Remove leading/trailing dashes
    .replace(/^-+|-+$/g, '')}`;
}

/**
 * Build a Funda search URL for buurten
 * @param citySlug The city slug (e.g., "amsterdam")
 * @param buurtSlugs Array of buurt slugs (e.g., ["elandsgrachtbuurt", "jordaan"])
 * @returns Complete Funda URL with buurt selection
 */
export function buildFundaBuurtUrl(citySlug: string, buurtSlugs: string[]): string {
  if (!buurtSlugs || buurtSlugs.length === 0) {
    throw new Error('At least one buurt slug must be provided');
  }

  // Validate slugs contain only allowed characters
  const invalidSlugs = buurtSlugs.filter(slug => !/^[a-z0-9-]+$/.test(slug));
  if (invalidSlugs.length > 0) {
    throw new Error(`Invalid buurt slugs found: ${invalidSlugs.join(', ')}. Only a-z, 0-9, and - are allowed.`);
  }

  // Build the selected_area array with city/buurt-<slug> format
  const selectedArea = buurtSlugs.map(slug => `${citySlug}/buurt-${slug}`);
  
  // JSON stringify the array and encode for URL
  const selectedAreaJson = JSON.stringify(selectedArea);
  
  // Build the complete Funda URL
  const baseUrl = 'https://www.funda.nl/zoeken/koop';
  const params = new URLSearchParams({
    selected_area: selectedAreaJson,
    availability: JSON.stringify(['negotiations', 'unavailable'])
  });
  
  return `${baseUrl}?${params.toString()}`;
}


