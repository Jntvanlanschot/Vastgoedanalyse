import { NextRequest, NextResponse } from 'next/server';

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

// WorkflowResult interface moved to lib/workflow/runWorkflow.ts

// Python workflow removed - now using JS workflow in lib/workflow/runWorkflow.ts

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
  try {
    // Import JS workflow
    const { runWorkflow } = await import('@/lib/workflow/runWorkflow');
    
    // Process reference data to extract street name
    const processedReferenceData = {
      ...referenceData,
      street_name: extractStreetName(referenceData.address_full),
      neighbourhood: referenceData.neighbourhood || 'unknown',
    };

    // Download blobs to buffers
    const realworksFiles: Array<{ buffer: Buffer; filename: string }> = [];
    for (const blob of blobs) {
      console.log('Downloading blob:', blob.url);
      
      const res = await fetch(blob.url);
      if (!res.ok) {
        throw new Error(`Failed to download blob ${blob.url}: ${res.status}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      realworksFiles.push({
        buffer,
        filename: blob.name || 'unknown.mhtml',
      });
    }

    // Get street similarity cache from sessionStorage if available
    // For now, we'll pass undefined - street analysis is done separately
    const streetSimilarityCache = undefined;

    // Run JS workflow
    const result = await runWorkflow(
      processedReferenceData,
      csvData || null,
      realworksFiles,
      streetSimilarityCache
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing Realworks blobs:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: `Failed to process Realworks files: ${error instanceof Error ? error.message : String(error)}`,
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
  try {
    // Import JS workflow
    const { runWorkflow } = await import('@/lib/workflow/runWorkflow');
    
    // Process reference data to extract street name
    const processedReferenceData = {
      ...referenceData,
      street_name: extractStreetName(referenceData.address_full),
      neighbourhood: referenceData.neighbourhood || 'unknown',
    };

    // Convert File objects to buffers
    const realworksFileBuffers: Array<{ buffer: Buffer; filename: string }> = [];
    for (const file of realworksFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      realworksFileBuffers.push({
        buffer,
        filename: file.name,
      });
    }

    // Get street similarity cache from sessionStorage if available
    // For now, we'll pass undefined - street analysis is done separately
    const streetSimilarityCache = undefined;

    // Run JS workflow
    const result = await runWorkflow(
      processedReferenceData,
      csvData || null,
      realworksFileBuffers,
      streetSimilarityCache
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing Realworks files:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: `Failed to process Realworks files: ${error instanceof Error ? error.message : String(error)}`,
        step1_result: null,
        step2_result: null,
        step3_result: null,
        step4_result: null,
      },
      { status: 500 }
    );
  }
}

// Helper functions removed - no longer needed with JS workflow

