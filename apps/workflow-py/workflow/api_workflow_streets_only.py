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
import shutil

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

def calculate_osm_street_similarity(row, reference_data, street_similarity_cache=None):
    """Calculate OSM-based street similarity using cached street profiles."""
    try:
        # Get street names (convert to string to handle NaN/float values)
        # CRITICAL: Extract ref_street from address_full if needed
        ref_street = str(reference_data.get('street_name', '') or '')
        if not ref_street and 'address_full' in reference_data:
            import re
            address_parts = reference_data['address_full'].split(',')[0].strip()
            ref_street = re.sub(r'\s+\d+.*$', '', address_parts).strip()
        
        # Get street name from row - can be in different columns
        row_street = str(row.get('address/street_name', '') or '')
        if not row_street:
            row_street = str(row.get('street_name', '') or '')
        
        if not ref_street or not row_street:
            logger.error(f"[DEBUG] Missing data - ref_street='{ref_street}', row_street='{row_street}'")
            return 0.5  # Neutral score if missing data
        
        # Normalize street names to lowercase for comparison
        ref_street = str(ref_street).lower().strip()
        row_street = str(row_street).lower().strip()
        
        # Log what we're looking for
        if not hasattr(calculate_osm_street_similarity, '_logged_keys'):
            calculate_osm_street_similarity._logged_keys = set()
        key_log = f"ref='{ref_street}' row='{row_street}'"
        if key_log not in calculate_osm_street_similarity._logged_keys and len(calculate_osm_street_similarity._logged_keys) < 3:
            logger.info(f"[LOOKUP] Searching for: {key_log}")
            logger.info(f"[LOOKUP] Cache exists: {street_similarity_cache is not None}")
            if street_similarity_cache:
                logger.info(f"[LOOKUP] Cache keys available: {list(street_similarity_cache.keys())}")
            calculate_osm_street_similarity._logged_keys.add(key_log)
        
        # Use cached similarity scores if available
        if street_similarity_cache and ref_street in street_similarity_cache:
            ref_similarities = street_similarity_cache[ref_street]
            # Only log first few lookups to avoid spam
            if not hasattr(calculate_osm_street_similarity, '_logged_cache_keys'):
                calculate_osm_street_similarity._logged_cache_keys = set()
            if len(calculate_osm_street_similarity._logged_cache_keys) < 5:
                logger.info(f"[CACHE LOOKUP #{len(calculate_osm_street_similarity._logged_cache_keys)+1}] Looking for '{row_street}' with ref='{ref_street}' in cache with {len(ref_similarities)} entries")
                calculate_osm_street_similarity._logged_cache_keys.add(row_street)
            
            for similarity_data in ref_similarities:
                # Get street name from cache and normalize to lowercase for comparison
                cached_name_raw = similarity_data.get('street_name', '')
                cached_name = str(cached_name_raw).lower().strip()
                if cached_name == row_street:
                    cached_score = similarity_data['score']
                    logger.info(f"[CACHE HIT] Found '{row_street}': score={cached_score}")
                    return cached_score
            
            logger.warning(f"[CACHE MISS] Street '{row_street}' NOT FOUND. Cache entries: {[str(s.get('street_name', '')) for s in ref_similarities[:10]]}")
        else:
            logger.error(f"[NO CACHE] Cache missing! ref='{ref_street}', cache exists={street_similarity_cache is not None}, keys={list(street_similarity_cache.keys()) if street_similarity_cache else 'None'}")
        
        # Check if row_street is the reference street itself
        if row_street == ref_street:
            return 1.0
        
        # Check if street names contain "gracht" (canal/gracht)
        ref_is_gracht = 'gracht' in ref_street
        row_is_gracht = 'gracht' in row_street
        
        # Penalize gracht mismatches (street vs gracht = bad match!)
        gracht_penalty = 1.0
        if ref_is_gracht != row_is_gracht:
            # Mismatch: one is gracht, other is not
            gracht_penalty = 0.3  # Heavy penalty for street vs gracht mismatch
        
        # Fallback: simple name-based similarity (only used if not in OSM cache)
        # Don't warn for reference street (it gets 1.0 above)
        if row_street != ref_street:
            logger.warning(f"Using FALLBACK name-based similarity for {row_street} (not in OSM cache)")
        
        if ref_street == row_street:
            return 1.0 * gracht_penalty
        else:
            # Check for similar street names (gracht, straat, etc.)
            ref_base = ref_street.replace('gracht', '').replace('straat', '').replace('weg', '').strip()
            row_base = row_street.replace('gracht', '').replace('straat', '').replace('weg', '').strip()
            
            if ref_base == row_base:
                fallback_score = 0.8 * gracht_penalty  # Same base name, different suffix
                logger.warning(f"Fallback score for {row_street}: {fallback_score}")
                return fallback_score
            else:
                fallback_score = calculate_string_similarity(ref_street, row_street) * gracht_penalty
                logger.warning(f"Fallback score for {row_street}: {fallback_score}")
                return fallback_score
        
    except Exception as e:
        logger.error(f"Error calculating OSM street similarity: {e}")
        return 0.5  # Neutral score on error

def calculate_street_similarity_score(row, reference_data, street_similarity_cache=None):
    """Calculate similarity score for street matching (Algorithm 1) - 4 best corresponding streets.
    TEST MODE: Only OSM street similarity at 100%, all other weights at 0%."""
    try:
        score = 0.0
        
        # 1. Street name similarity (0% weight - DISABLED FOR TEST)
        # ref_street = reference_data.get('street_name', '')
        # if not ref_street and 'address_full' in reference_data:
        #     # Extract street name from full address
        #     address_parts = reference_data['address_full'].split(',')[0].strip()
        #     # Remove house number to get street name
        #     import re
        #     ref_street = re.sub(r'\s+\d+.*$', '', address_parts).strip()
        # 
        # ref_street = ref_street.lower().strip()
        # row_street = row.get('address/street_name', '').lower().strip()
        # if ref_street and row_street:
        #     if ref_street == row_street:
        #         score += 0.00 * 1.0  # DISABLED
        #     else:
        #         # Calculate street name similarity (Levenshtein distance)
        #         street_similarity = calculate_string_similarity(ref_street, row_street)
        #         score += 0.00 * street_similarity  # DISABLED
        
        # 2. OSM-based street similarity (100% weight - ONLY ACTIVE)
        # This represents the physical street similarity in OpenStreetMap
        osm_street_score = calculate_osm_street_similarity(row, reference_data, street_similarity_cache)
        score += 1.00 * osm_street_score
        
        # 3. Living area (m²) proximity (0% weight - DISABLED FOR TEST)
        # area_m2 = row.get('floor_area/0', 0)
        # if pd.notna(area_m2) and area_m2 > 0:
        #     area_diff = abs(area_m2 - reference_data.get('area_m2', 100))
        #     area_score = max(0, 1 - (area_diff / reference_data.get('area_m2', 100)))
        #     score += 0.00 * area_score
        
        # 4. Micro-location proximity (0% weight - DISABLED FOR TEST)
        # ref_neighbourhood = reference_data.get('neighbourhood', '').lower().strip()
        # row_neighbourhood = row.get('address/neighbourhood', '').lower().strip()
        # if ref_neighbourhood and row_neighbourhood:
        #     if ref_neighbourhood == row_neighbourhood:
        #         score += 0.00 * 1.0
        #     else:
        #         neighbourhood_similarity = calculate_string_similarity(ref_neighbourhood, row_neighbourhood)
        #         score += 0.00 * neighbourhood_similarity
        
        # 5. Garden match (0% weight - DISABLED FOR TEST)
        # ref_garden = reference_data.get('has_garden', False)
        # score += 0.00 * 0.5
        
        # 6. Rooms similarity (0% weight - DISABLED FOR TEST)
        # rooms = row.get('number_of_rooms', 0)
        # if pd.notna(rooms) and rooms > 0:
        #     room_diff = abs(rooms - reference_data.get('rooms', 3))
        #     room_score = max(0, 1 - (room_diff / max(reference_data.get('rooms', 3), 1)))
        #     score += 0.00 * room_score
        
        # 7. Bedrooms similarity (0% weight - DISABLED FOR TEST)
        # bedrooms = row.get('number_of_bedrooms', 0)
        # if pd.notna(bedrooms) and bedrooms > 0:
        #     bedroom_diff = abs(bedrooms - reference_data.get('bedrooms', 2))
        #     bedroom_score = max(0, 1 - (bedroom_diff / max(reference_data.get('bedrooms', 2), 1)))
        #     score += 0.00 * bedroom_score
        
        # 8. Balcony/Roof terrace (0% weight - DISABLED FOR TEST)
        # ref_balcony = reference_data.get('has_balcony', False) or reference_data.get('has_terrace', False)
        # score += 0.00 * 0.5
        
        # 9. Energy label (0% weight - DISABLED FOR TEST)
        # energy_labels = ['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
        # ref_energy = reference_data.get('energy_label', 'B')
        # row_energy = row.get('energy_label', 'Unknown')
        # 
        # if ref_energy in energy_labels and row_energy in energy_labels:
        #     ref_index = energy_labels.index(ref_energy)
        #     row_index = energy_labels.index(row_energy)
        #     energy_diff = abs(ref_index - row_index)
        #     energy_score = max(0, 1 - (energy_diff / len(energy_labels)))
        #     score += 0.00 * energy_score
        # else:
        #     score += 0.00 * 0.5
        
        return min(1.0, score)  # Cap at 1.0
        
    except Exception as e:
        logger.error(f"Error calculating street similarity score: {e}")
        return 0.0

def process_csv_for_top_streets(csv_df, reference_data, street_similarity_cache=None):
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
        
        logger.info(f"[PROCESS CSV] Processing {len(unique_streets)} unique streets")
        logger.info(f"[PROCESS CSV] Reference data keys: {reference_data.keys()}")
        logger.info(f"[PROCESS CSV] Street similarity cache passed: {street_similarity_cache is not None}")
        if street_similarity_cache:
            logger.info(f"[PROCESS CSV] Cache keys: {list(street_similarity_cache.keys())}")
        
        for street_name in unique_streets:
            # Get a sample property from this street for similarity calculation
            sample_property = csv_df[csv_df[street_col] == street_name].iloc[0]
            
            # Calculate similarity score using Algorithm 1 (street matching)
            similarity_score = calculate_street_similarity_score(sample_property, reference_data, street_similarity_cache)
            
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
        
        # Log ALL streets with their scores for debugging
        logger.info("=" * 100)
        logger.info("COMPLETE RANKING - ALL STREETS BY OSM SIMILARITY SCORE:")
        logger.info("=" * 100)
        for i, street in enumerate(street_scores, 1):
            is_gracht = 'gracht' in street['street_name'].lower()
            gracht_indicator = " [GRACHT]" if is_gracht else " [STRAAT]"
            in_top5_marker = " <-- TOP 5" if i <= 5 else ""
            logger.info(f"{i:2}. {street['street_name']:40} | Score: {street['similarity_score']:.4f}{gracht_indicator}{in_top5_marker}")
        logger.info("=" * 100)
        
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
        
        # Try to use REAL OSM street similarity (fetch from Overpass API)
        street_similarity_cache = None
        try:
            from overpass_street_similarity import OverpassStreetSimilarity
            
            # Get reference street name
            ref_street = reference_data.get('street_name', '')
            if not ref_street and 'address_full' in reference_data:
                import re
                address_parts = reference_data['address_full'].split(',')[0].strip()
                ref_street = re.sub(r'\s+\d+.*$', '', address_parts).strip()
            
            if ref_street:
                logger.info(f"Fetching REAL OSM similarity data for: {ref_street}")
                
                # Find unique candidate streets
                street_col = None
                for col in ['address/street_name', 'street_name', 'address_street_name']:
                    if col in csv_df.columns:
                        street_col = col
                        break
                
                if street_col:
                    candidate_streets = csv_df[street_col].dropna().unique().tolist()
                    candidate_streets = [s for s in candidate_streets if s.strip()]
                    
                    logger.info(f"Fetching OSM data for {len(candidate_streets)} candidate streets")
                    
                    # Use Overpass API to get REAL street similarity for ALL streets
                    similarity_calc = OverpassStreetSimilarity()
                    # Use top_n=len(candidate_streets) to get ALL streets, not just top 5
                    similar_streets = similarity_calc.find_similar_streets(ref_street, candidate_streets, top_n=len(candidate_streets))
                    
                    # Build cache - IMPORTANT: use normalized reference street name as key
                    street_similarity_cache = {}
                    cache_key = ref_street.lower().strip()
                    street_similarity_cache[cache_key] = similar_streets
                    
                    logger.info(f"[CACHE CREATED] Successfully fetched OSM similarity data for {len(similar_streets)} streets")
                    logger.info(f"[CACHE CREATED] Cache key: '{cache_key}'")
                    logger.info(f"[CACHE CREATED] Cache entries: {[s.get('street_name', 'unknown') for s in similar_streets[:10]]}")
                    logger.info(f"[CACHE CREATED] Reference street used: '{ref_street}' -> normalized to '{cache_key}'")
        except Exception as e:
            logger.warning(f"Could not fetch OSM similarity data (using name-based fallback): {e}")
            street_similarity_cache = None
        
        # Process the CSV data to find top streets using Algorithm 1
        logger.info("Processing reference address and selecting top streets from CSV...")
        top_streets = process_csv_for_top_streets(csv_df, reference_data, street_similarity_cache)
        
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
    
    # Clear cache at the start
    cache_dir = Path("cache")
    if cache_dir.exists():
        try:
            for cache_file in cache_dir.glob("*.json"):
                cache_file.unlink()
            logger.info("Cache cleared successfully")
        except Exception as e:
            logger.warning(f"Could not clear cache: {e}")
    
    reference_data_path = sys.argv[1]
    csv_file_path = sys.argv[2]
    
    # Load reference data
    with open(reference_data_path, 'r', encoding='utf-8') as f:
        reference_data = json.load(f)
    
    # Run street analysis
    result = run_street_analysis(csv_file_path, reference_data)
    
    # Output result as JSON
    print(json.dumps(result, indent=2))
