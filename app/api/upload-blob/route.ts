import { NextRequest, NextResponse } from 'next/server';
import { put, handleUpload } from '@vercel/blob';

export const maxDuration = 300;

// Handle upload requests from @vercel/blob/client
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

    // Log request details for debugging
    const contentType = request.headers.get('content-type') || '';
    console.log('POST request received, contentType:', contentType);
    
    // Clone request to inspect body without consuming it
    const clonedRequest = request.clone();
    
    // If it's a JSON request, log the body
    if (contentType.includes('application/json')) {
      try {
        const body = await clonedRequest.json();
        console.log('Request body:', JSON.stringify(body));
      } catch (e) {
        console.log('Could not parse request body as JSON');
      }
    }

    // handleUpload automatically handles both token generation and file uploads
    const jsonResponse = await handleUpload({
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        console.log('Generating token for:', pathname, 'multipart:', multipart, 'clientPayload:', clientPayload);
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

    console.log('handleUpload response:', JSON.stringify(jsonResponse));
    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    
    // If it's explicitly not a handleUpload request, try FormData
    if (errorMsg.includes('not a handleUpload request') || errorMsg.includes('Invalid request')) {
      console.log('Not a handleUpload request, trying FormData');
      try {
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
      } catch (formDataError) {
        console.error('FormData upload error:', formDataError);
        return NextResponse.json(
          {
            error: 'Failed to upload file',
            details: formDataError instanceof Error ? formDataError.message : String(formDataError),
          },
          { status: 500 }
        );
      }
    }
    
    // If it's a handleUpload error, return the error
    console.error('handleUpload error:', errorMsg);
    return NextResponse.json(
      {
        error: 'Failed to handle upload request',
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Handle token generation requests from @vercel/blob/client
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      console.error('BLOB_READ_WRITE_TOKEN not found in GET handler');
      return NextResponse.json(
        { error: 'BLOB_READ_WRITE_TOKEN not configured' },
        { status: 500 }
      );
    }

    const jsonResponse = await handleUpload({
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        console.log('Generating token for GET request:', pathname);
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
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: 'Failed to generate token',
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}
