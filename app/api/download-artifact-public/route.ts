import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Force Node.js runtime (required for fs APIs)
export const runtime = 'nodejs';

// API Key validation
function validateApiKey(request: NextRequest): boolean {
  // Check for API key in query parameter or headers
  const { searchParams } = new URL(request.url);
  const apiKeyFromQuery = searchParams.get('apiKey');
  const apiKeyFromHeader = request.headers.get('X-API-Key') || 
                           request.headers.get('Authorization')?.replace('Bearer ', '');
  
  const apiKey = apiKeyFromQuery || apiKeyFromHeader;
  const validApiKey = process.env.API_KEY;
  
  if (!validApiKey) {
    console.error('API_KEY not set in environment variables');
    return false;
  }
  
  return apiKey === validApiKey;
}

export async function GET(request: NextRequest) {
  try {
    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid or missing API key' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('file');

    if (!filePath) {
      return NextResponse.json(
        { error: 'File parameter is required' },
        { status: 400 }
      );
    }

    // Security check: ensure the file is within the workflow outputs directory
    const workflowOutputsDir = join(process.cwd(), 'apps', 'workflow-py', 'workflow', 'outputs');
    const fullPath = join(workflowOutputsDir, filePath);
    
    // Ensure the file is within the allowed directory
    if (!fullPath.startsWith(workflowOutputsDir)) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    if (!existsSync(fullPath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Read the file
    const fileBuffer = readFileSync(fullPath);
    
    // Determine content type based on file extension
    const extension = filePath.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    let filename = filePath.split('/').pop() || 'download';

    switch (extension) {
      case 'pdf':
        contentType = 'application/pdf';
        break;
      case 'xlsx':
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'csv':
        contentType = 'text/csv';
        break;
      case 'json':
        contentType = 'application/json';
        break;
    }

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Error serving artifact:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


