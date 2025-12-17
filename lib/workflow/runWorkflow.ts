/**
 * Main workflow runner - TypeScript port of api_workflow.py
 * Orchestrates the complete workflow:
 * 1. Process reference address and get top streets from CSV
 * 2. Process Realworks files
 * 3. Merge data and select top 15 matches
 * 4. Generate reports (PDF/Excel)
 */

import { parseMhtmlFile, ParsedProperty } from './parseRealworksMhtml';
import { calculateSimpleSimilarityScore, ReferenceData, CandidateProperty } from './calculateSimilarity';
import Papa from 'papaparse';
// CRITICAL: Apply fontkit patch BEFORE pdfmake/fontkit imports
import { applyFontkitTriePatch } from '@/lib/fontkit-trie-patch';
applyFontkitTriePatch();

import { generatePdfReport } from './generatePdfReport';
import { generatePdfReportSimple } from './generatePdfReportSimple';
import { generateExcelReport } from './generateExcelReport';
import { generateHtmlReport } from './generateHtmlReport';

export interface WorkflowResult {
  status: 'success' | 'error';
  message: string;
  step1_result?: {
    status: string;
    message: string;
  };
  step2_result?: {
    status: string;
    message: string;
    top_5_streets?: Array<{
      street_name: string;
      name: string;
      city: string;
      properties_count: number;
      average_price: number;
    }>;
    total_funda_records?: number;
  };
  step3_result?: {
    status: string;
    message: string;
    processed_records: number;
  };
  step4_result?: {
    status: string;
    message: string;
    matched_records: number;
    top_15_count: number;
  };
  summary?: {
    total_realworks: number;
    top_15_matches: number;
  };
  artifacts?: {
    top15_csv?: string;
    pdf_report?: string;
    excel_report?: string;
    html_report?: string;
    pdf_buffer?: string;
    excel_buffer?: string;
  };
}

interface StreetSimilarityCache {
  [streetName: string]: any[];
}

/**
 * Process Realworks files and extract properties
 */
async function processRealworksFiles(
  realworksFiles: Array<{ buffer: Buffer; filename: string }>
): Promise<{
  status: string;
  message: string;
  processed_records: number;
  properties: ParsedProperty[];
}> {
  try {
    if (!realworksFiles || realworksFiles.length === 0) {
      return {
        status: 'success',
        message: 'No Realworks files provided',
        processed_records: 0,
        properties: [],
      };
    }
    
    console.log(`Processing ${realworksFiles.length} Realworks files`);
    
    const allProperties: ParsedProperty[] = [];
    
    for (const file of realworksFiles) {
      if (file.filename.endsWith('.mhtml') || file.filename.endsWith('.mht')) {
        const properties = await parseMhtmlFile(file.buffer, file.filename);
        allProperties.push(...properties);
        console.log(`Parsed MHTML ${file.filename}: ${properties.length} properties`);
      } else {
        console.warn(`Unsupported file type: ${file.filename}`);
      }
    }
    
    if (allProperties.length === 0) {
      return {
        status: 'success',
        message: 'No property data found in Realworks files',
        processed_records: 0,
        properties: [],
      };
    }
    
    // Remove duplicates by address
    const uniqueProperties = new Map<string, ParsedProperty>();
    for (const prop of allProperties) {
      const key = prop.address_full.toLowerCase().trim();
      if (!uniqueProperties.has(key)) {
        uniqueProperties.set(key, prop);
      }
    }
    
    const uniqueProps = Array.from(uniqueProperties.values());
    
    return {
      status: 'success',
      message: `Processed ${uniqueProps.length} Realworks records`,
      processed_records: uniqueProps.length,
      properties: uniqueProps,
    };
  } catch (error) {
    console.error('Error processing Realworks files:', error);
    return {
      status: 'error',
      message: `Failed to process Realworks files: ${error instanceof Error ? error.message : String(error)}`,
      processed_records: 0,
      properties: [],
    };
  }
}

/**
 * Process CSV data to find top streets (simplified - street analysis already done)
 */
function processCsvForTopStreets(
  csvData: string | null,
  referenceData: ReferenceData
): {
  status: string;
  message: string;
  top_5_streets?: Array<{
    street_name: string;
    name: string;
    city: string;
    properties_count: number;
    average_price: number;
  }>;
  total_funda_records?: number;
} {
  if (!csvData) {
    // No CSV data - user skipped Funda scraper
    const referenceStreet = referenceData.street_name || 'Onbekend';
    return {
      status: 'success',
      message: 'No Funda data - using only Realworks data',
      top_5_streets: [{
        street_name: referenceStreet,
        name: referenceStreet,
        city: referenceData.address_full?.split(',').pop()?.trim() || '',
        properties_count: 0,
        average_price: 0,
      }],
      total_funda_records: 0,
    };
  }
  
  try {
    // Parse CSV
    const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
    const records = parsed.data as any[];
    
    // For now, just return the reference street
    // Full street analysis is done separately in run-street-analysis
    const referenceStreet = referenceData.street_name || 'Onbekend';
    
    return {
      status: 'success',
      message: `Found ${records.length} Funda records`,
      top_5_streets: [{
        street_name: referenceStreet,
        name: referenceStreet,
        city: referenceData.address_full?.split(',').pop()?.trim() || '',
        properties_count: records.length,
        average_price: 0,
      }],
      total_funda_records: records.length,
    };
  } catch (error) {
    console.error('Error processing CSV:', error);
    return {
      status: 'error',
      message: `Failed to process CSV: ${error instanceof Error ? error.message : String(error)}`,
      total_funda_records: 0,
    };
  }
}

/**
 * Process Realworks data and select top 15 matches
 */
function processRealworksForTop15(
  properties: ParsedProperty[],
  referenceData: ReferenceData,
  streetSimilarityCache?: StreetSimilarityCache
): {
  status: string;
  message: string;
  matched_records: number;
  top_15_count: number;
  top15: CandidateProperty[];
} {
  try {
    console.log(`Processing ${properties.length} Realworks records for top 15 matches`);
    
    if (properties.length === 0) {
      return {
        status: 'error',
        message: 'No Realworks properties to process',
        matched_records: 0,
        top_15_count: 0,
        top15: [],
      };
    }
    
    // IMPORTANT: Use sale_price (Transactieprijs) directly, NOT ask_price
    // Vraagprijs should be separate
    const processedProperties: CandidateProperty[] = properties.map(prop => {
      const candidate: CandidateProperty = {
        ...prop,
        rw_sale_price: prop.sale_price || null, // Transactieprijs - DO NOT use ask_price as fallback
        rw_ask_price: prop.ask_price || null, // Vraagprijs - keep separate
        rw_area_m2: prop.area_m2 || null,
        rw_bedrooms: prop.bedrooms || null,
        rw_rooms: prop.rooms || null,
        rw_energy_label: prop.energy_label || null,
        rw_energy_label_end_date: prop.energy_label_end_date || null,
        rw_has_garden: prop.has_garden || false,
        rw_garden_type: prop.garden_type || null,
        rw_has_balcony: prop.has_balcony || false,
        rw_has_terrace: prop.has_terrace || false,
        rw_balcony_terrace_type: prop.balcony_terrace_type || null,
        rw_year_built: prop.year_built || null,
        rw_sale_date: prop.sale_date || null,
        street: prop.street || '',
        // Preserve images if available (from ParsedProperty)
        images: (prop as any).images || undefined,
        image_count: (prop as any).image_count || undefined,
      };
      return candidate;
    });
    
    // Remove duplicates by normalized address
    const uniqueMap = new Map<string, CandidateProperty>();
    for (const prop of processedProperties) {
      const key = prop.address_full.toLowerCase().trim();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, prop);
      }
    }
    
    const uniqueProperties = Array.from(uniqueMap.values());
    console.log(`After deduplication: ${uniqueProperties.length} unique properties`);
    
    // Calculate similarity scores
    const scoredProperties = uniqueProperties.map(prop => {
      const similarityScore = calculateSimpleSimilarityScore(prop, referenceData, streetSimilarityCache);
      return {
        ...prop,
        similarity_score: similarityScore,
        final_score: similarityScore, // For now, same as similarity_score
      };
    });
    
    // Sort by similarity score and take top 15
    scoredProperties.sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));
    const top15 = scoredProperties.slice(0, 15);
    
    console.log(`Selected top 15 matches with scores ranging from ${top15[top15.length - 1]?.similarity_score || 0} to ${top15[0]?.similarity_score || 0}`);
    
    return {
      status: 'success',
      message: 'Analysis completed',
      matched_records: uniqueProperties.length,
      top_15_count: top15.length,
      top15,
    };
  } catch (error) {
    console.error('Error processing Realworks for top 15:', error);
    return {
      status: 'error',
      message: `Failed to process Realworks data: ${error instanceof Error ? error.message : String(error)}`,
      matched_records: 0,
      top_15_count: 0,
      top15: [],
    };
  }
}

/**
 * Run the complete workflow
 */
export async function runWorkflow(
  referenceData: ReferenceData,
  csvData: string | null,
  realworksFiles: Array<{ buffer: Buffer; filename: string }>,
  streetSimilarityCache?: StreetSimilarityCache
): Promise<WorkflowResult> {
  try {
    console.log('=== STARTING API WORKFLOW WITH REALWORKS ===');
    
    // Step 1: Process CSV for top streets (simplified - street analysis done separately)
    console.log('STEP 1: Processing CSV data...');
    const step1Result = {
      status: 'success',
      message: csvData ? 'CSV data processed' : 'No CSV data - skipped Funda scraper',
    };
    
    // Step 2: Process CSV to find top streets
    console.log('STEP 2: Processing reference address and selecting top streets from CSV...');
    const step2Result = processCsvForTopStreets(csvData, referenceData);
    
    // Step 3: Process Realworks files
    console.log('STEP 3: Processing Realworks files...');
    console.log(`[workflow] Processing ${realworksFiles.length} Realworks files...`);
    const step3StartTime = Date.now();
    const realworksResult = await processRealworksFiles(realworksFiles);
    const step3Time = Date.now() - step3StartTime;
    console.log(`[workflow] Step 3 completed in ${step3Time}ms: ${realworksResult.processed_records} records`);
    const step3Result = {
      status: realworksResult.status,
      message: realworksResult.message,
      processed_records: realworksResult.processed_records,
    };
    
    // Check if we have Realworks data
    if (realworksResult.status !== 'success' || realworksResult.processed_records === 0) {
      console.error('Realworks data is REQUIRED for price calculation. No Realworks files processed.');
      return {
        status: 'error',
        message: 'Realworks data is required for price calculation',
        step1_result: step1Result,
        step2_result: step2Result,
        step3_result: step3Result,
        step4_result: undefined,
      };
    }
    
    // Step 4: Process Realworks data and select top 15
    console.log('STEP 4: Creating analysis results...');
    const top15Result = processRealworksForTop15(
      realworksResult.properties,
      referenceData,
      streetSimilarityCache
    );
    
    const step4Result = {
      status: top15Result.status,
      message: top15Result.message,
      matched_records: top15Result.matched_records,
      top_15_count: top15Result.top_15_count,
    };
    
    // Step 5: Generate reports
    console.log('STEP 5: Generating reports...');
    console.log(`Top 15 count: ${top15Result.top_15_count}, Top15 array length: ${top15Result.top15.length}`);
    
    let pdfBuffer: Buffer | null = null;
    let excelBuffer: Buffer | null = null;
    let htmlReport: string | null = null;
    
    if (top15Result.top15.length === 0) {
      console.error('ERROR: No top 15 properties available for report generation!');
      console.error('Top15Result:', JSON.stringify(top15Result, null, 2));
    } else {
      try {
        // Always generate HTML report (works everywhere, no dependencies)
        console.log(`Generating HTML report for ${top15Result.top15.length} properties...`);
        // Note: pdfUrl will be added later when HTML is uploaded to blob (if PDF exists)
        htmlReport = generateHtmlReport(top15Result.top15, referenceData, null);
        console.log(`HTML report generated successfully: ${htmlReport.length} bytes`);
        
               // PDF generation: DISABLED per user request
               // User requested no PDF generation
               pdfBuffer = null;
               console.log('PDF generation skipped (disabled per user request)');
        
        // Always generate Excel report (no fontkit dependency)
        console.log(`Generating Excel report for ${top15Result.top15.length} properties...`);
        excelBuffer = await generateExcelReport(top15Result.top15, referenceData);
        console.log(`Excel generated successfully: ${excelBuffer.length} bytes`);
      } catch (reportError) {
        console.error('CRITICAL ERROR generating reports:', reportError);
        if (reportError instanceof Error) {
          console.error('Report error message:', reportError.message);
          console.error('Report error stack:', reportError.stack);
        }
        // Don't continue - fail the workflow if critical reports can't be generated
        throw new Error(`Report generation failed: ${reportError instanceof Error ? reportError.message : String(reportError)}`);
      }
    }
    
    const summary = {
      total_realworks: realworksResult.processed_records,
      top_15_matches: top15Result.top_15_count,
    };
    
    // Convert top15 to CSV format
    const top15Csv = Papa.unparse(top15Result.top15.map(prop => ({
      address_full: prop.address_full,
      rw_sale_price: prop.rw_sale_price,
      rw_area_m2: prop.rw_area_m2,
      rw_bedrooms: prop.rw_bedrooms,
      rw_rooms: prop.rw_rooms,
      rw_energy_label: prop.rw_energy_label,
      similarity_score: prop.similarity_score,
      final_score: prop.final_score,
    })));
    
    return {
      status: 'success',
      message: 'Workflow completed successfully',
      step1_result: step1Result,
      step2_result: step2Result,
      step3_result: step3Result,
      step4_result: step4Result,
      summary,
      artifacts: {
        top15_csv: top15Csv,
        pdf_buffer: pdfBuffer ? pdfBuffer.toString('base64') : undefined,
        excel_buffer: excelBuffer ? excelBuffer.toString('base64') : undefined,
        html_report: htmlReport || undefined,
      },
    };
  } catch (error) {
    console.error('Error in workflow:', error);
    return {
      status: 'error',
      message: `Workflow failed: ${error instanceof Error ? error.message : String(error)}`,
      step1_result: undefined,
      step2_result: undefined,
      step3_result: undefined,
      step4_result: undefined,
    };
  }
}

