import { NextRequest, NextResponse } from 'next/server';
import { put, handleUpload } from '@vercel/blob';

export const maxDuration = 300;

// Handle upload requests from @vercel/blob/client
export async function POST(request: NextRequest) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'BLOB_READ_WRITE_TOKEN not configured' },
        { status: 500 }
      );
    }

    // Try handleUpload first (for client-side uploads)
    try {
      const jsonResponse = await handleUpload({
        request,
        onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
          return {
            allowedContentTypes: [
              'application/x-mimearchive',
              'message/rfc822',
              'multipart/related',
              'multipart/mixed',
              'application/octet-stream',
              'text/html',
              'application/zip',
            ],
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          console.log('Upload completed:', blob.url);
        },
      });

      return NextResponse.json(jsonResponse);
    } catch (handleUploadError) {
      // If handleUpload fails, try direct FormData upload
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const filename = formData.get('filename') as string;

      if (!file || !filename) {
        return NextResponse.json(
          { error: 'File and filename are required' },
          { status: 400 }
        );
      }

      if (file.size > 6 * 1024 * 1024) {
        return NextResponse.json(
          {
            error: `File too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Maximum size is 6MB for direct API upload.`,
          },
          { status: 413 }
        );
      }

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
    }
  } catch (error) {
    console.error('Blob upload error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload file',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Handle token generation requests
  try {
    const jsonResponse = await handleUpload({
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        return {
          allowedContentTypes: [
            'application/x-mimearchive',
            'message/rfc822',
            'multipart/related',
            'multipart/mixed',
            'application/octet-stream',
            'text/html',
            'application/zip',
          ],
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Token generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate token',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
