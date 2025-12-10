#!/usr/bin/env python3
"""Test PDF with one of the debug images."""

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image
from pathlib import Path

# Load one of the debug images
img_path = Path("outputs/debug_2857502824.png")
if not img_path.exists():
    print(f"ERROR: {img_path} not found")
    exit(1)

img = Image.open(img_path)
print(f"Loaded image: {img.size}, format: {img.format}, mode: {img.mode}")

# Convert RGBA to RGB if needed
if img.mode == 'RGBA':
    rgb_img = Image.new('RGB', img.size, (255, 255, 255))
    rgb_img.paste(img, mask=img.split()[3])
    img = rgb_img
    print(f"Converted to RGB: {img.size}, mode: {img.mode}")

# Resize to larger size
img_resized = img.resize((270, 180), Image.Resampling.LANCZOS)
print(f"Resized to: {img_resized.size}")

# Create PDF
c = canvas.Canvas("outputs/test_debug.pdf", pagesize=A4)
page_width, page_height = A4

# Draw test image
img_reader = ImageReader(img_resized)
c.drawImage(img_reader, 100, 400, width=200, height=133, preserveAspectRatio=True)

# Also draw a rectangle to verify PDF works
c.setFillColorRGB(0, 1, 0)
c.rect(100, 300, 200, 50, fill=1, stroke=0)

# Draw text
c.setFillColorRGB(0, 0, 0)
c.setFont("Helvetica", 12)
c.drawString(100, 250, f"Image: {img_path.name} ({img.size[0]}x{img.size[1]})")

c.save()
print("Test PDF created: outputs/test_debug.pdf")


