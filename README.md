# Vastgoedanalyse - AI Real Estate Analysis

This is a [Next.js](https://nextjs.org) project for AI-powered real estate analysis using Funda property data.

## Features

- **Address Input**: Enter any Dutch address to get geocoded coordinates
- **Street Picker**: Interactive map to select 5 streets near the address for analysis
- **Funda Scraper**: Automated property data collection using Apify
- **CSV Export**: Download property data for further analysis

## Street Picker Implementation

The street picker uses two different approaches depending on configuration:

### GeoJSON Approach (Default)
- **Reliability**: Uses Overpass API to fetch street data as GeoJSON
- **Coverage**: Limited to ~1.2km radius around the address
- **Performance**: Fast and reliable for local street selection
- **Use Case**: When you need 100% reliable street selection near a specific address

### VectorGrid Approach (Optional)
- **Coverage**: Nationwide street network using vector tiles
- **Performance**: Efficient for large-scale interactions
- **Complexity**: Requires proper vector tile configuration and layer management
- **Use Case**: When you need to select streets across the entire Netherlands

### Configuration

Set the `NEXT_PUBLIC_USE_VECTORGRID=true` environment variable to enable VectorGrid mode. By default, the system uses the reliable GeoJSON approach.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
