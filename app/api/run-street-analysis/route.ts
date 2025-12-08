import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFileSync, mkdtempSync, copyFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { homedir } from 'os';

// Increase max duration for long-running Python workflows (10 minutes)
// Street analysis can take 5-10 minutes due to Overpass API calls and similarity calculations
export const maxDuration = 600;

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

    // Copy CSV to downloads folder
    const downloadsDir = join(homedir(), 'Downloads');
    const csvDownloadPath = join(downloadsDir, `funda_scraper_${Date.now()}.csv`);
    try {
      copyFileSync(csvFilePath, csvDownloadPath);
      console.log('Funda CSV copied to:', csvDownloadPath);
    } catch (err) {
      console.warn('Could not copy CSV to Downloads:', err);
    }

    console.log('Starting street analysis (Algorithm 1 only)...');
    console.log('Temp directory:', tempDir);
    console.log('CSV file:', csvFilePath);
    console.log('Reference file:', referenceFilePath);

    // Run Python script for street analysis only
    // On Vercel, try 'python' first (Vercel may not have 'python3' in PATH)
    // On localhost, use platform-specific command
    let pythonCmd: string;
    if (process.env.VERCEL) {
      // On Vercel, try 'python' first (Vercel serverless functions use 'python')
      pythonCmd = 'python';
    } else {
      // On localhost, use platform-specific command
      pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    }
    
    const pythonScript = join(process.cwd(), 'apps/workflow-py/workflow/api_workflow_streets_only.py');
    
    console.log('Python command:', pythonCmd);
    console.log('Python script:', pythonScript);
    console.log('Working directory:', join(process.cwd(), 'apps/workflow-py/workflow'));
    console.log('Environment:', process.env.VERCEL ? 'Vercel' : 'Local');
    
    const pythonProcess = spawn(pythonCmd, [pythonScript, referenceFilePath, csvFilePath], {
      cwd: join(process.cwd(), 'apps/workflow-py/workflow'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1' // Ensure Python output is not buffered
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
              stdout: stdout.substring(0, 1000), // Limit output size
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
            stdout: stdout.substring(0, 1000), // Limit output size
            stderr: stderr.substring(0, 1000),
            error: parseError instanceof Error ? parseError.message : String(parseError)
          }, { status: 500 }));
        }
      });
      
      pythonProcess.on('error', (error) => {
        clearTimeout(processTimeout);
        console.error('Python process error:', error);
        resolve(NextResponse.json({
          status: 'error',
          message: 'Failed to start Python process',
          error: error.message
        }, { status: 500 }));
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
