import { NextRequest, NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';

export const maxDuration = 300;

// Handle upload requests from @vercel/blob/client
// This route ONLY generates upload tokens - files are uploaded directly from browser to Vercel Blob
export async function POST(request: NextRequest) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      console.error('BLOB_READ_WRITE_TOKEN not found');
      return NextResponse.json(
        { error: 'BLOB_READ_WRITE_TOKEN not configured' },
        { status: 500 }
      );
    }

    // Read body once - handleUpload will parse it
    const body = await request.json();
    
    // Use handleUpload from @vercel/blob/client - this handles token generation automatically
    const jsonResponse = await handleUpload({
      request: request as unknown as Request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        console.log('Generating token for:', pathname, 'multipart:', multipart);
        return {
          maximumSizeInBytes: 200 * 1024 * 1024, // 200MB max
          addRandomSuffix: true, // Add random suffix to avoid overwriting existing files
          tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
          allowedContentTypes: [
            'application/x-mimearchive',
            'message/rfc822',
            'multipart/related',
            'multipart/mixed',
            'application/octet-stream',
            'text/html',
            'application/zip',
          ],
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('Upload completed:', blob.url);
        // Optionally persist blob metadata here if needed
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    console.error('Upload handler error:', error);
    const errorMsg = error?.message || String(error);
    return NextResponse.json(
      {
        error: 'Failed to handle upload request',
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}
