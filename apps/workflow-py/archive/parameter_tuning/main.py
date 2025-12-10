#!/usr/bin/env python3
"""
Main script for parameter tuning.
"""

import pandas as pd
import numpy as np
import logging
import argparse
from pathlib import Path
from sklearn.model_selection import train_test_split
import json
from datetime import datetime

from .data_loader import load_all_realworks_files, detect_outliers
from .geocoding import geocode_address
from .optimizer import ParameterOptimizer

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def add_geocoding_to_dataframe(df: pd.DataFrame, max_workers: int = 1) -> pd.DataFrame:
    """
    Add latitude and longitude to all properties in dataframe.
    
    Args:
        df: DataFrame with properties
        max_workers: Number of parallel workers (currently 1 for rate limiting)
    
    Returns:
        DataFrame with added 'lat' and 'lng' columns
    """
    logger.info(f"Adding geocoding for {len(df)} properties...")
    
    df = df.copy()
    df['lat'] = np.nan
    df['lng'] = np.nan
    
    geocoded_count = 0
    failed_count = 0
    
    for idx, row in df.iterrows():
        address = row.get('address_full', '')
        if not address:
            continue
        
        try:
            geo_result = geocode_address(address)
            if geo_result:
                df.at[idx, 'lat'] = geo_result['lat']
                df.at[idx, 'lng'] = geo_result['lng']
                geocoded_count += 1
            else:
                failed_count += 1
        except Exception as e:
            logger.warning(f"Geocoding failed for {address}: {e}")
            failed_count += 1
        
        # Progress logging
        if (idx + 1) % 10 == 0:
            logger.info(f"Geocoded {idx + 1}/{len(df)} properties ({geocoded_count} success, {failed_count} failed)")
    
    logger.info(f"Geocoding complete: {geocoded_count} success, {failed_count} failed")
    return df

def main():
    parser = argparse.ArgumentParser(description='Parameter tuning for price prediction')
    parser.add_argument(
        '--downloads-folder',
        type=str,
        default=None,
        help='Path to Downloads folder (default: ~/Downloads)'
    )
    parser.add_argument(
        '--n-trials',
        type=int,
        default=100,
        help='Number of optimization trials (default: 100)'
    )
    parser.add_argument(
        '--test-size',
        type=float,
        default=0.2,
        help='Test set size as fraction (default: 0.2)'
    )
    parser.add_argument(
        '--max-distance',
        type=float,
        default=5.0,
        help='Maximum distance in km for comparable properties (default: 5.0)'
    )
    parser.add_argument(
        '--min-comparables',
        type=int,
        default=5,
        help='Minimum number of comparable properties required (default: 5)'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default='parameter_tuning_results',
        help='Output directory for results (default: parameter_tuning_results)'
    )
    parser.add_argument(
        '--skip-geocoding',
        action='store_true',
        help='Skip geocoding (use existing lat/lng if available)'
    )
    
    args = parser.parse_args()
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(exist_ok=True)
    
    logger.info("=" * 80)
    logger.info("PARAMETER TUNING FOR PRICE PREDICTION")
    logger.info("=" * 80)
    
    # Step 1: Load all Realworks files
    logger.info("\n[Step 1] Loading Realworks files...")
    df = load_all_realworks_files(args.downloads_folder)
    
    if len(df) == 0:
        logger.error("No valid properties found. Exiting.")
        return
    
    logger.info(f"Loaded {len(df)} properties")
    
    # Step 2: Remove outliers
    logger.info("\n[Step 2] Removing outliers...")
    df = detect_outliers(df)
    logger.info(f"After outlier removal: {len(df)} properties")
    
    # Step 3: Add geocoding
    if not args.skip_geocoding:
        logger.info("\n[Step 3] Adding geocoding...")
        # Initialize lat/lng columns if they don't exist
        if 'lat' not in df.columns:
            df['lat'] = np.nan
        if 'lng' not in df.columns:
            df['lng'] = np.nan
        
        # Only geocode properties that don't have coordinates yet
        missing_geo = df[df['lat'].isna() | df['lng'].isna()]
        if len(missing_geo) > 0:
            logger.info(f"Geocoding {len(missing_geo)} properties without coordinates...")
            df = add_geocoding_to_dataframe(df)
        else:
            logger.info("All properties already have coordinates, skipping geocoding")
        
        # Filter out properties without geocoding
        df = df[df['lat'].notna() & df['lng'].notna()]
        logger.info(f"After geocoding: {len(df)} properties with valid coordinates")
    else:
        logger.info("\n[Step 3] Skipping geocoding (using existing lat/lng)")
        if 'lat' not in df.columns or 'lng' not in df.columns:
            logger.warning("No lat/lng columns found. Properties will be skipped during optimization if geocoding fails.")
            # Initialize empty columns
            df['lat'] = np.nan
            df['lng'] = np.nan
    
    if len(df) < 20:
        logger.error(f"Not enough properties ({len(df)}). Need at least 20. Exiting.")
        return
    
    # Step 4: Train/Test split
    logger.info("\n[Step 4] Creating train/test split...")
    train_df, test_df = train_test_split(
        df,
        test_size=args.test_size,
        random_state=42
    )
    logger.info(f"Train set: {len(train_df)} properties")
    logger.info(f"Test set: {len(test_df)} properties")
    
    # Save datasets
    train_df.to_csv(output_dir / 'train_data.csv', index=False)
    test_df.to_csv(output_dir / 'test_data.csv', index=False)
    logger.info(f"Saved datasets to {output_dir}")
    
    # Step 5: Run optimization
    logger.info("\n[Step 5] Starting Bayesian optimization...")
    optimizer = ParameterOptimizer(
        train_data=train_df,
        test_data=test_df,
        max_distance_km=args.max_distance,
        min_comparables=args.min_comparables
    )
    
    results = optimizer.optimize(n_trials=args.n_trials, n_jobs=1, tune_weights=True)
    
    # Step 6: Save results
    logger.info("\n[Step 6] Saving results...")
    
    # Save full results
    results_file = output_dir / f'optimization_results_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
    optimizer.save_results(str(results_file))
    
    # Save summary
    summary = {
        'timestamp': datetime.now().isoformat(),
        'best_parameters': results['best_params'],
        'best_score': results['best_score'],
        'test_metrics': results['test_metrics'],
        'train_metrics': results.get('train_metrics'),
        'n_trials': args.n_trials,
        'train_size': len(train_df),
        'test_size': len(test_df),
        'total_properties': len(df)
    }
    
    summary_file = output_dir / 'best_parameters_summary.json'
    with open(summary_file, 'w') as f:
        json.dump(summary, f, indent=2)
    
    logger.info("\n" + "=" * 80)
    logger.info("OPTIMIZATION COMPLETE")
    logger.info("=" * 80)
    logger.info(f"\nBest Parameters:")
    logger.info(f"  TOP_N: {results['best_params']['top_n']}")
    logger.info(f"  MIN_SCORE: {results['best_params']['min_score']} ({int(results['best_params']['min_score'] * 100)}%)")
    logger.info(f"  USE_SCORE_SQUARED: {results['best_params']['use_score_squared']}")
    logger.info(f"\nTest Set Performance:")
    logger.info(f"  Within 10%: {results['test_metrics']['within_10pct']:.2f}%")
    logger.info(f"  Within 15%: {results['test_metrics']['within_15pct']:.2f}%")
    logger.info(f"  MAPE: {results['test_metrics']['mape']:.2f}%")
    logger.info(f"  MAE: €{results['test_metrics']['mae']:,.0f}")
    logger.info(f"  RMSE: €{results['test_metrics']['rmse']:,.0f}")
    logger.info(f"\nResults saved to: {output_dir}")
    logger.info("=" * 80)

if __name__ == "__main__":
    main()

