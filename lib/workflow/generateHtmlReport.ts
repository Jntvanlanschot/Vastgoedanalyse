/**
 * Generate HTML report from top 15 matches
 * This works everywhere (no fontkit/trie dependencies)
 */

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

export function generateHtmlReport(
  top15: CandidateProperty[],
  referenceData: ReferenceData
): string {
  const referenceAddress = extractStreetAndNumber(referenceData.address_full);
  const referencePrice = referenceData.price || 0;
  const referenceArea = referenceData.area_m2 || 0;
  const referenceBedrooms = referenceData.bedrooms || 0;
  const referenceRooms = referenceData.rooms || 0;
  const referenceEnergyLabel = referenceData.energy_label || 'Onbekend';

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vastgoedanalyse Rapport - ${referenceAddress}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2c3e50;
      margin-bottom: 10px;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    .reference-info {
      background: #ecf0f1;
      padding: 20px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .reference-info h2 {
      color: #2c3e50;
      margin-bottom: 15px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    .info-item {
      display: flex;
      flex-direction: column;
    }
    .info-label {
      font-weight: bold;
      color: #7f8c8d;
      font-size: 0.9em;
      margin-bottom: 5px;
    }
    .info-value {
      font-size: 1.1em;
      color: #2c3e50;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    thead {
      background: #34495e;
      color: white;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      font-weight: bold;
      position: sticky;
      top: 0;
    }
    tbody tr:hover {
      background: #f8f9fa;
    }
    .score {
      font-weight: bold;
      color: #27ae60;
    }
    .price {
      color: #e74c3c;
      font-weight: bold;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #ecf0f1;
      text-align: center;
      color: #7f8c8d;
      font-size: 0.9em;
    }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Vastgoedanalyse Rapport</h1>
    <p style="color: #7f8c8d; margin-bottom: 30px;">Gegenereerd op ${new Date().toLocaleString('nl-NL')}</p>
    
    <div class="reference-info">
      <h2>Referentie Object</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Adres</span>
          <span class="info-value">${referenceAddress}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Vraagprijs</span>
          <span class="info-value">${formatCurrency(referencePrice)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Oppervlakte</span>
          <span class="info-value">${formatNumberNL(referenceArea)} m²</span>
        </div>
        <div class="info-item">
          <span class="info-label">Slaapkamers</span>
          <span class="info-value">${referenceBedrooms}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Kamers</span>
          <span class="info-value">${referenceRooms}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Energielabel</span>
          <span class="info-value">${referenceEnergyLabel}</span>
        </div>
      </div>
    </div>

    <h2 style="margin-top: 40px; margin-bottom: 20px;">Top 15 Vergelijkbare Objecten</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Adres</th>
          <th>Verkoopprijs</th>
          <th>Oppervlakte</th>
          <th>Slaapkamers</th>
          <th>Kamers</th>
          <th>Energielabel</th>
          <th>Similariteit</th>
        </tr>
      </thead>
      <tbody>
        ${top15.map((prop, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${extractStreetAndNumber(prop.address_full)}</td>
          <td class="price">${formatCurrency(prop.rw_sale_price)}</td>
          <td>${formatNumberNL(prop.rw_area_m2)} m²</td>
          <td>${prop.rw_bedrooms || 'Onbekend'}</td>
          <td>${prop.rw_rooms || 'Onbekend'}</td>
          <td>${prop.rw_energy_label || 'Onbekend'}</td>
          <td class="score">${(prop.similarity_score * 100).toFixed(1)}%</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer">
      <p>Dit rapport is automatisch gegenereerd door de Vastgoedanalyse Tool</p>
      <p>Gebaseerd op ${top15.length} vergelijkbare objecten</p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

