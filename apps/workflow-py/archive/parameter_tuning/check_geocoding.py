#!/usr/bin/env python3
"""Check if data is already geocoded."""
import pandas as pd
from data_loader import load_all_realworks_files

df = load_all_realworks_files()
print(f'Total properties: {len(df)}')
print(f'Has lat: {df["lat"].notna().sum()} ({df["lat"].notna().sum()/len(df)*100:.1f}%)')
print(f'Has lng: {df["lng"].notna().sum()} ({df["lng"].notna().sum()/len(df)*100:.1f}%)')

missing = len(df) - df["lat"].notna().sum()
if df["lat"].notna().sum() == len(df) and df["lng"].notna().sum() == len(df):
    print("\nAll data is already geocoded! Can skip geocoding.")
else:
    print(f"\nMissing geocoding: {missing} properties need geocoding")

