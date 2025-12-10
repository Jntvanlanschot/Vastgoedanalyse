#!/usr/bin/env python3
"""
Data Loader: Load all Realworks RTF files and create a unified database.
"""

import pandas as pd
import logging
from pathlib import Path
from typing import List, Dict, Any
import sys
import os

# Add parent directory to path to import parse_realworks_perfect
sys.path.append(str(Path(__file__).parent.parent))
from parse_realworks_perfect import parse_rtf_file

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def load_all_realworks_files(downloads_folder: str = None) -> pd.DataFrame:
    """
    Load all RTF files from Downloads folder and create unified database.
    
    Args:
        downloads_folder: Path to Downloads folder. If None, uses default Windows path.
    
    Returns:
        DataFrame with all properties
    """
    if downloads_folder is None:
        # Default Windows Downloads folder
        downloads_folder = Path.home() / "Downloads"
    else:
        downloads_folder = Path(downloads_folder)
    
    logger.info(f"Scanning for RTF files in: {downloads_folder}")
    
    # Find all RTF files
    rtf_files = list(downloads_folder.glob("*.rtf"))
    rtf_files.extend(list(downloads_folder.glob("**/*.rtf")))  # Also check subdirectories
    
    if not rtf_files:
        logger.warning(f"No RTF files found in {downloads_folder}")
        return pd.DataFrame()
    
    logger.info(f"Found {len(rtf_files)} RTF files")
    
    # Parse all files
    all_properties = []
    for rtf_file in rtf_files:
        try:
            properties = parse_rtf_file(rtf_file)
            all_properties.extend(properties)
            logger.info(f"Parsed {rtf_file.name}: {len(properties)} properties")
        except Exception as e:
            logger.error(f"Error parsing {rtf_file.name}: {e}")
            continue
    
    if not all_properties:
        logger.warning("No properties found in any RTF files")
        return pd.DataFrame()
    
    # Convert to DataFrame
    df = pd.DataFrame(all_properties)
    logger.info(f"Total properties loaded: {len(df)}")
    
    # Filter valid properties
    df = filter_valid_properties(df)
    logger.info(f"Valid properties after filtering: {len(df)}")
    
    return df

def filter_valid_properties(df: pd.DataFrame) -> pd.DataFrame:
    """
    Filter properties with valid data for price prediction.
    
    Requirements:
    - Valid sale_price > 0
    - Valid area_m2 > 0
    - Valid address_full
    """
    initial_count = len(df)
    
    # Filter for valid sale_price
    if 'sale_price' in df.columns:
        # Fill missing with ask_price
        df['sale_price'] = df['sale_price'].fillna(df.get('ask_price', 0))
        df = df[df['sale_price'] > 0]
        logger.info(f"After sale_price filter: {len(df)} properties")
    
    # Filter for valid area_m2
    if 'area_m2' in df.columns:
        df = df[df['area_m2'] > 0]
        logger.info(f"After area_m2 filter: {len(df)} properties")
    
    # Filter for valid address
    if 'address_full' in df.columns:
        df = df[df['address_full'].notna()]
        df = df[df['address_full'] != '']
        logger.info(f"After address filter: {len(df)} properties")
    
    # Remove duplicates by address
    if 'address_full' in df.columns:
        df = df.drop_duplicates(subset=['address_full'], keep='first')
        logger.info(f"After removing duplicates: {len(df)} properties")
    
    logger.info(f"Filtered {initial_count} -> {len(df)} properties")
    return df

def detect_outliers(df: pd.DataFrame, price_column: str = 'sale_price') -> pd.DataFrame:
    """
    Detect and remove outliers using IQR method.
    
    Outliers are defined as properties with price > 3x median or < 0.1x median.
    """
    if price_column not in df.columns:
        return df
    
    initial_count = len(df)
    
    # Calculate median and IQR
    median_price = df[price_column].median()
    q1 = df[price_column].quantile(0.25)
    q3 = df[price_column].quantile(0.75)
    iqr = q3 - q1
    
    # Define outlier bounds (more lenient than standard IQR)
    lower_bound = max(0, median_price * 0.1)  # At least 10% of median
    upper_bound = median_price * 3  # At most 3x median
    
    # Filter outliers
    df_filtered = df[(df[price_column] >= lower_bound) & (df[price_column] <= upper_bound)]
    
    outliers_removed = initial_count - len(df_filtered)
    if outliers_removed > 0:
        logger.info(f"Removed {outliers_removed} outliers (price < {lower_bound:.0f} or > {upper_bound:.0f})")
    
    return df_filtered

if __name__ == "__main__":
    # Test the data loader
    df = load_all_realworks_files()
    df = detect_outliers(df)
    print(f"\nLoaded {len(df)} properties")
    print(f"\nColumns: {list(df.columns)}")
    if len(df) > 0:
        print(f"\nSample data:")
        print(df[['address_full', 'sale_price', 'area_m2', 'rooms', 'energy_label']].head())


