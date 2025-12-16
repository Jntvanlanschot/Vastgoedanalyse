// CRITICAL: Apply fontkit patch BEFORE any other imports
// This ensures fontkit's fs.readFileSync is patched before pdfmake/fontkit are loaded
import { applyFontkitTriePatch } from '@/lib/fontkit-trie-patch';
applyFontkitTriePatch();

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { existsSync } from 'fs';
import { join } from 'path';

// Force Node.js runtime (required for Buffer, fs, and other Node.js APIs)
export const runtime = 'nodejs';

// Increase max duration for long-running Realworks workflow (5 minutes)
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
    console.log('[upload-realworks] Starting Realworks file upload and workflow...');
    console.log('[upload-realworks] Runtime environment:', {
      cwd: process.cwd(),
      routeDir: __dirname,
      // Check if trie files exist in expected locations
      chunkDataTrie: existsSync(join(__dirname, 'data.trie')),
      nodeModulesDataTrie: existsSync(join(process.cwd(), 'node_modules', '@foliojs-fork', 'fontkit', 'data.trie')),
    });

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
    console.error('[upload-realworks] Error in API:', error);
    if (error instanceof Error) {
      console.error('[upload-realworks] Error details:', {
        message: error.message,
        stack: error.stack,
        cwd: process.cwd(),
        routeDir: __dirname,
      });
    }
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Internal server error',
        error: error instanceof Error ? error.message : String(error),
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
      // PDF is optional - only warn if GENERATE_PDF was explicitly requested
      const generatePdfRequested = process.env.GENERATE_PDF === 'true';
      if (generatePdfRequested) {
        console.warn('[upload-realworks] ⚠ PDF generation was requested (GENERATE_PDF=true) but no PDF buffer found');
      } else {
        console.log('[upload-realworks] ℹ PDF generation skipped (GENERATE_PDF not set to true)');
      }
    }

    // Upload HTML report (always available)
    if (result.artifacts?.html_report) {
      try {
        console.log('Uploading HTML report to Vercel Blob...');
        const htmlBuffer = Buffer.from(result.artifacts.html_report, 'utf-8');
        console.log(`HTML report size: ${htmlBuffer.length} bytes`);
        const htmlFilename = `Rapport_${Date.now()}.html`;
        const htmlBlob = await put(htmlFilename, htmlBuffer, {
          access: 'public',
          contentType: 'text/html',
        });
        console.log(`HTML report uploaded successfully: ${htmlBlob.url}`);
        result.artifacts.html_report = htmlBlob.url;
        result.summary = result.summary || {};
        (result.summary as any).html_file = htmlBlob.url;
      } catch (htmlError) {
        console.error('Error uploading HTML report to blob:', htmlError);
        if (htmlError instanceof Error) {
          console.error('HTML upload error details:', htmlError.message, htmlError.stack);
        }
      }
    } else {
      console.warn('No HTML report found in artifacts. HTML generation may have failed.');
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

    // Ensure summary fields are always present (null instead of undefined)
    if (!result.summary) {
      result.summary = {};
    }
    if (result.summary.pdf_file === undefined) {
      (result.summary as any).pdf_file = null;
    }
    if (result.summary.html_file === undefined) {
      (result.summary as any).html_file = null;
    }
    if (result.summary.excel_file === undefined) {
      (result.summary as any).excel_file = null;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[upload-realworks] CRITICAL ERROR processing Realworks blobs:', error);
    if (error instanceof Error) {
      console.error('[upload-realworks] Error details:', {
        message: error.message,
        stack: error.stack,
        cwd: process.cwd(),
        routeDir: __dirname,
      });
      
      // Check if this is a fontkit/data.trie error
      if (error.message.includes('data.trie') || error.message.includes('ENOENT')) {
        console.error('[upload-realworks] FONTKIT TRIE ERROR DETECTED - fontkit-trie-patch may not have loaded correctly');
      }
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
      // PDF is optional - only warn if GENERATE_PDF was explicitly requested
      const generatePdfRequested = process.env.GENERATE_PDF === 'true';
      if (generatePdfRequested) {
        console.warn('[upload-realworks] ⚠ PDF generation was requested (GENERATE_PDF=true) but no PDF buffer found');
      } else {
        console.log('[upload-realworks] ℹ PDF generation skipped (GENERATE_PDF not set to true)');
      }
    }

    // Upload HTML report (always available)
    if (result.artifacts?.html_report) {
      try {
        console.log('Uploading HTML report to Vercel Blob...');
        const htmlBuffer = Buffer.from(result.artifacts.html_report, 'utf-8');
        console.log(`HTML report size: ${htmlBuffer.length} bytes`);
        const htmlFilename = `Rapport_${Date.now()}.html`;
        const htmlBlob = await put(htmlFilename, htmlBuffer, {
          access: 'public',
          contentType: 'text/html',
        });
        console.log(`HTML report uploaded successfully: ${htmlBlob.url}`);
        result.artifacts.html_report = htmlBlob.url;
        result.summary = result.summary || {};
        (result.summary as any).html_file = htmlBlob.url;
      } catch (htmlError) {
        console.error('Error uploading HTML report to blob:', htmlError);
        if (htmlError instanceof Error) {
          console.error('HTML upload error details:', htmlError.message, htmlError.stack);
        }
      }
    } else {
      console.warn('No HTML report found in artifacts. HTML generation may have failed.');
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

    // Ensure summary fields are always present (null instead of undefined)
    if (!result.summary) {
      result.summary = {};
    }
    if (result.summary.pdf_file === undefined) {
      (result.summary as any).pdf_file = null;
    }
    if (result.summary.html_file === undefined) {
      (result.summary as any).html_file = null;
    }
    if (result.summary.excel_file === undefined) {
      (result.summary as any).excel_file = null;
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

