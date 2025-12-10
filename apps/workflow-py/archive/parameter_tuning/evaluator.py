#!/usr/bin/env python3
"""
Evaluator: Calculate evaluation metrics for price predictions.
"""

import numpy as np
import pandas as pd
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def calculate_metrics(actual_prices: list, predicted_prices: list) -> dict:
    """
    Calculate evaluation metrics for price predictions.
    
    Args:
        actual_prices: List of actual sale prices
        predicted_prices: List of predicted prices
    
    Returns:
        Dict with metrics
    """
    actual = np.array(actual_prices)
    predicted = np.array(predicted_prices)
    
    # Filter out zeros (failed predictions)
    valid_mask = (actual > 0) & (predicted > 0)
    if valid_mask.sum() == 0:
        return {
            'mape': 100.0,
            'mae': float('inf'),
            'rmse': float('inf'),
            'within_10pct': 0.0,
            'within_15pct': 0.0,
            'valid_predictions': 0,
            'total_predictions': len(actual_prices)
        }
    
    actual_valid = actual[valid_mask]
    predicted_valid = predicted[valid_mask]
    
    # Mean Absolute Percentage Error (MAPE)
    mape = np.mean(np.abs((actual_valid - predicted_valid) / actual_valid)) * 100
    
    # Mean Absolute Error (MAE)
    mae = np.mean(np.abs(actual_valid - predicted_valid))
    
    # Root Mean Squared Error (RMSE)
    rmse = np.sqrt(np.mean((actual_valid - predicted_valid) ** 2))
    
    # Percentage within 10% and 15%
    errors = np.abs(actual_valid - predicted_valid) / actual_valid
    within_10pct = (errors <= 0.10).sum() / len(actual_valid) * 100
    within_15pct = (errors <= 0.15).sum() / len(actual_valid) * 100
    
    return {
        'mape': float(mape),
        'mae': float(mae),
        'rmse': float(rmse),
        'within_10pct': float(within_10pct),
        'within_15pct': float(within_15pct),
        'valid_predictions': int(valid_mask.sum()),
        'total_predictions': len(actual_prices)
    }


