#!/usr/bin/env python3
"""Test script to find images in HTML."""

from pathlib import Path
import re

html_path = Path.home() / "Downloads" / "ELDS.htm"

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Find Foto's section
fotos_match = re.search(r'Foto[\'s]*', html, re.IGNORECASE)
if fotos_match:
    start = fotos_match.end()
    section = html[start:start+50000]
    
    # Find all img tags
    imgs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', section, re.IGNORECASE)
    print(f"Found {len(imgs)} image tags after 'Foto's'")
    print("\nFirst 5 image sources:")
    for i, img_src in enumerate(imgs[:5]):
        print(f"  {i+1}. {img_src}")
        
        # Check if file exists
        html_dir = html_path.parent
        img_filename = Path(img_src).name
        possible_paths = [
            html_dir / img_src,
            html_dir / "ELDS_files" / img_filename,
        ]
        
        for p in possible_paths:
            if p.exists():
                print(f"      ✓ Found: {p}")
            else:
                print(f"      ✗ Not found: {p}")




