#!/usr/bin/env python3
"""
Geocoding: Get latitude/longitude for addresses and calculate distances.
"""

import requests
import logging
import time
from typing import Optional, Tuple, Dict
import math

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Rate limiting for Nominatim (1 request per second)
_last_request_time = 0
_min_request_interval = 1.0

def geocode_address(address: str, use_google: bool = False, api_key: str = None) -> Optional[Dict[str, float]]:
    """
    Geocode an address to get latitude and longitude.
    
    Args:
        address: Full address string
        use_google: Whether to use Google Maps API (requires API key)
        api_key: Google Maps API key (if use_google=True)
    
    Returns:
        Dict with 'lat' and 'lng', or None if geocoding fails
    """
    global _last_request_time
    
    # Try Google Maps first if requested and API key available
    if use_google and api_key:
        try:
            encoded_address = requests.utils.quote(address)
            url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded_address}&key={api_key}"
            
            response = requests.get(url, timeout=10)
            data = response.json()
            
            if data.get('status') == 'OK' and data.get('results'):
                location = data['results'][0]['geometry']['location']
                return {'lat': location['lat'], 'lng': location['lng']}
        except Exception as e:
            logger.warning(f"Google geocoding failed: {e}, falling back to Nominatim")
    
    # Fallback to Nominatim (OpenStreetMap)
    try:
        # Rate limiting: wait if needed
        current_time = time.time()
        time_since_last = current_time - _last_request_time
        if time_since_last < _min_request_interval:
            time.sleep(_min_request_interval - time_since_last)
        
        encoded_address = requests.utils.quote(f"{address}, Netherlands")
        url = f"https://nominatim.openstreetmap.org/search?q={encoded_address}&format=json&limit=1&addressdetails=1"
        
        headers = {
            'User-Agent': 'Vastgoedanalyse-ParameterTuning/1.0'  # Required by Nominatim
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        _last_request_time = time.time()
        
        data = response.json()
        
        if data and len(data) > 0:
            result = data[0]
            return {'lat': float(result['lat']), 'lng': float(result['lon'])}
    except Exception as e:
        logger.error(f"Geocoding failed for {address}: {e}")
        return None
    
    return None

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth (in km).
    
    Args:
        lat1, lon1: Latitude and longitude of first point
        lat2, lon2: Latitude and longitude of second point
    
    Returns:
        Distance in kilometers
    """
    # Convert to radians
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    # Haversine formula
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    # Earth radius in kilometers
    R = 6371.0
    
    return R * c

def extract_postcode_area(postal_code: str) -> Optional[str]:
    """
    Extract first 4 digits of postal code (postcode gebied).
    
    Args:
        postal_code: Full postal code (e.g., "1078XR" or "1078 XR")
    
    Returns:
        First 4 digits (e.g., "1078") or None
    """
    if not postal_code:
        return None
    
    # Remove spaces and extract first 4 digits
    cleaned = postal_code.replace(' ', '').replace('-', '')
    if len(cleaned) >= 4 and cleaned[:4].isdigit():
        return cleaned[:4]
    
    return None


