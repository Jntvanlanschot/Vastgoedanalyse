#!/usr/bin/env python3
"""
Energy Label Correction Module

This module provides functions to:
1. Calculate energy label similarity scores
2. Apply energy label price corrections to normalize prices to reference energy level
"""

import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Energy label price adjustments (market corrections)
# These represent the average price premium/discount for each energy label
# Positive values = premium (better label = higher price)
# Negative values = discount (worse label = lower price)
# INCREASED VALUES for more enthusiastic energy label impact
ENERGY_LABEL_ADJUSTMENTS = {
    "A++++": +0.18,  # 18% premium (increased from 12%)
    "A+++": +0.15,   # 15% premium (increased from 10%)
    "A++": +0.12,    # 12% premium (increased from 8%)
    "A+": +0.10,     # 10% premium (increased from 6%)
    "A": +0.08,      # 8% premium (increased from 5%)
    "B": +0.04,      # 4% premium (increased from 2%)
    "C": 0.00,       # Neutral (baseline)
    "D": -0.05,      # 5% discount (increased from 3%)
    "E": -0.08,      # 8% discount (increased from 5%)
    "F": -0.12,      # 12% discount (increased from 7%)
    "G": -0.15,      # 15% discount (increased from 10%)
}

# Energy label scores for similarity calculation
ENERGY_LABEL_SCORES = {
    "A++++": 11,
    "A+++": 10,
    "A++": 9,
    "A+": 8,
    "A": 7,
    "B": 6,
    "C": 5,
    "D": 4,
    "E": 3,
    "F": 2,
    "G": 1,
}

def get_energy_label_adjustment(label: Optional[str]) -> float:
    """
    Get price adjustment factor for an energy label.
    
    Args:
        label: Energy label string (e.g., "A", "B", "C", etc.)
    
    Returns:
        Adjustment factor (e.g., 0.05 for A, 0.0 for C, -0.07 for F)
    """
    if not label:
        return 0.0
    
    label_upper = str(label).upper().strip()
    return ENERGY_LABEL_ADJUSTMENTS.get(label_upper, 0.0)

def get_energy_label_score(label: Optional[str]) -> Optional[int]:
    """
    Get numeric score for an energy label (for similarity calculation).
    
    Args:
        label: Energy label string
    
    Returns:
        Numeric score (11 for A++++, 1 for G, None if unknown)
    """
    if not label:
        return None
    
    label_upper = str(label).upper().strip()
    return ENERGY_LABEL_SCORES.get(label_upper)

def energy_label_similarity(subject_label: Optional[str], comp_label: Optional[str]) -> float:
    """
    Calculate similarity score (0-1) based on energy label difference.
    
    Returns:
        - 1.0 = identical labels
        - ~0.9 = one step difference (e.g., A vs B)
        - ~0.75 = two steps difference (e.g., A vs C)
        - ~0.6 = three steps difference
        - Lower for larger differences
        - 0.7 = default for unknown labels
    
    Args:
        subject_label: Reference property energy label
        comp_label: Comparable property energy label
    
    Returns:
        Similarity score between 0 and 1
    """
    if not subject_label or not comp_label:
        return 0.7  # Default for missing labels
    
    subject_score = get_energy_label_score(subject_label)
    comp_score = get_energy_label_score(comp_label)
    
    if subject_score is None or comp_score is None:
        return 0.7  # Default for unknown labels
    
    diff = abs(subject_score - comp_score)
    
    if diff == 0:
        return 1.0
    elif diff == 1:
        return 0.9
    elif diff == 2:
        return 0.75
    elif diff == 3:
        return 0.6
    else:
        # Exponential decay for larger differences
        return max(0.4, 1.0 - 0.15 * diff)

def correct_price_for_energy_label(
    base_price: float,
    comp_label: Optional[str],
    reference_label: Optional[str]
) -> float:
    """
    Correct a price to normalize it to the reference energy label level.
    
    Example:
        - Reference: Label C (0% adjustment)
        - Comparable: Label A (+5% adjustment)
        - Correction: 1 + (0.0 - 0.05) = 0.95 (reduce price by 5%)
        - Result: Price is adjusted DOWN because comparable has better label
    
    Args:
        base_price: Original price of the comparable property
        comp_label: Energy label of the comparable property
        reference_label: Energy label of the reference property
    
    Returns:
        Price corrected to reference energy label level
    """
    if not base_price or base_price <= 0:
        return base_price
    
    ref_factor = get_energy_label_adjustment(reference_label)
    comp_factor = get_energy_label_adjustment(comp_label)
    
    # Correction factor: normalize to reference level
    # If comp has better label (higher factor), we reduce the price
    # If comp has worse label (lower factor), we increase the price
    label_correction = 1.0 + (ref_factor - comp_factor)
    
    corrected_price = base_price * label_correction
    
    return corrected_price

