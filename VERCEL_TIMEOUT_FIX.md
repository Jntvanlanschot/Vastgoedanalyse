# ⏱️ Vercel Timeout Fix - 504 Gateway Timeout Oplossen

## Probleem: 504 Gateway Timeout

Je ziet deze error:
```
504 Gateway Timeout
Failed to load resource: the server responded with a status of 504
Response is not JSON, using status text
```

**Oorzaak:** De Funda scraper duurt ~1 minuut, maar Vercel heeft een timeout limiet.

---

## Vercel Timeout Limieten

### Gratis Tier (Hobby)
- ⚠️ **10 seconden** maximum timeout
- ❌ Te kort voor Funda scraper (duurt 1+ minuut)

### Pro Tier ($20/maand)
- ✅ **300 seconden** (5 minuten) maximum timeout
- ✅ Genoeg voor Funda scraper

---

## Oplossing 1: maxDuration Toevoegen (Al Gedaan!)

Ik heb `maxDuration = 300` toegevoegd aan `app/api/run-scraper/route.ts`.

**Maar:** Dit werkt alleen met **Vercel Pro plan**!

---

## Oplossing 2: Vercel Pro Plan Upgrade

Je hebt **Vercel Pro plan nodig** voor langlopende processen.

### Stappen:

1. **Ga naar [Vercel Dashboard](https://vercel.com/dashboard)**
2. **Klik op je team/project**
3. **Ga naar Settings → Billing**
4. **Klik "Upgrade to Pro"**
5. **Kies Pro plan** ($20/maand)
6. **Voeg payment method toe**
7. **Activeer Pro plan**

### Na Upgrade:

1. **Redeploy je project:**
   - Ga naar Deployments
   - Klik 3 dots → Redeploy
   - Of push een wijziging naar GitHub

2. **Test opnieuw:**
   - Funda scraper zou nu moeten werken
   - Geen 504 timeout meer

---

## Oplossing 3: Async Processing (Alternatief)

Als je geen Pro plan wilt, kun je async processing implementeren:

1. **Start scraper** → Return job ID
2. **Poll status** → Check of scraper klaar is
3. **Return results** → Wanneer klaar

Dit vereist code wijzigingen.

---

## Check Huidige Status

### Check of maxDuration is ingesteld:

1. **Check `app/api/run-scraper/route.ts`:**
   - Moet bevatten: `export const maxDuration = 300;`

2. **Check `vercel.json`:**
   - Moet bevatten:
     ```json
     "functions": {
       "app/api/**/*.ts": {
         "maxDuration": 300
       }
     }
     ```

### Check Vercel Plan:

1. **Ga naar Vercel Dashboard**
2. **Settings → Billing**
3. **Check je plan:**
   - Hobby = 10 seconden timeout ❌
   - Pro = 300 seconden timeout ✅

---

## Troubleshooting

### ❌ "504 Gateway Timeout" blijft na Pro upgrade

**Oplossing:**
1. **Redeploy** na upgrade (belangrijk!)
2. **Wacht 5 minuten** na upgrade
3. **Check build logs** voor errors
4. **Test opnieuw**

### ❌ "maxDuration is not supported on Hobby plan"

**Oplossing:**
- Upgrade naar Pro plan
- Of implementeer async processing

### ❌ Scraper werkt lokaal maar niet op Vercel

**Oorzaak:**
- Lokaal heeft geen timeout limiet
- Vercel heeft wel timeout limiet

**Oplossing:**
- Upgrade naar Pro plan
- Of test alleen lokaal

---

## Samenvatting

| Plan | Timeout | Funda Scraper? |
|------|---------|----------------|
| Hobby (Gratis) | 10 seconden | ❌ Te kort |
| Pro ($20/maand) | 300 seconden | ✅ Werkt! |

**Voor Funda scraper (1+ minuut) heb je Pro plan nodig!**

---

## Checklist

- [ ] `maxDuration = 300` toegevoegd aan `app/api/run-scraper/route.ts` ✅ (al gedaan)
- [ ] `vercel.json` heeft `maxDuration: 300` ✅ (al gedaan)
- [ ] Vercel Pro plan geactiveerd
- [ ] Redeploy gedaan na upgrade
- [ ] Test opnieuw - werkt! ✅

---

**Na Pro upgrade en redeploy zou de 504 timeout opgelost moeten zijn! 🚀**




