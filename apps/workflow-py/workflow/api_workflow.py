#!/usr/bin/env python3
"""
MODIFIED WORKFLOW: Vastgoedanalyse Tool for API Integration

This script orchestrates the complete workflow with CSV data provided directly:
1. Process reference address and get top 5 streets from provided CSV
2. Process uploaded Realworks data (empty for now)
3. Merge data and select top 15 matches
4. Generate PDF and Excel reports

Usage:
    python api_workflow.py <reference_data.json> <csv_data>

Input:
    - reference_data.json: Reference address data
    - csv_data: CSV data as string

Output:
    - JSON result with analysis and file paths
"""

import json
import logging
import sys
from pathlib import Path
import os
import pandas as pd
from io import StringIO
import shutil
import glob
import math

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def process_realworks_files_from_args(realworks_files):
    """Process Realworks files passed as command line arguments."""
    try:
        if not realworks_files:
            return {
                "status": "success",
                "message": "No Realworks files provided",
                "processed_records": 0
            }
        
        logger.info(f"Processing {len(realworks_files)} Realworks files from arguments")
        
        # Import the RTF parser
        import sys
        sys.path.append('..')
        from parse_realworks_perfect import parse_rtf_file
        
        # Parse Realworks data from the provided files
        all_properties = []
        
        for file_path in realworks_files:
            if Path(file_path).exists():
                properties = parse_rtf_file(Path(file_path))
                all_properties.extend(properties)
                logger.info(f"Parsed {file_path}: {len(properties)} properties")
            else:
                logger.warning(f"File not found: {file_path}")
        
        if not all_properties:
            return {
                "status": "success",
                "message": "No property data found in RTF files",
                "processed_records": 0
            }
        
        # Convert to DataFrame
        realworks_df = pd.DataFrame(all_properties)
        
        # Save to CSV
        output_csv = Path("outputs/realworks_perfect_data.csv")
        realworks_df.to_csv(output_csv, index=False)
        
        return {
            "status": "success",
            "message": f"Processed {len(realworks_df)} Realworks records",
            "processed_records": len(realworks_df),
            "realworks_file": str(output_csv)
        }
        
    except Exception as e:
        logger.error(f"Error processing Realworks files: {e}")
        return {
            "status": "error",
            "message": f"Failed to process Realworks files: {str(e)}",
            "processed_records": 0
        }

def run_api_workflow_with_realworks(reference_data, csv_file_path, realworks_files):
    """
    Run the complete API workflow with Realworks files.
    
    Args:
        reference_data (dict): Reference property data
        csv_file_path (str): Path to CSV file
        realworks_files (list): List of Realworks RTF file paths
    
    Returns:
        dict: Complete workflow result
    """
    
    try:
        # Create outputs directory
        Path('outputs').mkdir(exist_ok=True)
        
        logger.info("=== STARTING API WORKFLOW WITH REALWORKS ===")
        
        # Parse CSV data from file
        csv_df = pd.read_csv(csv_file_path)
        logger.info(f"Loaded {len(csv_df)} records from CSV")
        
        # Step 1: Fetch street similarity data using Overpass API FIRST
        logger.info("STEP 1: Fetching street similarity data from Overpass API...")
        street_similarity_cache = fetch_street_similarity_data(reference_data, csv_df)
        # Don't include street_similarity_cache in result - contains non-serializable StreetProfile objects
        step1_result = {
            "status": "success",
            "message": f"Fetched similarity data for {len(street_similarity_cache.get(reference_data.get('street_name', ''), []))} streets"
        }
        
        # Step 2: Process the CSV data to find top streets using Algorithm 1
        logger.info("STEP 2: Processing reference address and selecting top streets from CSV...")
        top_4_streets = process_csv_for_top_streets(csv_df, reference_data, street_similarity_cache)
        
        step2_result = {
            "status": "success",
            "message": f"Found reference street + {len(top_4_streets)-1} other similar streets",
            "top_5_streets": top_4_streets,  # Keep the same key name for compatibility
            "total_funda_records": len(csv_df)
        }
        
        logger.info(f"Step 2 completed: Found reference street + {len(top_4_streets)-1} other streets")
        
        # Step 3: Process Realworks files
        logger.info("STEP 3: Processing Realworks files...")
        realworks_result = process_realworks_files_from_args(realworks_files)
        step3_result = realworks_result
        
        # Step 4: Merge data and create analysis results
        logger.info("STEP 4: Creating analysis results...")
        
        # Check if we have Realworks data
        if realworks_result["status"] != "success" or realworks_result["processed_records"] == 0:
            logger.error("Realworks data is REQUIRED for price calculation. No Realworks files processed.")
            return {
                "status": "error",
                "message": "Realworks data is required for price calculation",
                "step1_result": step1_result,
                "step2_result": step2_result,
                "step3_result": step3_result,
                "step4_result": None
            }
        
        # Load Realworks data
        realworks_df = pd.read_csv(realworks_result["realworks_file"])
        logger.info(f"Loaded {len(realworks_df)} Realworks records")
        
        # CRITICAL: Use ONLY Realworks data for top 15 matches (no merge with Funda!)
        # Funda data was only used for street selection (Algorithm 1)
        logger.info(f"Using ONLY Realworks data for top 15: {len(realworks_df)} records")
        
        # Calculate similarity scores for Realworks properties using Algorithm 2
        logger.info("Calculating similarity scores using Algorithm 2 on Realworks data...")
        # Use Realworks data directly - no merge!
        top_15_df = process_realworks_data_for_top15(realworks_df, reference_data, street_similarity_cache)
        logger.info(f"Selected top 15 matches with scores ranging from {top_15_df['final_score'].min():.3f} to {top_15_df['final_score'].max():.3f}")
        
        # Save top 15 matches
        top_15_file = Path("outputs/top15_perfect_matches_final.csv")
        top_15_df.to_csv(top_15_file, index=False)
        
        step4_result = {
            "status": "success",
            "message": "Analysis completed",
            "matched_records": len(realworks_df),  # All Realworks records
            "top_15_count": len(top_15_df),
            "top15_file": str(top_15_file)
        }
        
        logger.info(f"Step 3 completed: Processed {len(top_15_df)} top matches")
        
        # Step 5: Generate reports
        logger.info("STEP 4: Generating reports...")
        from step4_generate_reports import generate_reports
        
        report_result = generate_reports(str(top_15_file), reference_data)
        
        if report_result["status"] == "success":
            logger.info("Step 4 completed: Generated real reports")
        else:
            logger.warning("Step 4 completed: Generated fallback reports")
        
        # Create summary
        summary = {
            "total_funda_records": len(csv_df),
            "realworks_records": len(realworks_df),
            "matched_records": len(realworks_df),  # All Realworks records
            "top_15_matches": len(top_15_df),
            "pdf_file": report_result.get("pdf_file", "outputs/top15_perfect_report_final.pdf"),
            "excel_file": report_result.get("excel_file", "outputs/top15_perfecte_woningen_tabel_final.xlsx")
        }
        
        logger.info("=== API WORKFLOW COMPLETED SUCCESSFULLY ===")
        
        return {
            "status": "success",
            "message": "API workflow executed successfully",
            "step1_result": step1_result,
            "step2_result": step2_result,
            "step3_result": step3_result,
            "step4_result": step4_result,
            "summary": summary
        }
        
    except Exception as e:
        logger.error(f"API workflow failed with error: {e}")
        return {
            "status": "error",
            "message": str(e),
            "step1_result": None,
            "step2_result": None,
            "step3_result": None,
            "step4_result": None
        }

def run_api_workflow(reference_data, csv_file_path):
    """
    Run the workflow with CSV data from file.
    
    Args:
        reference_data (dict): Reference address data
        csv_file_path (str): Path to CSV file
    
    Returns:
        dict: Complete workflow result
    """
    
    try:
        # Create outputs directory
        Path('outputs').mkdir(exist_ok=True)
        
        logger.info("=== STARTING API WORKFLOW ===")
        
        # Parse CSV data from file
        csv_df = pd.read_csv(csv_file_path)
        logger.info(f"Loaded {len(csv_df)} records from CSV")
        
        # Step 1: Fetch street similarity data using Overpass API FIRST
        logger.info("STEP 1: Fetching street similarity data from Overpass API...")
        street_similarity_cache = fetch_street_similarity_data(reference_data, csv_df)
        # Don't include street_similarity_cache in result - contains non-serializable StreetProfile objects
        step1_result = {
            "status": "success",
            "message": f"Fetched similarity data for {len(street_similarity_cache.get(reference_data.get('street_name', ''), []))} streets"
        }
        
        # Step 2: Process the CSV data to find top streets using Algorithm 1
        logger.info("STEP 2: Processing reference address and selecting top streets from CSV...")
        top_4_streets = process_csv_for_top_streets(csv_df, reference_data, street_similarity_cache)
        
        step2_result = {
            "status": "success",
            "message": f"Found reference street + {len(top_4_streets)-1} other similar streets",
            "top_5_streets": top_4_streets,  # Keep the same key name for compatibility
            "total_funda_records": len(csv_df)
        }
        
        logger.info(f"Step 2 completed: Found reference street + {len(top_4_streets)-1} other streets")
        
        # Step 3: Check for and process Realworks files if available
        logger.info("STEP 3: Checking for Realworks files...")
        realworks_result = process_realworks_if_available()
        step3_result = realworks_result
        
        # Step 4: Merge data and create analysis results (ALWAYS require both Funda and Realworks)
        logger.info("STEP 4: Creating analysis results...")
        
        # Check if we have Realworks data - REQUIRED for price calculation
        if realworks_result["status"] != "success" or realworks_result["processed_records"] == 0:
            logger.error("Realworks data is REQUIRED for price calculation. No Realworks files found.")
            return {
                "status": "error",
                "message": "Realworks data is required for accurate price calculation. Please upload Realworks files.",
                "step1_result": step1_result,
                "step2_result": step2_result,
                "step3_result": None,
                "step4_result": None,
                "step5_result": None
            }
        
        # Merge Funda and Realworks data (REQUIRED)
        merged_df = merge_funda_realworks_data(csv_df, realworks_result, reference_data)
        top15_df = process_merged_data_for_top15(merged_df, reference_data, street_similarity_cache)
        
        step4_result = {
            "status": "success",
            "message": "Analysis completed",
            "matched_records": len(top15_df),
            "top_15_count": len(top15_df),
            "top15_file": "outputs/top15_perfect_matches_final.csv"
        }
        
        # Save processed top 15 data for download
        top15_df.to_csv(step4_result["top15_file"], index=False)
        
        logger.info(f"Step 4 completed: Processed {len(top15_df)} top matches")
        
        # Step 5: Generate real reports
        logger.info("STEP 5: Generating reports...")
        
        # Initialize file paths
        pdf_file = "outputs/top15_perfect_report_final.pdf"
        excel_file = "outputs/top15_perfecte_woningen_tabel_final.xlsx"
        
        try:
            # Import the report generation function
            from step4_generate_reports import generate_reports
            
            # Generate real PDF and Excel reports
            report_result = generate_reports(step3_result["top15_file"], reference_data)
            
            if report_result["status"] == "success":
                step5_result = {
                    "status": "success",
                    "message": report_result["message"],
                    "pdf_file": report_result["pdf_file"],
                    "excel_file": report_result["excel_file"]
                }
                # Update file paths from successful generation
                pdf_file = report_result["pdf_file"]
                excel_file = report_result["excel_file"]
                logger.info(f"Step 4 completed: Generated real reports")
            else:
                # Fallback to placeholder if generation fails
                logger.warning(f"Report generation failed: {report_result.get('message', 'Unknown error')}")
                
                with open(pdf_file, 'w') as f:
                    f.write("PDF Report Placeholder\n")
                    f.write(f"Analysis of {len(csv_df)} properties\n")
                    f.write(f"Reference: {reference_data.get('address_full', 'Unknown')}\n")
                
                with open(excel_file, 'w') as f:
                    f.write("Excel Report Placeholder\n")
                    f.write(f"Analysis of {len(csv_df)} properties\n")
                
                step5_result = {
                    "status": "success",
                    "message": "Reports generated (placeholder)",
                    "pdf_file": pdf_file,
                    "excel_file": excel_file
                }
                
        except Exception as e:
            logger.error(f"Error generating reports: {e}")
            # Fallback to proper PDF generation
            from step4_generate_reports import create_empty_pdf
            
            # Create empty Excel file
            empty_df = pd.DataFrame(columns=['Rang', 'Adres', 'Verkoopprijs (€)', 'Oppervlakte (m²)', 'Score'])
            empty_df.to_excel(excel_file, index=False, sheet_name='Top 15 Woningen')
            
            # Create proper PDF
            create_empty_pdf(pdf_file, reference_data)
            
            step5_result = {
                "status": "success",
                "message": "Reports generated (fallback)",
                "pdf_file": pdf_file,
                "excel_file": excel_file
            }
        
        logger.info("Step 5 completed: Generated reports")
        
        # Prepare final result
        final_result = {
            "status": "success",
            "message": "API workflow executed successfully",
            "step1_result": step1_result,
            "step2_result": step2_result,
            "step3_result": step3_result,
            "step4_result": step4_result,  # Analysis results
            "step5_result": step5_result,
            "summary": {
                "total_funda_records": len(csv_df),
                "realworks_records": realworks_result.get("processed_records", 0),
                "matched_records": len(top15_df),
                "top_15_matches": min(15, len(top15_df)),
                "pdf_file": pdf_file,
                "excel_file": excel_file
            }
        }
        
        logger.info("=== API WORKFLOW COMPLETED SUCCESSFULLY ===")
        return final_result
        
    except Exception as e:
        logger.error(f"API workflow failed with error: {e}")
        return {
            "status": "error",
            "message": str(e),
            "step1_result": None,
            "step2_result": None,
            "step3_result": None,
            "step4_result": None,
            "step5_result": None
        }

def process_csv_for_top_streets(csv_df, reference_data, street_similarity_cache=None):
    """Process CSV data to find top 4 streets using Algorithm 1."""
    try:
        # Find street name column
        street_col = None
        for col in ['address/street_name', 'street_name', 'address_street_name']:
            if col in csv_df.columns:
                street_col = col
                break
        
        if street_col is None:
            logger.error("No street name column found for street processing")
            return [{
                "street_name": "Unknown Street",
                "name": "Unknown Street", 
                "city": "Amsterdam",
                "properties_count": len(csv_df),
                "average_price": 500000
            }]
        
        # Get unique streets and calculate similarity scores
        unique_streets = csv_df[street_col].dropna().unique()
        street_scores = []
        
        # MINIMUM REQUIREMENT: Filter to only streets with at least 3 properties
        for street_name in unique_streets:
            # Get statistics for this street
            street_data = csv_df[csv_df[street_col] == street_name]
            properties_count = len(street_data)
            
            # Skip streets with less than 3 properties
            if properties_count < 3:
                logger.info(f"Skipping street '{street_name}' - only {properties_count} properties (minimum: 3)")
                continue
            
            # Get a sample property from this street for similarity calculation
            sample_property = csv_df[csv_df[street_col] == street_name].iloc[0]
            
            # Calculate similarity score using Algorithm 1 (street matching)
            similarity_score = calculate_street_similarity_score(sample_property, reference_data, street_similarity_cache)
            
            # Calculate average price
            price_col = None
            for col in ['price/selling_price/0', 'selling_price', 'price_selling_price_0', 'price']:
                if col in street_data.columns:
                    price_col = col
                    break
            
            if price_col:
                avg_price = street_data[price_col].mean()
            else:
                avg_price = 500000  # Default price
            
            street_scores.append({
                "street_name": street_name,
                "name": street_name,
                "city": "Amsterdam",
                "properties_count": properties_count,
                "average_price": int(avg_price) if pd.notna(avg_price) else 500000,
                "similarity_score": similarity_score
            })
        
        logger.info(f"Found {len(street_scores)} streets with at least 3 properties")
        
        # Sort by similarity score (descending) and take top 4 OTHER streets (excluding reference street)
        street_scores.sort(key=lambda x: x['similarity_score'], reverse=True)
        
        # Filter out the reference street and take top 4 other streets
        ref_street_name = reference_data.get('street_name', '').lower().strip()
        other_streets = [street for street in street_scores if street['street_name'].lower().strip() != ref_street_name]

        # Special handling for Amsterdam's main canals: Prinsen/Keizers/Herengracht
        canals = {'prinsengracht', 'keizersgracht', 'herengracht'}
        top_4_other_streets = other_streets[:4]
        if ref_street_name in canals:
            # Prefer the other canal streets in positions 2 and 3 when available
            other_canal_names = [c for c in canals if c != ref_street_name]
            other_map = {s['street_name'].lower().strip(): s for s in other_streets}
            preferred = [other_map[name] for name in other_canal_names if name in other_map]
            # Keep order of preferred by their similarity as already sorted in other_streets
            seen_ids = set(id(s) for s in preferred)
            remainder = [s for s in other_streets if id(s) not in seen_ids]
            combined = preferred + remainder
            top_4_other_streets = combined[:4]
        
        # Create final result: reference street first, then top 4 other streets
        final_streets = []
        
        # Add reference street as block 1 (only if it exists in CSV data)
        ref_street_data = next((street for street in street_scores if street['street_name'].lower().strip() == ref_street_name), None)
        if ref_street_data:
            # Reference street found in CSV data
            final_streets.append({
                "street_name": ref_street_data['street_name'],
                "name": ref_street_data['street_name'],
                "city": "Amsterdam",
                "properties_count": ref_street_data['properties_count'],
                "average_price": ref_street_data['average_price'],
                "is_reference": True
            })
            logger.info(f"Reference street '{ref_street_name}' found in CSV data")
        else:
            logger.info(f"Reference street '{ref_street_name}' not found in CSV data, skipping")
        
        # Add top 4 other streets as blocks 2-5 (or 1-4 if reference street not found)
        streets_to_add = top_4_other_streets
        if not ref_street_data:
            # If reference street not found, take top 5 streets instead of top 4
            streets_to_add = other_streets[:5]
        
        for street in streets_to_add:
            final_streets.append({
                "street_name": street['street_name'],
                "name": street['street_name'],
                "city": "Amsterdam",
                "properties_count": street['properties_count'],
                "average_price": street['average_price'],
                "is_reference": False
            })
        
        logger.info(f"Found reference street + top 4 other streets using Algorithm 1 (street matching)")
        return final_streets
        
    except Exception as e:
        logger.error(f"Error processing streets: {e}")
        return [{
            "street_name": "Error",
            "name": "Error",
            "city": "Amsterdam",
            "properties_count": 0,
            "average_price": 0
        }]

def process_csv_for_top15_matches(csv_df, reference_data, street_similarity_cache=None):
    """Process CSV data to create top 15 matches with similarity scores."""
    try:
        logger.info(f"Processing {len(csv_df)} records for top 15 matches")
        
        # Debug: Print available columns
        logger.info(f"Available columns: {list(csv_df.columns)}")
        
        # Create address_full column - handle different possible column names
        address_parts = []
        
        # Try different possible column names for street name
        street_col = None
        for col in ['address/street_name', 'street_name', 'address_street_name']:
            if col in csv_df.columns:
                street_col = col
                break
        
        if street_col is None:
            logger.error("No street name column found")
            return pd.DataFrame(columns=['address_full', 'rw_sale_price', 'rw_area_m2', 'rw_bedrooms', 'rw_rooms', 'rw_energy_label', 'similarity_score'])
        
        # Build address_full column
        csv_df['address_full'] = csv_df[street_col].astype(str)
        
        # Add house number if available
        house_num_col = None
        for col in ['address/house_number', 'house_number', 'address_house_number']:
            if col in csv_df.columns:
                house_num_col = col
                break
        
        if house_num_col:
            csv_df['address_full'] = csv_df['address_full'] + ' ' + csv_df[house_num_col].astype(str)
            
            # Add house number suffix if available
            suffix_col = None
            for col in ['address/house_number_suffix', 'house_number_suffix', 'address_house_number_suffix']:
                if col in csv_df.columns:
                    suffix_col = col
                    break
            
            if suffix_col:
                csv_df['address_full'] = csv_df['address_full'] + csv_df[suffix_col].fillna('')
        
        # Add postal code and city
        postal_col = None
        for col in ['address/postal_code', 'postal_code', 'address_postal_code']:
            if col in csv_df.columns:
                postal_col = col
                break
        
        city_col = None
        for col in ['address/city', 'city', 'address_city']:
            if col in csv_df.columns:
                city_col = col
                break
        
        if postal_col and city_col:
            csv_df['address_full'] = csv_df['address_full'] + ', ' + csv_df[postal_col].astype(str) + ', ' + csv_df[city_col].astype(str)
        
        # Map Funda columns to expected column names - handle different possible column names
        price_col = None
        for col in ['price/selling_price/0', 'selling_price', 'price_selling_price_0', 'price']:
            if col in csv_df.columns:
                price_col = col
                break
        
        area_col = None
        for col in ['floor_area/0', 'floor_area', 'floor_area_0', 'area', 'surface']:
            if col in csv_df.columns:
                area_col = col
                break
        
        bedrooms_col = None
        for col in ['number_of_bedrooms', 'bedrooms', 'number_of_bedrooms_0']:
            if col in csv_df.columns:
                bedrooms_col = col
                break
        
        rooms_col = None
        for col in ['number_of_rooms', 'rooms', 'number_of_rooms_0']:
            if col in csv_df.columns:
                rooms_col = col
                break
        
        energy_col = None
        for col in ['energy_label', 'energy_label_0', 'energy']:
            if col in csv_df.columns:
                energy_col = col
                break
        
        # Map columns with fallbacks
        csv_df['rw_sale_price'] = csv_df[price_col].fillna(0) if price_col else 0
        csv_df['rw_area_m2'] = csv_df[area_col].fillna(0) if area_col else 0
        csv_df['rw_bedrooms'] = csv_df[bedrooms_col].fillna(0) if bedrooms_col else 0
        csv_df['rw_rooms'] = csv_df[rooms_col].fillna(0) if rooms_col else 0
        csv_df['rw_energy_label'] = csv_df[energy_col].fillna('Unknown') if energy_col else 'Unknown'
        
        # Add new fields for the updated similarity algorithm (defaults for Funda data)
        csv_df['rw_has_garden'] = False  # Default for Funda data
        csv_df['rw_has_balcony'] = False  # Default for Funda data
        csv_df['rw_has_terrace'] = False  # Default for Funda data
        
        # Calculate similarity scores using a simplified algorithm
        csv_df['similarity_score'] = csv_df.apply(lambda row: calculate_simple_similarity_score(row, reference_data, street_similarity_cache), axis=1)
        
        # Sort by similarity score and get top 15
        top15_df = csv_df.sort_values('similarity_score', ascending=False).head(15).copy()
        
        # Select relevant columns for the final output
        output_columns = [
            'address_full', 'rw_sale_price', 'rw_area_m2', 'rw_bedrooms', 'rw_rooms', 
            'rw_energy_label', 'rw_has_garden', 'rw_has_balcony', 'rw_has_terrace',
            'similarity_score'
        ]
        
        # Add URL column if it exists
        url_col = None
        for col in ['object_detail_page_relative_url', 'url', 'detail_url']:
            if col in csv_df.columns:
                url_col = col
                break
        
        if url_col:
            output_columns.append(url_col)
        
        # Only include columns that exist
        available_columns = [col for col in output_columns if col in top15_df.columns]
        top15_df = top15_df[available_columns]
        
        logger.info(f"Created top 15 matches with scores ranging from {top15_df['similarity_score'].min():.3f} to {top15_df['similarity_score'].max():.3f}")
        
        return top15_df
        
    except Exception as e:
        logger.error(f"Error processing CSV for top 15 matches: {e}")
        # Return empty DataFrame with expected columns
        return pd.DataFrame(columns=['address_full', 'rw_sale_price', 'rw_area_m2', 'rw_bedrooms', 'rw_rooms', 'rw_energy_label', 'similarity_score'])

def calculate_simple_similarity_score(row, reference_data, street_similarity_cache=None, debug=False):
    """Calculate similarity score based on new weighted criteria with OSM street similarity."""
    try:
        score = 0.0
        breakdown = [] if debug else None
        
        # Check for gracht mismatch (HEAVY penalty!)
        ref_street = str(reference_data.get('street_name', '')).lower().strip()
        # Try Realworks column first ('street'), then Funda column ('address/street_name')
        row_street = str(row.get('street', '') or row.get('address/street_name', '')).lower().strip()
        
        ref_is_gracht = 'gracht' in ref_street if ref_street else False
        row_is_gracht = 'gracht' in row_street if row_street else False
        
        # Apply HEAVY penalty for gracht vs straat mismatch
        gracht_penalty = 0.01 if (ref_is_gracht != row_is_gracht) else 1.0
        
        if gracht_penalty < 1.0:
            logger.info(f"Gracht penalty 0.01x applied: ref='{ref_street}' (gracht={ref_is_gracht}) vs row='{row_street}' (gracht={row_is_gracht})")
        
        # 1. Street similarity (2% weight - ChatGPT recommended)
        if ref_street and row_street:
            if ref_street == row_street:
                street_score = 0.02 * 1.0  # Same street = perfect match
                score += street_score
                if debug: breakdown.append(f"  1. Straat naam (2%): {street_score:.4f} (ZELFDE straat!)")
            else:
                # Calculate street name similarity (Levenshtein distance)
                street_similarity = calculate_string_similarity(ref_street, row_street)
                street_score = 0.02 * street_similarity
                score += street_score
                if debug: breakdown.append(f"  1. Straat naam (2%): {street_score:.4f} (similariteit: {street_similarity:.3f})")
        
        # 2. OSM-based street similarity (8% weight)
        osm_street_score_raw = calculate_osm_street_similarity(row, reference_data, street_similarity_cache)
        osm_street_score = 0.08 * osm_street_score_raw
        score += osm_street_score
        if debug: breakdown.append(f"  2. OSM straat (8%): {osm_street_score:.4f} (raw: {osm_street_score_raw:.3f})")
        
        # 3. Living area (m²) proximity (36% weight)
        # Try both rw_area_m2 (from merged data) and floor_area/0 (from Funda data)
        area_m2 = row.get('rw_area_m2', 0) or row.get('floor_area/0', 0)
        area_score = 0
        if pd.notna(area_m2) and area_m2 > 0:
            area_diff = abs(area_m2 - reference_data.get('area_m2', 100))
            area_score_raw = max(0, 1 - (area_diff / reference_data.get('area_m2', 100)))
            area_score = 0.36 * area_score_raw
            score += area_score
            if debug: breakdown.append(f"  3. Oppervlakte (36%): {area_score:.4f} (ref: {reference_data.get('area_m2')}, row: {area_m2})")
        
        # 4. Micro-location proximity by geographic distance (14% weight)
        def _get_coords_from_row(r):
            lat_keys = ['address/latitude', 'latitude', 'lat', 'geo_lat']
            lon_keys = ['address/longitude', 'longitude', 'lon', 'lng', 'geo_lng']
            lat_val, lon_val = None, None
            for k in lat_keys:
                v = r.get(k, None)
                if pd.notna(v):
                    try:
                        lat_val = float(v)
                        break
                    except Exception:
                        pass
            for k in lon_keys:
                v = r.get(k, None)
                if pd.notna(v):
                    try:
                        lon_val = float(v)
                        break
                    except Exception:
                        pass
            return lat_val, lon_val

        def _get_coords_from_ref(ref):
            lat = ref.get('latitude', None) or ref.get('lat', None)
            lon = ref.get('longitude', None) or ref.get('lon', None)
            try:
                lat = float(lat) if lat is not None else None
                lon = float(lon) if lon is not None else None
            except Exception:
                lat, lon = None, None
            return lat, lon

        def _haversine_m(lat1, lon1, lat2, lon2):
            R = 6371000.0
            phi1 = math.radians(lat1)
            phi2 = math.radians(lat2)
            dphi = math.radians(lat2 - lat1)
            dlambda = math.radians(lon2 - lon1)
            a = math.sin(dphi/2.0)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2.0)**2
            return 2*R*math.asin(math.sqrt(a))

        ref_lat, ref_lon = _get_coords_from_ref(reference_data)
        row_lat, row_lon = _get_coords_from_row(row)
        if ref_lat is not None and ref_lon is not None and row_lat is not None and row_lon is not None:
            dist_m = _haversine_m(ref_lat, ref_lon, row_lat, row_lon)
            proximity = max(0.0, 1.0 - (dist_m / 2000.0))  # 0-2km linear decay
            neighbourhood_score = 0.14 * proximity
            score += neighbourhood_score
            if debug: breakdown.append(f"  4. Afstand (14%): {neighbourhood_score:.4f} (afstand: {dist_m:.0f} m)")
        else:
            # Fallback to neighbourhood string similarity if coords missing
            ref_neighbourhood = str(reference_data.get('neighbourhood', '')).lower().strip()
            row_neighbourhood = str(row.get('address/neighbourhood', '')).lower().strip()
            if ref_neighbourhood and row_neighbourhood:
                if ref_neighbourhood == row_neighbourhood:
                    neighbourhood_score = 0.14 * 1.0
                    score += neighbourhood_score
                    if debug: breakdown.append(f"  4. Buurt/Locatie (14%): {neighbourhood_score:.4f}")
                else:
                    neighbourhood_similarity = calculate_string_similarity(ref_neighbourhood, row_neighbourhood)
                    neighbourhood_score = 0.14 * neighbourhood_similarity
                    score += neighbourhood_score
                    if debug: breakdown.append(f"  4. Buurt/Locatie (14%): {neighbourhood_score:.4f} (similariteit: {neighbourhood_similarity:.3f})")
        
        # 5. Garden match (10% weight)
        ref_garden = reference_data.get('has_garden', False)
        row_garden = row.get('rw_has_garden', False)
        garden_score = 0
        if ref_garden == row_garden:
            garden_score = 0.10 * 1.0
            score += garden_score
            if debug: breakdown.append(f"  5. Tuin (10%): {garden_score:.4f} MATCH!")
        else:
            garden_score = 0.10 * 0.5  # Partial score for mismatch
            score += garden_score
            if debug: breakdown.append(f"  5. Tuin (10%): {garden_score:.4f} (mismatch)")
        
        # 6. Rooms similarity (10% weight - ChatGPT recommended)
        # Try both rw_rooms (from merged data) and number_of_rooms (from Funda data)
        rooms = row.get('rw_rooms', 0) or row.get('number_of_rooms', 0)
        room_score = 0
        if pd.notna(rooms) and rooms > 0:
            room_diff = abs(rooms - reference_data.get('rooms', 3))
            room_score_raw = max(0, 1 - (room_diff / max(reference_data.get('rooms', 3), 1)))
            room_score = 0.10 * room_score_raw
            score += room_score
            if debug: breakdown.append(f"  6. Kamers (10%): {room_score:.4f} (ref: {reference_data.get('rooms')}, row: {rooms})")
        
        # 7. Bedrooms similarity (0% weight) — removed per requirement
        # (kept as no-op for clarity)
        
        # 8. Balcony/Roof terrace (7% weight)
        ref_balcony = reference_data.get('has_balcony', False) or reference_data.get('has_terrace', False)
        row_balcony = row.get('rw_has_balcony', False) or row.get('rw_has_terrace', False)
        balcony_score = 0
        if ref_balcony == row_balcony:
            balcony_score = 0.07 * 1.0
            score += balcony_score
            if debug: breakdown.append(f"  8. Balkon/Terras (7%): {balcony_score:.4f} MATCH!")
        else:
            balcony_score = 0.07 * 0.5
            score += balcony_score
            if debug: breakdown.append(f"  8. Balkon/Terras (7%): {balcony_score:.4f} (mismatch)")
        
        # 9. Energy label (13% weight)
        energy_labels = ['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
        ref_energy = reference_data.get('energy_label', 'B')
        row_energy = row.get('rw_energy_label', 'Unknown')
        energy_score = 0
        if ref_energy in energy_labels and row_energy in energy_labels:
            ref_index = energy_labels.index(ref_energy)
            row_index = energy_labels.index(row_energy)
            energy_diff = abs(ref_index - row_index)
            energy_score_raw = max(0, 1 - (energy_diff / len(energy_labels)))
            energy_score = 0.13 * energy_score_raw
            score += energy_score
            if debug: breakdown.append(f"  9. Energielabel (13%): {energy_score:.4f}")
        else:
            energy_score = 0.13 * 0.5  # Neutral score for unknown labels
            score += energy_score
            if debug: breakdown.append(f"  9. Energielabel (13%): {energy_score:.4f} (unknown)")
        
        # Apply gracht penalty to the ENTIRE score
        score_before_penalty = score
        score = score * gracht_penalty
        
        # Log the breakdown if debug mode
        if debug:
            logger.info(f"\nSCORE BREAKDOWN voor: {row.get('address_full', 'Unknown')}")
            logger.info(f"  Totaal voor penalty: {score_before_penalty:.4f}")
            if gracht_penalty < 1.0:
                logger.info(f"  Gracht penalty: {gracht_penalty:.2f}x")
            logger.info(f"  FINALE SCORE: {min(1.0, score):.4f}")
        
        return min(1.0, score)  # Cap at 1.0
        
    except Exception as e:
        logger.error(f"Error calculating similarity score: {e}")
        return 0.0

def calculate_street_similarity_score(row, reference_data, street_similarity_cache=None):
    """Calculate similarity score for street matching (Algorithm 1) - 4 best corresponding streets."""
    try:
        score = 0.0
        
        # 1. Street similarity (10% weight - higher for street matching)
        ref_street = str(reference_data.get('street_name', '')).lower().strip()
        row_street = str(row.get('address/street_name', '')).lower().strip()
        if ref_street and row_street:
            if ref_street == row_street:
                score += 0.10 * 1.0  # Same street = perfect match
            else:
                # Calculate street name similarity (Levenshtein distance)
                street_similarity = calculate_string_similarity(ref_street, row_street)
                score += 0.10 * street_similarity
        
        # 2. OSM-based street similarity (24% weight)
        osm_street_score = calculate_osm_street_similarity(row, reference_data, street_similarity_cache)
        score += 0.24 * osm_street_score
        
        # 3. Living area (m²) proximity (20% weight - lower for street matching)
        # Try both rw_area_m2 (from merged data) and floor_area/0 (from Funda data)
        area_m2 = row.get('rw_area_m2', 0) or row.get('floor_area/0', 0)
        if pd.notna(area_m2) and area_m2 > 0:
            area_diff = abs(area_m2 - reference_data.get('area_m2', 100))
            area_score = max(0, 1 - (area_diff / reference_data.get('area_m2', 100)))
            score += 0.20 * area_score
        
        # 4. Micro-location proximity by geographic distance (20% weight)
        def _get_coords_from_row(r):
            lat_keys = ['address/latitude', 'latitude', 'lat', 'geo_lat']
            lon_keys = ['address/longitude', 'longitude', 'lon', 'lng', 'geo_lng']
            lat_val, lon_val = None, None
            for k in lat_keys:
                v = r.get(k, None)
                if pd.notna(v):
                    try:
                        lat_val = float(v)
                        break
                    except Exception:
                        pass
            for k in lon_keys:
                v = r.get(k, None)
                if pd.notna(v):
                    try:
                        lon_val = float(v)
                        break
                    except Exception:
                        pass
            return lat_val, lon_val

        def _get_coords_from_ref(ref):
            lat = ref.get('latitude', None) or ref.get('lat', None)
            lon = ref.get('longitude', None) or ref.get('lon', None)
            try:
                lat = float(lat) if lat is not None else None
                lon = float(lon) if lon is not None else None
            except Exception:
                lat, lon = None, None
            return lat, lon

        def _haversine_m(lat1, lon1, lat2, lon2):
            R = 6371000.0
            phi1 = math.radians(lat1)
            phi2 = math.radians(lat2)
            dphi = math.radians(lat2 - lat1)
            dlambda = math.radians(lon2 - lon1)
            a = math.sin(dphi/2.0)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2.0)**2
            return 2*R*math.asin(math.sqrt(a))

        ref_lat, ref_lon = _get_coords_from_ref(reference_data)
        row_lat, row_lon = _get_coords_from_row(row)
        if ref_lat is not None and ref_lon is not None and row_lat is not None and row_lon is not None:
            dist_m = _haversine_m(ref_lat, ref_lon, row_lat, row_lon)
            proximity = max(0.0, 1.0 - (dist_m / 2000.0))
            score += 0.20 * proximity
        else:
            ref_neighbourhood = str(reference_data.get('neighbourhood', '')).lower().strip()
            row_neighbourhood = str(row.get('address/neighbourhood', '')).lower().strip()
            if ref_neighbourhood and row_neighbourhood:
                if ref_neighbourhood == row_neighbourhood:
                    score += 0.20 * 1.0
                else:
                    neighbourhood_similarity = calculate_string_similarity(ref_neighbourhood, row_neighbourhood)
                    score += 0.20 * neighbourhood_similarity
        
        # 5. Garden match (10% weight)
        ref_garden = reference_data.get('has_garden', False)
        row_garden = row.get('rw_has_garden', False)
        if ref_garden == row_garden:
            score += 0.10 * 1.0
        else:
            score += 0.10 * 0.5
        
        # 6. Rooms similarity (6% weight)
        # Try both rw_rooms (from merged data) and number_of_rooms (from Funda data)
        rooms = row.get('rw_rooms', 0) or row.get('number_of_rooms', 0)
        if pd.notna(rooms) and rooms > 0:
            room_diff = abs(rooms - reference_data.get('rooms', 3))
            room_score = max(0, 1 - (room_diff / max(reference_data.get('rooms', 3), 1)))
            score += 0.06 * room_score
        
        # 7. Bedrooms similarity (5% weight)
        # Try both rw_bedrooms (from merged data) and number_of_bedrooms (from Funda data)
        bedrooms = row.get('rw_bedrooms', 0) or row.get('number_of_bedrooms', 0)
        if pd.notna(bedrooms) and bedrooms > 0:
            bedroom_diff = abs(bedrooms - reference_data.get('bedrooms', 2))
            bedroom_score = max(0, 1 - (bedroom_diff / max(reference_data.get('bedrooms', 2), 1)))
            score += 0.05 * bedroom_score
        
        # 8. Balcony/Roof terrace (3% weight)
        ref_balcony = reference_data.get('has_balcony', False) or reference_data.get('has_terrace', False)
        row_balcony = row.get('rw_has_balcony', False) or row.get('rw_has_terrace', False)
        if ref_balcony == row_balcony:
            score += 0.03 * 1.0
        else:
            score += 0.03 * 0.5
        
        # 9. Energy label (2% weight)
        energy_labels = ['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
        ref_energy = reference_data.get('energy_label', 'B')
        row_energy = row.get('rw_energy_label', 'Unknown')
        
        if ref_energy in energy_labels and row_energy in energy_labels:
            ref_index = energy_labels.index(ref_energy)
            row_index = energy_labels.index(row_energy)
            energy_diff = abs(ref_index - row_index)
            energy_score = max(0, 1 - (energy_diff / len(energy_labels)))
            score += 0.02 * energy_score
        else:
            score += 0.02 * 0.5
        
        return min(1.0, score)  # Cap at 1.0
        
    except Exception as e:
        logger.error(f"Error calculating street similarity score: {e}")
        return 0.0

def calculate_osm_street_similarity(row, reference_data, street_similarity_cache=None):
    """Calculate OSM-based street similarity using cached street profiles."""
    try:
        # Get street names (convert to string to handle NaN/float values)
        ref_street = str(reference_data.get('street_name', '') or '')
        # Try Realworks column first ('street'), then Funda column ('address/street_name')
        row_street = str(row.get('street', '') or row.get('address/street_name', '') or '')
        
        if not ref_street or not row_street:
            return 0.5  # Neutral score if missing data
        
        # Normalize street names
        ref_street = ref_street.lower().strip()
        row_street = row_street.lower().strip()
        
        # Use cached similarity scores if available
        if street_similarity_cache and ref_street in street_similarity_cache:
            ref_similarities = street_similarity_cache[ref_street]
            for similarity_data in ref_similarities:
                if similarity_data['street_name'].lower().strip() == row_street:
                    return similarity_data['score']
        
        # Fallback: simple name-based similarity for now
        # This will be replaced by actual OSM data as the cache builds up
        if ref_street == row_street:
            return 1.0
        else:
            # Check for similar street names (gracht, straat, etc.)
            ref_base = ref_street.replace('gracht', '').replace('straat', '').replace('weg', '').strip()
            row_base = row_street.replace('gracht', '').replace('straat', '').replace('weg', '').strip()
            
            if ref_base == row_base:
                return 0.8  # Same base name, different suffix
            else:
                return calculate_string_similarity(ref_street, row_street)
        
    except Exception as e:
        logger.error(f"Error calculating OSM street similarity: {e}")
        return 0.5  # Neutral score on error

def fetch_street_similarity_data(reference_data, csv_df):
    """Fetch street similarity data using Overpass API."""
    try:
        from overpass_street_similarity import OverpassStreetSimilarity
        
        # Initialize the similarity calculator
        similarity_calc = OverpassStreetSimilarity()
        
        # Get reference street
        ref_street = reference_data.get('street_name', '')
        if not ref_street:
            logger.warning("No reference street name available")
            return {}
        
        # Get unique candidate streets from CSV
        candidate_streets = csv_df['address/street_name'].dropna().unique().tolist()
        candidate_streets = [street for street in candidate_streets if street.strip()]
        
        logger.info(f"Fetching street similarity data for reference: {ref_street}")
        logger.info(f"Found {len(candidate_streets)} candidate streets")
        
        # Find similar streets using Overpass API
        similar_streets = similarity_calc.find_similar_streets(ref_street, candidate_streets, top_n=50)
        
        # Build cache dictionary
        street_cache = {}
        street_cache[ref_street] = similar_streets
        
        logger.info(f"Successfully fetched similarity data for {len(similar_streets)} streets")
        return street_cache
        
    except Exception as e:
        logger.error(f"Error fetching street similarity data: {e}")
        return {}

def calculate_string_similarity(str1, str2):
    """Calculate string similarity using simple character overlap."""
    if not str1 or not str2:
        return 0.0
    
    # Simple similarity based on common characters
    common_chars = sum(1 for c in str1 if c in str2)
    max_len = max(len(str1), len(str2))
    return common_chars / max_len if max_len > 0 else 0.0

def process_realworks_if_available():
    """Check for and process Realworks files if they exist."""
    try:
        # Check for Realworks files in the realworks directory
        realworks_dir = Path("realworks")
        if not realworks_dir.exists():
            return {
                "status": "success",
                "message": "No Realworks directory found",
                "processed_records": 0
            }
        
        # Look for RTF files
        rtf_files = list(realworks_dir.glob("*.rtf"))
        if not rtf_files:
            return {
                "status": "success", 
                "message": "No RTF files found in realworks directory",
                "processed_records": 0
            }
        
        logger.info(f"Found {len(rtf_files)} RTF files to process")
        
        # Import the RTF parser
        import sys
        sys.path.append('.')
        from parse_realworks_perfect import parse_directory
        
        # Parse Realworks data
        output_csv = Path("outputs/realworks_perfect_data.csv")
        realworks_df = parse_directory(realworks_dir, output_csv)
        
        if realworks_df.empty:
            return {
                "status": "success",
                "message": "No property data found in RTF files",
                "processed_records": 0
            }
        
        return {
            "status": "success",
            "message": f"Processed {len(realworks_df)} Realworks records",
            "processed_records": len(realworks_df),
            "realworks_file": str(output_csv)
        }
        
    except Exception as e:
        logger.error(f"Error processing Realworks files: {e}")
        return {
            "status": "error",
            "message": str(e),
            "processed_records": 0
        }

def merge_funda_and_realworks(funda_df, realworks_df):
    """Merge Funda and Realworks DataFrames."""
    try:
        logger.info(f"Merging {len(funda_df)} Funda records with {len(realworks_df)} Realworks records")
        
        # CRITICAL: Use Realworks as BASE - all Realworks records are preserved
        # Funda data is added as supplementary information where it matches
        realworks_df = realworks_df.copy()
        
        # Ensure address_full exists in Realworks (already created by parser)
        if 'address_full' not in realworks_df.columns:
            # Try to construct address from available columns
            if 'street' in realworks_df.columns and 'house_number' in realworks_df.columns:
                realworks_df['address_full'] = realworks_df['street'] + ' ' + realworks_df['house_number'].astype(str)
                if 'postal_code' in realworks_df.columns and 'city' in realworks_df.columns:
                    realworks_df['address_full'] = realworks_df['address_full'] + ', ' + realworks_df['postal_code'] + ', ' + realworks_df['city']
        
        logger.info(f"Realworks data: {len(realworks_df)} records")
        
        # Create address_full for Funda data for matching
        funda_df = funda_df.copy()
        funda_df['address_full'] = funda_df['address/street_name'] + ' ' + funda_df['address/house_number'].astype(str)
        funda_df['address_full'] = funda_df['address_full'] + funda_df['address/house_number_suffix'].fillna('')
        funda_df['address_full'] = funda_df['address_full'] + ', ' + funda_df['address/postal_code'] + ', ' + funda_df['address/city']
        
        # Start with Realworks as base, LEFT merge Funda data where it matches
        merged_df = pd.merge(realworks_df, funda_df, on='address_full', how='left', suffixes=('', '_funda'))
        
        # Fill missing values appropriately and categorize match types
        merged_df['match_type'] = merged_df.apply(lambda row: 
            'both' if pd.notna(row.get('price/selling_price/0')) and pd.notna(row.get('sale_price', 0)) else
            'funda_only' if pd.notna(row.get('price/selling_price/0')) else
            'realworks_only' if pd.notna(row.get('sale_price', 0)) else 'no_match', axis=1)
        
        # Ensure we have all necessary columns for analysis
        # Fill missing Funda columns with defaults
        funda_columns = ['price/selling_price/0', 'floor_area/0', 'number_of_bedrooms', 'number_of_rooms', 'energy_label']
        for col in funda_columns:
            if col not in merged_df.columns:
                merged_df[col] = 0 if col in ['price/selling_price/0', 'floor_area/0', 'number_of_bedrooms', 'number_of_rooms'] else 'Unknown'
        
        # Fill missing Realworks columns with defaults
        realworks_columns = ['sale_price', 'area_m2', 'bedrooms', 'rooms', 'energy_label']
        for col in realworks_columns:
            if col not in merged_df.columns:
                merged_df[col] = 0 if col in ['sale_price', 'area_m2', 'bedrooms', 'rooms'] else 'Unknown'
        
        logger.info(f"Merged data: {len(merged_df)} total records")
        logger.info(f"Match types: {merged_df['match_type'].value_counts().to_dict()}")
        
        return merged_df
        
    except Exception as e:
        logger.error(f"Error merging data: {e}")
        return funda_df

def merge_funda_realworks_data(funda_df, realworks_result, reference_data):
    """Merge Funda and Realworks data."""
    try:
        # Load Realworks data
        realworks_file = realworks_result.get("realworks_file")
        if not realworks_file or not Path(realworks_file).exists():
            logger.warning("Realworks file not found, using Funda data only")
            return funda_df
        
        realworks_df = pd.read_csv(realworks_file)
        logger.info(f"Loaded {len(realworks_df)} Realworks records")
        
        # Create address_full column for Funda data
        funda_df['address_full'] = funda_df['address/street_name'] + ' ' + funda_df['address/house_number'].astype(str)
        funda_df['address_full'] = funda_df['address_full'] + funda_df['address/house_number_suffix'].fillna('')
        funda_df['address_full'] = funda_df['address_full'] + ', ' + funda_df['address/postal_code'] + ', ' + funda_df['address/city']
        
        # Create address_full column for Realworks data (assuming it has similar structure)
        if 'address_full' not in realworks_df.columns:
            # Try to construct address from available columns
            if 'street' in realworks_df.columns and 'house_number' in realworks_df.columns:
                realworks_df['address_full'] = realworks_df['street'] + ' ' + realworks_df['house_number'].astype(str)
                if 'postal_code' in realworks_df.columns and 'city' in realworks_df.columns:
                    realworks_df['address_full'] = realworks_df['address_full'] + ', ' + realworks_df['postal_code'] + ', ' + realworks_df['city']
        
        # Merge data on address_full using outer join to include all properties
        merged_df = pd.merge(funda_df, realworks_df, on='address_full', how='outer', suffixes=('_funda', '_realworks'))
        
        # Fill missing values appropriately and categorize match types
        merged_df['match_type'] = merged_df.apply(lambda row: 
            'both' if pd.notna(row.get('price/selling_price/0')) and pd.notna(row.get('sale_price', 0)) else
            'funda_only' if pd.notna(row.get('price/selling_price/0')) else
            'realworks_only' if pd.notna(row.get('sale_price', 0)) else 'no_match', axis=1)
        
        # Ensure we have all necessary columns for analysis
        # Fill missing Funda columns with defaults
        funda_columns = ['price/selling_price/0', 'floor_area/0', 'number_of_bedrooms', 'number_of_rooms', 'energy_label']
        for col in funda_columns:
            if col not in merged_df.columns:
                merged_df[col] = 0 if col in ['price/selling_price/0', 'floor_area/0', 'number_of_bedrooms', 'number_of_rooms'] else 'Unknown'
        
        # Fill missing Realworks columns with defaults
        realworks_columns = ['sale_price', 'area_m2', 'bedrooms', 'rooms', 'energy_label_realworks']
        for col in realworks_columns:
            if col not in merged_df.columns:
                merged_df[col] = 0 if col in ['sale_price', 'area_m2', 'bedrooms', 'rooms'] else 'Unknown'
        
        logger.info(f"Merged data: {len(merged_df)} total records")
        logger.info(f"Match types: {merged_df['match_type'].value_counts().to_dict()}")
        
        # Save merged data
        merged_output = Path("outputs/perfect_merged_data.csv")
        merged_df.to_csv(merged_output, index=False)
        
        return merged_df
        
    except Exception as e:
        logger.error(f"Error merging data: {e}")
        return funda_df

def process_realworks_data_for_top15(realworks_df, reference_data, street_similarity_cache=None):
    """Process ONLY Realworks data to create top 15 matches."""
    try:
        logger.info(f"Processing {len(realworks_df)} Realworks records for top 15 matches")
        
        # CRITICAL: Fill missing/zero sale_price with ask_price when available
        if 'sale_price' in realworks_df.columns and 'ask_price' in realworks_df.columns:
            missing_count = realworks_df['sale_price'].isna().sum()
            realworks_df['sale_price'] = realworks_df['sale_price'].fillna(realworks_df['ask_price'])
            # Also replace non-positive sale prices with ask_price if ask_price > 0
            try:
                mask_non_positive = (realworks_df['sale_price'].fillna(0) <= 0) & (realworks_df['ask_price'].fillna(0) > 0)
                replaced_count = int(mask_non_positive.sum())
                realworks_df.loc[mask_non_positive, 'sale_price'] = realworks_df.loc[mask_non_positive, 'ask_price']
                if replaced_count > 0:
                    logger.info(f"Replaced {replaced_count} non-positive sale_price values with ask_price")
            except Exception as _:
                # Be tolerant if columns are not numeric yet
                pass
        
        # CRITICAL: Remove duplicates by normalizing addresses (case-insensitive, strip whitespace)
        realworks_df['address_normalized'] = realworks_df['address_full'].str.lower().str.strip()
        duplicates_before = len(realworks_df)
        realworks_df = realworks_df.drop_duplicates(subset='address_normalized', keep='first')
        duplicates_removed = duplicates_before - len(realworks_df)
        if duplicates_removed > 0:
            logger.info(f"Removed {duplicates_removed} duplicate addresses")
        realworks_df = realworks_df.drop(columns=['address_normalized'])
        
        # Map Realworks columns to expected names
        realworks_df['rw_sale_price'] = realworks_df['sale_price'].fillna(0) if 'sale_price' in realworks_df.columns else 0
        realworks_df['rw_area_m2'] = realworks_df['area_m2'].fillna(0) if 'area_m2' in realworks_df.columns else 0
        realworks_df['rw_bedrooms'] = realworks_df['bedrooms'].fillna(0) if 'bedrooms' in realworks_df.columns else 0
        realworks_df['rw_rooms'] = realworks_df['rooms'].fillna(0) if 'rooms' in realworks_df.columns else 0
        realworks_df['rw_energy_label'] = realworks_df['energy_label'].fillna('Unknown') if 'energy_label' in realworks_df.columns else 'Unknown'
        realworks_df['rw_has_garden'] = realworks_df['has_garden'].fillna(False) if 'has_garden' in realworks_df.columns else False
        realworks_df['rw_has_balcony'] = realworks_df['has_balcony'].fillna(False) if 'has_balcony' in realworks_df.columns else False
        realworks_df['rw_has_terrace'] = realworks_df['has_terrace'].fillna(False) if 'has_terrace' in realworks_df.columns else False
        
        # Map additional Realworks columns for complete data
        realworks_df['rw_bathrooms'] = realworks_df['bathrooms'].fillna(0) if 'bathrooms' in realworks_df.columns else 0
        realworks_df['rw_year_built'] = realworks_df['year_built'].fillna(0) if 'year_built' in realworks_df.columns else 0
        realworks_df['rw_maintenance_inside'] = realworks_df['maintenance_inside'].fillna('Unknown') if 'maintenance_inside' in realworks_df.columns else 'Unknown'
        realworks_df['rw_maintenance_outside'] = realworks_df['maintenance_outside'].fillna('Unknown') if 'maintenance_outside' in realworks_df.columns else 'Unknown'
        
        logger.info(f"INITIAL Realworks data: {len(realworks_df)} records after cleaning")
        
        # Calculate similarity scores using Algorithm 2 (house matching)
        realworks_df['similarity_score'] = realworks_df.apply(lambda row: calculate_simple_similarity_score(row, reference_data, street_similarity_cache), axis=1)
        
        # DEBUG: Show top 5 scoring breakdown for the first property
        if len(realworks_df) > 0:
            logger.info("\n" + "="*80)
            logger.info("SCORE BEREKENING VOORBEELD (Top 1 property):")
            logger.info("="*80)
            test_row = realworks_df.iloc[0]
            _ = calculate_simple_similarity_score(test_row, reference_data, street_similarity_cache, debug=True)
            logger.info("="*80 + "\n")
        
        # All records have match_type 'realworks_only' since we're only using Realworks
        realworks_df['match_type'] = 'realworks_only'
        realworks_df['match_priority'] = 2  # Consistent score for all
        realworks_df['final_score'] = realworks_df['similarity_score']
        
        # Filter out reference property (exact same unit incl. suffix, e.g., "364-3" vs "364-1")
        before_ref_filter = len(realworks_df)
        if 'address_full' in realworks_df.columns:
            ref_address = reference_data.get('address_full', '').strip()
            if ref_address:
                realworks_df['address_normalized'] = realworks_df['address_full'].str.lower().str.strip()
                ref_address_normalized = ref_address.lower().strip()
                
                # Extract street and full house token (number + optional suffix like "-3", " III", "A", "hs") from the first part before comma
                import re
                ref_first_part = ref_address_normalized.split(',')[0].strip()
                ref_match = re.match(r'^(.+?)\s+(\d[^,]*)$', ref_first_part)
                if ref_match:
                    ref_street = re.sub(r'\s+', ' ', ref_match.group(1).strip())
                    ref_house_token = re.sub(r'\s+', ' ', ref_match.group(2).strip())
                    street_esc = re.escape(ref_street)
                    house_esc = re.escape(ref_house_token)
                    pattern = re.compile(rf'^{street_esc}\s+{house_esc}(?:\s|,|$)')
                    # Mark only exact same unit as reference
                    realworks_df['is_ref_property'] = realworks_df['address_normalized'].apply(
                        lambda addr: bool(pattern.match(addr.split(',')[0].strip()))
                    )
                    realworks_df = realworks_df[~realworks_df['is_ref_property']]
                    after_ref_filter = len(realworks_df)
                    logger.info(f"After reference filter: {after_ref_filter} records (removed {before_ref_filter - after_ref_filter} properties matching exact unit '{ref_street} {ref_house_token}')")
                else:
                    # Fallback: exact match only
                    realworks_df = realworks_df[realworks_df['address_normalized'] != ref_address_normalized]
                    after_ref_filter = len(realworks_df)
                    logger.info(f"After reference filter: {after_ref_filter} records (removed {before_ref_filter - after_ref_filter} exact matches)")
        
        # Remove duplicates
        before_duplicate_filter = len(realworks_df)
        realworks_df = realworks_df.drop_duplicates(subset=['address_full'], keep='first')
        after_duplicate_filter = len(realworks_df)
        duplicates_removed = before_duplicate_filter - after_duplicate_filter
        if duplicates_removed > 0:
            logger.info(f"After duplicate filter: {after_duplicate_filter} records (removed {duplicates_removed} duplicates)")
        
        logger.info(f"=== FINAL AVAILABLE: {len(realworks_df)} Realworks records for top 15 ===")
        
        # Sort by similarity score and take top 15
        top15_df = realworks_df.sort_values('similarity_score', ascending=False).head(15).copy()
        logger.info(f"=== TOP 15 SELECTED: {len(top15_df)} records ===")
        
        # LOG: Show how the top 15 was calculated with detailed scoring breakdown
        if len(top15_df) > 0:
            logger.info("\n" + "="*80)
            logger.info("TOP 15 BEREKENING DETAILS:")
            logger.info("="*80)
            logger.info(f"Totaal beschikbare properties: {len(realworks_df)}")
            logger.info(f"Referentie adres: {reference_data.get('address_full', 'Unknown')}")
            logger.info(f"\nTop 15 geselecteerde properties:")
            for idx, (_, row) in enumerate(top15_df.iterrows(), 1):
                logger.info(f"\n  {idx}. {row['address_full']}")
                logger.info(f"     Score: {row['similarity_score']:.4f}")
                logger.info(f"     Prijs: €{row['rw_sale_price']:,.0f} | m²: {row['rw_area_m2']:.0f} | Kamers: {row['rw_rooms']:.0f}")
            logger.info("\n" + "="*80)
        
        # Select relevant columns for output
        output_columns = [
            'address_full', 'rw_sale_price', 'rw_area_m2', 'rw_bedrooms', 'rw_rooms', 
            'rw_bathrooms', 'rw_year_built', 'rw_energy_label', 
            'rw_maintenance_inside', 'rw_maintenance_outside',
            'rw_has_garden', 'rw_has_balcony', 'rw_has_terrace',
            'similarity_score', 'final_score'
        ]
        
        logger.info(f"Available columns in top15_df BEFORE filtering: {list(top15_df.columns)}")
        
        # Add URL column if it exists (probably won't for Realworks)
        if 'object_detail_page_relative_url' in top15_df.columns:
            output_columns.append('object_detail_page_relative_url')
        
        # Only include columns that exist
        available_columns = [col for col in output_columns if col in top15_df.columns]
        missing_columns = [col for col in output_columns if col not in top15_df.columns]
        if missing_columns:
            logger.warning(f"Missing columns in top15_df: {missing_columns}")
        top15_df = top15_df[available_columns]
        
        logger.info(f"Final columns in top15_df: {list(top15_df.columns)}")
        
        # Remove temporary columns
        temp_columns = ['address_normalized']
        for col in temp_columns:
            if col in top15_df.columns:
                top15_df = top15_df.drop(columns=[col])
        
        logger.info(f"Created top 15 matches from Realworks data with scores ranging from {top15_df['similarity_score'].min():.3f} to {top15_df['similarity_score'].max():.3f}")
        
        return top15_df
        
    except Exception as e:
        logger.error(f"Error processing Realworks data for top 15 matches: {e}")
        return pd.DataFrame(columns=['address_full', 'rw_sale_price', 'rw_area_m2', 'rw_bedrooms', 'rw_rooms', 'rw_energy_label', 'similarity_score'])

def process_merged_data_for_top15(merged_df, reference_data, street_similarity_cache=None):
    """Process merged data to create top 15 matches with similarity scores."""
    try:
        logger.info(f"Processing {len(merged_df)} merged records for top 15 matches")
        
        # Map columns to expected names for similarity calculation
        # Use Realworks data when available, fallback to Funda data
        merged_df['rw_sale_price'] = merged_df.apply(lambda row: 
            row.get('sale_price', 0) if pd.notna(row.get('sale_price', 0)) else 
            row.get('price/selling_price/0', 0), axis=1)
        
        merged_df['rw_area_m2'] = merged_df.apply(lambda row: 
            row.get('area_m2', 0) if pd.notna(row.get('area_m2', 0)) else 
            row.get('floor_area/0', 0), axis=1)
        
        merged_df['rw_bedrooms'] = merged_df.apply(lambda row: 
            row.get('bedrooms', 0) if pd.notna(row.get('bedrooms', 0)) else 
            row.get('number_of_bedrooms', 0), axis=1)
        
        merged_df['rw_rooms'] = merged_df.apply(lambda row: 
            row.get('rooms', 0) if pd.notna(row.get('rooms', 0)) else 
            row.get('number_of_rooms', 0), axis=1)
        
        merged_df['rw_energy_label'] = merged_df.apply(lambda row: 
            row.get('energy_label_realworks', 'Unknown') if pd.notna(row.get('energy_label_realworks', 'Unknown')) else 
            row.get('energy_label', 'Unknown'), axis=1)
        
        # Add new fields for the updated similarity algorithm
        merged_df['rw_has_garden'] = merged_df.apply(lambda row: 
            row.get('has_garden', False) if pd.notna(row.get('has_garden', False)) else 
            row.get('has_garden', False), axis=1)
        
        merged_df['rw_has_balcony'] = merged_df.apply(lambda row: 
            row.get('has_balcony', False) if pd.notna(row.get('has_balcony', False)) else 
            row.get('has_balcony', False), axis=1)
        
        merged_df['rw_has_terrace'] = merged_df.apply(lambda row: 
            row.get('has_terrace', False) if pd.notna(row.get('has_terrace', False)) else 
            row.get('has_terrace', False), axis=1)
        
        # CRITICAL: Filter to ONLY Realworks properties (realworks_only OR both)
        # This ensures we only match against properties that exist in Realworks data
        initial_count = len(merged_df)
        logger.info(f"INITIAL merged data: {initial_count} records")
        logger.info(f"Match types breakdown: {merged_df['match_type'].value_counts().to_dict()}")
        
        merged_df = merged_df[merged_df['match_type'].isin(['realworks_only', 'both'])].copy()
        filtered_count = len(merged_df)
        logger.info(f"After Realworks filter: {filtered_count} records (filtered from {initial_count})")
        
        # Calculate similarity scores using Algorithm 2 (house matching)
        merged_df['similarity_score'] = merged_df.apply(lambda row: calculate_simple_similarity_score(row, reference_data, street_similarity_cache), axis=1)
        
        # Add priority score for match type (both > funda_only > realworks_only)
        # Note: 'funda_only' should not exist after filtering
        merged_df['match_priority'] = merged_df['match_type'].map({
            'both': 3,
            'realworks_only': 2,
            'funda_only': 1,
            'no_match': 0
        }).fillna(0)
        
        # Calculate final score combining similarity and match priority
        # Match priority adds a small bonus (max 0.05) to the similarity score
        merged_df['final_score'] = merged_df['similarity_score'] + (merged_df['match_priority'] * 0.017)  # Small bonus: 3*0.017 = 0.051 max
        
        # CRITICAL: Filter out the reference property to avoid duplicates
        before_ref_filter = len(merged_df)
        if 'address_full' in merged_df.columns:
            ref_address = reference_data.get('address_full', '').strip()
            if ref_address:
                # Normalize addresses for comparison (lowercase, remove extra spaces)
                merged_df['address_normalized'] = merged_df['address_full'].str.lower().str.strip()
                ref_address_normalized = ref_address.lower().strip()
                
                # Extract street name and house number from reference address
                # E.g., "Eerste laurierdwarsstraat 18" -> street="eerste laurierdwarsstraat", number="18"
                import re
                # Only filter out EXACT matches, not entire streets
                # This filters "Eerste laurierdwarsstraat 18" but keeps "Eerste laurierdwarsstraat 19", "Eerste laurierdwarsstraat 20", etc.
                merged_df = merged_df[merged_df['address_normalized'] != ref_address_normalized]
                after_ref_filter = len(merged_df)
                logger.info(f"After reference filter: {after_ref_filter} records (removed {before_ref_filter - after_ref_filter} exact matches)")
        else:
            after_ref_filter = len(merged_df)
        
        # CRITICAL: Remove duplicate addresses (same exact address appearing multiple times)
        before_duplicate_filter = len(merged_df)
        if 'address_full' in merged_df.columns:
            merged_df = merged_df.drop_duplicates(subset=['address_full'], keep='first')
            after_duplicate_filter = len(merged_df)
            duplicates_removed = before_duplicate_filter - after_duplicate_filter
            if duplicates_removed > 0:
                logger.info(f"After duplicate filter: {after_duplicate_filter} records (removed {duplicates_removed} duplicates)")
        
        logger.info(f"=== FINAL AVAILABLE: {len(merged_df)} records for top 15 ===")
        
        # Sort by final score (descending) and take top 15 OTHER properties (excluding reference)
        top15_df = merged_df.sort_values('final_score', ascending=False).head(15).copy()
        logger.info(f"=== TOP 15 SELECTED: {len(top15_df)} records ===")
        
        # Select relevant columns for the final output
        output_columns = [
            'address_full', 'rw_sale_price', 'rw_area_m2', 'rw_bedrooms', 'rw_rooms', 
            'rw_energy_label', 'rw_has_garden', 'rw_has_balcony', 'rw_has_terrace',
            'similarity_score', 'final_score', 'match_type', 'match_priority'
        ]
        
        # Add URL column if it exists
        if 'object_detail_page_relative_url' in top15_df.columns:
            output_columns.append('object_detail_page_relative_url')
        
        # Only include columns that exist
        available_columns = [col for col in output_columns if col in top15_df.columns]
        top15_df = top15_df[available_columns]
        
        # Remove temporary columns if they exist
        temp_columns = ['address_normalized', 'is_ref_property']
        for col in temp_columns:
            if col in top15_df.columns:
                top15_df = top15_df.drop(columns=[col])
        
        logger.info(f"Created top 15 matches (excluding reference property) with final scores ranging from {top15_df['final_score'].min():.3f} to {top15_df['final_score'].max():.3f}")
        
        return top15_df
        
    except Exception as e:
        logger.error(f"Error processing merged data for top 15 matches: {e}")
        # Return empty DataFrame with expected columns
        return pd.DataFrame(columns=['address_full', 'rw_sale_price', 'rw_area_m2', 'rw_bedrooms', 'rw_rooms', 'rw_energy_label', 'similarity_score'])

def analyze_csv_data(csv_df, reference_data):
    """Analyze CSV data and return summary statistics."""
    try:
        # Basic analysis
        total_properties = len(csv_df)
        
        # Calculate average price if price column exists
        if 'price/selling_price/0' in csv_df.columns:
            avg_price = csv_df['price/selling_price/0'].mean()
        else:
            avg_price = 500000  # Default
        
        return {
            "total_properties": total_properties,
            "average_price": int(avg_price) if pd.notna(avg_price) else 500000
        }
    except Exception as e:
        logger.error(f"Error analyzing CSV: {e}")
        return {
            "total_properties": len(csv_df),
            "average_price": 500000
        }

def clear_cache():
    """Clear the street similarity cache directory."""
    cache_dir = Path("cache")
    if cache_dir.exists():
        try:
            # Remove all cache files
            for cache_file in cache_dir.glob("*.json"):
                cache_file.unlink()
            logger.info("Cache cleared successfully")
        except Exception as e:
            logger.warning(f"Could not clear cache: {e}")

def main():
    """Main function for command line usage."""
    if len(sys.argv) < 3:
        print("Usage: python api_workflow.py <reference_data.json> <csv_file_path> [realworks_file1.rtf] [realworks_file2.rtf] ...")
        sys.exit(1)
    
    # Clear cache at the start of every run
    clear_cache()
    
    reference_file = sys.argv[1]
    csv_file_path = sys.argv[2]
    realworks_files = sys.argv[3:] if len(sys.argv) > 3 else []
    
    try:
        # Load reference data
        with open(reference_file, 'r', encoding='utf-8') as f:
            reference_data = json.load(f)
        
        # Run API workflow with Realworks files
        result = run_api_workflow_with_realworks(reference_data, csv_file_path, realworks_files)
        
        # Save final result
        with open('outputs/api_workflow_result.json', 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        # Print result to stdout (API reads from stdout)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        # Exit with appropriate code
        if result['status'] == 'success':
            sys.exit(0)
        else:
            sys.exit(1)
            
    except Exception as e:
        error_result = {
            "status": "error",
            "message": f"Failed to run API workflow: {str(e)}",
            "step1_result": None,
            "step2_result": None,
            "step3_result": None,
            "step5_result": None
        }
        
        with open('outputs/api_workflow_result.json', 'w', encoding='utf-8') as f:
            json.dump(error_result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(error_result, indent=2, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
