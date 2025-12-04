# 🔄 Vercel Redeploy na Environment Variable Toevoegen

## Probleem
Je hebt een nieuwe API key toegevoegd in Vercel, maar de website detecteert deze niet.

## Oplossing: Redeploy Vereist

**Belangrijk:** Na het toevoegen van environment variables in Vercel moet je altijd een redeploy doen!

## Methode 1: Via Vercel Dashboard (Snelst)

1. **Ga naar je Vercel project**
2. **Klik op "Deployments"**
3. **Klik op de 3 dots (⋯) naast je laatste deployment**
4. **Klik "Redeploy"**
5. **Optioneel:** Vink "Use existing Build Cache" UIT voor een volledige rebuild
6. **Klik "Redeploy"**
7. **Wacht 2-5 minuten** tot deployment klaar is

## Methode 2: Via Git Push (Automatisch)

Push een kleine wijziging naar GitHub:

```bash
# Maak een kleine wijziging (bijv. comment toevoegen)
# Of gebruik deze commando's:
git commit --allow-empty -m "Trigger redeploy for environment variables"
git push origin main
```

Vercel detecteert automatisch de push en start een nieuwe deployment.

## Methode 3: Via Vercel CLI (Als je CLI hebt)

```bash
vercel --prod
```

## Check of Environment Variable Correct is

### In Vercel Dashboard:
1. **Settings → Environment Variables**
2. **Check of deze bestaat:**
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (met NEXT_PUBLIC_ prefix!)
   - `APIFY_API_TOKEN`
3. **Check of alle environments zijn geselecteerd:**
   - ✅ Production
   - ✅ Preview
   - ✅ Development

### Belangrijk:
- Variable naam moet EXACT zijn: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_` prefix is verplicht voor client-side variables
- Zonder deze prefix werkt het niet in de browser!

## Na Redeploy Testen

1. **Ga naar je Vercel URL**
2. **Open Developer Console (F12)**
3. **Check Console voor:**
   - ✅ "Google Maps API loaded successfully" = werkt!
   - ❌ "Google Maps API key not configured" = variable niet gevonden
   - ❌ "This page can't load Google Maps correctly" = API key restrictions probleem

## Als het nog steeds niet werkt

1. **Check browser console (F12)** voor exacte error
2. **Check Vercel build logs** voor errors tijdens build
3. **Check Google Cloud Console:**
   - Is API key correct?
   - Zijn HTTP referrers goed ingesteld (`*.vercel.app/*`)?
   - Zijn alle APIs ingeschakeld?

---

**Na redeploy zou de nieuwe API key moeten werken! 🎉**

