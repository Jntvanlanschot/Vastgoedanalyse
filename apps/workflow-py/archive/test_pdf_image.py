#!/usr/bin/env python3
"""Test script to verify PDF image rendering works."""

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image
from io import BytesIO

# Create a simple test image
img = Image.new('RGB', (200, 200), color='red')
img_buffer = BytesIO()
img.save(img_buffer, format='JPEG')
img_buffer.seek(0)

# Create PDF
c = canvas.Canvas("outputs/test_image.pdf", pagesize=A4)
page_width, page_height = A4

# Draw test image
img_reader = ImageReader(img_buffer)
c.drawImage(img_reader, 100, 100, width=200, height=200)

# Also draw a rectangle to verify PDF works
c.setFillColorRGB(0, 1, 0)
c.rect(100, 350, 200, 50, fill=1, stroke=0)

c.save()
print("Test PDF created: outputs/test_image.pdf")


