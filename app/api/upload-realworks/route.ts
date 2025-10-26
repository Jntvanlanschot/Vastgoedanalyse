import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdtemp } from 'fs/promises';
import { rmSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
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
    const pythonScript = join(workflowPath, 'api_workflow.py');

    console.log('Running Algorithm 2 (house analysis) with Realworks files:', pythonScript);
    console.log('Working directory:', workflowPath);
    console.log('Realworks files:', realworksFiles);

    // Spawn Python process with all file paths
    const pythonProcess = spawn('python3', [
      pythonScript,
      referenceFilePath,
      csvFilePath,
      ...realworksFiles
    ], {
      cwd: workflowPath,
      stdio: ['pipe', 'pipe', 'pipe']
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
      
      if (code === 0) {
        try {
          // Try to parse the JSON output from stdout
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
            
            if (result.summary?.pdf_file) {
              artifacts.pdf = result.summary.pdf_file;
            }
            if (result.summary?.excel_file) {
              artifacts.excel = result.summary.excel_file;
            }
            if (result.step3_result?.top15_file) {
              artifacts.csv = result.step3_result.top15_file;
            }

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
          console.error('Failed to parse Python workflow output:', stdout);
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
        console.error(`Python workflow failed with exit code ${code}. Stderr: ${stderr}`);
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
    
    const formData = await request.formData();
    
    // Get reference data
    const referenceDataStr = formData.get('referenceData') as string;
    if (!referenceDataStr) {
      return NextResponse.json({ error: 'Reference data is required' }, { status: 400 });
    }
    
    const referenceData = JSON.parse(referenceDataStr);
    
    // Get uploaded files
    const realworksFiles: File[] = [];
    for (let i = 1; i <= 5; i++) {
      const file = formData.get(`realworks_file_${i}`) as File;
      if (file) {
        realworksFiles.push(file);
      }
    }
    
    if (realworksFiles.length !== 5) {
      return NextResponse.json({ error: 'Exactly 5 Realworks files are required' }, { status: 400 });
    }
    
    // Create temporary directory
    const tempDir = await mkdtemp(join(tmpdir(), 'realworks-workflow-'));
    console.log('Temp directory:', tempDir);
    
    try {
      // Process reference data to extract street name and neighbourhood
      const processedReferenceData = {
        ...referenceData,
        street_name: extractStreetName(referenceData.address_full),
        neighbourhood: referenceData.neighbourhood || 'unknown'
      };

      // Write processed reference data to file
      const referenceFilePath = join(tempDir, 'reference_data.json');
      await writeFile(referenceFilePath, JSON.stringify(processedReferenceData, null, 2), 'utf8');
      
      // Write Realworks files
      const realworksFilePaths: string[] = [];
      for (let i = 0; i < realworksFiles.length; i++) {
        const file = realworksFiles[i];
        const filePath = join(tempDir, `realworks_file_${i + 1}.${file.name.split('.').pop()}`);
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(filePath, buffer);
        realworksFilePaths.push(filePath);
      }
      
    // Get CSV data from the form data
    const csvData = formData.get('csvData') as string;
    if (!csvData) {
      return NextResponse.json({ error: 'CSV data is required' }, { status: 400 });
    }
    
    // Write CSV data to file
    const csvFilePath = join(tempDir, 'funda_data.csv');
    await writeFile(csvFilePath, csvData, 'utf8');
      
    console.log('Reference file:', referenceFilePath);
    console.log('CSV file:', csvFilePath);
    console.log('Realworks files:', realworksFilePaths);
      
      // Run Python workflow with Realworks files
      const result = await runHouseAnalysisWithRealworks(
        tempDir,
        referenceFilePath,
        csvFilePath,
        realworksFilePaths
      );
      
      // Clean up temporary files
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Failed to clean up temp directory:', cleanupError);
      }
      
      return NextResponse.json(result);
      
    } catch (error) {
      // Clean up temporary files on error
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Failed to clean up temp directory after error:', cleanupError);
      }
      
      console.error('Error processing Realworks files:', error);
      return NextResponse.json({ 
        status: 'error', 
        message: 'Failed to process Realworks files',
        step1_result: null,
        step2_result: null,
        step3_result: null,
        step4_result: null
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Error in upload-realworks API:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: 'Internal server error',
      step1_result: null,
      step2_result: null,
      step3_result: null,
      step4_result: null
    }, { status: 500 });
  }
}

