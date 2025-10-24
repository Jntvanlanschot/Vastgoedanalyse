#!/usr/bin/env python3
"""
Find top 15 matches using PERFECT merged data.
"""

import pandas as pd
import logging
from typing import Dict, Any

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Default reference data for scoring - will be overridden by actual user data
DEFAULT_REFERENCE_DATA = {
    'address_full': "Onbekend adres",
    'area_m2': 100,
    'energy_label': 'B',
    'bedrooms': 2,
    'bathrooms': 1,
    'rooms': 3,
    'has_terrace': False,
    'has_balcony': False,
    'has_garden': False,
    'sun_orientation': 'zuid',
}

# Weights for scoring
WEIGHTS = {
    'area_m2': 0.30,
    'energy_label': 0.20,
    'bedrooms': 0.15,
    'bathrooms': 0.10,
    'rooms': 0.10,
    'outdoor_space': 0.15,
}

ENERGY_LABEL_MAP = {
    'A++++': 10, 'A+++': 9, 'A++': 8, 'A+': 7, 'A': 6,
    'B': 5, 'C': 4, 'D': 3, 'E': 2, 'F': 1, 'G': 0,
    'unknown': 0
}

def calculate_similarity_score(house: pd.Series, reference: Dict[str, Any]) -> float:
    """Calculate a similarity score for a house against the reference."""
    score = 0.0

    # Use Realworks data if available, otherwise Funda data
    house_area = house.get('rw_area_m2', house.get('living_area_m2', 0))
    if house_area > 0:
        area_diff = abs(house_area - reference['area_m2'])
        score += WEIGHTS['area_m2'] * max(0, 1 - (area_diff / 50))

    # Energy Label (prefer Realworks)
    house_energy = house.get('rw_energy_label', house.get('energy_label', 'unknown'))
    house_energy = ENERGY_LABEL_MAP.get(house_energy, 0)
    ref_energy = ENERGY_LABEL_MAP.get(reference['energy_label'], 0)
    energy_diff = abs(house_energy - ref_energy)
    score += WEIGHTS['energy_label'] * max(0, 1 - (energy_diff / 10))

    # Bedrooms (prefer Realworks)
    house_bedrooms = house.get('rw_bedrooms', house.get('number_of_bedrooms', 0))
    if house_bedrooms > 0:
        bedroom_diff = abs(house_bedrooms - reference['bedrooms'])
        score += WEIGHTS['bedrooms'] * max(0, 1 - (bedroom_diff / 3))

    # Bathrooms (prefer Realworks)
    house_bathrooms = house.get('rw_bathrooms', house.get('number_of_bedrooms', 0))
    if house_bathrooms > 0:
        bathroom_diff = abs(house_bathrooms - reference['bathrooms'])
        score += WEIGHTS['bathrooms'] * max(0, 1 - (bathroom_diff / 2))

    # Rooms (prefer Realworks)
    house_rooms = house.get('rw_rooms', house.get('rooms', 0))
    if house_rooms > 0:
        room_diff = abs(house_rooms - reference['rooms'])
        score += WEIGHTS['rooms'] * max(0, 1 - (room_diff / 5))

    # Outdoor space (prefer Realworks)
    outdoor_score = 0.0
    if reference['has_terrace'] and house.get('rw_has_terrace', house.get('has_terrace', False)):
        outdoor_score += 0.5
    if reference['has_balcony'] and house.get('rw_has_balcony', house.get('has_balcony', False)):
        outdoor_score += 0.3
    if reference['has_garden'] and house.get('rw_has_garden', house.get('has_garden', False)):
        outdoor_score += 0.2
    
    if (reference['has_terrace'] or reference['has_balcony'] or reference['has_garden']) and \
       (house.get('rw_has_terrace', house.get('has_terrace', False)) or 
        house.get('rw_has_balcony', house.get('has_balcony', False)) or 
        house.get('rw_has_garden', house.get('has_garden', False))):
        outdoor_score = max(outdoor_score, 0.5)

    score += WEIGHTS['outdoor_space'] * outdoor_score

    return score

def find_top15_perfect(reference_data=None):
    """Find top 15 matches using perfect merged data."""
    
    # Use provided reference data or defaults
    ref_data = reference_data or DEFAULT_REFERENCE_DATA
    
    logger.info(f"Using reference data: {ref_data.get('address_full', 'Unknown address')}")
    
    # Load perfect merged data
    df = pd.read_csv('outputs/perfect_merged_data_fixed.csv')
    logger.info(f"Loaded {len(df)} merged records")
    
    # Only consider records with Realworks data
    df_with_rw = df[df['match_type'] != 'no_match'].copy()
    logger.info(f"Records with Realworks data: {len(df_with_rw)}")
    
    # Calculate similarity scores
    df_with_rw['similarity_score'] = df_with_rw.apply(lambda row: calculate_similarity_score(row, ref_data), axis=1)
    
    # Sort by score and select top 15
    top15_df = df_with_rw.sort_values(by='similarity_score', ascending=False).head(15).copy()
    
    # Add final_score column
    top15_df['final_score'] = top15_df['similarity_score']
    
    # Save top 15
    top15_df.to_csv('outputs/top15_perfect_matches.csv', index=False)
    logger.info(f"Top 15 perfect matches saved to: outputs/top15_perfect_matches.csv")
    
    print("\n=== TOP 15 PERFECTE MATCHES ===")
    print(f"Referentie: {ref_data.get('address_full', 'Unknown address')}")
    print(f"Referentie eigenschappen: {ref_data.get('area_m2', 0)}m², {ref_data.get('energy_label', 'Unknown')}, {ref_data.get('bedrooms', 0)} slaapkamers, {ref_data.get('bathrooms', 0)} badkamers")
    
    # Calculate average price per m2 for top 15
    valid_prices_per_m2 = []
    for i, row in top15_df.iterrows():
        sale_price = row.get('rw_sale_price', 0)
        area_m2 = row.get('rw_area_m2', 0)
        if pd.notna(sale_price) and sale_price > 0 and pd.notna(area_m2) and area_m2 > 0:
            valid_prices_per_m2.append(sale_price / area_m2)
    
    avg_price_per_m2 = sum(valid_prices_per_m2) / len(valid_prices_per_m2) if valid_prices_per_m2 else 0
    
    for i, row in top15_df.iterrows():
        address = f"{row['address/street_name']} {row['address/house_number']}{row['address/house_number_suffix']}"
        sale_price = f"€{row.get('rw_sale_price', 0):,.0f}" if row.get('rw_sale_price', 0) > 0 else 'Onbekend'
        area = f"{row.get('rw_area_m2', 'N/A')}m²" if pd.notna(row.get('rw_area_m2')) else 'Onbekend'
        energy_label = row.get('rw_energy_label', 'unknown')
        bedrooms = row.get('rw_bedrooms', 'Onbekend')
        bathrooms = row.get('rw_bathrooms', 'Onbekend')
        year_built = row.get('rw_year_built', 'Onbekend')
        has_garden = 'Ja' if row.get('rw_has_garden', False) else 'Nee'
        maintenance_inside = row.get('rw_maintenance_inside', 'Onbekend')
        maintenance_outside = row.get('rw_maintenance_outside', 'Onbekend')
        score = f"{row['similarity_score']:.3f}"
        
        print(f"\n{i+1}. {address}")
        print(f"   Verkoopprijs: {sale_price} | Oppervlakte: {area} | Energielabel: {energy_label}")
        print(f"   Slaapkamers: {bedrooms} | Badkamers: {bathrooms} | Bouwjaar: {year_built}")
        print(f"   Tuin: {has_garden} | Onderhoud binnen: {maintenance_inside} | Onderhoud buiten: {maintenance_outside}")
        print(f"   Score: {score}")
    
    print(f"\nGemiddelde prijs per m² van top 15: €{avg_price_per_m2:,.0f}")

if __name__ == "__main__":
    find_top15_perfect()
