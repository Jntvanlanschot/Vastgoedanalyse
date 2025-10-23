#!/usr/bin/env python3
"""
STEP 4: Report Generation (PDF and Excel)

This script:
1. Takes the top 15 matches from step 3
2. Generates a professional PDF report
3. Generates an Excel table with all data
4. Returns file paths for download

Input: Top 15 matches data from step 3
Output: PDF report and Excel file
"""

import json
import logging
import sys
from pathlib import Path
import pandas as pd

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def generate_reports(top15_csv_path="outputs/top15_perfect_matches_final.csv", reference_data=None):
    """
    Generate PDF and Excel reports from top 15 matches.
    
    Args:
        top15_csv_path (str): Path to top 15 matches CSV
        reference_data (dict): Reference address data
    
    Returns:
        dict: Result with generated report file paths
    """
    
    try:
        # Load top 15 data
        logger.info(f"Loading top 15 data from {top15_csv_path}")
        top15_df = pd.read_csv(top15_csv_path)
        logger.info(f"Loaded {len(top15_df)} top 15 matches")
        
        if len(top15_df) == 0:
            return {
                "status": "error",
                "message": "No top 15 matches found to generate reports",
                "pdf_file": None,
                "excel_file": None
            }
        
        # Generate Excel report using existing script
        import sys
        sys.path.append('.')
        from create_perfect_excel_table import create_excel_table
        
        excel_output = Path('outputs/top15_perfecte_woningen_tabel_final.xlsx')
        
        # Create Excel table
        excel_df = top15_df.copy()
        excel_df['rank'] = range(1, len(excel_df) + 1)
        
        # Reorder columns for better presentation
        columns_order = [
            'rank', 'address_full', 'rw_sale_price', 'rw_area_m2', 'rw_energy_label',
            'rw_bedrooms', 'rw_bathrooms', 'rw_year_built', 'rw_has_garden',
            'rw_maintenance_inside', 'rw_maintenance_outside', 'similarity_score'
        ]
        
        # Only include columns that exist
        available_columns = [col for col in columns_order if col in excel_df.columns]
        excel_df = excel_df[available_columns]
        
        # Rename columns for better readability
        column_names = {
            'rank': 'Rang',
            'address_full': 'Adres',
            'rw_sale_price': 'Verkoopprijs (€)',
            'rw_area_m2': 'Oppervlakte (m²)',
            'rw_energy_label': 'Energielabel',
            'rw_bedrooms': 'Slaapkamers',
            'rw_bathrooms': 'Badkamers',
            'rw_year_built': 'Bouwjaar',
            'rw_has_garden': 'Tuin',
            'rw_maintenance_inside': 'Onderhoud Binnen',
            'rw_maintenance_outside': 'Onderhoud Buiten',
            'similarity_score': 'Score'
        }
        
        excel_df = excel_df.rename(columns=column_names)
        
        # Save Excel file
        excel_df.to_excel(excel_output, index=False, sheet_name='Top 15 Woningen')
        logger.info(f"Saved Excel report to {excel_output}")
        
        # Generate PDF report using existing script
        from generate_perfect_pdf_report import generate_pdf_report
        
        pdf_output = Path('outputs/top15_perfect_report_final.pdf')
        
        # Generate PDF
        generate_pdf_report(top15_df, pdf_output, reference_data)
        logger.info(f"Saved PDF report to {pdf_output}")
        
        # Calculate summary statistics
        avg_price_per_m2 = 0
        if 'rw_sale_price' in top15_df.columns and 'rw_area_m2' in top15_df.columns:
            valid_prices = []
            for _, row in top15_df.iterrows():
                sale_price = row.get('rw_sale_price', 0)
                area_m2 = row.get('rw_area_m2', 0)
                if pd.notna(sale_price) and sale_price > 0 and pd.notna(area_m2) and area_m2 > 0:
                    valid_prices.append(sale_price / area_m2)
            
            if valid_prices:
                avg_price_per_m2 = sum(valid_prices) / len(valid_prices)
        
        # Prepare result
        result = {
            "status": "success",
            "message": f"Successfully generated reports for {len(top15_df)} properties",
            "pdf_file": str(pdf_output),
            "excel_file": str(excel_output),
            "total_properties": len(top15_df),
            "avg_price_per_m2": round(avg_price_per_m2, 0),
            "score_range": {
                "highest": round(top15_df['similarity_score'].max(), 3),
                "lowest": round(top15_df['similarity_score'].min(), 3)
            }
        }
        
        logger.info(f"Generated reports: PDF ({pdf_output}) and Excel ({excel_output})")
        
        return result
        
    except Exception as e:
        logger.error(f"Error generating reports: {e}")
        return {
            "status": "error",
            "message": str(e),
            "pdf_file": None,
            "excel_file": None
        }

def main():
    """Main function for command line usage."""
    if len(sys.argv) < 2:
        print("Usage: python step4_generate_reports.py <top15_csv_path> [reference_data.json]")
        sys.exit(1)
    
    top15_csv_path = sys.argv[1]
    reference_data = None
    
    if len(sys.argv) >= 3:
        reference_file = sys.argv[2]
        try:
            with open(reference_file, 'r', encoding='utf-8') as f:
                reference_data = json.load(f)
        except Exception as e:
            logger.warning(f"Could not load reference data: {e}")
    
    try:
        result = generate_reports(top15_csv_path, reference_data)
        
        # Save result
        with open('outputs/step4_result.json', 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        error_result = {
            "status": "error",
            "message": str(e),
            "pdf_file": None,
            "excel_file": None
        }
        
        with open('outputs/step4_result.json', 'w', encoding='utf-8') as f:
            json.dump(error_result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(error_result, indent=2, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
