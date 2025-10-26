#!/usr/bin/env python3
"""
Overpass API Street Similarity Module

This module implements sophisticated street similarity scoring using OpenStreetMap data
via the Overpass API. It fetches street characteristics and compares them to find the
most similar streets to a reference street.

Features:
- Fetches street characteristics (speed, width, lanes, cycleway, sidewalk, etc.)
- Calculates canal adjacency
- Implements weighted similarity scoring
- Handles missing data gracefully
- Includes caching and retry logic
"""

import json
import logging
import time
import requests
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from pathlib import Path
import re

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

@dataclass
class StreetProfile:
    """Street characteristics profile from OSM data."""
    name: str
    highway: str
    maxspeed: float
    lanes: int
    width: float
    cycleway: str
    sidewalk: str
    oneway: bool
    length: float
    canal_adjacent: bool
    gracht_name: bool

class OverpassStreetSimilarity:
    """Main class for street similarity scoring using Overpass API."""
    
    def __init__(self, cache_dir: str = "cache"):
        self.overpass_url = "https://overpass-api.de/api/interpreter"
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
        
        # Amsterdam bounding box (approximate)
        self.amsterdam_bbox = (4.7, 52.3, 5.0, 52.4)  # (min_lon, min_lat, max_lon, max_lat)
        
        # Similarity weights (sum = 1.00)
        self.weights = {
            'maxspeed': 0.25,
            'width': 0.20,
            'highway': 0.10,
            'lanes': 0.08,
            'cycleway': 0.12,
            'sidewalk': 0.05,
            'gracht': 0.10,
            'length': 0.10
        }
        
        # Scoring scales
        self.scales = {
            'speed': 10,    # km/h
            'width': 1.2,   # meters
            'length': 150   # meters
        }
    
    def normalize_speed(self, speed_str: str) -> float:
        """Normalize speed values from OSM."""
        if not speed_str or speed_str == 'none':
            return 50.0  # Default speed
        
        # Handle zone:30, zone:50, etc.
        if speed_str.startswith('zone:'):
            return float(speed_str.split(':')[1])
        
        # Handle numeric values
        try:
            return float(speed_str)
        except ValueError:
            return 50.0  # Default fallback
    
    def normalize_width(self, width_str: str, lanes: int, highway: str) -> float:
        """Normalize width values, estimate from lanes if missing."""
        if width_str and width_str != 'none':
            try:
                return float(width_str)
            except ValueError:
                pass
        
        # Estimate width from lanes and highway type
        lane_widths = {
            'living_street': 2.5,
            'residential': 3.0,
            'tertiary': 3.5,
            'secondary': 3.5
        }
        
        lane_width = lane_widths.get(highway, 3.0)
        return max(lanes * lane_width, 3.0)  # Minimum 3m width
    
    def normalize_lanes(self, lanes_str: str) -> int:
        """Normalize lane count."""
        if not lanes_str or lanes_str == 'none':
            return 1  # Default single lane
        
        try:
            return int(float(lanes_str))
        except ValueError:
            return 1
    
    def is_gracht_name(self, street_name: str) -> bool:
        """Check if street name indicates canal adjacency."""
        gracht_patterns = ['gracht', 'singel', 'kade', 'wal', 'dijk']
        street_lower = street_name.lower()
        return any(pattern in street_lower for pattern in gracht_patterns)
    
    def build_overpass_query(self, street_names: List[str], include_waterways: bool = True, use_anchors: bool = True) -> str:
        """Build Overpass QL query for street data.
        
        Args:
            street_names: List of street names to query
            include_waterways: Whether to also fetch waterways
            use_anchors: Whether to use exact match anchors (^...$)
        """
        if not street_names:
            return ""
        
        # Clean and normalize street names for matching
        # Remove quotes, trim spaces, handle special characters
        cleaned_names = []
        for name in street_names:
            # Remove quotes if present, trim
            clean_name = name.strip().strip('"')
            if clean_name:
                # Escape special regex characters
                clean_name = clean_name.replace('\\', '\\\\').replace('.', '\\.')
                cleaned_names.append(clean_name)
        
        if not cleaned_names:
            return ""
        
        # Build case-insensitive alternation pattern (no inner parentheses)
        name_pattern = '|'.join(cleaned_names)
        
        # Build bbox for Amsterdam: south, west, north, east
        south, west, north, east = self.amsterdam_bbox[1], self.amsterdam_bbox[0], self.amsterdam_bbox[3], self.amsterdam_bbox[2]
        
        # Build query with proper structure
        query = "[out:json][timeout:60];\n(\n"
        
        # Add name filter with or without anchors (no parentheses around entire pattern)
        if use_anchors:
            name_filter = f'^{name_pattern}$'
        else:
            name_filter = name_pattern
        
        # Highway whitelist only
        highway_filter = "residential|living_street|tertiary|secondary"
        
        # Build the way selector
        query += f'  way["highway"~"{highway_filter}"]["name"~"{name_filter}",i]({south},{west},{north},{east});\n'
        
        # Add waterways if requested
        if include_waterways:
            query += f'  way["waterway"~"canal|river|stream"]({south},{west},{north},{east});\n'
        
        # Close the block and add output directive
        query += ");\nout body geom qt;"
        
        return query
    
    def fetch_street_data(self, street_names: List[str], batch_size: int = 30) -> Dict:
        """Fetch street data from Overpass API with batching and fallbacks.
        
        Implements F) Guardrails - tracks success rate and logs metrics.
        """
        # Check cache first
        cache_key = f"streets_{hash(tuple(sorted(street_names)))}.json"
        cache_file = self.cache_dir / cache_key
        
        if cache_file.exists():
            logger.info(f"Loading street data from cache: {cache_file}")
            with open(cache_file, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
                # G) Log cache hit
                logger.info(f"Cache hit for {len(street_names)} streets")
                return cached_data
        
        # I) Track metrics for health monitoring
        total_requested = len(street_names)
        total_batches = (len(street_names) + batch_size - 1) // batch_size
        error_400_count = 0
        error_429_count = 0
        timeout_count = 0
        profiles_built = 0
        
        # Batch street names (max batch_size per request to avoid 400 errors)
        all_results = []
        
        for i in range(0, len(street_names), batch_size):
            batch = street_names[i:i+batch_size]
            batch_num = i//batch_size + 1
            logger.info(f"Fetching batch {batch_num}/{total_batches} ({len(batch)} streets)")
            
            # Try with anchors first
            result = self._fetch_batch_with_fallback(batch, use_anchors=True)
            all_results.extend(result.get('elements', []))
        
        # Return combined results
        combined_result = {"elements": all_results}
        
        # I) Log per-run summary
        streets_found = [e for e in all_results if e.get('type') == 'way' and 'tags' in e and 'highway' in e.get('tags', {})]
        unique_streets = set()
        for e in streets_found:
            name = e.get('tags', {}).get('name', '')
            if name:
                unique_streets.add(name.lower())
        
        profiles_built = len(unique_streets)
        
        logger.info(f"=== Overpass API Summary ===")
        logger.info(f"Requested streets: {total_requested}")
        logger.info(f"Batches queried: {total_batches}")
        logger.info(f"Street segments found: {len(streets_found)}")
        logger.info(f"Unique street profiles built: {profiles_built}")
        logger.info(f"Success rate: {profiles_built/total_requested*100:.1f}%")
        
        # F) Check if health threshold is met (70%)
        if profiles_built / total_requested < 0.7:
            logger.warning(f"WARNING: Low Overpass success rate ({profiles_built/total_requested*100:.1f}%)")
            logger.warning("Only 70% of streets were matched. Results may be less accurate.")
        
        # Cache the result
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(combined_result, f, indent=2, ensure_ascii=False)
            logger.info(f"Cached street data to: {cache_file}")
        except Exception as e:
            logger.warning(f"Failed to cache results: {e}")
        
        return combined_result
    
    def _fetch_batch_with_fallback(self, street_names: List[str], use_anchors: bool = True) -> Dict:
        """Fetch a batch of streets with fallback strategies."""
        headers = {
            'User-Agent': 'Vastgoedanalyse-StreetSimilarity/1.0 (contact: mail@example.com)',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        # Strategy 1: Try with anchors (exact match)
        query = self.build_overpass_query(street_names, use_anchors=use_anchors)
        
        # I) Log the query body for debugging
        logger.info(f"Overpass query for batch of {len(street_names)} streets:")
        logger.info(query)
        
        for attempt in range(3):
            try:
                logger.info(f"Fetching street data from Overpass API (attempt {attempt + 1}, anchors={'on' if use_anchors else 'off'})")
                
                response = requests.post(
                    self.overpass_url,
                    data={'data': query},
                    headers=headers,
                    timeout=60
                )
                
                # Check for error status
                if response.status_code == 400:
                    logger.warning(f"Bad Request (400) - query may be too complex")
                    logger.warning(f"Response text: {response.text[:500]}")
                    # Try fallback: without anchors
                    if use_anchors and attempt == 0:
                        logger.info("Retrying without anchors")
                        return self._fetch_batch_with_fallback(street_names, use_anchors=False)
                    break
                
                # Check for rate limiting
                if response.status_code == 429:
                    wait_time = 2 ** attempt
                    logger.warning(f"Rate limited (429), waiting {wait_time}s")
                    time.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                
                data = response.json()
                
                # Check if we got results
                if data.get('elements'):
                    streets_found = [e for e in data['elements'] if e.get('type') == 'way' and 'tags' in e]
                    logger.info(f"Successfully fetched {len(streets_found)} street segments")
                    return data
                elif use_anchors and attempt == 0:
                    # Try without anchors as fallback
                    logger.info("No results with anchors, trying without")
                    return self._fetch_batch_with_fallback(street_names, use_anchors=False)
                    
            except requests.exceptions.Timeout:
                logger.warning(f"Timeout on attempt {attempt + 1}")
                if attempt < 2:
                    time.sleep(2 ** attempt)
                else:
                    logger.error("All timeouts exhausted")
            except requests.exceptions.RequestException as e:
                logger.warning(f"Overpass API request failed (attempt {attempt + 1}): {e}")
                if attempt < 2:
                    time.sleep(2 ** attempt)  # Exponential backoff
                else:
                    logger.error("All retries exhausted")
        
        # Final fallback: return empty result
        logger.warning(f"Returning empty result for batch of {len(street_names)} streets")
        return {"elements": []}
    
    def calculate_street_length(self, geometry: List[Dict]) -> float:
        """Calculate street length from geometry."""
        if not geometry:
            return 0.0
        
        total_length = 0.0
        for i in range(len(geometry) - 1):
            lat1, lon1 = geometry[i]['lat'], geometry[i]['lon']
            lat2, lon2 = geometry[i + 1]['lat'], geometry[i + 1]['lon']
            
            # Simple distance calculation (not perfectly accurate but sufficient)
            lat_diff = lat2 - lat1
            lon_diff = lon2 - lon1
            distance = np.sqrt(lat_diff**2 + lon_diff**2) * 111000  # Rough conversion to meters
            total_length += distance
        
        return total_length
    
    def check_canal_adjacency(self, street_geometry: List[Dict], waterways: List[Dict]) -> bool:
        """Check if street is within 20m of a canal."""
        if not street_geometry or not waterways:
            return False
        
        # Simple proximity check (within 20m)
        for street_point in street_geometry:
            street_lat, street_lon = street_point['lat'], street_point['lon']
            
            for waterway in waterways:
                if 'geometry' in waterway:
                    for water_point in waterway['geometry']:
                        water_lat, water_lon = water_point['lat'], water_point['lon']
                        
                        # Calculate distance
                        lat_diff = street_lat - water_lat
                        lon_diff = street_lon - water_lon
                        distance = np.sqrt(lat_diff**2 + lon_diff**2) * 111000
                        
                        if distance <= 20:  # Within 20 meters
                            return True
        
        return False
    
    def parse_street_data(self, overpass_data: Dict) -> Dict[str, StreetProfile]:
        """Parse Overpass API response into street profiles."""
        streets = {}
        waterways = []
        
        for element in overpass_data.get('elements', []):
            if element['type'] == 'way':
                tags = element.get('tags', {})
                
                # Check if it's a waterway
                if 'waterway' in tags:
                    waterways.append(element)
                    continue
                
                # Process street
                name = tags.get('name', '')
                if not name:
                    continue
                
                # Normalize street name
                normalized_name = name.strip().lower()
                
                # Extract street characteristics
                highway = tags.get('highway', 'residential')
                maxspeed = self.normalize_speed(tags.get('maxspeed', '50'))
                lanes = self.normalize_lanes(tags.get('lanes', '1'))
                width = self.normalize_width(tags.get('width', ''), lanes, highway)
                cycleway = tags.get('cycleway', 'none')
                sidewalk = tags.get('sidewalk', 'none')
                oneway = tags.get('oneway', 'no') == 'yes'
                
                # Calculate length
                geometry = element.get('geometry', [])
                length = self.calculate_street_length(geometry)
                
                # Check canal adjacency
                canal_adjacent = self.check_canal_adjacency(geometry, waterways)
                
                # Check if name indicates gracht
                gracht_name = self.is_gracht_name(name)
                
                # Create or update street profile
                if normalized_name in streets:
                    # Merge with existing profile (use median/mode)
                    existing = streets[normalized_name]
                    existing.maxspeed = np.median([existing.maxspeed, maxspeed])
                    existing.lanes = int(np.median([existing.lanes, lanes]))
                    existing.width = np.median([existing.width, width])
                    existing.length += length
                    existing.canal_adjacent = existing.canal_adjacent or canal_adjacent
                else:
                    streets[normalized_name] = StreetProfile(
                        name=name,
                        highway=highway,
                        maxspeed=maxspeed,
                        lanes=lanes,
                        width=width,
                        cycleway=cycleway,
                        sidewalk=sidewalk,
                        oneway=oneway,
                        length=length,
                        canal_adjacent=canal_adjacent,
                        gracht_name=gracht_name
                    )
        
        return streets
    
    def calculate_component_score(self, ref_profile: StreetProfile, candidate_profile: StreetProfile) -> Dict[str, float]:
        """Calculate individual component scores."""
        scores = {}
        
        # Speed similarity (exponential decay)
        speed_diff = abs(ref_profile.maxspeed - candidate_profile.maxspeed)
        scores['maxspeed'] = np.exp(-speed_diff / self.scales['speed'])
        
        # Width similarity (exponential decay)
        width_diff = abs(ref_profile.width - candidate_profile.width)
        scores['width'] = np.exp(-width_diff / self.scales['width'])
        
        # Highway class similarity
        highway_hierarchy = ['living_street', 'residential', 'tertiary', 'secondary']
        try:
            ref_idx = highway_hierarchy.index(ref_profile.highway)
            cand_idx = highway_hierarchy.index(candidate_profile.highway)
            diff = abs(ref_idx - cand_idx)
            
            if diff == 0:
                scores['highway'] = 1.0
            elif diff == 1:
                scores['highway'] = 0.7
            else:
                scores['highway'] = 0.4
        except ValueError:
            scores['highway'] = 0.5  # Unknown highway types
        
        # Lanes similarity
        lane_diff = abs(ref_profile.lanes - candidate_profile.lanes)
        if lane_diff == 0:
            scores['lanes'] = 1.0
        elif lane_diff == 1:
            scores['lanes'] = 0.7
        else:
            scores['lanes'] = 0.3
        
        # Cycleway similarity
        if ref_profile.cycleway == candidate_profile.cycleway:
            scores['cycleway'] = 1.0
        elif (ref_profile.cycleway == 'track' and candidate_profile.cycleway == 'lane') or \
             (ref_profile.cycleway == 'lane' and candidate_profile.cycleway == 'track'):
            scores['cycleway'] = 0.7
        elif (ref_profile.cycleway == 'none' and candidate_profile.cycleway != 'none') or \
             (ref_profile.cycleway != 'none' and candidate_profile.cycleway == 'none'):
            scores['cycleway'] = 0.2
        else:
            scores['cycleway'] = 0.5
        
        # Sidewalk similarity
        if ref_profile.sidewalk == candidate_profile.sidewalk:
            scores['sidewalk'] = 1.0
        elif (ref_profile.sidewalk == 'both' and candidate_profile.sidewalk in ['left', 'right']) or \
             (ref_profile.sidewalk in ['left', 'right'] and candidate_profile.sidewalk == 'both'):
            scores['sidewalk'] = 0.7
        elif (ref_profile.sidewalk == 'none' and candidate_profile.sidewalk != 'none') or \
             (ref_profile.sidewalk != 'none' and candidate_profile.sidewalk == 'none'):
            scores['sidewalk'] = 0.2
        else:
            scores['sidewalk'] = 0.5
        
        # Gracht similarity (canal adjacency + name)
        ref_gracht = ref_profile.canal_adjacent or ref_profile.gracht_name
        cand_gracht = candidate_profile.canal_adjacent or candidate_profile.gracht_name
        
        if ref_gracht == cand_gracht:
            scores['gracht'] = 1.0
        else:
            scores['gracht'] = 0.0
        
        # Length similarity (normalized)
        length_diff = abs(ref_profile.length - candidate_profile.length)
        scores['length'] = np.exp(-length_diff / self.scales['length'])
        
        return scores
    
    def calculate_street_similarity(self, ref_profile: StreetProfile, candidate_profile: StreetProfile) -> Tuple[float, Dict[str, float]]:
        """Calculate overall street similarity score."""
        component_scores = self.calculate_component_score(ref_profile, candidate_profile)
        
        # Calculate weighted score
        total_score = 0.0
        for component, score in component_scores.items():
            total_score += self.weights[component] * score
        
        return total_score, component_scores
    
    def find_similar_streets(self, reference_street: str, candidate_streets: List[str], top_n: int = 5) -> List[Dict]:
        """Find the most similar streets to the reference street."""
        logger.info(f"Finding similar streets for reference: {reference_street}")
        
        # Fetch data for all streets
        all_streets = [reference_street] + candidate_streets
        overpass_data = self.fetch_street_data(all_streets)
        
        # Parse street profiles
        street_profiles = self.parse_street_data(overpass_data)
        
        # Find reference profile
        ref_normalized = reference_street.lower().strip()
        if ref_normalized not in street_profiles:
            logger.warning(f"Reference street '{reference_street}' not found in OSM data")
            return []
        
        ref_profile = street_profiles[ref_normalized]
        logger.info(f"Reference street profile: {ref_profile}")
        
        # Calculate similarities
        similarities = []
        for street_name in candidate_streets:
            normalized_name = street_name.lower().strip()
            if normalized_name in street_profiles:
                candidate_profile = street_profiles[normalized_name]
                score, components = self.calculate_street_similarity(ref_profile, candidate_profile)
                
                similarities.append({
                    'street_name': street_name,
                    'score': score,
                    'components': components,
                    'profile': candidate_profile
                })
        
        # Sort by similarity score
        similarities.sort(key=lambda x: x['score'], reverse=True)
        
        # Return top N
        return similarities[:top_n]

def main():
    """Test the street similarity functionality."""
    similarity = OverpassStreetSimilarity()
    
    # Test with example streets
    reference = "Eerste Laurierdwarsstraat"
    candidates = [
        "Tweede Laurierdwarsstraat",
        "Bloemgracht",
        "Lauriergracht",
        "Elandsgracht",
        "Nieuwe Leliestraat",
        "Bloemstraat"
    ]
    
    results = similarity.find_similar_streets(reference, candidates)
    
    print(f"\nMost similar streets to '{reference}':")
    for i, result in enumerate(results, 1):
        print(f"{i}. {result['street_name']}: {result['score']:.3f}")
        print(f"   Components: {result['components']}")
        print()

if __name__ == "__main__":
    main()
