#!/usr/bin/env python3
"""Test the full workflow with PDF file."""

import sys
import json
from pathlib import Path

# Add workflow to path
sys.path.insert(0, str(Path(__file__).parent / "workflow"))

# Test data
reference_data = {
    "address_full": "Eerste Laurierdwarsstraat 9 2, 1016 PV Amsterdam",
    "street_name": "Eerste Laurierdwarsstraat",
    "area_m2": 30,
    "energy_label": "E",
    "bedrooms": 1,
    "bathrooms": 1,
    "rooms": 2,
    "has_terrace": False,
    "has_balcony": False,
    "has_garden": False,
    "sun_orientation": "zuid"
}

# Test PDF file
pdf_file = Path(r"C:\Users\meesv\OneDrive\Bureaublad\crm.realworks.nl_servlets_objects_framework.download_downloadFile.pdf")

if not pdf_file.exists():
    print(f"PDF file not found: {pdf_file}")
    sys.exit(1)

print("=" * 60)
print("Testing Full Workflow with PDF")
print("=" * 60)

# Step 1: Test PDF parsing
print("\n1. Testing PDF parsing...")
try:
    from parse_realworks_pdf import parse_pdf_file
    properties = parse_pdf_file(pdf_file)
    print(f"   [OK] Found {len(properties)} properties")
    if properties:
        prop = properties[0]
        print(f"   [OK] Address: {prop.get('address_full', 'N/A')}")
        print(f"   [OK] Images: {len(prop.get('images', []))}")
        print(f"   [OK] Sale price: {prop.get('sale_price', 'N/A')}")
except Exception as e:
    print(f"   [ERROR] PDF parsing failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Step 2: Test workflow processing
print("\n2. Testing workflow processing...")
try:
    from workflow.api_workflow import process_realworks_files_from_args
    result = process_realworks_files_from_args([str(pdf_file)])
    print(f"   [OK] Processed {result.get('processed_records', 0)} records")
    print(f"   [OK] Status: {result.get('status', 'N/A')}")
    
    # Check if images JSON was created
    images_json = Path("outputs/realworks_perfect_data_images.json")
    if images_json.exists():
        print(f"   [OK] Images JSON created: {images_json}")
        with open(images_json, 'r') as f:
            images_data = json.load(f)
            print(f"   [OK] Found images for {len(images_data)} addresses")
    else:
        print(f"   [WARN] Images JSON not found")
except Exception as e:
    print(f"   [ERROR] Workflow processing failed: {e}")
    import traceback
    traceback.print_exc()

# Step 3: Test report generation
print("\n3. Testing report generation...")
try:
    # Create a simple top15 CSV for testing
    import pandas as pd
    if properties:
        prop = properties[0]
        test_df = pd.DataFrame([{
            'address_full': prop.get('address_full', ''),
            'rw_sale_price': prop.get('sale_price', 0),
            'rw_area_m2': prop.get('area_m2', 0),
            'rw_rooms': prop.get('rooms', 0),
            'rw_bedrooms': prop.get('bedrooms', 0),
            'rw_bathrooms': prop.get('bathrooms', 0),
            'rw_year_built': prop.get('year_built', 0),
            'rw_energy_label': prop.get('energy_label', 'Unknown'),
            'rw_has_garden': prop.get('has_garden', False),
            'rw_has_balcony': prop.get('has_balcony', False),
            'rw_has_terrace': prop.get('has_terrace', False),
            'rw_maintenance_inside': prop.get('maintenance_inside', 'Unknown'),
            'rw_maintenance_outside': prop.get('maintenance_outside', 'Unknown'),
            'final_score': 0.95
        }])
        
        test_csv = Path("outputs/top15_perfect_matches_final.csv")
        test_df.to_csv(test_csv, index=False)
        print(f"   [OK] Created test CSV: {test_csv}")
        
        # Test report generation
        from workflow.step4_generate_reports import generate_reports
        report_result = generate_reports(str(test_csv), reference_data)
        
        if report_result.get('status') == 'success':
            print(f"   [OK] Report generated successfully")
            print(f"   [OK] PDF: {report_result.get('pdf_file', 'N/A')}")
            print(f"   [OK] Excel: {report_result.get('excel_file', 'N/A')}")
        else:
            print(f"   [ERROR] Report generation failed: {report_result.get('message', 'N/A')}")
except Exception as e:
    print(f"   [ERROR] Report generation failed: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("Test completed!")
print("=" * 60)

