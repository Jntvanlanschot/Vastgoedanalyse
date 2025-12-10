#!/usr/bin/env python3
"""
Extract images from HTML file and create a PDF with the first 4 images after "Foto's" header.
Reads HTML file only - does not modify it.
Works with any HTML file and any image paths.
"""

import re
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from io import BytesIO
from PIL import Image
import sys
import tempfile
import os
import requests
from urllib.parse import urljoin, urlparse

def log_print(msg):
    """Print message immediately."""
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        safe_msg = msg.encode('ascii', 'replace').decode('ascii')
        print(safe_msg, flush=True)

def extract_base_url(html_content: str):
    """Extract base URL from 'saved from url' comment if present."""
    match = re.search(r'saved from url=\([^)]+\)([^\s]+)', html_content)
    if match:
        url = match.group(1)
        # Get base URL (scheme + netloc)
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"
    return None

def find_images_in_html(html_path: Path):
    """
    Find image sources in HTML file after "Foto's" header.
    Returns list of image src attributes.
    """
    log_print(f"Reading HTML file: {html_path}")
    
    try:
        with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
            html_content = f.read()
    except Exception as e:
        log_print(f"[ERROR] Error reading HTML: {e}")
        return []
    
    log_print(f"[OK] Read {len(html_content)} characters")
    
    # Find "Foto's" header (case insensitive)
    fotos_pattern = r'Foto[\'s]*'
    fotos_match = re.search(fotos_pattern, html_content, re.IGNORECASE)
    
    if not fotos_match:
        log_print("[WARN] 'Foto's' header not found, searching entire file")
        section_content = html_content
    else:
        start_pos = fotos_match.end()
        section_content = html_content[start_pos:start_pos + 200000]
        log_print(f"[OK] Found 'Foto's' at position {start_pos}")
    
    # Find all <img> tags
    img_pattern = r'<img[^>]+src=["\']([^"\']+)["\']'
    img_matches = re.findall(img_pattern, section_content, re.IGNORECASE)
    
    log_print(f"[OK] Found {len(img_matches)} image tags")
    return img_matches[:4]  # Return first 4

def load_image(img_src: str, html_dir: Path, base_url: str = None):
    """
    Load image from local file or download from URL.
    Saves downloaded images to the correct location so HTML can use them.
    Works with any relative or absolute path.
    """
    log_print(f"  Loading: {img_src}")
    
    # Handle relative paths - normalize path separators
    img_src_normalized = img_src.replace('\\', '/').replace('./', '')
    
    # Determine target path (where image should be saved for HTML to use)
    if '/' in img_src_normalized:
        parts = img_src_normalized.split('/')
        target_folder = html_dir / '/'.join(parts[:-1])
        target_filename = parts[-1]
        target_path = target_folder / target_filename
    else:
        target_path = html_dir / img_src_normalized
        target_folder = html_dir
    
    # Try local file paths first
    local_paths = [
        html_dir / img_src_normalized,  # Relative to HTML file
        html_dir / Path(img_src_normalized).name,  # Just filename
        html_dir / img_src.replace('./', '').replace('\\', '/'),  # Original format
        target_path,  # Calculated target path
    ]
    
    # Also try common subfolder patterns
    if '/' in img_src_normalized:
        parts = img_src_normalized.split('/')
        if len(parts) > 1:
            subfolder = '/'.join(parts[:-1])
            filename = parts[-1]
            local_paths.append(html_dir / subfolder / filename)
    
    # Check if image already exists locally
    for test_path in local_paths:
        if test_path.exists():
            try:
                with open(test_path, 'rb') as f:
                    data = f.read()
                if len(data) == 0:
                    continue
                img = Image.open(BytesIO(data))
                img.verify()
                img = Image.open(BytesIO(data))
                log_print(f"  [OK] Found locally: {test_path.name} ({len(data)} bytes, {img.size[0]}x{img.size[1]} px)")
                return data
            except Exception as e:
                log_print(f"  [ERROR] Invalid image: {e}")
                continue
    
    # Try to download from various sources
    download_urls = []
    
    # If it's already a full URL
    if img_src.startswith('http://') or img_src.startswith('https://'):
        download_urls.append(img_src)
    
    # If base_url is available, try to construct full URL
    if base_url:
        download_urls.append(urljoin(base_url, img_src))
        # Also try with common Realworks patterns
        img_id = Path(img_src).stem
        download_urls.extend([
            f"{base_url}/servlets/objects/framework.download/downloadFile_files/{Path(img_src).name}",
            f"{base_url}/images/{img_id}.jpg",
        ])
    
    # Try downloading from URLs
    for url in download_urls:
        try:
            log_print(f"    Trying URL: {url}")
            response = requests.get(url, timeout=10, stream=True)
            if response.status_code == 200:
                data = response.content
                if len(data) > 100:
                    # Verify it's a valid image
                    img = Image.open(BytesIO(data))
                    img.verify()
                    img = Image.open(BytesIO(data))
                    
                    # Save to target location so HTML can use it
                    target_folder.mkdir(parents=True, exist_ok=True)
                    with open(target_path, 'wb') as f:
                        f.write(data)
                    log_print(f"  [OK] Downloaded and saved: {target_path.name} ({len(data)} bytes, {img.size[0]}x{img.size[1]} px)")
                    log_print(f"      Saved to: {target_path}")
                    return data
        except Exception as e:
            log_print(f"  [ERROR] Download failed: {e}")
            continue
    
    log_print(f"  [NOT FOUND] Could not load: {img_src}")
    return None

def create_pdf_from_images(images: list, output_path: Path):
    """Create PDF with 4 images side by side."""
    if not images:
        log_print("[ERROR] No images to create PDF")
        return False
    
    c = canvas.Canvas(str(output_path), pagesize=A4)
    page_width, page_height = A4
    
    # Layout: 4 images side by side
    margin = 0.3 * inch
    gap = 0.15 * inch
    available_width = page_width - 2 * margin
    image_width = (available_width - 3 * gap) / 4
    image_height = 4 * inch
    
    log_print(f"\nCreating PDF with {len(images)} images")
    log_print(f"Image size: {image_width:.1f}x{image_height:.1f} points")
    
    temp_files = []
    
    for i, image_data in enumerate(images):
        try:
            img = Image.open(BytesIO(image_data))
            
            # Convert to RGB if needed
            if img.mode == 'RGBA':
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[3])
                img = rgb_img
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Calculate aspect ratio and resize
            aspect_ratio = img.size[0] / img.size[1]
            if aspect_ratio > 1:
                display_width = image_width
                display_height = image_width / aspect_ratio
            else:
                display_height = image_height
                display_width = image_height * aspect_ratio
            
            # Resize image
            target_pixels = int(display_width * 150 / 72)
            target_height = int(display_height * 150 / 72)
            img_resized = img.resize((target_pixels, target_height), Image.Resampling.LANCZOS)
            
            # Save to temp file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
            img_resized.save(temp_file.name, format='JPEG', quality=95)
            temp_file.close()
            temp_files.append(temp_file.name)
            
            # Calculate position
            col = i % 4
            x = margin + col * (image_width + gap)
            y = page_height / 2 - display_height / 2
            
            # Draw image
            img_reader = ImageReader(temp_file.name)
            c.drawImage(img_reader, x, y, width=display_width, height=display_height, preserveAspectRatio=True)
            
            log_print(f"  [OK] Added image {i+1} at ({x:.1f}, {y:.1f})")
            
        except Exception as e:
            log_print(f"  [ERROR] Error processing image {i+1}: {e}")
            continue
    
    c.save()
    
    # Cleanup temp files
    for temp_file in temp_files:
        try:
            os.unlink(temp_file)
        except:
            pass
    
    log_print(f"\n[OK] PDF saved: {output_path}")
    return True

def main():
    """Main function."""
    log_print("=" * 60)
    log_print("HTML Image Extractor (Read-Only)")
    log_print("=" * 60)
    
    # Default to desktop/test.htm
    desktop_path = Path.home() / "Desktop" / "test.htm"
    
    if len(sys.argv) > 1:
        html_path = Path(sys.argv[1])
    elif desktop_path.exists():
        html_path = desktop_path
        log_print(f"Using: {html_path}")
    else:
        log_print(f"[ERROR] No HTML file found")
        log_print(f"Usage: python extract_html_images.py <path_to_html>")
        log_print(f"Or place test.htm on Desktop")
        return
    
    if not html_path.exists():
        log_print(f"[ERROR] File not found: {html_path}")
        return
    
    # Read HTML to extract base URL
    try:
        with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
            html_content = f.read()
        base_url = extract_base_url(html_content)
        if base_url:
            log_print(f"[OK] Found base URL: {base_url}")
    except:
        base_url = None
    
    # Find image sources
    log_print("\n--- Step 1: Finding images ---")
    img_sources = find_images_in_html(html_path)
    
    if not img_sources:
        log_print("[ERROR] No images found")
        return
    
    log_print(f"Image sources found:")
    for i, src in enumerate(img_sources, 1):
        log_print(f"  {i}. {src}")
    
    # Load images
    log_print(f"\n--- Step 2: Loading {len(img_sources)} images ---")
    html_dir = html_path.parent
    
    images = []
    for img_src in img_sources:
        image_data = load_image(img_src, html_dir, base_url)
        if image_data:
            images.append(image_data)
    
    if not images:
        log_print("[ERROR] No images could be loaded")
        return
    
    log_print(f"[OK] Loaded {len(images)} images")
    
    # Create PDF
    log_print(f"\n--- Step 3: Creating PDF ---")
    html_name = html_path.stem
    output_path = Path("outputs") / f"{html_name}_first_4_images.pdf"
    output_path.parent.mkdir(exist_ok=True)
    
    success = create_pdf_from_images(images, output_path)
    
    if success:
        log_print(f"\n{'=' * 60}")
        log_print(f"[SUCCESS] PDF created: {output_path}")
        log_print(f"{'=' * 60}")
    else:
        log_print("\n[ERROR] Failed to create PDF")

if __name__ == '__main__':
    main()
