#!/usr/bin/env python3
"""Compare optimization runs."""
import json
from pathlib import Path

run1_file = Path("parameter_tuning_results_full_weights/best_parameters_summary.json")
run2_file = Path("parameter_tuning_results_improved/best_parameters_summary.json")

run1 = json.load(open(run1_file)) if run1_file.exists() else None
run2 = json.load(open(run2_file)) if run2_file.exists() else None

print("="*80)
print("VERGELIJKING BEIDE OPTIMIZATION RUNS")
print("="*80)

if run1:
    print("\nRun 1 (200 trials, verfijnde ranges):")
    print(f"  Within 10%: {run1['test_metrics']['within_10pct']:.2f}%")
    print(f"  Within 15%: {run1['test_metrics']['within_15pct']:.2f}%")
    print(f"  MAPE: {run1['test_metrics']['mape']:.2f}%")
    print(f"  TOP_N: {run1['best_parameters']['top_n']}")
    print(f"  MIN_SCORE: {run1['best_parameters']['min_score']}")

if run2:
    print("\nRun 2 (500 trials, verfijnde ranges):")
    print(f"  Within 10%: {run2['test_metrics']['within_10pct']:.2f}%")
    print(f"  Within 15%: {run2['test_metrics']['within_15pct']:.2f}%")
    print(f"  MAPE: {run2['test_metrics']['mape']:.2f}%")
    print(f"  TOP_N: {run2['best_parameters']['top_n']}")
    print(f"  MIN_SCORE: {run2['best_parameters']['min_score']}")

if run1 and run2:
    print("\n" + "="*80)
    if run1['test_metrics']['within_10pct'] > run2['test_metrics']['within_10pct']:
        print("BESTE RUN: Run 1 (200 trials)")
        best = run1
        best_file = run1_file
    else:
        print("BESTE RUN: Run 2 (500 trials)")
        best = run2
        best_file = run2_file
    
    print(f"  Within 10%: {best['test_metrics']['within_10pct']:.2f}%")
    print(f"  Within 15%: {best['test_metrics']['within_15pct']:.2f}%")
    print(f"  MAPE: {best['test_metrics']['mape']:.2f}%")
    print("="*80)
    
    print("\nBeste parameters om te gebruiken:")
    print(f"  TOP_N: {best['best_parameters']['top_n']}")
    print(f"  MIN_SCORE: {best['best_parameters']['min_score']} ({int(best['best_parameters']['min_score']*100)}%)")
    print(f"  USE_SCORE_SQUARED: {best['best_parameters']['use_score_squared']}")
    
    if 'weight_area' in best['best_parameters']:
        print("\nSimilarity Weights:")
        weights = {k: v for k, v in best['best_parameters'].items() if k.startswith('weight_') or k == 'gracht_penalty'}
        for k, v in sorted(weights.items()):
            print(f"  {k}: {v:.4f}")




