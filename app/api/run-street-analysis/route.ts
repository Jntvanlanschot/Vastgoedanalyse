import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFileSync, mkdtempSync, copyFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { homedir } from 'os';
import Papa from 'papaparse';

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

function processCSVForTopStreets(csvData: string, referenceData: any): StreetScore[] {
  try {
    // Parse CSV robustly (auto-detect delimiter, handle semicolons/tabs)
    const parsed = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      delimitersToGuess: [',', ';', '\t', '|']
    });

    const rows = (parsed.data as any[]).filter(Boolean);
    if (!rows.length) {
      return [{
        street_name: 'Unknown Street',
        name: 'Unknown Street',
        city: 'Amsterdam',
        properties_count: 0,
        average_price: 500000,
        similarity_score: 0
      }];
    }

    // Accept multiple possible column names
    const findValue = (row: any, keys: string[]): any => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
      }
      return undefined;
    };
    
    // Get reference street name
    let refStreetName = referenceData.street_name || '';
    if (!refStreetName && referenceData.address_full) {
      refStreetName = extractStreetName(referenceData.address_full);
    }
    refStreetName = refStreetName.toLowerCase().trim();
    
    // Group by street and calculate stats
    const streetMap = new Map<string, { count: number; prices: number[] }>();
    
    for (const row of rows) {
      const street = findValue(row, [
        'address/street_name',
        'street_name',
        'address_street_name',
        'address.street_name',
        'address',
      ]);
      if (!street) continue;

      const priceRaw = findValue(row, [
        'price/selling_price/0',
        'price/asking_price/0',
        'selling_price',
        'price_selling_price_0',
        'price',
        'asking_price',
      ]);
      const price = typeof priceRaw === 'number'
        ? priceRaw
        : parseFloat(String(priceRaw).replace(/[^\d.-]/g, '')) || 0;

      if (!streetMap.has(street)) {
        streetMap.set(street, { count: 0, prices: [] });
      }
      
      const streetData = streetMap.get(street)!;
      streetData.count++;
      if (price > 0) {
        streetData.prices.push(price);
      }
    }
    
    // Calculate scores for each street
    const streetScores: StreetScore[] = [];
    
    for (const [streetName, data] of streetMap.entries()) {
      // Simple similarity: exact match = 1.0, otherwise string similarity
      let similarity = 0.0;
      const streetLower = streetName.toLowerCase().trim();
      
      if (streetLower === refStreetName) {
        similarity = 1.0;
      } else {
        similarity = calculateStringSimilarity(refStreetName, streetName);
      }
      
      // Calculate average price
      const avgPrice = data.prices.length > 0
        ? Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length)
        : 500000;
      
      streetScores.push({
        street_name: streetName,
        name: streetName,
        city: 'Amsterdam',
        properties_count: data.count,
        average_price: avgPrice,
        similarity_score: similarity
      });
    }
    
    // Sort by similarity score
    streetScores.sort((a, b) => b.similarity_score - a.similarity_score);
    
    // Find reference street
    const refStreetData = streetScores.find(s => 
      s.street_name.toLowerCase().trim() === refStreetName
    );
    
    // Build final result: reference street first, then top 9 others
    const finalStreets: StreetScore[] = [];
    
    if (refStreetData) {
      finalStreets.push({
        ...refStreetData,
        is_reference: true
      });
    } else {
      finalStreets.push({
        street_name: refStreetName || 'Unknown',
        name: refStreetName || 'Unknown',
        city: 'Amsterdam',
        properties_count: 0,
        average_price: 0,
        similarity_score: 1.0,
        is_reference: true
      });
    }
    
    // Add top 9 other streets (excluding reference)
    const otherStreets = streetScores
      .filter(s => s.street_name.toLowerCase().trim() !== refStreetName)
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
      similarity_score: 0
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

    // On Vercel, use JavaScript implementation (no Python available)
    // On localhost, use Python implementation (faster and more accurate)
    const usePython = !process.env.VERCEL;
    
    if (usePython) {
      console.log('Using Python implementation (localhost)...');
      return await runPythonStreetAnalysis(csvData, referenceData);
    } else {
      console.log('Using JavaScript implementation (Vercel)...');
      return await runJavaScriptStreetAnalysis(csvData, referenceData);
    }

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
