import wijkenData from '@/data/amsterdam_wijken.json';
import { wijkToSlug } from '@/lib/funda/slug';

// Re-export wijkToSlug for convenience
export { wijkToSlug } from '@/lib/funda/slug';

export interface Wijk {
  name: string;
  lat: number;
  lng: number;
}

export interface WijkWithDistance {
  id: string;
  name: string;
  slug: string;
  distance_m: number;
}

export interface Location {
  lat: number;
  lng: number;
}

/**
 * Calculate the Haversine distance between two points in meters
 * @param a First point with lat/lng
 * @param b Second point with lat/lng
 * @returns Distance in meters
 */
export function haversine(a: Location, b: Location): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  
  const a_val = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a_val), Math.sqrt(1 - a_val));
  
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Find the n nearest wijken to a given location
 * @param location The location to find nearest wijken for
 * @param n Number of nearest wijken to return (default: 4)
 * @param city City filter (default: 'amsterdam')
 * @returns Array of nearest wijken with distances
 */
export function nearestWijken(
  location: Location,
  n: number = 4,
  city: string = 'amsterdam'
): WijkWithDistance[] {
  // Filter wijken by city (for now, all data is Amsterdam)
  const filteredWijken = wijkenData.filter((wijk: Wijk) => {
    // For now, all wijken are Amsterdam-based
    return true;
  });

  // Calculate distances and create results
  const wijkenWithDistances = filteredWijken.map((wijk: Wijk) => {
    const distance = haversine(location, { lat: wijk.lat, lng: wijk.lng });
    return {
      id: wijk.name,
      name: wijk.name,
      slug: wijkToSlug(wijk.name),
      distance_m: Math.round(distance)
    };
  });

  // Sort by distance, with stable tie-breaker by name
  wijkenWithDistances.sort((a, b) => {
    if (a.distance_m !== b.distance_m) {
      return a.distance_m - b.distance_m;
    }
    return a.name.localeCompare(b.name);
  });

  // Return top n
  return wijkenWithDistances.slice(0, n);
}


/**
 * Get all available wijken (for dropdown/selection)
 * @param city City filter (default: 'amsterdam')
 * @returns Array of all wijken
 */
export function getAllWijken(city: string = 'amsterdam'): Wijk[] {
  return wijkenData.filter((wijk: Wijk) => {
    // For now, all wijken are Amsterdam-based
    return true;
  });
}

/**
 * Find a wijk by name (case-insensitive)
 * @param name The wijk name to search for
 * @returns The wijk if found, undefined otherwise
 */
export function findWijkByName(name: string): Wijk | undefined {
  const normalizedName = name.toLowerCase().trim();
  return wijkenData.find((wijk: Wijk) => 
    wijk.name.toLowerCase() === normalizedName
  );
}
