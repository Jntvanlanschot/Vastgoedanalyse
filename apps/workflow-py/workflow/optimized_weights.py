#!/usr/bin/env python3
"""
Geoptimaliseerde similarity weights en price calculation parameters.
Resultaten van Bayesian Optimization (300 trials):
- Within 10%: 54.82%
- MAPE: 11.52%
"""

# Price calculation parameters
PRICE_CALC_TOP_N = 12
PRICE_CALC_MIN_SCORE = 0.55
PRICE_CALC_USE_SCORE_SQUARED = True

# Similarity weights (geoptimaliseerd)
OPTIMIZED_WEIGHTS = {
    'weight_street_name': 0.1,
    'weight_osm_street': 0.1,
    'weight_area': 0.33,
    'weight_distance': 0.18,
    'weight_garden': 0.02,
    'weight_rooms': 0.05,
    'weight_balcony': 0.11,
    'weight_energy_label': 0.35,
    'weight_sale_date': 0.11,
    'weight_year_built': 0.01,
    'weight_property_type': 0.06,
    'weight_vve_fee': 0.03,
    'weight_parking': 0.035,
    'weight_lift': 0.01,
    'gracht_penalty': 0.0035
}




