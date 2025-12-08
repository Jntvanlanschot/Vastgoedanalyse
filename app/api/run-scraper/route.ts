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
  const maxAttempts = 30; // 5 minutes max (30 * 10 seconds) - within Vercel Pro 300s limit
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds (same as main handler)
    
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
  const maxAttempts = 30; // 5 minutes max (30 * 10 seconds) - within Vercel Pro 300s limit
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds (same as main handler)
    
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
  const maxAttempts = 30; // 5 minutes max (30 * 10 seconds) - within Vercel Pro 300s limit
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds (same as main handler)
    
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
    const requestBody = await request.json();
    
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
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max (30 * 10 seconds) - within Vercel Pro 300s limit
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
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
      console.log(`Run status (attempt ${attempts + 1}): ${status}`);
      
      // Update datasetId from status response if available (as fallback)
      const statusDatasetId = statusResponse!.data.data.defaultDatasetId;
      if (statusDatasetId && statusDatasetId !== datasetId) {
        console.log(`Dataset ID updated from status: ${statusDatasetId} (was ${datasetId})`);
        datasetId = statusDatasetId;
      }
      
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

    console.log('Apify run completed successfully, fetching dataset...');
    
    // Verify dataset ID is available
    if (!datasetId) {
      return NextResponse.json(
        { error: 'Dataset ID not available from Apify run response', runId },
        { status: 500 }
      );
    }
    
    // Wait a bit for dataset to be fully available (sometimes there's a delay)
    console.log(`Waiting 3 seconds for dataset ${datasetId} to be fully available...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 3: First check if dataset has items (to avoid empty dataset error)
    console.log(`Checking dataset ${datasetId} for items...`);
    let datasetInfo;
    try {
      datasetInfo = await axios.get(
        `https://api.apify.com/v2/datasets/${datasetId}?token=${apifyToken}`,
        { timeout: 15000 }
      );
      const itemCount = datasetInfo.data.data.itemCount || 0;
      console.log(`Dataset has ${itemCount} items`);
      
      if (itemCount === 0) {
        return NextResponse.json(
          { 
            error: 'De scraper heeft geen resultaten gevonden. Mogelijke oorzaken:\n- Geen woningen beschikbaar voor de geselecteerde buurten\n- Funda website blokkeert de scraper\n- Scraper configuratie probleem',
            datasetId,
            runId,
            itemCount: 0,
            suggestion: 'Probeer andere buurten of controleer de Funda website handmatig'
          },
          { status: 404 }
        );
      }
    } catch (error) {
      console.warn('Could not check dataset info, proceeding with fetch attempt:', error instanceof Error ? error.message : String(error));
    }

    // Step 4: Fetch the dataset with retry logic
    let datasetResponse;
    let datasetRetryCount = 0;
    const maxDatasetRetries = 5; // Increased retries
    
    while (datasetRetryCount < maxDatasetRetries) {
      try {
        console.log(`Fetching dataset ${datasetId} (attempt ${datasetRetryCount + 1}/${maxDatasetRetries})...`);
        datasetResponse = await axios.get(
          `https://api.apify.com/v2/datasets/${datasetId}/items?format=csv&clean=true&token=${apifyToken}`,
          {
            responseType: 'text',
            timeout: 30000, // 30 second timeout
          }
        );
        break; // Success, exit retry loop
      } catch (error: unknown) {
        datasetRetryCount++;
        
        // Enhanced error logging
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const statusText = error.response?.statusText;
          const errorData = error.response?.data;
          console.error(`Dataset fetch failed (attempt ${datasetRetryCount}):`, {
            status,
            statusText,
            message: error.message,
            data: errorData,
            datasetId,
            url: error.config?.url
          });
          
          // Check for empty dataset error specifically
          if (status === 400 && errorData) {
            try {
              const errorObj = typeof errorData === 'string' ? JSON.parse(errorData) : errorData;
              if (errorObj?.error?.type === 'no-columns-in-exported-dataset') {
                console.error('Dataset is empty - scraper found no results');
                return NextResponse.json(
                  { 
                    error: 'De scraper heeft geen resultaten gevonden. De dataset is leeg.\n\nMogelijke oorzaken:\n- Geen woningen beschikbaar voor de geselecteerde buurten\n- Funda website blokkeert de scraper\n- Scraper configuratie probleem\n\nProbeer andere buurten of controleer de Funda website handmatig.',
                    datasetId,
                    runId,
                    itemCount: 0,
                    errorType: 'empty-dataset',
                    suggestion: 'Controleer of er woningen beschikbaar zijn op Funda voor deze buurten'
                  },
                  { status: 404 }
                );
              }
            } catch (parseError) {
              // Continue with normal error handling if parsing fails
            }
          }
        } else {
          console.error(`Dataset fetch failed (attempt ${datasetRetryCount}):`, error instanceof Error ? error.message : String(error));
        }
        
        if (datasetRetryCount >= maxDatasetRetries) {
          const errorMessage = axios.isAxiosError(error) 
            ? `Failed to fetch dataset after ${maxDatasetRetries} attempts. Status: ${error.response?.status} ${error.response?.statusText}. Error: ${JSON.stringify(error.response?.data || error.message)}`
            : `Failed to fetch dataset after ${maxDatasetRetries} attempts. Error: ${error instanceof Error ? error.message : String(error)}`;
          
          return NextResponse.json(
            { error: errorMessage, datasetId, runId },
            { status: 500 }
          );
        }
        
        // Wait before retry with exponential backoff
        const waitTime = Math.pow(2, datasetRetryCount) * 1000; // 2s, 4s, 8s, 16s, 32s
        console.log(`Retrying dataset fetch in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const csvData = datasetResponse!.data;
    console.log(`Dataset fetched, ${csvData.length} characters`);

    // Run Python workflow on the CSV data
    console.log('Starting Python workflow analysis...');
    
    try {
      // Get reference data from the request or use default structure
      const referenceData = {
        address_full: requestBody.referenceData?.address_full || 'Unknown Address',
        area_m2: requestBody.referenceData?.area_m2 || 100,
        energy_label: requestBody.referenceData?.energy_label || 'B',
        bedrooms: requestBody.referenceData?.bedrooms || 2,
        bathrooms: requestBody.referenceData?.bathrooms || 1,
        rooms: requestBody.referenceData?.rooms || 3,
        has_terrace: requestBody.referenceData?.has_terrace || false,
        has_balcony: requestBody.referenceData?.has_balcony || false,
        has_garden: requestBody.referenceData?.has_garden || false,
        sun_orientation: requestBody.referenceData?.sun_orientation || 'zuid'
      };

      // Call the street analysis API (Algorithm 1 only)
      // Use AbortController for timeout (max 4 minutes to stay within 5 min total)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 240000); // 4 minutes timeout
      
      try {
        const streetAnalysisResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/run-street-analysis`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            csvData,
            referenceData
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const streetAnalysisResult = await streetAnalysisResponse.json();
        
        if (streetAnalysisResult.status === 'success') {
          console.log('Street analysis completed successfully:', streetAnalysisResult.result);
          
          // Generate download URL
          const downloadUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/download-csv?runId=${runId}&datasetId=${datasetId}`;
          console.log('Generated download URL:', downloadUrl);
          
          // Return both CSV and street analysis results
          return NextResponse.json({
            success: true,
            csvData: csvData,
            streetAnalysis: streetAnalysisResult.result,
            runId,
            datasetId,
            downloadUrl: downloadUrl
          });
        } else {
          console.error('Street analysis failed:', streetAnalysisResult.message);
          
          // Return CSV with street analysis error
          return NextResponse.json({
            success: true,
            csvData: csvData,
            streetAnalysis: streetAnalysisResult,
            runId,
            datasetId,
            downloadUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/download-csv?runId=${runId}&datasetId=${datasetId}`
          });
        }
      } catch (streetAnalysisError) {
        clearTimeout(timeoutId);
      console.error('Error running street analysis:', streetAnalysisError);
      
      // Return CSV even if street analysis fails
      return NextResponse.json({
        success: true,
        csvData: csvData,
        streetAnalysis: {
          status: 'error',
          message: 'Street analysis execution failed'
        },
        runId,
        datasetId,
        downloadUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/download-csv?runId=${runId}&datasetId=${datasetId}`
      });
    }

  } catch (error) {
    console.error('Error running Apify scraper:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

