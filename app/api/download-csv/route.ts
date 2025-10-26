import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const datasetId = searchParams.get('datasetId');

    console.log('Download CSV request:', { runId, datasetId });

    if (!runId || !datasetId) {
      return NextResponse.json(
        { error: 'runId and datasetId are required' },
        { status: 400 }
      );
    }

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error('Apify API token not configured');
      return NextResponse.json(
        { error: 'Apify API token not configured' },
        { status: 500 }
      );
    }

    console.log('Fetching dataset from Apify:', datasetId);

    // Fetch the dataset as CSV
    const datasetResponse = await axios.get(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=csv&clean=true&token=${apifyToken}`,
      {
        responseType: 'text',
        timeout: 30000,
      }
    );

    const csvData = datasetResponse.data;
    console.log('Dataset fetched successfully, length:', csvData.length);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `funda-data-${runId}-${timestamp}.csv`;

    // Return CSV file for download
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
    
    // Check if it's an Axios error with specific status
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return NextResponse.json(
          { error: 'Dataset not found. The scraper may not have completed yet or the dataset ID is invalid.' },
          { status: 404 }
        );
      }
      if (error.response?.status === 401) {
        return NextResponse.json(
          { error: 'Unauthorized. Check Apify API token.' },
          { status: 401 }
        );
      }
    }
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
