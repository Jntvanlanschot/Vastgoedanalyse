import { NextRequest, NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';

export const maxDuration = 300;

// Handle upload from @vercel/blob/client (bypasses API body size limit)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Use handleUpload to process the upload request from client
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Allow all MHTML files
        return {
          allowedContentTypes: [
            'application/x-mimearchive',
            'message/rfc822',
            'application/octet-stream',
            'text/html',
          ],
          tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('Upload completed:', blob.url, tokenPayload);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Blob upload handler error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if it's a token/configuration error
    if (errorMessage.includes('token') || errorMessage.includes('BLOB_READ_WRITE_TOKEN')) {
      return NextResponse.json(
        {
          error: 'Blob Storage not configured. Please create Blob Storage in Vercel Dashboard and ensure BLOB_READ_WRITE_TOKEN is set.',
          details: errorMessage,
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Failed to handle blob upload',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

