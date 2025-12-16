/**
 * Generate PDF report using pdf-lib (no fontkit dependency)
 * This works in Vercel serverless environments
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CandidateProperty } from './calculateSimilarity';
import { ReferenceData } from './calculateSimilarity';

function extractStreetAndNumber(addressFull: string): string {
  if (!addressFull) return 'Onbekend adres';
  const match = addressFull.match(/^([^,]+)/);
  return match ? match[1].trim() : addressFull;
}

function formatNumberNL(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'Onbekend';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount || amount === 0) return 'Onbekend';
  return `€ ${formatNumberNL(amount)}`;
}

export async function generatePdfReportSimple(
  top15: CandidateProperty[],
  referenceData: ReferenceData
): Promise<Buffer> {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  
  // Embed standard fonts (no custom fonts needed)
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Add a page
  const page = pdfDoc.addPage([595, 842]); // A4 size in points
  
  let yPosition = 800; // Start from top
  
  // Title
  page.drawText('Vastgoedanalyse Rapport', {
    x: 50,
    y: yPosition,
    size: 24,
    font: helveticaBoldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  
  yPosition -= 40;
  
  // Date
  const dateStr = new Date().toLocaleString('nl-NL');
  page.drawText(`Gegenereerd op: ${dateStr}`, {
    x: 50,
    y: yPosition,
    size: 10,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  yPosition -= 50;
  
  // Reference property section
  page.drawText('Referentie Object', {
    x: 50,
    y: yPosition,
    size: 16,
    font: helveticaBoldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  
  yPosition -= 25;
  
  const referenceAddress = extractStreetAndNumber(referenceData.address_full);
  const referencePrice = referenceData.price || 0;
  const referenceArea = referenceData.area_m2 || 0;
  const referenceBedrooms = referenceData.bedrooms || 0;
  const referenceRooms = referenceData.rooms || 0;
  const referenceEnergyLabel = referenceData.energy_label || 'Onbekend';
  
  const refLines = [
    `Adres: ${referenceAddress}`,
    `Vraagprijs: ${formatCurrency(referencePrice)}`,
    `Oppervlakte: ${formatNumberNL(referenceArea)} m²`,
    `Slaapkamers: ${referenceBedrooms}`,
    `Kamers: ${referenceRooms}`,
    `Energielabel: ${referenceEnergyLabel}`,
  ];
  
  for (const line of refLines) {
    if (yPosition < 100) {
      // Add new page if needed
      const newPage = pdfDoc.addPage([595, 842]);
      yPosition = 800;
    }
    page.drawText(line, {
      x: 70,
      y: yPosition,
      size: 11,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    yPosition -= 18;
  }
  
  yPosition -= 20;
  
  // Top 15 matches section
  if (yPosition < 200) {
    const newPage = pdfDoc.addPage([595, 842]);
    yPosition = 800;
  }
  
  page.drawText('Top 15 Vergelijkbare Objecten', {
    x: 50,
    y: yPosition,
    size: 16,
    font: helveticaBoldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  
  yPosition -= 30;
  
  // Table header
  const headerY = yPosition;
  page.drawText('#', { x: 50, y: headerY, size: 10, font: helveticaBoldFont, color: rgb(1, 1, 1) });
  page.drawText('Adres', { x: 80, y: headerY, size: 10, font: helveticaBoldFont, color: rgb(1, 1, 1) });
  page.drawText('Prijs', { x: 300, y: headerY, size: 10, font: helveticaBoldFont, color: rgb(1, 1, 1) });
  page.drawText('Opp.', { x: 400, y: headerY, size: 10, font: helveticaBoldFont, color: rgb(1, 1, 1) });
  page.drawText('Similariteit', { x: 480, y: headerY, size: 10, font: helveticaBoldFont, color: rgb(1, 1, 1) });
  
  yPosition -= 20;
  
  // Table rows
  for (let i = 0; i < top15.length; i++) {
    if (yPosition < 50) {
      // Add new page if needed
      const newPage = pdfDoc.addPage([595, 842]);
      yPosition = 800;
      
      // Redraw header on new page
      page.drawText('#', { x: 50, y: yPosition, size: 10, font: helveticaBoldFont, color: rgb(0, 0, 0) });
      page.drawText('Adres', { x: 80, y: yPosition, size: 10, font: helveticaBoldFont, color: rgb(0, 0, 0) });
      page.drawText('Prijs', { x: 300, y: yPosition, size: 10, font: helveticaBoldFont, color: rgb(0, 0, 0) });
      page.drawText('Opp.', { x: 400, y: yPosition, size: 10, font: helveticaBoldFont, color: rgb(0, 0, 0) });
      page.drawText('Similariteit', { x: 480, y: yPosition, size: 10, font: helveticaBoldFont, color: rgb(0, 0, 0) });
      yPosition -= 20;
    }
    
    const prop = top15[i];
    const address = extractStreetAndNumber(prop.address_full);
    const price = formatCurrency(prop.rw_sale_price);
    const area = formatNumberNL(prop.rw_area_m2);
    const similarity = `${(prop.similarity_score * 100).toFixed(1)}%`;
    
    // Truncate address if too long
    const displayAddress = address.length > 30 ? address.substring(0, 27) + '...' : address;
    
    page.drawText(String(i + 1), { x: 50, y: yPosition, size: 9, font: helveticaFont, color: rgb(0, 0, 0) });
    page.drawText(displayAddress, { x: 80, y: yPosition, size: 9, font: helveticaFont, color: rgb(0, 0, 0) });
    page.drawText(price, { x: 300, y: yPosition, size: 9, font: helveticaFont, color: rgb(0.9, 0.2, 0.2) });
    page.drawText(area, { x: 400, y: yPosition, size: 9, font: helveticaFont, color: rgb(0, 0, 0) });
    page.drawText(similarity, { x: 480, y: yPosition, size: 9, font: helveticaFont, color: rgb(0.2, 0.7, 0.2) });
    
    yPosition -= 15;
  }
  
  // Footer
  yPosition -= 30;
  if (yPosition < 50) {
    const newPage = pdfDoc.addPage([595, 842]);
    yPosition = 800;
  }
  
  page.drawText('Dit rapport is automatisch gegenereerd door de Vastgoedanalyse Tool', {
    x: 50,
    y: yPosition,
    size: 9,
    font: helveticaFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  // Serialize the PDF to bytes
  const pdfBytes = await pdfDoc.save();
  
  return Buffer.from(pdfBytes);
}

