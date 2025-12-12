import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

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

    const contentType = request.headers.get('content-type') || '';
    console.log('POST request received, contentType:', contentType);
    
    // Check if this is a token generation request (from @vercel/blob/client)
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        console.log('Request body:', JSON.stringify(body));
        
        // Check if it's a token generation request
        if (body?.type === 'blob.generate-client-token') {
          console.log('Token generation request detected');
          
          const { pathname, clientPayload, multipart } = body.payload || {};
          console.log('Generating token for:', pathname, 'multipart:', multipart);
          
          // Generate client token using Vercel Blob API
          const response = await fetch('https://vercel.com/api/blob/generate-client-token', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              pathname,
              clientPayload,
              multipart,
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
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Token generation failed:', response.status, errorText);
            throw new Error(`Failed to generate token: ${response.status}`);
          }

          const tokenData = await response.json();
          console.log('Token generated successfully');
          return NextResponse.json({ clientToken: tokenData.clientToken });
        }
      } catch (jsonError) {
        console.error('Error handling token generation:', jsonError);
        // Continue to file upload handling below
      }
    }

    // Handle file upload (FormData)
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
  } catch (error: any) {
    console.error('Upload error:', error);
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

    // GET requests are not used for token generation, but handle gracefully
    return NextResponse.json(
      { error: 'Token generation requires POST request' },
      { status: 405 }
    );
  } catch (error) {
    console.error('GET handler error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: 'Failed to handle request',
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}
