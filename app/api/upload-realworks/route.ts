import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

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

    // Upload PDF and Excel to Vercel Blob if generated
    console.log('Checking for PDF buffer in artifacts...');
    console.log('Artifacts keys:', Object.keys(result.artifacts || {}));
    console.log('Has pdf_buffer?', !!result.artifacts?.pdf_buffer);
    
    if (result.artifacts?.pdf_buffer) {
      try {
        console.log('Uploading PDF to Vercel Blob...');
        const pdfBuffer = Buffer.from(result.artifacts.pdf_buffer, 'base64');
        console.log(`PDF buffer size: ${pdfBuffer.length} bytes`);
        
        if (pdfBuffer.length === 0) {
          throw new Error('PDF buffer is empty!');
        }
        
        const pdfFilename = `Taxatierapport_${Date.now()}.pdf`;
        console.log(`Uploading PDF with filename: ${pdfFilename}`);
        
        const pdfBlob = await put(pdfFilename, pdfBuffer, {
          access: 'public',
          contentType: 'application/pdf',
        });
        
        console.log(`PDF uploaded successfully: ${pdfBlob.url}`);
        result.artifacts.pdf_report = pdfBlob.url;
        result.summary = result.summary || {};
        (result.summary as any).pdf_file = pdfBlob.url;
        console.log('PDF URL set in result:', pdfBlob.url);
      } catch (pdfError) {
        console.error('CRITICAL ERROR uploading PDF to blob:', pdfError);
        if (pdfError instanceof Error) {
          console.error('PDF upload error details:', pdfError.message, pdfError.stack);
        }
        // Don't fail the whole request, but log clearly
        result.artifacts.pdf_upload_error = pdfError instanceof Error ? pdfError.message : String(pdfError);
      }
    } else {
      console.error('ERROR: No PDF buffer found in artifacts!');
      console.error('Result artifacts:', JSON.stringify(result.artifacts, null, 2));
      console.error('Full result:', JSON.stringify(result, null, 2));
    }

    if (result.artifacts?.excel_buffer) {
      try {
        console.log('Uploading Excel to Vercel Blob...');
        const excelBuffer = Buffer.from(result.artifacts.excel_buffer, 'base64');
        console.log(`Excel buffer size: ${excelBuffer.length} bytes`);
        const excelFilename = `Top15_Woningen_${Date.now()}.xlsx`;
        const excelBlob = await put(excelFilename, excelBuffer, {
          access: 'public',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        console.log(`Excel uploaded successfully: ${excelBlob.url}`);
        result.artifacts.excel_report = excelBlob.url;
        result.summary = result.summary || {};
        (result.summary as any).excel_file = excelBlob.url;
      } catch (excelError) {
        console.error('Error uploading Excel to blob:', excelError);
        if (excelError instanceof Error) {
          console.error('Excel upload error details:', excelError.message, excelError.stack);
        }
      }
    } else {
      console.warn('No Excel buffer found in artifacts. Excel generation may have failed.');
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('CRITICAL ERROR processing Realworks blobs:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return NextResponse.json(
      {
        status: 'error',
        error: `Failed to process Realworks files: ${error instanceof Error ? error.message : String(error)}`,
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

    // Upload PDF and Excel to Vercel Blob if generated
    console.log('Checking for PDF buffer in artifacts...');
    console.log('Artifacts keys:', Object.keys(result.artifacts || {}));
    console.log('Has pdf_buffer?', !!result.artifacts?.pdf_buffer);
    
    if (result.artifacts?.pdf_buffer) {
      try {
        console.log('Uploading PDF to Vercel Blob...');
        const pdfBuffer = Buffer.from(result.artifacts.pdf_buffer, 'base64');
        console.log(`PDF buffer size: ${pdfBuffer.length} bytes`);
        
        if (pdfBuffer.length === 0) {
          throw new Error('PDF buffer is empty!');
        }
        
        const pdfFilename = `Taxatierapport_${Date.now()}.pdf`;
        console.log(`Uploading PDF with filename: ${pdfFilename}`);
        
        const pdfBlob = await put(pdfFilename, pdfBuffer, {
          access: 'public',
          contentType: 'application/pdf',
        });
        
        console.log(`PDF uploaded successfully: ${pdfBlob.url}`);
        result.artifacts.pdf_report = pdfBlob.url;
        result.summary = result.summary || {};
        (result.summary as any).pdf_file = pdfBlob.url;
        console.log('PDF URL set in result:', pdfBlob.url);
      } catch (pdfError) {
        console.error('CRITICAL ERROR uploading PDF to blob:', pdfError);
        if (pdfError instanceof Error) {
          console.error('PDF upload error details:', pdfError.message, pdfError.stack);
        }
        // Don't fail the whole request, but log clearly
        result.artifacts.pdf_upload_error = pdfError instanceof Error ? pdfError.message : String(pdfError);
      }
    } else {
      console.error('ERROR: No PDF buffer found in artifacts!');
      console.error('Result artifacts:', JSON.stringify(result.artifacts, null, 2));
      console.error('Full result:', JSON.stringify(result, null, 2));
    }

    if (result.artifacts?.excel_buffer) {
      try {
        console.log('Uploading Excel to Vercel Blob...');
        const excelBuffer = Buffer.from(result.artifacts.excel_buffer, 'base64');
        console.log(`Excel buffer size: ${excelBuffer.length} bytes`);
        const excelFilename = `Top15_Woningen_${Date.now()}.xlsx`;
        const excelBlob = await put(excelFilename, excelBuffer, {
          access: 'public',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        console.log(`Excel uploaded successfully: ${excelBlob.url}`);
        result.artifacts.excel_report = excelBlob.url;
        result.summary = result.summary || {};
        (result.summary as any).excel_file = excelBlob.url;
      } catch (excelError) {
        console.error('Error uploading Excel to blob:', excelError);
        if (excelError instanceof Error) {
          console.error('Excel upload error details:', excelError.message, excelError.stack);
        }
      }
    } else {
      console.warn('No Excel buffer found in artifacts. Excel generation may have failed.');
    }

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

