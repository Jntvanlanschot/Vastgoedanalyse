#!/usr/bin/env python3
"""
STEP 2: Realworks Data Upload and Processing

This script:
1. Takes uploaded Realworks RTF files
2. Parses them to extract property data
3. Filters for the top 5 streets from step 1
4. Returns processed Realworks data

Input: RTF files (uploaded), top 5 streets from step 1
Output: Processed Realworks data (CSV)
"""

import json
import logging
import sys
from pathlib import Path
import pandas as pd
import shutil

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def process_realworks_data(uploaded_files_dir, top_5_streets, output_dir="outputs"):
    """
    Process uploaded Realworks RTF files.
    
    Args:
        uploaded_files_dir (str): Directory containing uploaded RTF files
        top_5_streets (list): List of top 5 streets from step 1
        output_dir (str): Output directory
    
    Returns:
        dict: Result with processed Realworks data info
    """
    
    try:
        # Create output directory
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        # Copy uploaded files to realworks directory
        realworks_dir = Path("realworks")
        realworks_dir.mkdir(exist_ok=True)
        
        uploaded_path = Path(uploaded_files_dir)
        rtf_files = list(uploaded_path.glob("*.rtf"))
        
        if not rtf_files:
            return {
                "status": "error",
                "message": "No RTF files found in uploaded directory",
                "processed_records": 0,
                "streets_found": []
            }
        
        logger.info(f"Found {len(rtf_files)} RTF files to process")
        
        # Copy files to realworks directory
        for rtf_file in rtf_files:
            dest_file = realworks_dir / rtf_file.name
            if dest_file != rtf_file:  # Only copy if different paths
                shutil.copy2(rtf_file, dest_file)
                logger.info(f"Copied {rtf_file.name} to realworks directory")
            else:
                logger.info(f"File {rtf_file.name} already in realworks directory")
        
        # Parse Realworks data using existing parser
        import sys
        sys.path.append('.')
        from parse_realworks_perfect import parse_directory
        
        output_csv = Path(output_dir) / "realworks_perfect_data.csv"
        realworks_df = parse_directory(realworks_dir, output_csv)
        
        if realworks_df.empty:
            return {
                "status": "error",
                "message": "No property data found in RTF files",
                "processed_records": 0,
                "streets_found": []
            }
        
        # Check which streets from top 5 are found
        realworks_streets = set(realworks_df['street'].str.lower().str.strip())
        top_5_streets_lower = [street.lower().strip() for street in top_5_streets]
        
        found_streets = []
        missing_streets = []
        
        for street in top_5_streets_lower:
            if street in realworks_streets:
                found_streets.append(street)
            else:
                missing_streets.append(street)
        
        # Filter for top 5 streets only
        realworks_filtered = realworks_df[realworks_df['street'].str.lower().str.strip().isin(top_5_streets_lower)]
        
        # Save filtered data
        filtered_output = Path(output_dir) / "realworks_filtered_data.csv"
        realworks_filtered.to_csv(filtered_output, index=False)
        
        # Prepare result
        result = {
            "status": "success",
            "message": f"Processed {len(realworks_df)} Realworks records",
            "processed_records": len(realworks_df),
            "filtered_records": len(realworks_filtered),
            "streets_found": found_streets,
            "streets_missing": missing_streets,
            "realworks_file": str(output_csv),
            "filtered_file": str(filtered_output)
        }
        
        logger.info(f"Processed {len(realworks_df)} Realworks records")
        logger.info(f"Found streets: {found_streets}")
        logger.info(f"Missing streets: {missing_streets}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error processing Realworks data: {e}")
        return {
            "status": "error",
            "message": str(e),
            "processed_records": 0,
            "streets_found": []
        }

def main():
    """Main function for command line usage."""
    if len(sys.argv) != 3:
        print("Usage: python step2_realworks_processing.py <uploaded_files_dir> <top_5_streets.json>")
        sys.exit(1)
    
    uploaded_files_dir = sys.argv[1]
    top_5_streets_file = sys.argv[2]
    
    try:
        with open(top_5_streets_file, 'r', encoding='utf-8') as f:
            step1_result = json.load(f)
        
        top_5_streets = step1_result.get('top_5_streets', [])
        
        result = process_realworks_data(uploaded_files_dir, top_5_streets)
        
        # Save result
        with open('outputs/step2_result.json', 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        error_result = {
            "status": "error",
            "message": str(e),
            "processed_records": 0,
            "streets_found": []
        }
        
        with open('outputs/step2_result.json', 'w', encoding='utf-8') as f:
            json.dump(error_result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(error_result, indent=2, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
