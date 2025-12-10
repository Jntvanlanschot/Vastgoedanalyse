# Parameter Tuning voor Vastgoedanalyse Tool

Dit script optimaliseert automatisch de parameters voor prijsberekening door alle Realworks bestanden te gebruiken als trainingsdata.

## Installatie

```bash
cd apps/workflow-py
pip install -r requirements.txt
```

## Gebruik

### Basis gebruik

```bash
python -m parameter_tuning.main
```

Dit zal:
1. Alle RTF bestanden uit `~/Downloads` laden
2. Outliers verwijderen
3. Geocoding toevoegen (kan lang duren!)
4. Train/test split maken (80/20)
5. Bayesian optimization runnen (100 trials)
6. Resultaten opslaan

### Geavanceerde opties

```bash
python -m parameter_tuning.main \
    --downloads-folder "C:/Users/meesv/Downloads" \
    --n-trials 200 \
    --test-size 0.2 \
    --max-distance 5.0 \
    --min-comparables 5 \
    --output-dir "tuning_results"
```

### Opties

- `--downloads-folder`: Pad naar Downloads folder (default: ~/Downloads)
- `--n-trials`: Aantal optimization trials (default: 100, meer = beter maar langzamer)
- `--test-size`: Test set grootte als fractie (default: 0.2 = 20%)
- `--max-distance`: Maximale afstand in km voor vergelijkbare properties (default: 5.0)
- `--min-comparables`: Minimum aantal vergelijkbare properties vereist (default: 5)
- `--output-dir`: Output directory voor resultaten (default: parameter_tuning_results)
- `--skip-geocoding`: Sla geocoding over (gebruik bestaande lat/lng als beschikbaar)

## Output

Het script genereert:

1. **best_parameters_summary.json**: Samenvatting met beste parameters en metrics
2. **optimization_results_YYYYMMDD_HHMMSS.json**: Volledige resultaten van alle trials
3. **train_data.csv**: Training dataset
4. **test_data.csv**: Test dataset

## Resultaten Toepassen

Na het runnen van het script, pas de beste parameters toe in `step4_generate_reports.py`:

```python
PRICE_CALC_TOP_N = <best_top_n>
PRICE_CALC_MIN_SCORE = <best_min_score>
PRICE_CALC_USE_SCORE_SQUARED = <best_use_score_squared>
```

## Performance

- **Geocoding**: ~1 seconde per property (rate limited door Nominatim)
- **Optimization**: ~1-4 uur voor 100 trials (afhankelijk van data grootte)
- **Memory**: ~500MB-2GB (afhankelijk van aantal properties)

## Troubleshooting

### Geocoding faalt
- Controleer internetverbinding
- Nominatim heeft rate limiting (1 request/seconde)
- Gebruik `--skip-geocoding` als je al geocoding data hebt

### Niet genoeg properties
- Zorg dat er minimaal 20 properties zijn na filtering
- Verlaag `--min-comparables` als er weinig vergelijkbare properties zijn

### Optimization duurt te lang
- Verlaag `--n-trials` (maar resultaten worden minder goed)
- Gebruik kleinere dataset voor snellere tests



