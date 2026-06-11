import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthCookieFromRequest } from '@/lib/auth/cookies';
import { parseMhtmlFile, ParsedProperty } from '@/lib/workflow/parseRealworksMhtml';
import {
  calculateFeatureScores,
  combineFeatureScores,
  CandidateProperty,
  FeatureScores,
} from '@/lib/workflow/calculateSimilarity';

// Force Node.js runtime (required for Buffer)
export const runtime = 'nodejs';

// Parsing large MHTML exports can take a while
export const maxDuration = 300;

type BlobRef = {
  url: string;
  name: string;
  size?: number;
  type?: string;
};

function extractStreetName(address: string): string {
  try {
    // Extract street name from full address
    // Format: "Eerste Laurierdwarsstraat 19, 1016 PW Amsterdam, Nederland"
    const parts = address.split(',');
    if (parts.length > 0) {
      const streetPart = parts[0].trim();
      // Remove house number (everything after the last space that contains digits)
      const streetName = streetPart.replace(/\s+\d+.*$/, '').trim();
      return streetName;
    }
    return '';
  } catch (error) {
    console.error('Error extracting street name:', error);
    return '';
  }
}

export interface TuningCandidate {
  address_full: string;
  street: string;
  city: string;
  rw_sale_price: number | null;
  rw_ask_price: number | null;
  rw_area_m2: number | null;
  rw_rooms: number | null;
  rw_bedrooms: number | null;
  rw_energy_label: string | null;
  rw_sale_date: string | null;
  rw_year_built: number | null;
  rw_has_garden: boolean;
  rw_has_balcony: boolean;
  rw_has_terrace: boolean;
  features: FeatureScores;
  default_score: number;
}

/**
 * Tuning endpoint: parses Realworks files once and returns ALL candidates
 * with their per-feature subscores, so the /tuning page can re-rank
 * client-side with arbitrary weights without re-parsing.
 *
 * Accepts either JSON ({ referenceData, blobs }) like /api/upload-realworks,
 * or multipart form-data (referenceData + realworks_file_1..10) for small uploads.
 */
export async function POST(request: NextRequest) {
  // API routes are not covered by the auth middleware, so check the cookie here
  const payload = await verifyAuthCookieFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const contentType = request.headers.get('content-type') || '';

    let referenceData: any;
    const files: Array<{ buffer: Buffer; filename: string }> = [];

    if (contentType.includes('application/json')) {
      const body = await request.json();
      referenceData = body?.referenceData;
      const blobs: BlobRef[] = body?.blobs || [];

      if (!referenceData) {
        return NextResponse.json({ error: 'Reference data is required' }, { status: 400 });
      }
      if (!Array.isArray(blobs) || blobs.length === 0) {
        return NextResponse.json({ error: 'At least 1 Realworks file (blob) is required' }, { status: 400 });
      }

      for (const blob of blobs) {
        const res = await fetch(blob.url);
        if (!res.ok) {
          throw new Error(`Failed to download blob ${blob.url}: ${res.status}`);
        }
        files.push({
          buffer: Buffer.from(await res.arrayBuffer()),
          filename: blob.name || 'unknown.mhtml',
        });
      }
    } else {
      const formData = await request.formData();
      const referenceDataStr = formData.get('referenceData') as string;
      if (!referenceDataStr) {
        return NextResponse.json({ error: 'Reference data is required' }, { status: 400 });
      }
      referenceData = JSON.parse(referenceDataStr);

      for (let i = 1; i <= 10; i++) {
        const file = formData.get(`realworks_file_${i}`) as File | null;
        if (file) {
          files.push({
            buffer: Buffer.from(await file.arrayBuffer()),
            filename: file.name,
          });
        }
      }

      if (files.length === 0) {
        return NextResponse.json({ error: 'At least 1 Realworks file is required' }, { status: 400 });
      }
    }

    const processedReferenceData = {
      ...referenceData,
      street_name: extractStreetName(referenceData.address_full || ''),
      neighbourhood: referenceData.neighbourhood || 'unknown',
    };

    // Parse all MHTML files
    const allProperties: ParsedProperty[] = [];
    for (const file of files) {
      if (file.filename.endsWith('.mhtml') || file.filename.endsWith('.mht')) {
        const properties = await parseMhtmlFile(file.buffer, file.filename);
        allProperties.push(...properties);
      }
    }

    // Remove duplicates by address (same as runWorkflow)
    const uniqueMap = new Map<string, ParsedProperty>();
    for (const prop of allProperties) {
      const key = prop.address_full.toLowerCase().trim();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, prop);
      }
    }

    const candidates: TuningCandidate[] = Array.from(uniqueMap.values()).map((prop) => {
      const candidate: CandidateProperty = {
        ...prop,
        rw_sale_price: prop.sale_price ?? undefined,
        rw_area_m2: prop.area_m2 ?? undefined,
        rw_bedrooms: prop.bedrooms ?? undefined,
        rw_rooms: prop.rooms ?? undefined,
        rw_energy_label: prop.energy_label ?? undefined,
        rw_has_garden: prop.has_garden || false,
        rw_has_balcony: prop.has_balcony || false,
        rw_has_terrace: prop.has_terrace || false,
        rw_year_built: prop.year_built ?? undefined,
        rw_sale_date: prop.sale_date ?? undefined,
        street: prop.street || '',
      };

      const features = calculateFeatureScores(candidate, processedReferenceData);

      return {
        address_full: prop.address_full,
        street: prop.street || '',
        city: prop.city || '',
        rw_sale_price: prop.sale_price,
        rw_ask_price: prop.ask_price,
        rw_area_m2: prop.area_m2,
        rw_rooms: prop.rooms,
        rw_bedrooms: prop.bedrooms,
        rw_energy_label: prop.energy_label,
        rw_sale_date: prop.sale_date,
        rw_year_built: prop.year_built,
        rw_has_garden: prop.has_garden || false,
        rw_has_balcony: prop.has_balcony || false,
        rw_has_terrace: prop.has_terrace || false,
        features,
        default_score: combineFeatureScores(features),
      };
    });

    return NextResponse.json({
      status: 'success',
      reference: processedReferenceData,
      total_parsed: allProperties.length,
      total_unique: candidates.length,
      candidates,
    });
  } catch (error) {
    console.error('[tuning] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
