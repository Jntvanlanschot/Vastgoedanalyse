# 🚀 Complete Setup Gids - Alles Werkend Krijgen

Deze gids helpt je stap voor stap om de hele applicatie lokaal en op Vercel werkend te krijgen.

## ⚠️ Probleem: PowerShell Execution Policy

Als je deze error ziet:
```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled
```

**Oplossing:**

1. **Open PowerShell als Administrator** (rechtsklik → "Run as Administrator")
2. **Run dit commando:**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
3. **Type "Y" en druk Enter**
4. **Sluit PowerShell en open opnieuw**

## 📋 Stap 1: Lokaal Development Server Opstarten

### 1.1 PowerShell Execution Policy Fixen (zie boven)

### 1.2 Navigeer naar Project Folder
```powershell
cd "C:\Users\meesv\OneDrive\Documenten\04_Ander Werk\_Vastgoedtool\30 oktober 2025\Vastgoedanalyse"
```

### 1.3 Check Node.js en npm
```powershell
node --version
npm --version
```
**Moet zijn:** Node.js 20+ en npm 9+

### 1.4 Installeer Dependencies
```powershell
npm install
```

### 1.5 Start Development Server
```powershell
npm run dev
```

**Je zou moeten zien:**
```
▲ Next.js 15.5.4
- Local:        http://localhost:3000
```

### 1.6 Open Browser
Ga naar: `http://localhost:3000`

---

## 📋 Stap 2: Google Maps API Key Instellen (Lokaal)

### 2.1 Maak `.env.local` Bestand

Maak een nieuw bestand `.env.local` in de root van je project:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=je_google_maps_api_key_hier
APIFY_API_TOKEN=je_apify_token_hier
```

### 2.2 Google Maps API Key Aanmaken

1. **Ga naar [Google Cloud Console](https://console.cloud.google.com/)**
2. **Maak een nieuw project** (of selecteer bestaand)
3. **Ga naar "APIs & Services" → "Library"**
4. **Schakel in:**
   - ✅ Maps JavaScript API
   - ✅ Places API
   - ✅ Geocoding API
5. **Ga naar "APIs & Services" → "Credentials"**
6. **Klik "Create Credentials" → "API Key"**
7. **Kopieer de API key**
8. **Klik op de API key om te bewerken:**
   - **Application restrictions:** HTTP referrers
   - **Voeg toe:**
     ```
     localhost:3000/*
     http://localhost:3000/*
     https://localhost:3000/*
     ```
   - **API restrictions:** Selecteer alleen:
     - Maps JavaScript API
     - Places API
     - Geocoding API
9. **Save**

### 2.3 Plak API Key in `.env.local`

Vervang `je_google_maps_api_key_hier` met je echte API key.

### 2.4 Herstart Development Server

Stop de server (Ctrl+C) en start opnieuw:
```powershell
npm run dev
```

---

## 📋 Stap 3: Python Dependencies (Lokaal - Optioneel)

Als je Python scripts lokaal wilt testen:

### 3.1 Check Python
```powershell
python --version
```
**Moet zijn:** Python 3.11+

### 3.2 Installeer Python Dependencies
```powershell
cd apps/workflow-py
pip install -r requirements.txt
cd ../..
```

---

## 📋 Stap 4: Vercel Deployment

### 4.1 Vercel Account & Project

1. **Ga naar [vercel.com](https://vercel.com)**
2. **Login** (of maak account aan)
3. **Klik "Add New..." → "Project"**
4. **Importeer GitHub repository:**
   - Klik "Import Git Repository"
   - Selecteer `Jntvanlanschot/Vastgoedanalyse`
   - Vercel detecteert automatisch Next.js ✅

### 4.2 Environment Variables in Vercel

1. **Ga naar je project → Settings → Environment Variables**
2. **Voeg toe:**

   **Verplicht:**
   ```
   Name: APIFY_API_TOKEN
   Value: je_apify_token_hier
   ```

   **Voor Google Maps:**
   ```
   Name: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
   Value: je_google_maps_api_key_hier
   ```

3. **Voor elke variable:**
   - ✅ Production
   - ✅ Preview
   - ✅ Development

4. **Klik "Save"**

### 4.3 Google Cloud Console - Vercel Domain Toevoegen

1. **Ga naar Google Cloud Console → Credentials**
2. **Klik op je API key**
3. **Application restrictions → HTTP referrers**
4. **Voeg toe:**
   ```
   *.vercel.app/*
   https://*.vercel.app/*
   jouw-domein.nl/*
   www.jouw-domein.nl/*
   ```
5. **Save**

### 4.4 Build Settings (Optioneel)

Als er geen "Install Command" veld is, is dat OK. De `vercel.json` en `package.json` regelen dit automatisch.

**Check wel:**
- Settings → General → Node.js Version: `20.x` (of hoger)

### 4.5 Eerste Deploy

1. **Klik "Deploy"** in Vercel dashboard
2. **Wacht 5-10 minuten**
3. **Check build logs** voor errors

### 4.6 Redeploy na Environment Variables

Na het instellen van environment variables:

1. **Ga naar Deployments**
2. **Klik op 3 dots (⋯) naast laatste deployment**
3. **Klik "Redeploy"**
4. **Wacht tot klaar**

---

## 📋 Stap 5: Testen

### 5.1 Lokaal Testen

1. **Open:** `http://localhost:3000`
2. **Test:**
   - ✅ Adres input (Google Maps autocomplete)
   - ✅ Formulier invullen
   - ✅ Realworks upload (MHTML bestand)

### 5.2 Vercel Testen

1. **Ga naar je Vercel URL:** `https://jouw-project.vercel.app`
2. **Test hetzelfde als lokaal**
3. **Check browser console (F12)** voor errors

---

## 🔧 Troubleshooting

### ❌ "npm run dev" werkt niet

**Probleem:** PowerShell execution policy

**Oplossing:**
```powershell
# Run als Administrator:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### ❌ "Google Maps API key not configured"

**Lokaal:**
- Check of `.env.local` bestaat
- Check of variable naam exact is: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- Herstart dev server na toevoegen van `.env.local`

**Vercel:**
- Check of environment variable is ingesteld
- Check of je deployment opnieuw hebt gedaan na toevoegen
- Check browser console voor exacte error

### ❌ "This page can't load Google Maps correctly"

**Oplossing:**
1. Check Google Cloud Console → Credentials
2. Check HTTP referrers:
   - Lokaal: `localhost:3000/*`
   - Vercel: `*.vercel.app/*`
3. Check of Maps JavaScript API, Places API, en Geocoding API zijn ingeschakeld
4. Check of billing account is gelinkt

### ❌ Build fails op Vercel

**Check build logs:**
- Als Python error: Python dependencies worden automatisch geïnstalleerd via `vercel.json`
- Als npm error: Check of alle dependencies in `package.json` staan
- Als timeout: Upgrade naar Vercel Pro plan ($20/maand)

### ❌ Python scripts werken niet op Vercel

**Oplossing:**
- Code is al gefixt om `python3` te gebruiken op Vercel
- Check build logs voor Python errors
- Zorg dat `apps/workflow-py/requirements.txt` compleet is

---

## ✅ Checklist

### Lokaal:
- [ ] PowerShell execution policy gefixt
- [ ] Node.js 20+ geïnstalleerd
- [ ] `npm install` gedraaid
- [ ] `.env.local` aangemaakt met API keys
- [ ] `npm run dev` werkt
- [ ] Website laadt op `localhost:3000`
- [ ] Google Maps autocomplete werkt

### Vercel:
- [ ] Vercel account aangemaakt
- [ ] GitHub repository geïmporteerd
- [ ] Environment variables ingesteld:
  - [ ] `APIFY_API_TOKEN`
  - [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- [ ] Google Cloud Console:
  - [ ] Maps JavaScript API ingeschakeld
  - [ ] Places API ingeschakeld
  - [ ] Geocoding API ingeschakeld
  - [ ] HTTP referrers geconfigureerd (`*.vercel.app/*`)
  - [ ] Billing account gelinkt
- [ ] Eerste deployment succesvol
- [ ] Redeploy gedaan na environment variables
- [ ] Website werkt op Vercel URL
- [ ] Google Maps werkt op Vercel

---

## 🆘 Hulp Nodig?

Als iets niet werkt:

1. **Check browser console (F12)** voor errors
2. **Check Vercel build logs** voor deployment errors
3. **Check Google Cloud Console** voor API errors
4. **Check terminal output** voor local errors

**Veel voorkomende problemen:**
- Environment variables niet correct ingesteld
- Google Maps API key restrictions niet goed
- PowerShell execution policy niet gefixt
- Node.js versie te oud

---

**Succes! 🎉**



