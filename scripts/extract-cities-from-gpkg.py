#!/usr/bin/env python3
"""
Extract specific cities from GPKG file and convert to GeoJSON.
This script filters the large wijkenbuurten_2025_v1.gpkg file to extract
only specific cities (Amsterdam, Rotterdam, Utrecht) and saves them as GeoJSON.
"""

import sys
import json
from pathlib import Path

try:
    import geopandas as gpd
except ImportError:
    print("ERROR: geopandas is required. Install with: pip install geopandas")
    sys.exit(1)

# City names to extract (case-insensitive matching)
CITIES_TO_EXTRACT = ['amsterdam', 'rotterdam', 'utrecht']

# Input and output paths
GPKG_PATH = Path(r"C:\Users\meesv\Downloads\WijkBuurtkaart_2025_v1\WijkBuurtkaart_2025_v1\wijkenbuurten_2025_v1.gpkg")
OUTPUT_DIR = Path(__file__).parent.parent / "public" / "data"

def extract_cities():
    """Extract specific cities from GPKG and save as GeoJSON."""
    
    if not GPKG_PATH.exists():
        print(f"ERROR: GPKG file not found: {GPKG_PATH}")
        return
    
    print(f"[*] Reading GPKG file: {GPKG_PATH}")
    print(f"    File size: {GPKG_PATH.stat().st_size / (1024*1024):.2f} MB")
    
    # Read the GPKG file
    try:
        gdf = gpd.read_file(GPKG_PATH)
        print(f"[OK] Loaded {len(gdf)} features")
        print(f"    Columns: {list(gdf.columns)}")
    except Exception as e:
        print(f"ERROR: Failed to read GPKG: {e}")
        return
    
    # Check which column contains city/municipality name
    # Common column names: gemeente, gemeentenaam, municipality, stad, city
    city_column = None
    for col in ['gemeente', 'gemeentenaam', 'municipality', 'stad', 'city', 'GM_NAAM']:
        if col in gdf.columns:
            city_column = col
            print(f"[OK] Found city column: {city_column}")
            break
    
    if not city_column:
        print("WARNING: Could not find city column. Available columns:")
        for col in gdf.columns:
            print(f"   - {col}")
        print("\nPlease check the GPKG structure and update the script.")
        return
    
    # Show unique cities in the dataset
    unique_cities = gdf[city_column].str.lower().unique()
    print(f"\n[*] Found {len(unique_cities)} unique cities in dataset")
    print(f"    First 10 cities: {sorted(unique_cities)[:10]}")
    
    # Extract each city
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    all_features = []
    
    for city_name in CITIES_TO_EXTRACT:
        print(f"\n[*] Extracting: {city_name.upper()}")
        
        # Filter by city (case-insensitive)
        city_gdf = gdf[gdf[city_column].str.lower() == city_name.lower()]
        
        if len(city_gdf) == 0:
            print(f"    WARNING: No features found for {city_name}")
            continue
        
        print(f"    [OK] Found {len(city_gdf)} features")
        
        # CRITICAL: Convert CRS to WGS84 (EPSG:4326) if not already
        if city_gdf.crs is None:
            print(f"    [*] No CRS found, assuming RD (EPSG:28992)")
            city_gdf.set_crs('EPSG:28992', inplace=True)
        
        print(f"    [*] Current CRS: {city_gdf.crs}")
        
        # Convert to WGS84 (EPSG:4326) - this is what Leaflet needs
        if city_gdf.crs.to_string() != 'EPSG:4326':
            print(f"    [*] Converting to WGS84 (EPSG:4326)...")
            city_gdf = city_gdf.to_crs('EPSG:4326')
            print(f"    [OK] Converted to WGS84")
        
        # Convert to GeoJSON
        geojson = city_gdf.to_json()
        
        # Save individual city file
        output_file = OUTPUT_DIR / f"buurten-{city_name.lower()}-wgs84.geojson"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(json.loads(geojson), f, indent=2, ensure_ascii=False)
        
        file_size = output_file.stat().st_size / (1024*1024)
        print(f"    [OK] Saved: {output_file.name} ({file_size:.2f} MB)")
        
        # Add to combined list
        all_features.append(city_gdf)
    
    # Create combined file for all extracted cities
    if all_features:
        print(f"\n[*] Creating combined file...")
        combined_gdf = gpd.GeoDataFrame(pd.concat(all_features, ignore_index=True))
        
        # Ensure combined file is also in WGS84
        if combined_gdf.crs.to_string() != 'EPSG:4326':
            print(f"    [*] Converting combined file to WGS84...")
            combined_gdf = combined_gdf.to_crs('EPSG:4326')
        
        geojson = combined_gdf.to_json()
        
        output_file = OUTPUT_DIR / "buurten-nl.geojson"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(json.loads(geojson), f, indent=2, ensure_ascii=False)
        
        file_size = output_file.stat().st_size / (1024*1024)
        print(f"    [OK] Saved: {output_file.name} ({file_size:.2f} MB)")
        print(f"    [OK] Contains {len(combined_gdf)} features from {len(CITIES_TO_EXTRACT)} cities")
    
    print(f"\n[OK] Done! Files saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    import pandas as pd
    try:
        extract_cities()
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

