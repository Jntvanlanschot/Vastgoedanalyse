import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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

    // Create temporary directory
    const tempDir = mkdtempSync(join(tmpdir(), 'street-analysis-'));
    
    // Write CSV data to file
    const csvFilePath = join(tempDir, 'funda_data.csv');
    writeFileSync(csvFilePath, csvData, 'utf8');

    // Write reference data to file
    const referenceFilePath = join(tempDir, 'reference_data.json');
    writeFileSync(referenceFilePath, JSON.stringify(referenceData, null, 2), 'utf8');

    console.log('Starting street analysis (Algorithm 1 only)...');
    console.log('Temp directory:', tempDir);
    console.log('CSV file:', csvFilePath);
    console.log('Reference file:', referenceFilePath);

    // Run Python script for street analysis only
    const pythonScript = join(process.cwd(), 'apps/workflow-py/workflow/api_workflow_streets_only.py');
    
    const pythonProcess = spawn('python3', [pythonScript, referenceFilePath, csvFilePath], {
      cwd: join(process.cwd(), 'apps/workflow-py/workflow'),
      stdio: ['pipe', 'pipe', 'pipe']
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

    return new Promise((resolve) => {
      pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
        
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
            resolve(NextResponse.json({
              status: 'error',
              message: 'No valid result from Python script',
              stdout: stdout,
              stderr: stderr
            }, { status: 500 }));
          }
        } catch (parseError) {
          console.error('Error parsing Python output:', parseError);
          resolve(NextResponse.json({
            status: 'error',
            message: 'Failed to parse Python script output',
            stdout: stdout,
            stderr: stderr,
            error: parseError instanceof Error ? parseError.message : String(parseError)
          }, { status: 500 }));
        }
      });
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
