#!/usr/bin/env python3
"""Debug script to check if downloaded images are valid."""

from PIL import Image
from io import BytesIO
import requests
from pathlib import Path

# Test the same images that are being downloaded
image_ids = ['2857502824', '2857502836', '2857502852', '2857502864']

for img_id in image_ids:
    url = f"https://static.realworks.nl/cms/10000/{img_id}.jpg"
    print(f"\nTesting: {img_id}.jpg")
    print(f"URL: {url}")
    
    try:
        response = requests.get(url, timeout=3)
        print(f"Status: {response.status_code}")
        print(f"Content length: {len(response.content)} bytes")
        print(f"Content type: {response.headers.get('Content-Type', 'unknown')}")
        
        # Check first bytes
        print(f"First 20 bytes: {response.content[:20]}")
        
        # Try to open as image
        img = Image.open(BytesIO(response.content))
        img.verify()
        img = Image.open(BytesIO(response.content))  # Reopen after verify
        
        print(f"Image size: {img.size}")
        print(f"Image format: {img.format}")
        print(f"Image mode: {img.mode}")
        
        # Save to file for inspection
        output_path = Path("outputs") / f"debug_{img_id}.png"
        output_path.parent.mkdir(exist_ok=True)
        img.save(output_path)
        print(f"Saved to: {output_path}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()


