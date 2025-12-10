#!/usr/bin/env python3
"""
Monitor progress of parameter tuning optimization.
"""

import time
import json
from pathlib import Path
from datetime import datetime
import os

def check_progress(output_dir="parameter_tuning_results_full"):
    """Check progress of optimization."""
    output_path = Path(output_dir)
    
    if not output_path.exists():
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Output directory not found yet...")
        return False
    
    # Check for summary file
    summary_file = output_path / "best_parameters_summary.json"
    if summary_file.exists():
        try:
            with open(summary_file, 'r') as f:
                summary = json.load(f)
            
            print("\n" + "="*80)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] OPTIMIZATION COMPLETE!")
            print("="*80)
            print(f"\nBest Parameters:")
            if 'best_parameters' in summary:
                params = summary['best_parameters']
                print(f"  TOP_N: {params.get('top_n', 'N/A')}")
                print(f"  MIN_SCORE: {params.get('min_score', 'N/A')} ({int(params.get('min_score', 0) * 100)}%)")
                print(f"  USE_SCORE_SQUARED: {params.get('use_score_squared', 'N/A')}")
            
            if 'test_metrics' in summary:
                metrics = summary['test_metrics']
                print(f"\nTest Set Performance:")
                print(f"  Within 10%: {metrics.get('within_10pct', 0):.2f}%")
                print(f"  Within 15%: {metrics.get('within_15pct', 0):.2f}%")
                print(f"  MAPE: {metrics.get('mape', 0):.2f}%")
                print(f"  MAE: €{metrics.get('mae', 0):,.0f}")
                print(f"  RMSE: €{metrics.get('rmse', 0):,.0f}")
            
            print(f"\nTotal properties: {summary.get('total_properties', 'N/A')}")
            print(f"Train size: {summary.get('train_size', 'N/A')}")
            print(f"Test size: {summary.get('test_size', 'N/A')}")
            print(f"Trials: {summary.get('n_trials', 'N/A')}")
            print("="*80 + "\n")
            return True
        except Exception as e:
            print(f"Error reading summary: {e}")
    
    # Check for optimization results files
    result_files = list(output_path.glob("optimization_results_*.json"))
    if result_files:
        latest_file = max(result_files, key=lambda p: p.stat().st_mtime)
        try:
            with open(latest_file, 'r') as f:
                data = json.load(f)
            
            if 'trial_results' in data and len(data['trial_results']) > 0:
                trials = data['trial_results']
                latest_trial = trials[-1]
                
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Progress Update:")
                print(f"  Trials completed: {len(trials)}")
                print(f"  Latest trial: {latest_trial.get('trial_number', 'N/A')}")
                print(f"  Latest score: {latest_trial.get('within_10pct', 0):.2f}% within 10%")
                print(f"  Latest MAPE: {latest_trial.get('mape', 0):.2f}%")
                
                if 'best_params' in data:
                    print(f"\n  Current best parameters:")
                    print(f"    TOP_N: {data['best_params'].get('top_n', 'N/A')}")
                    print(f"    MIN_SCORE: {data['best_params'].get('min_score', 'N/A')}")
                    print(f"    USE_SCORE_SQUARED: {data['best_params'].get('use_score_squared', 'N/A')}")
                
                return False  # Still running
        except Exception as e:
            print(f"Error reading results: {e}")
    
    # Check for train/test data files (indicates optimization started)
    train_file = output_path / "train_data.csv"
    test_file = output_path / "test_data.csv"
    
    if train_file.exists() and test_file.exists():
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Optimization in progress...")
        print(f"  Train/test split completed")
        print(f"  Waiting for optimization results...")
        return False
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Still loading data or geocoding...")
    return False

def main():
    """Monitor progress every 5 minutes."""
    print("="*80)
    print("PARAMETER TUNING PROGRESS MONITOR")
    print("="*80)
    print("Checking every 5 minutes...")
    print("Press Ctrl+C to stop\n")
    
    try:
        while True:
            if check_progress():
                print("\nOptimization complete! Exiting monitor.")
                break
            
            print(f"\nNext check in 5 minutes...\n")
            time.sleep(300)  # 5 minutes
            
    except KeyboardInterrupt:
        print("\n\nMonitor stopped by user.")

if __name__ == "__main__":
    main()

