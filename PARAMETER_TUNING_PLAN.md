# Parameter Tuning Plan voor Vastgoedanalyse Tool

## Doel
Automatisch de optimale parameters vinden voor prijsberekening door alle Realworks bestanden te gebruiken als trainingsdata.

## Aanpak

### Fase 1: Data Verzameling & Database Opbouw
1. **Scan Downloads folder** voor alle `.rtf` bestanden
2. **Parse alle Realworks bestanden** en maak één gecombineerde database
3. **Filter properties** met:
   - Geldige verkoopprijs (sale_price > 0)
   - Geldige oppervlakte (area_m2 > 0)
   - Volledig adres
4. **Geocoding** voor locatie-gebaseerde filtering (optioneel, kan later)

### Fase 2: Cross-Validation Setup
Voor elk property in de database:
1. **Gebruik als referentie** (test case)
2. **Zoek vergelijkbare properties** in dezelfde database (exclusief het referentie-property zelf)
3. **Filter op locatie** (binnen X km of zelfde buurt/postcode gebied)
4. **Bereken similarity scores** met huidige parameters
5. **Bereken verwachte prijs** met huidige prijsberekening parameters
6. **Vergelijk met echte prijs** en bereken error percentage

### Fase 3: Parameter Space Definiëren
Te tunen parameters:
1. **PRICE_CALC_TOP_N**: 3, 5, 7, 10, 15 (aantal matches)
2. **PRICE_CALC_MIN_SCORE**: 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80 (minimum score threshold)
3. **PRICE_CALC_USE_SCORE_SQUARED**: True/False (score² weging)
4. **Energy label correction multiplier**: 0.8x, 1.0x, 1.2x (optioneel)

### Fase 4: Optimization Strategie
**Optie A: Grid Search** (eenvoudig, maar langzaam)
- Test alle combinaties van parameters
- Kies combinatie met beste gemiddelde accuracy

**Optie B: Random Search** (sneller)
- Test random combinaties (bijv. 100-200 runs)
- Kies beste resultaat

**Optie C: Bayesian Optimization** (slim, aanbevolen)
- Gebruik `scikit-optimize` of `optuna`
- Leert van eerdere resultaten
- Focus op veelbelovende parameter combinaties
- Veel sneller dan grid search

**Optie D: Machine Learning** (complex, maar mogelijk beter)
- Train een regressie model (Random Forest, XGBoost)
- Features: similarity scores, property attributes, location
- Target: verkoopprijs
- Kan non-lineaire relaties leren

### Fase 5: Evaluatie Metrics
Voor elke parameter combinatie:
1. **Mean Absolute Percentage Error (MAPE)**: Gemiddeld percentage verschil
2. **Percentage binnen 10%**: Hoeveel properties binnen 10% van echte prijs
3. **Percentage binnen 15%**: Hoeveel properties binnen 15% van echte prijs
4. **Mean Absolute Error (MAE)**: Gemiddeld absoluut verschil in euro's
5. **Root Mean Squared Error (RMSE)**: Geeft meer gewicht aan grote fouten

**Doel**: Maximale percentage properties binnen 10% van echte prijs, met lage MAPE.

### Fase 6: Validatie
1. **Train/Test Split**: 80% voor tuning, 20% voor validatie
2. **K-Fold Cross-Validation**: Verdeel data in K folds, test op elke fold
3. **Out-of-sample testing**: Test op properties die niet in trainingsdata zaten

## Implementatie Details

### Script Structuur
```
parameter_tuning/
├── data_loader.py          # Laad alle RTF bestanden en maak database
├── similarity_calculator.py # Hergebruik bestaande similarity functies
├── price_calculator.py      # Hergebruik bestaande prijsberekening
├── optimizer.py            # Grid/Random/Bayesian optimization
├── evaluator.py            # Bereken metrics
└── main.py                 # Hoofdscript
```

### Locatie Filtering
- **Optie 1**: Postcode gebied (eerste 4 cijfers)
- **Optie 2**: Buurt (als beschikbaar in data)
- **Optie 3**: Geocoding + radius (binnen X km)
- **Aanbeveling**: Start met postcode gebied, voeg geocoding toe als nodig

### Performance Overwegingen
- **Caching**: Cache similarity scores voor properties die meerdere keren worden gebruikt
- **Parallel processing**: Test meerdere parameter combinaties tegelijk
- **Progress tracking**: Sla tussenresultaten op, kan later hervatten

## Aanbevolen Aanpak

**Fase 1**: Start met **Bayesian Optimization** (Optuna)
- Snel en efficiënt
- Leert van resultaten
- Goede balans tussen snelheid en kwaliteit

**Fase 2**: Als Bayesian Optimization niet goed genoeg is, probeer **Machine Learning**
- Random Forest of XGBoost
- Kan complexe patronen leren
- Vereist meer data en tijd

## Output

Het script genereert:
1. **Best parameters**: Optimale parameter combinatie
2. **Performance report**: Metrics voor beste parameters
3. **Comparison table**: Vergelijking van verschillende parameter combinaties
4. **Visualizations**: Grafieken van accuracy vs parameters

## Vragen voor Bevestiging

1. **Locatie filtering**: Postcode gebied (eerste 4 cijfers) of geocoding + radius?
2. **Optimization methode**: Bayesian Optimization (aanbevolen) of Grid Search?
3. **Minimum aantal vergelijkbare properties**: Wat als er minder dan 10 vergelijkbare properties zijn?
4. **Outlier handling**: Moeten properties met extreme prijzen (outliers) worden uitgesloten?
5. **Train/Test split**: 80/20 of andere verhouding?
6. **Maximale runtime**: Hoe lang mag het script draaien? (Bayesian optimization kan uren duren met veel data)

## Geschatte Tijd

- **Data loading**: 5-10 minuten (afhankelijk van aantal bestanden)
- **Bayesian Optimization**: 1-4 uur (afhankelijk van data grootte en aantal iterations)
- **Grid Search**: 4-12 uur (veel langzamer)
- **Machine Learning**: 2-6 uur (inclusief feature engineering)

## Volgende Stappen

1. **Bevestig plan** met gebruiker
2. **Implementeer data loader** (Fase 1)
3. **Test op kleine subset** (bijv. 10 properties)
4. **Implementeer optimizer** (Fase 4)
5. **Run volledige tuning**
6. **Evalueer resultaten** en pas parameters aan in productie code


