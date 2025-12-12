/**
 * Generate Excel report from top 15 matches
 */

import ExcelJS from 'exceljs';
import { CandidateProperty } from './calculateSimilarity';
import { ReferenceData } from './calculateSimilarity';

export async function generateExcelReport(
  top15: CandidateProperty[],
  referenceData: ReferenceData
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Top 15 Woningen');

  // Define columns
  worksheet.columns = [
    { header: 'Rang', key: 'rank', width: 8 },
    { header: 'Adres', key: 'address', width: 40 },
    { header: 'Verkoopprijs (€)', key: 'sale_price', width: 18 },
    { header: 'Oppervlakte (m²)', key: 'area', width: 16 },
    { header: 'Energielabel', key: 'energy_label', width: 14 },
    { header: 'Slaapkamers', key: 'bedrooms', width: 12 },
    { header: 'Badkamers', key: 'bathrooms', width: 12 },
    { header: 'Bouwjaar', key: 'year_built', width: 12 },
    { header: 'Tuin', key: 'garden', width: 8 },
    { header: 'Onderhoud Binnen', key: 'maintenance_inside', width: 18 },
    { header: 'Onderhoud Buiten', key: 'maintenance_outside', width: 18 },
    { header: 'Score', key: 'score', width: 12 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' }, // gray-800
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Add data rows
  top15.forEach((prop, index) => {
    const row = worksheet.addRow({
      rank: index + 1,
      address: prop.address_full,
      sale_price: prop.rw_sale_price || prop.sale_price || null,
      area: prop.rw_area_m2 || prop.area_m2 || null,
      energy_label: prop.rw_energy_label || prop.energy_label || 'Onbekend',
      bedrooms: prop.rw_bedrooms || prop.bedrooms || null,
      bathrooms: prop.bathrooms || null,
      year_built: prop.rw_year_built || prop.year_built || null,
      garden: prop.rw_has_garden || prop.has_garden ? 'Ja' : 'Nee',
      maintenance_inside: prop.maintenance_inside || 'Onbekend',
      maintenance_outside: prop.maintenance_outside || 'Onbekend',
      score: prop.final_score || prop.similarity_score || 0,
    });

    // Style data rows
    row.alignment = { vertical: 'middle' };
    row.getCell(1).alignment = { horizontal: 'center' }; // Rank
    row.getCell(2).alignment = { horizontal: 'left' }; // Address
    row.getCell(3).numFmt = '#,##0'; // Price
    row.getCell(4).numFmt = '#,##0'; // Area
    row.getCell(12).numFmt = '0.000'; // Score

    // Alternate row colors
    if (index % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFFF' }, // white
      };
    } else {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF9FAFB' }, // gray-50
      };
    }
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

