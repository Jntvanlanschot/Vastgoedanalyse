# 🏠 Localhost Setup - Test Lokaal Zonder Billing

## Waarom Localhost Anders is

**Localhost (Development):**
- ✅ **Geen billing vereist** - Google Maps werkt gratis op localhost
- ✅ Perfect voor lokaal testen en development
- ✅ Snel itereren zonder kosten

**Vercel (Production):**
- ⚠️ **Billing vereist** - Google's policy voor production domains
- ⚠️ $200 gratis credits per maand beschikbaar
- ⚠️ Alleen nodig als je live wilt gaan

---

## Stap 1: Maak .env.local Bestand

**In de root van je project** (naast `package.json`):

1. **Maak een nieuw bestand:** `.env.local`
2. **Voeg toe:**

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=je_google_maps_api_key_hier
APIFY_API_TOKEN=je_apify_token_hier
```

3. **Vervang** `je_google_maps_api_key_hier` met je echte API key

**⚠️ Belangrijk:** `.env.local` staat al in `.gitignore`, dus wordt niet gecommit.

---

## Stap 2: Google Cloud Console - Localhost Toevoegen

1. **Ga naar [Google Cloud Console](https://console.cloud.google.com/)**
2. **APIs & Services → Credentials**
3. **Klik op je API key**
4. **Application restrictions → HTTP referrers (web sites)**
5. **Voeg toe:**
   ```
   localhost:3000/*
   http://localhost:3000/*
   https://localhost:3000/*
   127.0.0.1:3000/*
   http://127.0.0.1:3000/*
   ```
6. **Save**

**⚠️ Belangrijk:** Zorg dat "HTTP referrers (web sites)" is geselecteerd, niet "None"!

---

## Stap 3: Start Development Server

```bash
npm run dev
```

**Je zou moeten zien:**
```
▲ Next.js 15.5.4
- Local:        http://localhost:3000
```

---

## Stap 4: Test Localhost

1. **Open browser:** `http://localhost:3000`
2. **Open Developer Console (F12)**
3. **Check Console voor:**
   - ✅ "API Key loaded: Yes"
   - ✅ "Google Maps API loaded successfully"
   - ❌ Geen billing errors!

---

## Waarom Werkt Localhost Zonder Billing?

Google Maps heeft een **special exception** voor development:

- `localhost` en `127.0.0.1` worden gezien als development
- Geen billing account vereist
- Perfect voor testing en development

**Dit is Google's policy** - ze willen developers helpen zonder kosten tijdens development.

---

## Troubleshooting

### ❌ "API key not configured" (lokaal)

**Oplossing:**
1. Check of `.env.local` bestaat in de root
2. Check of variable naam exact is: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
3. **Herstart dev server** na toevoegen van `.env.local`:
   ```bash
   # Stop server (Ctrl+C)
   npm run dev
   ```

### ❌ "This page can't load Google Maps correctly" (lokaal)

**Oplossing:**
1. Check Google Cloud Console → API Key → HTTP referrers
2. Zorg dat `localhost:3000/*` is toegevoegd
3. Check of Maps JavaScript API, Places API, Geocoding API zijn ingeschakeld
4. Clear browser cache (Ctrl+Shift+Delete)

### ❌ Localhost werkt, maar Vercel niet

**Dit is normaal!** 

- Localhost = geen billing nodig ✅
- Vercel = billing vereist ⚠️

**Oplossing voor Vercel:**
- Zie `GOOGLE_BILLING_SETUP.md` als je live wilt gaan
- Of test alleen lokaal voor development

---

## Workflow: Lokaal Testen, Vercel voor Production

### Development (Lokaal):
1. ✅ Test alles op `localhost:3000`
2. ✅ Geen billing nodig
3. ✅ Snel itereren
4. ✅ Geen kosten

### Production (Vercel):
1. ⚠️ Deploy naar Vercel voor live gebruik
2. ⚠️ Billing account vereist
3. ⚠️ $200 gratis credits per maand

**Advies:** Test alles lokaal eerst, deploy alleen als je live wilt gaan!

---

## Checklist

- [ ] `.env.local` bestand aangemaakt in root
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` toegevoegd aan `.env.local`
- [ ] Google Cloud Console → API Key → HTTP referrers
- [ ] `localhost:3000/*` toegevoegd aan HTTP referrers
- [ ] Maps JavaScript API ingeschakeld
- [ ] Places API ingeschakeld
- [ ] Geocoding API ingeschakeld
- [ ] `npm run dev` gestart
- [ ] Test op `http://localhost:3000`
- [ ] Google Maps werkt lokaal ✅
- [ ] Geen billing errors! ✅

---

**Nu kun je lokaal testen zonder billing! 🎉**

**Voor Vercel:** Billing is alleen nodig als je live wilt gaan. Voor development/testen gebruik je gewoon localhost!



