import { loadAllBuurten, ProcessedBuurt } from './buurtenNL';

export interface Location {
  lat: number;
  lng: number;
}

export interface BuurtWithDistance extends ProcessedBuurt {
  distance_m: number;
}

/**
 * Calculate Haversine distance between two points in meters.
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in meters
 */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in metres
  const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

/**
 * Find the N nearest buurten to a given point nationwide.
 * @param point The reference point {lat, lng}
 * @param n The number of nearest buurten to return (default: 4)
 * @returns An array of nearest buurten with their distances
 */
export function nearestBuurtenNL(point: Location, n: number = 4): BuurtWithDistance[] {
  const allBuurten = loadAllBuurten();

  const buurtenWithDistances = allBuurten.map(buurt => {
    const [lng, lat] = buurt.centroid;
    const distance_m = haversine(point.lat, point.lng, lat, lng);
    return { ...buurt, distance_m };
  });

  // Sort by distance, with stable tie-breaker on name
  buurtenWithDistances.sort((a, b) => {
    if (a.distance_m !== b.distance_m) {
      return a.distance_m - b.distance_m;
    }
    return a.name.localeCompare(b.name);
  });

  return buurtenWithDistances.slice(0, n);
}

/**
 * Find the N nearest buurten within a specific municipality.
 * @param point The reference point {lat, lng}
 * @param municipalitySlug The municipality to filter by
 * @param n The number of nearest buurten to return (default: 4)
 * @returns An array of nearest buurten with their distances
 */
export function nearestBuurtenInMunicipality(
  point: Location, 
  municipalitySlug: string, 
  n: number = 4
): BuurtWithDistance[] {
  const allBuurten = loadAllBuurten();
  const municipalityBuurten = allBuurten.filter(buurt => 
    buurt.municipalitySlug === municipalitySlug
  );

  const buurtenWithDistances = municipalityBuurten.map(buurt => {
    const [lng, lat] = buurt.centroid;
    const distance_m = haversine(point.lat, point.lng, lat, lng);
    return { ...buurt, distance_m };
  });

  // Sort by distance, with stable tie-breaker on name
  buurtenWithDistances.sort((a, b) => {
    if (a.distance_m !== b.distance_m) {
      return a.distance_m - b.distance_m;
    }
    return a.name.localeCompare(b.name);
  });

  return buurtenWithDistances.slice(0, n);
}


