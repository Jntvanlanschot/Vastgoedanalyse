#!/usr/bin/env python3
"""Inspect RTF file structure to understand how images are stored."""

import sys
from pathlib import Path

rtf_path = Path.home() / "Downloads" / "Selectie-09112025_0758.rtf"

if len(sys.argv) > 1:
    rtf_path = Path(sys.argv[1])

with open(rtf_path, 'rb') as f:
    data = f.read()

jpeg_sig = b'\xff\xd8\xff'
png_sig = b'\x89PNG\r\n\x1a\n'
pict_sig = b'\\pict'
bin_sig = b'\\bin'

print(f"File size: {len(data)} bytes")
print(f"JPEG signatures (FF D8 FF): {data.count(jpeg_sig)}")
print(f"PNG signatures: {data.count(png_sig)}")
print(f"Contains \\pict: {pict_sig in data}")
print(f"Contains \\bin: {bin_sig in data}")
print(f"Contains pict: {b'pict' in data}")
print(f"Contains bin: {b'bin' in data}")

# Look for common RTF image patterns
text = data.decode('latin-1', errors='ignore')
if '\\pict' in text:
    print("\nFound \\pict patterns:")
    import re
    pict_matches = list(re.finditer(r'\\pict[^}]*', text[:10000]))
    for i, match in enumerate(pict_matches[:5]):
        print(f"  Match {i+1}: {match.group()[:200]}")

if '\\bin' in text:
    print("\nFound \\bin patterns:")
    import re
    bin_matches = list(re.finditer(r'\\bin\d+', text[:10000]))
    for i, match in enumerate(bin_matches[:5]):
        print(f"  Match {i+1}: {match.group()}")

print(f"\nFirst 1000 bytes (as text):")
print(text[:1000])

