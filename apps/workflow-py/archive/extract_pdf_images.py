#!/usr/bin/env python3
"""
Extract images from PDF file and create a new PDF with the first 4 images after "Foto's" section.
Works with any PDF file.
"""

import sys
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from io import BytesIO
from PIL import Image
import tempfile
import os

try:
    import fitz  # PyMuPDF
except ImportError:
    print("[ERROR] PyMuPDF not installed. Install with: pip install PyMuPDF")
    sys.exit(1)

def log_print(msg):
    """Print message immediately."""
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        safe_msg = msg.encode('ascii', 'replace').decode('ascii')
        print(safe_msg, flush=True)

def extract_images_from_pdf(pdf_path: Path):
    """
    Extract all images from PDF and find text positions.
    Returns list of images with their page numbers.
    """
    log_print(f"Reading PDF: {pdf_path}")
    
    doc = fitz.open(str(pdf_path))
    log_print(f"[OK] PDF has {len(doc)} pages")
    
    images = []
    fotos_found = False
    images_after_fotos = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # Extract text to find "Foto's" section
        text = page.get_text()
        has_fotos = "Foto" in text or "Foto's" in text or "Foto\'s" in text
        
        if has_fotos and not fotos_found:
            log_print(f"[OK] Found 'Foto's' section on page {page_num + 1}")
            fotos_found = True
        
        # Extract images from this page
        image_list = page.get_images()
        
        for img_idx, img in enumerate(image_list):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            
            # Convert to PIL Image
            try:
                pil_image = Image.open(BytesIO(image_bytes))
                
                # Only include if it's a reasonable size (not tiny icons)
                if pil_image.width > 50 and pil_image.height > 50:
                    images.append({
                        'page': page_num + 1,
                        'image': pil_image,
                        'bytes': image_bytes,
                        'ext': image_ext,
                        'after_fotos': fotos_found
                    })
            except Exception as e:
                log_print(f"  [WARN] Could not process image {img_idx} on page {page_num + 1}: {e}")
                continue
    
    doc.close()
    
    log_print(f"[OK] Extracted {len(images)} images total")
    
    # Filter images after "Foto's" section
    if fotos_found:
        images_after_fotos = [img for img in images if img['after_fotos']]
        log_print(f"[OK] Found {len(images_after_fotos)} images after 'Foto's' section")
    
    # Return first 4 images after Foto's, or first 4 images if Foto's not found
    if images_after_fotos:
        return images_after_fotos[:4]
    else:
        log_print("[WARN] 'Foto's' section not found, using first 4 images")
        return images[:4]

def create_pdf_from_images(image_list: list, output_path: Path):
    """Create PDF with 4 images side by side."""
    if not image_list:
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
    
    log_print(f"\nCreating PDF with {len(image_list)} images")
    log_print(f"Image size: {image_width:.1f}x{image_height:.1f} points")
    
    temp_files = []
    
    for i, img_data in enumerate(image_list):
        try:
            img = img_data['image']
            
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
                # Landscape
                display_width = image_width
                display_height = image_width / aspect_ratio
            else:
                # Portrait
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
            
            log_print(f"  [OK] Added image {i+1} (from page {img_data['page']}) at ({x:.1f}, {y:.1f})")
            
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
    log_print("PDF Image Extractor")
    log_print("=" * 60)
    
    # Default to desktop PDF
    desktop_path = Path.home() / "Desktop" / "crm.realworks.nl_servlets_objects_framework.download_downloadFile.pdf"
    
    if len(sys.argv) > 1:
        pdf_path = Path(sys.argv[1])
    elif desktop_path.exists():
        pdf_path = desktop_path
        log_print(f"Using: {pdf_path}")
    else:
        log_print(f"[ERROR] No PDF file found")
        log_print(f"Usage: python extract_pdf_images.py <path_to_pdf>")
        log_print(f"Or place the PDF on Desktop")
        return
    
    if not pdf_path.exists():
        log_print(f"[ERROR] File not found: {pdf_path}")
        return
    
    # Extract images
    log_print("\n--- Step 1: Extracting images from PDF ---")
    images = extract_images_from_pdf(pdf_path)
    
    if not images:
        log_print("[ERROR] No images found in PDF")
        return
    
    log_print(f"[OK] Found {len(images)} images to use")
    
    # Create PDF
    log_print(f"\n--- Step 2: Creating PDF ---")
    pdf_name = pdf_path.stem
    output_path = Path("outputs") / f"{pdf_name}_first_4_images.pdf"
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

