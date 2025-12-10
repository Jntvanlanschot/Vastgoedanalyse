#!/usr/bin/env python3
"""Check optimization progress for enhanced features run."""
import json
from pathlib import Path
from datetime import datetime

output_dir = Path("parameter_tuning_results_enhanced")
if not output_dir.exists():
    print("Output directory not found")
    exit(0)

result_files = list(output_dir.glob("optimization_results_*.json"))
if not result_files:
    print("No optimization results found yet - still starting up...")
    exit(0)

latest = max(result_files, key=lambda p: p.stat().st_mtime)
mod_time = datetime.fromtimestamp(latest.stat().st_mtime)

with open(latest, 'r') as f:
    data = json.load(f)

trials = data.get('trial_results', [])
n_trials = len(trials)

if n_trials == 0:
    print("Optimization starting...")
    exit(0)

best_trial = max(trials, key=lambda t: t.get('within_10pct', 0) - (t.get('mape', 100) / 10))
best_score = best_trial.get('within_10pct', 0) - (best_trial.get('mape', 100) / 10)

print("=" * 80)
print("ENHANCED FEATURES OPTIMIZATION PROGRESS")
print("=" * 80)
print(f"Last update: {mod_time.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"Trials completed: {n_trials}/500 ({n_trials/5:.1f}%)")
print(f"Best trial: #{best_trial.get('trial_number', '?')}")
print(f"Best score: {best_score:.2f}")
print(f"  - Within 10%: {best_trial.get('within_10pct', 0):.2f}%")
print(f"  - MAPE: {best_trial.get('mape', 0):.2f}%")
print(f"  - Within 15%: {best_trial.get('within_15pct', 0):.2f}%")
print()
print("Best parameters:")
print(f"  TOP_N: {best_trial.get('top_n', '?')}")
print(f"  MIN_SCORE: {best_trial.get('min_score', '?'):.2f} ({best_trial.get('min_score', 0)*100:.0f}%)")
print(f"  USE_SCORE_SQUARED: {best_trial.get('use_score_squared', '?')}")
print()
if best_trial.get('weight_year_built'):
    print("New weights:")
    print(f"  weight_year_built: {best_trial.get('weight_year_built', 0):.4f}")
    print(f"  weight_property_type: {best_trial.get('weight_property_type', 0):.4f}")
    print(f"  weight_vve_fee: {best_trial.get('weight_vve_fee', 0):.4f}")
    print(f"  weight_parking: {best_trial.get('weight_parking', 0):.4f}")
    print(f"  weight_lift: {best_trial.get('weight_lift', 0):.4f}")
print("=" * 80)




