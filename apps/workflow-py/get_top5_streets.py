#!/usr/bin/env python3
"""
Get Top 5 Streets - Selecteer de 5 beste straten uit Funda ranking data.

Dit script:
1. Leest de ranking CSV (outputs/ranking_top100.csv)
2. Selecteert de 5 beste straten op basis van kwaliteit en aantal entries
3. Filtert straten met te weinig entries voor betrouwbare statistieken
4. Slaat de straten op als JSON en TXT

Gebruik --min-entries om het minimum aantal entries per straat in te stellen.
Aanbevolen: min-entries=2 voor kleine datasets, min-entries=3+ voor grote datasets.
"""

import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Constants
STRONG_THR_DEFAULT = 0.60
MEDIUM_THR_DEFAULT = 0.40
MIN_ENTRIES_PER_STREET = 3  # Minimum aantal entries per straat voor betrouwbare statistieken


def normalize_street(street: str) -> str:
    """
    Normaliseer straatnaam: lowercase, verwijder dubbele spaties, accents.
    """
    if not street:
        return ""
    
    # Convert to lowercase
    normalized = street.lower().strip()
    
    # Remove accents (basic approach)
    replacements = {
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c', 'ñ': 'n'
    }
    
    for old, new in replacements.items():
        normalized = normalized.replace(old, new)
    
    # Remove multiple spaces
    normalized = re.sub(r'\s+', ' ', normalized)
    
    return normalized.strip()


def split_address(address: str) -> Tuple[str, str, str, str]:
    """
    Split address into components: street, number_with_suffix, postal_code, city.
    """
    if not address:
        return "", "", "", ""
    
    # Remove extra whitespace
    address = re.sub(r'\s+', ' ', address.strip())
    
    # Split by comma to get main components
    parts = [p.strip() for p in address.split(',')]
    
    if len(parts) >= 3:
        # Format: "Street Number, PostalCode, City"
        street_part = parts[0]
        postal_code = parts[1]
        city = parts[2]
    elif len(parts) == 2:
        # Format: "Street Number, PostalCode City" or "Street Number, City"
        street_part = parts[0]
        second_part = parts[1]
        
        # Check if second part contains postal code pattern
        postal_match = re.search(r'\b\d{4}\s*[A-Z]{2}\b', second_part)
        if postal_match:
            postal_code = postal_match.group().replace(' ', '')
            city = second_part.replace(postal_match.group(), '').strip()
        else:
            postal_code = ""
            city = second_part
    else:
        # Single part - try to extract components
        street_part = parts[0]
        postal_code = ""
        city = ""
    
    # Extract street name and number from street_part
    # Look for number pattern at the end
    number_match = re.search(r'(\d+(?:[A-Za-z]+)?)\s*$', street_part)
    if number_match:
        number_with_suffix = number_match.group(1)
        street = street_part[:number_match.start()].strip()
    else:
        street = street_part
        number_with_suffix = ""
    
    return street, number_with_suffix, postal_code, city


def extract_street_from_address(address: str) -> str:
    """
    Extract street name from full address, ignoring suffixes like 'hs', 'hoog', 'II'.
    Handles cases like "Eerste Laurierdwarsstraat" vs "Eerste-Laurierdwarsstraat".
    """
    street, _, _, _ = split_address(address)
    
    # Remove common suffixes that shouldn't be part of street name
    suffixes_to_remove = ['hs', 'hoog', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii']
    
    # Split by space and filter out suffixes
    parts = street.split()
    filtered_parts = []
    
    for part in parts:
        part_lower = part.lower()
        if part_lower not in suffixes_to_remove:
            filtered_parts.append(part)
    
    result = ' '.join(filtered_parts)
    
    # Normalize: remove hyphens and normalize spacing
    normalized = normalize_street(result)
    
    # Handle specific cases like "eerste laurierdwarsstraat" vs "eerste-laurierdwarsstraat"
    # Convert hyphens to spaces for consistency
    normalized = normalized.replace('-', ' ')
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    return normalized


def calculate_street_stats(df: pd.DataFrame, strong_thr: float, medium_thr: float, min_entries: int) -> Tuple[List[str], pd.DataFrame]:
    """
    Calculate statistics per street and select top 5 MOST REPRESENTATIVE streets.
    
    Representativiteit wordt bepaald door:
    1. Geografische nabijheid tot referentie (Jordaan/Elandsgrachtbuurt)
    2. Voldoende huizen voor betrouwbare statistieken
    3. Vergelijkbare straattypen (dwarsstraten, grachten)
    4. Hoge gemiddelde scores
    """
    logger.info("Calculating street statistics...")
    
    # Extract street names
    df = df.copy()
    df['street'] = df['address'].apply(extract_street_from_address)
    
    # Calculate overall score if not present
    if 'score' not in df.columns:
        # Use the rule scores to calculate an overall score
        rule_columns = ['oppervlakte', 'locatie', 'energie', 'buitenruimte', 'verdieping', 'indeling', 'uiterlijk']
        available_rules = [col for col in rule_columns if col in df.columns]
        
        if available_rules:
            # Simple average of available rule scores
            df['score'] = df[available_rules].mean(axis=1)
            logger.info(f"Calculated overall score from {len(available_rules)} rule scores")
        else:
            logger.error("No score column and no rule scores found")
            return [], pd.DataFrame()
    
    # Group by street and calculate statistics
    street_groups = df.groupby('street')['score'].apply(list).reset_index(name='scores')
    
    def calc_stats(row):
        scores = sorted([s for s in row['scores'] if pd.notna(s)], reverse=True)
        
        if not scores:
            return pd.Series({
                'top1': 0.0,
                'top3_mean': 0.0,
                'strong_count': 0,
                'medium_count': 0,
                'total_count': 0
            })
        
        top1 = scores[0]
        top3 = scores[:3] if len(scores) >= 3 else scores
        top3_mean = sum(top3) / len(top3)
        
        strong_count = sum(1 for s in scores if s >= strong_thr)
        medium_count = sum(1 for s in scores if medium_thr <= s < strong_thr)
        total_count = len(scores)
        
        return pd.Series({
            'top1': top1,
            'top3_mean': top3_mean,
            'strong_count': strong_count,
            'medium_count': medium_count,
            'total_count': total_count
        })
    
    stats = street_groups.join(street_groups.apply(calc_stats, axis=1))
    
    # Create representativiteit score instead of simple ranking
    def calculate_representativity_score(row):
        """
        Bereken representativiteit score op basis van:
        1. Geografische nabijheid (Jordaan/Elandsgrachtbuurt straten krijgen bonus)
        2. Straattype (dwarsstraten, grachten krijgen bonus)
        3. Score kwaliteit
        4. Aantal huizen (meer = betrouwbaarder)
        """
        street = row['street'].lower()
        
        # Geografische bonus (Jordaan/Elandsgrachtbuurt)
        jordaan_keywords = ['laurier', 'looiers', 'bloem', 'lijnbaans', 'elands']
        location_bonus = 0.1 if any(keyword in street for keyword in jordaan_keywords) else 0.0
        
        # Straattype bonus (dwarsstraten, grachten)
        street_type_bonus = 0.0
        if 'dwarsstraat' in street:
            street_type_bonus += 0.15  # Dwarsstraten zijn zeer vergelijkbaar
        elif 'gracht' in street:
            street_type_bonus += 0.10  # Grachten zijn ook goed
        elif 'straat' in street:
            street_type_bonus += 0.05  # Gewone straten zijn oké
        
        # Score kwaliteit (top3_mean)
        score_quality = row['top3_mean']
        
        # Betrouwbaarheid bonus (meer huizen = betrouwbaarder)
        reliability_bonus = min(0.05, row['total_count'] * 0.01)  # Max 0.05 bonus
        
        # Totale representativiteit score
        representativity = score_quality + location_bonus + street_type_bonus + reliability_bonus
        
        return representativity
    
    stats['representativity'] = stats.apply(calculate_representativity_score, axis=1)
    
    # Filter streets with minimum entries
    stats_filtered = stats[stats['total_count'] >= min_entries]
    
    if len(stats_filtered) < 5:
        logger.warning(f"Only {len(stats_filtered)} streets have >= {min_entries} entries")
        logger.info("Consider lowering --min-entries or using more data")
    
    # Sort by representativity (highest first)
    stats_sorted = stats_filtered.sort_values('representativity', ascending=False)
    
    # Always include reference street (eerste laurierdwarsstraat)
    reference_street = "eerste laurierdwarsstraat"
    top_5_streets = []
    
    # First, add reference street if it exists
    if reference_street in stats_sorted['street'].values:
        top_5_streets.append(reference_street)
        logger.info(f"Reference street '{reference_street}' included (mandatory)")
    
    # Then add top 4 other streets (excluding reference if already added)
    other_streets = stats_sorted[stats_sorted['street'] != reference_street].head(4)['street'].tolist()
    top_5_streets.extend(other_streets)
    
    # Ensure we have exactly 5 streets
    top_5_streets = top_5_streets[:5]
    
    # Log statistics
    logger.info("Street statistics:")
    for _, row in stats_sorted.head(10).iterrows():
        logger.info(f"  {row['street']}: top3_mean={row['top3_mean']:.3f}, "
                   f"top1={row['top1']:.3f}, strong={row['strong_count']}, "
                   f"medium={row['medium_count']}, total={row['total_count']}, "
                   f"representativity={row['representativity']:.3f}")
    
    logger.info(f"Selected top 5 streets (reference + top 4): {top_5_streets}")
    
    return top_5_streets, stats_sorted


def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Get Top 5 Streets from Funda ranking data")
    parser.add_argument("--ranking-csv", default="outputs/ranking_top100.csv",
                       help="Path to ranking CSV file")
    parser.add_argument("--outdir", default="outputs",
                       help="Output directory")
    parser.add_argument("--strong-thr", type=float, default=STRONG_THR_DEFAULT,
                       help=f"Strong threshold (default: {STRONG_THR_DEFAULT})")
    parser.add_argument("--medium-thr", type=float, default=MEDIUM_THR_DEFAULT,
                       help=f"Medium threshold (default: {MEDIUM_THR_DEFAULT})")
    parser.add_argument("--min-entries", type=int, default=MIN_ENTRIES_PER_STREET,
                       help=f"Minimum entries per street (default: {MIN_ENTRIES_PER_STREET})")
    parser.add_argument("--verbose", "-v", action="store_true",
                       help="Verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create output directory
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Load ranking data
        logger.info(f"Loading ranking data from {args.ranking_csv}")
        ranking_df = pd.read_csv(args.ranking_csv)
        logger.info(f"Loaded {len(ranking_df)} ranking records")
        
        # Calculate street statistics and select top 5
        top_5_streets, street_stats = calculate_street_stats(
            ranking_df, args.strong_thr, args.medium_thr, args.min_entries
        )
        
        logger.info(f"Selected top 5 streets: {top_5_streets}")
        
        # Save street outputs
        with open(outdir / "best_5_streets.json", "w", encoding="utf-8") as f:
            json.dump(top_5_streets, f, indent=2, ensure_ascii=False)
        
        with open(outdir / "best_5_streets.txt", "w", encoding="utf-8") as f:
            for street in top_5_streets:
                f.write(f"{street}\n")
        
        # Console output
        print(f"\nTOP 5 STREETS:")
        for i, street in enumerate(top_5_streets, 1):
            street_row = street_stats[street_stats['street'] == street].iloc[0]
            print(f"{i}. {street} ({street_row['total_count']} entries, score: {street_row['top3_mean']:.3f})")
        
        print(f"\nFiles saved to {outdir}/")
        print("- best_5_streets.json")
        print("- best_5_streets.txt")
        
        logger.info(f"Top 5 streets saved to {outdir}")
        return 0
        
    except Exception as e:
        logger.error(f"Script failed: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
