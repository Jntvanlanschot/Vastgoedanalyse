# ✅ Billing Actief - Volgende Stappen

## Billing is Nu Ingeschakeld! 🎉

Nu moet je ervoor zorgen dat alles correct is geconfigureerd en getest.

---

## Stap 1: Verifieer Billing Status

1. **Ga naar [Google Cloud Console Billing](https://console.cloud.google.com/billing)**
2. **Check of je project zichtbaar is**
3. **Check of status "Active" is**

Je zou moeten zien:
- ✅ Billing Account: [Naam]
- ✅ Status: Active
- ✅ Project: [Je project naam]

---

## Stap 2: Check API Key Restrictions

1. **Ga naar [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)**
2. **Klik op je API key**
3. **Check Application restrictions:**
   - Moet "HTTP referrers (web sites)" zijn
   - Moet bevatten:
     ```
     *.vercel.app/*
     https://*.vercel.app/*
     localhost:3000/*
     http://localhost:3000/*
     ```

4. **Check API restrictions:**
   - Moet bevatten:
     - ✅ Maps JavaScript API
     - ✅ Places API
     - ✅ Geocoding API

5. **Save** als je wijzigingen hebt gemaakt

---

## Stap 3: Verifieer Vercel Environment Variable

1. **Ga naar Vercel Dashboard → Je Project**
2. **Settings → Environment Variables**
3. **Check of `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` bestaat**
4. **Check of de waarde correct is**
5. **Check of alle environments zijn geselecteerd:**
   - ✅ Production
   - ✅ Preview
   - ✅ Development

---

## Stap 4: Redeploy op Vercel

**BELANGRIJK:** Na het inschakelen van billing moet je een redeploy doen!

### Optie A: Via Vercel Dashboard (Snelst)

1. **Ga naar Vercel Dashboard → Deployments**
2. **Klik op 3 dots (⋯) naast laatste deployment**
3. **Klik "Redeploy"**
4. **Wacht 2-5 minuten**

### Optie B: Via Git Push

```bash
git commit --allow-empty -m "Trigger redeploy after billing setup"
git push origin main
```

---

## Stap 5: Test op Vercel

1. **Wacht tot deployment klaar is** (2-5 minuten)
2. **Ga naar je Vercel URL:** `https://jouw-project.vercel.app`
3. **Open Developer Console (F12)**
4. **Check Console voor:**
   - ✅ "Google Maps API loaded successfully"
   - ✅ "API Key loaded: Yes"
   - ❌ Geen "BillingNotEnabledMapError" meer!

5. **Test functionaliteit:**
   - ✅ Address input (Google Maps autocomplete)
   - ✅ Formulier invullen
   - ✅ Realworks upload

---

## Stap 6: Test Lokaal (Optioneel)

Als je ook lokaal wilt testen:

1. **Maak `.env.local` in root:**
   ```env
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=je_google_maps_api_key_hier
   APIFY_API_TOKEN=je_apify_token_hier
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   ```

3. **Test op:** `http://localhost:3000`

---

## Troubleshooting

### ❌ "BillingNotEnabledMapError" blijft

**Oplossing:**
1. **Wacht 5-10 minuten** (kan even duren voordat billing actief is)
2. **Check Google Cloud Console** → Billing → Is project gelinkt?
3. **Redeploy op Vercel**
4. **Clear browser cache** (Ctrl+Shift+Delete)

### ❌ "This page can't load Google Maps correctly"

**Oplossing:**
1. Check API key restrictions → HTTP referrers
2. Zorg dat `*.vercel.app/*` is toegevoegd
3. Check of alle APIs zijn ingeschakeld
4. Redeploy op Vercel

### ❌ Google Maps werkt niet na redeploy

**Oplossing:**
1. Check Vercel build logs voor errors
2. Check browser console (F12) voor exacte error
3. Verifieer dat environment variable correct is ingesteld
4. Check Google Cloud Console → Billing → Status

---

## ✅ Checklist

- [ ] Billing account aangemaakt/linked
- [ ] Billing account gekoppeld aan project
- [ ] Status: Active in Google Cloud Console
- [ ] API key restrictions geconfigureerd (`*.vercel.app/*`)
- [ ] Maps JavaScript API ingeschakeld
- [ ] Places API ingeschakeld
- [ ] Geocoding API ingeschakeld
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Vercel environment variables
- [ ] Redeploy gedaan op Vercel
- [ ] Test op Vercel URL - werkt! ✅
- [ ] Geen billing errors meer! ✅

---

## 💰 Kosten Overzicht

**Je krijgt $200 gratis credits per maand:**

- Maps JavaScript API: $7 per 1000 loads
- Places API: $17 per 1000 requests
- Geocoding API: $5 per 1000 requests

**Voorbeeld gebruik:**
- 10,000 Maps loads = $70
- 5,000 Places requests = $85
- 10,000 Geocoding = $50
- **Totaal: ~$205** (net boven gratis tier, maar meestal blijf je eronder)

**Tip:** Stel een budget alert in bij $10 om te monitoren.

---

**Na deze stappen zou Google Maps op Vercel moeten werken! 🗺️**

**Test het en laat me weten of het werkt!**

