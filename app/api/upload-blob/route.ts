import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const maxDuration = 300;

// Accept file upload and store in Vercel Blob (for large files, client uploads directly)
export async function POST(request: NextRequest) {
  try {
    // Check if token is available
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      console.error('BLOB_READ_WRITE_TOKEN not found in environment variables');
      return NextResponse.json(
        {
          error: 'BLOB_READ_WRITE_TOKEN not configured. Please set it in Vercel environment variables.',
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;

    if (!file || !filename) {
      return NextResponse.json(
        { error: 'File and filename are required' },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob Storage
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: true, // Prevent filename conflicts
    });

    return NextResponse.json({
      url: blob.url,
      name: filename,
      size: file.size,
      type: file.type || 'application/octet-stream',
    });
  } catch (error) {
    console.error('Blob upload error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if it's a token/configuration error
    if (errorMessage.includes('token') || errorMessage.includes('BLOB_READ_WRITE_TOKEN') || errorMessage.includes('Access denied')) {
      return NextResponse.json(
        {
          error: 'Blob Storage access denied. Please check BLOB_READ_WRITE_TOKEN in Vercel environment variables.',
          details: errorMessage,
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Failed to upload file to blob storage',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

