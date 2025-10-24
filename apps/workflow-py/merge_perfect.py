#!/usr/bin/env python3
"""
PERFECTE merge script - behoudt Funda data en vult aan met Realworks.
"""

import pandas as pd
import logging
from typing import Dict, List, Optional
import re

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def normalize_address_key(address: str) -> str:
    """Normalize address for consistent matching."""
    return re.sub(r'[^\w\s]', '', address.lower()).strip()

def build_funda_address_key(row: pd.Series) -> str:
    """Build consistent address key for Funda data."""
    street = str(row['address/street_name']).lower().strip()
    house_num = str(row['address/house_number']).strip()
    house_suffix = str(row['address/house_number_suffix']).strip() if pd.notna(row['address/house_number_suffix']) and str(row['address/house_number_suffix']) != 'nan' else ''
    postal_code = str(row['address/postal_code']).replace(' ', '').strip()
    city = str(row['address/city']).lower().strip()
    
    # Combine house number and suffix
    full_house_num = house_num + house_suffix
    
    # Create key: street + house_number + postal_code + city
    key = f"{street} {full_house_num} {postal_code} {city}"
    return normalize_address_key(key)

def build_realworks_address_key(row: pd.Series) -> str:
    """Build consistent address key for Realworks data."""
    street = str(row['street']).lower().strip()
    house_num = str(row['house_number']).strip()
    postal_code = str(row['postal_code']).strip()
    city = str(row['city']).lower().strip()
    
    # Create key: street + house_number + postal_code + city
    key = f"{street} {house_num} {postal_code} {city}"
    return normalize_address_key(key)

def merge_funda_realworks_perfect():
    """Perfect merge: keep all Funda data, add Realworks columns."""
    
    # Load Funda data
    funda_df = pd.read_csv('dataset_funda-nl-scraper_2025-10-21_11-18-05-402.csv')
    logger.info(f"Loaded {len(funda_df)} Funda records")
    
    # Remove duplicates from Funda
    funda_df['address_full'] = funda_df['address/street_name'] + ' ' + funda_df['address/house_number'].astype(str)
    funda_df['address_full'] = funda_df['address_full'] + funda_df['address/house_number_suffix'].fillna('')
    funda_df['address_full'] = funda_df['address_full'] + ', ' + funda_df['address/postal_code'] + ', ' + funda_df['address/city']
    
    funda_df = funda_df.drop_duplicates(subset=['address_full']).reset_index(drop=True)
    logger.info(f"After removing duplicates: {len(funda_df)} unique Funda records")
    
    # Load Realworks data
    realworks_df = pd.read_csv('realworks_perfect_data.csv')
    logger.info(f"Loaded {len(realworks_df)} Realworks records")
    
    # Build address keys
    funda_df['address_key'] = funda_df.apply(build_funda_address_key, axis=1)
    realworks_df['address_key'] = realworks_df.apply(build_realworks_address_key, axis=1)
    
    # Start with Funda data as base
    merged_df = funda_df.copy()
    
    # Add Realworks columns (prefixed with rw_)
    realworks_columns = [
        'sale_price', 'ask_price', 'sale_date', 'list_date', 'delist_date', 
        'transport_date', 'days_on_market', 'area_m2', 'rooms', 'bedrooms', 
        'bathrooms', 'toilets', 'year_built', 'type', 'subtype', 'energy_label',
        'maintenance_inside', 'maintenance_outside', 'vve_monthly_fee',
        'has_garden', 'garden_type', 'garden_area_m2', 'has_balcony', 
        'has_terrace', 'outdoor_text', 'heating', 'hot_water', 'has_lift',
        'floor', 'has_storage', 'has_parking', 'has_garage', 'garage_type',
        'notes', 'source_file'
    ]
    
    # Initialize Realworks columns
    for col in realworks_columns:
        merged_df[f'rw_{col}'] = None
    
    # Add match info columns
    merged_df['match_type'] = 'no_match'
    merged_df['match_score'] = 0
    merged_df['match_notes'] = ''
    
    # Perform matching
    matches_found = 0
    
    for i, funda_row in merged_df.iterrows():
        funda_key = funda_row['address_key']
        
        # Find Realworks match
        realworks_matches = realworks_df[realworks_df['address_key'] == funda_key]
        
        if len(realworks_matches) > 0:
            # Exact match found
            rw_row = realworks_matches.iloc[0]
            
            # Copy Realworks data to merged dataframe
            for col in realworks_columns:
                merged_df.at[i, f'rw_{col}'] = rw_row[col]
            
            merged_df.at[i, 'match_type'] = 'exact'
            merged_df.at[i, 'match_score'] = 100
            merged_df.at[i, 'match_notes'] = f"Exact match: {rw_row['address_full']}"
            matches_found += 1
            
        else:
            # Try fuzzy matching
            best_match = None
            best_score = 0
            
            for j, rw_row in realworks_df.iterrows():
                rw_key = rw_row['address_key']
                
                # Simple fuzzy matching based on common words
                funda_words = set(funda_key.split())
                rw_words = set(rw_key.split())
                
                if funda_words and rw_words:
                    common_words = funda_words.intersection(rw_words)
                    score = len(common_words) / max(len(funda_words), len(rw_words)) * 100
                    
                    if score > best_score and score > 50:  # Minimum 50% match
                        best_match = rw_row
                        best_score = score
            
            if best_match is not None:
                # Fuzzy match found
                for col in realworks_columns:
                    merged_df.at[i, f'rw_{col}'] = best_match[col]
                
                merged_df.at[i, 'match_type'] = 'fuzzy'
                merged_df.at[i, 'match_score'] = best_score
                merged_df.at[i, 'match_notes'] = f"Fuzzy match ({best_score:.1f}%): {best_match['address_full']}"
                matches_found += 1
    
    logger.info(f"Found {matches_found} matches out of {len(merged_df)} Funda records")
    
    # Save merged data
    output_file = 'outputs/perfect_merged_data.csv'
    merged_df.to_csv(output_file, index=False)
    logger.info(f"Perfect merged data saved to: {output_file}")
    
    # Show summary
    print("\n=== PERFECTE MERGE SAMENVATTING ===")
    print(f"Funda records: {len(funda_df)}")
    print(f"Realworks records: {len(realworks_df)}")
    print(f"Matches gevonden: {matches_found}")
    print(f"Match percentage: {matches_found/len(merged_df)*100:.1f}%")
    
    # Show sample matches
    print("\n=== TOP 10 MATCHES ===")
    matched_df = merged_df[merged_df['match_type'] != 'no_match'].copy()
    matched_df = matched_df.sort_values('rw_sale_price', ascending=False, na_position='last')
    
    for i, row in matched_df.head(10).iterrows():
        address = f"{row['address/street_name']} {row['address/house_number']}{row['address/house_number_suffix']}"
        sale_price = f"€{row['rw_sale_price']:,.0f}" if pd.notna(row['rw_sale_price']) else 'Onbekend'
        area = f"{row['rw_area_m2']}m²" if pd.notna(row['rw_area_m2']) else 'Onbekend'
        bedrooms = row['rw_bedrooms'] if pd.notna(row['rw_bedrooms']) else 'Onbekend'
        bathrooms = row['rw_bathrooms'] if pd.notna(row['rw_bathrooms']) else 'Onbekend'
        year_built = row['rw_year_built'] if pd.notna(row['rw_year_built']) else 'Onbekend'
        has_garden = 'Ja' if row['rw_has_garden'] else 'Nee'
        match_type = row['match_type']
        
        print(f"{i+1}. {address}")
        print(f"   Verkoopprijs: {sale_price} | Oppervlakte: {area}")
        print(f"   Slaapkamers: {bedrooms} | Badkamers: {bathrooms} | Bouwjaar: {year_built}")
        print(f"   Tuin: {has_garden} | Match: {match_type}")
        print()
    
    return merged_df

if __name__ == "__main__":
    merge_funda_realworks_perfect()

