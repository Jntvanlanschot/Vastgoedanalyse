#!/usr/bin/env python3
"""Test PDF creation with the debug images to see if they render correctly."""

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image
from pathlib import Path
from io import BytesIO

# Load debug images
debug_images = [
    "outputs/debug_2857502824.png",
    "outputs/debug_2857502836.png",
    "outputs/debug_2857502852.png",
    "outputs/debug_2857502864.png"
]

c = canvas.Canvas("outputs/test_debug_images.pdf", pagesize=A4)
page_width, page_height = A4

margin = 0.3 * 72  # 0.3 inch in points
gap = 0.15 * 72
available_width = page_width - 2 * margin
image_width = (available_width - 3 * gap) / 4
image_height = 200  # Fixed height

print(f"Page size: {page_width}x{page_height}")
print(f"Image size: {image_width}x{image_height}")

for i, img_path in enumerate(debug_images):
    if not Path(img_path).exists():
        print(f"ERROR: {img_path} not found")
        continue
    
    print(f"\nProcessing {Path(img_path).name}...")
    
    # Load and process image
    img = Image.open(img_path)
    print(f"  Original: {img.size}, mode: {img.mode}, format: {img.format}")
    
    # Convert RGBA to RGB
    if img.mode == 'RGBA':
        rgb_img = Image.new('RGB', img.size, (255, 255, 255))
        rgb_img.paste(img, mask=img.split()[3])
        img = rgb_img
        print(f"  Converted to RGB: {img.size}, mode: {img.mode}")
    
    # Resize
    img_resized = img.resize((int(image_width), int(image_height)), Image.Resampling.LANCZOS)
    print(f"  Resized to: {img_resized.size}")
    
    # Calculate position
    col = i % 4
    x = margin + col * (image_width + gap)
    y = page_height / 2 - image_height / 2  # Center vertically
    
    print(f"  Position: ({x:.1f}, {y:.1f})")
    
    # Draw background
    c.setFillColorRGB(0.9, 0.9, 0.9)
    c.rect(x - 2, y - 2, image_width + 4, image_height + 4, fill=1, stroke=0)
    
    # Draw image using ImageReader
    try:
        img_reader = ImageReader(img_resized)
        c.drawImage(img_reader, x, y, width=image_width, height=image_height, preserveAspectRatio=True)
        print(f"  ✓ Drew image successfully")
    except Exception as e:
        print(f"  ✗ ERROR drawing: {e}")
        import traceback
        traceback.print_exc()
        # Draw error text
        c.setFillColorRGB(1, 0, 0)
        c.setFont("Helvetica", 10)
        c.drawString(x, y, f"ERROR: {str(e)[:30]}")
    
    # Draw border
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(2)
    c.rect(x, y, image_width, image_height, fill=0, stroke=1)

c.save()
print(f"\n✓ PDF created: outputs/test_debug_images.pdf")


