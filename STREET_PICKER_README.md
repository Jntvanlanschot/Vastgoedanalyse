# Street Picker Feature

## Overview

The Street Picker feature allows users to select exactly 5 streets near their address and run a Funda scraper to get property data for those specific streets.

## How it works

1. **Address Input**: User enters an address (currently using mock data)
2. **Map Display**: MapLibre map shows the Netherlands, then flies to the subject location
3. **Street Fetching**: Overpass API fetches nearby streets within ~1.5km radius
4. **Street Selection**: User clicks on street markers to select exactly 5 streets
5. **Scraper Execution**: Apify Funda scraper runs with the selected streets
6. **CSV Download**: Results are downloaded as `funda-streets.csv`

## Files Created

### Core Components
- `app/(valuation)/street-picker/page.tsx` - Main street picker page
- `components/StreetMapPicker.tsx` - MapLibre map component with street selection
- `lib/hooks/useSubject.ts` - Temporary hook for address data (replace with real implementation)

### API Routes
- `app/api/streets-overpass/route.ts` - Fetches nearby streets via Overpass API
- `app/api/run-scraper/route.ts` - Updated to handle street-based scraping

### Utilities
- `lib/funda/slug.ts` - Street name and city slugification functions
- `lib/funda/__tests__/slug.test.ts` - Unit tests for slug functions

## Technical Details

### Map Integration
- Uses MapLibre GL JS with OpenStreetMap tiles
- Initial view: Netherlands center (5.3, 52.2), zoom 6
- Flies to subject location at zoom 14
- Street markers are clickable circles with selection highlighting

### Street Data
- Fetched from Overpass API with bounding box ~1.5km around subject
- Filters for: residential, living_street, unclassified, service, tertiary, secondary, primary
- Deduplicated by street name (case-insensitive)
- Returns GeoJSON FeatureCollection with Point geometry

### Funda URL Generation
- City slug: `cityToSlug(city || "amsterdam")`
- Street slug: `slugifyStreetName(streetName)`
- Format: `"<citySlug>/straat-<streetSlug>"`
- Example: `"amsterdam/straat-damrak"`

### Apify Integration
- Uses existing actor ID: `69aVxdpQm6bIIJyNb`
- Polls every 5 seconds for completion
- Returns CSV file for direct download
- Handles FAILED/ABORTED/TIMED-OUT statuses

## Usage

1. Navigate to `/street-picker`
2. Map loads and flies to subject address
3. Click on street markers to select (max 5)
4. Selected streets appear as chips with remove buttons
5. Click "Run Scraper" when 5 streets are selected
6. Wait for completion and download CSV

## Environment Variables

Required:
- `APIFY_API_TOKEN` - Apify API token for scraper execution

## Testing

Run unit tests:
```bash
npm test
```

Manual testing flow:
1. Start dev server: `npm run dev`
2. Navigate to `http://localhost:3000/street-picker`
3. Verify map loads and flies to Amsterdam center
4. Click street markers to test selection
5. Verify scraper runs and downloads CSV

## Future Improvements

1. Replace mock `useSubject` hook with real address store
2. Add loading states for street fetching
3. Improve error handling and retry mechanisms
4. Add street name search/filtering
5. Implement responsive design for mobile
6. Add progress indicators for scraper execution


