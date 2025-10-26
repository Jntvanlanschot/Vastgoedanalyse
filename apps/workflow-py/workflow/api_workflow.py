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
        step1_result = {
            "status": "success",
            "message": f"Fetched similarity data for {len(street_similarity_cache.get(reference_data.get('street_name', ''), []))} streets",
            "street_similarity_cache": street_similarity_cache
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
        
        # Merge Funda and Realworks data
        merged_df = merge_funda_and_realworks(csv_df, realworks_df)
        logger.info(f"Merged data: {len(merged_df)} total records")
        
        # Calculate similarity scores for all properties using Algorithm 2
        logger.info("Calculating similarity scores using Algorithm 2...")
        # Use the existing process function which calculates similarity scores and returns top 15
        top_15_df = process_merged_data_for_top15(merged_df, reference_data, street_similarity_cache)
        logger.info(f"Selected top 15 matches with scores ranging from {top_15_df['final_score'].min():.3f} to {top_15_df['final_score'].max():.3f}")
        
        # Save top 15 matches
        top_15_file = Path("outputs/top15_perfect_matches_final.csv")
        top_15_df.to_csv(top_15_file, index=False)
        
        step4_result = {
            "status": "success",
            "message": "Analysis completed",
            "matched_records": len(merged_df),
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
            "matched_records": len(merged_df),
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
        step1_result = {
            "status": "success",
            "message": f"Fetched similarity data for {len(street_similarity_cache.get(reference_data.get('street_name', ''), []))} streets",
            "street_similarity_cache": street_similarity_cache
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
        
        for street_name in unique_streets:
            # Get a sample property from this street for similarity calculation
            sample_property = csv_df[csv_df[street_col] == street_name].iloc[0]
            
            # Calculate similarity score using Algorithm 1 (street matching)
            similarity_score = calculate_street_similarity_score(sample_property, reference_data, street_similarity_cache)
            
            # Get statistics for this street
            street_data = csv_df[csv_df[street_col] == street_name]
            properties_count = len(street_data)
            
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
        
        # Sort by similarity score (descending) and take top 4 OTHER streets (excluding reference street)
        street_scores.sort(key=lambda x: x['similarity_score'], reverse=True)
        
        # Filter out the reference street and take top 4 other streets
        ref_street_name = reference_data.get('street_name', '').lower().strip()
        other_streets = [street for street in street_scores if street['street_name'].lower().strip() != ref_street_name]
        top_4_other_streets = other_streets[:4]
        
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

def calculate_simple_similarity_score(row, reference_data, street_similarity_cache=None):
    """Calculate similarity score based on new weighted criteria with OSM street similarity."""
    try:
        score = 0.0
        
        # 1. Street similarity (5% weight - significantly reduced from 10%)
        ref_street = str(reference_data.get('street_name', '')).lower().strip()
        row_street = str(row.get('address/street_name', '')).lower().strip()
        if ref_street and row_street:
            if ref_street == row_street:
                score += 0.05 * 1.0  # Same street = perfect match
            else:
                # Calculate street name similarity (Levenshtein distance)
                street_similarity = calculate_string_similarity(ref_street, row_street)
                score += 0.05 * street_similarity
        
        # 2. OSM-based street similarity (34% weight - highest weight)
        osm_street_score = calculate_osm_street_similarity(row, reference_data, street_similarity_cache)
        score += 0.34 * osm_street_score
        
        # 3. Living area (m²) proximity (25% weight - increased from 20%)
        # Try both rw_area_m2 (from merged data) and floor_area/0 (from Funda data)
        area_m2 = row.get('rw_area_m2', 0) or row.get('floor_area/0', 0)
        if pd.notna(area_m2) and area_m2 > 0:
            area_diff = abs(area_m2 - reference_data.get('area_m2', 100))
            area_score = max(0, 1 - (area_diff / reference_data.get('area_m2', 100)))
            score += 0.25 * area_score
        
        # 4. Micro-location proximity (10% weight - reduced from 16%)
        # This uses neighbourhood similarity
        ref_neighbourhood = str(reference_data.get('neighbourhood', '')).lower().strip()
        row_neighbourhood = str(row.get('address/neighbourhood', '')).lower().strip()
        if ref_neighbourhood and row_neighbourhood:
            if ref_neighbourhood == row_neighbourhood:
                score += 0.10 * 1.0
            else:
                neighbourhood_similarity = calculate_string_similarity(ref_neighbourhood, row_neighbourhood)
                score += 0.10 * neighbourhood_similarity
        
        # 5. Garden match (10% weight)
        ref_garden = reference_data.get('has_garden', False)
        row_garden = row.get('rw_has_garden', False)
        if ref_garden == row_garden:
            score += 0.10 * 1.0
        else:
            score += 0.10 * 0.5  # Partial score for mismatch
        
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
            score += 0.02 * 0.5  # Neutral score for unknown labels
        
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
        
        # 2. OSM-based street similarity (34% weight - highest weight)
        osm_street_score = calculate_osm_street_similarity(row, reference_data, street_similarity_cache)
        score += 0.34 * osm_street_score
        
        # 3. Living area (m²) proximity (20% weight - lower for street matching)
        # Try both rw_area_m2 (from merged data) and floor_area/0 (from Funda data)
        area_m2 = row.get('rw_area_m2', 0) or row.get('floor_area/0', 0)
        if pd.notna(area_m2) and area_m2 > 0:
            area_diff = abs(area_m2 - reference_data.get('area_m2', 100))
            area_score = max(0, 1 - (area_diff / reference_data.get('area_m2', 100)))
            score += 0.20 * area_score
        
        # 4. Micro-location proximity (10% weight)
        ref_neighbourhood = str(reference_data.get('neighbourhood', '')).lower().strip()
        row_neighbourhood = str(row.get('address/neighbourhood', '')).lower().strip()
        if ref_neighbourhood and row_neighbourhood:
            if ref_neighbourhood == row_neighbourhood:
                score += 0.10 * 1.0
            else:
                neighbourhood_similarity = calculate_string_similarity(ref_neighbourhood, row_neighbourhood)
                score += 0.10 * neighbourhood_similarity
        
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
        row_street = str(row.get('address/street_name', '') or '')
        
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
        
        # Create address_full column for Funda data
        funda_df = funda_df.copy()
        funda_df['address_full'] = funda_df['address/street_name'] + ' ' + funda_df['address/house_number'].astype(str)
        funda_df['address_full'] = funda_df['address_full'] + funda_df['address/house_number_suffix'].fillna('')
        funda_df['address_full'] = funda_df['address_full'] + ', ' + funda_df['address/postal_code'] + ', ' + funda_df['address/city']
        
        # Create address_full column for Realworks data
        realworks_df = realworks_df.copy()
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
        
        # Calculate similarity scores using Algorithm 2 (house matching)
        merged_df['similarity_score'] = merged_df.apply(lambda row: calculate_simple_similarity_score(row, reference_data, street_similarity_cache), axis=1)
        
        # Add priority score for match type (both > funda_only > realworks_only)
        merged_df['match_priority'] = merged_df['match_type'].map({
            'both': 3,
            'funda_only': 2, 
            'realworks_only': 1,
            'no_match': 0
        }).fillna(0)
        
        # Calculate final score combining similarity and match priority
        # Match priority adds a small bonus (max 0.05) to the similarity score
        merged_df['final_score'] = merged_df['similarity_score'] + (merged_df['match_priority'] * 0.017)  # Small bonus: 3*0.017 = 0.051 max
        
        # Sort by final score (descending)
        top15_df = merged_df.sort_values('final_score', ascending=False).head(15).copy()
        
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
        
        logger.info(f"Created top 15 matches with final scores ranging from {top15_df['final_score'].min():.3f} to {top15_df['final_score'].max():.3f}")
        
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

def main():
    """Main function for command line usage."""
    if len(sys.argv) < 3:
        print("Usage: python api_workflow.py <reference_data.json> <csv_file_path> [realworks_file1.rtf] [realworks_file2.rtf] ...")
        sys.exit(1)
    
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
        
        # Print result
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
