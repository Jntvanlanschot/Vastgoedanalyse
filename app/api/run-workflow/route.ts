import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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

interface WorkflowRequest {
  csvData: string;
  referenceData: {
    address_full: string;
    area_m2: number;
    energy_label: string;
    bedrooms: number;
    bathrooms: number;
    rooms: number;
    has_terrace: boolean;
    has_balcony: boolean;
    has_garden: boolean;
    sun_orientation: string;
  };
}

interface WorkflowResult {
  status: 'success' | 'error';
  message: string;
  summary?: {
    total_funda_records: number;
    realworks_records: number;
    matched_records: number;
    top_15_matches: number;
    pdf_file?: string;
    excel_file?: string;
  };
  artifacts?: {
    pdf?: string;
    excel?: string;
    csv?: string;
  };
  step1_result?: any;
  step2_result?: any;
  step3_result?: any;
  step4_result?: any;
}

export async function POST(request: NextRequest) {
  try {
    const body: WorkflowRequest = await request.json();
    const { csvData, referenceData } = body;

    if (!csvData || !referenceData) {
      return NextResponse.json(
        { error: 'CSV data and reference data are required' },
        { status: 400 }
      );
    }

    // Create temporary directory for this workflow run
    const tempDir = join(tmpdir(), `workflow-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Save CSV data to temporary file
    const csvFilePath = join(tempDir, 'funda_data.csv');
    writeFileSync(csvFilePath, csvData, 'utf-8');

    // Process reference data to extract street name and neighbourhood
    const processedReferenceData = {
      ...referenceData,
      street_name: extractStreetName(referenceData.address_full),
      neighbourhood: referenceData.neighbourhood || 'unknown'
    };

    // Save processed reference data to JSON file
    const referenceFilePath = join(tempDir, 'reference_data.json');
    writeFileSync(referenceFilePath, JSON.stringify(processedReferenceData, null, 2), 'utf-8');

    // Create empty uploaded files directory (workflow expects this)
    const uploadedFilesDir = join(tempDir, 'uploaded_files');
    mkdirSync(uploadedFilesDir, { recursive: true });

    console.log('Starting Python workflow...');
    console.log('Temp directory:', tempDir);
    console.log('CSV file:', csvFilePath);
    console.log('Reference file:', referenceFilePath);

    // Run the Python workflow
    const workflowResult = await runPythonWorkflow(tempDir, referenceFilePath, csvData);

    // Clean up temporary files
    try {
      const { rmSync } = require('fs');
      rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn('Failed to clean up temp directory:', cleanupError);
    }

    return NextResponse.json(workflowResult);

  } catch (error) {
    console.error('Error running workflow:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

async function runPythonWorkflow(
  tempDir: string, 
  referenceFilePath: string, 
  csvData: string
): Promise<WorkflowResult> {
  return new Promise((resolve) => {
    const workflowPath = join(process.cwd(), 'apps', 'workflow-py', 'workflow');
    const pythonScript = join(workflowPath, 'api_workflow.py');

    console.log('Running Python script:', pythonScript);
    console.log('Working directory:', workflowPath);

        // Write CSV data to temporary file
        const csvFilePath = join(tempDir, 'funda_data.csv');
        writeFileSync(csvFilePath, csvData, 'utf-8');
        
        // Spawn Python process
        const pythonProcess = spawn('python3', [
          pythonScript,
          referenceFilePath,
          csvFilePath
        ], {
          cwd: workflowPath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('Python stdout:', output.trim());
    });

    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error('Python stderr:', output.trim());
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      
      if (code === 0) {
        try {
          // Try to parse the JSON output from stdout
          // The JSON might be mixed with other output, so find the JSON part
          let resultJson = '';
          
          // Find the JSON object in the output
          const jsonStart = stdout.indexOf('{');
          const jsonEnd = stdout.lastIndexOf('}') + 1;
          
          if (jsonStart !== -1 && jsonEnd > jsonStart) {
            resultJson = stdout.substring(jsonStart, jsonEnd);
          }
          
          console.log('Extracted JSON:', resultJson.substring(0, 100) + '...');
          
          const result = JSON.parse(resultJson || '{}');
          
          // Check if workflow was successful
          if (result.status === 'success') {
            // Look for generated artifacts
            const artifacts: any = {};
            
            // Check for PDF file
            const pdfFile = join(workflowPath, 'outputs', 'top15_perfect_report_final.pdf');
            if (existsSync(pdfFile)) {
              artifacts.pdf = pdfFile;
            }
            
            // Check for Excel file
            const excelFile = join(workflowPath, 'outputs', 'top15_perfecte_woningen_tabel_final.xlsx');
            if (existsSync(excelFile)) {
              artifacts.excel = excelFile;
            }
            
            // Check for CSV files
            const csvFile = join(workflowPath, 'outputs', 'top15_perfect_matches_final.csv');
            if (existsSync(csvFile)) {
              artifacts.csv = csvFile;
            }

            resolve({
              status: 'success',
              message: 'Workflow completed successfully',
              summary: result.summary,
              artifacts,
              step1_result: result.step1_result,
              step2_result: result.step2_result,
              step3_result: result.step3_result,
              step4_result: result.step4_result
            });
          } else {
            resolve({
              status: 'error',
              message: result.message || 'Workflow failed',
              step1_result: result.step1_result,
              step2_result: result.step2_result,
              step3_result: result.step3_result,
              step4_result: result.step4_result
            });
          }
        } catch (parseError) {
          console.error('Failed to parse workflow result:', parseError);
          resolve({
            status: 'error',
            message: 'Failed to parse workflow result',
            step1_result: null,
            step2_result: null,
            step3_result: null,
            step4_result: null
          });
        }
      } else {
        resolve({
          status: 'error',
          message: `Python workflow failed with exit code ${code}. Stderr: ${stderr}`,
          step1_result: null,
          step2_result: null,
          step3_result: null,
          step4_result: null
        });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to start Python process:', error);
      resolve({
        status: 'error',
        message: `Failed to start Python process: ${error.message}`,
        step1_result: null,
        step2_result: null,
        step3_result: null,
        step4_result: null
      });
    });
  });
}
