import { NextRequest, NextResponse } from 'next/server';
import { nearestBuurtenNL } from '@/lib/nearestBuurten';
import { buildApifyInputFromBuurten } from '@/lib/fundaBuilder';

interface GeocodingResult {
  lat: number;
  lng: number;
  city: string;
  neighbourhood: string;
}

interface GoogleGeocodingResponse {
  results: Array<{
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
  }>;
  status: string;
}

async function geocodeAddress(address: string): Promise<GeocodingResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  const encodedAddress = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

  console.log('Geocoding URL:', url);

  const response = await fetch(url);
  const data: GoogleGeocodingResponse = await response.json();

  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Geocoding failed: ${data.status}`);
  }

  const result = data.results[0];
  const { lat, lng } = result.geometry.location;

  // Extract city and neighbourhood from address components
  let city = '';
  let neighbourhood = '';

  for (const component of result.address_components) {
    if (component.types.includes('locality')) {
      city = component.long_name.toLowerCase();
    } else if (component.types.includes('sublocality') || component.types.includes('neighborhood')) {
      neighbourhood = component.long_name.toLowerCase();
    }
  }

  // Fallback: if no neighbourhood found, try sublocality_level_1
  if (!neighbourhood) {
    for (const component of result.address_components) {
      if (component.types.includes('sublocality_level_1')) {
        neighbourhood = component.long_name.toLowerCase();
        break;
      }
    }
  }

  console.log('Extracted city:', city);
  console.log('Extracted neighbourhood:', neighbourhood);

  return { lat, lng, city, neighbourhood };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, referenceData } = body;

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Address is required' },
        { status: 400 }
      );
    }

    console.log('Received address:', address);

    // Geocode the address
    const geo = await geocodeAddress(address);

    // Use the new nationwide buurten finder
    console.log('Using nationwide buurten selection');
    const nearestBuurten = nearestBuurtenNL({ lat: geo.lat, lng: geo.lng }, 4);
    console.log('Nearest buurten:', nearestBuurten.map(b => `${b.municipalitySlug}/buurt-${b.fundaSlug}`));
    
    const fundaConfig = buildApifyInputFromBuurten(nearestBuurten);

    // Log the Apify-compatible JSON for console output
    console.log(JSON.stringify(fundaConfig, null, 2));

    // Return both the Apify config and the geo data
    return NextResponse.json({
      ...fundaConfig,
      geo: {
        lat: geo.lat,
        lng: geo.lng,
        city: geo.city,
        address: address
      },
      referenceData: referenceData || null
    });
  } catch (error) {
    console.error('Error processing address:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}
