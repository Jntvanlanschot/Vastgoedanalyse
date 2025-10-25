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
from pathlib import Path
import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

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
            'rw_maintenance_inside', 'rw_maintenance_outside', 'similarity_score'
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
            'similarity_score': 'Score'
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
        
        # Calculate and show advice price
        valid_prices = []
        for i, row in top15_df.iterrows():
            sale_price = row.get('rw_sale_price', 0)
            area_m2 = row.get('rw_area_m2', 0)
            if pd.notna(sale_price) and sale_price > 0 and pd.notna(area_m2) and area_m2 > 0:
                valid_prices.append(sale_price / area_m2)
        
        if valid_prices and reference_data:
            avg_price = sum(valid_prices) / len(valid_prices)
            advice_price = avg_price * reference_data.get('area_m2', 100)
            story.append(Paragraph(f"<b>BEREKENDE ADVIESPRIJS: €{advice_price:,.0f}</b>", subtitle_style))
            story.append(Paragraph(f"(Gemiddelde prijs per m²: €{avg_price:,.0f} × {reference_data.get('area_m2', 100)}m²)", styles['Normal']))
        
        story.append(Spacer(1, 20))
        
        # Overview table
        overview_data = [['#', 'Adres', 'Verkoopprijs', 'Oppervlakte (m²)', 'Score']]
        
        for i, row in top15_df.iterrows():
            address = row.get('address_full', 'Onbekend adres')
            sale_price = row.get('rw_sale_price', 0)
            area_m2 = row.get('rw_area_m2', 0)
            score = row.get('similarity_score', 0)
            
            overview_data.append([
                str(i + 1),
                address[:50] + '...' if len(address) > 50 else address,
                f"€{sale_price:,.0f}" if sale_price > 0 else 'Onbekend',
                f"{area_m2:.0f}" if area_m2 > 0 else 'Onbekend',
                f"{score:.3f}" if pd.notna(score) else '0.000'
            ])
        
        overview_table = Table(overview_data, colWidths=[0.5*inch, 3*inch, 1.2*inch, 1*inch, 0.8*inch])
        overview_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#366092')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        story.append(overview_table)
        
        # Build PDF
        doc.build(story)
        logger.info(f"Saved PDF report to {pdf_output}")
        
        # Calculate summary statistics
        avg_price_per_m2 = 0
        if 'rw_sale_price' in top15_df.columns and 'rw_area_m2' in top15_df.columns:
            valid_prices = []
            for _, row in top15_df.iterrows():
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
                "highest": round(top15_df['similarity_score'].max(), 3),
                "lowest": round(top15_df['similarity_score'].min(), 3)
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
