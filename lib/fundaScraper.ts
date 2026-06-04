import { chromium, Page } from 'playwright';
import { createObjectCsvWriter } from 'csv-writer';

export interface FundaListing {
  'address/street_name': string;
  'address/house_number': string;
  'address/house_number_suffix': string;
  'address/postal_code': string;
  'address/city': string;
  'price/selling_price/0': string;
  'floor_area/0': string;
  'number_of_bedrooms': string;
  'number_of_rooms': string;
  'energy_label': string;
  'object_detail_page_relative_url': string;
  'address/latitude': string;
  'address/longitude': string;
  'address/neighbourhood': string;
}

function randomDelay(min: number, max: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));
}

/**
 * Recursively search __NEXT_DATA__ JSON for an array of listing-like objects.
 * Returns the first array whose items have both an address-like and price-like property.
 */
function findListingsInJson(data: unknown, depth = 0): any[] {
  if (depth > 8) return [];
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (first && typeof first === 'object') {
      const keys = Object.keys(first);
      const hasAddress = keys.some(k => /address|straat|street|adres/i.test(k));
      const hasPrice = keys.some(k => /price|prijs|koopprijs|asking/i.test(k));
      if (hasAddress || hasPrice) return data;
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    // Prefer high-signal keys first
    const preferred = ['hits', 'results', 'objects', 'items', 'listings', 'data', 'searchResult', 'search_result'];
    const obj = data as Record<string, unknown>;
    for (const key of preferred) {
      if (obj[key]) {
        const found = findListingsInJson(obj[key], depth + 1);
        if (found.length > 0) return found;
      }
    }
    for (const key of Object.keys(obj)) {
      if (preferred.includes(key)) continue;
      const found = findListingsInJson(obj[key], depth + 1);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function parseAddressString(text: string): { street: string; number: string; suffix: string } {
  // "Keizersgracht 100 A" or "Keizersgracht 100-A" or "Keizersgracht 100"
  const match = text.trim().match(/^(.+?)\s+(\d+)\s*[-–]?\s*([A-Za-z0-9]*)$/);
  if (match) {
    return { street: match[1].trim(), number: match[2].trim(), suffix: match[3].trim() };
  }
  return { street: text.trim(), number: '', suffix: '' };
}

function parsePostalCity(text: string): { postal: string; city: string } {
  const match = text.trim().match(/^(\d{4}\s*[A-Z]{2})\s+(.+)$/);
  if (match) {
    return { postal: match[1].replace(/\s+/, ' '), city: match[2].trim() };
  }
  return { postal: '', city: text.trim() };
}

/**
 * Map a raw object from __NEXT_DATA__ into a FundaListing.
 * Funda's JSON schema changes over time — this function handles the most common variants.
 */
function mapJsonListing(raw: any): FundaListing | null {
  if (!raw || typeof raw !== 'object') return null;

  // Address fields
  const addr = raw.address || raw.Address || raw.adres || {};
  const streetName =
    addr.street || addr.streetName || addr.straatnaam || raw.streetName || raw.street || '';
  const houseNumber =
    String(addr.houseNumber || addr.house_number || addr.huisnummer || raw.houseNumber || '');
  const suffix =
    addr.houseNumberAddition || addr.houseSuffix || addr.addition || raw.houseNumberAddition || '';
  const postalCode =
    addr.postalCode || addr.postal_code || addr.postcode || raw.postalCode || '';
  const city = addr.city || addr.plaats || addr.municipality || raw.city || '';

  // Price: try multiple shapes
  const priceObj = raw.price || raw.Price || raw.prijs || {};
  let price = '';
  if (typeof priceObj === 'number') {
    price = String(priceObj);
  } else if (typeof priceObj === 'object') {
    const val =
      priceObj.sellingPrice ??
      priceObj.selling_price ??
      priceObj.askingPrice ??
      priceObj.asking_price ??
      priceObj.value ??
      priceObj[0] ??
      null;
    price = val != null ? String(val) : '';
  } else if (typeof raw.sellingPrice === 'number') {
    price = String(raw.sellingPrice);
  } else if (typeof raw.askingPrice === 'number') {
    price = String(raw.askingPrice);
  }

  const floorArea =
    String(raw.floorArea || raw.floor_area || raw.woonoppervlak || raw.area || raw.livingArea || '');
  const bedrooms = String(raw.bedrooms || raw.numberOfBedrooms || raw.slaapkamers || '');
  const rooms = String(raw.rooms || raw.numberOfRooms || raw.kamers || '');
  const energyLabel = String(raw.energyLabel || raw.energy_label || raw.energieklasse || '').replace(/[^A-G]/g, '');

  // Detail URL
  const url = raw.url || raw.detailUrl || raw.detail_url || raw.objectDetailPageRelativeUrl || raw.href || '';
  const relUrl = typeof url === 'string' && url.startsWith('http')
    ? new URL(url).pathname
    : String(url);

  // Lat/lng
  const geo = raw.coordinates || raw.geo || raw.location || {};
  const lat = String(geo.latitude ?? geo.lat ?? raw.latitude ?? raw.lat ?? '');
  const lng = String(geo.longitude ?? geo.lng ?? geo.lon ?? raw.longitude ?? raw.lng ?? '');

  const neighbourhood = String(raw.neighbourhood || raw.buurt || addr.neighbourhood || '');

  return {
    'address/street_name': streetName,
    'address/house_number': houseNumber,
    'address/house_number_suffix': suffix,
    'address/postal_code': postalCode,
    'address/city': city,
    'price/selling_price/0': price,
    'floor_area/0': floorArea,
    'number_of_bedrooms': bedrooms,
    'number_of_rooms': rooms,
    'energy_label': energyLabel,
    'object_detail_page_relative_url': relUrl,
    'address/latitude': lat,
    'address/longitude': lng,
    'address/neighbourhood': neighbourhood,
  };
}

/**
 * Extract listings via DOM scraping (fallback when __NEXT_DATA__ doesn't work).
 *
 * Funda uses Next.js with SSR, so most content is in the initial HTML.
 * Selectors may need updating if Funda redesigns their pages.
 */
async function scrapeListingsFromDom(page: Page): Promise<FundaListing[]> {
  return await page.evaluate(() => {
    const results: any[] = [];

    // Try several card selectors in order of specificity
    const cardSelectors = [
      '[data-test-id="search-result-item"]',
      'div[class*="search-result-item"]',
      'article[class*="search-result"]',
      'a[href*="/koop/"][class*="result"]',
    ];

    let cards: Element[] = [];
    for (const sel of cardSelectors) {
      const found = Array.from(document.querySelectorAll(sel));
      if (found.length > 0) { cards = found; break; }
    }

    // If no cards found via specific selectors, look for any card-like anchors to detail pages
    if (cards.length === 0) {
      const links = Array.from(document.querySelectorAll('a[href*="/koop/"]'));
      // Deduplicate by href and take ones that look like property detail pages
      const seen = new Set<string>();
      cards = links.filter(a => {
        const href = (a as HTMLAnchorElement).href;
        if (seen.has(href)) return false;
        seen.add(href);
        // Property URLs look like /koop/{city}/{type}-{id}-{street}/
        return /\/koop\/.+\/.+-\d+-/.test(href);
      }).map(a => a.closest('div, article, section') || a).filter(Boolean) as Element[];
    }

    cards.forEach(card => {
      try {
        // Detail URL
        const anchor = (card.tagName === 'A' ? card : card.querySelector('a[href*="/koop/"]')) as HTMLAnchorElement | null;
        const href = anchor?.getAttribute('href') || '';
        if (!href) return;

        // Address line
        const addrSelectors = [
          '[data-test-id="street-name-house-number"]',
          'h2[class*="address"]',
          'h2',
          'h3',
          '[class*="address-title"]',
          '[class*="street"]',
        ];
        let streetText = '';
        for (const sel of addrSelectors) {
          const el = card.querySelector(sel);
          if (el?.textContent?.trim()) { streetText = el.textContent.trim(); break; }
        }

        // Parse "Keizersgracht 100 A"
        const addrMatch = streetText.match(/^(.+?)\s+(\d+)\s*[-–]?\s*([A-Za-z0-9]*)$/);
        const streetName = addrMatch ? addrMatch[1].trim() : streetText;
        const houseNumber = addrMatch ? addrMatch[2] : '';
        const houseSuffix = addrMatch ? addrMatch[3].trim() : '';

        // Postal code + city line
        const postalSelectors = [
          '[data-test-id="postal-code-city"]',
          '[class*="postal"]',
          '[class*="city"]',
        ];
        let postalText = '';
        for (const sel of postalSelectors) {
          const el = card.querySelector(sel);
          if (el?.textContent?.trim()) { postalText = el.textContent.trim(); break; }
        }
        const postalMatch = postalText.match(/^(\d{4}\s*[A-Z]{2})\s+(.+)$/);
        const postalCode = postalMatch ? postalMatch[1].replace(/\s+/, ' ') : '';
        const city = postalMatch ? postalMatch[2].trim() : '';

        // Price
        const priceSelectors = [
          '[data-test-id="price-sale"]',
          '[class*="price-sale"]',
          '[class*="asking-price"]',
          '[class*="price"]',
        ];
        let price = '';
        for (const sel of priceSelectors) {
          const el = card.querySelector(sel);
          if (el?.textContent) {
            const cleaned = el.textContent.replace(/[^\d]/g, '');
            if (cleaned.length >= 5) { price = cleaned; break; }
          }
        }

        // Floor area: look for m² pattern in card text
        const cardText = card.textContent || '';
        const areaMatch = cardText.match(/(\d+)\s*m[²2]/);

        // Bedrooms/rooms
        const bedroomMatch = cardText.match(/(\d+)\s*slaapkamer/i);
        const roomMatch = cardText.match(/(\d+)\s*kamer/i);

        // Energy label: single A-G letter in a dedicated element
        const energySelectors = [
          '[class*="energy-label"]',
          '[class*="EnergyLabel"]',
          '[class*="energylabel"]',
          '[aria-label*="energielabel"]',
          '[title*="Energielabel"]',
        ];
        let energyLabel = '';
        for (const sel of energySelectors) {
          const el = card.querySelector(sel);
          if (el) {
            const raw = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
            const m = raw.match(/^([A-G][+-]?)$/);
            if (m) { energyLabel = m[1]; break; }
          }
        }

        results.push({
          streetName,
          houseNumber,
          houseSuffix,
          postalCode,
          city,
          price,
          floorArea: areaMatch ? areaMatch[1] : '',
          bedrooms: bedroomMatch ? bedroomMatch[1] : '',
          rooms: roomMatch ? roomMatch[1] : '',
          energyLabel,
          href,
        });
      } catch {
        // skip individual card errors
      }
    });

    return results;
  }).then(raws =>
    raws.map(r => ({
      'address/street_name': r.streetName,
      'address/house_number': r.houseNumber,
      'address/house_number_suffix': r.houseSuffix,
      'address/postal_code': r.postalCode,
      'address/city': r.city,
      'price/selling_price/0': r.price,
      'floor_area/0': r.floorArea,
      'number_of_bedrooms': r.bedrooms,
      'number_of_rooms': r.rooms,
      'energy_label': r.energyLabel,
      'object_detail_page_relative_url': r.href,
      'address/latitude': '',
      'address/longitude': '',
      'address/neighbourhood': '',
    } satisfies FundaListing))
  );
}

/**
 * Try to get the next-page URL from the current page.
 */
async function getNextPageUrl(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const selectors = [
      '[data-test-id="pagination-next-button"] a',
      'a[rel="next"]',
      'a[aria-label="Volgende pagina"]',
      'a[aria-label="Next page"]',
      '[class*="pagination"] a[class*="next"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLAnchorElement | null;
      if (el?.href) return el.href;
    }
    return null;
  });
}

/**
 * Scrape Funda.nl listings from the given search URLs.
 *
 * Strategy:
 * 1. Try to read structured data from the page's __NEXT_DATA__ JSON.
 * 2. Fall back to DOM scraping.
 *
 * Note: Funda uses Cloudflare. A plain Playwright browser works for moderate
 * usage. For persistent blocks, install playwright-extra and the stealth plugin.
 */
export async function runFundaScraper(
  searchUrls: string[],
  maxItems = 150
): Promise<FundaListing[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    },
  });

  // Hide automation signals
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const listings: FundaListing[] = [];

  try {
    for (const startUrl of searchUrls) {
      if (listings.length >= maxItems) break;

      let currentUrl: string | null = startUrl;

      while (currentUrl && listings.length < maxItems) {
        const page = await context.newPage();
        try {
          console.log(`[fundaScraper] Navigating to: ${currentUrl}`);
          await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

          // Give JS a moment to hydrate
          await randomDelay(1500, 3000);

          // --- Strategy 1: __NEXT_DATA__ JSON ---
          let pageListings: FundaListing[] = [];

          const nextData = await page.evaluate(() => {
            const el = document.getElementById('__NEXT_DATA__');
            if (!el?.textContent) return null;
            try { return JSON.parse(el.textContent); } catch { return null; }
          });

          if (nextData) {
            const rawListings = findListingsInJson(nextData);
            if (rawListings.length > 0) {
              console.log(`[fundaScraper] __NEXT_DATA__ found ${rawListings.length} listing(s)`);
              pageListings = rawListings
                .map(mapJsonListing)
                .filter((l): l is FundaListing => l !== null);
            }
          }

          // --- Strategy 2: DOM scraping fallback ---
          if (pageListings.length === 0) {
            console.log('[fundaScraper] Falling back to DOM scraping');
            pageListings = await scrapeListingsFromDom(page);
            console.log(`[fundaScraper] DOM found ${pageListings.length} listing(s)`);
          }

          // Add to results up to maxItems
          for (const listing of pageListings) {
            if (listings.length >= maxItems) break;
            listings.push(listing);
          }

          // Find next page (only if we still need more)
          if (listings.length < maxItems) {
            currentUrl = await getNextPageUrl(page);
            if (currentUrl) {
              console.log(`[fundaScraper] Next page: ${currentUrl}`);
              await randomDelay(1500, 3000);
            }
          } else {
            currentUrl = null;
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[fundaScraper] Done. ${listings.length} listing(s) collected.`);
  return listings;
}

/** Write listings to a CSV file using the canonical column names expected by the pipeline. */
export async function writeCsv(filePath: string, listings: FundaListing[]): Promise<void> {
  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'address/street_name',              title: 'address/street_name' },
      { id: 'address/house_number',             title: 'address/house_number' },
      { id: 'address/house_number_suffix',      title: 'address/house_number_suffix' },
      { id: 'address/postal_code',              title: 'address/postal_code' },
      { id: 'address/city',                     title: 'address/city' },
      { id: 'price/selling_price/0',            title: 'price/selling_price/0' },
      { id: 'floor_area/0',                     title: 'floor_area/0' },
      { id: 'number_of_bedrooms',               title: 'number_of_bedrooms' },
      { id: 'number_of_rooms',                  title: 'number_of_rooms' },
      { id: 'energy_label',                     title: 'energy_label' },
      { id: 'object_detail_page_relative_url',  title: 'object_detail_page_relative_url' },
      { id: 'address/latitude',                 title: 'address/latitude' },
      { id: 'address/longitude',                title: 'address/longitude' },
      { id: 'address/neighbourhood',            title: 'address/neighbourhood' },
    ],
  });
  await csvWriter.writeRecords(listings as any);
}
