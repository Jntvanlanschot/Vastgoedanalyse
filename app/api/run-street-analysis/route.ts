import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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
    // Parse CSV
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return [{
        street_name: 'Unknown Street',
        name: 'Unknown Street',
        city: 'Amsterdam',
        properties_count: 0,
        average_price: 500000,
        similarity_score: 0
      }];
    }
    
    const headers = lines[0].split(',').map(h => h.trim());
    const streetColIndex = headers.findIndex(h => 
      h === 'address/street_name' || h === 'street_name' || h === 'address_street_name'
    );
    
    if (streetColIndex === -1) {
      return [{
        street_name: 'Unknown Street',
        name: 'Unknown Street',
        city: 'Amsterdam',
        properties_count: 0,
        average_price: 500000,
        similarity_score: 0
      }];
    }
    
    const priceColIndex = headers.findIndex(h => 
      h === 'price/selling_price/0' || h === 'selling_price' || h === 'price_selling_price_0' || h === 'price'
    );
    
    // Parse rows
    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values[streetColIndex]) {
        rows.push({
          street_name: values[streetColIndex],
          price: priceColIndex !== -1 ? parseFloat(values[priceColIndex]) || 0 : 0
        });
      }
    }
    
    // Get reference street name
    let refStreetName = referenceData.street_name || '';
    if (!refStreetName && referenceData.address_full) {
      refStreetName = extractStreetName(referenceData.address_full);
    }
    refStreetName = refStreetName.toLowerCase().trim();
    
    // Group by street and calculate stats
    const streetMap = new Map<string, { count: number; prices: number[] }>();
    
    for (const row of rows) {
      const street = row.street_name;
      if (!street) continue;
      
      if (!streetMap.has(street)) {
        streetMap.set(street, { count: 0, prices: [] });
      }
      
      const streetData = streetMap.get(street)!;
      streetData.count++;
      if (row.price > 0) {
        streetData.prices.push(row.price);
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
