#!/usr/bin/env python3
"""Quick status check."""
import json
from pathlib import Path
from datetime import datetime

output_dir = Path("parameter_tuning_results")
if not output_dir.exists():
    print("Output directory not found - optimization may not have started yet")
    exit(0)

# Check latest optimization results
result_files = list(output_dir.glob("optimization_results_*.json"))
if result_files:
    latest = max(result_files, key=lambda p: p.stat().st_mtime)
    mod_time = datetime.fromtimestamp(latest.stat().st_mtime)
    
    with open(latest, 'r') as f:
        data = json.load(f)
    
    trials = len(data.get('trial_results', []))
    best = data.get('best_params', {})
    
    print(f"Latest file: {latest.name}")
    print(f"Last modified: {mod_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Trials completed: {trials}")
    print(f"Best params so far: {best}")
    
    if trials >= 100:
        print("\n[OK] Optimization complete!")
    else:
        print(f"\n[RUNNING] Still running... ({trials}/100 trials)")
else:
    print("No optimization results found yet")

