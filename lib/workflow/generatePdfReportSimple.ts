/**
 * Generate comprehensive PDF report using pdf-lib (no fontkit dependency)
 * This matches the structure of the Python reportlab version
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFImage } from 'pdf-lib';
import { CandidateProperty } from './calculateSimilarity';
import { ReferenceData } from './calculateSimilarity';

function extractStreetAndNumber(addressFull: string): string {
  if (!addressFull) return 'Onbekend adres';
  const match = addressFull.match(/^([^,]+)/);
  return match ? match[1].trim() : addressFull;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Onbekend';
  try {
    const str = String(dateStr).trim();
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        // YYYY-MM-DD to DD-MM-YYYY
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    return str;
  } catch {
    return 'Onbekend';
  }
}

function formatNumberNL(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'Onbekend';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount || amount === 0) return 'Onbekend';
  return `€ ${formatNumberNL(amount)}`;
}

function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return 'Onbekend';
  return value ? 'Ja' : 'Nee';
}

function formatMaintenance(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return 'Onbekend';
  if (typeof value === 'number') {
    const labels: { [key: number]: string } = {
      1: 'Uitstekend',
      2: 'Goed',
      3: 'Redelijk',
      4: 'Matig',
      5: 'Slecht',
    };
    return labels[value] || 'Onbekend';
  }
  return String(value);
}

export async function generatePdfReportSimple(
  top15: CandidateProperty[],
  referenceData: ReferenceData
): Promise<Buffer> {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  
  // Embed standard fonts
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Helper to add text with styling
  const addText = (page: PDFPage, text: string, x: number, y: number, options: {
    size?: number;
    font?: typeof helveticaFont;
    color?: typeof rgb;
    bold?: boolean;
  } = {}) => {
    const font = options.bold ? helveticaBoldFont : (options.font || helveticaFont);
    const size = options.size || 10;
    const color = options.color || rgb(0, 0, 0);
    page.drawText(text, { x, y, size, font, color });
  };

  // Title page
  let page = pdfDoc.addPage([595, 842]); // A4
  let yPos = 800;

  addText(page, 'MEEST VERGELIJKBARE PANDEN', 50, yPos, { size: 24, bold: true, color: rgb(0.12, 0.16, 0.22) });
  yPos -= 40;

  // Reference property info
  if (referenceData) {
    const refInfo = `Referentie: ${referenceData.address_full || 'Onbekend'} | ${referenceData.area_m2 || 'Onbekend'} m² | Energielabel: ${referenceData.energy_label || 'Onbekend'}`;
    addText(page, refInfo, 50, yPos, { size: 9 });
    yPos -= 30;
  }

  // Price calculation (Conservatief/Neutraal/Optimistisch)
  if (top15.length > 0 && referenceData?.area_m2) {
    const PRICE_CALC_TOP_N = 12;
    const PRICE_CALC_MIN_SCORE = 0.55;
    
    const validPrices = top15
      .filter(p => p.rw_sale_price && p.rw_area_m2 && p.rw_area_m2 > 0 && (p.final_score || p.similarity_score || 0) >= PRICE_CALC_MIN_SCORE)
      .slice(0, PRICE_CALC_TOP_N)
      .map(p => ({
        pricePerM2: (p.rw_sale_price || 0) / (p.rw_area_m2 || 1),
        score: p.final_score || p.similarity_score || 0,
      }));

    if (validPrices.length > 0) {
      // Weighted average (score squared)
      const totalWeight = validPrices.reduce((sum, p) => sum + Math.pow(p.score, 2), 0);
      const avgPricePerM2 = validPrices.reduce((sum, p) => sum + p.pricePerM2 * Math.pow(p.score, 2), 0) / totalWeight;

      // Percentiles for conservative/optimistic
      const prices = validPrices.map(p => p.pricePerM2).sort((a, b) => a - b);
      const conservativePerM2 = prices.length >= 3 
        ? prices[Math.floor(prices.length * 0.25)] 
        : avgPricePerM2 * 0.88;
      const optimisticPerM2 = prices.length >= 3 
        ? prices[Math.floor(prices.length * 0.75)] 
        : avgPricePerM2 * 1.12;

      const areaM2 = referenceData.area_m2;
      const conservativePrice = conservativePerM2 * areaM2;
      const neutralPrice = avgPricePerM2 * areaM2;
      const optimisticPrice = optimisticPerM2 * areaM2;

      // Price scenarios table
      yPos -= 20;
      addText(page, 'Conservatief', 100, yPos, { size: 9, bold: true });
      addText(page, 'Neutraal', 250, yPos, { size: 9, bold: true });
      addText(page, 'Optimistisch', 400, yPos, { size: 9, bold: true });
      yPos -= 20;
      addText(page, formatCurrency(conservativePrice), 100, yPos, { size: 11 });
      addText(page, formatCurrency(neutralPrice), 250, yPos, { size: 11 });
      addText(page, formatCurrency(optimisticPrice), 400, yPos, { size: 11 });
      yPos -= 15;
      addText(page, `€ ${formatNumberNL(Math.round(conservativePerM2))}/m²`, 100, yPos, { size: 8, color: rgb(0.42, 0.45, 0.5) });
      addText(page, `€ ${formatNumberNL(Math.round(avgPricePerM2))}/m²`, 250, yPos, { size: 8, color: rgb(0.42, 0.45, 0.5) });
      addText(page, `€ ${formatNumberNL(Math.round(optimisticPerM2))}/m²`, 400, yPos, { size: 8, color: rgb(0.42, 0.45, 0.5) });
      yPos -= 40;
    }
  }

  // Overview table
  yPos -= 20;
  addText(page, '#', 50, yPos, { size: 10, bold: true, color: rgb(1, 1, 1) });
  addText(page, 'Adres', 80, yPos, { size: 10, bold: true, color: rgb(1, 1, 1) });
  addText(page, 'Prijs per m²', 300, yPos, { size: 10, bold: true, color: rgb(1, 1, 1) });
  addText(page, 'Oppervlakte', 400, yPos, { size: 10, bold: true, color: rgb(1, 1, 1) });
  addText(page, 'Verkoopdatum', 480, yPos, { size: 10, bold: true, color: rgb(1, 1, 1) });
  addText(page, 'Score', 550, yPos, { size: 10, bold: true, color: rgb(1, 1, 1) });

  // Draw header background
  page.drawRectangle({
    x: 45,
    y: yPos - 5,
    width: 520,
    height: 20,
    color: rgb(0.12, 0.16, 0.22),
  });

  yPos -= 25;

  // Table rows
  top15.forEach((prop, index) => {
    if (yPos < 100) {
      page = pdfDoc.addPage([595, 842]);
      yPos = 800;
    }

    const bgColor = index < 10 ? rgb(0.94, 0.97, 1) : (index % 2 === 0 ? rgb(1, 1, 1) : rgb(0.98, 0.98, 0.98));
    page.drawRectangle({
      x: 45,
      y: yPos - 5,
      width: 520,
      height: 15,
      color: bgColor,
    });

    const pricePerM2 = prop.rw_sale_price && prop.rw_area_m2 && prop.rw_area_m2 > 0
      ? Math.round(prop.rw_sale_price / prop.rw_area_m2)
      : null;

    addText(page, String(index + 1), 50, yPos, { size: 10 });
    addText(page, extractStreetAndNumber(prop.address_full), 80, yPos, { size: 10 });
    addText(page, pricePerM2 ? `€ ${formatNumberNL(pricePerM2)}` : 'Onbekend', 300, yPos, { size: 10 });
    addText(page, prop.rw_area_m2 ? String(Math.round(prop.rw_area_m2)) : 'Onbekend', 400, yPos, { size: 10 });
    addText(page, formatDate(prop.rw_sale_date || prop.sale_date), 480, yPos, { size: 10 });
    addText(page, (prop.final_score || prop.similarity_score || 0).toFixed(3), 550, yPos, { size: 10 });

    yPos -= 20;
  });

  // Individual property pages
  for (let index = 0; index < top15.length; index++) {
    const prop = top15[index];
    page = pdfDoc.addPage([595, 842]);
    yPos = 800;

    // Property header
    addText(page, `${index + 1}. ${prop.address_full}`, 50, yPos, { size: 16, bold: true });
    yPos -= 40;

    // Comparison table
    const tableStartY = yPos;
    const rowHeight = 20;
    const col1X = 50;
    const col2X = 200;
    const col3X = 350;
    const tableWidth = 500;

    // Header
    page.drawRectangle({
      x: col1X - 5,
      y: yPos - 5,
      width: tableWidth,
      height: rowHeight,
      color: rgb(0.12, 0.16, 0.22),
    });
    addText(page, 'Eigenschap', col1X, yPos, { size: 10, bold: true, color: rgb(1, 1, 1) });
    addText(page, 'Referentie', col2X, yPos, { size: 10, bold: true, color: rgb(1, 1, 1) });
    addText(page, 'Huidig pand', col3X, yPos, { size: 10, bold: true, color: rgb(1, 1, 1) });
    yPos -= rowHeight;

    // Table rows
    const rows = [
      ['Adres', extractStreetAndNumber(referenceData.address_full || 'Onbekend'), extractStreetAndNumber(prop.address_full)],
      ['Verkoopprijs', 'Onbekend', formatCurrency(prop.rw_sale_price || prop.sale_price)],
      ['Verkoopdatum', 'Onbekend', formatDate(prop.rw_sale_date || prop.sale_date)],
      ['Oppervlakte (m²)', String(referenceData.area_m2 || 0), prop.rw_area_m2 ? String(Math.round(prop.rw_area_m2)) : 'Onbekend'],
      ['Kamers', String(referenceData.rooms || 0), prop.rw_rooms ? String(prop.rw_rooms) : 'Onbekend'],
      ['Slaapkamers', String(referenceData.bedrooms || 0), prop.rw_bedrooms ? String(prop.rw_bedrooms) : 'Onbekend'],
      ['Badkamers', String(referenceData.bathrooms || 0), prop.bathrooms ? String(prop.bathrooms) : 'Onbekend'],
      ['Bouwjaar', 'Onbekend', prop.rw_year_built ? String(prop.rw_year_built) : 'Onbekend'],
      ['Energielabel', referenceData.energy_label || 'Onbekend', prop.rw_energy_label || prop.energy_label || 'Onbekend'],
      ['Tuin', formatBoolean(referenceData.has_garden), formatBoolean(prop.rw_has_garden || prop.has_garden)],
      ['Balkon', formatBoolean(referenceData.has_balcony), formatBoolean(prop.rw_has_balcony || prop.has_balcony)],
      ['Terras', formatBoolean(referenceData.has_terrace), formatBoolean(prop.rw_has_terrace || prop.has_terrace)],
      ['Onderhoud binnen', 'Onbekend', formatMaintenance((prop as any).rw_maintenance_inside || (prop as any).maintenance_inside)],
      ['Onderhoud buiten', 'Onbekend', formatMaintenance((prop as any).rw_maintenance_outside || (prop as any).maintenance_outside)],
    ];

    rows.forEach((row, rowIndex) => {
      const bgColor = rowIndex % 2 === 0 ? rgb(1, 1, 1) : rgb(0.98, 0.98, 0.98);
      page.drawRectangle({
        x: col1X - 5,
        y: yPos - 5,
        width: tableWidth,
        height: rowHeight,
        color: bgColor,
      });
      addText(page, row[0], col1X, yPos, { size: 10 });
      addText(page, row[1], col2X, yPos, { size: 10 });
      addText(page, row[2], col3X, yPos, { size: 10 });
      yPos -= rowHeight;
    });

    yPos -= 20;

    // Match Score
    const score = prop.final_score || prop.similarity_score || 0;
    addText(page, `Match Score: ${score.toFixed(3)}`, 50, yPos, { size: 10, bold: true });
    yPos -= 20;

    // Price per m²
    if (prop.rw_sale_price && prop.rw_area_m2 && prop.rw_area_m2 > 0) {
      const pricePerM2 = prop.rw_sale_price / prop.rw_area_m2;
      addText(page, `Prijs per m²: ${formatCurrency(pricePerM2)}`, 50, yPos, { size: 10, bold: true });
      yPos -= 20;

      // Estimated value
      if (referenceData.area_m2 && referenceData.area_m2 > 0) {
        const estimatedValue = pricePerM2 * referenceData.area_m2;
        addText(page, `Geschatte waarde referentie woning: ${formatCurrency(estimatedValue)}`, 50, yPos, { size: 10, bold: true });
        yPos -= 30;
      }
    }

    // Photos page (if images available)
    if (prop.images && prop.images.length > 0) {
      page = pdfDoc.addPage([595, 842]);
      yPos = 800;

      addText(page, prop.address_full, 50, yPos, { size: 16, bold: true });
      yPos -= 30;
      addText(page, "Foto's:", 50, yPos, { size: 14, bold: true });
      yPos -= 30;

      // Add images (max 4 per page, 2x2 grid)
      const imagesPerPage = 4;
      const imageWidth = 250;
      const imageHeight = 180;
      const spacing = 20;

      for (let i = 0; i < Math.min(prop.images.length, imagesPerPage); i++) {
        try {
          const imageBase64 = prop.images[i];
          const imageBytes = Buffer.from(imageBase64, 'base64');
          // Try to detect image type and embed accordingly
          let image: PDFImage;
          if (imageBytes[0] === 0xFF && imageBytes[1] === 0xD8) {
            // JPEG
            image = await pdfDoc.embedJpg(imageBytes);
          } else if (imageBytes[0] === 0x89 && imageBytes[1] === 0x50) {
            // PNG
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            // Try JPEG as fallback
            image = await pdfDoc.embedJpg(imageBytes);
          }
          
          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = 50 + col * (imageWidth + spacing);
          const y = yPos - row * (imageHeight + spacing);

          page.drawImage(image, {
            x,
            y: y - imageHeight,
            width: imageWidth,
            height: imageHeight,
          });
        } catch (error) {
          console.warn(`Failed to embed image ${i} for ${prop.address_full}:`, error);
        }
      }

      // If more than 4 images, add another page
      if (prop.images.length > imagesPerPage) {
        for (let i = imagesPerPage; i < prop.images.length; i += imagesPerPage) {
          page = pdfDoc.addPage([595, 842]);
          yPos = 800;

          addText(page, prop.address_full, 50, yPos, { size: 16, bold: true });
          yPos -= 30;
          addText(page, "Foto's (vervolg):", 50, yPos, { size: 14, bold: true });
          yPos -= 30;

          for (let j = 0; j < Math.min(prop.images.length - i, imagesPerPage); j++) {
            try {
              const imageBase64 = prop.images[i + j];
              const imageBytes = Buffer.from(imageBase64, 'base64');
              // Try to detect image type and embed accordingly
              let image: PDFImage;
              if (imageBytes[0] === 0xFF && imageBytes[1] === 0xD8) {
                // JPEG
                image = await pdfDoc.embedJpg(imageBytes);
              } else if (imageBytes[0] === 0x89 && imageBytes[1] === 0x50) {
                // PNG
                image = await pdfDoc.embedPng(imageBytes);
              } else {
                // Try JPEG as fallback
                image = await pdfDoc.embedJpg(imageBytes);
              }
              
              const col = j % 2;
              const row = Math.floor(j / 2);
              const x = 50 + col * (imageWidth + spacing);
              const y = yPos - row * (imageHeight + spacing);

              page.drawImage(image, {
                x,
                y: y - imageHeight,
                width: imageWidth,
                height: imageHeight,
              });
            } catch (error) {
              console.warn(`Failed to embed image ${i + j} for ${prop.address_full}:`, error);
            }
          }
        }
      }
    } else {
      // No images - add placeholder
      page = pdfDoc.addPage([595, 842]);
      yPos = 800;
      addText(page, prop.address_full, 50, yPos, { size: 16, bold: true });
      yPos -= 30;
      addText(page, "Foto's: Geen foto's beschikbaar", 50, yPos, { size: 12 });
    }
  }

  // Serialize the PDF to bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
