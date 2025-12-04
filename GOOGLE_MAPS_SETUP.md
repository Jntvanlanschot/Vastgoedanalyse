# 🔧 Google Maps API Key Setup voor Vercel

## Probleem: "This page can't load Google Maps correctly"

Dit betekent dat de Google Maps API key niet correct is geconfigureerd. Hier is hoe je het oplost:

## Stap 1: Environment Variable in Vercel Instellen

1. **Ga naar je Vercel project**
2. **Klik op Settings → Environment Variables**
3. **Voeg toe:**
   - **Name**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - **Value**: Je Google Maps API key
   - **Selecteer**: Production ✅, Preview ✅, Development ✅
4. **Klik "Save"**

## Stap 2: Google Cloud Console Configureren

### 2.1 API Key Aanmaken/Controleren

1. **Ga naar [Google Cloud Console](https://console.cloud.google.com/)**
2. **Selecteer je project** (of maak een nieuw project aan)
3. **Ga naar "APIs & Services" → "Credentials"**
4. **Klik op je API key** (of maak een nieuwe aan)

### 2.2 Vereiste APIs Inschakelen

Zorg dat deze APIs zijn ingeschakeld:
- ✅ **Maps JavaScript API** (voor Places Autocomplete)
- ✅ **Places API** (voor address suggestions)
- ✅ **Geocoding API** (voor address → coordinates)

**Hoe in te schakelen:**
1. Ga naar "APIs & Services" → "Library"
2. Zoek en klik op elke API
3. Klik "Enable"

### 2.3 API Key Restrictions Instellen

**Belangrijk:** Je moet de API key configureren voor je Vercel domain.

#### Application Restrictions:
- **Selecteer**: "HTTP referrers (web sites)"
- **Voeg toe:**
  ```
  *.vercel.app/*
  jouw-domein.nl/*
  www.jouw-domein.nl/*
  localhost:3000/*
  ```

#### API Restrictions:
- **Selecteer**: "Restrict key"
- **Selecteer alleen:**
  - ✅ Maps JavaScript API
  - ✅ Places API
  - ✅ Geocoding API

**OF** (voor development):
- **Selecteer**: "Don't restrict key" (alleen voor testing!)

### 2.4 Billing Instellen

⚠️ **Belangrijk:** Google Maps vereist een billing account (maar heeft $200 gratis credits per maand)

1. Ga naar "Billing" in Google Cloud Console
2. Link een billing account
3. Je krijgt automatisch $200 gratis credits per maand

## Stap 3: Vercel Redeploy

Na het instellen van de environment variable:

1. **Ga naar je Vercel project**
2. **Klik op "Deployments"**
3. **Klik op de 3 dots (⋯) naast je laatste deployment**
4. **Klik "Redeploy"**
5. **Selecteer "Use existing Build Cache"** (optioneel)
6. **Klik "Redeploy"**

**OF** push een kleine wijziging naar GitHub (automatische redeploy)

## Stap 4: Testen

1. **Ga naar je live Vercel URL**
2. **Open Developer Console** (F12)
3. **Check Console voor errors:**
   - ✅ "Google Maps API loaded successfully" = werkt!
   - ❌ "Google Maps API key not configured" = environment variable niet ingesteld
   - ❌ "This page can't load Google Maps correctly" = API key restrictions of missing APIs

## Troubleshooting

### ❌ "API key not configured"
**Oplossing:**
- Check of `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is ingesteld in Vercel
- Check of je de deployment opnieuw hebt gedaan na het instellen
- Check of de variable naam exact klopt (case-sensitive!)

### ❌ "This page can't load Google Maps correctly"
**Oplossing:**
1. **Check API Restrictions:**
   - Ga naar Google Cloud Console → Credentials
   - Klik op je API key
   - Check "Application restrictions" → HTTP referrers
   - Zorg dat `*.vercel.app/*` is toegevoegd

2. **Check API Enablement:**
   - Ga naar APIs & Services → Library
   - Zorg dat Maps JavaScript API, Places API, en Geocoding API zijn ingeschakeld

3. **Check Billing:**
   - Zorg dat billing account is gelinkt
   - Check of je niet over je quota bent

### ❌ "RefererNotAllowedMapError"
**Oplossing:**
- Voeg je exacte Vercel URL toe aan HTTP referrers:
  ```
  https://jouw-project.vercel.app/*
  https://*.vercel.app/*
  ```

### ❌ API werkt lokaal maar niet op Vercel
**Oplossing:**
- Environment variables zijn case-sensitive
- Zorg dat de naam exact is: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- Redeploy na het instellen van environment variables

## Code Check

De code gebruikt:
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `components/GooglePlacesAutocomplete.tsx`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `app/api/address/route.ts`
- `GOOGLE_MAPS_API_KEY` in `lib/neighbourhoodFinder.ts` (zonder NEXT_PUBLIC_)

**Let op:** `NEXT_PUBLIC_` prefix betekent dat de variable beschikbaar is in de browser. Zonder deze prefix is het alleen server-side.

## Kosten

Google Maps heeft een gratis tier:
- **$200 gratis credits per maand**
- Maps JavaScript API: $7 per 1000 loads
- Places API: $17 per 1000 requests
- Geocoding API: $5 per 1000 requests

Voor de meeste apps is dit ruim voldoende!

## Checklist

- [ ] Google Cloud Console project aangemaakt
- [ ] Maps JavaScript API ingeschakeld
- [ ] Places API ingeschakeld
- [ ] Geocoding API ingeschakeld
- [ ] API key aangemaakt
- [ ] HTTP referrers geconfigureerd (met *.vercel.app/*)
- [ ] Billing account gelinkt
- [ ] `NEXT_PUBLE_GOOGLE_MAPS_API_KEY` ingesteld in Vercel
- [ ] Vercel deployment opnieuw gedaan
- [ ] Getest op live URL

---

**Na deze stappen zou Google Maps moeten werken! 🗺️**

