# 🔑 Vercel Environment Variables - Complete Overzicht

## Hoe Environment Variables Werken op Vercel

### Belangrijk Concept: `NEXT_PUBLIC_` Prefix

In Next.js zijn er **twee soorten** environment variables:

1. **Server-side only** (zonder `NEXT_PUBLIC_`):
   - Alleen beschikbaar in API routes en server components
   - **NIET** zichtbaar in de browser
   - Veiliger voor secrets

2. **Client-side** (met `NEXT_PUBLIC_` prefix):
   - Beschikbaar in de browser (client-side code)
   - Wordt ingebouwd in de JavaScript bundle
   - **ZICHTBAAR** voor iedereen die de code bekijkt
   - Gebruik alleen voor publieke keys (zoals Google Maps API key)

### Hoe Vercel Environment Variables Werkt

1. **Je voegt variables toe** in Vercel Dashboard → Settings → Environment Variables
2. **Vercel injecteert ze** tijdens de build
3. **Next.js maakt ze beschikbaar** via `process.env.VARIABLE_NAME`
4. **Na wijziging:** Je MOET een redeploy doen (nieuwe build nodig)

---

## 📋 Alle Environment Variables Volgens de Code

### ✅ Verplicht (Moet je instellen)

#### 1. `APIFY_API_TOKEN`
- **Waar gebruikt:** `app/api/run-scraper/route.ts`, `app/api/download-csv/route.ts`
- **Type:** Server-side only (geen `NEXT_PUBLIC_`)
- **Doel:** Funda scraper API token
- **Hoe te krijgen:** [Apify.com](https://apify.com) → Account → API Tokens

```env
APIFY_API_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxx
```

**In Vercel:**
- Name: `APIFY_API_TOKEN`
- Value: Je Apify API token
- Environments: ✅ Production, ✅ Preview, ✅ Development

---

### 🗺️ Google Maps (Optioneel maar Aanbevolen)

#### 2. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- **Waar gebruikt:** 
  - `components/GooglePlacesAutocomplete.tsx` (client-side)
  - `app/api/address/route.ts` (server-side)
  - `lib/neighbourhoodFinder.ts` (server-side, fallback naar `GOOGLE_MAPS_API_KEY`)
- **Type:** Client-side (met `NEXT_PUBLIC_` prefix!)
- **Doel:** Google Maps API voor address autocomplete en geocoding
- **Hoe te krijgen:** [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**In Vercel:**
- Name: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (exact deze naam!)
- Value: Je Google Maps API key
- Environments: ✅ Production, ✅ Preview, ✅ Development

**⚠️ Belangrijk:**
- Moet `NEXT_PUBLIC_` prefix hebben (anders werkt het niet in browser)
- Moet in Google Cloud Console geconfigureerd zijn met HTTP referrers: `*.vercel.app/*`

#### 3. `GOOGLE_MAPS_API_KEY` (Fallback)
- **Waar gebruikt:** `lib/neighbourhoodFinder.ts` (fallback als `NEXT_PUBLIC_` niet bestaat)
- **Type:** Server-side only
- **Doel:** Fallback voor server-side geocoding
- **Niet verplicht** als je `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` hebt

---

### 🔐 Authentication (Optioneel)

#### 4. `AUTH_SECRET`
- **Waar gebruikt:** `lib/auth/jwt.ts`
- **Type:** Server-side only
- **Doel:** JWT signing secret
- **Hoe te genereren:**
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

```env
AUTH_SECRET=een_willekeurige_geheime_sleutel_minimaal_32_karakters
```

#### 5. `AUTH_USERNAME`
- **Waar gebruikt:** `lib/auth/guard.ts`
- **Type:** Server-side only
- **Doel:** Login username (als je authentication gebruikt)

#### 6. `AUTH_PASSWORD`
- **Waar gebruikt:** `lib/auth/guard.ts`
- **Type:** Server-side only
- **Doel:** Login password (als je authentication gebruikt)

---

### 🌐 Public API (Optioneel)

#### 7. `API_KEY`
- **Waar gebruikt:** 
  - `app/api/upload-realworks-public/route.ts`
  - `app/api/download-artifact-public/route.ts`
- **Type:** Server-side only
- **Doel:** API key voor publieke endpoints (als je externe integratie wilt)
- **Hoe te genereren:** Willekeurige string, minimaal 32 karakters

```env
API_KEY=een_willekeurige_api_key_voor_public_routes_minimaal_32_karakters
```

---

### 🔗 Base URL (Optioneel)

#### 8. `NEXT_PUBLIC_BASE_URL`
- **Waar gebruikt:** `app/api/run-scraper/route.ts`
- **Type:** Client-side (met `NEXT_PUBLIC_` prefix)
- **Doel:** Base URL voor API calls (default: `http://localhost:3000`)

```env
NEXT_PUBLIC_BASE_URL=https://jouw-project.vercel.app
```

**In Vercel:**
- Name: `NEXT_PUBLIC_BASE_URL`
- Value: `https://jouw-project.vercel.app` (of je custom domain)
- Environments: ✅ Production, ✅ Preview, ✅ Development

---

### 🗺️ Vector Tiles (Optioneel)

#### 9. `NEXT_PUBLIC_VTILES_URL`
- **Waar gebruikt:** `components/StreetVectorLayer.tsx`
- **Type:** Client-side
- **Doel:** Custom vector tiles URL (default: OpenFreeMap)

```env
NEXT_PUBLIC_VTILES_URL=https://tiles.openfreemap.org/omt/{z}/{x}/{y}.pbf
```

#### 10. `NEXT_PUBLIC_USE_VECTORGRID`
- **Waar gebruikt:** `components/StreetMapPicker.tsx`
- **Type:** Client-side
- **Doel:** Enable/disable vector grid (default: false)

```env
NEXT_PUBLIC_USE_VECTORGRID=true
```

---

## 📝 Vercel Setup Checklist

### Stap 1: Ga naar Environment Variables
1. Vercel Dashboard → Je Project
2. Settings → Environment Variables

### Stap 2: Voeg Variables Toe

**Minimaal Vereist:**
```
✅ APIFY_API_TOKEN
✅ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (als je Google Maps wilt)
```

**Optioneel maar Aanbevolen:**
```
✅ API_KEY (voor public endpoints)
✅ AUTH_SECRET (voor JWT)
✅ NEXT_PUBLIC_BASE_URL (voor correcte API URLs)
```

### Stap 3: Configureer Environments

Voor elke variable:
- ✅ **Production** (live website)
- ✅ **Preview** (preview deployments)
- ✅ **Development** (local development)

### Stap 4: Redeploy

**BELANGRIJK:** Na het toevoegen/wijzigen van environment variables:

1. Ga naar **Deployments**
2. Klik op **3 dots (⋯)** naast laatste deployment
3. Klik **"Redeploy"**
4. Wacht tot klaar (2-5 minuten)

**OF** push een wijziging naar GitHub (automatische redeploy)

---

## 🔍 Hoe Checken of Variables Werken

### Lokaal (Development)

Maak `.env.local` bestand in root:
```env
APIFY_API_TOKEN=je_token_hier
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=je_key_hier
```

Herstart dev server:
```bash
npm run dev
```

### Op Vercel

1. **Check browser console (F12):**
   - Open je Vercel URL
   - F12 → Console tab
   - Zoek naar: `API Key loaded: Yes` of errors

2. **Check build logs:**
   - Vercel Dashboard → Deployments
   - Klik op deployment → Functions tab
   - Check voor errors

3. **Test functionaliteit:**
   - Google Maps autocomplete werkt?
   - Funda scraper werkt?
   - Realworks upload werkt?

---

## ⚠️ Veel Voorkomende Fouten

### ❌ "API key not configured"

**Oorzaak:**
- Variable niet ingesteld in Vercel
- Verkeerde naam (bijv. `GOOGLE_MAPS_API_KEY` i.p.v. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
- Geen redeploy gedaan na toevoegen

**Oplossing:**
1. Check variable naam (moet EXACT zijn)
2. Check of variable bestaat in Vercel
3. Doe redeploy

### ❌ Variable werkt lokaal maar niet op Vercel

**Oorzaak:**
- `NEXT_PUBLIC_` prefix ontbreekt (voor client-side variables)
- Geen redeploy gedaan
- Variable niet ingesteld voor Production environment

**Oplossing:**
1. Check of variable `NEXT_PUBLIC_` prefix heeft (als het client-side moet zijn)
2. Check of Production environment is geselecteerd
3. Doe redeploy

### ❌ "This page can't load Google Maps correctly"

**Oorzaak:**
- Google Maps API key restrictions niet goed
- HTTP referrers niet geconfigureerd voor `*.vercel.app/*`
- APIs niet ingeschakeld in Google Cloud Console

**Oplossing:**
1. Google Cloud Console → Credentials → API Key
2. Application restrictions → HTTP referrers
3. Voeg toe: `*.vercel.app/*`
4. Check of Maps JavaScript API, Places API, Geocoding API zijn ingeschakeld

---

## 📊 Overzicht Tabel

| Variable Name | Type | Waar Gebruikt | Verplicht? |
|--------------|------|---------------|------------|
| `APIFY_API_TOKEN` | Server | Funda scraper | ✅ Ja |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Client | Google Maps | ⚠️ Aanbevolen |
| `GOOGLE_MAPS_API_KEY` | Server | Fallback geocoding | ❌ Nee |
| `API_KEY` | Server | Public API | ❌ Nee |
| `AUTH_SECRET` | Server | JWT signing | ❌ Nee |
| `AUTH_USERNAME` | Server | Login | ❌ Nee |
| `AUTH_PASSWORD` | Server | Login | ❌ Nee |
| `NEXT_PUBLIC_BASE_URL` | Client | API URLs | ❌ Nee |
| `NEXT_PUBLIC_VTILES_URL` | Client | Vector tiles | ❌ Nee |
| `NEXT_PUBLIC_USE_VECTORGRID` | Client | Vector grid | ❌ Nee |

---

## 🎯 Quick Start voor Vercel

**Minimaal wat je nodig hebt:**

1. **APIFY_API_TOKEN** (verplicht voor Funda scraper)
2. **NEXT_PUBLIC_GOOGLE_MAPS_API_KEY** (aanbevolen voor address autocomplete)

**Stappen:**
1. Vercel → Settings → Environment Variables
2. Voeg beide toe met exacte namen
3. Selecteer alle environments (Production, Preview, Development)
4. Save
5. Redeploy
6. Test!

---

**Succes! 🚀**

