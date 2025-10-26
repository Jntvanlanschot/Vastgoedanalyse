#!/usr/bin/env python3
"""
Test script for the new Overpass API street similarity system.

This script demonstrates how the new street similarity algorithm works
with actual OSM data from the Overpass API.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from overpass_street_similarity import OverpassStreetSimilarity

def test_street_similarity():
    """Test the street similarity functionality."""
    print("=== Testing Overpass API Street Similarity ===\n")
    
    # Initialize the similarity calculator
    similarity_calc = OverpassStreetSimilarity()
    
    # Test with example streets from Amsterdam
    reference_street = "Eerste Laurierdwarsstraat"
    candidate_streets = [
        "Tweede Laurierdwarsstraat",
        "Bloemgracht", 
        "Lauriergracht",
        "Elandsgracht",
        "Nieuwe Leliestraat",
        "Bloemstraat",
        "Prinsengracht",
        "Herengracht",
        "Keizersgracht",
        "Singel"
    ]
    
    print(f"Reference street: {reference_street}")
    print(f"Candidate streets: {', '.join(candidate_streets)}")
    print("\nFetching street data from Overpass API...")
    
    try:
        # Find similar streets
        results = similarity_calc.find_similar_streets(reference_street, candidate_streets, top_n=5)
        
        print(f"\n=== Results for '{reference_street}' ===")
        print(f"Found {len(results)} similar streets:\n")
        
        for i, result in enumerate(results, 1):
            print(f"{i}. {result['street_name']}")
            print(f"   Overall Score: {result['score']:.3f}")
            print(f"   Components:")
            
            components = result['components']
            for component, score in components.items():
                weight = similarity_calc.weights[component]
                weighted_score = weight * score
                print(f"     - {component}: {score:.3f} (weight: {weight:.2f}, weighted: {weighted_score:.3f})")
            
            # Show street profile details
            profile = result['profile']
            print(f"   Street Profile:")
            print(f"     - Highway type: {profile.highway}")
            print(f"     - Max speed: {profile.maxspeed} km/h")
            print(f"     - Width: {profile.width:.1f}m")
            print(f"     - Lanes: {profile.lanes}")
            print(f"     - Cycleway: {profile.cycleway}")
            print(f"     - Sidewalk: {profile.sidewalk}")
            print(f"     - Canal adjacent: {profile.canal_adjacent}")
            print(f"     - Gracht name: {profile.gracht_name}")
            print(f"     - Length: {profile.length:.0f}m")
            print()
        
        # Show weight breakdown
        print("=== Weight Breakdown ===")
        for component, weight in similarity_calc.weights.items():
            print(f"{component}: {weight:.2f} ({weight*100:.0f}%)")
        
    except Exception as e:
        print(f"Error during testing: {e}")
        print("This might be due to network issues or Overpass API being unavailable.")
        print("The system will fall back to name-based similarity in production.")

if __name__ == "__main__":
    test_street_similarity()
