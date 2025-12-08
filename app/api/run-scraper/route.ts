import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cityToSlug, slugifyStreetName } from '@/lib/funda/slug';

// Increase max duration for long-running Funda scraper (5 minutes)
// Funda scraper can take 1-2 minutes, so we need Pro plan timeout
export const maxDuration = 300;

interface ApifyRunResponse {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
  };
}

interface ApifyRunStatus {
  data: {
    status: string;
    defaultDatasetId: string;
  };
}

interface StreetScrapingRequest {
  city?: string;
  streets: string[];
}

interface BuurtScrapingRequest {
  city?: string;
  buurtSlugs: string[];
}

interface WijkScrapingRequest {
  city?: string;
  wijkSlugs: string[];
}

async function handleStreetScraping(requestBody: StreetScrapingRequest) {
  const { city, streets } = requestBody;
  
  // Validate that exactly 5 streets are provided
  if (!streets || streets.length !== 5) {
    return NextResponse.json(
      { error: 'Exactly 5 streets must be provided' },
      { status: 400 }
    );
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json(
      { error: 'Apify API token not configured' },
      { status: 500 }
    );
  }

  // Build Funda search URL with street slugs
  const citySlug = cityToSlug(city);
  const streetSlugs = streets.map((street: string) => `${citySlug}/straat-${slugifyStreetName(street)}`);
  
  // URL encode the JSON array properly (format: [%22area1%22,%22area2%22])
  const selectedAreaParam = encodeURIComponent(JSON.stringify(streetSlugs));
  // Availability parameter is CRUCIAL - use only "unavailable"
  const availabilityParam = encodeURIComponent(JSON.stringify(['unavailable']));
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;
  
  const fundaConfig = {
    includeSold: true,
    includeUnderOffer: true,
    maxItems: 150,
    proxyConfiguration: {
      useApifyProxy: true
    },
    searchUrls: [searchUrl]
  };

  console.log('Starting street-based Apify scraper with config:', JSON.stringify(fundaConfig, null, 2));

  // Start the Apify run
  const runResponse = await axios.post<ApifyRunResponse>(
    `https://api.apify.com/v2/acts/69aVxdpQm6bIIJyNb/runs?token=${apifyToken}`,
    fundaConfig,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const runId = runResponse.data.data.id;
  const datasetId = runResponse.data.data.defaultDatasetId;
  
  console.log(`Street scraper run started with ID: ${runId}, Dataset ID: ${datasetId}`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 50; // 50 * 5 seconds = 250 seconds max (within Vercel Pro 300s limit)
  const pollInterval = 5000; // 5 seconds instead of 10
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, pollInterval)); // Wait 5 seconds
    
    const statusResponse = await axios.get<ApifyRunStatus>(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
    );
    
    const status = statusResponse.data.data.status;
    console.log(`Street scraper run status (attempt ${attempts + 1}): ${status}`);
    
    if (status === 'SUCCEEDED') {
      break;
    } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      return NextResponse.json(
        { error: `Apify run failed with status: ${status}` },
        { status: 500 }
      );
    }
    
    attempts++;
  }

  if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: 'Apify run timed out after 5 minutes. The scraper may still be running. Please try again in a few minutes or check Apify dashboard.', runId, datasetId },
        { status: 408 }
      );
  }

  console.log('Street scraper run completed successfully, fetching dataset...');

  // Fetch the dataset as CSV
  const datasetResponse = await axios.get(
    `https://api.apify.com/v2/datasets/${datasetId}/items?format=csv&clean=true&token=${apifyToken}`,
    {
      responseType: 'text',
    }
  );

  const csvData = datasetResponse.data;
  console.log(`Street dataset fetched, ${csvData.length} characters`);

  // Return CSV file for download
  return new NextResponse(csvData, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="funda-streets.csv"',
    },
  });
}

async function handleBuurtScraping(requestBody: BuurtScrapingRequest) {
  const { city, buurtSlugs } = requestBody;
  
  // Validate that at least one buurt is provided
  if (!buurtSlugs || buurtSlugs.length === 0) {
    return NextResponse.json(
      { error: 'At least one buurt must be provided' },
      { status: 400 }
    );
  }

  // Validate slugs contain only allowed characters
  const invalidSlugs = buurtSlugs.filter(slug => !/^[a-z0-9-]+$/.test(slug));
  if (invalidSlugs.length > 0) {
    return NextResponse.json(
      { error: `Invalid buurt slugs found: ${invalidSlugs.join(', ')}. Only a-z, 0-9, and - are allowed.` },
      { status: 400 }
    );
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json(
      { error: 'Apify API token not configured' },
      { status: 500 }
    );
  }

  // Build Funda search URL with buurt slugs
  const citySlug = cityToSlug(city);
  const selectedAreas = buurtSlugs.map(slug => `${citySlug}/${slug}`);
  // URL encode the JSON array properly (format: [%22area1%22,%22area2%22])
  const selectedAreaParam = encodeURIComponent(JSON.stringify(selectedAreas));
  // Availability parameter is CRUCIAL - use only "unavailable"
  const availabilityParam = encodeURIComponent(JSON.stringify(['unavailable']));
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;
  
  const fundaConfig = {
    includeSold: true,
    includeUnderOffer: true,
    maxItems: 150,
    proxyConfiguration: {
      useApifyProxy: true
    },
    searchUrls: [searchUrl]
  };

  console.log('Starting buurt-based Apify scraper with config:', JSON.stringify(fundaConfig, null, 2));

  // Start the Apify run
  const runResponse = await axios.post<ApifyRunResponse>(
    `https://api.apify.com/v2/acts/69aVxdpQm6bIIJyNb/runs?token=${apifyToken}`,
    fundaConfig,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const runId = runResponse.data.data.id;
  const datasetId = runResponse.data.data.defaultDatasetId;
  
  console.log(`Buurt scraper run started with ID: ${runId}, Dataset ID: ${datasetId}`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 50; // 50 * 5 seconds = 250 seconds max (within Vercel Pro 300s limit)
  const pollInterval = 5000; // 5 seconds instead of 10
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, pollInterval)); // Wait 5 seconds
    
    const statusResponse = await axios.get<ApifyRunStatus>(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
    );
    
    const status = statusResponse.data.data.status;
    console.log(`Buurt scraper run status (attempt ${attempts + 1}): ${status}`);
    
    if (status === 'SUCCEEDED') {
      break;
    } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      return NextResponse.json(
        { error: `Apify run failed with status: ${status}` },
        { status: 500 }
      );
    }
    
    attempts++;
  }

  if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: 'Apify run timed out after 5 minutes. The scraper may still be running. Please try again in a few minutes or check Apify dashboard.', runId, datasetId },
        { status: 408 }
      );
  }

  console.log('Buurt scraper run completed successfully, fetching dataset...');

  // Fetch the dataset as CSV
  const datasetResponse = await axios.get(
    `https://api.apify.com/v2/datasets/${datasetId}/items?format=csv&clean=true&token=${apifyToken}`,
    {
      responseType: 'text',
    }
  );

  const csvData = datasetResponse.data;
  console.log(`Buurt dataset fetched, ${csvData.length} characters`);

  // Return CSV file for download
  return new NextResponse(csvData, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="funda-buurten.csv"',
    },
  });
}

async function handleWijkScraping(requestBody: WijkScrapingRequest) {
  const { city, wijkSlugs } = requestBody;
  
  // Validate that exactly 4 wijken are provided
  if (!wijkSlugs || wijkSlugs.length !== 4) {
    return NextResponse.json(
      { error: 'Exactly 4 wijken must be provided' },
      { status: 400 }
    );
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    return NextResponse.json(
      { error: 'Apify API token not configured' },
      { status: 500 }
    );
  }

  // Build Funda search URL with wijk slugs
  const citySlug = cityToSlug(city);
  const wijkAreaSlugs = wijkSlugs.map((wijkSlug: string) => `${citySlug}/${wijkSlug}`);
  
  // URL encode the JSON array properly (format: [%22area1%22,%22area2%22])
  const selectedAreaParam = encodeURIComponent(JSON.stringify(wijkAreaSlugs));
  // Availability parameter is CRUCIAL - use only "unavailable"
  const availabilityParam = encodeURIComponent(JSON.stringify(['unavailable']));
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;
  
  const fundaConfig = {
    includeSold: true,
    includeUnderOffer: true,
    maxItems: 150,
    proxyConfiguration: {
      useApifyProxy: true
    },
    searchUrls: [searchUrl]
  };

  console.log('Starting wijk-based Apify scraper with config:', JSON.stringify(fundaConfig, null, 2));

  // Start the Apify run
  const runResponse = await axios.post<ApifyRunResponse>(
    `https://api.apify.com/v2/acts/69aVxdpQm6bIIJyNb/runs?token=${apifyToken}`,
    fundaConfig,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const runId = runResponse.data.data.id;
  const datasetId = runResponse.data.data.defaultDatasetId;
  
  console.log(`Wijk scraper run started with ID: ${runId}, Dataset ID: ${datasetId}`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 50; // 50 * 5 seconds = 250 seconds max (within Vercel Pro 300s limit)
  const pollInterval = 5000; // 5 seconds instead of 10
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, pollInterval)); // Wait 5 seconds
    
    const statusResponse = await axios.get<ApifyRunStatus>(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
    );
    
    const status = statusResponse.data.data.status;
    console.log(`Wijk scraper run status (attempt ${attempts + 1}): ${status}`);
    
    if (status === 'SUCCEEDED') {
      break;
    } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      return NextResponse.json(
        { error: `Apify run failed with status: ${status}` },
        { status: 500 }
      );
    }
    
    attempts++;
  }

  if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: 'Apify run timed out after 5 minutes. The scraper may still be running. Please try again in a few minutes or check Apify dashboard.', runId, datasetId },
        { status: 408 }
      );
  }

  console.log('Wijk scraper run completed successfully, fetching dataset...');

  // Fetch the dataset as CSV
  const datasetResponse = await axios.get(
    `https://api.apify.com/v2/datasets/${datasetId}/items?format=csv&clean=true&token=${apifyToken}`,
    {
      responseType: 'text',
    }
  );

  const csvData = datasetResponse.data;
  console.log(`Wijk dataset fetched, ${csvData.length} characters`);

  // Return CSV file for download
  return new NextResponse(csvData, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="funda-wijken.csv"',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Validate request body can be parsed
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    // Log request for debugging
    console.log('Received scraper request:', {
      hasBuurtSlugs: !!requestBody.buurtSlugs,
      hasWijkSlugs: !!requestBody.wijkSlugs,
      hasStreets: !!requestBody.streets,
      hasSearchUrls: !!requestBody.searchUrls,
      buurtSlugsCount: requestBody.buurtSlugs?.length || 0,
      wijkSlugsCount: requestBody.wijkSlugs?.length || 0,
      streetsCount: requestBody.streets?.length || 0
    });
    
    // Handle new buurt-based scraping
    if (requestBody.buurtSlugs && Array.isArray(requestBody.buurtSlugs)) {
      return await handleBuurtScraping(requestBody);
    }
    
    // Handle wijk-based scraping
    if (requestBody.wijkSlugs && Array.isArray(requestBody.wijkSlugs)) {
      return await handleWijkScraping(requestBody);
    }
    
    // Handle street-based scraping
    if (requestBody.streets && Array.isArray(requestBody.streets)) {
      return await handleStreetScraping(requestBody);
    }
    
    // Handle legacy fundaConfig format
    const fundaConfig = requestBody;
    if (!fundaConfig || !fundaConfig.searchUrls) {
      return NextResponse.json(
        { error: 'Invalid Funda configuration' },
        { status: 400 }
      );
    }

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      return NextResponse.json(
        { error: 'Apify API token not configured' },
        { status: 500 }
      );
    }

    console.log('Starting Apify scraper with config:', JSON.stringify(fundaConfig, null, 2));

    // Step 1: Start the Apify run with retry logic
    let runResponse;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        runResponse = await axios.post<ApifyRunResponse>(
          `https://api.apify.com/v2/acts/69aVxdpQm6bIIJyNb/runs?token=${apifyToken}`,
          fundaConfig,
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 second timeout
          }
        );
        break; // Success, exit retry loop
      } catch (error: unknown) {
        retryCount++;
        console.error(`Apify API call failed (attempt ${retryCount}):`, error instanceof Error ? error.message : String(error));
        
        if (retryCount >= maxRetries) {
          return NextResponse.json(
            { error: `Failed to start Apify scraper after ${maxRetries} attempts. Network error: ${error instanceof Error ? error.message : String(error)}` },
            { status: 500 }
          );
        }
        
        // Wait before retry with exponential backoff
        const waitTime = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
        console.log(`Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const runId = runResponse!.data.data.id;
    let datasetId = runResponse!.data.data.defaultDatasetId; // Use let instead of const to allow updates
    
    console.log(`Apify run started with ID: ${runId}, Dataset ID: ${datasetId}`);

    // Step 2: Poll for completion
    // Use shorter polling interval to detect completion faster and reduce total time
    let attempts = 0;
    const maxAttempts = 50; // 50 * 5 seconds = 250 seconds max (within Vercel Pro 300s limit)
    const pollInterval = 5000; // 5 seconds instead of 10
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval)); // Wait 5 seconds
      attempts++;
      
      let statusResponse;
      let statusRetryCount = 0;
      const maxStatusRetries = 3;
      
      while (statusRetryCount < maxStatusRetries) {
        try {
          statusResponse = await axios.get<ApifyRunStatus>(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`,
            { timeout: 15000 } // 15 second timeout
          );
          break; // Success, exit retry loop
        } catch (error: unknown) {
          statusRetryCount++;
          console.error(`Status check failed (attempt ${statusRetryCount}):`, error instanceof Error ? error.message : String(error));
          
          if (statusRetryCount >= maxStatusRetries) {
            return NextResponse.json(
              { error: `Failed to check Apify run status after ${maxStatusRetries} attempts. Network error: ${error instanceof Error ? error.message : String(error)}` },
              { status: 500 }
            );
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      const status = statusResponse!.data.data.status;
      const elapsedSeconds = attempts * (pollInterval / 1000);
      console.log(`Run status (attempt ${attempts}/${maxAttempts}, ${elapsedSeconds}s elapsed): ${status}`);
      
      // Update datasetId from status response if available (as fallback)
      const statusDatasetId = statusResponse!.data.data.defaultDatasetId;
      if (statusDatasetId && statusDatasetId !== datasetId) {
        console.log(`Dataset ID updated from status: ${statusDatasetId} (was ${datasetId})`);
        datasetId = statusDatasetId;
      }
      
      if (status === 'SUCCEEDED') {
        const elapsedSeconds = attempts * (pollInterval / 1000);
        console.log(`Scraper completed successfully after ${attempts} attempts (${elapsedSeconds} seconds)`);
        break;
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        return NextResponse.json(
          { error: `Apify run failed with status: ${status}` },
          { status: 500 }
        );
      }
      
      // Continue polling if status is RUNNING or READY
    }

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: 'Apify run timed out after 5 minutes. The scraper may still be running. Please try again in a few minutes or check Apify dashboard.', runId, datasetId },
        { status: 408 }
      );
    }

    console.log('Apify run completed successfully!');
    
    // Verify dataset ID is available
    if (!datasetId) {
      return NextResponse.json(
        { error: 'Dataset ID not available from Apify run response', runId },
        { status: 500 }
      );
    }
    
    // Return immediately with datasetId - let frontend fetch the dataset
    // This prevents timeout issues when dataset fetch takes too long
    console.log(`Returning scraper completion with datasetId ${datasetId} - frontend will fetch dataset`);
    
    const downloadUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/download-csv?runId=${runId}&datasetId=${datasetId}`;
    
    return NextResponse.json({
      success: true,
      runId,
      datasetId,
      downloadUrl: downloadUrl,
      message: 'Scraper completed successfully. Dataset is ready to be fetched.'
    });

  } catch (error) {
    console.error('Error running Apify scraper:', error);
    
    // Enhanced error logging
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error stack:', error.stack);
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    } else {
      errorMessage = String(error);
    }
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        } : undefined
      },
      { status: 500 }
    );
  }
}

