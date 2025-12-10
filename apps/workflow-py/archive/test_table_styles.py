#!/usr/bin/env python3
"""
Test script to preview different table styles for PDF reports.
Shows 5 different modern table styles labeled A, B, C, D, E.
"""

from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT

def create_sample_table(style_name: str, style_func):
    """Create a sample table with a specific style."""
    # Sample data
    data = [
        ['Eigenschap', 'Referentie', 'Huidig pand'],
        ['Adres', 'Schipbeekstraat 40-2', 'Amstelkade 17 4'],
        ['Verkoopprijs', '€530,000', '€632,100'],
        ['Oppervlakte (m²)', '60', '62'],
        ['Kamers', '3', '3'],
        ['Slaapkamers', '1', '2'],
        ['Badkamers', '1', '1'],
        ['Bouwjaar', '1985', '1990'],
        ['Energielabel', 'A', 'B'],
        ['Tuin', 'Nee', 'Ja'],
        ['Balkon', 'Ja', 'Nee'],
        ['Terras', 'Nee', 'Ja'],
    ]
    
    table = Table(data, colWidths=[2*inch, 2*inch, 2*inch])
    table.setStyle(style_func())
    return table

def style_a_dark_modern():
    """Style A: Dark modern theme matching web app (gray-800/900)"""
    return TableStyle([
        # Header
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F2937')),  # gray-800
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 14),
        ('TOPPADDING', (0, 0), (-1, 0), 14),
        
        # Body
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
        
        # Borders - subtle
        ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#374151')),  # gray-700
        ('LINEBELOW', (0, 1), (-1, -2), 0.5, colors.HexColor('#E5E7EB')),  # gray-200
        ('LINEBELOW', (0, -1), (-1, -1), 1, colors.HexColor('#D1D5DB')),  # gray-300
        
        # Alternating rows
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
        
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),
    ])

def style_b_light_elegant():
    """Style B: Light elegant with subtle shadows"""
    return TableStyle([
        # Header
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),  # blue-500
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 14),
        ('TOPPADDING', (0, 0), (-1, 0), 14),
        
        # Body
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1F2937')),  # gray-800
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        
        # Alignment
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        
        # Borders - minimal
        ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#2563EB')),  # blue-600
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),  # gray-200
        
        # Alternating rows with subtle color
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),  # slate-50
        
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),
    ])

def style_c_minimalist():
    """Style C: Minimalist with thin borders"""
    return TableStyle([
        # Header
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),  # gray-100
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#111827')),  # gray-900
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        
        # Body
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#374151')),  # gray-700
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 9),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        
        # Alignment
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        
        # Borders - very thin
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),  # gray-300
        
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),
    ])

def style_d_colorful_gradient():
    """Style D: Colorful with gradient-like header"""
    return TableStyle([
        # Header - gradient effect (darker to lighter)
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),  # indigo-600
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 14),
        ('TOPPADDING', (0, 0), (-1, 0), 14),
        
        # Body
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1F2937')),  # gray-800
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        
        # Alignment
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        
        # Borders
        ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#4338CA')),  # indigo-700
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),  # gray-200
        
        # Alternating rows with color accent
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#EEF2FF')]),  # indigo-50
        
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),
    ])

def style_e_material_design():
    """Style E: Material Design inspired"""
    return TableStyle([
        # Header
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6366F1')),  # indigo-500
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 16),
        ('TOPPADDING', (0, 0), (-1, 0), 16),
        
        # Body
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1F2937')),  # gray-800
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        
        # Alignment
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        
        # No borders - clean look
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.HexColor('#F3F4F6')),  # gray-100
        
        # Alternating rows
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#FAFAFA')]),  # gray-50
        
        ('WORDWRAP', (0, 0), (-1, -1), 'CJK'),
    ])

def main():
    """Generate PDF with all table styles."""
    output_path = Path("outputs/table_styles_preview.pdf")
    output_path.parent.mkdir(exist_ok=True)
    
    doc = SimpleDocTemplate(str(output_path), pagesize=A4)
    story = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=20,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#111827')
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=10,
        alignment=TA_LEFT,
        textColor=colors.HexColor('#374151')
    )
    
    # Title page
    story.append(Paragraph("TABEL STIJL PREVIEW", title_style))
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("Kies een stijl (A, B, C, D of E) die je wilt gebruiken voor de PDF rapporten.", styles['Normal']))
    story.append(PageBreak())
    
    # Style A
    story.append(Paragraph("<b>STIJL A: Donker Modern (Web App Thema)</b>", subtitle_style))
    story.append(Paragraph("Donkere header (gray-800) met witte tekst, lichte body met subtiele borders", 
                          ParagraphStyle('Desc', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#666666'))))
    story.append(Spacer(1, 0.2*inch))
    story.append(create_sample_table("A", style_a_dark_modern))
    story.append(PageBreak())
    
    # Style B
    story.append(Paragraph("<b>STIJL B: Licht Elegant</b>", subtitle_style))
    story.append(Paragraph("Blauwe header, witte body, minimale borders, subtiele schaduwen", 
                          ParagraphStyle('Desc', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#666666'))))
    story.append(Spacer(1, 0.2*inch))
    story.append(create_sample_table("B", style_b_light_elegant))
    story.append(PageBreak())
    
    # Style C
    story.append(Paragraph("<b>STIJL C: Minimalistisch</b>", subtitle_style))
    story.append(Paragraph("Dunne borders, lichte header, zeer clean design", 
                          ParagraphStyle('Desc', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#666666'))))
    story.append(Spacer(1, 0.2*inch))
    story.append(create_sample_table("C", style_c_minimalist))
    story.append(PageBreak())
    
    # Style D
    story.append(Paragraph("<b>STIJL D: Kleurrijk met Gradient</b>", subtitle_style))
    story.append(Paragraph("Indigo header, witte body met indigo accenten, kleurrijke uitstraling", 
                          ParagraphStyle('Desc', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#666666'))))
    story.append(Spacer(1, 0.2*inch))
    story.append(create_sample_table("D", style_d_colorful_gradient))
    story.append(PageBreak())
    
    # Style E
    story.append(Paragraph("<b>STIJL E: Material Design</b>", subtitle_style))
    story.append(Paragraph("Indigo header, ruime padding, geen borders, Material Design geïnspireerd", 
                          ParagraphStyle('Desc', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#666666'))))
    story.append(Spacer(1, 0.2*inch))
    story.append(create_sample_table("E", style_e_material_design))
    
    # Build PDF
    doc.build(story)
    print(f"✓ Preview PDF generated: {output_path}")
    print("\nOpen het bestand en kies welke stijl (A, B, C, D of E) je wilt gebruiken!")

if __name__ == "__main__":
    main()

