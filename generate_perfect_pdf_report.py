#!/usr/bin/env python3
"""
Generate PDF report from PERFECT top 15 data.
"""

import pandas as pd
import logging
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Reference data
REFERENCE_ADDRESS = "Eerste Laurierdwarsstraat 19"
REFERENCE_DATA = {
    'address_full': "Eerste Laurierdwarsstraat 19, 1016 PV Amsterdam",
    'area_m2': 120,
    'energy_label': 'A',
    'bedrooms': 3,
    'bathrooms': 2,
    'rooms': 4,
    'has_terrace': True,
    'has_balcony': False,
    'has_garden': False,
}

def create_comparison_table(house_data: dict) -> Table:
    """Create comparison table for a single house."""
    
    # Prepare data
    data = [
        ['Eigenschap', 'Referentie', 'Huidig pand'],
        ['Adres', REFERENCE_ADDRESS, house_data['address']],
        ['Verkoopprijs', 'Onbekend', f"€{house_data['sale_price']:,.0f}" if house_data['sale_price'] > 0 else 'Onbekend'],
        ['Oppervlakte (m²)', f"{REFERENCE_DATA['area_m2']}", f"{int(house_data['area_m2'])}" if house_data['area_m2'] > 0 else 'Onbekend'],
        ['Kamers', f"{REFERENCE_DATA['rooms']}", f"{int(house_data['rooms'])}" if house_data['rooms'] > 0 else 'Onbekend'],
        ['Slaapkamers', f"{REFERENCE_DATA['bedrooms']}", f"{int(house_data['bedrooms'])}" if house_data['bedrooms'] > 0 else 'Onbekend'],
        ['Badkamers', f"{REFERENCE_DATA['bathrooms']}", f"{int(house_data['bathrooms'])}" if house_data['bathrooms'] > 0 else 'Onbekend'],
        ['Bouwjaar', 'Onbekend', f"{int(house_data['year_built'])}" if house_data['year_built'] > 0 else 'Onbekend'],
        ['Energielabel', REFERENCE_DATA['energy_label'], house_data['energy_label'] if house_data['energy_label'] != 'nan' else 'ONBEKEND'],
        ['Tuin', 'Nee', 'Ja' if house_data['has_garden'] else 'Nee'],
        ['Balkon', 'Nee', 'Ja' if house_data['has_balcony'] else 'Nee'],
        ['Terras', 'Ja', 'Ja' if house_data['has_terrace'] else 'Nee'],
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
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),  # Enable text wrapping
    ]))
    
    return table

def generate_perfect_pdf_report():
    """Generate PDF report from perfect top 15 data."""
    
    # Load perfect top 15 data
    df = pd.read_csv('outputs/top15_perfect_matches.csv')
    logger.info(f"Loaded {len(df)} houses from perfect top 15 data")
    
    # Create PDF
    output_file = 'outputs/top15_perfect_report.pdf'
    doc = SimpleDocTemplate(output_file, pagesize=A4)
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
    
    # Calculate and show advice price
    valid_prices = []
    for i, row in df.iterrows():
        sale_price = row.get('rw_sale_price', 0)
        area_m2 = row.get('rw_area_m2', 0)
        if pd.notna(sale_price) and sale_price > 0 and pd.notna(area_m2) and area_m2 > 0:
            valid_prices.append(sale_price / area_m2)
    
    if valid_prices:
        avg_price = sum(valid_prices) / len(valid_prices)
        advice_price = avg_price * REFERENCE_DATA['area_m2']
        story.append(Paragraph(f"BEREKENDE ADVIESPRIJS: €{advice_price:,.0f}", subtitle_style))
        story.append(Paragraph(f"(Gemiddelde prijs per m²: €{avg_price:,.0f} × {REFERENCE_DATA['area_m2']}m²)", styles['Normal']))
    
    story.append(Spacer(1, 20))
    
    # Overview table
    overview_data = [['#', 'Adres', 'Verkoopprijs', 'Oppervlakte (m²)', 'Score']]
    
    for i, row in df.iterrows():
        address = f"{row['address/street_name']} {row['address/house_number']}{row['address/house_number_suffix']}"
        sale_price = f"€{row.get('rw_sale_price', 0):,.0f}" if row.get('rw_sale_price', 0) > 0 else 'Onbekend'
        area = f"{int(row.get('rw_area_m2', 0))}" if pd.notna(row.get('rw_area_m2')) and row.get('rw_area_m2', 0) > 0 else 'Onbekend'
        score = f"{row.get('final_score', 0):.2f}"
        
        overview_data.append([str(i+1), address, sale_price, area, score])
    
    overview_table = Table(overview_data, colWidths=[0.5*inch, 3*inch, 1.5*inch, 1.6*inch, 0.8*inch])
    overview_table.setStyle(TableStyle([
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
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),  # Enable text wrapping
    ]))
    
    story.append(overview_table)
    story.append(PageBreak())
    
    # Individual property pages
    for i, row in df.iterrows():
        # Property info page
        address = f"{row['address/street_name']} {row['address/house_number']}{row['address/house_number_suffix']}"
        
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
        
        # Comparison table
        comparison_table = create_comparison_table(house_data)
        story.append(comparison_table)
        
        # Funda link
        funda_link = f"https://www.funda.nl{row['object_detail_page_relative_url']}" if pd.notna(row['object_detail_page_relative_url']) else 'Geen link beschikbaar'
        story.append(Spacer(1, 20))
        story.append(Paragraph(f"<b>Bekijk op Funda:</b> {funda_link}", styles['Normal']))
        
        story.append(PageBreak())
    
    # Build PDF
    doc.build(story)
    logger.info(f"Perfect PDF report saved to: {output_file}")
    
    print("\n=== PERFECT PDF RAPPORT GEGENEREERD ===")
    print(f"Bestand: {output_file}")
    print(f"Aantal woningen: {len(df)}")
    print(f"Gemiddelde prijs per m²: €{avg_price:,.0f}")
    
    return output_file

if __name__ == "__main__":
    generate_perfect_pdf_report()
