#!/usr/bin/env python3
"""Test MHTML parser with example files."""

from pathlib import Path
from parse_realworks_mhtml import parse_mhtml_file

test_file = Path(r'C:\Users\meesv\OneDrive\Bureaublad\Schipbeekstraattest\Schipbeekstraat.mhtml')

if test_file.exists():
    print(f"Testing MHTML parser with: {test_file}")
    props = parse_mhtml_file(test_file)
    print(f"\nFound {len(props)} properties:")
    for i, p in enumerate(props[:5], 1):
        print(f"  {i}. {p.get('address_full', 'unknown')}: {p.get('image_count', 0)} images")
else:
    print(f"Test file not found: {test_file}")

