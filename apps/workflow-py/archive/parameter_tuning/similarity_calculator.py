#!/usr/bin/env python3
"""
Similarity Calculator: Calculate similarity scores between properties.
"""

import pandas as pd
import logging
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent / "workflow"))
from api_workflow import calculate_simple_similarity_score
from .similarity_calculator_with_weights import calculate_similarity_score_with_weights

logging.basicConfig(level=logging.WARNING, format='%(levelname)s: %(message)s')  # Reduce logging
logger = logging.getLogger(__name__)

def calculate_similarity_scores(
    reference_data: dict,
    comparable_df: pd.DataFrame,
    street_similarity_cache: dict = None,
    weights: dict = None
) -> pd.DataFrame:
    """
    Calculate similarity scores for all comparable properties.
    
    Args:
        reference_data: Reference property data
        comparable_df: DataFrame with comparable properties
        street_similarity_cache: Optional cache for street similarity (can be None)
        weights: Optional dict with configurable weights (if None, uses default function)
    
    Returns:
        DataFrame with added 'final_score' column
    """
    scores = []
    
    for idx, row in comparable_df.iterrows():
        try:
            if weights is not None:
                # Use configurable weights version
                score = calculate_similarity_score_with_weights(
                    row,
                    reference_data,
                    weights,
                    street_similarity_cache=street_similarity_cache,
                    debug=False
                )
            else:
                # Use default function
                score = calculate_simple_similarity_score(
                    row,
                    reference_data,
                    street_similarity_cache=street_similarity_cache,
                    debug=False
                )
            scores.append(score)
        except Exception as e:
            logger.warning(f"Error calculating score for {row.get('address_full', 'unknown')}: {e}")
            scores.append(0.0)
    
    comparable_df = comparable_df.copy()
    comparable_df['final_score'] = scores
    
    # Sort by score descending
    comparable_df = comparable_df.sort_values('final_score', ascending=False).reset_index(drop=True)
    
    return comparable_df

