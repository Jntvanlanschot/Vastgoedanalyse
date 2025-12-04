# Overzicht Prijsberekening Vastgoedanalyse Tool

## 📊 Geoptimaliseerde Parameters

**Resultaten van Bayesian Optimization (300 trials):**
- **Within 10% accuracy:** 54.82%
- **MAPE (Mean Absolute Percentage Error):** 11.52%

---

## 1️⃣ SIMILARITY SCORE BEREKENING

De similarity score bepaalt hoe goed een vergelijkbare woning matcht met de referentie woning. De score wordt berekend op basis van meerdere factoren met geoptimaliseerde weights.

### Similarity Weights (Actief Gebruikt)

**Hoofdfactoren die worden gebruikt in de berekening:**

| Factor | Weight | Percentage | Beschrijving |
|--------|--------|------------|--------------|
| **Energielabel** | 0.35 | 35% | Meest belangrijke factor - bepaalt energie-efficiëntie |
| **Oppervlakte (m²)** | 0.33 | 33% | Verschil in woonoppervlakte |
| **Afstand/Locatie** | 0.18 | 18% | Geografische afstand (0-2km linear decay) |
| **Balkon/Terras** | 0.11 | 11% | Match op balkon of terras aanwezigheid |
| **Verkoopdatum** | 0.11 | 11% | Recency en tijd nabijheid van verkoopdatum |
| **Straat naam** | 0.10 | 10% | Exacte match of string similarity |
| **OSM Straat** | 0.10 | 10% | OpenStreetMap straat similarity |
| **Kamers** | 0.05 | 5% | Aantal kamers verschil |
| **Tuin** | 0.02 | 2% | Tuin aanwezigheid match |
| **Bouwjaar** | 0.01 | 1% | Verschil in bouwjaar |
| **Gracht Penalty** | 0.0035 | 0.35% | Penalty multiplier als één gracht is en andere niet |

**Totaal Base Similarity:** 10% + 10% + 33% + 18% + 2% + 5% + 11% + 11% + 1% = **101%**

**Nota:** De volgende weights zijn geoptimaliseerd maar worden momenteel niet actief gebruikt in de berekening:
- `weight_property_type` (0.06) - Eigendomstype
- `weight_vve_fee` (0.03) - VVE kosten verschil
- `weight_parking` (0.035) - Parking/garage match
- `weight_lift` (0.01) - Lift aanwezigheid

Deze kunnen in de toekomst worden toegevoegd aan de berekening.

### Berekeningsmethode

1. **Base Similarity** (zonder energielabel):
   - Alle factoren behalve energielabel worden opgeteld
   - Maximaal: 10% + 10% + 33% + 18% + 2% + 5% + 11% + 11% + 1% = **101%**
   - Score wordt genormaliseerd naar 0-1 door te delen door maximum score

2. **Verkoopdatum Similarity**:
   - Formule: proximity_score = exp(-days_diff / 180)
   - Zelfde datum: score = 1.0
   - Verschil in dagen wordt gebruikt met exponentiële decay
   - Decay factor = 180 dagen (50% score bij ~125 dagen verschil)
   - Recency bonus: +0.05 als beide verkoopdata recent zijn (< 1 jaar)
   - Maximum verschil: 730 dagen (2 jaar), daarboven score = 0

3. **Bouwjaar Similarity**:
   - Formule: score = exp(-year_diff / 20)
   - Zelfde jaar: score = 1.0
   - Verschil in jaren wordt gebruikt met exponentiële decay
   - Decay factor = 20 jaar (50% score bij ~14 jaar verschil)
   - Bij ontbrekende data: score = 0.5 (neutraal)

4. **Energielabel Similarity**:
   - Gebruikt exponentiële decay functie op basis van label verschil
   - Zelfde label: score = 1.0
   - Verschil van 1 label: score = 0.9
   - Verschil van 2 labels: score = 0.75
   - Verschil van 3 labels: score = 0.6
   - Grotere verschillen: exponentiële decay met minimum 0.4

5. **Gecombineerde Score**:
   ```
   Final Score = (35% × Energy Label Similarity) + (65% × Base Similarity)
   ```
   Waarbij Base Similarity = genormaliseerde som van alle andere factoren

6. **Gracht Penalty**:
   - Als referentie woning een gracht is maar vergelijkbare niet (of vice versa)
   - Score wordt vermenigvuldigd met 0.0035 (zware penalty)
   - Dit voorkomt dat grachten met niet-grachten worden vergeleken

---

## 2️⃣ PRIJSBEREKENING PARAMETERS

### Selectie Criteria

| Parameter | Waarde | Beschrijving |
|-----------|--------|--------------|
| **TOP_N** | 12 | Aantal top vergelijkbare woningen gebruikt voor prijsberekening |
| **MIN_SCORE** | 0.55 | Minimum similarity score (55%) - woningen onder deze score worden uitgesloten |
| **USE_SCORE_SQUARED** | True | Gebruik score² als weight (geeft meer gewicht aan hoge scores) |

### Prijsberekening Stappen

1. **Filtering**:
   - Neem top 15 matches uit de dataset
   - Filter op minimum score ≥ 0.55
   - Neem top 12 woningen die voldoen aan minimum score
   - Fallback: Als geen woningen voldoen, gebruik top 5 zonder score filter

2. **Energy Label Correctie**:
   - Elke prijs wordt gecorrigeerd naar het energielabel van de referentie woning
   - Label A: +5% correctie
   - Label B: +2.5% correctie
   - Label C: 0% (baseline)
   - Label D: -2.5% correctie
   - Label E: -5% correctie
   - Label F: -7.5% correctie
   - Label G: -10% correctie

3. **Prijs per m² Berekening**:
   ```
   Corrected Price = Original Price × Energy Label Correction Factor
   Price per m² = Corrected Price / Area (m²)
   ```

4. **Weighted Average**:
   - Elke prijs per m² krijgt een weight gebaseerd op similarity score
   - Weight = Score² (als USE_SCORE_SQUARED = True)
   - Weight = Score (als USE_SCORE_SQUARED = False)
   
   ```
   Weighted Average = Σ(Price per m² × Weight) / Σ(Weight)
   ```

5. **Finale Prijs**:
   ```
   Final Price = Weighted Average Price per m² × Reference Area (m²)
   ```

---

## 3️⃣ DRIE SCENARIO'S (Bounds)

Gebaseerd op financiële literatuur worden drie scenario's berekend:

### Conservatief Scenario (P25)
- **Methode:** 25e percentiel van alle prijzen per m²
- **Betekenis:** 25% van de vergelijkbare woningen heeft een lagere prijs
- **Gebruik:** Voorzichtige schatting, onderste range

### Neutraal Scenario
- **Methode:** Gewogen gemiddelde (zoals hierboven beschreven)
- **Betekenis:** Meest waarschijnlijke prijs gebaseerd op alle factoren
- **Gebruik:** Primaire schatting

### Optimistisch Scenario (P75)
- **Methode:** 75e percentiel van alle prijzen per m²
- **Betekenis:** 75% van de vergelijkbare woningen heeft een lagere prijs
- **Gebruik:** Bovenste range, optimistische schatting

### Confidence Interval
- **50% Confidence Interval:** P25 tot P75
- **Betekenis:** 50% kans dat de werkelijke prijs binnen dit bereik valt
- **Conform:** Financiële standaarden voor property valuations

### Fallback Logica

- **≥3 vergelijkbare woningen:** Gebruik percentielen (P25/P75)
- **2 woningen:** Min/max met 10% marge
- **1 woning:** ±12% range (standaard in property valuations)

---

## 4️⃣ VOORBEELD BEREKENING

### Input
- **Referentie woning:** 60 m², Energielabel A, Schipbeekstraat 40 2
- **Vergelijkbare woning 1:** 65 m², Energielabel B, Verkoopprijs €450.000, Score 0.75
- **Vergelijkbare woning 2:** 58 m², Energielabel A, Verkoopprijs €420.000, Score 0.85
- **Vergelijkbare woning 3:** 62 m², Energielabel C, Verkoopprijs €380.000, Score 0.65

### Stap 1: Energy Label Correctie
- **Woning 1:** €450.000 × (1 + (0.0 - 0.025)) = €438.750 (Label B → A correctie)
- **Woning 2:** €420.000 × (1 + (0.0 - 0.0)) = €420.000 (Label A → A, geen correctie)
- **Woning 3:** €380.000 × (1 + (0.0 - (-0.05))) = €399.000 (Label C → A correctie)

### Stap 2: Prijs per m²
- **Woning 1:** €438.750 / 65 = €6.750/m²
- **Woning 2:** €420.000 / 58 = €7.241/m²
- **Woning 3:** €399.000 / 62 = €6.435/m²

### Stap 3: Weighted Average (met Score²)
- **Woning 1:** Weight = 0.75² = 0.5625
- **Woning 2:** Weight = 0.85² = 0.7225
- **Woning 3:** Weight = 0.65² = 0.4225
- **Total Weight:** 1.7075

```
Weighted Average = (€6.750 × 0.5625 + €7.241 × 0.7225 + €6.435 × 0.4225) / 1.7075
                 = €6.892/m²
```

### Stap 4: Finale Prijs (Neutraal)
```
Neutraal Prijs = €6.892/m² × 60 m² = €413.520
```

### Stap 5: Scenario's
- **Conservatief (P25):** €6.435/m² × 60 = €386.100
- **Neutraal:** €413.520
- **Optimistisch (P75):** €7.241/m² × 60 = €434.460

---

## 5️⃣ TECHNISCHE DETAILS

### Bestanden
- **Weights configuratie:** `apps/workflow-py/workflow/optimized_weights.py`
- **Similarity berekening:** `apps/workflow-py/workflow/api_workflow.py` (functie `calculate_simple_similarity_score`)
- **Prijsberekening:** `apps/workflow-py/workflow/step4_generate_reports.py`
- **Energy label correctie:** `apps/workflow-py/workflow/energy_label_correction.py`

### Optimalisatie Methode
- **Bayesian Optimization** met Optuna
- **300 trials** uitgevoerd
- **Doel:** Minimaliseer MAPE (Mean Absolute Percentage Error)
- **Resultaat:** 11.52% MAPE, 54.82% within 10% accuracy

---

## 6️⃣ SAMENVATTING

**Similarity Score:**
- 35% energielabel + 65% andere factoren
- Andere factoren: straat (10%), OSM straat (10%), oppervlakte (33%), afstand (18%), balkon (11%), verkoopdatum (11%), kamers (5%), tuin (2%), bouwjaar (1%)
- Maximaal 100% (1.0)
- Gracht penalty van 0.35% bij mismatch

**Prijsberekening:**
- Top 12 woningen met score ≥ 55%
- Gewogen gemiddelde met score² als weight
- Energy label correctie toegepast
- Drie scenario's: Conservatief (P25), Neutraal (gewogen gemiddelde), Optimistisch (P75)

**Output:**
- Conservatief: 25e percentiel
- Neutraal: Gewogen gemiddelde
- Optimistisch: 75e percentiel
- 50% confidence interval tussen P25 en P75

