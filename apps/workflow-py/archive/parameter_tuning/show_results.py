#!/usr/bin/env python3
"""Show optimization results."""
import json
from pathlib import Path

summary_file = Path("parameter_tuning_results_improved/best_parameters_summary.json")
if not summary_file.exists():
    print("Summary file not found!")
    exit(1)

with open(summary_file, 'r') as f:
    d = json.load(f)

print("="*80)
print("BESTE PARAMETERS - VOLLEDIGE OPTIMIZATION")
print("="*80)

print("\nPRIJSBEREKENING PARAMETERS:")
print(f"  TOP_N: {d['best_parameters']['top_n']}")
print(f"  MIN_SCORE: {d['best_parameters']['min_score']} ({int(d['best_parameters']['min_score']*100)}%)")
print(f"  USE_SCORE_SQUARED: {d['best_parameters']['use_score_squared']}")

print("\nSIMILARITY WEIGHTS:")
weights = {k: v for k, v in d['best_parameters'].items() if k.startswith('weight_') or k == 'gracht_penalty'}
for k, v in sorted(weights.items()):
    if k == 'gracht_penalty':
        print(f"  {k}: {v:.4f} (penalty multiplier)")
    else:
        print(f"  {k}: {v:.4f}")

print("\nTEST SET PERFORMANCE:")
print(f"  Within 10%: {d['test_metrics']['within_10pct']:.2f}%")
print(f"  Within 15%: {d['test_metrics']['within_15pct']:.2f}%")
print(f"  MAPE: {d['test_metrics']['mape']:.2f}%")
print(f"  MAE: EUR {d['test_metrics']['mae']:,.0f}")
print(f"  RMSE: EUR {d['test_metrics']['rmse']:,.0f}")

print("\n" + "="*80)
print("VERGELIJKING MET VOORHEEN:")
print("="*80)
print("  Voorheen (zonder weights tuning): 52.00% binnen 10%")
print(f"  Nu (met weights tuning):         {d['test_metrics']['within_10pct']:.2f}% binnen 10%")
print(f"  Verbetering: +{d['test_metrics']['within_10pct'] - 52.00:.2f}%")
print("="*80)

