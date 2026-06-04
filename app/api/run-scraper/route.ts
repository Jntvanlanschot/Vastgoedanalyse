import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import path from 'path';
import { cityToSlug, slugifyStreetName } from '@/lib/funda/slug';
import { runFundaScraper, writeCsv } from '@/lib/fundaScraper';

// Playwright scraping can take several minutes for large result sets
export const maxDuration = 300;

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

function buildDownloadUrl(runId: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${base}/api/download-csv?runId=${runId}`;
}

async function scrapeAndSave(searchUrls: string[], maxItems: number, label: string) {
  const runId = randomUUID();
  const csvPath = path.join(tmpdir(), `${runId}.csv`);

  console.log(`[${label}] Starting Playwright scraper for ${searchUrls.length} URL(s), max ${maxItems} items`);
  console.log(`[${label}] Search URLs:`, searchUrls);

  const listings = await runFundaScraper(searchUrls, maxItems);

  console.log(`[${label}] Scraper finished: ${listings.length} listing(s). Writing to ${csvPath}`);
  await writeCsv(csvPath, listings);

  return { runId, csvPath, count: listings.length };
}

async function handleStreetScraping(requestBody: StreetScrapingRequest) {
  const { city, streets } = requestBody;

  if (!streets || streets.length !== 5) {
    return NextResponse.json({ error: 'Exactly 5 streets must be provided' }, { status: 400 });
  }

  const citySlug = cityToSlug(city);
  const streetSlugs = streets.map(s => `${citySlug}/straat-${slugifyStreetName(s)}`);
  const selectedAreaParam = encodeURIComponent(JSON.stringify(streetSlugs));
  const availabilityParam = encodeURIComponent(JSON.stringify(['unavailable']));
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;

  const { runId } = await scrapeAndSave([searchUrl], 150, 'streets');

  return NextResponse.json({
    success: true,
    runId,
    datasetId: runId,
    downloadUrl: buildDownloadUrl(runId),
    message: 'Scraper completed successfully.',
  });
}

async function handleBuurtScraping(requestBody: BuurtScrapingRequest) {
  const { city, buurtSlugs } = requestBody;

  if (!buurtSlugs || buurtSlugs.length === 0) {
    return NextResponse.json({ error: 'At least one buurt must be provided' }, { status: 400 });
  }

  const invalidSlugs = buurtSlugs.filter(slug => !/^[a-z0-9-]+$/.test(slug));
  if (invalidSlugs.length > 0) {
    return NextResponse.json(
      { error: `Invalid buurt slugs: ${invalidSlugs.join(', ')}. Only a-z, 0-9, and - are allowed.` },
      { status: 400 }
    );
  }

  const citySlug = cityToSlug(city);
  const selectedAreas = buurtSlugs.map(slug => `${citySlug}/${slug}`);
  const selectedAreaParam = encodeURIComponent(JSON.stringify(selectedAreas));
  const availabilityParam = encodeURIComponent(JSON.stringify(['unavailable']));
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;

  const { runId } = await scrapeAndSave([searchUrl], 150, 'buurten');

  return NextResponse.json({
    success: true,
    runId,
    datasetId: runId,
    downloadUrl: buildDownloadUrl(runId),
    message: 'Scraper completed successfully.',
  });
}

async function handleWijkScraping(requestBody: WijkScrapingRequest) {
  const { city, wijkSlugs } = requestBody;

  if (!wijkSlugs || wijkSlugs.length !== 4) {
    return NextResponse.json({ error: 'Exactly 4 wijken must be provided' }, { status: 400 });
  }

  const citySlug = cityToSlug(city);
  const wijkAreaSlugs = wijkSlugs.map(s => `${citySlug}/${s}`);
  const selectedAreaParam = encodeURIComponent(JSON.stringify(wijkAreaSlugs));
  const availabilityParam = encodeURIComponent(JSON.stringify(['unavailable']));
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;

  const { runId } = await scrapeAndSave([searchUrl], 150, 'wijken');

  return NextResponse.json({
    success: true,
    runId,
    datasetId: runId,
    downloadUrl: buildDownloadUrl(runId),
    message: 'Scraper completed successfully.',
  });
}

export async function POST(request: NextRequest) {
  let requestBody: any;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  console.log('Received scraper request:', {
    hasBuurtSlugs: !!requestBody.buurtSlugs,
    hasWijkSlugs: !!requestBody.wijkSlugs,
    hasStreets: !!requestBody.streets,
    hasSearchUrls: !!requestBody.searchUrls,
    buurtSlugsCount: requestBody.buurtSlugs?.length ?? 0,
    wijkSlugsCount: requestBody.wijkSlugs?.length ?? 0,
    streetsCount: requestBody.streets?.length ?? 0,
  });

  try {
    if (requestBody.buurtSlugs && Array.isArray(requestBody.buurtSlugs)) {
      return await handleBuurtScraping(requestBody);
    }

    if (requestBody.wijkSlugs && Array.isArray(requestBody.wijkSlugs)) {
      return await handleWijkScraping(requestBody);
    }

    if (requestBody.streets && Array.isArray(requestBody.streets)) {
      return await handleStreetScraping(requestBody);
    }

    // Legacy fundaConfig format: { searchUrls, maxItems, ... }
    const { searchUrls, maxItems } = requestBody;
    if (!searchUrls || !Array.isArray(searchUrls) || searchUrls.length === 0) {
      return NextResponse.json({ error: 'Invalid configuration: searchUrls is required' }, { status: 400 });
    }

    const { runId } = await scrapeAndSave(searchUrls, maxItems ?? 150, 'fundaConfig');

    return NextResponse.json({
      success: true,
      runId,
      datasetId: runId,
      downloadUrl: buildDownloadUrl(runId),
      message: 'Scraper completed successfully. Dataset is ready to be fetched.',
    });

  } catch (error) {
    console.error('Error running Playwright scraper:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: message,
        details: error instanceof Error && process.env.NODE_ENV === 'development'
          ? { name: error.name, stack: error.stack }
          : undefined,
      },
      { status: 500 }
    );
  }
}
