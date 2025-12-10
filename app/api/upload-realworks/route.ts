import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdtemp } from 'fs/promises';
import { rmSync, existsSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { NextResponse } from 'next/server';

// Increase max duration for long-running Python workflows (5 minutes)
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

interface WorkflowResult {
  status: 'success' | 'error';
  message: string;
  step1_result?: any;
  step2_result?: any;
  step3_result?: any;
  step4_result?: any;
  summary?: any;
  artifacts?: any;
}

async function runHouseAnalysisWithRealworks(
  tempDir: string, 
  referenceFilePath: string, 
  csvFilePath: string,
  realworksFiles: string[]
): Promise<WorkflowResult> {
  return new Promise((resolve) => {
    const workflowPath = join(process.cwd(), 'apps', 'workflow-py', 'workflow');
    // Use relative path since we set cwd to workflowPath
    const pythonScript = 'api_workflow.py';

    console.log('Running Algorithm 2 (house analysis) with Realworks files:', pythonScript);
    console.log('Working directory:', workflowPath);
    console.log('Realworks files:', realworksFiles);

    // Spawn Python process with all file paths
    // Use 'python' on Windows locally, 'python3' on Unix/Vercel
    // On Vercel, always use python3
    const pythonCmd = process.env.VERCEL ? 'python3' : (process.platform === 'win32' ? 'python' : 'python3');
    
    // Build command arguments - use absolute paths for file arguments
    const args = [
      pythonScript,
      referenceFilePath,
      csvFilePath,
      ...realworksFiles
    ];
    
    console.log('Python command:', pythonCmd);
    console.log('Python script:', pythonScript);
    console.log('Arguments:', args.slice(1).join(', '));
    
    const pythonProcess = spawn(pythonCmd, args, {
      cwd: workflowPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsVerbatimArguments: false // Let Node.js handle path escaping
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('Python stderr:', data.toString().trim());
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      console.log('Python stdout length:', stdout.length);
      console.log('Python stderr length:', stderr.length);
      
      // If Python process failed, don't use old cached results
      if (code !== 0) {
        console.error('Python workflow failed with exit code:', code);
        console.error('Python stderr:', stderr);
        resolve({
          status: 'error',
          message: `Python workflow failed with exit code ${code}. Error: ${stderr.substring(0, 500)}`,
          step1_result: null,
          step2_result: null,
          step3_result: null,
          step4_result: null
        });
        return;
      }
      
      // Try to parse JSON only if process succeeded
      try {
        // Try to parse the JSON output from stderr (logger.info goes to stderr)
        let resultJson = '';
        
        // First try stderr (where Python logging goes)
        const jsonMatches = stderr.match(/\{[^{}]*"status"[^{}]*\}/s);
        if (jsonMatches && jsonMatches.length > 0) {
          resultJson = jsonMatches[jsonMatches.length - 1];
        }
        
        // Fallback: try stdout
        if (!resultJson) {
          const jsonMatchesStdout = stdout.match(/\{[^{}]*"status"[^{}]*\}/s);
          if (jsonMatchesStdout && jsonMatchesStdout.length > 0) {
            resultJson = jsonMatchesStdout[jsonMatchesStdout.length - 1];
          }
        }
        
        // Last resort: look for last complete JSON object
        if (!resultJson) {
          const jsonStart = stderr.lastIndexOf('{');
          const jsonEnd = stderr.lastIndexOf('}') + 1;
          if (jsonStart !== -1 && jsonEnd > jsonStart) {
            resultJson = stderr.substring(jsonStart, jsonEnd);
          }
        }
        
        console.log('Extracted JSON length:', resultJson.length);
        
        // Try to read from saved file first (most reliable) - but only if process succeeded
        let result: any = {};
        const resultFile = join(process.cwd(), 'apps', 'workflow-py', 'workflow', 'outputs', 'api_workflow_result.json');
        try {
          // First try to read from file (Python script writes it there)
          // But only if the file is recent (within last 30 seconds) to avoid using stale data
          if (existsSync(resultFile)) {
            const fileStats = statSync(resultFile);
            const fileAge = Date.now() - fileStats.mtimeMs;
            const maxAge = 30000; // 30 seconds
            
            if (fileAge > maxAge) {
              console.warn(`Result file is too old (${fileAge}ms old), ignoring it`);
              throw new Error('Result file is too old, workflow may have failed');
            }
            
            const fileContent = readFileSync(resultFile, 'utf-8');
            result = JSON.parse(fileContent);
            console.log('Read result from file:', resultFile, `(age: ${fileAge}ms)`);
          } else if (resultJson) {
            // Fallback: parse from output
            result = JSON.parse(resultJson);
            console.log('Parsed result from Python output');
          } else {
            throw new Error('No JSON output found from Python workflow and no result file created');
          }
        } catch (fileError) {
          console.error('Failed to parse result:', fileError);
          console.error('Stdout:', stdout.substring(0, 500));
          console.error('Stderr:', stderr.substring(0, 500));
          resolve({
            status: 'error',
            message: `Failed to parse workflow result: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`,
            step1_result: null,
            step2_result: null,
            step3_result: null,
            step4_result: null
          });
          return;
        }
        
        console.log('Parsed result status:', result.status);
        
        // Check if workflow was successful - if status is error, fail immediately
        if (result.status === 'error') {
          console.error('Python workflow returned error status:', result.message);
          resolve({
            status: 'error',
            message: result.message || 'Python workflow failed',
            step1_result: result.step1_result || null,
            step2_result: result.step2_result || null,
            step3_result: result.step3_result || null,
            step4_result: result.step4_result || null
          });
          return;
        }
        
        // Check if workflow was successful
        if (result.status === 'success') {
          // Check if PDF/Excel files were actually generated
          if (!result.summary?.pdf_file || !result.summary?.excel_file) {
            console.error('Workflow returned success but PDF/Excel files are missing');
            resolve({
              status: 'error',
              message: 'Workflow completed but reports were not generated. This may indicate a previous error.',
              step1_result: result.step1_result || null,
              step2_result: result.step2_result || null,
              step3_result: result.step3_result || null,
              step4_result: result.step4_result || null
            });
            return;
          }
          
          // Look for generated artifacts
          const artifacts: any = {};
          
          if (result.summary?.pdf_file) {
            artifacts.pdf = result.summary.pdf_file;
          }
          if (result.summary?.excel_file) {
            artifacts.excel = result.summary.excel_file;
          }
          if (result.step4_result?.top15_file) {
            artifacts.csv = result.step4_result.top15_file;
          }

          console.log('Returning success with summary:', result.summary);
          resolve({
            status: 'success',
            message: 'Workflow completed successfully',
            step1_result: result.step1_result,
            step2_result: result.step2_result,
            step3_result: result.step3_result,
            step4_result: result.step4_result,
            summary: result.summary,
            artifacts
          });
        } else {
          console.log('Workflow returned error status:', result.message);
          resolve({
            status: 'error',
            message: result.message || 'Workflow failed',
            step1_result: result.step1_result,
            step2_result: result.step2_result,
            step3_result: result.step3_result,
            step4_result: result.step4_result
          });
        }
      } catch (e) {
        console.error('Failed to parse Python workflow output:', e);
        console.error('Stdout:', stdout);
        resolve({ 
          status: 'error', 
          message: `Failed to parse workflow result: ${e instanceof Error ? e.message : 'Unknown error'}`, 
          step1_result: null, 
          step2_result: null, 
          step3_result: null, 
          step4_result: null 
        });
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python subprocess:', err);
      resolve({ 
        status: 'error', 
        message: `Failed to start Python subprocess: ${err.message}`, 
        step1_result: null, 
        step2_result: null, 
        step3_result: null, 
        step4_result: null 
      });
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    console.log('Starting Realworks file upload and workflow...');

    const contentType = request.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    // Branch: JSON (blob URLs) or multipart form-data (fallback)
    if (isJson) {
      const body = await request.json();
      const { referenceData, csvData, blobs } = body || {};

      if (!referenceData) {
        return NextResponse.json(
          { error: 'Reference data is required' },
          { status: 400 }
        );
      }
      if (!blobs || !Array.isArray(blobs) || blobs.length === 0) {
        return NextResponse.json(
          { error: 'At least 1 Realworks file (blob) is required' },
          { status: 400 }
        );
      }

      return await handleWithBlobs(referenceData, csvData, blobs);
    }

    // Fallback: multipart form-data (legacy path)
    const formData = await request.formData();
    console.log('FormData received, checking for required fields...');

    // Get reference data
    const referenceDataStr = formData.get('referenceData') as string;
    if (!referenceDataStr) {
      return NextResponse.json(
        { error: 'Reference data is required' },
        { status: 400 }
      );
    }

    const referenceData = JSON.parse(referenceDataStr);

    // Get uploaded files
    const realworksFiles: File[] = [];
    for (let i = 1; i <= 10; i++) {
      const file = formData.get(`realworks_file_${i}`) as File;
      if (file) {
        realworksFiles.push(file);
      }
    }

    if (realworksFiles.length < 1) {
      return NextResponse.json(
        { error: 'At least 1 Realworks file is required' },
        { status: 400 }
      );
    }

    const csvData = (formData.get('csvData') as string) || '';
    return await handleWithFiles(referenceData, csvData, realworksFiles);
  } catch (error) {
    console.error('Error in upload-realworks API:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Internal server error',
        step1_result: null,
        step2_result: null,
        step3_result: null,
        step4_result: null,
      },
      { status: 500 }
    );
  }
}

async function handleWithBlobs(
  referenceData: any,
  csvData: string,
  blobs: BlobRef[]
) {
  // Create temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), 'realworks-workflow-'));
  console.log('Temp directory:', tempDir);

  try {
    // Process reference data to extract street name and neighbourhood
    const processedReferenceData = {
      ...referenceData,
      street_name: extractStreetName(referenceData.address_full),
      neighbourhood: referenceData.neighbourhood || 'unknown',
    };

    // Write processed reference data to file
    const referenceFilePath = join(tempDir, 'reference_data.json');
    await writeFile(
      referenceFilePath,
      JSON.stringify(processedReferenceData, null, 2),
      'utf8'
    );

    // Download blobs to temp files
    const realworksFilePaths: string[] = [];
    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      const ext = blob.name?.split('.').pop() || 'mhtml';
      const filePath = join(tempDir, `realworks_file_${i + 1}.${ext}`);
      console.log('Downloading blob to file:', filePath);

      const res = await fetch(blob.url);
      if (!res.ok) {
        throw new Error(`Failed to download blob ${blob.url}: ${res.status}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(filePath, buffer);
      realworksFilePaths.push(filePath);
    }

    // CSV handling
    const csvFilePath = await writeCsv(csvData, tempDir);

    // Clean old outputs
    cleanOldOutputs();

    // Run workflow
    const result = await runHouseAnalysisWithRealworks(
      tempDir,
      referenceFilePath,
      csvFilePath,
      realworksFilePaths
    );

    // Clean temp
    safeCleanup(tempDir);

    return NextResponse.json(result);
  } catch (error) {
    safeCleanup(tempDir);
    console.error('Error processing Realworks blobs:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to process Realworks files (blob mode)',
        step1_result: null,
        step2_result: null,
        step3_result: null,
        step4_result: null,
      },
      { status: 500 }
    );
  }
}

async function handleWithFiles(
  referenceData: any,
  csvData: string,
  realworksFiles: File[]
) {
  // Create temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), 'realworks-workflow-'));
  console.log('Temp directory:', tempDir);

  try {
    // Process reference data to extract street name and neighbourhood
    const processedReferenceData = {
      ...referenceData,
      street_name: extractStreetName(referenceData.address_full),
      neighbourhood: referenceData.neighbourhood || 'unknown',
    };

    // Write processed reference data to file
    const referenceFilePath = join(tempDir, 'reference_data.json');
    await writeFile(
      referenceFilePath,
      JSON.stringify(processedReferenceData, null, 2),
      'utf8'
    );

    // Write Realworks files
    const realworksFilePaths: string[] = [];
    for (let i = 0; i < realworksFiles.length; i++) {
      const file = realworksFiles[i];
      const filePath = join(
        tempDir,
        `realworks_file_${i + 1}.${file.name.split('.').pop()}`
      );
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);
      realworksFilePaths.push(filePath);
    }

    // CSV handling
    const csvFilePath = await writeCsv(csvData, tempDir);

    // Clean old outputs
    cleanOldOutputs();

    // Run Python workflow with Realworks files
    const result = await runHouseAnalysisWithRealworks(
      tempDir,
      referenceFilePath,
      csvFilePath,
      realworksFilePaths
    );

    // Clean up temporary files
    safeCleanup(tempDir);

    return NextResponse.json(result);
  } catch (error) {
    safeCleanup(tempDir);
    console.error('Error processing Realworks files:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to process Realworks files',
        step1_result: null,
        step2_result: null,
        step3_result: null,
        step4_result: null,
      },
      { status: 500 }
    );
  }
}

async function writeCsv(csvData: string, tempDir: string) {
  let csvFilePath: string | null = null;

  if (csvData && csvData.trim().length > 0 && csvData !== 'address_full,street_name\n') {
    console.log('CSV data provided, length:', csvData.length);
    csvFilePath = join(tempDir, 'funda_data.csv');
    await writeFile(csvFilePath, csvData, 'utf8');
    console.log('CSV file written successfully');
  } else {
    console.log(
      'No CSV data provided - user skipped Funda scraper. Creating minimal CSV for workflow compatibility.'
    );
    // Create minimal CSV with just headers for workflow compatibility
    csvFilePath = join(tempDir, 'funda_data.csv');
    await writeFile(csvFilePath, 'address_full,street_name\n', 'utf8');
    console.log('Created minimal CSV file for workflow compatibility');
  }

  return csvFilePath;
}

function cleanOldOutputs() {
  // Delete ALL old result files to prevent using stale data
  // Note: New files use "Taxatierapport [adres]" naming, but we also clean up old naming
  const outputsDir = join(
    process.cwd(),
    'apps',
    'workflow-py',
    'workflow',
    'outputs'
  );
  const filesToDelete = [
    'api_workflow_result.json',
    'top15_perfect_matches_final.csv',
    'top15_perfect_report_final.pdf',
    'top15_perfecte_woningen_tabel_final.xlsx',
  ];

  for (const file of filesToDelete) {
    const filePath = join(outputsDir, file);
    try {
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
        console.log(`Deleted old file: ${file}`);
      }
    } catch (error) {
      console.warn(`Could not delete ${file}:`, error);
    }
  }
}

function safeCleanup(tempDir: string) {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch (cleanupError) {
    console.error('Failed to clean up temp directory:', cleanupError);
  }
}

