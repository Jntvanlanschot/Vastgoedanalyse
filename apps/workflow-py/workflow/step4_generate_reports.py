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
import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def extract_street_and_number(address_full):
    """
    Extract only street name and house number from full address.
    Example: 'Eerste Laurierdwarsstraat 18 B, 1016 VL Amsterdam' -> 'Eerste Laurierdwarsstraat 18 B'
    """
    if not address_full or pd.isna(address_full):
        return 'Onbekend adres'
    
    # Try to match pattern: "Street Name 123 A, postal city"
    # Use regex to split on comma, then take first part (street + number)
    match = re.match(r'^([^,]+)', str(address_full))
    if match:
        return match.group(1).strip()
    
    return str(address_full)

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
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#366092')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 1), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
        ('LEFTPADDING', (0, 1), (-1, -1), 6),
        ('RIGHTPADDING', (0, 1), (-1, -1), 6),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),  # Enable text wrapping in all cells
    ]))
    
    return table

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
        
        if len(top15_df) == 0:
            logger.warning("No top 15 matches found, creating empty reports")
            # Create empty Excel file
            excel_output = Path('outputs/top15_perfecte_woningen_tabel_final.xlsx')
            empty_df = pd.DataFrame(columns=['Rang', 'Adres', 'Verkoopprijs (€)', 'Oppervlakte (m²)', 'Score'])
            empty_df.to_excel(excel_output, index=False, sheet_name='Top 15 Woningen')
            
            # Create empty PDF with proper PDF structure
            pdf_output = Path('outputs/top15_perfect_report_final.pdf')
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
        
        # Generate Excel report
        excel_output = Path('outputs/top15_perfecte_woningen_tabel_final.xlsx')
        
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
        
        # Generate PDF report
        pdf_output = Path('outputs/top15_perfect_report_final.pdf')
        
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
            textColor=colors.HexColor('#366092')
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#666666')
        )
        
        # Title page
        story.append(Paragraph("TOP 15 PERFECTE WONINGMATCHES", title_style))
        story.append(Paragraph("Gebaseerd op Funda + Realworks data", subtitle_style))
        story.append(Spacer(1, 20))
        
        # Reference property info
        if reference_data:
            story.append(Paragraph(f"<b>Referentie Woning:</b> {reference_data.get('address_full', 'Onbekend')}", styles['Normal']))
            story.append(Paragraph(f"<b>Oppervlakte:</b> {reference_data.get('area_m2', 'Onbekend')} m²", styles['Normal']))
            story.append(Paragraph(f"<b>Energielabel:</b> {reference_data.get('energy_label', 'Onbekend')}", styles['Normal']))
            story.append(Spacer(1, 20))
            
            # Calculate and show advice price (ONLY using TOP 10!)
            # Compute weighted average price per m² using match score as weight
            price_weights = []  # list of tuples (price_per_m2, weight)
            top10_df = top15_df.head(10)  # Only use top 10 for price calculation
            for i, row in top10_df.iterrows():
                sale_price = row.get('rw_sale_price', 0)
                area_m2 = row.get('rw_area_m2', 0)
                score = row.get('final_score', 0)
                if pd.notna(sale_price) and sale_price > 0 and pd.notna(area_m2) and area_m2 > 0 and pd.notna(score) and score > 0:
                    price_per_m2 = sale_price / area_m2
                    price_weights.append((price_per_m2, float(score)))
            
            avg_price = 0
            if price_weights:
                total_weight = sum(w for _, w in price_weights)
                if total_weight > 0:
                    avg_price = sum(p * w for p, w in price_weights) / total_weight
                else:
                    # Fallback to simple mean if weights sum to zero
                    avg_price = sum(p for p, _ in price_weights) / len(price_weights)
                area_m2_ref = reference_data.get('area_m2', 100) if isinstance(reference_data, dict) else 100
                if isinstance(area_m2_ref, (int, float)) and area_m2_ref > 0:
                    advice_price = avg_price * area_m2_ref
                    story.append(Paragraph(f"<b>BEREKENDE ADVIESPRIJS: €{advice_price:,.0f}</b>", subtitle_style))
                    story.append(Paragraph(f"(Gebaseerd op TOP 10, gewogen op match score: Gem. prijs per m²: €{avg_price:,.0f} × {area_m2_ref:.0f}m²)", styles['Normal']))
                    story.append(Spacer(1, 20))
        
        # Overview table
        overview_data = [['#', 'Adres', 'Verkoopprijs', 'Oppervlakte (m²)', 'Score']]
        
        for idx, (i, row) in enumerate(top15_df.iterrows(), start=1):
            address_full = row.get('address_full', 'Onbekend adres')
            # Extract only street + house number (no postal code or city)
            address = extract_street_and_number(address_full)
            sale_price = row.get('rw_sale_price', 0)
            area_m2 = row.get('rw_area_m2', 0)
            score = row.get('final_score', 0)
            
            overview_data.append([
                str(idx),
                address,
                f"€{sale_price:,.0f}" if sale_price > 0 else 'Onbekend',
                f"{area_m2:.0f}" if area_m2 > 0 else 'Onbekend',
                f"{score:.3f}" if pd.notna(score) else '0.000'
            ])
        
        overview_table = Table(overview_data, colWidths=[0.5*inch, 3*inch, 1.2*inch, 1*inch, 0.8*inch])
        
        # Calculate table styles - first 10 rows get green background
        table_style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#366092')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),  # Enable text wrapping in all cells
        ])
        
        # Green background for TOP 10 (rows 1-10, index 0 is header, so 1-10)
        for row_num in range(1, 11):
            if row_num <= len(overview_data) - 1:
                table_style.add('BACKGROUND', (0, row_num), (-1, row_num), colors.HexColor('#90EE90'))
        
        # Default beige background for the rest
        table_style.add('BACKGROUND', (0, 11), (-1, -1), colors.beige)
        
        overview_table.setStyle(table_style)
        
        story.append(overview_table)
        story.append(PageBreak())
        
        # Individual property pages with detailed analysis
        logger.info("Generating individual property pages...")
        for i, row in top15_df.iterrows():
            # Property info page
            address = row.get('address_full', 'Onbekend adres')
            
            story.append(Paragraph(f"<b>{i+1}. {address}</b>", styles['Heading2']))
            story.append(Spacer(1, 20))
            
            # Property details
            house_data = {
                'address': address,
                'sale_price': row.get('rw_sale_price', 0),
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
            
            story.append(PageBreak())
        
        # Build PDF
        doc.build(story)
        logger.info(f"Saved PDF report to {pdf_output}")
        
        # Calculate summary statistics (ONLY using TOP 10 for price calculation!)
        avg_price_per_m2 = 0
        if 'rw_sale_price' in top15_df.columns and 'rw_area_m2' in top15_df.columns:
            valid_prices = []
            top10_df = top15_df.head(10)  # Only use top 10 for price calculation
            for _, row in top10_df.iterrows():
                sale_price = row.get('rw_sale_price', 0)
                area_m2 = row.get('rw_area_m2', 0)
                if pd.notna(sale_price) and sale_price > 0 and pd.notna(area_m2) and area_m2 > 0:
                    valid_prices.append(sale_price / area_m2)
            
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
            textColor=colors.HexColor('#366092')
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#666666')
        )
        
        # Title page
        story.append(Paragraph("TOP 15 PERFECTE WONINGMATCHES", title_style))
        story.append(Paragraph("Gebaseerd op Funda + Realworks data", subtitle_style))
        story.append(Spacer(1, 20))
        
        # Reference property info
        if reference_data:
            story.append(Paragraph(f"<b>Referentie Woning:</b> {reference_data.get('address_full', 'Onbekend')}", styles['Normal']))
            story.append(Paragraph(f"<b>Oppervlakte:</b> {reference_data.get('area_m2', 'Onbekend')} m²", styles['Normal']))
            story.append(Paragraph(f"<b>Energielabel:</b> {reference_data.get('energy_label', 'Onbekend')}", styles['Normal']))
            story.append(Spacer(1, 20))
        
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
