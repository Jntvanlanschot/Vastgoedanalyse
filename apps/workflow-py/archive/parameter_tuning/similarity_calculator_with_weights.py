#!/usr/bin/env python3
"""
Similarity Calculator with configurable weights for tuning.
"""

import pandas as pd
import math
import logging
import sys
from pathlib import Path
from datetime import datetime, date

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent / "workflow"))
from api_workflow import calculate_string_similarity, calculate_osm_street_similarity

logging.basicConfig(level=logging.ERROR, format='%(levelname)s: %(message)s')  # Minimal logging
logger = logging.getLogger(__name__)

def parse_date_safe(date_str):
    """Parse date string to date object, return None if invalid."""
    if pd.isna(date_str) or not date_str:
        return None
    try:
        if isinstance(date_str, date):
            return date_str
        if isinstance(date_str, datetime):
            return date_str.date()
        # Try YYYY-MM-DD format
        if isinstance(date_str, str):
            return datetime.strptime(date_str[:10], '%Y-%m-%d').date()
    except Exception:
        pass
    return None

def calculate_date_similarity(ref_date, row_date, max_days_diff=730):
    """
    Calculate date similarity score.
    
    Logic:
    - Same date: score = 1.0
    - Closer dates = higher score (exponential decay)
    - More recent dates = slightly higher score (time decay)
    
    Args:
        ref_date: Reference sale date
        row_date: Comparable property sale date
        max_days_diff: Maximum days difference to consider (default 2 years)
    
    Returns:
        Similarity score (0-1)
    """
    if ref_date is None or row_date is None:
        return 0.0
    
    ref_date = parse_date_safe(ref_date)
    row_date = parse_date_safe(row_date)
    
    if ref_date is None or row_date is None:
        return 0.0
    
    # Calculate days difference
    days_diff = abs((ref_date - row_date).days)
    
    if days_diff == 0:
        return 1.0
    
    if days_diff > max_days_diff:
        return 0.0
    
    # Exponential decay: closer dates = higher score
    # Score = exp(-days_diff / decay_factor)
    # decay_factor = 180 means 50% score at ~125 days, 10% at ~415 days
    decay_factor = 180.0
    proximity_score = math.exp(-days_diff / decay_factor)
    
    # Time recency bonus: more recent = slightly higher
    # Use today as reference point
    today = date.today()
    ref_days_ago = (today - ref_date).days
    row_days_ago = (today - row_date).days
    
    # If both are recent (< 1 year), give small bonus
    if ref_days_ago < 365 and row_days_ago < 365:
        recency_bonus = 0.05
    else:
        recency_bonus = 0.0
    
    return min(1.0, proximity_score + recency_bonus)

def calculate_year_built_similarity(ref_year, row_year):
    """
    Calculate building year similarity score.
    
    Logic:
    - Same year: score = 1.0
    - Closer years = higher score (exponential decay)
    - Age difference matters more for older buildings
    
    Args:
        ref_year: Reference building year
        row_year: Comparable property building year
    
    Returns:
        Similarity score (0-1)
    """
    if pd.isna(ref_year) or pd.isna(row_year) or ref_year == 0 or row_year == 0:
        return 0.5  # Neutral score if missing
    
    try:
        ref_year = int(ref_year)
        row_year = int(row_year)
    except (ValueError, TypeError):
        return 0.5
    
    if ref_year == row_year:
        return 1.0
    
    year_diff = abs(ref_year - row_year)
    
    # Exponential decay: closer years = higher score
    # decay_factor = 20 means 50% score at ~14 years, 10% at ~46 years
    decay_factor = 20.0
    score = math.exp(-year_diff / decay_factor)
    
    return max(0.0, min(1.0, score))

def calculate_property_type_similarity(ref_type, row_type):
    """
    Calculate property type similarity score.
    
    Logic:
    - Same type: score = 1.0
    - Different type: score = 0.0
    
    Args:
        ref_type: Reference property type (Appartement/Woonhuis)
        row_type: Comparable property type
    
    Returns:
        Similarity score (0-1)
    """
    if pd.isna(ref_type) or pd.isna(row_type):
        return 0.5  # Neutral score if missing
    
    ref_type = str(ref_type).lower().strip()
    row_type = str(row_type).lower().strip()
    
    if ref_type == row_type:
        return 1.0
    
    # Check for similar types
    if 'appartement' in ref_type and 'appartement' in row_type:
        return 1.0
    if 'woonhuis' in ref_type and 'woonhuis' in row_type:
        return 1.0
    
    return 0.0

def calculate_vve_fee_similarity(ref_vve, row_vve):
    """
    Calculate VVE fee similarity score.
    
    Logic:
    - Similar VVE fees = higher score
    - Missing values = neutral score
    
    Args:
        ref_vve: Reference VVE monthly fee
        row_vve: Comparable property VVE monthly fee
    
    Returns:
        Similarity score (0-1)
    """
    if pd.isna(ref_vve) or pd.isna(row_vve):
        return 0.5  # Neutral score if missing
    
    try:
        ref_vve = float(ref_vve)
        row_vve = float(row_vve)
    except (ValueError, TypeError):
        return 0.5
    
    if ref_vve == 0 and row_vve == 0:
        return 1.0
    
    if ref_vve == 0 or row_vve == 0:
        return 0.3  # One has VVE, other doesn't
    
    # Calculate relative difference
    avg_vve = (ref_vve + row_vve) / 2.0
    diff_pct = abs(ref_vve - row_vve) / max(avg_vve, 1.0)
    
    # Score based on percentage difference
    # 0% diff = 1.0, 50% diff = 0.5, 100%+ diff = 0.0
    score = max(0.0, 1.0 - diff_pct)
    
    return score

def calculate_similarity_score_with_weights(
    row,
    reference_data,
    weights: dict,
    street_similarity_cache=None,
    debug=False
):
    """
    Calculate similarity score with configurable weights.
    
    Args:
        row: Property row to compare
        reference_data: Reference property data
        weights: Dict with weights:
            - weight_street_name: weight for street name (default 0.02)
            - weight_osm_street: weight for OSM street (default 0.08)
            - weight_area: weight for area (default 0.36)
            - weight_distance: weight for distance (default 0.14)
            - weight_garden: weight for garden (default 0.10)
            - weight_rooms: weight for rooms (default 0.10)
            - weight_balcony: weight for balcony (default 0.07)
            - weight_energy_label: weight for energy label in final combination (default 0.6)
            - weight_sale_date: weight for sale date recency (default 0.05)
            - weight_year_built: weight for building year similarity (default 0.03)
            - weight_property_type: weight for property type match (default 0.05)
            - weight_vve_fee: weight for VVE fee similarity (default 0.02)
            - weight_parking: weight for parking/garage match (default 0.02)
            - weight_lift: weight for lift presence match (default 0.01)
            - gracht_penalty: penalty multiplier for gracht mismatch (default 0.01)
    
    Returns:
        Similarity score (0-1)
    """
    try:
        score = 0.0
        
        # Get weights with defaults
        w_street = weights.get('weight_street_name', 0.02)
        w_osm = weights.get('weight_osm_street', 0.08)
        w_area = weights.get('weight_area', 0.36)
        w_distance = weights.get('weight_distance', 0.14)
        w_garden = weights.get('weight_garden', 0.10)
        w_rooms = weights.get('weight_rooms', 0.10)
        w_balcony = weights.get('weight_balcony', 0.07)
        w_energy = weights.get('weight_energy_label', 0.6)
        w_sale_date = weights.get('weight_sale_date', 0.05)
        w_year_built = weights.get('weight_year_built', 0.03)
        w_property_type = weights.get('weight_property_type', 0.05)
        w_vve_fee = weights.get('weight_vve_fee', 0.02)
        w_parking = weights.get('weight_parking', 0.02)
        w_lift = weights.get('weight_lift', 0.01)
        gracht_penalty_val = weights.get('gracht_penalty', 0.01)
        
        # Check for gracht mismatch
        ref_street = str(reference_data.get('street_name', '')).lower().strip()
        row_street = str(row.get('street', '') or row.get('address/street_name', '')).lower().strip()
        
        ref_is_gracht = 'gracht' in ref_street if ref_street else False
        row_is_gracht = 'gracht' in row_street if row_street else False
        
        gracht_penalty = gracht_penalty_val if (ref_is_gracht != row_is_gracht) else 1.0
        
        # 1. Street name similarity
        if ref_street and row_street:
            if ref_street == row_street:
                street_score = w_street * 1.0
            else:
                street_similarity = calculate_string_similarity(ref_street, row_street)
                street_score = w_street * street_similarity
            score += street_score
        
        # 2. OSM-based street similarity
        osm_street_score_raw = calculate_osm_street_similarity(row, reference_data, street_similarity_cache)
        osm_street_score = w_osm * osm_street_score_raw
        score += osm_street_score
        
        # 3. Living area (m²) proximity
        area_m2 = row.get('rw_area_m2', 0) or row.get('floor_area/0', 0)
        if pd.notna(area_m2) and area_m2 > 0:
            area_diff = abs(area_m2 - reference_data.get('area_m2', 100))
            area_score_raw = max(0, 1 - (area_diff / max(reference_data.get('area_m2', 100), 1)))
            area_score = w_area * area_score_raw
            score += area_score
        
        # 4. Micro-location proximity by geographic distance
        def _get_coords_from_row(r):
            lat_keys = ['address/latitude', 'latitude', 'lat', 'geo_lat']
            lon_keys = ['address/longitude', 'longitude', 'lon', 'lng', 'geo_lng']
            lat_val, lon_val = None, None
            for k in lat_keys:
                v = r.get(k, None)
                if pd.notna(v):
                    try:
                        lat_val = float(v)
                        break
                    except Exception:
                        pass
            for k in lon_keys:
                v = r.get(k, None)
                if pd.notna(v):
                    try:
                        lon_val = float(v)
                        break
                    except Exception:
                        pass
            return lat_val, lon_val

        def _get_coords_from_ref(ref):
            lat = ref.get('latitude', None) or ref.get('lat', None)
            lon = ref.get('longitude', None) or ref.get('lon', None)
            try:
                lat = float(lat) if lat is not None else None
                lon = float(lon) if lon is not None else None
            except Exception:
                lat, lon = None, None
            return lat, lon

        def _haversine_m(lat1, lon1, lat2, lon2):
            R = 6371000.0
            phi1 = math.radians(lat1)
            phi2 = math.radians(lat2)
            dphi = math.radians(lat2 - lat1)
            dlambda = math.radians(lon2 - lon1)
            a = math.sin(dphi/2.0)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2.0)**2
            return 2*R*math.asin(math.sqrt(a))

        ref_lat, ref_lon = _get_coords_from_ref(reference_data)
        row_lat, row_lon = _get_coords_from_row(row)
        if ref_lat is not None and ref_lon is not None and row_lat is not None and row_lon is not None:
            dist_m = _haversine_m(ref_lat, ref_lon, row_lat, row_lon)
            proximity = max(0.0, 1.0 - (dist_m / 2000.0))  # 0-2km linear decay
            neighbourhood_score = w_distance * proximity
            score += neighbourhood_score
        else:
            # Fallback to neighbourhood string similarity
            ref_neighbourhood = str(reference_data.get('neighbourhood', '')).lower().strip()
            row_neighbourhood = str(row.get('address/neighbourhood', '')).lower().strip()
            if ref_neighbourhood and row_neighbourhood:
                if ref_neighbourhood == row_neighbourhood:
                    neighbourhood_score = w_distance * 1.0
                else:
                    neighbourhood_similarity = calculate_string_similarity(ref_neighbourhood, row_neighbourhood)
                    neighbourhood_score = w_distance * neighbourhood_similarity
                score += neighbourhood_score
        
        # 5. Garden match
        ref_garden = reference_data.get('has_garden', False)
        row_garden = row.get('rw_has_garden', False)
        if ref_garden == row_garden:
            garden_score = w_garden * 1.0
        else:
            garden_score = w_garden * 0.5  # Partial score for mismatch
        score += garden_score
        
        # 6. Rooms similarity
        rooms = row.get('rw_rooms', 0) or row.get('number_of_rooms', 0)
        if pd.notna(rooms) and rooms > 0:
            room_diff = abs(rooms - reference_data.get('rooms', 3))
            room_score_raw = max(0, 1 - (room_diff / max(reference_data.get('rooms', 3), 1)))
            room_score = w_rooms * room_score_raw
            score += room_score
        
        # 7. Balcony/Roof terrace
        ref_balcony = reference_data.get('has_balcony', False) or reference_data.get('has_terrace', False)
        row_balcony = row.get('rw_has_balcony', False) or row.get('rw_has_terrace', False)
        if ref_balcony == row_balcony:
            balcony_score = w_balcony * 1.0
        else:
            balcony_score = w_balcony * 0.5
        score += balcony_score
        
        # 8. Sale date similarity (how recent and how close in time)
        ref_sale_date = reference_data.get('sale_date', None)
        row_sale_date = row.get('sale_date', None) or row.get('rw_sale_date', None)
        date_sim = calculate_date_similarity(ref_sale_date, row_sale_date)
        date_score = w_sale_date * date_sim
        score += date_score
        
        # 9. Building year similarity
        ref_year = reference_data.get('year_built', None)
        row_year = row.get('year_built', None) or row.get('rw_year_built', None)
        year_sim = calculate_year_built_similarity(ref_year, row_year)
        year_score = w_year_built * year_sim
        score += year_score
        
        # 10. Property type similarity
        ref_type = reference_data.get('type', None)
        row_type = row.get('type', None) or row.get('rw_type', None)
        type_sim = calculate_property_type_similarity(ref_type, row_type)
        type_score = w_property_type * type_sim
        score += type_score
        
        # 11. VVE fee similarity
        ref_vve = reference_data.get('vve_monthly_fee', None)
        row_vve = row.get('vve_monthly_fee', None) or row.get('rw_vve_monthly_fee', None)
        vve_sim = calculate_vve_fee_similarity(ref_vve, row_vve)
        vve_score = w_vve_fee * vve_sim
        score += vve_score
        
        # 12. Parking/garage similarity
        ref_parking = reference_data.get('has_parking', False) or reference_data.get('has_garage', False)
        row_parking = row.get('has_parking', False) or row.get('has_garage', False) or row.get('rw_has_parking', False) or row.get('rw_has_garage', False)
        if ref_parking == row_parking:
            parking_score = w_parking * 1.0
        else:
            parking_score = w_parking * 0.5
        score += parking_score
        
        # 13. Lift similarity (mainly for apartments)
        ref_lift = reference_data.get('has_lift', False)
        row_lift = row.get('has_lift', False) or row.get('rw_has_lift', False)
        if ref_lift == row_lift:
            lift_score = w_lift * 1.0
        else:
            lift_score = w_lift * 0.5
        score += lift_score
        
        # 14. Energy label - Calculate separately for combined similarity
        from energy_label_correction import energy_label_similarity
        ref_energy = reference_data.get('energy_label', 'B')
        row_energy = row.get('rw_energy_label', 'Unknown')
        energy_sim = energy_label_similarity(ref_energy, row_energy)
        
        # Calculate base similarity (all factors except energy label)
        max_base_score = w_street + w_osm + w_area + w_distance + w_garden + w_rooms + w_balcony + w_sale_date + w_year_built + w_property_type + w_vve_fee + w_parking + w_lift
        base_similarity = min(1.0, score / max_base_score) if max_base_score > 0 else 0.0
        
        # Combine: energy_label_weight * energy_sim + (1 - energy_label_weight) * base_similarity
        combined_similarity = w_energy * energy_sim + (1 - w_energy) * base_similarity
        
        # Apply gracht penalty to the ENTIRE score
        score = combined_similarity * gracht_penalty
        
        return min(1.0, score)
        
    except Exception as e:
        logger.error(f"Error calculating similarity score: {e}")
        return 0.0

