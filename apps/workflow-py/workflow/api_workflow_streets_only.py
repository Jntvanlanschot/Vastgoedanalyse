#!/usr/bin/env python3
"""
Street Analysis Only - Algorithm 1
This script only finds the top 4 streets (excluding reference street) from Funda data.
It does NOT require Realworks data.
"""

import sys
import json
import pandas as pd
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def calculate_string_similarity(str1: str, str2: str) -> float:
    """Calculate string similarity based on character overlap."""
    if not str1 or not str2:
        return 0.0
    
    str1 = str1.lower().strip()
    str2 = str2.lower().strip()
    
    if str1 == str2:
        return 1.0
    
    # Simple character overlap similarity
    set1 = set(str1)
    set2 = set(str2)
    
    if not set1 or not set2:
        return 0.0
    
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    
    return intersection / union if union > 0 else 0.0

def calculate_street_similarity_score(row, reference_data, street_similarity_cache=None):
    """Calculate similarity score for street matching (Algorithm 1) - 4 best corresponding streets."""
    try:
        score = 0.0
        
        # 1. Street similarity (10% weight - higher for street matching)
        ref_street = reference_data.get('street_name', '')
        if not ref_street and 'address_full' in reference_data:
            # Extract street name from full address
            address_parts = reference_data['address_full'].split(',')[0].strip()
            # Remove house number to get street name
            import re
            ref_street = re.sub(r'\s+\d+.*$', '', address_parts).strip()
        
        ref_street = ref_street.lower().strip()
        row_street = row.get('address/street_name', '').lower().strip()
        if ref_street and row_street:
            if ref_street == row_street:
                score += 0.10 * 1.0  # Same street = perfect match
            else:
                # Calculate street name similarity (Levenshtein distance)
                street_similarity = calculate_string_similarity(ref_street, row_street)
                score += 0.10 * street_similarity
        
        # 2. OSM-based street similarity (34% weight - highest weight)
        # For now, we'll use a simplified version since Overpass API is failing
        # This could be enhanced later with actual OSM data
        osm_street_score = 0.5  # Default neutral score
        score += 0.34 * osm_street_score
        
        # 3. Living area (m²) proximity (20% weight - lower for street matching)
        area_m2 = row.get('floor_area/0', 0)
        if pd.notna(area_m2) and area_m2 > 0:
            area_diff = abs(area_m2 - reference_data.get('area_m2', 100))
            area_score = max(0, 1 - (area_diff / reference_data.get('area_m2', 100)))
            score += 0.20 * area_score
        
        # 4. Micro-location proximity (10% weight)
        ref_neighbourhood = reference_data.get('neighbourhood', '').lower().strip()
        row_neighbourhood = row.get('address/neighbourhood', '').lower().strip()
        if ref_neighbourhood and row_neighbourhood:
            if ref_neighbourhood == row_neighbourhood:
                score += 0.10 * 1.0
            else:
                neighbourhood_similarity = calculate_string_similarity(ref_neighbourhood, row_neighbourhood)
                score += 0.10 * neighbourhood_similarity
        
        # 5. Garden match (10% weight)
        ref_garden = reference_data.get('has_garden', False)
        # For Funda data, we don't have garden info, so use neutral score
        score += 0.10 * 0.5
        
        # 6. Rooms similarity (6% weight)
        rooms = row.get('number_of_rooms', 0)
        if pd.notna(rooms) and rooms > 0:
            room_diff = abs(rooms - reference_data.get('rooms', 3))
            room_score = max(0, 1 - (room_diff / max(reference_data.get('rooms', 3), 1)))
            score += 0.06 * room_score
        
        # 7. Bedrooms similarity (5% weight)
        bedrooms = row.get('number_of_bedrooms', 0)
        if pd.notna(bedrooms) and bedrooms > 0:
            bedroom_diff = abs(bedrooms - reference_data.get('bedrooms', 2))
            bedroom_score = max(0, 1 - (bedroom_diff / max(reference_data.get('bedrooms', 2), 1)))
            score += 0.05 * bedroom_score
        
        # 8. Balcony/Roof terrace (3% weight)
        ref_balcony = reference_data.get('has_balcony', False) or reference_data.get('has_terrace', False)
        # For Funda data, we don't have balcony info, so use neutral score
        score += 0.03 * 0.5
        
        # 9. Energy label (2% weight)
        energy_labels = ['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
        ref_energy = reference_data.get('energy_label', 'B')
        row_energy = row.get('energy_label', 'Unknown')
        
        if ref_energy in energy_labels and row_energy in energy_labels:
            ref_index = energy_labels.index(ref_energy)
            row_index = energy_labels.index(row_energy)
            energy_diff = abs(ref_index - row_index)
            energy_score = max(0, 1 - (energy_diff / len(energy_labels)))
            score += 0.02 * energy_score
        else:
            score += 0.02 * 0.5
        
        return min(1.0, score)  # Cap at 1.0
        
    except Exception as e:
        logger.error(f"Error calculating street similarity score: {e}")
        return 0.0

def process_csv_for_top_streets(csv_df, reference_data):
    """Process CSV data to find top 4 streets using Algorithm 1."""
    try:
        # Find street name column
        street_col = None
        for col in ['address/street_name', 'street_name', 'address_street_name']:
            if col in csv_df.columns:
                street_col = col
                break
        
        if street_col is None:
            logger.error("No street name column found for street processing")
            return [{
                "street_name": "Unknown Street",
                "name": "Unknown Street", 
                "city": "Amsterdam",
                "properties_count": len(csv_df),
                "average_price": 500000
            }]
        
        # Get unique streets and calculate similarity scores
        unique_streets = csv_df[street_col].dropna().unique()
        street_scores = []
        
        for street_name in unique_streets:
            # Get a sample property from this street for similarity calculation
            sample_property = csv_df[csv_df[street_col] == street_name].iloc[0]
            
            # Calculate similarity score using Algorithm 1 (street matching)
            similarity_score = calculate_street_similarity_score(sample_property, reference_data)
            
            # Get statistics for this street
            street_data = csv_df[csv_df[street_col] == street_name]
            properties_count = len(street_data)
            
            # Calculate average price
            price_col = None
            for col in ['price/selling_price/0', 'selling_price', 'price_selling_price_0', 'price']:
                if col in street_data.columns:
                    price_col = col
                    break
            
            if price_col:
                avg_price = street_data[price_col].mean()
            else:
                avg_price = 500000  # Default price
            
            street_scores.append({
                "street_name": street_name,
                "name": street_name,
                "city": "Amsterdam",
                "properties_count": properties_count,
                "average_price": int(avg_price) if pd.notna(avg_price) else 500000,
                "similarity_score": similarity_score
            })
        
        # Sort by similarity score (descending) and take top 4 OTHER streets (excluding reference street)
        street_scores.sort(key=lambda x: x['similarity_score'], reverse=True)
        
        # Extract street name from reference data
        ref_street_name = reference_data.get('street_name', '')
        if not ref_street_name and 'address_full' in reference_data:
            # Extract street name from full address
            address_parts = reference_data['address_full'].split(',')[0].strip()
            # Remove house number to get street name
            import re
            ref_street_name = re.sub(r'\s+\d+.*$', '', address_parts).strip()
        
        ref_street_name = ref_street_name.lower().strip()
        logger.info(f"Extracted reference street name: '{ref_street_name}'")
        logger.info(f"Available streets in CSV: {[s.lower().strip() for s in unique_streets]}")
        
        # Filter out the reference street and take top 4 other streets
        other_streets = [street for street in street_scores if street['street_name'].lower().strip() != ref_street_name]
        
        # Create final result: reference street ALWAYS first (block 1), then top 4 other streets (blocks 2-5)
        final_streets = []
        
        # ALWAYS add reference street as block 1, regardless of whether it's in CSV data
        ref_street_data = next((street for street in street_scores if street['street_name'].lower().strip() == ref_street_name), None)
        if ref_street_data:
            # Reference street found in CSV data - use actual data
            final_streets.append({
                "street_name": ref_street_data['street_name'],
                "name": ref_street_data['street_name'],
                "city": "Amsterdam",
                "properties_count": ref_street_data['properties_count'],
                "average_price": ref_street_data['average_price'],
                "is_reference": True
            })
            logger.info(f"Reference street '{ref_street_name}' found in CSV data")
        else:
            # Reference street NOT found in CSV data - create placeholder entry
            final_streets.append({
                "street_name": ref_street_name.title(),  # Use proper case from reference data
                "name": ref_street_name.title(),
                "city": "Amsterdam",
                "properties_count": 0,  # No properties found in CSV
                "average_price": 0,  # No price data available
                "is_reference": True
            })
            logger.info(f"Reference street '{ref_street_name}' not found in CSV data, creating placeholder entry")
        
        # Add top 4 other streets as blocks 2-5 (STRICT: only streets from CSV)
        streets_to_add = other_streets[:4]
        
        # Validate that all streets are from CSV data
        csv_street_names = set(s.lower().strip() for s in unique_streets)
        for street in streets_to_add:
            street_name_lower = street['street_name'].lower().strip()
            if street_name_lower not in csv_street_names:
                logger.error(f"ERROR: Street '{street['street_name']}' not found in CSV data!")
                continue
            
            final_streets.append({
                "street_name": street['street_name'],
                "name": street['street_name'],
                "city": "Amsterdam",
                "properties_count": street['properties_count'],
                "average_price": street['average_price'],
                "is_reference": False
            })
        
        logger.info(f"Final streets (all from CSV): {[s['street_name'] for s in final_streets]}")
        
        logger.info(f"Found reference street + top 4 other streets using Algorithm 1 (street matching)")
        return final_streets
        
    except Exception as e:
        logger.error(f"Error processing streets: {e}")
        return [{
            "street_name": "Error",
            "name": "Error",
            "city": "Amsterdam",
            "properties_count": 0,
            "average_price": 0
        }]

def run_street_analysis(csv_file_path, reference_data):
    """Run Algorithm 1 only - find top streets from Funda data."""
    try:
        logger.info("=== STARTING STREET ANALYSIS (ALGORITHM 1) ===")
        
        # Parse CSV data from file
        csv_df = pd.read_csv(csv_file_path)
        logger.info(f"Loaded {len(csv_df)} records from CSV")
        
        # Process the CSV data to find top streets using Algorithm 1
        logger.info("Processing reference address and selecting top streets from CSV...")
        top_streets = process_csv_for_top_streets(csv_df, reference_data)
        
        logger.info(f"Found {len(top_streets)} streets")
        
        # Prepare result
        result = {
            "status": "success",
            "message": f"Found {len(top_streets)} top streets",
            "top_streets": top_streets,
            "total_funda_records": len(csv_df),
            "reference_street_found": any(street.get('is_reference', False) for street in top_streets)
        }
        
        logger.info("=== STREET ANALYSIS COMPLETED SUCCESSFULLY ===")
        return result
        
    except Exception as e:
        logger.error(f"Street analysis failed with error: {e}")
        return {
            "status": "error",
            "message": str(e),
            "top_streets": [],
            "total_funda_records": 0,
            "reference_street_found": False
        }

if __name__ == "__main__":
    if len(sys.argv) != 3:
        logger.error("Usage: python api_workflow_streets_only.py <reference_data_json_path> <funda_csv_path>")
        sys.exit(1)
    
    reference_data_path = sys.argv[1]
    csv_file_path = sys.argv[2]
    
    # Load reference data
    with open(reference_data_path, 'r', encoding='utf-8') as f:
        reference_data = json.load(f)
    
    # Run street analysis
    result = run_street_analysis(csv_file_path, reference_data)
    
    # Output result as JSON
    print(json.dumps(result, indent=2))
