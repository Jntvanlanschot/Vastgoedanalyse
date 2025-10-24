import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cityToSlug, slugifyStreetName } from '@/lib/funda/slug';

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

interface FundaProperty {
  url: string;
  address: string;
  price: number;
  saleDate: string;
  taxatieValue?: number;
  [key: string]: unknown;
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
  
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=[${streetSlugs.map((slug: string) => `"${slug}"`).join(',')}]&availability=["negotiations","unavailable"]`;
  
  const fundaConfig = {
    includeSold: true,
    includeUnderOffer: true,
    maxItems: 300,
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
  const maxAttempts = 60; // 10 minutes max
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
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
      { error: 'Apify run timed out after 10 minutes' },
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

  // Build Funda search URL with buurt slugs (without buurt- prefix)
  const citySlug = cityToSlug(city);
  const selectedAreas = buurtSlugs.map(slug => `${citySlug}/${slug}`);
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${JSON.stringify(selectedAreas)}&availability=${JSON.stringify(['negotiations', 'unavailable'])}`;
  
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
  const maxAttempts = 60; // 10 minutes max
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
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
      { error: 'Apify run timed out after 10 minutes' },
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
  
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=[${wijkAreaSlugs.map((slug: string) => `"${slug}"`).join(',')}]&availability=["negotiations","unavailable"]`;
  
  const fundaConfig = {
    includeSold: true,
    includeUnderOffer: true,
    maxItems: 300,
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
  const maxAttempts = 60; // 10 minutes max
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
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
      { error: 'Apify run timed out after 10 minutes' },
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

    // Step 1: Start the Apify run
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
    
    console.log(`Apify run started with ID: ${runId}, Dataset ID: ${datasetId}`);

    // Step 2: Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes max (60 * 10 seconds)
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      const statusResponse = await axios.get<ApifyRunStatus>(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
      );
      
      const status = statusResponse.data.data.status;
      console.log(`Run status (attempt ${attempts + 1}): ${status}`);
      
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
        { error: 'Apify run timed out after 10 minutes' },
        { status: 408 }
      );
    }

    console.log('Apify run completed successfully, fetching dataset...');

    // Step 3: Fetch the dataset
    const datasetResponse = await axios.get(
      `https://api.apify.com/v2/datasets/${datasetId}/items?format=csv&clean=true&token=${apifyToken}`,
      {
        responseType: 'text',
      }
    );

    const csvData = datasetResponse.data;
    console.log(`Dataset fetched, ${csvData.length} characters`);

    // Return CSV file for download (same as other handlers)
    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="funda-buurten-nl.csv"',
      },
    });

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

function analyzeFundaData(csvData: string) {
  const lines = csvData.split('\n');
  const headers = lines[0].split(',');
  
  // Find relevant column indices
  const priceIndex = headers.findIndex(h => h.toLowerCase().includes('price') || h.toLowerCase().includes('prijs'));
  const saleDateIndex = headers.findIndex(h => h.toLowerCase().includes('sale') || h.toLowerCase().includes('verkoop'));
  const taxatieIndex = headers.findIndex(h => h.toLowerCase().includes('taxatie') || h.toLowerCase().includes('valuation'));
  const addressIndex = headers.findIndex(h => h.toLowerCase().includes('address') || h.toLowerCase().includes('adres'));
  const urlIndex = headers.findIndex(h => h.toLowerCase().includes('url') || h.toLowerCase().includes('link'));

  const properties: FundaProperty[] = [];
  let totalPrice = 0;
  let totalTaxatieValue = 0;
  let taxatieCount = 0;

  // Parse CSV data (skip header row)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',');
    if (values.length < headers.length) continue;

    const price = parseFloat(values[priceIndex]?.replace(/[^\d.-]/g, '') || '0');
    const saleDate = values[saleDateIndex] || '';
    const taxatieValue = taxatieIndex >= 0 ? parseFloat(values[taxatieIndex]?.replace(/[^\d.-]/g, '') || '0') : undefined;
    const address = values[addressIndex] || '';
    const url = values[urlIndex] || '';

    if (price > 0) {
      properties.push({
        url,
        address,
        price,
        saleDate,
        taxatieValue,
      });

      totalPrice += price;
      if (taxatieValue && taxatieValue > 0) {
        totalTaxatieValue += taxatieValue;
        taxatieCount++;
      }
    }
  }

  // Filter properties from last 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const recentSales = properties.filter(prop => {
    if (!prop.saleDate) return false;
    const saleDate = new Date(prop.saleDate);
    return saleDate >= twelveMonthsAgo;
  });

  return {
    totalProperties: properties.length,
    recentSales: recentSales.length,
    averagePrice: properties.length > 0 ? Math.round(totalPrice / properties.length) : 0,
    averageTaxatieValue: taxatieCount > 0 ? Math.round(totalTaxatieValue / taxatieCount) : 0,
    properties: recentSales.slice(0, 50), // Return top 50 recent sales for display
  };
}
