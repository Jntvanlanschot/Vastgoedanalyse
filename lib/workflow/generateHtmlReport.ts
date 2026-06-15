/**
 * Generate comprehensive HTML report matching the PDF structure
 * Includes individual property pages with photos and all details
 */

import { CandidateProperty } from './calculateSimilarity';
import { ReferenceData } from './calculateSimilarity';
import { calculateAdvicePrice } from './calculatePrice';

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

export function generateHtmlReport(
  top15: CandidateProperty[],
  referenceData: ReferenceData,
  pdfUrl?: string | null
): string {
  const referenceAddress = extractStreetAndNumber(referenceData.address_full);
  const referencePrice = referenceData.price || 0;
  const referenceArea = referenceData.area_m2 || 0;
  const referenceBedrooms = referenceData.bedrooms || 0;
  const referenceRooms = referenceData.rooms || 0;
  const referenceEnergyLabel = referenceData.energy_label || 'Onbekend';

  // Calculate price scenarios via the shared helper (also used by the /tuning page)
  const priceResult = calculateAdvicePrice(
    top15.map(p => ({
      score: p.final_score || p.similarity_score || 0,
      salePrice: p.rw_sale_price,
      areaM2: p.rw_area_m2,
    })),
    referenceData.area_m2
  );

  let priceScenariosHtml = '';
  if (priceResult) {
    const {
      avgPricePerM2,
      conservativePerM2,
      optimisticPerM2,
      conservativePrice,
      neutralPrice,
      optimisticPrice,
    } = priceResult;

    priceScenariosHtml = `
      <div class="price-scenarios">
        <table class="price-table">
          <thead>
            <tr>
              <th>Conservatief</th>
              <th>Neutraal</th>
              <th>Optimistisch</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="price-value">${formatCurrency(conservativePrice)}</td>
              <td class="price-value">${formatCurrency(neutralPrice)}</td>
              <td class="price-value">${formatCurrency(optimisticPrice)}</td>
            </tr>
            <tr>
              <td class="price-per-m2">€ ${formatNumberNL(Math.round(conservativePerM2))}/m²</td>
              <td class="price-per-m2">€ ${formatNumberNL(Math.round(avgPricePerM2))}/m²</td>
              <td class="price-per-m2">€ ${formatNumberNL(Math.round(optimisticPerM2))}/m²</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // Overview table
  const overviewRows = top15.map((prop, index) => {
    const pricePerM2 = prop.rw_sale_price && prop.rw_area_m2 && prop.rw_area_m2 > 0
      ? Math.round(prop.rw_sale_price / prop.rw_area_m2)
      : null;

    return `
      <tr class="${index < 10 ? 'top-10' : ''}">
        <td>${index + 1}</td>
        <td><a href="#property-${index + 1}">${extractStreetAndNumber(prop.address_full)}</a></td>
        <td class="price">${pricePerM2 ? `€ ${formatNumberNL(pricePerM2)}` : 'Onbekend'}</td>
        <td>${prop.rw_area_m2 ? formatNumberNL(prop.rw_area_m2) : 'Onbekend'}</td>
        <td>${formatDate(prop.rw_sale_date || prop.sale_date)}</td>
        <td class="score">${(prop.final_score || prop.similarity_score || 0).toFixed(3)}</td>
      </tr>
    `;
  }).join('');

  // Individual property pages
  const propertyPages = top15.map((prop, index) => {
    const pricePerM2 = prop.rw_sale_price && prop.rw_area_m2 && prop.rw_area_m2 > 0
      ? prop.rw_sale_price / prop.rw_area_m2
      : null;
    
    const estimatedValue = pricePerM2 && referenceData.area_m2 && referenceData.area_m2 > 0
      ? pricePerM2 * referenceData.area_m2
      : null;

    // Aanbiedingstekst HTML (above images)
    let aanbiedingstekstHtml = '';
    const aanbiedingstekst = (prop as any).notes || (prop as any).description || null;
    if (aanbiedingstekst) {
      // Convert line breaks to <br> and preserve formatting
      const formattedText = aanbiedingstekst
        .replace(/\n\n+/g, '</p><p>')
        .replace(/\n/g, '<br>');
      aanbiedingstekstHtml = `
        <div class="aanbiedingstekst">
          <h3>Aanbiedingstekst:</h3>
          <div class="aanbiedingstekst-content">
            <p>${formattedText}</p>
          </div>
        </div>
      `;
    }

    // Images HTML
    let imagesHtml = '';
    if (prop.images && prop.images.length > 0) {
      imagesHtml = `
        <div class="property-images">
          <h3>Foto's:</h3>
          <div class="image-grid">
            ${prop.images.map((imgBase64, imgIndex) => `
              <img src="data:image/jpeg;base64,${imgBase64}" alt="Foto ${imgIndex + 1}" class="property-image" />
            `).join('')}
          </div>
        </div>
      `;
    } else {
      imagesHtml = `
        <div class="property-images">
          <h3>Foto's:</h3>
          <p>Geen foto's beschikbaar</p>
        </div>
      `;
    }

    return `
      <div class="property-page" id="property-${index + 1}">
        <h2>${index + 1}. ${prop.address_full}</h2>
        
        <table class="comparison-table">
          <thead>
            <tr>
              <th>Eigenschap</th>
              <th>Referentie</th>
              <th>Huidig pand</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Adres</td>
              <td>${extractStreetAndNumber(referenceData.address_full || 'Onbekend')}</td>
              <td>${extractStreetAndNumber(prop.address_full)}</td>
            </tr>
            <tr>
              <td>Transactieprijs</td>
              <td>Onbekend</td>
              <td>${formatCurrency(prop.rw_sale_price || prop.sale_price)}</td>
            </tr>
            <tr>
              <td>Vraagprijs</td>
              <td>Onbekend</td>
              <td>${formatCurrency((prop as any).rw_ask_price || (prop as any).ask_price)}</td>
            </tr>
            <tr>
              <td>Verkoopdatum</td>
              <td>Onbekend</td>
              <td>${formatDate(prop.rw_sale_date || prop.sale_date)}</td>
            </tr>
            <tr>
              <td>Oppervlakte (m²)</td>
              <td>${referenceData.area_m2 || 0}</td>
              <td>${prop.rw_area_m2 ? formatNumberNL(prop.rw_area_m2) : 'Onbekend'}</td>
            </tr>
            <tr>
              <td>Kamers</td>
              <td>${referenceData.rooms || 0}</td>
              <td>${prop.rw_rooms ? String(prop.rw_rooms) : 'Onbekend'}</td>
            </tr>
            <tr>
              <td>Slaapkamers</td>
              <td>${referenceData.bedrooms || 0}</td>
              <td>${prop.rw_bedrooms ? String(prop.rw_bedrooms) : 'Onbekend'}</td>
            </tr>
            <tr>
              <td>Badkamers</td>
              <td>${referenceData.bathrooms || 0}</td>
              <td>${prop.bathrooms ? String(prop.bathrooms) : 'Onbekend'}</td>
            </tr>
            <tr>
              <td>Bouwjaar</td>
              <td>Onbekend</td>
              <td>${prop.rw_year_built ? String(prop.rw_year_built) : 'Onbekend'}</td>
            </tr>
            <tr>
              <td>Energielabel</td>
              <td>${referenceData.energy_label || 'Onbekend'}</td>
              <td>${(() => {
                const label = prop.rw_energy_label || prop.energy_label || 'Onbekend';
                const endDate = (prop as any).rw_energy_label_end_date || (prop as any).energy_label_end_date;
                return endDate ? `${label} (einddatum: ${formatDate(endDate)})` : label;
              })()}</td>
            </tr>
            <tr>
              <td>Tuin</td>
              <td>${referenceData.has_garden ? 'Ja' : 'Nee'}</td>
              <td>${(prop as any).rw_garden_type || prop.garden_type || (prop.rw_has_garden || prop.has_garden ? 'Ja' : 'Nee')}</td>
            </tr>
            <tr>
              <td>Balkon/dakterras</td>
              <td>${referenceData.has_balcony || referenceData.has_terrace ? 'Ja' : 'Nee'}</td>
              <td>${(prop as any).rw_balcony_terrace_type || (prop as any).balcony_terrace_type || 'Onbekend'}</td>
            </tr>
            <tr>
              <td>Onderhoud binnen</td>
              <td>Onbekend</td>
              <td>${formatMaintenance((prop as any).rw_maintenance_inside || (prop as any).maintenance_inside)}</td>
            </tr>
            <tr>
              <td>Onderhoud buiten</td>
              <td>Onbekend</td>
              <td>${formatMaintenance((prop as any).rw_maintenance_outside || (prop as any).maintenance_outside)}</td>
            </tr>
          </tbody>
        </table>

        <div class="property-scores">
          <p><strong>Match Score:</strong> ${(prop.final_score || prop.similarity_score || 0).toFixed(3)}</p>
          ${pricePerM2 ? `<p><strong>Prijs per m²:</strong> ${formatCurrency(pricePerM2)}</p>` : ''}
          ${estimatedValue ? `<p><strong>Geschatte waarde referentie woning:</strong> ${formatCurrency(estimatedValue)}</p>` : ''}
        </div>

        ${aanbiedingstekstHtml}
        ${imagesHtml}
            </div>
          `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vastgoedanalyse Rapport - ${referenceAddress}</title>
  <style>
    .download-pdf-button {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0C479D;
      color: white;
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000;
      transition: background 0.2s;
    }
    .download-pdf-button:hover {
      background: #0a3a7a;
    }
    .download-pdf-button:active {
      transform: translateY(1px);
    }
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
    .price-scenarios {
      margin: 30px 0;
    }
    .price-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .price-table th {
      background: #1F2937;
      color: white;
      padding: 12px;
      text-align: center;
    }
    .price-table td {
      padding: 12px;
      text-align: center;
      border: 1px solid #ddd;
    }
    .price-value {
      font-size: 1.1em;
      font-weight: bold;
      color: #1F2937;
    }
    .price-per-m2 {
      font-size: 0.9em;
      color: #6B7280;
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
    tbody tr.top-10 {
      background: #EFF6FF;
    }
    .score {
      font-weight: bold;
      color: #27ae60;
    }
    .price {
      color: #e74c3c;
      font-weight: bold;
    }
    .property-page {
      margin: 60px 0;
      padding: 30px;
      background: #fafafa;
      border-radius: 8px;
      border: 1px solid #e0e0e0;
      page-break-after: always;
    }
    .property-page h2 {
      color: #2c3e50;
      margin-bottom: 20px;
      border-bottom: 2px solid #3498db;
      padding-bottom: 10px;
    }
    .comparison-table {
      margin: 20px 0;
    }
    .comparison-table tbody tr:nth-child(even) {
      background: #f9f9f9;
    }
    .property-scores {
      margin: 20px 0;
      padding: 15px;
      background: #ecf0f1;
      border-radius: 5px;
    }
    .property-scores p {
      margin: 8px 0;
      font-size: 1.1em;
    }
    .property-images {
      margin: 30px 0;
    }
    .property-images h3 {
      margin-bottom: 15px;
      color: #2c3e50;
    }
    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }
    .property-image {
      width: 100%;
      height: auto;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      object-fit: cover;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #ecf0f1;
      text-align: center;
      color: #7f8c8d;
      font-size: 0.9em;
    }
    .download-pdf-button {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0C479D;
      color: white;
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000;
      transition: background 0.2s;
    }
    .download-pdf-button:hover {
      background: #0a3a7a;
    }
    .download-pdf-button:active {
      transform: translateY(1px);
    }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; padding: 20px; }
      .property-page { page-break-after: always; }
      .download-pdf-button { display: none; }
      @page {
        margin: 1cm;
        size: A4;
      }
    }
  </style>
</head>
<body>
  <button id="downloadPdfBtn" class="download-pdf-button" onclick="printAsPdf()">
    Opslaan als PDF
  </button>
  <script>
    function printAsPdf() {
      // Use browser's print functionality to save as PDF
      window.print();
    }
  </script>
  <div class="container">
    <h1>MEEST VERGELIJKBARE PANDEN</h1>
    <p style="color: #7f8c8d; margin-bottom: 30px;">Gegenereerd op ${new Date().toLocaleString('nl-NL')}</p>
    
    <div class="reference-info">
      <h2>Referentie Object</h2>
      <p><strong>Referentie:</strong> ${referenceData.address_full || 'Onbekend'} | ${referenceData.area_m2 || 'Onbekend'} m² | Energielabel: ${referenceData.energy_label || 'Onbekend'}</p>
    </div>

    ${priceScenariosHtml}

    <h2 style="margin-top: 40px; margin-bottom: 20px;">Top 15 Vergelijkbare Objecten</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Adres</th>
          <th>Prijs per m²</th>
          <th>Oppervlakte</th>
          <th>Verkoopdatum</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${overviewRows}
      </tbody>
    </table>

    ${propertyPages}

    <div class="footer">
      <p>Dit rapport is automatisch gegenereerd door de Vastgoedanalyse Tool</p>
      <p>Gebaseerd op ${top15.length} vergelijkbare objecten</p>
    </div>
  </div>
</body>
</html>`;

  return html;
}
