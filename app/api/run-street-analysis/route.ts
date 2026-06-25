import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFileSync, mkdtempSync, copyFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { homedir } from 'os';
import Papa from 'papaparse';

// Force Node.js runtime (required for fs, child_process, and other Node.js APIs)
export const runtime = 'nodejs';

// Increase max duration for long-running street analysis (10 minutes)
export const maxDuration = 600;

interface StreetScore {
  street_name: string;
  name: string;
  city: string;
  properties_count: number;
  average_price: number;
  similarity_score: number;
  is_reference?: boolean;
}

function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0.0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  
  const set1 = new Set(s1);
  const set2 = new Set(s2);
  
  if (set1.size === 0 || set2.size === 0) return 0.0;
  
  let intersection = 0;
  for (const char of set1) {
    if (set2.has(char)) intersection++;
  }
  
  const union = new Set([...set1, ...set2]).size;
  return intersection / union;
}

function extractStreetName(address: string): string {
  if (!address) return '';
  const parts = address.split(',')[0].trim();
  return parts.replace(/\s+\d+.*$/, '').trim();
}

// Multi-factor street-selection weights (sum = 1.00).
// Anchored on the reference street's listings in the scraped CSV; falls back
// gracefully to name/gracht when an anchor signal is missing.
const STREET_WEIGHTS = {
  proximity: 0.45, // geographic distance to the reference address (most reliable signal)
  neighbourhood: 0.20, // same buurt
  price_per_m2: 0.15, // similar price level (only when the reference street is in the data)
  gracht: 0.10, // both gracht or both not
  name: 0.10, // street-name similarity
};

function toNum(v: any): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Parse the Funda/Apify CSV. Handles standard CSV directly; as a best-effort
// fallback it strips a UTF-8 BOM and un-wraps a double-quoted export (where the
// real CSV was placed inside one quoted field with doubled quotes).
function parseFundaCsv(csvData: string): any[] {
  const tryParse = (text: string): any[] => {
    const p = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      delimitersToGuess: [',', ';', '\t', '|'],
    });
    return (p.data as any[]).filter(Boolean);
  };
  const KNOWN = ['AddressDetails/Title', 'address/street_name', 'street_name', 'Price/NumericSellingPrice'];
  const hasKnownCols = (rows: any[]) => rows.length > 0 && KNOWN.some((k) => k in rows[0]);

  let rows = tryParse(csvData);
  if (hasKnownCols(rows)) return rows;

  // Strip BOM, then try to unwrap a double-quoted export.
  let text = csvData.charCodeAt(0) === 0xfeff ? csvData.slice(1) : csvData;
  const first = text.indexOf('"');
  const last = text.lastIndexOf('"');
  if (first !== -1 && last > first) {
    const unwrapped = tryParse(text.slice(first + 1, last).replace(/""/g, '"'));
    if (hasKnownCols(unwrapped)) return unwrapped;
  }

  if (!hasKnownCols(rows)) {
    console.warn('[street-analysis] Expected Funda columns not found after parsing; CSV format may be unexpected.');
  }
  return rows;
}

interface StreetAgg {
  count: number;
  prices: number[];
  pricesPerM2: number[];
  lats: number[];
  lngs: number[];
  neighbourhood: string;
}

function processCSVForTopStreets(csvData: string, referenceData: any): StreetScore[] {
  try {
    const rows = parseFundaCsv(csvData);
    if (!rows.length) {
      return [{
        street_name: 'Unknown Street',
        name: 'Unknown Street',
        city: 'Amsterdam',
        properties_count: 0,
        average_price: 500000,
        similarity_score: 0,
      }];
    }

    const findValue = (row: any, keys: string[]): any => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
      }
      return undefined;
    };

    // Reference street from the entered address (always known, even if not scraped)
    let refStreetName = referenceData.street_name || '';
    if (!refStreetName && referenceData.address_full) {
      refStreetName = extractStreetName(referenceData.address_full);
    }
    refStreetName = refStreetName.toLowerCase().trim();
    const refIsGracht = refStreetName.includes('gracht');

    // Group listings per street
    const streetMap = new Map<string, StreetAgg>();
    for (const row of rows) {
      let street = findValue(row, [
        'address/street_name', 'street_name', 'address_street_name', 'address.street_name',
      ]);
      if (!street) {
        const title = findValue(row, ['AddressDetails/Title', 'address']);
        if (title) street = String(title).replace(/\s+\d+\S*$/, '').trim();
      }
      if (!street) continue;
      street = String(street).trim();

      const price = toNum(findValue(row, [
        'Price/NumericSellingPrice', 'Advertising/TargetingOptions/vraagprijs',
        'price/selling_price/0', 'price/asking_price/0',
        'selling_price', 'price_selling_price_0', 'price', 'asking_price', 'vraagprijs',
      ]));
      const area = toNum(findValue(row, [
        'FastView/LivingArea', 'Advertising/TargetingOptions/woonoppervlakte',
        'floor_area/0', 'living_area', 'area_m2',
      ]));
      const lat = toNum(findValue(row, ['Coordinates/Latitude', 'latitude', 'lat']));
      const lng = toNum(findValue(row, ['Coordinates/Longitude', 'longitude', 'lng', 'lon']));
      const hood = String(findValue(row, [
        'AddressDetails/NeighborhoodName', 'Advertising/TargetingOptions/buurt',
        'address/neighbourhood', 'neighbourhood',
      ]) || '').toLowerCase().trim();

      if (!streetMap.has(street)) {
        streetMap.set(street, { count: 0, prices: [], pricesPerM2: [], lats: [], lngs: [], neighbourhood: '' });
      }
      const agg = streetMap.get(street)!;
      agg.count++;
      if (price && price > 0) agg.prices.push(price);
      if (price && price > 0 && area && area > 0) agg.pricesPerM2.push(price / area);
      if (lat !== null && lng !== null) { agg.lats.push(lat); agg.lngs.push(lng); }
      if (!agg.neighbourhood && hood) agg.neighbourhood = hood;
    }

    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

    // Anchor on the reference PROPERTY (address geocoding) first — it's always
    // available, even when the reference street was not scraped. Fall back to
    // the reference street's own listings if present in the data.
    const refAgg = streetMap.get(
      [...streetMap.keys()].find((s) => s.toLowerCase().trim() === refStreetName) || ''
    );
    const refLat = toNum(referenceData.latitude ?? referenceData.lat);
    const refLng = toNum(referenceData.longitude ?? referenceData.lng);
    const anchorLat = refLat !== null ? refLat : refAgg ? avg(refAgg.lats) : null;
    const anchorLng = refLng !== null ? refLng : refAgg ? avg(refAgg.lngs) : null;
    const anchorPpsm = refAgg ? avg(refAgg.pricesPerM2) : null; // needs ref street in data
    const anchorHood =
      String(referenceData.neighbourhood || '').toLowerCase().trim() ||
      (refAgg && refAgg.neighbourhood) ||
      '';

    const w = STREET_WEIGHTS;
    const streetScores: StreetScore[] = [];
    for (const [streetName, data] of streetMap.entries()) {
      const streetLower = streetName.toLowerCase().trim();
      const streetPpsm = avg(data.pricesPerM2);
      const streetLat = avg(data.lats);
      const streetLng = avg(data.lngs);

      // Each factor 0..1, neutral 0.5 when the needed data is missing.
      const priceScore =
        anchorPpsm && streetPpsm ? Math.max(0, 1 - Math.abs(streetPpsm - anchorPpsm) / anchorPpsm) : 0.5;
      const hoodScore = anchorHood && data.neighbourhood ? (data.neighbourhood === anchorHood ? 1.0 : 0.3) : 0.5;
      const proxScore =
        anchorLat !== null && anchorLng !== null && streetLat !== null && streetLng !== null
          ? Math.max(0, 1 - haversineKm(anchorLat, anchorLng, streetLat, streetLng) / 3)
          : 0.5;
      const grachtScore = streetLower.includes('gracht') === refIsGracht ? 1.0 : 0.0;
      const nameScore = streetLower === refStreetName ? 1.0 : calculateStringSimilarity(refStreetName, streetName);

      const similarity =
        w.price_per_m2 * priceScore +
        w.neighbourhood * hoodScore +
        w.proximity * proxScore +
        w.gracht * grachtScore +
        w.name * nameScore;

      streetScores.push({
        street_name: streetName,
        name: streetName,
        city: 'Amsterdam',
        properties_count: data.count,
        average_price: data.prices.length ? Math.round(avg(data.prices)!) : 500000,
        similarity_score: similarity,
      });
    }

    streetScores.sort((a, b) => b.similarity_score - a.similarity_score);

    // Reference street ALWAYS first
    const refStreetData = streetScores.find((s) => s.street_name.toLowerCase().trim() === refStreetName);
    const finalStreets: StreetScore[] = [];
    finalStreets.push(
      refStreetData
        ? { ...refStreetData, is_reference: true }
        : {
            street_name: refStreetName || 'Unknown',
            name: refStreetName || 'Unknown',
            city: 'Amsterdam',
            properties_count: 0,
            average_price: 0,
            similarity_score: 1.0,
            is_reference: true,
          }
    );

    const otherStreets = streetScores
      .filter((s) => s.street_name.toLowerCase().trim() !== refStreetName)
      .slice(0, 9);
    finalStreets.push(...otherStreets);

    return finalStreets;
  } catch (error) {
    console.error('Error processing CSV:', error);
    return [{
      street_name: 'Error',
      name: 'Error',
      city: 'Amsterdam',
      properties_count: 0,
      average_price: 0,
      similarity_score: 0,
    }];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csvData, referenceData } = body;

    if (!csvData || !referenceData) {
      return NextResponse.json(
        { error: 'CSV data and reference data are required' },
        { status: 400 }
      );
    }

    console.log('Using JavaScript implementation...');
    return await runJavaScriptStreetAnalysis(csvData, referenceData);

  } catch (error) {
    console.error('Error in street analysis:', error);
    return NextResponse.json(
      { 
        error: 'Street analysis failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

async function runPythonStreetAnalysis(csvData: string, referenceData: any): Promise<NextResponse> {
  // Create temporary directory
  const tempDir = mkdtempSync(join(tmpdir(), 'street-analysis-'));
  
  // Write CSV data to file
  const csvFilePath = join(tempDir, 'funda_data.csv');
  writeFileSync(csvFilePath, csvData, 'utf8');

  // Write reference data to file
  const referenceFilePath = join(tempDir, 'reference_data.json');
  writeFileSync(referenceFilePath, JSON.stringify(referenceData, null, 2), 'utf8');

  // Copy CSV to downloads folder (localhost only)
  const downloadsDir = join(homedir(), 'Downloads');
  const csvDownloadPath = join(downloadsDir, `funda_scraper_${Date.now()}.csv`);
  try {
    copyFileSync(csvFilePath, csvDownloadPath);
    console.log('Funda CSV copied to:', csvDownloadPath);
  } catch (err) {
    console.warn('Could not copy CSV to Downloads:', err);
  }

  console.log('Starting street analysis (Python - Algorithm 1 only)...');
  console.log('Temp directory:', tempDir);
  console.log('CSV file:', csvFilePath);
  console.log('Reference file:', referenceFilePath);

  // Run Python script for street analysis only
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const pythonScript = join(process.cwd(), 'apps/workflow-py/workflow/api_workflow_streets_only.py');
  
  console.log('Python command:', pythonCmd);
  console.log('Python script:', pythonScript);
  console.log('Working directory:', join(process.cwd(), 'apps/workflow-py/workflow'));
  
  const pythonProcess = spawn(pythonCmd, [pythonScript, referenceFilePath, csvFilePath], {
    cwd: join(process.cwd(), 'apps/workflow-py/workflow'),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1'
    }
  });

  let stdout = '';
  let stderr = '';

  pythonProcess.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    stderr += data.toString();
    console.log('Python stderr:', data.toString());
  });

  // Set a timeout for the Python process (9 minutes to stay under 10 minute limit)
  const processTimeout = setTimeout(() => {
    pythonProcess.kill();
    console.error('Python process timed out after 9 minutes');
  }, 9 * 60 * 1000);

  return new Promise((resolve) => {
    pythonProcess.on('close', (code) => {
      clearTimeout(processTimeout);
      console.log(`Python process exited with code ${code}`);
      
      if (code !== 0 && code !== null) {
        console.error('Python process failed with code:', code);
        console.error('stderr:', stderr);
        console.error('stdout:', stdout);
      }
      
      try {
        // Extract JSON from stdout
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          console.log('Extracted JSON:', result);
          
          resolve(NextResponse.json({
            status: 'success',
            message: 'Street analysis completed',
            result: result
          }));
        } else {
          console.error('No JSON found in stdout:', stdout);
          console.error('stderr:', stderr);
          resolve(NextResponse.json({
            status: 'error',
            message: 'No valid result from Python script',
            stdout: stdout.substring(0, 1000),
            stderr: stderr.substring(0, 1000)
          }, { status: 500 }));
        }
      } catch (parseError) {
        console.error('Error parsing Python output:', parseError);
        console.error('stdout:', stdout);
        console.error('stderr:', stderr);
        resolve(NextResponse.json({
          status: 'error',
          message: 'Failed to parse Python script output',
          stdout: stdout.substring(0, 1000),
          stderr: stderr.substring(0, 1000),
          error: parseError instanceof Error ? parseError.message : String(parseError)
        }, { status: 500 }));
      }
    });
    
    pythonProcess.on('error', (error: any) => {
      clearTimeout(processTimeout);
      console.error('Python process error:', error);
      
      if (error.code === 'ENOENT') {
        resolve(NextResponse.json({
          status: 'error',
          message: `Python command '${pythonCmd}' not found. Please install Python.`,
          error: error.message,
          code: error.code
        }, { status: 500 }));
      } else {
        resolve(NextResponse.json({
          status: 'error',
          message: 'Failed to start Python process',
          error: error.message,
          code: error.code
        }, { status: 500 }));
      }
    });
  });
}

async function runJavaScriptStreetAnalysis(csvData: string, referenceData: any): Promise<NextResponse> {
  console.log('Starting street analysis (JavaScript implementation)...');
  console.log('CSV data length:', csvData.length);
  console.log('Reference data:', referenceData);

  // Process CSV data to find top streets
  const topStreets = processCSVForTopStreets(csvData, referenceData);
  
  console.log(`Found ${topStreets.length} streets`);

  // Prepare result
  const result = {
    status: 'success',
    message: `Found ${topStreets.length} top streets`,
    top_streets: topStreets,
    total_funda_records: csvData.split('\n').length - 1, // Subtract header
    reference_street_found: topStreets.some(s => s.is_reference)
  };

  console.log('Street analysis completed successfully');

  return NextResponse.json({
    status: 'success',
    message: 'Street analysis completed',
    result: result
  });
}
