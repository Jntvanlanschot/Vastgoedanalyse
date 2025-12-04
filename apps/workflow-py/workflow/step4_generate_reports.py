#!/usr/bin/env python3
"""
STEP 4: Report Generation (PDF and Excel)

This script:
1. Takes the top 15 matches from step 3
2. Generates a professional PDF report
3. Generates an Excel table with all data
4. Returns file paths for download

Input: Top 15 matches data from step 3
Output: PDF report and Excel file
"""

import json
import logging
import sys
import re
from pathlib import Path
from typing import List
import pandas as pd
import numpy as np
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.utils import ImageReader
from PIL import Image as PILImage
from io import BytesIO
import base64
import tempfile
import os

# Import energy label correction functions
try:
    from energy_label_correction import correct_price_for_energy_label
except ImportError:
    # Fallback if import fails
    def correct_price_for_energy_label(base_price, comp_label, reference_label):
        return base_price

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def extract_street_and_number(address_full):
    """
    Extract only street name and house number from full address.
    Example: 'Eerste Laurierdwarsstraat 18 B, 1016 VL Amsterdam' -> 'Eerste Laurierdwarsstraat 18 B'
    Example: 'Schipbeekstraat 40-2, 1016 VL Amsterdam' -> 'Schipbeekstraat 40-2'
    """
    if not address_full or pd.isna(address_full):
        return 'Onbekend adres'
    
    # Try to match pattern: "Street Name 123 A, postal city" or "Street Name 40-2, postal city"
    # Use regex to split on comma, then take first part (street + number + addition)
    # This preserves dashes, spaces, and letters in house number additions
    match = re.match(r'^([^,]+)', str(address_full))
    if match:
        return match.group(1).strip()
    
    return str(address_full)

def sanitize_filename(filename):
    """
    Remove or replace characters that are not allowed in filenames.
    """
    # Replace invalid characters with underscore
    invalid_chars = r'[<>:"/\\|?*]'
    sanitized = re.sub(invalid_chars, '_', filename)
    # Remove leading/trailing spaces and dots
    sanitized = sanitized.strip(' .')
    # Limit length to avoid issues
    if len(sanitized) > 200:
        sanitized = sanitized[:200]
    return sanitized

def create_comparison_table(house_data: dict, reference_data: dict = None) -> Table:
    """Create comparison table for a single house."""
    
    # Use provided reference data or defaults
    ref_data = reference_data or {
        'address_full': 'Onbekend adres',
        'area_m2': 100,
        'energy_label': 'B',
        'bedrooms': 2,
        'bathrooms': 1,
        'rooms': 3,
        'has_terrace': False,
        'has_balcony': False,
        'has_garden': False,
    }
    
    # Prepare data
    data = [
        ['Eigenschap', 'Referentie', 'Huidig pand'],
        ['Adres', extract_street_and_number(ref_data.get('address_full', 'Onbekend')),
         extract_street_and_number(house_data['address'])],
        ['Verkoopprijs', 'Onbekend', f"€{house_data['sale_price']:,.0f}" if house_data['sale_price'] > 0 else 'Onbekend'],
        ['Verkoopdatum', 'Onbekend', house_data.get('sale_date', 'Onbekend') if house_data.get('sale_date') and str(house_data.get('sale_date')) != 'nan' else 'Onbekend'],
        ['Oppervlakte (m²)', f"{ref_data.get('area_m2', 0)}", f"{int(house_data['area_m2'])}" if house_data['area_m2'] > 0 else 'Onbekend'],
        ['Kamers', f"{ref_data.get('rooms', 0)}", f"{int(house_data['rooms'])}" if house_data['rooms'] > 0 else 'Onbekend'],
        ['Slaapkamers', f"{ref_data.get('bedrooms', 0)}", f"{int(house_data['bedrooms'])}" if house_data['bedrooms'] > 0 else 'Onbekend'],
        ['Badkamers', f"{ref_data.get('bathrooms', 0)}", f"{int(house_data['bathrooms'])}" if house_data['bathrooms'] > 0 else 'Onbekend'],
        ['Bouwjaar', 'Onbekend', f"{int(house_data['year_built'])}" if house_data['year_built'] > 0 else 'Onbekend'],
        ['Energielabel', ref_data.get('energy_label', 'Onbekend'), house_data['energy_label'] if house_data['energy_label'] != 'nan' else 'ONBEKEND'],
        ['Tuin', 'Ja' if ref_data.get('has_garden', False) else 'Nee', 'Ja' if house_data['has_garden'] else 'Nee'],
        ['Balkon', 'Ja' if ref_data.get('has_balcony', False) else 'Nee', 'Ja' if house_data['has_balcony'] else 'Nee'],
        ['Terras', 'Ja' if ref_data.get('has_terrace', False) else 'Nee', 'Ja' if house_data['has_terrace'] else 'Nee'],
        ['Onderhoud binnen', 'Onbekend', house_data['maintenance_inside'] if house_data['maintenance_inside'] != 'nan' else 'Onbekend'],
        ['Onderhoud buiten', 'Onbekend', house_data['maintenance_outside'] if house_data['maintenance_outside'] != 'nan' else 'Onbekend'],
    ]
    
    table = Table(data, colWidths=[2*inch, 2*inch, 2*inch])
    table.setStyle(TableStyle([
        # Header - Stijl A: Donker Modern
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F2937')),  # gray-800
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 14),
        ('TOPPADDING', (0, 0), (-1, 0), 14),
        
        # Body - Stijl A
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F9FAFB')),  # gray-50
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#111827')),  # gray-900
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        
        # Alignment
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        
        # Borders - subtiel
        ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#374151')),  # gray-700
        ('LINEBELOW', (0, 1), (-1, -2), 0.5, colors.HexColor('#E5E7EB')),  # gray-200
        ('LINEBELOW', (0, -1), (-1, -1), 1, colors.HexColor('#D1D5DB')),  # gray-300
        
        # Alternating rows
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
        
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),
    ]))
    
    return table

def load_property_images(address_full: str, images_json_path: Path = None) -> List[PILImage.Image]:
    """
    Load images for a property from JSON file.
    Returns list of all PIL Images.
    """
    if images_json_path is None:
        # Try multiple possible paths
        possible_paths = [
            Path("outputs/realworks_perfect_data_images.json"),
            Path("outputs/realworks_perfect_data_images.json"),  # From parse_directory
            Path("outputs") / "realworks_perfect_data_images.json",  # Alternative
        ]
        images_json_path = None
        for path in possible_paths:
            if path.exists():
                images_json_path = path
                break
        
        if images_json_path is None:
            # Try to find any images JSON file in outputs
            outputs_dir = Path("outputs")
            if outputs_dir.exists():
                for json_file in outputs_dir.glob("*_images.json"):
                    images_json_path = json_file
                    break
    
    if images_json_path is None or not images_json_path.exists():
        return []
    
    try:
        with open(images_json_path, 'r') as f:
            images_data = json.load(f)
        
        if address_full in images_data:
            images_base64 = images_data[address_full]
            images = []
            for img_str in images_base64:  # All images
                img_bytes = base64.b64decode(img_str)
                pil_img = PILImage.open(BytesIO(img_bytes))
                images.append(pil_img)
            return images
    except Exception as e:
        logger.warning(f"Could not load images for {address_full}: {e}")
    
    return []

def add_images_to_story(story, images: List[PILImage.Image], max_width=7*inch, max_height=2.5*inch):
    """
    Add all images to story in rows of 4 images each.
    Returns list of temp file paths that need to be cleaned up later.
    """
    if not images:
        return []
    
    # Create temporary files for images
    temp_files = []
    try:
        for img in images:  # All images
            # Convert to RGB if needed
            if img.mode == 'RGBA':
                rgb_img = PILImage.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[3])
                img = rgb_img
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize to fit (4 images per row)
            aspect_ratio = img.width / img.height
            if aspect_ratio > 1:
                # Landscape
                width = max_width / 4 - 0.1*inch
                height = width / aspect_ratio
            else:
                # Portrait
                height = max_height / 2  # Smaller height for portrait to fit 2 rows
                width = height * aspect_ratio
            
            # Save to temp file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
            img_resized = img.resize((int(width * 150/72), int(height * 150/72)), PILImage.Resampling.LANCZOS)
            img_resized.save(temp_file.name, format='JPEG', quality=95)
            temp_file.close()
            temp_files.append((temp_file.name, width, height))
        
        # Create tables with images in rows of 4
        if temp_files:
            # Process images in chunks of 4
            images_per_row = 4
            for row_start in range(0, len(temp_files), images_per_row):
                row_images = temp_files[row_start:row_start + images_per_row]
                image_data = []
                
                for temp_path, width, height in row_images:
                    # Use ImageReader directly with the file path
                    image_data.append(Image(temp_path, width=width, height=height))
                
                # Pad to 4 images if needed (only for last row)
                if len(image_data) < 4 and row_start + images_per_row < len(temp_files):
                    # Not the last row, but incomplete - pad with spacers
                    while len(image_data) < 4:
                        image_data.append(Spacer(width=row_images[0][1], height=row_images[0][2]))
                
                # Create table: 4 columns
                img_table = Table([image_data], colWidths=[max_width/4 - 0.1*inch] * len(image_data))
                img_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ]))
                
                story.append(Spacer(1, 0.2*inch))
                story.append(img_table)
                story.append(Spacer(1, 0.2*inch))
    except Exception as e:
        logger.error(f"Error adding images to story: {e}")
        # Cleanup on error
        for temp_path, _, _ in temp_files:
            try:
                os.unlink(temp_path)
            except:
                pass
        return []
    
    # Return temp file paths for cleanup after PDF is built
    return [temp_path for temp_path, _, _ in temp_files]

def generate_reports(top15_csv_path="outputs/top15_perfect_matches_final.csv", reference_data=None):
    """
    Generate PDF and Excel reports from top 15 matches.
    
    Args:
        top15_csv_path (str): Path to top 15 matches CSV
        reference_data (dict): Reference address data
    
    Returns:
        dict: Result with generated report file paths
    """
    
    try:
        # Load top 15 data
        logger.info(f"Loading top 15 data from {top15_csv_path}")
        top15_df = pd.read_csv(top15_csv_path)
        logger.info(f"Loaded {len(top15_df)} top 15 matches")
        
        # Generate filename based on reference address
        if reference_data and isinstance(reference_data, dict):
            ref_address = reference_data.get('address_full', 'Onbekend')
            # Extract street and number for filename
            ref_address_clean = extract_street_and_number(ref_address)
            filename_base = sanitize_filename(f"Taxatierapport {ref_address_clean}")
        else:
            filename_base = "Taxatierapport Onbekend"
        
        if len(top15_df) == 0:
            logger.warning("No top 15 matches found, creating empty reports")
            # Create empty Excel file
            excel_output = Path(f'outputs/{filename_base}.xlsx')
            empty_df = pd.DataFrame(columns=['Rang', 'Adres', 'Verkoopprijs (€)', 'Oppervlakte (m²)', 'Score'])
            empty_df.to_excel(excel_output, index=False, sheet_name='Top 15 Woningen')
            
            # Create empty PDF with proper PDF structure
            pdf_output = Path(f'outputs/{filename_base}.pdf')
            create_empty_pdf(pdf_output, reference_data)
            
            return {
                "status": "success",
                "message": "Generated empty reports (no data available)",
                "pdf_file": str(pdf_output),
                "excel_file": str(excel_output),
                "total_properties": 0,
                "avg_price_per_m2": 0,
                "score_range": {"highest": 0, "lowest": 0}
            }
        
        # Generate Excel report with custom filename
        excel_output = Path(f'outputs/{filename_base}.xlsx')
        
        # Create Excel table using pandas
        excel_df = top15_df.copy()
        excel_df['rank'] = range(1, len(excel_df) + 1)
        
        # Reorder columns for better presentation
        columns_order = [
            'rank', 'address_full', 'rw_sale_price', 'rw_area_m2', 'rw_energy_label',
            'rw_bedrooms', 'rw_bathrooms', 'rw_year_built', 'rw_has_garden',
            'rw_maintenance_inside', 'rw_maintenance_outside', 'final_score'
        ]
        
        # Only include columns that exist
        available_columns = [col for col in columns_order if col in excel_df.columns]
        excel_df = excel_df[available_columns]
        
        # Rename columns for better readability
        column_names = {
            'rank': 'Rang',
            'address_full': 'Adres',
            'rw_sale_price': 'Verkoopprijs (€)',
            'rw_area_m2': 'Oppervlakte (m²)',
            'rw_energy_label': 'Energielabel',
            'rw_bedrooms': 'Slaapkamers',
            'rw_bathrooms': 'Badkamers',
            'rw_year_built': 'Bouwjaar',
            'rw_has_garden': 'Tuin',
            'rw_maintenance_inside': 'Onderhoud Binnen',
            'rw_maintenance_outside': 'Onderhoud Buiten',
            'final_score': 'Score'
        }
        
        excel_df = excel_df.rename(columns=column_names)
        
        # Save Excel file
        excel_df.to_excel(excel_output, index=False, sheet_name='Top 15 Woningen')
        logger.info(f"Saved Excel report to {excel_output}")
        
        # Generate PDF report with custom filename
        pdf_output = Path(f'outputs/{filename_base}.pdf')
        
        # Create PDF using reportlab
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        
        doc = SimpleDocTemplate(str(pdf_output), pagesize=A4)
        story = []
        
        # Define styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#1F2937'),  # gray-800 - matching web app
            fontName='Helvetica-Bold'
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#6B7280')  # gray-500 - matching web app
        )
        
        # Title page
        story.append(Paragraph("MEEST VERGELIJKBARE PANDEN", title_style))
        story.append(Spacer(1, 10))
        
        # Initialize calculated_prices for later use in result dictionary
        calculated_prices = None
        
        # Reference property info (compacter)
        if reference_data:
            # Combine reference info in one line to save space
            ref_info = f"<b>Referentie:</b> {reference_data.get('address_full', 'Onbekend')} | {reference_data.get('area_m2', 'Onbekend')} m² | Energielabel: {reference_data.get('energy_label', 'Onbekend')}"
            story.append(Paragraph(ref_info, ParagraphStyle('RefInfo', parent=styles['Normal'], fontSize=9)))
            story.append(Spacer(1, 8))
            
            # Calculate and show advice price
            # ============================================
            # CONFIGURATIE: Prijsberekening parameters
            # Geoptimaliseerd via Bayesian Optimization (300 trials)
            # Resultaat: 54.82% within 10%, MAPE 11.52%
            # ============================================
            # Om terug te gaan naar de oude versie, zet deze waarden:
            # - PRICE_CALC_TOP_N = 10
            # - PRICE_CALC_MIN_SCORE = 0.0
            # - PRICE_CALC_USE_SCORE_SQUARED = False
            # ============================================
            try:
                from optimized_weights import PRICE_CALC_TOP_N, PRICE_CALC_MIN_SCORE, PRICE_CALC_USE_SCORE_SQUARED
            except ImportError:
                # Fallback to optimized values if import fails
                PRICE_CALC_TOP_N = 12
                PRICE_CALC_MIN_SCORE = 0.55
                PRICE_CALC_USE_SCORE_SQUARED = True
            # ============================================
            
            # Compute weighted average price per m² using match score as weight
            price_weights = []  # list of tuples (price_per_m2, weight)
            
            # Filter op minimum score en neem top N
            filtered_df = top15_df[top15_df['final_score'] >= PRICE_CALC_MIN_SCORE].head(PRICE_CALC_TOP_N)
            
            if len(filtered_df) == 0:
                # Fallback: als geen matches voldoen aan minimum score, gebruik top 5 zonder filter
                min_score_percentage = int(PRICE_CALC_MIN_SCORE * 100)
                logger.warning(f"No matches found with score >= {min_score_percentage}%, using top 5 without score filter")
                filtered_df = top15_df.head(5)
            
            min_score_percentage = int(PRICE_CALC_MIN_SCORE * 100)
            logger.info(f"Using {len(filtered_df)} properties for price calculation (top {PRICE_CALC_TOP_N}, min score: {min_score_percentage}%)")
            
            for i, row in filtered_df.iterrows():
                sale_price = row.get('rw_sale_price', 0)
                area_m2 = row.get('rw_area_m2', 0)
                score = row.get('final_score', 0)
                
                if pd.notna(sale_price) and sale_price > 0 and pd.notna(area_m2) and area_m2 > 0 and pd.notna(score) and score > 0:
                    # Apply energy label correction to normalize price to reference energy level
                    comp_label = row.get('rw_energy_label', 'Unknown')
                    ref_label = reference_data.get('energy_label', 'C') if isinstance(reference_data, dict) else 'C'
                    corrected_price = correct_price_for_energy_label(sale_price, comp_label, ref_label)
                    
                    # Calculate price per m² using energy label corrected price
                    price_per_m2 = corrected_price / area_m2
                    
                    # Apply score weighting (squared for more emphasis on high scores)
                    if PRICE_CALC_USE_SCORE_SQUARED:
                        weight = float(score) ** 2  # Score² geeft veel meer gewicht aan hoge scores
                    else:
                        weight = float(score)  # Originele lineaire weging
                    
                    price_weights.append((price_per_m2, weight))
            
            avg_price = 0
            conservative_price_per_m2 = 0
            optimistic_price_per_m2 = 0
            conservative_price = 0
            neutral_price = 0
            optimistic_price = 0
            
            if price_weights:
                # Extract all prices per m² for percentile calculation
                all_prices_per_m2 = [p for p, _ in price_weights]
                
                # Calculate weighted average (neutraal scenario)
                total_weight = sum(w for _, w in price_weights)
                if total_weight > 0:
                    avg_price = sum(p * w for p, w in price_weights) / total_weight
                else:
                    # Fallback to simple mean if weights sum to zero
                    avg_price = sum(p for p, _ in price_weights) / len(price_weights)
                
                # Calculate percentielen voor conservatief en optimistisch scenario
                # Gebaseerd op financiële literatuur: P25 (conservatief) en P75 (optimistisch)
                # Dit geeft een 50% confidence interval, wat standaard is in property valuations
                if len(all_prices_per_m2) >= 3:
                    # Gebruik numpy voor percentiel berekening
                    conservative_price_per_m2 = np.percentile(all_prices_per_m2, 25)  # 25e percentiel (P25)
                    optimistic_price_per_m2 = np.percentile(all_prices_per_m2, 75)     # 75e percentiel (P75)
                elif len(all_prices_per_m2) == 2:
                    # Bij slechts 2 waarden: gebruik min/max met 10% marge
                    conservative_price_per_m2 = min(all_prices_per_m2) * 0.90
                    optimistic_price_per_m2 = max(all_prices_per_m2) * 1.10
                else:
                    # Bij 1 waarde: gebruik ±12% (standaard range in property valuations)
                    conservative_price_per_m2 = avg_price * 0.88
                    optimistic_price_per_m2 = avg_price * 1.12
                
                area_m2_ref = reference_data.get('area_m2', 100) if isinstance(reference_data, dict) else 100
                if isinstance(area_m2_ref, (int, float)) and area_m2_ref > 0:
                    # Bereken drie scenario's
                    conservative_price = conservative_price_per_m2 * area_m2_ref
                    neutral_price = avg_price * area_m2_ref  # Neutraal scenario (gewogen gemiddelde)
                    optimistic_price = optimistic_price_per_m2 * area_m2_ref
                    
                    # Store prices for later use in result dictionary
                    calculated_prices = {
                        'conservative': round(conservative_price, 0),
                        'neutral': round(neutral_price, 0),
                        'optimistic': round(optimistic_price, 0),
                        'conservative_per_m2': round(conservative_price_per_m2, 0),
                        'neutral_per_m2': round(avg_price, 0),
                        'optimistic_per_m2': round(optimistic_price_per_m2, 0)
                    }
                    
                    # Display drie scenario's naast elkaar in een tabel (compacter)
                    price_scenarios_data = [
                        [
                            Paragraph("<b>Conservatief</b>", ParagraphStyle('PriceHeader', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER)),
                            Paragraph("<b>Neutraal</b>", ParagraphStyle('PriceHeader', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER)),
                            Paragraph("<b>Optimistisch</b>", ParagraphStyle('PriceHeader', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER))
                        ],
                        [
                            Paragraph(f"€{conservative_price:,.0f}", 
                                     ParagraphStyle('PriceValue', parent=styles['Normal'], fontSize=11, textColor=colors.HexColor('#1F2937'), alignment=TA_CENTER)),
                            Paragraph(f"€{neutral_price:,.0f}", 
                                     ParagraphStyle('PriceValue', parent=styles['Normal'], fontSize=11, textColor=colors.HexColor('#1F2937'), alignment=TA_CENTER)),
                            Paragraph(f"€{optimistic_price:,.0f}", 
                                     ParagraphStyle('PriceValue', parent=styles['Normal'], fontSize=11, textColor=colors.HexColor('#1F2937'), alignment=TA_CENTER))
                        ],
                        [
                            Paragraph(f"€{conservative_price_per_m2:,.0f}/m²", 
                                     ParagraphStyle('PricePerM2', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#6B7280'), alignment=TA_CENTER)),
                            Paragraph(f"€{avg_price:,.0f}/m²", 
                                     ParagraphStyle('PricePerM2', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#6B7280'), alignment=TA_CENTER)),
                            Paragraph(f"€{optimistic_price_per_m2:,.0f}/m²", 
                                     ParagraphStyle('PricePerM2', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#6B7280'), alignment=TA_CENTER))
                        ]
                    ]
                    
                    price_table = Table(price_scenarios_data, colWidths=[2*inch, 2*inch, 2*inch])
                    price_table.setStyle(TableStyle([
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 5),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                        ('LEFTPADDING', (0, 0), (-1, -1), 4),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                    ]))
                    
                    story.append(price_table)
                    story.append(Spacer(1, 8))
        
        # Overview table - Show price per m² instead of sale price
        # Make rows clickable with links to individual property pages
        overview_data = [['#', 'Adres', 'Prijs per m²', 'Oppervlakte', 'Verkoopdatum', 'Score']]
        
        # Create a link style for clickable addresses (invisible - no blue, no underline)
        # Enable word wrapping for long addresses
        link_style = ParagraphStyle(
            'LinkStyle',
            parent=styles['Normal'],
            textColor=colors.HexColor('#111827'),  # gray-900 - same as normal text
            underline=False,  # No underline
            alignment=TA_LEFT,
            wordWrap='CJK'  # Enable word wrapping for long text
        )
        
        ref_label = reference_data.get('energy_label', 'C') if isinstance(reference_data, dict) else 'C'
        for idx, (i, row) in enumerate(top15_df.iterrows(), start=1):
            address_full = row.get('address_full', 'Onbekend adres')
            # Extract only street + house number (no postal code or city)
            address = extract_street_and_number(address_full)
            sale_price = row.get('rw_sale_price', 0)
            area_m2 = row.get('rw_area_m2', 0)
            score = row.get('final_score', 0)
            # Try multiple possible date column names
            sale_date = row.get('sale_date', None) or row.get('rw_sale_date', None) or row.get('transport_date', None)
            
            # Calculate price per m² with energy label correction
            if sale_price > 0 and area_m2 > 0:
                comp_label = row.get('rw_energy_label', 'Unknown')
                corrected_price = correct_price_for_energy_label(sale_price, comp_label, ref_label)
                price_per_m2 = corrected_price / area_m2
                price_display = f"€{price_per_m2:,.0f}"
            else:
                price_display = 'Onbekend'
            
            # Format sale date (YYYY-MM-DD to DD-MM-YYYY)
            date_display = 'Onbekend'
            if sale_date and pd.notna(sale_date):
                try:
                    # Try parsing different date formats
                    if isinstance(sale_date, str) and sale_date.strip():
                        sale_date = sale_date.strip()
                        if '-' in sale_date:
                            parts = sale_date.split('-')
                            if len(parts) == 3 and len(parts[0]) == 4:  # YYYY-MM-DD format
                                date_display = f"{parts[2]}-{parts[1]}-{parts[0]}"  # DD-MM-YYYY
                            else:
                                date_display = sale_date
                        else:
                            date_display = sale_date
                    elif sale_date:
                        date_display = str(sale_date)
                except Exception as e:
                    logger.debug(f"Error formatting date {sale_date}: {e}")
                    date_display = 'Onbekend'
            
            # Create clickable link to property page (using bookmark anchor)
            # The bookmark will be created on the individual property page
            # Link is invisible - no blue color, no underline
            # Use same font size as other body text (10pt)
            bookmark_name = f"property_{idx}"
            clickable_address = Paragraph(
                f'<link href="#{bookmark_name}" color="#111827"><font size="10">{address}</font></link>',
                link_style
            )
            
            overview_data.append([
                str(idx),
                clickable_address,  # Clickable address
                price_display,
                f"{area_m2:.0f}" if area_m2 > 0 else 'Onbekend',
                date_display,
                f"{score:.3f}" if pd.notna(score) else '0.000'
            ])
        
        # Grotere tabel met meer ruimte (nu met verkoopdatum kolom)
        # Adres kolom is smaller gemaakt (2.2 inch) met wrapping voor lange straatnamen
        overview_table = Table(overview_data, colWidths=[0.5*inch, 2.2*inch, 1.2*inch, 0.9*inch, 1.0*inch, 0.8*inch])
        
        # Stijl A: Donker Modern thema (groter)
        table_style = TableStyle([
            # Header - Stijl A (kleinere font voor meer ruimte)
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F2937')),  # gray-800
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),  # Verkleind van 11 naar 10
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),  # Verkleind van 10 naar 8
            ('TOPPADDING', (0, 0), (-1, 0), 8),  # Verkleind van 10 naar 8
            
            # Body - Stijl A (alle tekst even groot)
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F9FAFB')),  # gray-50
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#111827')),  # gray-900
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),  # Alle body tekst 10pt
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            
            # Alignment - Adres kolom links (header en body), rest center
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),  # Default center
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),  # Adres kolom (kolom 1) links uitlijnen - header en body
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),  # Top align for wrapping text in adres column
            ('VALIGN', (1, 1), (1, -1), 'TOP'),  # Top align specifically for adres column body cells to support wrapping
            
            # Borders - subtiel
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#374151')),  # gray-700
            ('LINEBELOW', (0, 1), (-1, -2), 0.5, colors.HexColor('#E5E7EB')),  # gray-200
            ('LINEBELOW', (0, -1), (-1, -1), 1, colors.HexColor('#D1D5DB')),  # gray-300
            
            # Alternating rows
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
            
            ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),
        ])
        
        # Subtle highlight for TOP 10 (rows 1-10) - using a lighter gray instead of green
        # Only apply if we have at least 2 rows (header + at least 1 data row)
        if len(overview_data) > 1:
            max_top_row = min(10, len(overview_data) - 1)  # Don't go beyond available rows
            for row_num in range(1, max_top_row + 1):
                # Use a subtle blue-gray highlight that fits the dark theme
                table_style.add('BACKGROUND', (0, row_num), (-1, row_num), colors.HexColor('#EFF6FF'))  # blue-50
        
        # Default background for rows 11+ (only if we have more than 10 data rows)
        if len(overview_data) > 11:  # Header + 10 data rows = 11 total
            table_style.add('BACKGROUND', (0, 11), (-1, -1), colors.HexColor('#F9FAFB'))  # gray-50
        
        overview_table.setStyle(table_style)
        
        story.append(overview_table)
        story.append(PageBreak())
        
        # Individual property pages with detailed analysis
        logger.info("Generating individual property pages...")
        all_temp_image_files = []  # Collect all temp files for cleanup
        for idx, (i, row) in enumerate(top15_df.iterrows(), start=1):
            # Property info page
            address = row.get('address_full', 'Onbekend adres')
            
            # Create bookmark anchor for this property page (for linking from table)
            bookmark_name = f"property_{idx}"
            
            # Add bookmark anchor using a Paragraph with name attribute
            anchor_para = Paragraph(f'<a name="{bookmark_name}"></a>', styles['Normal'])
            story.append(anchor_para)
            
            story.append(Paragraph(f"<b>{idx}. {address}</b>", styles['Heading2']))
            story.append(Spacer(1, 20))
            
            # Property details
            sale_date = row.get('sale_date', None) or row.get('rw_sale_date', None)
            # Format sale date if available
            sale_date_formatted = 'Onbekend'
            if sale_date and pd.notna(sale_date):
                try:
                    if isinstance(sale_date, str) and sale_date.strip():
                        sale_date = sale_date.strip()
                        if '-' in sale_date:
                            parts = sale_date.split('-')
                            if len(parts) == 3 and len(parts[0]) == 4:  # YYYY-MM-DD format
                                sale_date_formatted = f"{parts[2]}-{parts[1]}-{parts[0]}"  # DD-MM-YYYY
                            else:
                                sale_date_formatted = sale_date
                        else:
                            sale_date_formatted = sale_date
                    elif sale_date:
                        sale_date_formatted = str(sale_date)
                except Exception as e:
                    logger.debug(f"Error formatting date {sale_date}: {e}")
                    sale_date_formatted = 'Onbekend'
            
            house_data = {
                'address': address,
                'sale_price': row.get('rw_sale_price', 0),
                'sale_date': sale_date_formatted,
                'area_m2': row.get('rw_area_m2', 0),
                'rooms': row.get('rw_rooms', 0),
                'bedrooms': row.get('rw_bedrooms', 0),
                'bathrooms': row.get('rw_bathrooms', 0),
                'year_built': row.get('rw_year_built', 0),
                'energy_label': row.get('rw_energy_label', 'unknown'),
                'has_garden': row.get('rw_has_garden', False),
                'has_balcony': row.get('rw_has_balcony', False),
                'has_terrace': row.get('rw_has_terrace', False),
                'maintenance_inside': row.get('rw_maintenance_inside', 'unknown'),
                'maintenance_outside': row.get('rw_maintenance_outside', 'unknown'),
            }
            
            # Create comparison table
            comparison_table = create_comparison_table(house_data, reference_data)
            story.append(comparison_table)
            
            # Add similarity score
            score = row.get('final_score', 0)
            story.append(Spacer(1, 20))
            story.append(Paragraph(f"<b>Match Score:</b> {score:.3f}", styles['Normal']))
            
            # Price per m² analysis
            if house_data['sale_price'] > 0 and house_data['area_m2'] > 0:
                price_per_m2 = house_data['sale_price'] / house_data['area_m2']
                story.append(Paragraph(f"<b>Prijs per m²:</b> €{price_per_m2:,.0f}", styles['Normal']))
                
                # Compare with reference property
                if reference_data and isinstance(reference_data, dict) and reference_data.get('area_m2', 0) > 0:
                    area_m2 = reference_data.get('area_m2', 0)
                    if isinstance(area_m2, (int, float)) and area_m2 > 0:
                        estimated_value = price_per_m2 * area_m2
                        story.append(Paragraph(f"<b>Geschatte waarde referentie woning:</b> €{estimated_value:,.0f}", styles['Normal']))
            
            # End of first page (property info)
            story.append(PageBreak())
            
            # Second page: All photos
            # Try to find images JSON file
            images_json_path = None
            outputs_dir = Path("outputs")
            if outputs_dir.exists():
                # Look for any images JSON file
                for json_file in outputs_dir.glob("*_images.json"):
                    images_json_path = json_file
                    break
            
            property_images = load_property_images(address, images_json_path)
            if property_images:
                # Page header for photos
                story.append(Paragraph(f"<b>{address}</b>", styles['Heading2']))
                story.append(Paragraph("<b>Foto's:</b>", styles['Heading3']))
                story.append(Spacer(1, 0.2*inch))
                
                # Add all images
                temp_image_files = add_images_to_story(story, property_images) or []
                all_temp_image_files.extend(temp_image_files)
            else:
                # No images - add placeholder
                story.append(Paragraph(f"<b>{address}</b>", styles['Heading2']))
                story.append(Paragraph("<b>Foto's:</b> Geen foto's beschikbaar", styles['Normal']))
            
            story.append(PageBreak())
        
        # Build PDF
        try:
            doc.build(story)
            logger.info(f"Saved PDF report to {pdf_output}")
        except Exception as e:
            logger.error(f"Error building PDF: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
        
        # Cleanup temp image files after PDF is built
        for temp_path in all_temp_image_files:
            try:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
            except Exception as e:
                logger.debug(f"Could not delete temp file {temp_path}: {e}")
        
        # Calculate summary statistics (ONLY using TOP 10 for price calculation!)
        avg_price_per_m2 = 0
        if 'rw_sale_price' in top15_df.columns and 'rw_area_m2' in top15_df.columns:
            valid_prices = []
            top10_df = top15_df.head(10)  # Only use top 10 for price calculation
            ref_label = reference_data.get('energy_label', 'C') if isinstance(reference_data, dict) else 'C'
            for _, row in top10_df.iterrows():
                sale_price = row.get('rw_sale_price', 0)
                area_m2 = row.get('rw_area_m2', 0)
                if pd.notna(sale_price) and sale_price > 0 and pd.notna(area_m2) and area_m2 > 0:
                    # Apply energy label correction to normalize price to reference energy level
                    comp_label = row.get('rw_energy_label', 'Unknown')
                    corrected_price = correct_price_for_energy_label(sale_price, comp_label, ref_label)
                    valid_prices.append(corrected_price / area_m2)
            
            if valid_prices:
                avg_price_per_m2 = sum(valid_prices) / len(valid_prices)
        
        # Prepare result
        result = {
            "status": "success",
            "message": f"Successfully generated reports for {len(top15_df)} properties",
            "pdf_file": str(pdf_output),
            "excel_file": str(excel_output),
            "total_properties": len(top15_df),
            "avg_price_per_m2": round(avg_price_per_m2, 0),
            "score_range": {
                "highest": round(top15_df['final_score'].max(), 3),
                "lowest": round(top15_df['final_score'].min(), 3)
            }
        }
        
        # Add three scenario prices if they were calculated
        if calculated_prices is not None:
            result["price_scenarios"] = calculated_prices
        
        logger.info(f"Generated reports: PDF ({pdf_output}) and Excel ({excel_output})")
        
        return result
        
    except Exception as e:
        logger.error(f"Error generating reports: {e}")
        return {
            "status": "error",
            "message": str(e),
            "pdf_file": None,
            "excel_file": None
        }

def main():
    """Main function for command line usage."""
    if len(sys.argv) < 2:
        print("Usage: python step4_generate_reports.py <top15_csv_path> [reference_data.json]")
        sys.exit(1)
    
    top15_csv_path = sys.argv[1]
    reference_data = None
    
    if len(sys.argv) >= 3:
        reference_file = sys.argv[2]
        try:
            with open(reference_file, 'r', encoding='utf-8') as f:
                reference_data = json.load(f)
        except Exception as e:
            logger.warning(f"Could not load reference data: {e}")
    
    try:
        result = generate_reports(top15_csv_path, reference_data)
        
        # Save result
        with open('outputs/step4_result.json', 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        error_result = {
            "status": "error",
            "message": str(e),
            "pdf_file": None,
            "excel_file": None
        }
        
        with open('outputs/step4_result.json', 'w', encoding='utf-8') as f:
            json.dump(error_result, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(error_result, indent=2, ensure_ascii=False))
        sys.exit(1)

def create_empty_pdf(pdf_output, reference_data):
    """Create an empty PDF with proper structure when no data is available."""
    try:
        doc = SimpleDocTemplate(str(pdf_output), pagesize=A4)
        story = []
        
        # Define styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#1F2937'),  # gray-800 - matching web app
            fontName='Helvetica-Bold'
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#6B7280')  # gray-500 - matching web app
        )
        
        # Title page
        story.append(Paragraph("MEEST VERGELIJKBARE PANDEN", title_style))
        story.append(Spacer(1, 15))
        
        # Reference property info
        if reference_data:
            story.append(Paragraph(f"<b>Referentie Woning:</b> {reference_data.get('address_full', 'Onbekend')}", styles['Normal']))
            story.append(Paragraph(f"<b>Oppervlakte:</b> {reference_data.get('area_m2', 'Onbekend')} m²", styles['Normal']))
            story.append(Paragraph(f"<b>Energielabel:</b> {reference_data.get('energy_label', 'Onbekend')}", styles['Normal']))
            story.append(Spacer(1, 12))
        
        # No data message
        story.append(Paragraph("<b>Geen matches gevonden</b>", subtitle_style))
        story.append(Paragraph("Er zijn geen woningen gevonden die voldoen aan de zoekcriteria.", styles['Normal']))
        story.append(Paragraph("Probeer andere zoekparameters of controleer of er data beschikbaar is.", styles['Normal']))
        
        # Build PDF
        doc.build(story)
        logger.info(f"Created empty PDF report at {pdf_output}")
        
    except Exception as e:
        logger.error(f"Error creating empty PDF: {e}")
        # Create a minimal PDF as fallback
        with open(pdf_output, 'wb') as f:
            f.write(b'%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n72 720 Td\n(No data available) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000204 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n297\n%%EOF')

if __name__ == "__main__":
    main()
