import { NextRequest, NextResponse } from 'next/server';
import { generateSignedUrl } from '@vercel/blob';

export const maxDuration = 300;

// Generate signed URL for direct client upload (bypasses API body size limit)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, contentType } = body;

    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    // Generate signed URL for direct upload to Blob Storage
    const { url: signedUrl, pathname } = await generateSignedUrl(filename, {
      access: 'public',
      contentType: contentType || 'application/octet-stream',
      addRandomSuffix: true, // Prevent filename conflicts
    });

    // The signed URL is used for upload, the public URL is the signed URL without query params
    const publicUrl = signedUrl.split('?')[0];

    return NextResponse.json({
      uploadUrl: signedUrl, // URL to upload to (with auth query params)
      url: publicUrl, // Public URL after upload (without query params)
      pathname,
    });
  } catch (error) {
    console.error('Blob signed URL generation error:', error);
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
        error: 'Failed to generate signed URL for blob storage',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

