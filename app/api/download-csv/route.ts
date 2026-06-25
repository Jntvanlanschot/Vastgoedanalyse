import { NextRequest, NextResponse } from 'next/server';

const APIFY_BASE = 'https://api.apify.com/v2';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datasetId = searchParams.get('datasetId');
    const runId = searchParams.get('runId');

    console.log('Download CSV request:', { runId, datasetId });

    if (!datasetId) {
      return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
    }

    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      console.error('APIFY_API_TOKEN is not configured');
      return NextResponse.json({ error: 'Apify API token not configured' }, { status: 500 });
    }

    console.log('Fetching dataset from Apify:', datasetId);

    const res = await fetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?format=csv&clean=true&token=${token}`,
    );

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          { error: 'Dataset not found. The scraper may not have completed yet or the dataset ID is invalid.' },
          { status: 404 }
        );
      }
      if (res.status === 401) {
        return NextResponse.json({ error: 'Unauthorized. Check Apify API token.' }, { status: 401 });
      }
      return NextResponse.json(
        { error: `Apify dataset fetch failed with status ${res.status}` },
        { status: 502 }
      );
    }

    const csvData = await res.text();
    console.log('Dataset fetched, length:', csvData.length);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `funda-data-${runId ?? datasetId}-${timestamp}.csv`;

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Error downloading CSV:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
