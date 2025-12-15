/**
 * Generate PDF report from top 15 matches using pdfmake
 */

import { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import PdfPrinter from 'pdfmake';
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

// Custom number formatter that doesn't require locale data (works in serverless)
function formatNumberNL(num: number): string {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount || amount === 0) return 'Onbekend';
  return `€ ${formatNumberNL(amount)}`;
}

export async function generatePdfReport(
  top15: CandidateProperty[],
  referenceData: ReferenceData
): Promise<Buffer> {
  // Use default fonts that work in serverless
  const fonts: TFontDictionary = {
    Roboto: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  };

  const printer = new PdfPrinter(fonts);

  // Build document content
  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [50, 50, 50, 50],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: '#111827',
    },
    content: [],
  };

  // Title page
  (docDefinition.content as any[]).push(
    {
      text: 'MEEST VERGELIJKBARE PANDEN',
      fontSize: 24,
      bold: true,
      color: '#1F2937',
      alignment: 'center',
      margin: [0, 0, 0, 20],
    }
  );

  // Reference property info
  if (referenceData) {
    (docDefinition.content as any[]).push({
      text: `Referentie: ${referenceData.address_full || 'Onbekend'} | ${referenceData.area_m2 || 'Onbekend'} m² | Energielabel: ${referenceData.energy_label || 'Onbekend'}`,
      fontSize: 9,
      alignment: 'center',
      margin: [0, 0, 0, 10],
    });
  }

  // Price calculation
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
      const totalWeight = validPrices.reduce((sum, p) => sum + Math.pow(p.score, 2), 0);
      const avgPricePerM2 = validPrices.reduce((sum, p) => sum + p.pricePerM2 * Math.pow(p.score, 2), 0) / totalWeight;

      const prices = validPrices.map(p => p.pricePerM2).sort((a, b) => a - b);
      const conservative = prices.length >= 3 ? prices[Math.floor(prices.length * 0.25)] : avgPricePerM2 * 0.88;
      const optimistic = prices.length >= 3 ? prices[Math.floor(prices.length * 0.75)] : avgPricePerM2 * 1.12;

      const areaM2 = referenceData.area_m2;
      const conservativePrice = conservative * areaM2;
      const neutralPrice = avgPricePerM2 * areaM2;
      const optimisticPrice = optimistic * areaM2;

      (docDefinition.content as any[]).push(
        { text: 'Prijsadvies', fontSize: 9, bold: true, alignment: 'center', margin: [0, 10, 0, 5] },
        {
          table: {
            widths: ['*', '*', '*'],
            body: [
              [
                { text: 'Conservatief', fontSize: 9, bold: true, alignment: 'center' },
                { text: 'Neutraal', fontSize: 9, bold: true, alignment: 'center' },
                { text: 'Optimistisch', fontSize: 9, bold: true, alignment: 'center' },
              ],
              [
                { text: formatCurrency(conservativePrice), fontSize: 11, alignment: 'center' },
                { text: formatCurrency(neutralPrice), fontSize: 11, alignment: 'center' },
                { text: formatCurrency(optimisticPrice), fontSize: 11, alignment: 'center' },
              ],
              [
                { text: `€ ${formatNumberNL(Math.round(conservative))}/m²`, fontSize: 8, color: '#6B7280', alignment: 'center' },
                { text: `€ ${formatNumberNL(Math.round(avgPricePerM2))}/m²`, fontSize: 8, color: '#6B7280', alignment: 'center' },
                { text: `€ ${formatNumberNL(Math.round(optimistic))}/m²`, fontSize: 8, color: '#6B7280', alignment: 'center' },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 20],
        }
      );
    }
  }

  // Overview table
  const overviewRows: any[] = [
    [
      { text: '#', fillColor: '#1F2937', color: '#FFFFFF', bold: true, alignment: 'center' },
      { text: 'Adres', fillColor: '#1F2937', color: '#FFFFFF', bold: true, alignment: 'left' },
      { text: 'Prijs per m²', fillColor: '#1F2937', color: '#FFFFFF', bold: true, alignment: 'center' },
      { text: 'Oppervlakte', fillColor: '#1F2937', color: '#FFFFFF', bold: true, alignment: 'center' },
      { text: 'Verkoopdatum', fillColor: '#1F2937', color: '#FFFFFF', bold: true, alignment: 'center' },
      { text: 'Score', fillColor: '#1F2937', color: '#FFFFFF', bold: true, alignment: 'center' },
    ],
  ];

  top15.forEach((prop, index) => {
    const pricePerM2 = prop.rw_sale_price && prop.rw_area_m2 && prop.rw_area_m2 > 0
      ? formatNumberNL(Math.round(prop.rw_sale_price / prop.rw_area_m2))
      : 'Onbekend';

    const bgColor = index < 10 ? '#EFF6FF' : index % 2 === 0 ? '#FFFFFF' : '#F9FAFB';

    overviewRows.push([
      { text: String(index + 1), fillColor: bgColor, alignment: 'center' },
      { text: extractStreetAndNumber(prop.address_full), fillColor: bgColor, alignment: 'left' },
      { text: pricePerM2 !== 'Onbekend' ? `€ ${pricePerM2}` : 'Onbekend', fillColor: bgColor, alignment: 'center' },
      { text: prop.rw_area_m2 ? String(Math.round(prop.rw_area_m2)) : 'Onbekend', fillColor: bgColor, alignment: 'center' },
      { text: formatDate(prop.rw_sale_date || prop.sale_date), fillColor: bgColor, alignment: 'center' },
      { text: (prop.final_score || prop.similarity_score || 0).toFixed(3), fillColor: bgColor, alignment: 'center' },
    ]);
  });

  (docDefinition.content as any[]).push({
    table: {
      widths: [30, '*', 80, 60, 80, 60],
      body: overviewRows,
    },
    layout: {
      hLineWidth: (i: number) => i === 0 || i === overviewRows.length ? 2 : 0.5,
      vLineWidth: () => 0,
      hLineColor: (i: number) => i === 0 ? '#374151' : '#E5E7EB',
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
    margin: [0, 0, 0, 20],
  });

  // Individual property pages
  top15.forEach((prop, index) => {
    (docDefinition.content as any[]).push(
      { text: '', pageBreak: 'before' },
      {
        text: `${index + 1}. ${prop.address_full}`,
        fontSize: 16,
        bold: true,
        margin: [0, 0, 0, 10],
      }
    );

    // Comparison table
    const comparisonRows: any[] = [
      [
        { text: 'Eigenschap', fillColor: '#1F2937', color: '#FFFFFF', bold: true },
        { text: 'Referentie', fillColor: '#1F2937', color: '#FFFFFF', bold: true },
        { text: 'Huidig pand', fillColor: '#1F2937', color: '#FFFFFF', bold: true },
      ],
      [
        { text: 'Adres', fillColor: '#FFFFFF' },
        { text: extractStreetAndNumber(referenceData.address_full || 'Onbekend'), fillColor: '#FFFFFF' },
        { text: extractStreetAndNumber(prop.address_full), fillColor: '#FFFFFF' },
      ],
      [
        { text: 'Verkoopprijs', fillColor: '#F9FAFB' },
        { text: 'Onbekend', fillColor: '#F9FAFB' },
        { text: formatCurrency(prop.rw_sale_price || prop.sale_price), fillColor: '#F9FAFB' },
      ],
      [
        { text: 'Verkoopdatum', fillColor: '#FFFFFF' },
        { text: 'Onbekend', fillColor: '#FFFFFF' },
        { text: formatDate(prop.rw_sale_date || prop.sale_date), fillColor: '#FFFFFF' },
      ],
      [
        { text: 'Oppervlakte (m²)', fillColor: '#F9FAFB' },
        { text: String(referenceData.area_m2 || 0), fillColor: '#F9FAFB' },
        { text: prop.rw_area_m2 ? String(Math.round(prop.rw_area_m2)) : 'Onbekend', fillColor: '#F9FAFB' },
      ],
      [
        { text: 'Kamers', fillColor: '#FFFFFF' },
        { text: String(referenceData.rooms || 0), fillColor: '#FFFFFF' },
        { text: prop.rw_rooms ? String(prop.rw_rooms) : 'Onbekend', fillColor: '#FFFFFF' },
      ],
      [
        { text: 'Slaapkamers', fillColor: '#F9FAFB' },
        { text: String(referenceData.bedrooms || 0), fillColor: '#F9FAFB' },
        { text: prop.rw_bedrooms ? String(prop.rw_bedrooms) : 'Onbekend', fillColor: '#F9FAFB' },
      ],
      [
        { text: 'Badkamers', fillColor: '#FFFFFF' },
        { text: String(referenceData.bathrooms || 0), fillColor: '#FFFFFF' },
        { text: prop.bathrooms ? String(prop.bathrooms) : 'Onbekend', fillColor: '#FFFFFF' },
      ],
      [
        { text: 'Bouwjaar', fillColor: '#F9FAFB' },
        { text: 'Onbekend', fillColor: '#F9FAFB' },
        { text: prop.rw_year_built ? String(prop.rw_year_built) : 'Onbekend', fillColor: '#F9FAFB' },
      ],
      [
        { text: 'Energielabel', fillColor: '#FFFFFF' },
        { text: referenceData.energy_label || 'Onbekend', fillColor: '#FFFFFF' },
        { text: prop.rw_energy_label || prop.energy_label || 'ONBEKEND', fillColor: '#FFFFFF' },
      ],
      [
        { text: 'Tuin', fillColor: '#F9FAFB' },
        { text: referenceData.has_garden ? 'Ja' : 'Nee', fillColor: '#F9FAFB' },
        { text: prop.rw_has_garden || prop.has_garden ? 'Ja' : 'Nee', fillColor: '#F9FAFB' },
      ],
      [
        { text: 'Balkon', fillColor: '#FFFFFF' },
        { text: referenceData.has_balcony ? 'Ja' : 'Nee', fillColor: '#FFFFFF' },
        { text: prop.rw_has_balcony || prop.has_balcony ? 'Ja' : 'Nee', fillColor: '#FFFFFF' },
      ],
      [
        { text: 'Terras', fillColor: '#F9FAFB' },
        { text: referenceData.has_terrace ? 'Ja' : 'Nee', fillColor: '#F9FAFB' },
        { text: prop.rw_has_terrace || prop.has_terrace ? 'Ja' : 'Nee', fillColor: '#F9FAFB' },
      ],
    ];

    (docDefinition.content as any[]).push({
      table: {
        widths: ['*', '*', '*'],
        body: comparisonRows,
      },
      layout: {
        hLineWidth: (i: number) => i === 0 || i === comparisonRows.length ? 2 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i: number) => i === 0 ? '#374151' : '#E5E7EB',
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 10,
        paddingBottom: () => 10,
      },
      margin: [0, 0, 0, 10],
    });

    (docDefinition.content as any[]).push(
      { text: `Match Score: ${(prop.final_score || prop.similarity_score || 0).toFixed(3)}`, margin: [0, 10, 0, 5] }
    );

    if (prop.rw_sale_price && prop.rw_area_m2 && prop.rw_area_m2 > 0) {
      const pricePerM2 = prop.rw_sale_price / prop.rw_area_m2;
      (docDefinition.content as any[]).push({
        text: `Prijs per m²: ${formatCurrency(pricePerM2)}`,
        margin: [0, 0, 0, 20],
      });
    }
  });

  // Generate PDF
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];

      pdfDoc.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      pdfDoc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });

      pdfDoc.on('error', (error: Error) => {
        reject(error);
      });

      pdfDoc.end();
    } catch (error) {
      reject(error);
    }
  });
}
