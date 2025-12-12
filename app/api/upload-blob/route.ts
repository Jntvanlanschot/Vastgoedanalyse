import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';

export const maxDuration = 300;

// Handle upload requests from @vercel/blob/client
// This endpoint supports both handleUpload (for client-side uploads) and direct uploads
export async function POST(request: NextRequest) {
  try {
    // Check if token is available
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      console.error('CRITICAL: BLOB_READ_WRITE_TOKEN not found in environment variables');
      console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('BLOB')));
      return NextResponse.json(
        {
          error: 'BLOB_READ_WRITE_TOKEN not configured. Please set it in Vercel environment variables.',
          details: 'The BLOB_READ_WRITE_TOKEN environment variable is required for file uploads. Please configure it in your Vercel project settings under Environment Variables.',
        },
        { status: 500 }
      );
    }

    // Check content type to determine request type
    const contentType = request.headers.get('content-type') || '';
    
    // Try to use handleUpload if this is a request from @vercel/blob/client
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        
        // Use handleUpload for client-side uploads (bypasses 6MB limit)
        const jsonResponse = await handleUpload({
          body,
          request,
          token,
          onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
            // Allow MHTML and related multipart types coming from Realworks exports
            return {
              allowedContentTypes: [
                'application/x-mimearchive', // .mhtml
                'message/rfc822', // .mht
                'multipart/related', // some exporters send this for mhtml
                'multipart/mixed',
                'application/octet-stream', // Generic binary
                'text/html', // HTML files
                'application/zip', // If user zips files
              ],
              addRandomSuffix: true, // Prevent filename conflicts
              tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            console.log('Upload completed:', blob.url, tokenPayload);
          },
        });

        return NextResponse.json(jsonResponse);
      } catch (handleUploadError) {
        // If handleUpload fails, fall back to direct upload
        console.warn('handleUpload failed, falling back to direct upload:', handleUploadError);
        // Continue to FormData handling below
      }
    }

    // Direct file upload via FormData (fallback for small files or if handleUpload not available)
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;

    if (!file || !filename) {
      return NextResponse.json(
        { error: 'File and filename are required' },
        { status: 400 }
      );
    }

    // Check file size - reject if > 6MB (Vercel's hard limit)
    if (file.size > 6 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: `File too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Maximum size is 6MB for direct upload. Please use client-side upload for larger files.`,
        },
        { status: 413 }
      );
    }

    // Upload to Vercel Blob Storage
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: true,
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
    
    // Check if it's a size limit error
    if (errorMessage.includes('Request Entity Too Large') || errorMessage.includes('FUNCTION_PAYLOAD_TOO_LARGE')) {
      return NextResponse.json(
        {
          error: 'File too large for direct upload (>6MB). The client-side upload should be used for files larger than 6MB.',
          details: errorMessage,
        },
        { status: 413 }
      );
    }
    
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

