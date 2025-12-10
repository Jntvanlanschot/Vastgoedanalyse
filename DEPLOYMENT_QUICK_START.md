# 🚀 Vercel Deployment - Quick Start

## Stap 1: Vercel Account & Project Aanmaken

1. **Ga naar [vercel.com](https://vercel.com)** en login (of maak account aan)
2. **Klik op "Add New..." → "Project"**
3. **Importeer je GitHub repository:**
   - Klik op "Import Git Repository"
   - Selecteer `Jntvanlanschot/Vastgoedanalyse`
   - Vercel detecteert automatisch Next.js ✅

## Stap 2: Project Instellingen

Vercel detecteert automatisch:
- **Framework**: Next.js ✅
- **Build Command**: `npm run build` ✅
- **Output Directory**: `.next` ✅

**Aanpassen in Settings → General → Build & Development Settings:**
- **Install Command**: 
  ```
  npm install && cd apps/workflow-py && pip3 install -r requirements.txt
  ```
- **Node.js Version**: `20.x` (of hoger)

## Stap 3: Environment Variables

Ga naar **Settings → Environment Variables** en voeg toe:

### Verplicht:
```
APIFY_API_TOKEN=je_apify_token_hier
```

### Optioneel (maar aanbevolen):
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=je_google_maps_key
JWT_SECRET=genereer_met_onderstaande_command
API_KEY=een_willekeurige_api_key
```

**JWT_SECRET genereren:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Selecteer voor alle variabelen:** Production ✅, Preview ✅, Development ✅

## Stap 4: Eerste Deploy

1. **Klik op "Deploy"** in het Vercel dashboard
2. **Wacht 5-10 minuten** voor de build
3. **Check build logs** voor errors

## Stap 5: Python Runtime Fix (indien nodig)

Als Python niet werkt, pas `app/api/upload-realworks/route.ts` aan:

**Zoek regel 57:**
```typescript
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
```

**Verander naar:**
```typescript
const pythonCmd = 'python3'; // Vercel gebruikt altijd python3
```

## Stap 6: Domein Koppelen

1. **Ga naar Settings → Domains**
2. **Klik "Add Domain"**
3. **Voer je domein in** (bijv. `vastgoedanalyse.nl`)

### DNS Instellingen:

**Voor Root Domain (@):**
- Type: **A Record**
- Name: `@`
- Value: Vercel IP (wordt getoond in dashboard)

**Voor WWW:**
- Type: **CNAME**
- Name: `www`
- Value: `cname.vercel-dns.com`

**Wacht 24-48 uur** voor DNS propagatie. SSL wordt automatisch geregeld door Vercel.

## Stap 7: Testen

1. **Ga naar je Vercel URL:** `https://jouw-project.vercel.app`
2. **Test functionaliteit:**
   - ✅ Address input
   - ✅ Funda scraper
   - ✅ Realworks upload (MHTML)
   - ✅ PDF/Excel download

## ⚠️ Belangrijke Opmerkingen

### Vercel Plan Vereisten:
- **Gratis plan**: ❌ 10 seconden timeout (te kort voor Python scripts)
- **Pro plan ($20/maand)**: ✅ 300 seconden timeout (nodig voor jouw app)

**Je hebt Pro plan nodig** omdat:
- Python scripts kunnen lang duren
- Je hebt al `maxDuration: 300` ingesteld in `vercel.json`

### Python Dependencies:
- Zorg dat `apps/workflow-py/requirements.txt` compleet is
- Build command installeert automatisch via pip3

### File System:
- Vercel heeft read-only file system (behalve `/tmp`)
- Je code gebruikt al `tmpdir()` ✅ - dit is correct!

## Problemen Oplossen

### ❌ "Python not found"
**Oplossing:** Zorg dat `runtime.txt` bestaat met `python-3.11` ✅ (al aanwezig)

### ❌ Timeout errors
**Oplossing:** Upgrade naar Vercel Pro plan

### ❌ Build fails
**Oplossing:** Check build logs, zorg dat alle dependencies in `requirements.txt` staan

### ❌ Python scripts werken niet
**Oplossing:** 
1. Check of `python3` command werkt (pas route.ts aan)
2. Check build logs voor Python installatie
3. Zorg dat `apps/workflow-py/requirements.txt` compleet is

## Automatische Deployments

Na eerste deploy:
- ✅ Elke `git push` naar `main` = automatische production deploy
- ✅ Andere branches = preview deployments
- ✅ Pull requests = preview URL

## Checklist

- [ ] Vercel account aangemaakt
- [ ] GitHub repository geïmporteerd
- [ ] Build settings aangepast (pip3 install)
- [ ] Environment variables ingesteld
- [ ] Eerste deploy succesvol
- [ ] Python scripts werken (test upload)
- [ ] Domein gekoppeld
- [ ] DNS geconfigureerd
- [ ] App getest op live URL

## Support

- **Vercel Docs**: https://vercel.com/docs
- **Vercel Support**: support@vercel.com (Pro plan heeft priority support)
- **Build Logs**: Ga naar Deployments → Klik op deployment → Functions tab

---

**Klaar! 🎉** Je app zou nu live moeten staan op Vercel.


