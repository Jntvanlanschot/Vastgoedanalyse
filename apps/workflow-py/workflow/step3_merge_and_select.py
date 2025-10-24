#!/usr/bin/env python3
"""
STEP 3: Data Merging and Top 15 Selection

This script:
1. Merges Funda data with processed Realworks data
2. Calculates similarity scores based on reference address
3. Selects top 15 best matches
4. Returns merged data and top 15 results

Input: Funda data, Realworks data from step 2, reference data
Output: Merged data (CSV), Top 15 matches (CSV)
"""

import json
import logging
import sys
from pathlib import Path
import pandas as pd

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def merge_and_select_top15(reference_data, funda_csv_path="dataset_funda-nl-scraper_2025-10-21_11-18-05-402.csv", realworks_csv_path="outputs/realworks_perfect_data.csv"):
    """
    Merge Funda and Realworks data and select top 15 matches.
    
    Args:
        reference_data (dict): Reference address data
        funda_csv_path (str): Path to Funda CSV data
        realworks_csv_path (str): Path to processed Realworks data
    
    Returns:
        dict: Result with merged data and top 15 matches
    """
    
    try:
        # Load data
        logger.info(f"Loading Funda data from {funda_csv_path}")
        funda_df = pd.read_csv(funda_csv_path)
        logger.info(f"Loaded {len(funda_df)} Funda records")
        
        logger.info(f"Loading Realworks data from {realworks_csv_path}")
        realworks_df = pd.read_csv(realworks_csv_path)
        logger.info(f"Loaded {len(realworks_df)} Realworks records")
        
        # Remove duplicates from Funda
        funda_df['address_full'] = funda_df['address/street_name'] + ' ' + funda_df['address/house_number'].astype(str)
        funda_df['address_full'] = funda_df['address_full'] + funda_df['address/house_number_suffix'].fillna('')
        funda_df['address_full'] = funda_df['address_full'] + ', ' + funda_df['address/postal_code'] + ', ' + funda_df['address/city']
        
        funda_df = funda_df.drop_duplicates(subset=['address_full']).reset_index(drop=True)
        logger.info(f"After removing duplicates: {len(funda_df)} unique Funda records")
        
        # Merge data using existing merge algorithm
        import sys
        sys.path.append('.')
        from merge_perfect import merge_funda_realworks_perfect
        
        # Temporarily change working directory to run merge
        import os
        original_cwd = os.getcwd()
        
        try:
            merged_df = merge_funda_realworks_perfect()
        finally:
            os.chdir(original_cwd)
        
        # Load the merged data
        merged_df = pd.read_csv('outputs/perfect_merged_data.csv')
        logger.info(f"Loaded {len(merged_df)} merged records")
        
        # Find top 15 using existing algorithm
        from find_top15_perfect import calculate_similarity_score
        
        # Use the provided reference data directly
        logger.info(f"Using reference data: {reference_data.get('address_full', 'Unknown address')}")
        
        # Only consider records with Realworks data
        df_with_rw = merged_df[merged_df['match_type'] != 'no_match'].copy()
        logger.info(f"Records with Realworks data: {len(df_with_rw)}")
        
        if len(df_with_rw) == 0:
            return {
                "status": "error",
                "message": "No matches found between Funda and Realworks data",
                "total_records": len(merged_df),
                "matched_records": 0,
                "top_15_matches": []
            }
        
        # Calculate similarity scores using the provided reference data
        df_with_rw['similarity_score'] = df_with_rw.apply(lambda row: calculate_similarity_score(row, reference_data), axis=1)
        
        # Sort by score and select top 15
        top15_df = df_with_rw.sort_values(by='similarity_score', ascending=False).head(15).copy()
        
        # Add final_score column
        top15_df['final_score'] = top15_df['similarity_score']
        
        # Save results
        merged_output = Path('outputs/perfect_merged_data_final.csv')
        top15_output = Path('outputs/top15_perfect_matches_final.csv')
        
        merged_df.to_csv(merged_output, index=False)
        top15_df.to_csv(top15_output, index=False)
        
        logger.info(f"Saved {len(merged_df)} merged records to {merged_output}")
        logger.info(f"Saved {len(top15_df)} top 15 matches to {top15_output}")
        
        # Prepare result
        result = {
            "status": "success",
            "message": f"Successfully processed {len(merged_df)} records and found {len(top_15_matches)} top matches",
            "total_records": len(merged_df),
            "matched_records": len(df_with_rw),
            "top_15_count": len(top15_df),
            "merged_file": str(merged_output),
            "top15_file": str(top15_output),
            "top_15_matches": top15_df.to_dict('records')
        }
        
        logger.info(f"Top 15 matches found with scores ranging from {top15_df['similarity_score'].max():.3f} to {top15_df['similarity_score'].min():.3f}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in merge and selection: {e}")
        return {
            "status": "error",
            "message": str(e),
            "total_records": 0,
            "matched_records": 0,
            "top_15_matches": []
        }

def main():
    """Main function for command line usage."""
    if len(sys.argv) != 2:
        print("Usage: python step3_merge_and_select.py <reference_data.json>")
        sys.exit(1)
    
    reference_file = sys.argv[1]
    
    try:
        with open(reference_file, 'r', encoding='utf-8') as f:
            reference_data = json.load(f)
        
        result = merge_and_select_top15(reference_data)
        
        # Save result
        with open('outputs/step3_result.json', 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        error_result = {
            "status": "error",
            "message": str(e),
            "total_records": 0,
            "matched_records": 0,
            "top_15_matches": []
        }
        
        with open('outputs/step3_result.json', 'w', encoding='utf-8') as f:
            json.dump(error_result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(error_result, indent=2, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
