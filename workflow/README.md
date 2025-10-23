# Vastgoedanalyse Workflow Package

Dit pakket bevat de complete workflow voor de Vastgoedanalyse tool die geïntegreerd kan worden in een webapp.

## Workflow Overzicht

De workflow bestaat uit 4 stappen:

1. **Step 1**: Referentieadres verwerking en top 5 straten selectie
2. **Step 2**: Realworks data upload en parsing
3. **Step 3**: Data merge en top 15 selectie
4. **Step 4**: PDF en Excel rapport generatie

## Bestanden

### Hoofdscripts
- `complete_workflow.py` - Voert de complete workflow uit
- `step1_reference_processing.py` - Verwerkt referentieadres en selecteert top 5 straten
- `step2_realworks_processing.py` - Verwerkt geüploade Realworks RTF bestanden
- `step3_merge_and_select.py` - Merge data en selecteert top 15 matches
- `step4_generate_reports.py` - Genereert PDF en Excel rapporten

### Voorbeeldbestanden
- `example_reference_data.json` - Voorbeeld referentieadres data
- `README.md` - Deze documentatie

## Gebruik

### Complete Workflow
```bash
python complete_workflow.py reference_data.json uploaded_files_dir/
```

### Individuele Stappen
```bash
# Step 1: Referentieadres verwerking
python step1_reference_processing.py reference_data.json

# Step 2: Realworks data verwerking
python step2_realworks_processing.py uploaded_files_dir/ step1_result.json

# Step 3: Merge en top 15 selectie
python step3_merge_and_select.py reference_data.json

# Step 4: Rapport generatie
python step4_generate_reports.py top15_perfect_matches_final.csv reference_data.json
```

## Input Format

### Referentieadres Data (JSON)
```json
{
  "address_full": "Eerste Laurierdwarsstraat 19, 1016 PV Amsterdam",
  "area_m2": 120,
  "energy_label": "A",
  "bedrooms": 3,
  "bathrooms": 2,
  "rooms": 4,
  "has_terrace": true,
  "has_balcony": false,
  "has_garden": false,
  "sun_orientation": "zuid"
}
```

### Realworks Data
- Upload RTF bestanden in een directory
- De script zal automatisch alle `.rtf` bestanden verwerken

## Output

### JSON Resultaten
Elke stap genereert een JSON resultaat bestand:
- `step1_result.json` - Top 5 straten
- `step2_result.json` - Verwerkte Realworks data
- `step3_result.json` - Gemergde data en top 15 matches
- `step4_result.json` - Gegenereerde rapporten
- `complete_workflow_result.json` - Complete workflow resultaat

### Bestanden voor Download
- `top15_perfect_report_final.pdf` - PDF rapport
- `top15_perfecte_woningen_tabel_final.xlsx` - Excel tabel
- `perfect_merged_data_final.csv` - Complete gemergde data
- `top15_perfect_matches_final.csv` - Top 15 matches

## Webapp Integratie

Voor webapp integratie:

1. **Upload referentieadres data** als JSON
2. **Run Step 1** om top 5 straten te krijgen
3. **Prompt gebruiker** om Realworks RTF bestanden te uploaden
4. **Run Step 2** om Realworks data te verwerken
5. **Run Step 3** om data te mergen en top 15 te selecteren
6. **Run Step 4** om rapporten te genereren
7. **Download PDF en Excel** bestanden

### API Response Format
Alle scripts retourneren JSON met:
```json
{
  "status": "success|error",
  "message": "Beschrijving van het resultaat",
  "data": { ... }
}
```

## Vereisten

- Python 3.7+
- pandas
- openpyxl (voor Excel export)
- reportlab (voor PDF generatie)
- striprtf (voor RTF parsing)

## Foutafhandeling

Alle scripts hebben uitgebreide foutafhandeling en retourneren altijd een JSON response met status en message. Bij errors wordt de workflow gestopt en de foutmelding geretourneerd.

## Performance

- **Step 1**: ~5-10 seconden (afhankelijk van Funda data grootte)
- **Step 2**: ~2-5 seconden per RTF bestand
- **Step 3**: ~5-10 seconden (merge operatie)
- **Step 4**: ~3-5 seconden (rapport generatie)

Totale workflow tijd: ~15-30 seconden voor typische datasets.
