#!/usr/bin/env python3
"""
MHTML Realworks parser - extracts properties from MHTML files (same format as RTF/PDF parser).
Extracts text and images from MHTML files.
"""

import re
import logging
import base64
from pathlib import Path
from typing import Dict, List, Optional, Any
from io import BytesIO
try:
    from email import message_from_string
    from email.message import Message
except ImportError:
    # Fallback for older Python versions
    from email.parser import Parser
    def message_from_string(s):
        return Parser().parsestr(s)
from PIL import Image

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

def extract_images_from_mhtml(mhtml_path: Path) -> Dict[str, List[Image.Image]]:
    """
    Extract images from MHTML file.
    Returns dict mapping image URLs/content-ids to PIL Images.
    """
    try:
        with open(mhtml_path, 'rb') as f:
            content = f.read()
        
        # Parse MHTML as email message
        msg = message_from_string(content.decode('utf-8', errors='ignore'))
        
        images = {}
        
        # Walk through all parts
        for part in msg.walk():
            content_type = part.get_content_type()
            
            if content_type.startswith('image/'):
                # Get image data
                image_data = part.get_payload(decode=True)
                if image_data:
                    try:
                        pil_image = Image.open(BytesIO(image_data))
                        # Only include if it's a reasonable size (not tiny icons)
                        if pil_image.width > 50 and pil_image.height > 50:
                            # Use content-id or content-location as key
                            content_id = part.get('Content-ID', '')
                            content_location = part.get('Content-Location', '')
                            key = content_id or content_location or f"image_{len(images)}"
                            images[key] = pil_image
                            logger.debug(f"Extracted image: {key} ({pil_image.width}x{pil_image.height})")
                    except Exception as e:
                        logger.debug(f"Could not process image part: {e}")
                        continue
        
        logger.info(f"Extracted {len(images)} images from MHTML")
        return images
    except Exception as e:
        logger.error(f"Error extracting images from MHTML: {e}")
        return {}

def extract_html_content_from_mhtml(mhtml_path: Path) -> str:
    """
    Extract HTML content from MHTML file.
    """
    try:
        with open(mhtml_path, 'rb') as f:
            content = f.read()
        
        # Try parsing as email message first
        try:
            msg = message_from_string(content.decode('utf-8', errors='ignore'))
            
            # Find HTML part
            html_content = None
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == 'text/html':
                    html_content = part.get_payload(decode=True)
                    if isinstance(html_content, bytes):
                        html_content = html_content.decode('utf-8', errors='ignore')
                    break
            
            if html_content:
                return html_content
        except Exception as e:
            logger.debug(f"Could not parse as email message: {e}")
        
        # Fallback: extract HTML directly from file
        content_str = content.decode('utf-8', errors='ignore')
        
        # Find HTML content - look for <html> tag
        html_match = re.search(r'<html[^>]*>.*?</html>', content_str, re.DOTALL | re.IGNORECASE)
        if html_match:
            html_content = html_match.group(0)
            return html_content
        
        # If no <html> tag, try to find content between boundaries
        # MHTML uses multipart boundaries
        boundary_match = re.search(r'boundary="([^"]+)"', content_str)
        if boundary_match:
            boundary = boundary_match.group(1)
            # Find text/html part
            html_part_match = re.search(
                rf'Content-Type:\s*text/html.*?{re.escape(boundary)}',
                content_str,
                re.DOTALL | re.IGNORECASE
            )
            if html_part_match:
                html_part = html_part_match.group(0)
                # Extract HTML content (remove headers)
                html_content_match = re.search(r'<[^>]+>.*', html_part, re.DOTALL)
                if html_content_match:
                    return html_content_match.group(0)
        
        return ""
    except Exception as e:
        logger.error(f"Error extracting HTML from MHTML: {e}")
        return ""

def find_images_in_html(html_content: str, mhtml_images: Dict[str, Image.Image]) -> List[Image.Image]:
    """
    Find images in HTML that match the extracted MHTML images.
    Returns all images after "Foto's" section.
    """
    images = []
    
    # Find "Foto's" section
    fotos_match = re.search(r'Foto[\'s]*', html_content, re.IGNORECASE)
    if not fotos_match:
        logger.debug("No 'Foto's' section found in HTML")
        return []
    
    # Get content after "Foto's"
    content_after_fotos = html_content[fotos_match.end():]
    
    # Find image references (img tags with src)
    img_pattern = r'<img[^>]+src=["\']([^"\']+)["\']'
    img_matches = list(re.finditer(img_pattern, content_after_fotos, re.IGNORECASE))
    
    # Also look for base64 encoded images
    base64_pattern = r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)'
    base64_matches = list(re.finditer(base64_pattern, content_after_fotos, re.IGNORECASE))
    
    # Process regular image URLs - try to match with MHTML images
    for match in img_matches:  # Check all matches
        src = match.group(1)
        # Clean up src (remove query parameters, decode entities)
        src_clean = src.split('?')[0].split('&')[0]
        
        # Try to find matching image in mhtml_images
        matched = False
        for key, img in mhtml_images.items():
            # Check if src matches any part of the key
            key_clean = key.replace('<', '').replace('>', '').lower()
            src_clean_lower = src_clean.lower()
            
            # Extract filename from both
            src_filename = src_clean_lower.split('/')[-1]
            key_filename = key_clean.split('/')[-1] if '/' in key_clean else key_clean
            
            if (src_clean_lower in key_clean or 
                key_clean in src_clean_lower or
                src_filename == key_filename or
                (src_filename and key_filename and src_filename[:10] == key_filename[:10])):
                images.append(img)
                matched = True
                logger.debug(f"Matched image: {src} -> {key}")
                break
        
        if not matched and len(mhtml_images) > 0:
            # If we have images but no match, just take the first available ones
            remaining_images = [img for key, img in mhtml_images.items() if img not in images]
            if remaining_images:
                images.append(remaining_images[0])
    
    # Process base64 images
    for match in base64_matches:
        try:
            base64_data = match.group(1)
            image_bytes = base64.b64decode(base64_data)
            pil_image = Image.open(BytesIO(image_bytes))
            if pil_image.width > 50 and pil_image.height > 50:
                images.append(pil_image)
        except Exception as e:
            logger.debug(f"Could not decode base64 image: {e}")
            continue
    
    # If we still don't have images, just take any available images from MHTML
    if len(images) == 0 and mhtml_images:
        remaining = [img for key, img in mhtml_images.items() if img not in images]
        images.extend(remaining)
    
    return images  # Return all images

def parse_mhtml_file(mhtml_path: Path) -> List[Dict[str, Any]]:
    """
    Parse MHTML file and extract property data.
    Returns list of property dictionaries (same format as RTF/PDF parser).
    """
    logger.info(f"Parsing MHTML file: {mhtml_path}")
    
    # Extract HTML content
    html_content = extract_html_content_from_mhtml(mhtml_path)
    if not html_content:
        logger.error(f"No HTML content found in {mhtml_path}")
        return []
    
    # Extract images
    mhtml_images = extract_images_from_mhtml(mhtml_path)
    
    # Decode HTML entities (quoted-printable, etc.)
    # MHTML often uses quoted-printable encoding
    html_content = html_content.replace('=3D', '=').replace('=\n', '').replace('=\r\n', '')
    
    # Find all addresses (similar to PDF parser)
    # Look for address patterns in HTML
    address_pattern = r'<b>([^<]+(?:straat|laan|weg|kade|plein|hof|park|dreef|singel|gracht)[^<]*(?:\d+[^<]*)?)</b>'
    address_matches = list(re.finditer(address_pattern, html_content, re.IGNORECASE))
    
    # Also try to find addresses in table cells
    if not address_matches:
        # Look for addresses in bold tags or table headers
        address_pattern2 = r'<b>([^<]+(?:,\s*\d{4}\s+[A-Z]{2})[^<]*)</b>'
        address_matches = list(re.finditer(address_pattern2, html_content, re.IGNORECASE))
    
    if not address_matches:
        # Fallback: look for any bold text that might be an address
        address_pattern3 = r'<b>([^<]{10,50})</b>'
        address_matches = list(re.finditer(address_pattern3, html_content, re.IGNORECASE))
    
    properties = []
    
    for i, match in enumerate(address_matches):
        address_text = match.group(1)
        
        # Find property section (from this address to next address or end)
        start_pos = match.start()
        if i + 1 < len(address_matches):
            end_pos = address_matches[i + 1].start()
        else:
            # Look for next property marker or end
            next_section = html_content.find('<table', start_pos + 1000)
            if next_section > start_pos:
                end_pos = next_section
            else:
                end_pos = min(start_pos + 10000, len(html_content))
        
        # Extract property HTML
        property_html = html_content[start_pos:end_pos]
        
        # Convert HTML to plain text for parsing
        # Remove HTML tags but keep text
        property_text = re.sub(r'<[^>]+>', ' ', property_html)
        property_text = re.sub(r'\s+', ' ', property_text).strip()
        
        # Skip if too short
        if len(property_text) < 100:
            continue
        
        # Parse the property (using same function as RTF/PDF parser)
        record = parse_realworks_property(property_text)
        
        # Add source file info
        record['source_file'] = str(mhtml_path)
        
        # Only add if we have at least an address
        if not record['address_full']:
            # Try to extract address from HTML directly
            address_match = re.search(r'<b>([^<]+)</b>', property_html)
            if address_match:
                record['address_full'] = address_match.group(1).strip()
        
        if not record['address_full']:
            continue
        
        # Clean address: remove "Verkocht In verkoop genomen Vraagprijs" and similar status text
        record['address_full'] = re.sub(r'\s*(Verkocht|In verkoop genomen|Vraagprijs|Prijs op aanvraag).*$', '', record['address_full'], flags=re.IGNORECASE).strip()
        
        # Find images for this property
        images = find_images_in_html(property_html, mhtml_images)
        record['images'] = images
        logger.info(f"Found {len(images)} images for {record.get('address_full', 'unknown')}")
        
        properties.append(record)
    
    logger.info(f"Found {len(properties)} property records in {mhtml_path}")
    return properties

def parse_mhtml_directory(mhtml_dir: Path, output_csv: Path) -> 'pd.DataFrame':
    """
    Parse all MHTML files in a directory and save to CSV.
    """
    import pandas as pd
    
    mhtml_files = list(mhtml_dir.glob('*.mhtml')) + list(mhtml_dir.glob('*.mht'))
    
    if not mhtml_files:
        logger.warning(f"No MHTML files found in {mhtml_dir}")
        return pd.DataFrame()
    
    all_properties = []
    
    for mhtml_file in mhtml_files:
        try:
            properties = parse_mhtml_file(mhtml_file)
            all_properties.extend(properties)
        except Exception as e:
            logger.error(f"Error parsing {mhtml_file}: {e}")
            continue
    
    if not all_properties:
        logger.warning("No properties found in MHTML files")
        return pd.DataFrame()
    
    # Convert images to base64 for CSV storage
    for prop in all_properties:
        if 'images' in prop and prop['images']:
            images_base64 = []
            for img in prop['images']:
                try:
                    img_buffer = BytesIO()
                    # Convert RGBA to RGB if needed
                    if img.mode == 'RGBA':
                        rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                        rgb_img.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)
                        img = rgb_img
                    img.save(img_buffer, format='JPEG', quality=85)
                    img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
                    images_base64.append(img_base64)
                except Exception as e:
                    logger.debug(f"Could not encode image: {e}")
                    continue
            prop['images_base64'] = images_base64
            prop['image_count'] = len(images_base64)
            del prop['images']  # Remove PIL Images (not JSON serializable)
        else:
            prop['image_count'] = 0
            prop['images_base64'] = []
    
    # Create DataFrame
    df = pd.DataFrame(all_properties)
    
    # Save to CSV
    df.to_csv(output_csv, index=False)
    logger.info(f"Saved {len(df)} properties to {output_csv}")
    
    return df

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 3:
        print("Usage: parse_realworks_mhtml.py <mhtml_dir> <output_csv>")
        sys.exit(1)
    
    mhtml_dir = Path(sys.argv[1])
    output_csv = Path(sys.argv[2])
    
    parse_mhtml_directory(mhtml_dir, output_csv)

