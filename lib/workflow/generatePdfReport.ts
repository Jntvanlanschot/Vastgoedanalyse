/**
 * Generate PDF report from top 15 matches
 */

import PDFDocument from 'pdfkit';
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

function formatCurrency(amount: number | null | undefined): string {
  if (!amount || amount === 0) return 'Onbekend';
  return `€ ${Math.round(amount).toLocaleString('nl-NL')}`;
}

export async function generatePdfReport(
  top15: CandidateProperty[],
  referenceData: ReferenceData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Title page
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#1F2937');
      doc.text('MEEST VERGELIJKBARE PANDEN', { align: 'center' });
      doc.moveDown(2);

      // Reference property info
      if (referenceData) {
        doc.fontSize(9).font('Helvetica').fillColor('#111827');
        const refInfo = `Referentie: ${referenceData.address_full || 'Onbekend'} | ${referenceData.area_m2 || 'Onbekend'} m² | Energielabel: ${referenceData.energy_label || 'Onbekend'}`;
        doc.text(refInfo, { align: 'center' });
        doc.moveDown(1);
      }

      // Price calculation (simplified)
      if (top15.length > 0 && referenceData?.area_m2) {
        const validPrices = top15
          .filter(p => p.rw_sale_price && p.rw_area_m2 && p.rw_area_m2 > 0)
          .slice(0, 12)
          .map(p => ({
            pricePerM2: (p.rw_sale_price || 0) / (p.rw_area_m2 || 1),
            score: p.final_score || p.similarity_score || 0,
          }))
          .filter(p => p.score >= 0.55);

        if (validPrices.length > 0) {
          // Calculate weighted average
          const totalWeight = validPrices.reduce((sum, p) => sum + Math.pow(p.score, 2), 0);
          const avgPricePerM2 = validPrices.reduce((sum, p) => sum + p.pricePerM2 * Math.pow(p.score, 2), 0) / totalWeight;

          // Calculate percentiles
          const prices = validPrices.map(p => p.pricePerM2).sort((a, b) => a - b);
          const conservative = prices.length >= 3 ? prices[Math.floor(prices.length * 0.25)] : avgPricePerM2 * 0.88;
          const optimistic = prices.length >= 3 ? prices[Math.floor(prices.length * 0.75)] : avgPricePerM2 * 1.12;

          const areaM2 = referenceData.area_m2;
          const conservativePrice = conservative * areaM2;
          const neutralPrice = avgPricePerM2 * areaM2;
          const optimisticPrice = optimistic * areaM2;

          doc.moveDown(1);
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827');
          doc.text('Prijsadvies', { align: 'center' });
          doc.moveDown(0.5);

          // Price table
          const tableTop = doc.y;
          const colWidth = 150;
          const startX = (doc.page.width - 3 * colWidth) / 2;

          // Headers
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827');
          doc.text('Conservatief', startX, tableTop, { width: colWidth, align: 'center' });
          doc.text('Neutraal', startX + colWidth, tableTop, { width: colWidth, align: 'center' });
          doc.text('Optimistisch', startX + 2 * colWidth, tableTop, { width: colWidth, align: 'center' });

          // Values
          doc.fontSize(11).font('Helvetica').fillColor('#1F2937');
          doc.text(formatCurrency(conservativePrice), startX, tableTop + 20, { width: colWidth, align: 'center' });
          doc.text(formatCurrency(neutralPrice), startX + colWidth, tableTop + 20, { width: colWidth, align: 'center' });
          doc.text(formatCurrency(optimisticPrice), startX + 2 * colWidth, tableTop + 20, { width: colWidth, align: 'center' });

          // Per m²
          doc.fontSize(8).font('Helvetica').fillColor('#6B7280');
          doc.text(`€ ${Math.round(conservative).toLocaleString('nl-NL')}/m²`, startX, tableTop + 40, { width: colWidth, align: 'center' });
          doc.text(`€ ${Math.round(avgPricePerM2).toLocaleString('nl-NL')}/m²`, startX + colWidth, tableTop + 40, { width: colWidth, align: 'center' });
          doc.text(`€ ${Math.round(optimistic).toLocaleString('nl-NL')}/m²`, startX + 2 * colWidth, tableTop + 40, { width: colWidth, align: 'center' });

          doc.y = tableTop + 60;
        }
      }

      doc.addPage();

      // Overview table
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
      const tableStartY = doc.y;
      const tableColWidths = [30, 130, 70, 50, 60, 50];
      let currentX = 50;

      // Header row
      doc.rect(currentX, tableStartY, tableColWidths.reduce((a, b) => a + b, 0), 25).fill('#1F2937');
      doc.text('#', currentX + 5, tableStartY + 8, { width: tableColWidths[0] - 10 });
      currentX += tableColWidths[0];
      doc.text('Adres', currentX + 5, tableStartY + 8, { width: tableColWidths[1] - 10 });
      currentX += tableColWidths[1];
      doc.text('Prijs/m²', currentX + 5, tableStartY + 8, { width: tableColWidths[2] - 10 });
      currentX += tableColWidths[2];
      doc.text('Opp.', currentX + 5, tableStartY + 8, { width: tableColWidths[3] - 10 });
      currentX += tableColWidths[3];
      doc.text('Datum', currentX + 5, tableStartY + 8, { width: tableColWidths[4] - 10 });
      currentX += tableColWidths[4];
      doc.text('Score', currentX + 5, tableStartY + 8, { width: tableColWidths[5] - 10 });

      // Data rows
      doc.fontSize(10).font('Helvetica').fillColor('#111827');
      let rowY = tableStartY + 25;
      top15.forEach((prop, index) => {
        if (rowY > doc.page.height - 100) {
          doc.addPage();
          rowY = 50;
        }

        const bgColor = index < 10 ? '#EFF6FF' : index % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
        doc.rect(50, rowY, tableColWidths.reduce((a, b) => a + b, 0), 20).fill(bgColor);

        currentX = 50;
        doc.text(String(index + 1), currentX + 5, rowY + 5, { width: tableColWidths[0] - 10, align: 'center' });
        currentX += tableColWidths[0];
        doc.text(extractStreetAndNumber(prop.address_full), currentX + 5, rowY + 5, { width: tableColWidths[1] - 10 });
        currentX += tableColWidths[1];
        const pricePerM2 = prop.rw_sale_price && prop.rw_area_m2 && prop.rw_area_m2 > 0
          ? (prop.rw_sale_price / prop.rw_area_m2).toLocaleString('nl-NL')
          : 'Onbekend';
        doc.text(`€ ${pricePerM2}`, currentX + 5, rowY + 5, { width: tableColWidths[2] - 10, align: 'center' });
        currentX += tableColWidths[2];
        doc.text(prop.rw_area_m2 ? String(Math.round(prop.rw_area_m2)) : 'Onbekend', currentX + 5, rowY + 5, { width: tableColWidths[3] - 10, align: 'center' });
        currentX += tableColWidths[3];
        doc.text(formatDate(prop.rw_sale_date || prop.sale_date), currentX + 5, rowY + 5, { width: tableColWidths[4] - 10, align: 'center' });
        currentX += tableColWidths[4];
        doc.text((prop.final_score || prop.similarity_score || 0).toFixed(3), currentX + 5, rowY + 5, { width: tableColWidths[5] - 10, align: 'center' });

        rowY += 20;
      });

      doc.addPage();

      // Individual property pages
      top15.forEach((prop, index) => {
        if (doc.y > doc.page.height - 150) {
          doc.addPage();
        }

        doc.fontSize(16).font('Helvetica-Bold').fillColor('#1F2937');
        doc.text(`${index + 1}. ${prop.address_full}`);
        doc.moveDown(1);

        // Comparison table
        doc.fontSize(10).font('Helvetica').fillColor('#111827');
        const compTableY = doc.y;
        const compColWidth = 150;
        const compStartX = 50;

        // Table header
        doc.rect(compStartX, compTableY, compColWidth * 3, 20).fill('#1F2937');
        doc.font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text('Eigenschap', compStartX + 5, compTableY + 6, { width: compColWidth - 10 });
        doc.text('Referentie', compStartX + compColWidth + 5, compTableY + 6, { width: compColWidth - 10 });
        doc.text('Huidig pand', compStartX + 2 * compColWidth + 5, compTableY + 6, { width: compColWidth - 10 });

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
          ['Energielabel', referenceData.energy_label || 'Onbekend', prop.rw_energy_label || prop.energy_label || 'ONBEKEND'],
          ['Tuin', referenceData.has_garden ? 'Ja' : 'Nee', prop.rw_has_garden || prop.has_garden ? 'Ja' : 'Nee'],
          ['Balkon', referenceData.has_balcony ? 'Ja' : 'Nee', prop.rw_has_balcony || prop.has_balcony ? 'Ja' : 'Nee'],
          ['Terras', referenceData.has_terrace ? 'Ja' : 'Nee', prop.rw_has_terrace || prop.has_terrace ? 'Ja' : 'Nee'],
        ];

        let currentRowY = compTableY + 20;
        rows.forEach((row, rowIndex) => {
          const bgColor = rowIndex % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
          doc.rect(compStartX, currentRowY, compColWidth * 3, 18).fill(bgColor);
          doc.font('Helvetica').fillColor('#111827');
          doc.text(row[0], compStartX + 5, currentRowY + 4, { width: compColWidth - 10 });
          doc.text(row[1], compStartX + compColWidth + 5, currentRowY + 4, { width: compColWidth - 10 });
          doc.text(row[2], compStartX + 2 * compColWidth + 5, currentRowY + 4, { width: compColWidth - 10 });
          currentRowY += 18;
        });

        doc.y = currentRowY + 10;
        doc.fontSize(10).font('Helvetica').fillColor('#111827');
        doc.text(`Match Score: ${(prop.final_score || prop.similarity_score || 0).toFixed(3)}`);

        if (prop.rw_sale_price && prop.rw_area_m2 && prop.rw_area_m2 > 0) {
          const pricePerM2 = prop.rw_sale_price / prop.rw_area_m2;
          doc.text(`Prijs per m²: ${formatCurrency(pricePerM2)}`);
        }

        doc.moveDown(2);
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

