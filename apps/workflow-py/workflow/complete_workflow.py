#!/usr/bin/env python3
"""
COMPLETE WORKFLOW: Vastgoedanalyse Tool

This script orchestrates the complete workflow:
1. Process reference address and get top 5 streets
2. Process uploaded Realworks data
3. Merge data and select top 15 matches
4. Generate PDF and Excel reports

Usage:
    python complete_workflow.py <reference_data.json> <uploaded_files_dir>

Input:
    - reference_data.json: Reference address data
    - uploaded_files_dir: Directory containing RTF files

Output:
    - step1_result.json: Top 5 streets
    - step2_result.json: Processed Realworks data
    - step3_result.json: Merged data and top 15 matches
    - step4_result.json: Generated reports
    - Various CSV, PDF, and Excel files
"""

import json
import logging
import sys
from pathlib import Path
import os

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def run_complete_workflow(reference_data, uploaded_files_dir):
    """
    Run the complete workflow.
    
    Args:
        reference_data (dict): Reference address data
        uploaded_files_dir (str): Directory containing uploaded RTF files
    
    Returns:
        dict: Complete workflow result
    """
    
    try:
        # Create outputs directory
        Path('outputs').mkdir(exist_ok=True)
        
        logger.info("=== STARTING COMPLETE WORKFLOW ===")
        
        # Step 1: Process reference and get top 5 streets
        logger.info("STEP 1: Processing reference address and selecting top 5 streets...")
        from step1_reference_processing import process_reference_and_get_top5_streets
        
        step1_result = process_reference_and_get_top5_streets(reference_data)
        
        if step1_result['status'] != 'success':
            return {
                "status": "error",
                "message": f"Step 1 failed: {step1_result['message']}",
                "step1_result": step1_result,
                "step2_result": None,
                "step3_result": None,
                "step4_result": None
            }
        
        logger.info(f"Step 1 completed: Found {len(step1_result['top_5_streets'])} streets")
        
        # Step 2: Process Realworks data
        logger.info("STEP 2: Processing uploaded Realworks data...")
        from step2_realworks_processing import process_realworks_data
        
        step2_result = process_realworks_data(uploaded_files_dir, step1_result['top_5_streets'])
        
        if step2_result['status'] != 'success':
            return {
                "status": "error",
                "message": f"Step 2 failed: {step2_result['message']}",
                "step1_result": step1_result,
                "step2_result": step2_result,
                "step3_result": None,
                "step4_result": None
            }
        
        logger.info(f"Step 2 completed: Processed {step2_result['processed_records']} Realworks records")
        
        # Step 3: Merge data and select top 15
        logger.info("STEP 3: Merging data and selecting top 15 matches...")
        from step3_merge_and_select import merge_and_select_top15
        
        step3_result = merge_and_select_top15(reference_data)
        
        if step3_result['status'] != 'success':
            return {
                "status": "error",
                "message": f"Step 3 failed: {step3_result['message']}",
                "step1_result": step1_result,
                "step2_result": step2_result,
                "step3_result": step3_result,
                "step4_result": None
            }
        
        logger.info(f"Step 3 completed: Found {step3_result['top_15_count']} top matches")
        
        # Step 4: Generate reports
        logger.info("STEP 4: Generating PDF and Excel reports...")
        from step4_generate_reports import generate_reports
        
        step4_result = generate_reports(step3_result['top15_file'], reference_data)
        
        if step4_result['status'] != 'success':
            return {
                "status": "error",
                "message": f"Step 4 failed: {step4_result['message']}",
                "step1_result": step1_result,
                "step2_result": step2_result,
                "step3_result": step3_result,
                "step4_result": step4_result
            }
        
        logger.info("Step 4 completed: Generated PDF and Excel reports")
        
        # Prepare final result
        final_result = {
            "status": "success",
            "message": "Complete workflow executed successfully",
            "step1_result": step1_result,
            "step2_result": step2_result,
            "step3_result": step3_result,
            "step4_result": step4_result,
            "summary": {
                "total_funda_records": step1_result['total_funda_records'],
                "realworks_records": step2_result['processed_records'],
                "matched_records": step3_result['matched_records'],
                "top_15_matches": step3_result['top_15_count'],
                "pdf_file": step4_result['pdf_file'],
                "excel_file": step4_result['excel_file']
            }
        }
        
        logger.info("=== WORKFLOW COMPLETED SUCCESSFULLY ===")
        return final_result
        
    except Exception as e:
        logger.error(f"Workflow failed with error: {e}")
        return {
            "status": "error",
            "message": str(e),
            "step1_result": None,
            "step2_result": None,
            "step3_result": None,
            "step4_result": None
        }

def main():
    """Main function for command line usage."""
    if len(sys.argv) != 3:
        print("Usage: python complete_workflow.py <reference_data.json> <uploaded_files_dir>")
        print("\nExample:")
        print("  python complete_workflow.py reference.json uploaded_rtf_files/")
        sys.exit(1)
    
    reference_file = sys.argv[1]
    uploaded_files_dir = sys.argv[2]
    
    try:
        # Load reference data
        with open(reference_file, 'r', encoding='utf-8') as f:
            reference_data = json.load(f)
        
        # Run complete workflow
        result = run_complete_workflow(reference_data, uploaded_files_dir)
        
        # Save final result
        with open('outputs/complete_workflow_result.json', 'w', encoding='utf-8') as f:
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
            "message": f"Failed to run workflow: {str(e)}",
            "step1_result": None,
            "step2_result": None,
            "step3_result": None,
            "step4_result": None
        }
        
        with open('outputs/complete_workflow_result.json', 'w', encoding='utf-8') as f:
            json.dump(error_result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(error_result, indent=2, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()

