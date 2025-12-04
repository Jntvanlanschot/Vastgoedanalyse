# Vercel Deployment Gids - Stap voor Stap

Deze gids helpt je de Vastgoedanalyse app te deployen op Vercel.

## ⚠️ Belangrijke Aandachtspunten

**Python Scripts op Vercel:**
- Vercel ondersteunt Python via serverless functions, maar je huidige setup gebruikt `spawn` om Python scripts te draaien
- Dit kan werken, maar vereist dat Python beschikbaar is in de runtime
- Alternatief: Python scripts omzetten naar serverless functions (later optioneel)

**Langlopende Processen:**
- Je hebt al `maxDuration: 300` ingesteld (5 minuten)
- Vercel Pro plan nodig voor functies > 10 seconden
- Gratis tier heeft 10 seconden limiet

## Stap 1: Project Voorbereiden

### 1.1 Zorg dat alles gecommit is
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push
```

### 1.2 Maak een `.vercelignore` bestand (optioneel)
```bash
# .vercelignore
node_modules/
.next/
venv/
__pycache__/
*.pyc
.env.local
archive/
```

## Stap 2: Vercel Project Aanmaken

### 2.1 Login op Vercel
1. Ga naar [vercel.com](https://vercel.com)
2. Login met je account
3. Klik op "Add New..." → "Project"

### 2.2 Importeer je Repository
- **Optie A: GitHub/GitLab**
  - Klik op "Import Git Repository"
  - Selecteer je repository
  - Vercel detecteert automatisch Next.js

- **Optie B: Upload Code**
  - Klik op "Deploy" → "Upload"
  - Upload je project folder (zonder node_modules)

### 2.3 Project Configuratie
- **Framework Preset**: Next.js (automatisch gedetecteerd)
- **Root Directory**: `/` (laat leeg als root)
- **Build Command**: `npm run build` (standaard)
- **Output Directory**: `.next` (standaard)
- **Install Command**: `npm install` (standaard)

## Stap 3: Environment Variables Instellen

### 3.1 Ga naar Project Settings
1. Klik op je project
2. Ga naar **Settings** → **Environment Variables**

### 3.2 Voeg de volgende variabelen toe:

#### Verplicht:
```
APIFY_API_TOKEN=je_apify_token_hier
```

#### Optioneel (maar aanbevolen):
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=je_google_maps_key
JWT_SECRET=een_willekeurige_geheime_sleutel_minimaal_32_karakters
API_KEY=een_willekeurige_api_key_voor_public_routes
NEXT_PUBLIC_BASE_URL=https://jouw-domein.vercel.app
```

### 3.3 Environment Selectie
- Selecteer voor alle variabelen: **Production**, **Preview**, en **Development**
- Klik op "Save"

### 3.4 JWT_SECRET genereren
Als je geen JWT_SECRET hebt, genereer er een:
```bash
# In terminal:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Kopieer de output en gebruik die als JWT_SECRET.

## Stap 4: Python Runtime Configureren

### 4.1 Maak een `vercel.json` bestand
Maak een nieuw bestand `vercel.json` in de root:

```json
{
  "buildCommand": "npm run build",
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 300
    }
  },
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/"
    }
  ]
}
```

### 4.2 Python Runtime Installeren
Vercel ondersteunt Python via buildpacks. Maak een `runtime.txt` in de root:

```
python-3.11
```

### 4.3 Python Dependencies
Zorg dat `apps/workflow-py/requirements.txt` bestaat en compleet is.

## Stap 5: Build Settings Aanpassen

### 5.1 In Vercel Dashboard
1. Ga naar **Settings** → **General**
2. Scroll naar **Build & Development Settings**

### 5.2 Aanpassingen:
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install && cd apps/workflow-py && pip install -r requirements.txt`

### 5.3 Node Version
- Zorg dat Node.js 20+ gebruikt wordt
- In **Settings** → **General** → **Node.js Version**: `20.x`

## Stap 6: Deployen

### 6.1 Eerste Deploy
1. Klik op **Deploy** in Vercel dashboard
2. Wacht tot de build klaar is (kan 5-10 minuten duren)
3. Check de build logs voor errors

### 6.2 Build Logs Controleren
- Als er Python errors zijn, check of alle dependencies in `requirements.txt` staan
- Als er timeout errors zijn, upgrade naar Vercel Pro plan

## Stap 7: Domein Koppelen

### 7.1 Domein Toevoegen
1. Ga naar **Settings** → **Domains**
2. Klik op **Add Domain**
3. Voer je domein in (bijv. `vastgoedanalyse.nl`)

### 7.2 DNS Configuratie
Vercel geeft je DNS instructies:

**Voor Root Domain (@):**
- Type: **A Record**
- Name: `@`
- Value: Vercel IP (wordt getoond, bijv. `76.76.21.21`)

**Voor WWW:**
- Type: **CNAME**
- Name: `www`
- Value: `cname.vercel-dns.com`

### 7.3 DNS Propagation
- Wacht 24-48 uur voor volledige propagatie
- Check met: `dig jouw-domein.nl` of online tools

### 7.4 SSL Certificate
- Vercel regelt automatisch SSL (HTTPS)
- Actief na DNS propagatie

## Stap 8: Testen

### 8.1 Test de App
1. Ga naar je Vercel URL: `https://jouw-project.vercel.app`
2. Test alle functionaliteit:
   - Address input
   - Funda scraper
   - Realworks upload
   - PDF/Excel download

### 8.2 Check Logs
- Ga naar **Deployments** → Klik op deployment → **Functions** tab
- Check voor errors in Python scripts

## Stap 9: Problemen Oplossen

### Probleem: Python niet gevonden
**Oplossing:**
- Zorg dat `runtime.txt` bestaat met `python-3.11`
- Check build logs voor Python installatie

### Probleem: Timeout errors
**Oplossing:**
- Upgrade naar Vercel Pro plan ($20/maand)
- Of optimaliseer Python scripts (cache, parallel processing)

### Probleem: File system errors
**Oplossing:**
- Vercel heeft read-only file system behalve `/tmp`
- Zorg dat alle file writes naar `/tmp` gaan
- Check `app/api/upload-realworks/route.ts` - gebruikt al `tmpdir()`

### Probleem: Python dependencies niet geïnstalleerd
**Oplossing:**
- Voeg build command toe: `pip install -r apps/workflow-py/requirements.txt`
- Of maak een `build.sh` script

## Stap 10: Automatische Deployments

### 10.1 Git Integration
- Vercel deployt automatisch bij elke `git push`
- **Production**: `main` branch
- **Preview**: andere branches

### 10.2 Environment Variables per Branch
- Je kunt verschillende env vars per branch instellen
- Handig voor development vs production

## Stap 11: Monitoring

### 11.1 Vercel Analytics
- Ga naar **Analytics** tab
- Zie real-time metrics

### 11.2 Function Logs
- Ga naar **Deployments** → **Functions**
- Real-time logs van serverless functions

### 11.3 Error Tracking
- Overweeg Sentry voor error tracking
- Vercel heeft integratie met Sentry

## Kosten Indicatie

### Vercel Hobby (Gratis)
- ✅ Onbeperkte deployments
- ✅ SSL certificaten
- ✅ 100GB bandwidth/maand
- ❌ 10 seconden function timeout
- ❌ Geen Python runtime support

### Vercel Pro ($20/maand)
- ✅ Alles van Hobby
- ✅ 300 seconden function timeout
- ✅ Python runtime support
- ✅ Priority support
- ✅ Team collaboration

**Aanbeveling:** Start met Pro plan voor Python support en langere timeouts.

## Alternatief: Python Scripts als Serverless Functions

Als Python spawn niet werkt, kun je Python scripts omzetten naar serverless functions:

1. Maak `api/python-workflow/route.py` (Python serverless function)
2. Roep aan vanuit Next.js API routes
3. Vereist Vercel Pro plan

## Checklist

- [ ] Repository gecommit en gepusht
- [ ] Environment variables ingesteld
- [ ] `vercel.json` aangemaakt
- [ ] `runtime.txt` aangemaakt (Python)
- [ ] Build settings gecontroleerd
- [ ] Eerste deploy succesvol
- [ ] Domein gekoppeld
- [ ] DNS geconfigureerd
- [ ] SSL actief
- [ ] App getest
- [ ] Monitoring ingesteld

## Support

- **Vercel Docs**: https://vercel.com/docs
- **Vercel Support**: support@vercel.com
- **Community**: https://github.com/vercel/vercel/discussions


