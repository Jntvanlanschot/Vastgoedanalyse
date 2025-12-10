# 🏠 Localhost vs Vercel - Google Maps Billing Uitleg

## Waarom werkt het lokaal maar niet op Vercel?

### Localhost (Development)
- ✅ **Geen billing vereist** voor development/testing
- ✅ Google Maps werkt gratis op `localhost`
- ✅ Perfect voor lokaal testen

### Vercel (Production)
- ⚠️ **Billing vereist** voor production domains
- ⚠️ Google Maps vereist billing voor `*.vercel.app` en custom domains
- ⚠️ Dit is Google's policy voor production gebruik

---

## Hoe Localhost Werkt

Google Maps heeft een **special exception** voor localhost:
- `localhost:3000/*` werkt zonder billing
- `127.0.0.1:3000/*` werkt zonder billing
- Dit is bedoeld voor development/testing

---

## Localhost Configureren

### Stap 1: Google Cloud Console - API Key Restrictions

1. **Ga naar [Google Cloud Console](https://console.cloud.google.com/)**
2. **APIs & Services → Credentials**
3. **Klik op je API key**
4. **Application restrictions → HTTP referrers**
5. **Voeg toe:**
   ```
   localhost:3000/*
   http://localhost:3000/*
   https://localhost:3000/*
   127.0.0.1:3000/*
   http://127.0.0.1:3000/*
   ```
6. **Save**

### Stap 2: Local .env.local Bestand

Maak `.env.local` in de root van je project:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=je_google_maps_api_key_hier
APIFY_API_TOKEN=je_apify_token_hier
```

### Stap 3: Start Local Development Server

```bash
npm run dev
```

### Stap 4: Test Localhost

1. **Ga naar:** `http://localhost:3000`
2. **Open Developer Console (F12)**
3. **Check voor:** "Google Maps API loaded successfully"
4. **Test address autocomplete**

---

## Waarom Billing op Vercel?

Google Maps heeft twee tiers:

### Development Tier (Gratis)
- ✅ Localhost domains
- ✅ Geen billing vereist
- ✅ Perfect voor testing

### Production Tier (Billing Vereist)
- ⚠️ Alle andere domains (inclusief `*.vercel.app`)
- ⚠️ Billing account vereist
- ⚠️ $200 gratis credits per maand

**Dit is Google's policy** - ze willen voorkomen dat mensen gratis production apps maken zonder limiet.

---

## Oplossing: Test Lokaal, Deploy naar Vercel

### Workflow:

1. **Development (Lokaal):**
   - Test alles op `localhost:3000`
   - Geen billing nodig
   - Snel itereren

2. **Production (Vercel):**
   - Deploy naar Vercel voor live gebruik
   - Billing account vereist
   - $200 gratis credits per maand

---

## Localhost Setup Checklist

- [ ] `.env.local` bestand aangemaakt in root
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` toegevoegd aan `.env.local`
- [ ] Google Cloud Console → API Key → HTTP referrers
- [ ] `localhost:3000/*` toegevoegd aan HTTP referrers
- [ ] `npm run dev` gestart
- [ ] Test op `http://localhost:3000`
- [ ] Google Maps werkt lokaal ✅

---

## Troubleshooting Localhost

### ❌ "Google Maps API key not configured"

**Oplossing:**
- Check of `.env.local` bestaat
- Check of variable naam exact is: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- Herstart dev server na toevoegen van `.env.local`

### ❌ "This page can't load Google Maps correctly" (lokaal)

**Oplossing:**
- Check Google Cloud Console → API Key → HTTP referrers
- Zorg dat `localhost:3000/*` is toegevoegd
- Check of Maps JavaScript API, Places API, Geocoding API zijn ingeschakeld

### ❌ Localhost werkt maar Vercel niet

**Dit is normaal!** Vercel vereist billing, localhost niet.

**Oplossing voor Vercel:**
- Zie `GOOGLE_BILLING_SETUP.md` voor billing setup
- Of test alleen lokaal voor development

---

## Samenvatting

| Environment | Billing Vereist? | Kosten |
|------------|------------------|--------|
| `localhost:3000` | ❌ Nee | Gratis |
| `*.vercel.app` | ✅ Ja | $200 gratis credits/maand |
| Custom domain | ✅ Ja | $200 gratis credits/maand |

**Advies:**
- ✅ Test alles lokaal (geen billing nodig)
- ✅ Deploy naar Vercel alleen als je live wilt gaan
- ✅ Billing inschakelen alleen als je production nodig hebt

---

**Nu kun je lokaal testen zonder billing! 🎉**



