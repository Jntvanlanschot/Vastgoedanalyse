#!/usr/bin/env python3
"""Check optimization progress for date-based run."""
import json
from pathlib import Path
from datetime import datetime

output_dir = Path("parameter_tuning_results_with_date")
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

print("="*80)
print("OPTIMIZATION PROGRESS (WITH SALE_DATE FACTOR)")
print("="*80)
print(f"Last updated: {mod_time.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"Trials completed: {n_trials}/300")
print(f"Progress: {n_trials/300*100:.1f}%")
print(f"\nBest trial so far (#{best_trial.get('trial_number', '?')}):")
print(f"  Score: {best_score:.2f}")
print(f"  Within 10%: {best_trial.get('within_10pct', 0):.2f}%")
print(f"  MAPE: {best_trial.get('mape', 0):.2f}%")
print(f"\nParameters:")
print(f"  TOP_N: {best_trial.get('top_n', 'N/A')}")
print(f"  MIN_SCORE: {best_trial.get('min_score', 'N/A')}")
if 'weight_sale_date' in best_trial:
    print(f"  Weight Sale Date: {best_trial.get('weight_sale_date', 0):.4f}")
    print(f"  Weight Area: {best_trial.get('weight_area', 0):.3f}")
    print(f"  Weight Energy: {best_trial.get('weight_energy_label', 0):.3f}")
print("="*80)

# Estimate time remaining
if n_trials > 1:
    avg_time_per_trial = 600  # seconds
    remaining_trials = 300 - n_trials
    remaining_time = (remaining_trials * avg_time_per_trial) / 3600  # hours
    print(f"\nEstimated time remaining: ~{remaining_time:.1f} hours")
    print("="*80)




