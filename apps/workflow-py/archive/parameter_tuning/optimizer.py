#!/usr/bin/env python3
"""
Optimizer: Bayesian Optimization using Optuna to find optimal parameters.
"""

import optuna
import logging
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple
import json
from pathlib import Path

from .similarity_calculator import calculate_similarity_scores
from .price_calculator import calculate_expected_price
from .evaluator import calculate_metrics
from .geocoding import geocode_address

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class ParameterOptimizer:
    def __init__(
        self,
        train_data: pd.DataFrame,
        test_data: pd.DataFrame,
        max_distance_km: float = 5.0,
        min_comparables: int = 5
    ):
        """
        Initialize optimizer.
        
        Args:
            train_data: Training dataset (properties to use as reference)
            test_data: Test dataset (properties to use as reference for validation)
            max_distance_km: Maximum distance in km for comparable properties
            min_comparables: Minimum number of comparable properties required
        """
        self.train_data = train_data
        self.test_data = test_data
        self.max_distance_km = max_distance_km
        self.min_comparables = min_comparables
        
        # Cache for geocoding results
        self.geocoding_cache = {}
        
        # Results storage
        self.best_params = None
        self.best_score = None
        self.trial_results = []
    
    def find_comparable_properties(
        self,
        reference_data: dict,
        reference_lat: float = None,
        reference_lng: float = None,
        all_data: pd.DataFrame = None,
        exclude_address: str = None
    ) -> pd.DataFrame:
        """
        Find comparable properties within distance and postcode area.
        
        Args:
            reference_data: Reference property data
            reference_lat: Reference latitude
            reference_lng: Reference longitude
            all_data: All available properties
            exclude_address: Address to exclude (the reference property itself)
        
        Returns:
            DataFrame with comparable properties
        """
        from .geocoding import haversine_distance, extract_postcode_area
        
        # Filter out the reference property itself
        if exclude_address:
            all_data = all_data[all_data['address_full'] != exclude_address]
        
        # Filter by postcode area (first 4 digits)
        ref_postcode = reference_data.get('postal_code', '')
        ref_postcode_area = extract_postcode_area(ref_postcode)
        
        if ref_postcode_area:
            comparable_df = all_data.copy()
            comparable_df['postcode_area'] = comparable_df.get('postal_code', '').apply(extract_postcode_area)
            comparable_df = comparable_df[comparable_df['postcode_area'] == ref_postcode_area]
        else:
            comparable_df = all_data.copy()
        
        # Filter by distance if geocoding data available
        if reference_lat is not None and reference_lng is not None and 'lat' in comparable_df.columns and 'lng' in comparable_df.columns:
            distances = []
            for _, row in comparable_df.iterrows():
                if pd.notna(row.get('lat')) and pd.notna(row.get('lng')):
                    dist = haversine_distance(
                        reference_lat, reference_lng,
                        row['lat'], row['lng']
                    )
                    distances.append(dist)
                else:
                    distances.append(float('inf'))
            
            comparable_df = comparable_df.copy()
            comparable_df['distance_km'] = distances
            comparable_df = comparable_df[comparable_df['distance_km'] <= self.max_distance_km]
        # If no geocoding available, just use postcode filtering (already done above)
        
        return comparable_df.reset_index(drop=True)
    
    def evaluate_parameters(
        self,
        top_n: int,
        min_score: float,
        use_score_squared: bool,
        data_subset: pd.DataFrame = None,
        weights: dict = None
    ) -> Dict:
        """
        Evaluate parameter combination on dataset.
        
        Args:
            top_n: Number of top matches to use
            min_score: Minimum similarity score threshold
            use_score_squared: Whether to use score² for weighting
            data_subset: Subset of data to evaluate on (if None, uses train_data)
        
        Returns:
            Dict with metrics
        """
        if data_subset is None:
            data_subset = self.train_data
        
        actual_prices = []
        predicted_prices = []
        
        from .geocoding import geocode_address
        
        for idx, reference_row in data_subset.iterrows():
            try:
                # Prepare reference data
                reference_data = {
                    'address_full': reference_row.get('address_full', ''),
                    'area_m2': float(reference_row.get('area_m2', 0)),
                    'energy_label': str(reference_row.get('energy_label', 'C')),
                    'bedrooms': int(reference_row.get('bedrooms', 0)) if pd.notna(reference_row.get('bedrooms')) else 0,
                    'bathrooms': int(reference_row.get('bathrooms', 0)) if pd.notna(reference_row.get('bathrooms')) else 0,
                    'rooms': int(reference_row.get('rooms', 0)) if pd.notna(reference_row.get('rooms')) else 0,
                    'has_terrace': bool(reference_row.get('has_terrace', False)),
                    'has_balcony': bool(reference_row.get('has_balcony', False)),
                    'has_garden': bool(reference_row.get('has_garden', False)),
                    'postal_code': str(reference_row.get('postal_code', '')),
                    'street_name': str(reference_row.get('street', '')),
                    'sale_date': reference_row.get('sale_date', None),
                    'year_built': int(reference_row.get('year_built', 0)) if pd.notna(reference_row.get('year_built')) and reference_row.get('year_built', 0) > 0 else None,
                    'type': str(reference_row.get('type', '')) if pd.notna(reference_row.get('type')) else None,
                    'vve_monthly_fee': float(reference_row.get('vve_monthly_fee', 0)) if pd.notna(reference_row.get('vve_monthly_fee')) else None,
                    'has_parking': bool(reference_row.get('has_parking', False)),
                    'has_garage': bool(reference_row.get('has_garage', False)),
                    'has_lift': bool(reference_row.get('has_lift', False)),
                }
                
                # Get geocoding for reference (optional - can work without it)
                ref_address = reference_data['address_full']
                ref_lat = None
                ref_lng = None
                
                # Try to get geocoding, but don't fail if it's not available
                if pd.notna(reference_row.get('lat')) and pd.notna(reference_row.get('lng')):
                    ref_lat = float(reference_row['lat'])
                    ref_lng = float(reference_row['lng'])
                elif ref_address not in self.geocoding_cache:
                    try:
                        geo_result = geocode_address(ref_address)
                        if geo_result:
                            self.geocoding_cache[ref_address] = geo_result
                            ref_lat = geo_result['lat']
                            ref_lng = geo_result['lng']
                    except Exception as e:
                        logger.debug(f"Geocoding failed for {ref_address}: {e}, continuing without coordinates")
                        # Continue without geocoding - will use postcode filtering only
                else:
                    ref_lat = self.geocoding_cache[ref_address]['lat']
                    ref_lng = self.geocoding_cache[ref_address]['lng']
                
                # Find comparable properties (use all data except the reference)
                # Combine train and test, but exclude the reference property
                all_data = pd.concat([self.train_data, self.test_data]).reset_index(drop=True)
                
                # Use None for lat/lng if not available - find_comparable_properties will handle it
                comparable_df = self.find_comparable_properties(
                    reference_data,
                    ref_lat,
                    ref_lng,
                    all_data,
                    exclude_address=ref_address
                )
                
                # Ensure comparable properties have required columns
                required_cols = ['rw_sale_price', 'rw_area_m2', 'rw_energy_label']
                missing_cols = [col for col in required_cols if col not in comparable_df.columns]
                if missing_cols:
                    # Map from standard columns if rw_ prefix columns don't exist
                    if 'sale_price' in comparable_df.columns and 'rw_sale_price' not in comparable_df.columns:
                        comparable_df['rw_sale_price'] = comparable_df['sale_price']
                    if 'area_m2' in comparable_df.columns and 'rw_area_m2' not in comparable_df.columns:
                        comparable_df['rw_area_m2'] = comparable_df['area_m2']
                    if 'energy_label' in comparable_df.columns and 'rw_energy_label' not in comparable_df.columns:
                        comparable_df['rw_energy_label'] = comparable_df['energy_label']
                
                if len(comparable_df) < self.min_comparables:
                    continue  # Skip if not enough comparables
                
                # Calculate similarity scores (with optional weights)
                comparable_df = calculate_similarity_scores(reference_data, comparable_df, weights=weights)
                
                # Calculate expected price
                expected_price = calculate_expected_price(
                    comparable_df,
                    reference_data,
                    top_n=top_n,
                    min_score=min_score,
                    use_score_squared=use_score_squared
                )
                
                if expected_price > 0:
                    actual_price = float(reference_row.get('sale_price', 0))
                    if actual_price > 0:
                        actual_prices.append(actual_price)
                        predicted_prices.append(expected_price)
            
            except Exception as e:
                logger.warning(f"Error evaluating property {idx}: {e}")
                continue
        
        if len(actual_prices) == 0:
            return {
                'mape': 100.0,
                'within_10pct': 0.0,
                'within_15pct': 0.0,
                'valid_predictions': 0
            }
        
        # Calculate metrics
        metrics = calculate_metrics(actual_prices, predicted_prices)
        return metrics
    
    def objective(self, trial: optuna.Trial, tune_weights: bool = True) -> float:
        """
        Optuna objective function to minimize.
        
        Args:
            trial: Optuna trial
            tune_weights: If True, also tune similarity weights
        
        Returns:
            Score to maximize (within_10pct - mape/10)
        """
        # Suggest price calculation parameters
        top_n = trial.suggest_int('top_n', 3, 15)
        min_score = trial.suggest_float('min_score', 0.50, 0.80, step=0.05)
        use_score_squared = trial.suggest_categorical('use_score_squared', [True, False])
        
        # Suggest similarity weights if tuning enabled
        weights = None
        if tune_weights:
            # Refined ranges based on previous optimization results
            # Best values were around: street=0.08, osm=0.11, area=0.28, distance=0.12, 
            # garden=0.01, rooms=0.02, balcony=0.11, energy=0.45, gracht=0.001
            w_street = trial.suggest_float('weight_street_name', 0.05, 0.12, step=0.01)
            w_osm = trial.suggest_float('weight_osm_street', 0.08, 0.18, step=0.01)
            w_area = trial.suggest_float('weight_area', 0.22, 0.35, step=0.01)
            w_distance = trial.suggest_float('weight_distance', 0.08, 0.18, step=0.01)
            w_garden = trial.suggest_float('weight_garden', 0.005, 0.03, step=0.005)
            w_rooms = trial.suggest_float('weight_rooms', 0.01, 0.05, step=0.01)
            w_balcony = trial.suggest_float('weight_balcony', 0.08, 0.15, step=0.01)
            w_energy = trial.suggest_float('weight_energy_label', 0.35, 0.55, step=0.02)
            w_sale_date = trial.suggest_float('weight_sale_date', 0.01, 0.15, step=0.01)
            w_year_built = trial.suggest_float('weight_year_built', 0.01, 0.08, step=0.01)  # New: building year
            w_property_type = trial.suggest_float('weight_property_type', 0.02, 0.10, step=0.01)  # New: property type
            w_vve_fee = trial.suggest_float('weight_vve_fee', 0.005, 0.05, step=0.005)  # New: VVE fee
            w_parking = trial.suggest_float('weight_parking', 0.005, 0.05, step=0.005)  # New: parking/garage
            w_lift = trial.suggest_float('weight_lift', 0.005, 0.03, step=0.005)  # New: lift
            gracht_penalty = trial.suggest_float('gracht_penalty', 0.0005, 0.02, step=0.001)
            
            weights = {
                'weight_street_name': w_street,
                'weight_osm_street': w_osm,
                'weight_area': w_area,
                'weight_distance': w_distance,
                'weight_garden': w_garden,
                'weight_rooms': w_rooms,
                'weight_balcony': w_balcony,
                'weight_energy_label': w_energy,
                'weight_sale_date': w_sale_date,
                'weight_year_built': w_year_built,  # New: building year
                'weight_property_type': w_property_type,  # New: property type
                'weight_vve_fee': w_vve_fee,  # New: VVE fee
                'weight_parking': w_parking,  # New: parking/garage
                'weight_lift': w_lift,  # New: lift
                'gracht_penalty': gracht_penalty
            }
        
        # Evaluate on training data
        metrics = self.evaluate_parameters(top_n, min_score, use_score_squared, weights=weights)
        
        # Store trial results
        trial_result = {
            'trial_number': trial.number,
            'top_n': top_n,
            'min_score': min_score,
            'use_score_squared': use_score_squared,
            **metrics
        }
        if weights:
            trial_result.update(weights)
        self.trial_results.append(trial_result)
        
        # Objective: maximize percentage within 10%, minimize MAPE
        # Combine both: maximize (within_10pct - mape/10)
        score = metrics['within_10pct'] - (metrics['mape'] / 10)
        
        return score
    
    def optimize(self, n_trials: int = 100, n_jobs: int = 1, tune_weights: bool = True) -> Dict:
        """
        Run Bayesian optimization.
        
        Args:
            n_trials: Number of optimization trials
            n_jobs: Number of parallel jobs (1 = sequential)
        
        Returns:
            Dict with best parameters and results
        """
        logger.info(f"Starting Bayesian optimization with {n_trials} trials...")
        
        study = optuna.create_study(
            direction='maximize',  # We want to maximize the score
            study_name='price_prediction_optimization'
        )
        
        study.optimize(
            lambda trial: self.objective(trial, tune_weights=tune_weights),
            n_trials=n_trials,
            n_jobs=n_jobs,
            show_progress_bar=True
        )
        
        # Get best parameters
        self.best_params = study.best_params
        self.best_score = study.best_value
        
        logger.info(f"Best parameters: {self.best_params}")
        logger.info(f"Best score: {self.best_score:.2f}")
        
        # Extract weights if present
        weights = None
        if tune_weights:
            weights = {
                'weight_street_name': self.best_params.get('weight_street_name'),
                'weight_osm_street': self.best_params.get('weight_osm_street'),
                'weight_area': self.best_params.get('weight_area'),
                'weight_distance': self.best_params.get('weight_distance'),
                'weight_garden': self.best_params.get('weight_garden'),
                'weight_rooms': self.best_params.get('weight_rooms'),
                'weight_balcony': self.best_params.get('weight_balcony'),
                'weight_energy_label': self.best_params.get('weight_energy_label'),
                'weight_sale_date': self.best_params.get('weight_sale_date'),
                'weight_year_built': self.best_params.get('weight_year_built'),
                'weight_property_type': self.best_params.get('weight_property_type'),
                'weight_vve_fee': self.best_params.get('weight_vve_fee'),
                'weight_parking': self.best_params.get('weight_parking'),
                'weight_lift': self.best_params.get('weight_lift'),
                'gracht_penalty': self.best_params.get('gracht_penalty')
            }
            # Remove None values
            weights = {k: v for k, v in weights.items() if v is not None}
        
        # Evaluate best parameters on test set
        logger.info("Evaluating best parameters on test set...")
        test_metrics = self.evaluate_parameters(
            self.best_params['top_n'],
            self.best_params['min_score'],
            self.best_params['use_score_squared'],
            data_subset=self.test_data,
            weights=weights
        )
        
        return {
            'best_params': self.best_params,
            'best_score': self.best_score,
            'train_metrics': self.trial_results[-1] if self.trial_results else None,
            'test_metrics': test_metrics,
            'all_trials': self.trial_results
        }
    
    def save_results(self, output_path: str):
        """Save optimization results to JSON file."""
        results = {
            'best_params': self.best_params,
            'best_score': self.best_score,
            'trial_results': self.trial_results
        }
        
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)
        
        logger.info(f"Results saved to {output_path}")

