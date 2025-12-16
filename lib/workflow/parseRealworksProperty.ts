/**
 * Parse Realworks property from text
 * TypeScript port of parse_realworks_perfect.py
 */

export interface ParsedProperty {
  address_full: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  sale_price: number | null;
  ask_price: number | null;
  sale_date: string | null;
  list_date: string | null;
  delist_date: string | null;
  transport_date: string | null;
  days_on_market: number | null;
  area_m2: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  toilets: number | null;
  year_built: number | null;
  type: string | null;
  subtype: string | null;
  energy_label: string | null;
  energy_label_end_date: string | null;
  maintenance_inside: number | null;
  maintenance_outside: number | null;
  vve_monthly_fee: number | null;
  has_garden: boolean;
  garden_type: string | null;
  garden_area_m2: number | null;
  has_balcony: boolean;
  has_terrace: boolean;
  balcony_terrace_type: string | null;
  outdoor_text: string | null;
  heating: string | null;
  hot_water: string | null;
  has_lift: boolean;
  floor: number | null;
  has_storage: boolean;
  has_parking: boolean;
  has_garage: boolean;
  garage_type: string | null;
  notes: string | null;
}

/**
 * Parse currency text to number
 */
function parseCurrency(text: string | null | undefined): number | null {
  if (!text) return null;
  
  // Remove currency symbols and spaces
  let cleaned = text.replace(/[€\s]/g, '');
  
  // Handle Dutch format: 1.250.000,50
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const parts = cleaned.split(',');
    if (parts.length === 2) {
      const integerPart = parts[0].replace(/\./g, '');
      const decimalPart = parts[1];
      const value = parseFloat(`${integerPart}.${decimalPart}`);
      return isNaN(value) ? null : value;
    }
  }
  
  // Handle simple format
  cleaned = cleaned.replace(',', '.');
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

/**
 * Parse date in DD-MM-YYYY format to YYYY-MM-DD
 */
function parseDate(text: string | null | undefined): string | null {
  if (!text) return null;
  
  const match = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (match) {
    let [, day, month, year] = match;
    if (year.length === 2) {
      year = `20${year}`;
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

/**
 * Extract address components from full address
 */
export function extractAddressComponents(addressFull: string): {
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
} {
  if (!addressFull) {
    return { street: '', house_number: '', postal_code: '', city: '' };
  }
  
  const parts = addressFull.split(',').map(p => p.trim());
  
  const streetPart = parts[0] || '';
  let postalCode = '';
  let city = '';
  
  if (parts.length >= 2) {
    const secondPart = parts[1];
    const postalMatch = secondPart.match(/\b(\d{4}\s*[A-Z]{2})\b/);
    if (postalMatch) {
      postalCode = postalMatch[1].replace(/\s/g, '');
      city = secondPart.replace(postalMatch[0], '').trim();
    } else if (parts.length >= 3) {
      postalCode = parts[1].replace(/\s/g, '');
      city = parts[2];
    } else {
      city = secondPart;
    }
  }
  
  // Extract house number and suffix
  const numberMatch = streetPart.match(/(\d+(?:\s+[A-Za-z0-9]+)?)\s*$/);
  let street = streetPart;
  let houseNumber = '';
  
  if (numberMatch) {
    houseNumber = numberMatch[1].trim();
    street = streetPart.substring(0, numberMatch.index).trim();
  }
  
  return { street, house_number: houseNumber, postal_code: postalCode, city };
}

/**
 * Parse a single Realworks property from text
 */
export function parseRealworksProperty(text: string): ParsedProperty {
  // Initialize record with all possible fields
  const record: ParsedProperty = {
    address_full: '',
    street: '',
    house_number: '',
    postal_code: '',
    city: '',
    sale_price: null,
    ask_price: null,
    sale_date: null,
    list_date: null,
    delist_date: null,
    transport_date: null,
    days_on_market: null,
    area_m2: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
    toilets: null,
    year_built: null,
    type: null,
    subtype: null,
    energy_label: null,
    energy_label_end_date: null,
    maintenance_inside: null,
    maintenance_outside: null,
    vve_monthly_fee: null,
    has_garden: false,
    garden_type: null,
    garden_area_m2: null,
    has_balcony: false,
    has_terrace: false,
    balcony_terrace_type: null,
    outdoor_text: null,
    heating: null,
    hot_water: null,
    has_lift: false,
    floor: null,
    has_storage: false,
    has_parking: false,
    has_garage: false,
    garage_type: null,
    notes: null,
  };
  
  // Extract address (first bold line) - support both space and dash separators
  const addressMatch = text.match(/([A-Za-zÀ-ÿ\.\-\' ]+)\s+(\d+([\s\-]+[A-Za-z0-9]+)?),\s*(\d{4}\s?[A-Z]{2})\s+([A-Za-z ]+)/);
  if (addressMatch) {
    const [, street, houseNum, , postal, city] = addressMatch;
    record.street = street.trim();
    record.house_number = houseNum.trim();
    record.postal_code = postal.replace(/\s/g, '');
    record.city = city.trim();
    record.address_full = `${record.street} ${record.house_number}, ${record.postal_code} ${record.city}`;
  }
  
  // Extract prices - use Transactieprijs (final sold price) like Python version
  // Accept forms like: "Transactieprijs: € 525.000,-" or "Transactie prijs €525.000"
  const salePriceMatch = text.match(/Transactie\s*prijs\s*:?[\s\-–]*€?\s*([\d\.\,]+)/i);
  if (salePriceMatch) {
    record.sale_price = parseCurrency(salePriceMatch[1]);
  }
  
  // Fallback to "Verkocht prijs" if Transactieprijs not found
  if (!record.sale_price) {
    const verkochtPriceMatch = text.match(/Verkocht\s+prijs.*?€\s?([\d\.\,]+)/i);
    if (verkochtPriceMatch) {
      record.sale_price = parseCurrency(verkochtPriceMatch[1]);
    }
  }
  
  // Ask price variants (Vraagprijs / bieden vanaf)
  const askPricePatterns = [
    /Vraag\s*prijs[^\d€]*€?\s*([\d\.\,]+)/i,
    /Vraagprijs[^\d€]*€?\s*([\d\.\,]+)/i,
    /Bieden\s*va?n?af[^\d€]*€?\s*([\d\.\,]+)/i,
    /Vraagprijs\s*bieden\s*va?n?af[^\d€]*€?\s*([\d\.\,]+)/i,
  ];
  
  for (const pattern of askPricePatterns) {
    const askPriceMatch = text.match(pattern);
    if (askPriceMatch) {
      record.ask_price = parseCurrency(askPriceMatch[1]);
      if (record.ask_price) break;
    }
  }
  
  // Extract dates
  const saleDateMatch = text.match(/Verkocht\s+datum.*?(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
  if (saleDateMatch) {
    record.sale_date = parseDate(saleDateMatch[1]);
  }
  
  const transportMatch = text.match(/Transport\s+datum.*?(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
  if (transportMatch) {
    const transportDate = parseDate(transportMatch[1]);
    record.transport_date = transportDate;
    if (!record.sale_date) {
      record.sale_date = transportDate;
    }
  }
  
  const listMatch = text.match(/Aangemeld.*?(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
  if (listMatch) {
    record.list_date = parseDate(listMatch[1]);
  }
  
  const delistMatch = text.match(/Afgemeld.*?(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
  if (delistMatch) {
    record.delist_date = parseDate(delistMatch[1]);
  }
  
  const daysMatch = text.match(/Dagen\s+op\s+de\s+markt.*?(\d+)/i);
  if (daysMatch) {
    record.days_on_market = parseInt(daysMatch[1], 10);
  }
  
  // Property details
  const areaMatch = text.match(/Woonoppervlakte.*?(\d+(?:[.,]\d+)?)\s*m²?/i);
  if (areaMatch) {
    const areaText = areaMatch[1].replace(',', '.');
    record.area_m2 = parseFloat(areaText);
  }
  
  const roomsMatch = text.match(/Aantal\s+kamers.*?(\d+)/i);
  if (roomsMatch) {
    record.rooms = parseInt(roomsMatch[1], 10);
  }
  
  const bedroomsMatch = text.match(/\((\d+)\s+slaapkamer/i);
  if (bedroomsMatch) {
    record.bedrooms = parseInt(bedroomsMatch[1], 10);
  }
  
  const bathroomsMatch = text.match(/Aantal\s+badkamers.*?(\d+)/i);
  if (bathroomsMatch) {
    record.bathrooms = parseInt(bathroomsMatch[1], 10);
  }
  
  const toiletsMatch = text.match(/(\d+)\s+Toilet/i);
  if (toiletsMatch) {
    record.toilets = parseInt(toiletsMatch[1], 10);
  }
  
  // Energy label with end date
  // Pattern: "Energielabel: A (einddatum: 13-03-2030)" or "Energielabel: A"
  const energyMatch = text.match(/Energielabel.*?([A-G][\+]{0,3})(?:\s*\(einddatum:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\))?/i);
  if (energyMatch) {
    record.energy_label = energyMatch[1].toUpperCase();
    if (energyMatch[2]) {
      record.energy_label_end_date = parseDate(energyMatch[2]);
    }
  }
  
  // Maintenance
  const maintInsideMatch = text.match(/Onderhoud\s+binnen.*?€\s?([\d\.\,]+)/i);
  if (maintInsideMatch) {
    record.maintenance_inside = parseCurrency(maintInsideMatch[1]);
  }
  
  const maintOutsideMatch = text.match(/Onderhoud\s+buiten.*?€\s?([\d\.\,]+)/i);
  if (maintOutsideMatch) {
    record.maintenance_outside = parseCurrency(maintOutsideMatch[1]);
  }
  
  // Garden - EXACT Python version
  // Python: garden_match = re.search(r'Tuin.*?(Geen tuin|Achtertuin|Voortuin|Plaats|Patio)', text, re.IGNORECASE)
  const gardenMatch = text.match(/Tuin.*?(Geen tuin|Achtertuin|Voortuin|Plaats|Patio|Zonneterras)/i);
  if (gardenMatch) {
    const gardenType = gardenMatch[1];
    record.garden_type = gardenType;
    // Python: record['has_garden'] = garden_type.lower() != 'geen tuin'
    record.has_garden = gardenType.toLowerCase() !== 'geen tuin';
  }
  
  // Garden area - Python: garden_area_match = re.search(r'Achtertuin.*?(\d+)\s*m²', text, re.IGNORECASE)
  const gardenAreaMatch = text.match(/Achtertuin.*?(\d+)\s*m²/i);
  if (gardenAreaMatch) {
    record.garden_area_m2 = parseInt(gardenAreaMatch[1], 10);
  }
  
  // Balkon/dakterras - extract the value after "Balkon/dakterras:"
  // Pattern: "Balkon/dakterras: Balkon aanwezig" or "Balkon/dakterras: Geen balkon"
  const balconyTerraceMatch = text.match(/Balkon\/dakterras:\s*([^\r\n<]+)/i);
  if (balconyTerraceMatch) {
    const balconyTerraceType = balconyTerraceMatch[1].trim();
    record.balcony_terrace_type = balconyTerraceType;
    // Set has_balcony/has_terrace based on the value
    if (balconyTerraceType.toLowerCase().includes('geen')) {
      record.has_balcony = false;
      record.has_terrace = false;
    } else {
      // If it says "Balkon aanwezig" or similar, set has_balcony
      if (balconyTerraceType.toLowerCase().includes('balkon')) {
        record.has_balcony = true;
      }
      // If it says "dakterras" or "terras", set has_terrace
      if (balconyTerraceType.toLowerCase().includes('terras') || balconyTerraceType.toLowerCase().includes('dakterras')) {
        record.has_terrace = true;
      }
    }
  } else {
    // Fallback: old logic for backwards compatibility
    if (/balkon/i.test(text)) {
      record.has_balcony = true;
    }
    if (/terras/i.test(text)) {
      record.has_terrace = true;
    }
  }
  
  // Lift
  if (/lift/i.test(text)) {
    record.has_lift = true;
  }
  
  // Floor
  const floorMatch = text.match(/(\d+)\s+e\s+verdieping/i);
  if (floorMatch) {
    record.floor = parseInt(floorMatch[1], 10);
  }
  
  // Type
  const typeMatch = text.match(/Type.*?(Appartement|Huis|Woning)/i);
  if (typeMatch) {
    record.type = typeMatch[1];
  }
  
  // Year built
  const yearPeriodMatch = text.match(/Bouwperiode.*?-(\d{4})/i);
  if (yearPeriodMatch) {
    record.year_built = parseInt(yearPeriodMatch[1], 10);
  } else {
    const yearMatch = text.match(/Bouwjaar.*?(\d{4})/i);
    if (yearMatch) {
      record.year_built = parseInt(yearMatch[1], 10);
    }
  }
  
  // VvE fee
  const vveMatch = text.match(/VvE\s+bijdrage.*?€\s?([\d\.\,]+)/i);
  if (vveMatch) {
    record.vve_monthly_fee = parseCurrency(vveMatch[1]);
  }
  
  // Heating
  const heatingMatch = text.match(/Verwarming.*?(C\.V\.-Ketel|Elektrisch|Warmtepomp)/i);
  if (heatingMatch) {
    record.heating = heatingMatch[1];
  }
  
  // Hot water
  const hotWaterMatch = text.match(/Warm\s+water.*?(C\.V\.-Ketel|Elektrisch|Warmtepomp)/i);
  if (hotWaterMatch) {
    record.hot_water = hotWaterMatch[1];
  }
  
  // Garage
  const garageMatch = text.match(/Soort\s+garage.*?(Geen garage|Garagebox|Parkeergarage)/i);
  if (garageMatch) {
    const garageType = garageMatch[1];
    record.garage_type = garageType;
    record.has_garage = garageType.toLowerCase() !== 'geen garage';
  }
  
  // Parking
  if (/parkeergelegenheid/i.test(text) || /parkeren/i.test(text)) {
    record.has_parking = true;
  }
  
  // Storage
  if (/bergruimte/i.test(text) || /berging/i.test(text)) {
    record.has_storage = true;
  }
  
  return record;
}

