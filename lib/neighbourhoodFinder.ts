import { getDistance } from 'geolib';
import fs from 'fs';
import path from 'path';

interface Wijk {
  name: string;
  lat: number;
  lng: number;
}

interface WijkWithDistance extends Wijk {
  distance: number;
}

/**
 * Load Amsterdam wijken data from JSON file
 */
function loadAmsterdamWijken(): Wijk[] {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'amsterdam_wijken.json');
    const data = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading Amsterdam wijken data:', error);
    throw new Error('Failed to load Amsterdam wijken data');
  }
}

/**
 * Calculate distance between two coordinates using geolib
 */
function calculateDistance(
  userLat: number,
  userLng: number,
  wijkLat: number,
  wijkLng: number
): number {
  return getDistance(
    { latitude: userLat, longitude: userLng },
    { latitude: wijkLat, longitude: wijkLng }
  );
}

/**
 * Find the 3 closest Amsterdam wijken to a given location
 */
export function findClosestWijken(
  userLat: number,
  userLng: number
): string[] {
  const wijken = loadAmsterdamWijken();
  
  // Calculate distances for all wijken
  const wijkenWithDistance: WijkWithDistance[] = wijken.map(wijk => ({
    ...wijk,
    distance: calculateDistance(userLat, userLng, wijk.lat, wijk.lng)
  }));
  
  // Sort by distance (closest first)
  wijkenWithDistance.sort((a, b) => a.distance - b.distance);
  
  // Take the 3 closest wijken
  const closestWijken = wijkenWithDistance.slice(0, 3);
  
  // Format for Funda scraper: "amsterdam/wijk-<wijknaam>"
  const formattedWijken = closestWijken.map(wijk => 
    `amsterdam/wijk-${wijk.name.toLowerCase().replace(/\s+/g, '-')}`
  );
  
  // Ensure we always have exactly 3 wijken
  while (formattedWijken.length < 3) {
    formattedWijken.push('amsterdam/wijk-centrum');
  }
  
  return formattedWijken.slice(0, 3);
}

/**
 * Generate Funda scraper configuration JSON
 */
export function generateFundaConfig(closestWijken: string[]) {
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=[${closestWijken.map(wijk => `"${wijk}"`).join(',')}]&availability=["negotiations","unavailable"]`;
  
  const config = {
    includeSold: true,
    includeUnderOffer: true,
    maxItems: 150,
    proxyConfiguration: {
      useApifyProxy: true
    },
    searchUrls: [searchUrl]
  };
  
  return config;
}

/**
 * Main function to process an address and return Funda scraper config
 */
export async function processAddressForFunda(address: string): Promise<any> {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      throw new Error('Google Maps API key not configured');
    }
    
    // Geocode the address
    const encodedAddress = encodeURIComponent(address);
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;
    
    console.log('Geocoding URL:', geocodeUrl);
    
    const response = await fetch(geocodeUrl);
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.results.length) {
      throw new Error(`Geocoding failed: ${data.status}`);
    }
    
    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    
    console.log(`Geocoded address: ${address} -> lat: ${lat}, lng: ${lng}`);
    
    // Find closest wijken
    const closestWijken = findClosestWijken(lat, lng);
    console.log('Closest wijken:', closestWijken);
    
    // Generate Funda config
    const fundaConfig = generateFundaConfig(closestWijken);
    
    console.log('Generated Funda config:', JSON.stringify(fundaConfig, null, 2));
    
    return fundaConfig;
    
  } catch (error) {
    console.error('Error processing address:', error);
    throw error;
  }
}
