# 💳 Google Maps Billing Setup - Stap voor Stap

## Probleem
Je ziet deze error:
```
BillingNotEnabledMapError
You must enable Billing on the Google Cloud Project
```

## Oplossing: Billing Inschakelen

Google Maps vereist een billing account, maar je krijgt **$200 gratis credits per maand**!

---

## Stap 1: Ga naar Google Cloud Console

1. **Ga naar [Google Cloud Console](https://console.cloud.google.com/)**
2. **Login** met je Google account
3. **Selecteer je project** (of maak een nieuw project aan)

---

## Stap 2: Billing Account Aanmaken/Linken

### Optie A: Als je al een billing account hebt

1. **Ga naar "Billing"** in het menu (of [directe link](https://console.cloud.google.com/billing))
2. **Klik op je project**
3. **Klik "Link Billing Account"**
4. **Selecteer je bestaande billing account**
5. **Klik "Set Account"**

### Optie B: Nieuwe billing account aanmaken

1. **Ga naar "Billing"** in het menu
2. **Klik "Create Billing Account"**
3. **Vul in:**
   - **Account Name:** Bijv. "Vastgoedanalyse Project"
   - **Country:** Nederland
   - **Payment Method:** Credit card of bank account
4. **Klik "Submit and Enable Billing"**

**⚠️ Belangrijk:**
- Je wordt alleen gefactureerd als je over de $200 gratis credits gaat
- Voor de meeste apps is dit ruim voldoende
- Je kunt altijd een budget alert instellen

---

## Stap 3: Billing Account Koppelen aan Project

1. **Ga naar "Billing" → "My Billing Accounts"**
2. **Klik op je billing account**
3. **Klik "Link Project"** (of ga naar project settings)
4. **Selecteer je project**
5. **Klik "Link"**

**OF:**

1. **Ga naar je Project Settings**
2. **Klik "Change billing account"**
3. **Selecteer je billing account**
4. **Klik "Set Account"**

---

## Stap 4: Verifieer dat Billing Actief is

1. **Ga naar "Billing" → "Overview"**
2. **Check of je project zichtbaar is**
3. **Check of "Billing Account" is gelinkt**

Je zou moeten zien:
- ✅ Billing Account: [Naam van je account]
- ✅ Status: Active

---

## Stap 5: Test Google Maps Opnieuw

1. **Ga naar je Vercel URL**
2. **Refresh de pagina** (Ctrl+F5 of Cmd+Shift+R)
3. **Check browser console (F12)**
4. **Error zou nu weg moeten zijn!**

---

## 💰 Kosten Overzicht

### Gratis Tier ($200 credits/maand)

**Wat je krijgt:**
- ✅ Maps JavaScript API: $7 per 1000 loads
- ✅ Places API: $17 per 1000 requests
- ✅ Geocoding API: $5 per 1000 requests

**Voorbeeld:**
- 10,000 Maps loads = $70 (binnen gratis tier)
- 5,000 Places requests = $85 (binnen gratis tier)
- 10,000 Geocoding requests = $50 (binnen gratis tier)

**Totaal:** ~$205 = Binnen de $200 gratis credits! 🎉

### Budget Alert Instellen (Aanbevolen)

1. **Ga naar "Billing" → "Budgets & Alerts"**
2. **Klik "Create Budget"**
3. **Stel in:**
   - **Budget Amount:** $10 (of wat je wilt)
   - **Alert Threshold:** 50%, 90%, 100%
4. **Klik "Create Budget"**

Nu krijg je een email als je budget nadert.

---

## ⚠️ Belangrijk: API Key Restrictions

Na het inschakelen van billing, zorg dat je API key restrictions correct zijn:

1. **Ga naar "APIs & Services" → "Credentials"**
2. **Klik op je API key**
3. **Application restrictions:**
   - Selecteer "HTTP referrers (web sites)"
   - Voeg toe:
     ```
     *.vercel.app/*
     https://*.vercel.app/*
     localhost:3000/*
     http://localhost:3000/*
     ```
4. **API restrictions:**
   - Selecteer "Restrict key"
   - Selecteer alleen:
     - ✅ Maps JavaScript API
     - ✅ Places API
     - ✅ Geocoding API
5. **Save**

---

## 🔍 Troubleshooting

### ❌ "Billing account not found"

**Oplossing:**
- Zorg dat je een billing account hebt aangemaakt
- Check of je de juiste Google account gebruikt
- Check of je project is gelinkt aan billing account

### ❌ "Payment method required"

**Oplossing:**
- Voeg een credit card of bank account toe
- Google vraagt dit voor verificatie
- Je wordt alleen gefactureerd als je over $200 credits gaat

### ❌ Billing is ingeschakeld maar error blijft

**Oplossing:**
1. **Wacht 5-10 minuten** (kan even duren voordat het actief is)
2. **Refresh je Vercel deployment** (redeploy)
3. **Clear browser cache** (Ctrl+Shift+Delete)
4. **Test opnieuw**

### ❌ "API key not valid"

**Oplossing:**
- Check of API key correct is in Vercel environment variables
- Check of HTTP referrers correct zijn ingesteld
- Check of alle APIs zijn ingeschakeld (Maps JavaScript, Places, Geocoding)

---

## ✅ Checklist

- [ ] Google Cloud Console account aangemaakt
- [ ] Project aangemaakt/geselecteerd
- [ ] Billing account aangemaakt of gelinkt
- [ ] Payment method toegevoegd
- [ ] Billing account gekoppeld aan project
- [ ] Maps JavaScript API ingeschakeld
- [ ] Places API ingeschakeld
- [ ] Geocoding API ingeschakeld
- [ ] API key restrictions geconfigureerd
- [ ] HTTP referrers ingesteld (`*.vercel.app/*`)
- [ ] Vercel environment variable ingesteld (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
- [ ] Vercel deployment opnieuw gedaan
- [ ] Website getest - error weg!

---

## 🎯 Quick Fix

**Als je haast hebt:**

1. **Ga naar:** https://console.cloud.google.com/billing
2. **Klik "Create Billing Account"** (of link bestaande)
3. **Voeg payment method toe**
4. **Link aan je project**
5. **Wacht 5 minuten**
6. **Test opnieuw**

---

**Na het inschakelen van billing zou Google Maps moeten werken! 🗺️**

**Let op:** Je krijgt $200 gratis credits per maand, dus voor de meeste apps kost dit niets extra!

