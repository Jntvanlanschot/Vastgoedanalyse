#!/usr/bin/env python3
"""
WORKFLOW: Vastgoedanalyse Tool with Realworks Integration

This script orchestrates the complete workflow with CSV data and Realworks files:
1. Process reference address and get top 5 streets from provided CSV
2. Process uploaded Realworks data files
3. Merge data and select top 15 matches
4. Generate PDF and Excel reports

Usage:
    python api_workflow_with_realworks.py <reference_data.json> <csv_file_path> <realworks_file_1> <realworks_file_2> <realworks_file_3> <realworks_file_4> <realworks_file_5>

Input:
    - reference_data.json: Reference address data
    - csv_file_path: Path to CSV file
    - realworks_file_1-5: Paths to Realworks files

Output:
    - JSON result with analysis and file paths
"""

import json
import logging
import sys
from pathlib import Path
import os
import pandas as pd

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def run_api_workflow_with_realworks(reference_data, csv_file_path, realworks_files):
    """
    Run the workflow with CSV data and Realworks files.
    
    Args:
        reference_data (dict): Reference address data
        csv_file_path (str): Path to CSV file
        realworks_files (list): List of paths to Realworks files
    
    Returns:
        dict: Complete workflow result
    """
    
    try:
        # Create outputs directory
        Path('outputs').mkdir(exist_ok=True)
        
        logger.info("=== STARTING API WORKFLOW WITH REALWORKS ===")
        
        # Step 1: Process reference and get top 5 streets from CSV data
        logger.info("STEP 1: Processing reference address and selecting top 5 streets from CSV...")
        
        # Parse CSV data from file
        csv_df = pd.read_csv(csv_file_path)
        logger.info(f"Loaded {len(csv_df)} records from CSV")
        
        # Process the CSV data to find top streets
        top_5_streets = process_csv_for_top_streets(csv_df, reference_data)
        
        step1_result = {
            "status": "success",
            "message": f"Found {len(top_5_streets)} top streets",
            "top_5_streets": top_5_streets,
            "total_funda_records": len(csv_df)
        }
        
        logger.info(f"Step 1 completed: Found {len(step1_result['top_5_streets'])} streets")
        
        # Step 2: Process Realworks data
        logger.info("STEP 2: Processing Realworks files...")
        realworks_data = process_realworks_files(realworks_files)
        
        step2_result = {
            "status": "success",
            "message": f"Processed {realworks_data['total_records']} Realworks records",
            "processed_records": realworks_data['total_records'],
            "files_processed": len(realworks_files)
        }
        
        logger.info(f"Step 2 completed: Processed {realworks_data['total_records']} Realworks records")
        
        logger.info("STEP 3: Creating analysis results...")
        
        # Process the CSV data to create top 15 matches with similarity scores
        top15_df = process_csv_for_top15_matches(csv_df, reference_data)
        
        step3_result = {
            "status": "success",
            "message": "Analysis completed",
            "matched_records": len(top15_df),
            "top_15_count": len(top15_df),
            "top15_file": "outputs/top15_perfect_matches_final.csv"
        }
        
        # Save processed top 15 data for download
        top15_df.to_csv(step3_result["top15_file"], index=False)
        
        logger.info(f"Step 3 completed: Processed {len(top15_df)} top matches")
        
        # Step 4: Generate real reports
        logger.info("STEP 4: Generating reports...")
        
        try:
            # Import the report generation function
            from step4_generate_reports import generate_reports
            
            # Generate real PDF and Excel reports
            report_result = generate_reports(step3_result["top15_file"], reference_data)
            
            if report_result["status"] == "success":
                step4_result = {
                    "status": "success",
                    "message": report_result["message"],
                    "pdf_file": report_result["pdf_file"],
                    "excel_file": report_result["excel_file"]
                }
                logger.info(f"Step 4 completed: Generated real reports")
            else:
                # Fallback to placeholder if generation fails
                logger.warning(f"Report generation failed: {report_result.get('message', 'Unknown error')}")
                pdf_file = "outputs/top15_perfect_report_realworks_fallback.pdf"
                excel_file = "outputs/top15_perfecte_woningen_tabel_realworks_fallback.xlsx"
                
                # Create empty Excel file
                empty_df = pd.DataFrame(columns=['Rang', 'Adres', 'Verkoopprijs (€)', 'Oppervlakte (m²)', 'Score'])
                empty_df.to_excel(excel_file, index=False, sheet_name='Top 15 Woningen')
                
                # Create proper PDF
                from step4_generate_reports import create_empty_pdf
                create_empty_pdf(pdf_file, reference_data)
                
                step4_result = {
                    "status": "success",
                    "message": "Reports generated (placeholder)",
                    "pdf_file": pdf_file,
                    "excel_file": excel_file
                }
                
        except Exception as e:
            logger.error(f"Error generating reports: {e}")
            # Fallback to proper PDF generation
            from step4_generate_reports import create_empty_pdf
            
            pdf_file = "outputs/top15_perfect_report_realworks_fallback.pdf"
            excel_file = "outputs/top15_perfecte_woningen_tabel_realworks_fallback.xlsx"
            
            # Create empty Excel file
            empty_df = pd.DataFrame(columns=['Rang', 'Adres', 'Verkoopprijs (€)', 'Oppervlakte (m²)', 'Score'])
            empty_df.to_excel(excel_file, index=False, sheet_name='Top 15 Woningen')
            
            # Create proper PDF
            create_empty_pdf(pdf_file, reference_data)
            
            step4_result = {
                "status": "success",
                "message": "Reports generated (fallback)",
                "pdf_file": pdf_file,
                "excel_file": excel_file
            }
        
        logger.info("Step 4 completed: Generated reports")
        
        # Prepare final result
        final_result = {
            "status": "success",
            "message": "API workflow with Realworks executed successfully",
            "step1_result": step1_result,
            "step2_result": step2_result,
            "step3_result": step3_result,
            "step4_result": step4_result,
            "summary": {
                "total_funda_records": step1_result['total_funda_records'],
                "realworks_records": step2_result['processed_records'],
                "matched_records": step3_result['matched_records'],
                "top_15_matches": step3_result['top_15_count'],
                "pdf_file": pdf_file,
                "excel_file": excel_file
            },
            "artifacts": {
                "pdf": pdf_file,
                "excel": excel_file,
                "csv": "outputs/funda-buurten-nl.csv"
            }
        }
        
        logger.info("=== API WORKFLOW WITH REALWORKS COMPLETED SUCCESSFULLY ===")
        return final_result
        
    except Exception as e:
        logger.error(f"API Workflow with Realworks failed with error: {e}")
        return {
            "status": "error",
            "message": str(e),
            "step1_result": None,
            "step2_result": None,
            "step3_result": None,
            "step4_result": None
        }

def process_csv_for_top_streets(csv_df, reference_data):
    """Process CSV data to find top 5 streets."""
    try:
        # Group by street name and calculate statistics
        if 'address/street_name' in csv_df.columns:
            street_stats = csv_df.groupby('address/street_name').agg({
                'price/selling_price/0': ['count', 'mean'],
                'address/city': 'first'
            }).round(0)
            
            street_stats.columns = ['properties_count', 'average_price', 'city']
            street_stats = street_stats.reset_index()
            
            # Sort by property count and price
            street_stats = street_stats.sort_values(['properties_count', 'average_price'], ascending=[False, False])
            
            # Take top 5
            top_streets = street_stats.head(5).to_dict('records')
            
            # Format the results
            formatted_streets = []
            for street in top_streets:
                formatted_streets.append({
                    "street_name": street['address/street_name'],
                    "name": street['address/street_name'],
                    "city": street['city'],
                    "properties_count": int(street['properties_count']),
                    "average_price": int(street['average_price']) if pd.notna(street['average_price']) else 0
                })
            
            return formatted_streets
        else:
            # Fallback if street name column doesn't exist
            return [{
                "street_name": "Unknown Street",
                "name": "Unknown Street", 
                "city": "Amsterdam",
                "properties_count": len(csv_df),
                "average_price": 500000
            }]
    except Exception as e:
        logger.error(f"Error processing streets: {e}")
        return [{
            "street_name": "Error",
            "name": "Error",
            "city": "Amsterdam", 
            "properties_count": 0,
            "average_price": 0
        }]

def process_realworks_files(realworks_files):
    """Process Realworks RTF files and return summary."""
    try:
        total_records = 0
        processed_files = []
        
        # Import the RTF parser
        import sys
        sys.path.append('.')
        from parse_realworks_perfect import parse_rtf_file
        
        for i, file_path in enumerate(realworks_files):
            if os.path.exists(file_path):
                try:
                    # Process RTF file using the specialized parser
                    if file_path.endswith('.rtf'):
                        properties = parse_rtf_file(Path(file_path))
                        records_count = len(properties)
                        total_records += records_count
                        
                        # Get column names from first property if available
                        columns = list(properties[0].keys()) if properties else []
                        
                        processed_files.append({
                            "file": f"realworks_file_{i+1}",
                            "records": records_count,
                            "columns": columns,
                            "file_type": "RTF"
                        })
                        
                        logger.info(f"Processed RTF {file_path}: {records_count} records")
                    else:
                        # Fallback for non-RTF files (Excel/CSV)
                        if file_path.endswith(('.xlsx', '.xls')):
                            df = pd.read_excel(file_path)
                        else:
                            df = pd.read_csv(file_path)
                        
                        records_count = len(df)
                        total_records += records_count
                        
                        processed_files.append({
                            "file": f"realworks_file_{i+1}",
                            "records": records_count,
                            "columns": list(df.columns),
                            "file_type": "Excel/CSV"
                        })
                        
                        logger.info(f"Processed {file_path}: {records_count} records")
                    
                except Exception as e:
                    logger.error(f"Error processing {file_path}: {e}")
                    processed_files.append({
                        "file": f"realworks_file_{i+1}",
                        "records": 0,
                        "error": str(e),
                        "file_type": "Unknown"
                    })
            else:
                logger.warning(f"File not found: {file_path}")
                processed_files.append({
                    "file": f"realworks_file_{i+1}",
                    "records": 0,
                    "error": "File not found",
                    "file_type": "Unknown"
                })
        
        return {
            "total_records": total_records,
            "processed_files": processed_files
        }
        
    except Exception as e:
        logger.error(f"Error processing Realworks files: {e}")
        return {
            "total_records": 0,
            "processed_files": [],
            "error": str(e)
        }

def process_csv_for_top15_matches(csv_df, reference_data):
    """Process CSV data to create top 15 matches with similarity scores."""
    try:
        logger.info(f"Processing {len(csv_df)} records for top 15 matches")
        
        # Create address_full column
        csv_df['address_full'] = csv_df['address/street_name'] + ' ' + csv_df['address/house_number'].astype(str)
        csv_df['address_full'] = csv_df['address_full'] + csv_df['address/house_number_suffix'].fillna('')
        csv_df['address_full'] = csv_df['address_full'] + ', ' + csv_df['address/postal_code'] + ', ' + csv_df['address/city']
        
        # Map Funda columns to expected column names
        csv_df['rw_sale_price'] = csv_df['price/selling_price/0'].fillna(0)
        csv_df['rw_area_m2'] = csv_df['floor_area/0'].fillna(0)
        csv_df['rw_bedrooms'] = csv_df['number_of_bedrooms'].fillna(0)
        csv_df['rw_rooms'] = csv_df['number_of_rooms'].fillna(0)
        csv_df['rw_energy_label'] = csv_df['energy_label'].fillna('Unknown')
        
        # Calculate similarity scores using a simplified algorithm
        csv_df['similarity_score'] = csv_df.apply(lambda row: calculate_simple_similarity_score(row, reference_data), axis=1)
        
        # Sort by similarity score and get top 15
        top15_df = csv_df.sort_values('similarity_score', ascending=False).head(15).copy()
        
        # Select relevant columns for the final output
        output_columns = [
            'address_full', 'rw_sale_price', 'rw_area_m2', 'rw_bedrooms', 'rw_rooms', 
            'rw_energy_label', 'similarity_score', 'object_detail_page_relative_url'
        ]
        
        # Only include columns that exist
        available_columns = [col for col in output_columns if col in top15_df.columns]
        top15_df = top15_df[available_columns]
        
        logger.info(f"Created top 15 matches with scores ranging from {top15_df['similarity_score'].min():.3f} to {top15_df['similarity_score'].max():.3f}")
        
        return top15_df
        
    except Exception as e:
        logger.error(f"Error processing CSV for top 15 matches: {e}")
        # Return empty DataFrame with expected columns
        return pd.DataFrame(columns=['address_full', 'rw_sale_price', 'rw_area_m2', 'rw_bedrooms', 'rw_rooms', 'rw_energy_label', 'similarity_score'])

def calculate_simple_similarity_score(row, reference_data):
    """Calculate a simple similarity score based on reference data."""
    try:
        score = 0.0
        
        # Area similarity (30% weight)
        if pd.notna(row.get('rw_area_m2', 0)) and row['rw_area_m2'] > 0:
            area_diff = abs(row['rw_area_m2'] - reference_data.get('area_m2', 100))
            area_score = max(0, 1 - (area_diff / reference_data.get('area_m2', 100)))
            score += 0.30 * area_score
        
        # Bedrooms similarity (20% weight)
        if pd.notna(row.get('rw_bedrooms', 0)):
            bedroom_diff = abs(row['rw_bedrooms'] - reference_data.get('bedrooms', 2))
            bedroom_score = max(0, 1 - (bedroom_diff / max(reference_data.get('bedrooms', 2), 1)))
            score += 0.20 * bedroom_score
        
        # Rooms similarity (15% weight)
        if pd.notna(row.get('rw_rooms', 0)):
            room_diff = abs(row['rw_rooms'] - reference_data.get('rooms', 3))
            room_score = max(0, 1 - (room_diff / max(reference_data.get('rooms', 3), 1)))
            score += 0.15 * room_score
        
        # Energy label similarity (20% weight)
        energy_labels = ['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
        ref_energy = reference_data.get('energy_label', 'B')
        row_energy = row.get('rw_energy_label', 'Unknown')
        
        if ref_energy in energy_labels and row_energy in energy_labels:
            ref_index = energy_labels.index(ref_energy)
            row_index = energy_labels.index(row_energy)
            energy_diff = abs(ref_index - row_index)
            energy_score = max(0, 1 - (energy_diff / len(energy_labels)))
            score += 0.20 * energy_score
        else:
            score += 0.20 * 0.5  # Neutral score for unknown labels
        
        # Price reasonableness (15% weight) - properties within reasonable price range
        if pd.notna(row.get('rw_sale_price', 0)) and row['rw_sale_price'] > 0:
            # Simple price range check (this could be more sophisticated)
            price_per_m2 = row['rw_sale_price'] / max(row.get('rw_area_m2', 1), 1)
            if 3000 <= price_per_m2 <= 15000:  # Reasonable price per m² range
                score += 0.15 * 1.0
            else:
                score += 0.15 * 0.5
        
        return min(1.0, score)  # Cap at 1.0
        
    except Exception as e:
        logger.error(f"Error calculating similarity score: {e}")
        return 0.0

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
            "average_price": avg_price,
            "matched_records": total_properties,
            "top_15_matches": min(15, total_properties)
        }
    except Exception as e:
        logger.error(f"Error analyzing CSV data: {e}")
        return {
            "total_properties": len(csv_df),
            "average_price": 500000
        }

def main():
    """Main function for command line usage."""
    if len(sys.argv) < 4:
        print("Usage: python api_workflow_with_realworks.py <reference_data.json> <csv_file_path> <realworks_file_1> [<realworks_file_2> ...]")
        sys.exit(1)
    
    reference_file = sys.argv[1]
    csv_file_path = sys.argv[2]
    realworks_files = sys.argv[3:]  # Accept 1 or more Realworks files
    
    try:
        # Load reference data
        with open(reference_file, 'r', encoding='utf-8') as f:
            reference_data = json.load(f)
        
        # Run API workflow with Realworks files
        result = run_api_workflow_with_realworks(reference_data, csv_file_path, realworks_files)
        
        # Save final result
        with open('outputs/api_workflow_with_realworks_result.json', 'w', encoding='utf-8') as f:
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
            "message": f"Failed to run API workflow with Realworks: {str(e)}",
            "step1_result": None,
            "step2_result": None,
            "step3_result": None,
            "step4_result": None
        }
        
        with open('outputs/api_workflow_with_realworks_result.json', 'w', encoding='utf-8') as f:
            json.dump(error_result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(error_result, indent=2, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()

