# Architectuur Fix: PDF Generatie in Serverless

## Probleem
- `lib/workflow/runWorkflow.ts` gebruikt `pdfmake` → triggert `fontkit` → vraagt `.trie` files
- Vercel Serverless heeft geen filesystem voor runtime assets
- Patches werken niet stabiel (altijd nieuwe `.trie` files)

## Oplossing: PDF Generatie naar Python

### Optie 1: Skip PDF in Serverless (snelste fix)
- PDF generatie alleen lokaal of in Python workflow
- Serverless: alleen Excel output

### Optie 2: Verplaats naar Python (aanbevolen)
- Gebruik `step4_generate_reports.py` die al reportlab gebruikt
- Python heeft geen fontkit/trie problemen

### Optie 3: Queue-based (meest robuust)
- API: alleen upload + trigger
- Externe worker: verwerking + PDF
- Resultaat via webhook/polling

## Implementatie Plan

### Stap 1: Skip PDF in serverless (nu)
```typescript
// lib/workflow/runWorkflow.ts
if (process.env.VERCEL) {
  // Skip PDF generation in serverless
  pdfBuffer = null;
} else {
  pdfBuffer = await generatePdfReport(...);
}
```

### Stap 2: Python PDF generatie (later)
- Gebruik `step4_generate_reports.py`
- Upload PDF naar Vercel Blob
- Return blob URL

