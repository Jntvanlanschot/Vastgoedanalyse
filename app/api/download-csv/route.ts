import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    // Prevent path traversal: runId must be a UUID
    if (!/^[0-9a-f-]{36}$/.test(runId)) {
      return NextResponse.json({ error: 'Invalid runId format' }, { status: 400 });
    }

    const csvPath = path.join(tmpdir(), `${runId}.csv`);
    console.log('Download CSV request for runId:', runId, '→', csvPath);

    if (!existsSync(csvPath)) {
      return NextResponse.json(
        { error: 'Dataset not found. The scraper may not have completed yet or the run ID is invalid.' },
        { status: 404 }
      );
    }

    const csvData = readFileSync(csvPath, 'utf8');
    console.log('Serving CSV for runId:', runId, '— length:', csvData.length);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `funda-data-${runId}-${timestamp}.csv`;

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Error serving CSV:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
