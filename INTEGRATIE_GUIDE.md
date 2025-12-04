# Integratie Guide: Vastgoedanalyse Tool koppelen aan je website

## Huidige Architectuur

De tool is een **Next.js applicatie** met:
- **JWT cookie-based authenticatie** (beschermt alle routes behalve `/api/login`, `/api/address`, etc.)
- **Main API endpoint**: `/api/upload-realworks` (POST) - vereist authenticatie
- **Download endpoint**: `/api/download-artifact` (GET) - vereist authenticatie
- **Max duration**: 5 minuten (300 seconden) voor workflow processing

---

## Integratie Opties

### **Optie 1: API Key Authenticatie (Aanbevolen voor externe websites)**

Maak een nieuwe API route die API key authenticatie gebruikt in plaats van cookies.

#### Stappen:

1. **Voeg API key authenticatie toe aan een nieuwe route**

```typescript
// app/api/upload-realworks-public/route.ts
import { NextRequest, NextResponse } from 'next/server';
// ... (importeer alle code van upload-realworks/route.ts)

export async function POST(request: NextRequest) {
  // API Key authenticatie
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  const validApiKey = process.env.API_KEY; // Voeg toe aan .env.local
  
  if (!validApiKey || apiKey !== validApiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // ... rest van de code van upload-realworks/route.ts
}
```

2. **Voeg API key toe aan `.env.local`**
```env
API_KEY=your-super-secret-api-key-here
```

3. **Gebruik vanaf je website:**

```javascript
// Vanaf je externe website
const formData = new FormData();

// Voeg reference data toe
formData.append('referenceData', JSON.stringify({
  address_full: 'Schipbeekstraat 40 2, Amsterdam',
  area_m2: 65,
  energy_label: 'C',
  bedrooms: 3,
  bathrooms: 1,
  rooms: 3,
  has_terrace: false,
  has_balcony: true,
  has_garden: false,
  sun_orientation: 'Zuid'
}));

// Voeg CSV data toe (Funda scraping resultaten)
formData.append('csvData', csvDataString);

// Voeg Realworks bestanden toe
for (let i = 0; i < realworksFiles.length; i++) {
  formData.append(`realworks_file_${i + 1}`, realworksFiles[i]);
}

// Verstuur request
const response = await fetch('https://jouw-domein.nl/api/upload-realworks-public', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-super-secret-api-key-here'
  },
  body: formData
});

const result = await response.json();

if (result.status === 'success') {
  // Download PDF
  const pdfUrl = `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.pdf}&apiKey=your-super-secret-api-key-here`;
  
  // Download Excel
  const excelUrl = `https://jouw-domein.nl/api/download-artifact-public?file=${result.artifacts.excel}&apiKey=your-super-secret-api-key-here`;
}
```

---

### **Optie 2: CORS + API Key (Voor frontend JavaScript)**

Maak publieke endpoints met CORS en API key authenticatie.

#### Stappen:

1. **Voeg CORS headers toe aan Next.js config**

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  // ... bestaande config
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://jouw-website.nl' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,X-API-Key' },
        ],
      },
    ];
  },
};
```

2. **Gebruik vanaf je website (JavaScript):**

```javascript
// Vanaf je externe website (client-side)
const response = await fetch('https://jouw-domein.nl/api/upload-realworks-public', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-super-secret-api-key-here',
    'Content-Type': 'multipart/form-data'
  },
  body: formData
});
```

**⚠️ Let op:** API keys in client-side JavaScript zijn zichtbaar voor iedereen. Overweeg een proxy endpoint op je eigen server.

---

### **Optie 3: Server-to-Server (Meest Veilig)**

Roep de API aan vanaf je eigen backend server.

#### Stappen:

1. **Maak een API route op je eigen server die de tool aanroept:**

```javascript
// Op je eigen server (Node.js/PHP/Python/etc.)
app.post('/api/analyze-property', async (req, res) => {
  const { referenceData, csvData, realworksFiles } = req.body;
  
  const formData = new FormData();
  formData.append('referenceData', JSON.stringify(referenceData));
  formData.append('csvData', csvData);
  
  // Voeg files toe
  realworksFiles.forEach((file, index) => {
    formData.append(`realworks_file_${index + 1}`, file.buffer, file.name);
  });
  
  // Roep de tool aan
  const response = await fetch('https://jouw-domein.nl/api/upload-realworks-public', {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.VASTGOEDTOOL_API_KEY // Server-side environment variable
    },
    body: formData
  });
  
  const result = await response.json();
  res.json(result);
});
```

2. **Gebruik vanaf je frontend:**

```javascript
// Vanaf je frontend
const response = await fetch('/api/analyze-property', {
  method: 'POST',
  body: JSON.stringify({ referenceData, csvData, realworksFiles })
});

const result = await response.json();
```

---

### **Optie 4: Embed als iframe (Snelste implementatie)**

Embed de hele tool in een iframe op je website.

#### Stappen:

1. **Maak een publieke pagina zonder authenticatie**

```typescript
// app/public-analysis/page.tsx
'use client';

// Kopieer de code van upload-realworks/page.tsx
// Maar verwijder alle authenticatie checks
```

2. **Voeg route toe aan public routes in middleware:**

```typescript
// middleware.ts
const publicRoutes = [
  '/login',
  '/api/login',
  '/public-analysis', // Voeg toe
  // ...
];
```

3. **Embed in je website:**

```html
<iframe 
  src="https://jouw-domein.nl/public-analysis" 
  width="100%" 
  height="800px"
  frameborder="0">
</iframe>
```

**⚠️ Nadeel:** Gebruikers zien de volledige interface, niet alleen jouw branding.

---

### **Optie 5: Webhook/Queue Systeem (Voor grote volumes)**

Voor asynchrone verwerking met webhooks.

#### Stappen:

1. **Maak een queue endpoint:**

```typescript
// app/api/queue-analysis/route.ts
export async function POST(request: NextRequest) {
  const { referenceData, csvData, realworksFiles, webhookUrl } = await request.json();
  
  // Sla request op in database/queue
  const jobId = await saveToQueue({ referenceData, csvData, realworksFiles, webhookUrl });
  
  // Start background job
  processAnalysisJob(jobId);
  
  return NextResponse.json({ jobId, status: 'queued' });
}

async function processAnalysisJob(jobId: string) {
  // Verwerk de analyse
  const result = await runAnalysis(/* ... */);
  
  // Stuur webhook
  await fetch(webhookUrl, {
    method: 'POST',
    body: JSON.stringify({ jobId, result })
  });
}
```

2. **Gebruik vanaf je website:**

```javascript
const response = await fetch('https://jouw-domein.nl/api/queue-analysis', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    referenceData,
    csvData,
    realworksFiles,
    webhookUrl: 'https://jouw-website.nl/api/webhook/analysis-complete'
  })
});

const { jobId } = await response.json();
```

---

## Aanbevolen Implementatie

Voor de meeste use cases raad ik **Optie 1 (API Key Authenticatie)** aan:

### Voordelen:
- ✅ Veilig (API key kan server-side worden opgeslagen)
- ✅ Flexibel (kan vanuit elke taal/platform worden aangeroepen)
- ✅ Geen CORS issues
- ✅ Volledige controle over de request/response

### Implementatie Stappen:

1. **Maak nieuwe publieke API routes met API key authenticatie**
2. **Voeg API key toe aan environment variables**
3. **Test de endpoints**
4. **Integreer in je website**

---

## Code Voorbeelden

### Volledige Implementatie: API Key Route

Zie `app/api/upload-realworks-public/route.ts` (te maken)

### Download Endpoint met API Key

```typescript
// app/api/download-artifact-public/route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('file');
  const apiKey = searchParams.get('apiKey');
  
  // Valideer API key
  if (apiKey !== process.env.API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // ... rest van download-artifact code
}
```

---

## Security Best Practices

1. **Gebruik HTTPS** voor alle API calls
2. **Roteer API keys** regelmatig
3. **Rate limiting** toevoegen aan publieke endpoints
4. **IP whitelisting** overwegen voor extra beveiliging
5. **Log alle API calls** voor monitoring

---

## Testen

```bash
# Test de API key endpoint
curl -X POST https://jouw-domein.nl/api/upload-realworks-public \
  -H "X-API-Key: your-api-key" \
  -F "referenceData=@reference.json" \
  -F "csvData=@data.csv" \
  -F "realworks_file_1=@file1.rtf"
```

---

## Vragen?

Als je hulp nodig hebt met een specifieke optie, laat het weten!


