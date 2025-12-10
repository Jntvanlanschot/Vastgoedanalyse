#!/usr/bin/env python3
"""
Extract images from RTF file and create a PDF with the first 4 images of the first property.
"""

import re
import base64
import os
import struct
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from io import BytesIO
from PIL import Image
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def find_binary_blocks(rtf_bytes: bytes):
    """Find all potential binary data blocks in RTF - OPTIMIZED VERSION."""
    images = []
    
    # Use find() instead of byte-by-byte iteration (much faster!)
    pos = 0
    max_search = min(len(rtf_bytes), 5000000)  # Limit search to first 5MB to avoid hanging
    
    # Look for JPEG signatures
    while pos < max_search - 100:
        jpeg_start = rtf_bytes.find(b'\xff\xd8\xff', pos)
        if jpeg_start == -1:
            break
        
        # Find JPEG end
        jpeg_end = rtf_bytes.find(b'\xff\xd9', jpeg_start + 3)
        if jpeg_end != -1:
            jpeg_data = rtf_bytes[jpeg_start:jpeg_end + 2]
            if 1000 < len(jpeg_data) < 10000000:  # Reasonable size
                try:
                    img = Image.open(BytesIO(jpeg_data))
                    images.append(jpeg_data)
                    logger.info(f"Found JPEG at offset {jpeg_start}: {len(jpeg_data)} bytes")
                    pos = jpeg_end + 2
                    continue
                except:
                    pass
        
        pos = jpeg_start + 1
    
    # Look for PNG signatures
    pos = 0
    while pos < max_search - 100:
        png_start = rtf_bytes.find(b'\x89PNG\r\n\x1a\n', pos)
        if png_start == -1:
            break
        
        # PNG ends with IEND chunk
        png_end = rtf_bytes.find(b'IEND\xaeB`\x82', png_start + 8)
        if png_end != -1:
            png_data = rtf_bytes[png_start:png_end + 8]
            if 1000 < len(png_data) < 10000000:  # Reasonable size
                try:
                    img = Image.open(BytesIO(png_data))
                    images.append(png_data)
                    logger.info(f"Found PNG at offset {png_start}: {len(png_data)} bytes")
                    pos = png_end + 8
                    continue
                except:
                    pass
        
        pos = png_start + 1
    
    return images

def extract_images_from_rtf_binary(rtf_bytes: bytes):
    """
    Extract images from RTF binary content.
    RTF images are typically stored as binary data blocks.
    """
    images = find_binary_blocks(rtf_bytes)
    
    # Also try looking for \bin patterns
    # RTF uses \bin[N] to indicate N bytes of binary data
    rtf_text = rtf_bytes.decode('latin-1', errors='ignore')
    bin_pattern = r'\\bin(\d+)'
    bin_matches = list(re.finditer(bin_pattern, rtf_text))
    
    for match in bin_matches:
        length = int(match.group(1))
        start_pos = match.end()
        # Skip whitespace
        while start_pos < len(rtf_text) and rtf_text[start_pos] in ' \t\n\r':
            start_pos += 1
        
        if start_pos + length <= len(rtf_bytes):
            binary_data = rtf_bytes[start_pos:start_pos + length]
            # Check if it's an image
            if binary_data[:2] == b'\xff\xd8' or binary_data[:8] == b'\x89PNG\r\n\x1a\n':
                try:
                    img = Image.open(BytesIO(binary_data))
                    images.append(binary_data)
                    logger.info(f"Found image via \\bin pattern: {len(binary_data)} bytes")
                except:
                    pass
    
    return images

def extract_pict_images(rtf_bytes: bytes, rtf_text: str):
    """
    Extract images from RTF \pict groups.
    RTF \pict can contain:
    - JPEG: \jpegblip
    - PNG: \pngblip  
    - WMF/EMF: \wmetafile
    - Binary data after \bin[N]
    """
    images = []
    
    # Find all \pict groups
    # Pattern: {\pict...} where ... can contain various formats
    pict_pattern = r'\\pict[^}]*?}'
    pict_matches = list(re.finditer(pict_pattern, rtf_text, re.DOTALL))
    
    logger.info(f"Found {len(pict_matches)} \\pict groups")
    
    for i, match in enumerate(pict_matches):
        pict_text = match.group(0)
        pict_start = match.start()
        
        # Look for \jpegblip or \pngblip
        if '\\jpegblip' in pict_text or 'jpeg' in pict_text.lower():
            # Find binary data after this pict group
            # Binary data might be in \bin[N] format or directly after
            # Look for \bin pattern after this pict
            remaining_text = rtf_text[pict_start + len(pict_text):pict_start + len(pict_text) + 1000]
            bin_match = re.search(r'\\bin(\d+)', remaining_text)
            
            if bin_match:
                length = int(bin_match.group(1))
                bin_start = pict_start + len(pict_text) + bin_match.end()
                # Skip whitespace
                while bin_start < len(rtf_text) and rtf_text[bin_start] in ' \t\n\r':
                    bin_start += 1
                
                if bin_start + length <= len(rtf_bytes):
                    binary_data = rtf_bytes[bin_start:bin_start + length]
                    try:
                        img = Image.open(BytesIO(binary_data))
                        images.append(binary_data)
                        logger.info(f"Found JPEG via \\pict + \\bin: {len(binary_data)} bytes")
                    except:
                        pass
        
        # Also try to find binary data directly in the pict group
        # Sometimes binary data is embedded as hex in the text
        hex_pattern = r'([0-9a-fA-F]{200,})'
        hex_matches = re.finditer(hex_pattern, pict_text)
        for hex_match in hex_matches:
            hex_data = hex_match.group(1)
            hex_data = re.sub(r'[^0-9a-fA-F]', '', hex_data)
            if len(hex_data) > 200:
                try:
                    image_bytes = bytes.fromhex(hex_data)
                    if image_bytes[:2] == b'\xff\xd8' or image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
                        try:
                            img = Image.open(BytesIO(image_bytes))
                            images.append(image_bytes)
                            logger.info(f"Found image in \\pict hex: {len(image_bytes)} bytes")
                        except:
                            pass
                except:
                    pass
    
    return images

def extract_images_from_rtf(rtf_content: str):
    """
    Extract images from RTF text content (for hex-encoded data).
    """
    images = []
    
    # Pattern: \pict groups with binary data (hex encoded)
    # Format: {\pict\wmetafile8\picw[N]\pich[N] [hex data]}
    pict_pattern = r'\\pict[^}]*?([0-9a-fA-F\s]+)'
    pict_matches = re.finditer(pict_pattern, rtf_content, re.DOTALL)
    
    for match in pict_matches:
        hex_data = match.group(1)
        # Clean hex data
        hex_data = re.sub(r'[^0-9a-fA-F]', '', hex_data)
        if len(hex_data) > 100:  # Minimum size for an image
            try:
                # Convert hex to bytes
                image_bytes = bytes.fromhex(hex_data)
                # Check if it starts with image signature
                if image_bytes[:2] == b'\xff\xd8' or image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
                    try:
                        img = Image.open(BytesIO(image_bytes))
                        images.append(image_bytes)
                        logger.info(f"Found image (hex): {len(image_bytes)} bytes, format: {img.format}")
                    except:
                        pass
            except Exception as e:
                pass
    
    return images

def find_images_after_fotos_header(rtf_bytes: bytes, rtf_text: str, max_images=4):
    """
    Find the "Foto's" header and extract images that come after it.
    Returns the first max_images found after the header.
    """
    # Look for "Foto's" header (case insensitive, with possible variations)
    # Try different patterns: Foto's, Fotos, Foto, etc.
    fotos_patterns = [
        r'Foto[\'s]*',
        r'FOTO[\'S]*',
        r'foto[\'s]*',
        r'Fotos',
        r'FOTOS',
        r'fotos'
    ]
    
    fotos_match = None
    for pattern in fotos_patterns:
        fotos_match = re.search(pattern, rtf_text, re.IGNORECASE)
        if fotos_match:
            logger.info(f"Found 'Foto's' header at position {fotos_match.start()} using pattern: {pattern}")
            break
    
    if not fotos_match:
        logger.warning("'Foto's' header not found in RTF file")
        return []
    
    # Get content after "Foto's" header
    start_pos = fotos_match.end()
    
    # Take a reasonable chunk after the header (first property section)
    # Look for next major section break or take first 200KB
    remaining = rtf_text[start_pos:]
    
    # Try to find end of first property (next address or large section break)
    address_pattern = r'([A-Za-zÀ-ÿ\.\-\' ]+)\s+(\d+(\s+[A-Za-z0-9]+)?)\s*,\s*(\d{4}\s?[A-Z]{2})'
    next_address = re.search(address_pattern, remaining[10000:])  # Skip first 10KB to avoid false matches
    
    if next_address:
        # First property section ends at next address
        section_end = start_pos + 10000 + next_address.start()
        section_content = rtf_text[start_pos:section_end]
        logger.info(f"Found next address at position {section_end}, extracting from section of {len(section_content)} chars")
    else:
        # Take first 200KB after "Foto's"
        section_content = rtf_text[start_pos:start_pos + 200000]
        logger.info(f"No next address found, extracting from first 200KB after 'Foto's' header")
    
    # Extract images from this section using \pict extraction
    images = extract_pict_images_from_section(rtf_bytes, rtf_text, section_content, start_pos)
    
    # Return first max_images
    return images[:max_images]

def extract_pict_images_from_section(rtf_bytes: bytes, rtf_full: str, section_content: str, section_start: int):
    """
    Extract images from a specific section of RTF content.
    Returns images in order they appear.
    """
    images = []
    
    # Find all \pict groups in this section
    pict_pattern = r'\\pict[^}]*?}'
    pict_matches = list(re.finditer(pict_pattern, section_content, re.DOTALL))
    
    logger.info(f"Found {len(pict_matches)} \\pict groups in section after 'Foto's' header")
    
    for match in pict_matches:
        pict_text = match.group(0)
        pict_abs_start = section_start + match.start()
        
        # Look for hex-encoded image data in the pict group
        hex_pattern = r'([0-9a-fA-F]{200,})'
        hex_matches = re.finditer(hex_pattern, pict_text)
        
        for hex_match in hex_matches:
            hex_data = hex_match.group(1)
            hex_data = re.sub(r'[^0-9a-fA-F]', '', hex_data)
            if len(hex_data) > 200:
                try:
                    image_bytes = bytes.fromhex(hex_data)
                    if image_bytes[:2] == b'\xff\xd8' or image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
                        try:
                            img = Image.open(BytesIO(image_bytes))
                            images.append(image_bytes)
                            logger.info(f"Found image in section: {len(image_bytes)} bytes, format: {img.format}, size: {img.size}")
                            break  # Only take first valid image from this pict group
                        except Exception as e:
                            logger.debug(f"Failed to open image: {e}")
                            pass
                except Exception as e:
                    logger.debug(f"Failed to convert hex to bytes: {e}")
                    pass
        
        # Also check for \bin patterns after this pict group
        remaining_text = rtf_full[pict_abs_start + len(pict_text):pict_abs_start + len(pict_text) + 2000]
        bin_match = re.search(r'\\bin(\d+)', remaining_text)
        
        if bin_match:
            length = int(bin_match.group(1))
            bin_start = pict_abs_start + len(pict_text) + bin_match.end()
            # Skip whitespace
            while bin_start < len(rtf_full) and rtf_full[bin_start] in ' \t\n\r':
                bin_start += 1
            
            if bin_start + length <= len(rtf_bytes):
                binary_data = rtf_bytes[bin_start:bin_start + length]
                if binary_data[:2] == b'\xff\xd8' or binary_data[:8] == b'\x89PNG\r\n\x1a\n':
                    try:
                        img = Image.open(BytesIO(binary_data))
                        images.append(binary_data)
                        logger.info(f"Found image via \\bin: {len(binary_data)} bytes, format: {img.format}, size: {img.size}")
                    except:
                        pass
    
    return images

def create_pdf_from_images(images: list, output_path: Path):
    """Create a PDF with the extracted images in high resolution."""
    if not images:
        logger.error("No images found to create PDF")
        return False
    
    c = canvas.Canvas(str(output_path), pagesize=A4)
    page_width, page_height = A4
    
    # Smaller margin for larger images
    margin = 0.3 * inch
    available_width = page_width - 2 * margin
    available_height = page_height - 2 * margin
    
    logger.info(f"Creating PDF with {len(images)} images in high resolution")
    
    for i, image_data in enumerate(images):
        try:
            # Open image
            img = Image.open(BytesIO(image_data))
            img_width, img_height = img.size
            aspect_ratio = img_width / img_height
            
            logger.info(f"Processing image {i+1}/{len(images)}: {img_width}x{img_height} pixels, format: {img.format}")
            
            # Use 95% of available space for maximum size while maintaining aspect ratio
            max_display_width = available_width * 0.95
            max_display_height = available_height * 0.95
            
            # Calculate display size maintaining aspect ratio
            if aspect_ratio > 1:
                # Landscape - use width as constraint
                display_width = max_display_width
                display_height = display_width / aspect_ratio
                if display_height > max_display_height:
                    display_height = max_display_height
                    display_width = display_height * aspect_ratio
            else:
                # Portrait - use height as constraint
                display_height = max_display_height
                display_width = display_height * aspect_ratio
                if display_width > max_display_width:
                    display_width = max_display_width
                    display_height = display_width / aspect_ratio
            
            # Center on page (one image per page for maximum quality)
            x = (page_width - display_width) / 2
            y = (page_height - display_height) / 2
            
            # Start new page for each image (except first)
            if i > 0:
                c.showPage()
            
            # Add image with high quality settings
            img_reader = ImageReader(BytesIO(image_data))
            # Use mask='auto' for better quality with transparency
            c.drawImage(
                img_reader, 
                x, y, 
                width=display_width, 
                height=display_height, 
                preserveAspectRatio=True,
                mask='auto'
            )
            
            logger.info(f"Added image {i+1}/{len(images)} to PDF at size {display_width:.1f}x{display_height:.1f} points")
            
        except Exception as e:
            logger.error(f"Error adding image {i+1} to PDF: {e}")
            import traceback
            logger.error(traceback.format_exc())
            continue
    
    c.save()
    logger.info(f"PDF saved to: {output_path}")
    return True

def main():
    """Main function to extract images from RTF and create PDF."""
    import sys
    
    # Get RTF file path
    if len(sys.argv) > 1:
        rtf_path = Path(sys.argv[1])
    else:
        # Default to Downloads folder
        downloads_path = Path.home() / "Downloads"
        rtf_files = list(downloads_path.glob("Selectie-22102025_1210.rtf"))
        
        if not rtf_files:
            # Try to find any Selectie RTF file
            rtf_files = list(downloads_path.glob("Selectie-*.rtf"))
        
        if not rtf_files:
            logger.error(f"No RTF file found in {downloads_path}")
            logger.info("Usage: python extract_rtf_images.py <path_to_rtf_file>")
            return
        
        rtf_path = rtf_files[0]
        logger.info(f"Using RTF file: {rtf_path}")
    
    if not rtf_path.exists():
        logger.error(f"RTF file not found: {rtf_path}")
        return
    
    # Read RTF file as binary
    logger.info(f"Reading RTF file: {rtf_path}")
    try:
        with open(rtf_path, 'rb') as f:
            rtf_bytes = f.read()
        
        logger.info(f"Read {len(rtf_bytes)} bytes from RTF file")
        
    except Exception as e:
        logger.error(f"Error reading RTF file: {e}")
        return
    
    # Decode RTF text
    try:
        rtf_text = rtf_bytes.decode('latin-1', errors='ignore')
    except:
        rtf_text = rtf_bytes.decode('utf-8', errors='ignore')
    
    # First, try to find images after "Foto's" header (preferred method)
    logger.info("Looking for images after 'Foto's' header...")
    images = find_images_after_fotos_header(rtf_bytes, rtf_text, max_images=4)
    
    # If no images found after "Foto's", try other methods
    if not images:
        logger.info("No images found after 'Foto's' header, trying binary extraction...")
        images = extract_images_from_rtf_binary(rtf_bytes)
    
    if not images:
        logger.info("Trying \\pict extraction from entire file...")
        images = extract_pict_images(rtf_bytes, rtf_text)
    
    if not images:
        logger.info("Trying text-based extraction...")
        images = extract_images_from_rtf(rtf_text)
    
    if not images:
        logger.error("No images found in RTF file")
        return
    
    logger.info(f"Found {len(images)} images total")
    
    # Take only first 4 images (first property)
    if len(images) > 4:
        images = images[:4]
        logger.info(f"Using first 4 images for PDF")
    
    # Create output PDF with descriptive name
    rtf_name = rtf_path.stem
    output_path = Path("outputs") / f"{rtf_name}_first_4_images.pdf"
    output_path.parent.mkdir(exist_ok=True)
    
    # Create PDF
    success = create_pdf_from_images(images, output_path)
    
    if success:
        logger.info(f"✓ Successfully created PDF: {output_path}")
    else:
        logger.error("Failed to create PDF")

if __name__ == '__main__':
    main()

