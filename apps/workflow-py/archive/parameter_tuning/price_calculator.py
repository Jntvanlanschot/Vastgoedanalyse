#!/usr/bin/env python3
"""
Price Calculator: Calculate expected price using similarity scores and parameters.
"""

import pandas as pd
import numpy as np
import logging
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent / "workflow"))
from energy_label_correction import correct_price_for_energy_label

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def calculate_expected_price(
    comparable_df: pd.DataFrame,
    reference_data: dict,
    top_n: int = 5,
    min_score: float = 0.65,
    use_score_squared: bool = True
) -> float:
    """
    Calculate expected price for reference property based on comparable properties.
    
    Args:
        comparable_df: DataFrame with comparable properties (must have 'final_score', 'rw_sale_price', 'rw_area_m2', 'rw_energy_label')
        reference_data: Reference property data (must have 'area_m2', 'energy_label')
        top_n: Number of top matches to use
        min_score: Minimum similarity score threshold
        use_score_squared: Whether to use score² for weighting
    
    Returns:
        Expected price (float), or 0 if calculation fails
    """
    if len(comparable_df) == 0:
        return 0.0
    
    # Filter by minimum score and take top N
    filtered_df = comparable_df[comparable_df['final_score'] >= min_score].head(top_n)
    
    # Fallback: if no matches meet minimum score, use top 5 without filter
    if len(filtered_df) == 0:
        filtered_df = comparable_df.head(5)
    
    if len(filtered_df) == 0:
        return 0.0
    
    # Calculate weighted average price per m²
    price_weights = []
    ref_label = reference_data.get('energy_label', 'C')
    ref_area = reference_data.get('area_m2', 100)
    
    for _, row in filtered_df.iterrows():
        sale_price = row.get('rw_sale_price', 0)
        area_m2 = row.get('rw_area_m2', 0)
        score = row.get('final_score', 0)
        
        if pd.notna(sale_price) and sale_price > 0 and pd.notna(area_m2) and area_m2 > 0 and pd.notna(score) and score > 0:
            # Apply energy label correction
            comp_label = row.get('rw_energy_label', 'Unknown')
            corrected_price = correct_price_for_energy_label(sale_price, comp_label, ref_label)
            
            # Calculate price per m²
            price_per_m2 = corrected_price / area_m2
            
            # Apply score weighting
            if use_score_squared:
                weight = float(score) ** 2
            else:
                weight = float(score)
            
            price_weights.append((price_per_m2, weight))
    
    if not price_weights:
        return 0.0
    
    # Calculate weighted average
    total_weight = sum(w for _, w in price_weights)
    if total_weight > 0:
        avg_price_per_m2 = sum(p * w for p, w in price_weights) / total_weight
    else:
        # Fallback to simple mean
        avg_price_per_m2 = sum(p for p, _ in price_weights) / len(price_weights)
    
    # Calculate expected price
    expected_price = avg_price_per_m2 * ref_area
    
    return expected_price


