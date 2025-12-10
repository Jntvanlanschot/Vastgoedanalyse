#!/usr/bin/env python3
"""Test script for PDF parser."""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from parse_realworks_pdf import parse_pdf_file

# Test with desktop PDF
pdf_path = Path(r"C:\Users\meesv\OneDrive\Bureaublad\crm.realworks.nl_servlets_objects_framework.download_downloadFile.pdf")

if not pdf_path.exists():
    print(f"PDF not found: {pdf_path}")
    sys.exit(1)

print(f"Testing PDF parser with: {pdf_path}")
print("=" * 60)

try:
    properties = parse_pdf_file(pdf_path)
    print(f"\nFound {len(properties)} properties\n")
    
    for i, prop in enumerate(properties[:3], 1):
        address = prop.get('address_full', 'N/A')
        image_count = len(prop.get('images', []))
        print(f"{i}. {address}")
        print(f"   Images: {image_count}")
        print(f"   Sale price: {prop.get('sale_price', 'N/A')}")
        print(f"   Area: {prop.get('area_m2', 'N/A')} m²")
        print()
    
    if len(properties) > 0:
        print("[OK] PDF parser works!")
    else:
        print("[ERROR] No properties found")
        
except Exception as e:
    print(f"[ERROR] Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

