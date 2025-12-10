#!/usr/bin/env python3
"""
PDF Realworks parser - extracts properties from PDF files (same format as RTF parser).
Extracts text and images from PDF files.
"""

import re
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from io import BytesIO
from PIL import Image

try:
    import fitz  # PyMuPDF
except ImportError:
    logging.error("PyMuPDF not installed. Install with: pip install PyMuPDF")
    raise

# Import parsing functions from RTF parser
from parse_realworks_perfect import (
    parse_realworks_property,
    parse_currency,
    parse_date,
    extract_address_components
)

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def extract_images_from_pdf_page(pdf_path: Path, page_num: int, after_fotos: bool = False) -> List[Image.Image]:
    """
    Extract first 4 images from a PDF page after "Foto's" section.
    Returns list of PIL Images.
    """
    try:
        doc = fitz.open(str(pdf_path))
        if page_num >= len(doc):
            doc.close()
            return []
        
        page = doc[page_num]
        
        # Extract text to find "Foto's" section
        text = page.get_text()
        has_fotos = "Foto" in text or "Foto's" in text or "Foto\'s" in text
        
        if not has_fotos and not after_fotos:
            doc.close()
            return []
        
        # Extract images from this page
        image_list = page.get_images()
        images = []
        
        for img_idx, img in enumerate(image_list):
            if len(images) >= 4:
                break
            
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            
            # Convert to PIL Image
            try:
                pil_image = Image.open(BytesIO(image_bytes))
                
                # Only include if it's a reasonable size (not tiny icons)
                if pil_image.width > 50 and pil_image.height > 50:
                    images.append(pil_image)
            except Exception as e:
                logger.debug(f"Could not process image {img_idx} on page {page_num}: {e}")
                continue
        
        doc.close()
        return images  # Return all images
    except Exception as e:
        logger.error(f"Error extracting images from PDF: {e}")
        return []

def parse_pdf_file(pdf_path: Path) -> List[Dict[str, Any]]:
    """
    Parse a single PDF file and extract all properties.
    Returns list of property dictionaries (same format as RTF parser).
    """
    logger.info(f"Parsing PDF file: {pdf_path}")
    
    try:
        doc = fitz.open(str(pdf_path))
    except Exception as e:
        logger.error(f"Error opening PDF {pdf_path}: {e}")
        return []
    
    # Extract all text from PDF
    full_text = ""
    for page_num in range(len(doc)):
        page = doc[page_num]
        full_text += page.get_text() + "\n\n"
    
    doc.close()
    
    # Split into property sections (look for addresses)
    # Same pattern as RTF parser
    address_pattern = r'([A-Za-zÀ-ÿ\.\-\' ]+)\s+(\d+(\s+[A-Za-z0-9]+)?)\s*,\s*(\d{4}\s?[A-Z]{2})\s+([A-Za-z ]+)'
    
    # Find all address matches
    address_matches = list(re.finditer(address_pattern, full_text))
    
    if not address_matches:
        logger.warning(f"No addresses found in {pdf_path}")
        return []
    
    logger.info(f"Found {len(address_matches)} address matches")
    
    properties = []
    
    for i, match in enumerate(address_matches):
        start_pos = match.start()
        
        # Find end position (start of next address or end of text)
        if i + 1 < len(address_matches):
            end_pos = address_matches[i + 1].start()
        else:
            end_pos = len(full_text)
        
        # Extract property text
        property_text = full_text[start_pos:end_pos]
        
        # Skip if too short (likely not a complete property)
        if len(property_text.strip()) < 100:
            continue
        
        # Parse the property (using same function as RTF parser)
        record = parse_realworks_property(property_text)
        
        # Add source file info
        record['source_file'] = str(pdf_path)
        
        # Only add if we have at least an address
        if not record['address_full']:
            continue
        
        # Extract images for this property
        # Search all pages for "Foto's" section and extract images
        doc = fitz.open(str(pdf_path))
        
        # Find which page contains this property by searching for the address
        property_page = None
        address_text = record.get('address_full', '')
        if address_text:
            # Extract just street and number for matching
            street_match = re.search(r'^([^,]+)', address_text)
            if street_match:
                search_text = street_match.group(1).strip()
                for p in range(len(doc)):
                    page = doc[p]
                    page_text = page.get_text()
                    # Check if address appears on this page
                    if search_text in page_text:
                        property_page = p
                        break
        
        # Search for "Foto's" section - could be on same page or later pages
        fotos_page = None
        for p in range(property_page if property_page is not None else 0, len(doc)):
            page = doc[p]
            page_text = page.get_text()
            if "Foto" in page_text or "Foto's" in page_text or "Foto\'s" in page_text:
                fotos_page = p
                break
        
        # Extract images from the page with Foto's
        if fotos_page is not None:
            images = extract_images_from_pdf_page(pdf_path, fotos_page, after_fotos=True)
            record['images'] = images  # Store PIL Images
            logger.info(f"Found {len(images)} images for {address_text} on page {fotos_page + 1}")
        else:
            record['images'] = []
            logger.debug(f"No Foto's section found for {address_text}")
        
        doc.close()
        
        properties.append(record)
    
    logger.info(f"Found {len(properties)} property records in {pdf_path}")
    return properties

def parse_pdf_directory(pdf_dir: Path, output_csv: Path) -> 'pd.DataFrame':
    """Parse all PDF files in directory and create CSV."""
    import pandas as pd
    
    if not pdf_dir.exists():
        logger.error(f"Directory {pdf_dir} does not exist")
        return pd.DataFrame()
    
    all_properties = []
    
    # Find all PDF files
    pdf_files = list(pdf_dir.glob("*.pdf"))
    logger.info(f"Found {len(pdf_files)} PDF files")
    
    for pdf_file in pdf_files:
        properties = parse_pdf_file(pdf_file)
        all_properties.extend(properties)
    
    if not all_properties:
        logger.warning("No properties found")
        return pd.DataFrame()
    
    # Convert images to a serializable format (store as None for CSV)
    # Images will be stored separately
    for prop in all_properties:
        if 'images' in prop:
            # Store image count instead of actual images for CSV
            prop['image_count'] = len(prop['images'])
            # Remove PIL Images (not serializable)
            del prop['images']
    
    # Create DataFrame
    df = pd.DataFrame(all_properties)
    
    # Remove duplicates based on address_full
    df = df.drop_duplicates(subset=['address_full']).reset_index(drop=True)
    
    # Sort by address
    df = df.sort_values('address_full').reset_index(drop=True)
    
    # Save to CSV
    df.to_csv(output_csv, index=False)
    logger.info(f"Saved {len(df)} records to {output_csv}")
    
    return df

if __name__ == "__main__":
    import pandas as pd
    
    # Direct execution for this project
    pdf_dir = Path("realworks")
    output_csv = Path("realworks_perfect_data.csv")
    
    df = parse_pdf_directory(pdf_dir, output_csv)
    
    if not df.empty:
        print(f"\nParsed {len(df)} property records")
        print(f"Output saved to: {output_csv}")
        
        # Show sample
        print("\nSample records:")
        print(df[['address_full', 'sale_price', 'sale_date', 'area_m2', 'bedrooms', 'bathrooms', 'year_built']].head())
        
        # Show breakdown by street
        print("\nRecords by street:")
        street_counts = df['street'].value_counts()
        for street, count in street_counts.items():
            print(f"  {street}: {count} records")
    else:
        print("No records found")

