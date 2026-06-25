import { NextRequest, NextResponse } from 'next/server';
import { cityToSlug, slugifyStreetName } from '@/lib/funda/slug';

export const maxDuration = 300;

const ACTOR_ID = 'isEqQn5XKtr3D3fRW';
const APIFY_BASE = 'https://api.apify.com/v2';

interface ApifyRunResponse {
  data: { id: string; status: string; defaultDatasetId: string };
}

interface ApifyRunStatus {
  data: { status: string; defaultDatasetId: string };
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

function buildDownloadUrl(runId: string, datasetId: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${base}/api/download-csv?runId=${runId}&datasetId=${datasetId}`;
}

async function apifyScrape(searchUrls: string[], maxItems: number, label: string) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN is not configured');

  // Input shape must match the actor's schema, otherwise the actor ignores
  // unknown fields and falls back to its defaults (scraping the wrong area).
  const body = {
    startUrls: searchUrls.map((url) => ({ url })),
    proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    includeNeighborhoodData: false,
    maxItems,
  };

  console.log(`[${label}] Starting Apify actor ${ACTOR_ID} for ${searchUrls.length} URL(s)`);

  const startRes = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(`Apify start failed (${startRes.status}): ${text}`);
  }

  const startData: ApifyRunResponse = await startRes.json();
  const runId = startData.data.id;
  const datasetId = startData.data.defaultDatasetId;

  console.log(`[${label}] Run started: runId=${runId} datasetId=${datasetId}`);

  // Poll every 5 s, max 50 attempts = 250 s (within 300 s maxDuration)
  const maxAttempts = 50;
  const pollInterval = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    if (!statusRes.ok) {
      console.warn(`[${label}] Status check failed on attempt ${attempt}`);
      continue;
    }

    const statusData: ApifyRunStatus = await statusRes.json();
    const status = statusData.data.status;
    console.log(`[${label}] Attempt ${attempt}: status=${status}`);

    if (status === 'SUCCEEDED') {
      return { runId, datasetId };
    }
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ended with status: ${status}`);
    }
  }

  throw Object.assign(new Error('Apify run timed out after 250 seconds'), { code: 'TIMEOUT', runId, datasetId });
}

async function handleStreetScraping(requestBody: StreetScrapingRequest) {
  const { city, streets } = requestBody;

  if (!streets || streets.length !== 5) {
    return NextResponse.json({ error: 'Exactly 5 streets must be provided' }, { status: 400 });
  }

  const citySlug = cityToSlug(city);
  const streetSlugs = streets.map(s => `${citySlug}/straat-${slugifyStreetName(s)}`);
  const selectedAreaParam = encodeURIComponent(JSON.stringify(['nl', ...streetSlugs]));
  const availabilityParam = encodeURIComponent(JSON.stringify(['negotiations', 'unavailable']));
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;

  const { runId, datasetId } = await apifyScrape([searchUrl], 150, 'streets');

  return NextResponse.json({
    success: true,
    runId,
    datasetId,
    downloadUrl: buildDownloadUrl(runId, datasetId),
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
  const selectedAreaParam = encodeURIComponent(JSON.stringify(['nl', ...selectedAreas]));
  const availabilityParam = encodeURIComponent(JSON.stringify(['negotiations', 'unavailable']));
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;

  const { runId, datasetId } = await apifyScrape([searchUrl], 150, 'buurten');

  return NextResponse.json({
    success: true,
    runId,
    datasetId,
    downloadUrl: buildDownloadUrl(runId, datasetId),
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
  const selectedAreaParam = encodeURIComponent(JSON.stringify(['nl', ...wijkAreaSlugs]));
  const availabilityParam = encodeURIComponent(JSON.stringify(['negotiations', 'unavailable']));
  const searchUrl = `https://www.funda.nl/zoeken/koop?selected_area=${selectedAreaParam}&availability=${availabilityParam}`;

  const { runId, datasetId } = await apifyScrape([searchUrl], 150, 'wijken');

  return NextResponse.json({
    success: true,
    runId,
    datasetId,
    downloadUrl: buildDownloadUrl(runId, datasetId),
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

    const { runId, datasetId } = await apifyScrape(searchUrls, maxItems ?? 150, 'fundaConfig');

    return NextResponse.json({
      success: true,
      runId,
      datasetId,
      downloadUrl: buildDownloadUrl(runId, datasetId),
      message: 'Scraper completed successfully.',
    });

  } catch (error: any) {
    console.error('Error running Apify scraper:', error);
    const message = error instanceof Error ? error.message : String(error);

    if (error?.code === 'TIMEOUT') {
      return NextResponse.json(
        { error: message, runId: error.runId, datasetId: error.datasetId },
        { status: 408 }
      );
    }

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
