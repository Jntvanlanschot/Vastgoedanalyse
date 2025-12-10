# Plan voor verdere verbeteringen van prijsvoorspelling

## Huidige status
- **Within 10%: 60.81%** (met sale_date factor)
- **MAPE: 10.67%**
- **Verbetering t.o.v. baseline: +2.14%**

## Beschikbare data (niet gebruikt)
- ✅ **year_built**: 100% coverage - Bouwjaar kan belangrijk zijn voor prijs
- ✅ **type**: 100% coverage - Appartement vs Woonhuis
- ✅ **subtype**: 79% coverage - Bovenwoning, Benedenwoning, etc.
- ✅ **vve_monthly_fee**: 77% coverage - VVE kosten kunnen prijs beïnvloeden
- ✅ **has_lift**: 100% coverage - Lift aanwezigheid
- ✅ **has_parking/garage**: 100% coverage - Parkeer/garage faciliteiten
- ✅ **maintenance_inside/outside**: 99% coverage - Onderhoudsstaat
- ✅ **floor**: 0% coverage - Verdieping (niet beschikbaar)
- ✅ **days_on_market**: Beschikbaar - Hoe lang op de markt

## Voorgestelde verbeteringen

### 1. **Bouwjaar (year_built) - HOOGSTE PRIORITEIT**
**Waarom:** Oudere gebouwen hebben vaak lagere prijzen, nieuwere hoger. Ook belangrijk voor onderhoudskosten.
**Implementatie:**
- Bereken leeftijd: `age = 2025 - year_built`
- Similarity: hoe dichter bij elkaar in leeftijd, hoe hoger de score
- Weight: 0.05 - 0.15 (tuneable)

### 2. **Property Type (type/subtype) - HOOG PRIORITEIT**
**Waarom:** Appartement vs Woonhuis heeft grote prijsimpact. Bovenwoning vs Benedenwoning ook.
**Implementatie:**
- Exact match: type + subtype = 1.0
- Alleen type match: 0.7
- Geen match: 0.0
- Weight: 0.05 - 0.12 (tuneable)

### 3. **VVE Kosten (vve_monthly_fee) - MEDIUM PRIORITEIT**
**Waarom:** Hoge VVE kosten verlagen de waarde. Vergelijkbare VVE kosten = betere match.
**Implementatie:**
- Normaliseer VVE kosten per m²
- Similarity: hoe dichter bij elkaar, hoe hoger de score
- Weight: 0.02 - 0.08 (tuneable)

### 4. **Parking/Garage (has_parking/garage) - MEDIUM PRIORITEIT**
**Waarom:** Parkeerplaats/garage verhoogt waarde, vooral in centrum Amsterdam.
**Implementatie:**
- Exact match: 1.0
- Mismatch: 0.5
- Weight: 0.03 - 0.10 (tuneable)

### 5. **Lift (has_lift) - LAGE PRIORITEIT**
**Waarom:** Lift is belangrijk voor hogere verdiepingen.
**Implementatie:**
- Exact match: 1.0
- Mismatch: 0.5
- Weight: 0.01 - 0.05 (tuneable)

### 6. **Onderhoudsstaat (maintenance) - LAGE PRIORITEIT**
**Waarom:** Goed onderhoud = hogere waarde.
**Implementatie:**
- Score: Uitstekend=1.0, Goed=0.8, Redelijk=0.6, Matig=0.4
- Gemiddelde van binnen + buiten
- Weight: 0.02 - 0.06 (tuneable)

### 7. **Meer data**
**Waarom:** Meer data = betere training, minder overfitting.
**Actie:** Download meer Realworks bestanden voor grotere dataset.

### 8. **Cross-validation**
**Waarom:** Betere validatie, minder afhankelijk van specifieke train/test split.
**Implementatie:** 5-fold cross-validation in plaats van single split.

### 9. **Feature engineering**
- **Prijs per m² trend:** Bereken gemiddelde prijs/m² per maand, gebruik als baseline
- **Seizoen effect:** Winter vs zomer verkopen
- **Markt condities:** Bereken markt trend (stijgend/dalend) op basis van verkoopdata

### 10. **Ensemble methods**
**Waarom:** Combineer meerdere modellen voor betere voorspelling.
**Implementatie:** 
- Weighted average van top 3-5 beste parameter sets
- Of: gebruik XGBoost/Random Forest als alternatief model

## Aanbevolen volgorde
1. **Bouwjaar toevoegen** (grootste impact verwacht)
2. **Property type toevoegen** (grote impact)
3. **VVE kosten toevoegen** (medium impact)
4. **Parking/garage toevoegen** (medium impact)
5. **Meer data downloaden** (betere training)
6. **Cross-validation** (betere validatie)

## Verwachte verbetering
Met bouwjaar + type: **+3-5%** binnen 10% accuracy verwacht.
Met alle features: **+5-8%** binnen 10% accuracy mogelijk.




