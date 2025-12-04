# Parameter Tuning Implementatie - Samenvatting

## ✅ Wat is geïmplementeerd

### 1. Data Loader (`data_loader.py`)
- ✅ Laadt alle RTF bestanden uit Downloads folder
- ✅ Parseert Realworks data
- ✅ Filtert op geldige properties (prijs, oppervlakte, adres)
- ✅ Detecteert en verwijdert outliers (IQR methode)

### 2. Geocoding (`geocoding.py`)
- ✅ Geocodeert adressen naar lat/lng (Nominatim als fallback)
- ✅ Berekent afstand tussen properties (Haversine formula)
- ✅ Extraheert postcode gebied (eerste 4 cijfers)
- ✅ Rate limiting voor Nominatim (1 request/seconde)

### 3. Similarity Calculator (`similarity_calculator.py`)
- ✅ Hergebruikt bestaande `calculate_simple_similarity_score` functie
- ✅ Berekent similarity scores voor alle vergelijkbare properties

### 4. Price Calculator (`price_calculator.py`)
- ✅ Berekent verwachte prijs met verschillende parameters
- ✅ Ondersteunt: TOP_N, MIN_SCORE, USE_SCORE_SQUARED
- ✅ Past energy label correctie toe

### 5. Evaluator (`evaluator.py`)
- ✅ Berekent metrics: MAPE, MAE, RMSE
- ✅ Berekent percentage binnen 10% en 15%

### 6. Optimizer (`optimizer.py`)
- ✅ Bayesian Optimization met Optuna
- ✅ Zoekt vergelijkbare properties (postcode + afstand)
- ✅ Evalueert parameter combinaties
- ✅ Slaat resultaten op

### 7. Main Script (`main.py`)
- ✅ Complete workflow: data laden → geocoding → train/test split → optimization
- ✅ Command-line interface
- ✅ Slaat resultaten op in JSON en CSV

## 📋 Gebruik

### Installatie
```bash
cd apps/workflow-py
pip install -r requirements.txt
```

### Basis gebruik
```bash
python -m parameter_tuning.main
```

### Met opties
```bash
python -m parameter_tuning.main \
    --n-trials 200 \
    --max-distance 5.0 \
    --min-comparables 5 \
    --output-dir "tuning_results"
```

## ⚙️ Parameters die worden geoptimaliseerd

1. **PRICE_CALC_TOP_N**: 3-15 (aantal matches)
2. **PRICE_CALC_MIN_SCORE**: 0.50-0.80 (minimum score threshold)
3. **PRICE_CALC_USE_SCORE_SQUARED**: True/False (score² weging)

## 📊 Output

Het script genereert:
- `best_parameters_summary.json`: Beste parameters en metrics
- `optimization_results_*.json`: Volledige trial resultaten
- `train_data.csv` / `test_data.csv`: Datasets

## ⏱️ Geschatte tijd

- **Geocoding**: ~1 seconde per property (kan uren duren voor 100+ properties)
- **Optimization**: 1-4 uur voor 100 trials
- **Totaal**: 2-6 uur (afhankelijk van aantal properties)

## 🔧 Resultaten toepassen

Na het runnen, pas de beste parameters toe in `step4_generate_reports.py`:

```python
PRICE_CALC_TOP_N = <best_top_n>
PRICE_CALC_MIN_SCORE = <best_min_score>
PRICE_CALC_USE_SCORE_SQUARED = <best_use_score_squared>
```

## ⚠️ Belangrijke opmerkingen

1. **Geocoding duurt lang**: Voor 100 properties = ~100 seconden (1.5 minuut)
2. **Optimization duurt lang**: 100 trials kan 1-4 uur duren
3. **Internet vereist**: Voor geocoding (Nominatim API)
4. **Minimaal 20 properties**: Vereist voor train/test split

## 🚀 Volgende stappen

1. **Test op kleine dataset**: Run eerst met `--n-trials 10` om te testen
2. **Check geocoding**: Zorg dat geocoding werkt voor je adressen
3. **Run volledige optimization**: Met `--n-trials 100` of meer
4. **Pas parameters toe**: Update `step4_generate_reports.py` met beste parameters

## 📝 Notities

- Het script gebruikt **Bayesian Optimization** (Optuna) voor efficiënte parameter search
- **Train/Test split** van 80/20 voor betrouwbare validatie
- **Outlier detection** verwijdert extreme prijzen (>3x mediaan of <0.1x mediaan)
- **Postcode + afstand filtering** voor relevante vergelijkbare properties



