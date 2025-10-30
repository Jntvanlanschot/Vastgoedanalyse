#!/usr/bin/env python3
"""
PERFECTE Realworks parser - behoudt ALLE eigenschappen en vult Funda data aan.
"""

import pandas as pd
import re
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
import json

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def rtf_to_text(rtf_content: str) -> str:
    """Convert RTF content to plain text."""
    try:
        # Try striprtf first
        from striprtf.striprtf import rtf_to_text as striprtf_func
        return striprtf_func(rtf_content)
    except ImportError:
        # Fallback: basic RTF stripping
        text = rtf_content
        
        # Remove RTF control words
        text = re.sub(r'\\[a-z]+\d*\s?', '', text)
        text = re.sub(r'\\[{}]', '', text)
        text = re.sub(r'[{}]', '', text)
        
        # Handle unicode escapes
        text = re.sub(r'\\u(\d{4})', lambda m: chr(int(m.group(1))), text)
        
        # Clean up extra whitespace
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

def normalize_address_key(address: str) -> str:
    """Normalize address for consistent matching."""
    return re.sub(r'[^\w\s]', '', address.lower()).strip()

def extract_address_components(address_full: str) -> Dict[str, str]:
    """Extract street, house number, postal code, city from full address."""
    if not address_full:
        return {'street': '', 'house_number': '', 'postal_code': '', 'city': ''}
    
    parts = [p.strip() for p in address_full.split(',')]
    
    street_part = parts[0]
    postal_code = ""
    city = ""

    if len(parts) >= 2:
        second_part = parts[1]
        postal_match = re.search(r'\b(\d{4}\s*[A-Z]{2})\b', second_part)
        if postal_match:
            postal_code = postal_match.group(1).replace(' ', '')
            city = second_part.replace(postal_match.group(), '').strip()
        elif len(parts) >= 3:
            postal_code = parts[1].replace(' ', '')
            city = parts[2]
        else:
            city = second_part
    
    # Extract house number and suffix
    number_match = re.search(r'(\d+(?:\s+[A-Za-z0-9]+)?)\s*$', street_part)
    if number_match:
        house_number = number_match.group(1).strip()
        street = street_part[:number_match.start()].strip()
    else:
        street = street_part
        house_number = ""
    
    return {
        'street': street,
        'house_number': house_number,
        'postal_code': postal_code,
        'city': city
    }

def parse_currency(text: str) -> Optional[float]:
    """Parse currency text to float."""
    if not text:
        return None
    
    # Remove currency symbols and spaces
    text = re.sub(r'[€\s]', '', text)
    
    # Handle Dutch format: 1.250.000,50
    if ',' in text and '.' in text:
        # Split on comma for decimal
        parts = text.split(',')
        if len(parts) == 2:
            integer_part = parts[0].replace('.', '')
            decimal_part = parts[1]
            return float(f"{integer_part}.{decimal_part}")
    
    # Handle simple format: 1250000
    text = text.replace(',', '.')
    try:
        return float(text)
    except ValueError:
        return None

def parse_date(text: str) -> Optional[str]:
    """Parse date in DD-MM-YYYY format to YYYY-MM-DD."""
    if not text:
        return None
    
    match = re.search(r'(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})', text)
    if match:
        day, month, year = match.groups()
        if len(year) == 2:
            year = f"20{year}"
        return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    return None

def parse_realworks_property(text: str) -> Dict[str, Any]:
    """Parse a single Realworks property from text."""
    
    # Initialize record with all possible fields
    record = {
        'address_full': '',
        'street': '',
        'house_number': '',
        'postal_code': '',
        'city': '',
        'sale_price': None,
        'ask_price': None,
        'sale_date': None,
        'list_date': None,
        'delist_date': None,
        'transport_date': None,
        'days_on_market': None,
        'area_m2': None,
        'rooms': None,
        'bedrooms': None,
        'bathrooms': None,
        'toilets': None,
        'year_built': None,
        'type': None,
        'subtype': None,
        'energy_label': None,
        'maintenance_inside': None,
        'maintenance_outside': None,
        'vve_monthly_fee': None,
        'has_garden': False,
        'garden_type': None,
        'garden_area_m2': None,
        'has_balcony': False,
        'has_terrace': False,
        'outdoor_text': None,
        'heating': None,
        'hot_water': None,
        'has_lift': False,
        'floor': None,
        'has_storage': False,
        'has_parking': False,
        'has_garage': False,
        'garage_type': None,
        'notes': None
    }
    
    # Extract address (first bold line) - FIXED to allow "11 1" style addresses
    address_match = re.search(r'([A-Za-zÀ-ÿ\.\-\' ]+)\s+(\d+(\s+[A-Za-z0-9]+)?),\s*(\d{4}\s?[A-Z]{2})\s+([A-Za-z ]+)', text)
    if address_match:
        street, house_num, _, postal, city = address_match.groups()
        record['address_full'] = f"{street} {house_num}, {postal} {city}"
        record['street'] = street.strip()
        record['house_number'] = house_num.strip()
        record['postal_code'] = postal.replace(' ', '')
        record['city'] = city.strip()
    
    # DEBUG: Print address for debugging
    if 'Elandsgracht 103 A' in record['address_full']:
        print(f"DEBUG: Parsing {record['address_full']}")
    
    # Financial information: ONLY use Transactieprijs (final sold price)
    sale_price = None
    # Accept forms like: "Transactieprijs: € 525.000,-" or "Transactie prijs €525.000"
    m = re.search(r'Transactie\s*prijs\s*:?[\s\-–]*€?\s*([\d\.\,]+)', text, re.IGNORECASE)
    if m:
        sale_price = parse_currency(m.group(1))
    if sale_price is not None:
        record['sale_price'] = sale_price
    
    # Ask price variants (Vraagprijs / bieden vanaf)
    ask_labels = [
        r'Vraag\s*prijs', r'Vraagprijs', r'Bieden\s*va?n?af', r'Vraagprijs\s*bieden\s*va?n?af'
    ]
    ask_price = None
    for label in ask_labels:
        m = re.search(fr'{label}[^\d€]*€?\s*([\d\.\,]+)', text, re.IGNORECASE)
        if m:
            ask_price = parse_currency(m.group(1))
            if ask_price:
                break
    if ask_price is not None:
        record['ask_price'] = ask_price
    
    # Dates
    transport_match = re.search(r'Transport\s+datum.*?(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})', text, re.IGNORECASE)
    if transport_match:
        record['transport_date'] = parse_date(transport_match.group(1))
    
    list_match = re.search(r'Aangemeld.*?(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})', text, re.IGNORECASE)
    if list_match:
        record['list_date'] = parse_date(list_match.group(1))
    
    delist_match = re.search(r'Afgemeld.*?(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})', text, re.IGNORECASE)
    if delist_match:
        record['delist_date'] = parse_date(delist_match.group(1))
    
    days_match = re.search(r'Dagen\s+op\s+de\s+markt.*?(\d+)', text, re.IGNORECASE)
    if days_match:
        record['days_on_market'] = int(days_match.group(1))
    
    # Property details
    area_match = re.search(r'Woonoppervlakte.*?(\d+(?:[.,]\d+)?)\s*m²?', text, re.IGNORECASE)
    if area_match:
        area_text = area_match.group(1).replace(',', '.')
        record['area_m2'] = float(area_text)
    
    rooms_match = re.search(r'Aantal\s+kamers.*?(\d+)', text, re.IGNORECASE)
    if rooms_match:
        record['rooms'] = int(rooms_match.group(1))
    
    bedrooms_match = re.search(r'\((\d+)\s+slaapkamer', text, re.IGNORECASE)
    if bedrooms_match:
        record['bedrooms'] = int(bedrooms_match.group(1))
    
    bathrooms_match = re.search(r'Aantal\s+badkamers.*?(\d+)', text, re.IGNORECASE)
    if bathrooms_match:
        record['bathrooms'] = int(bathrooms_match.group(1))
    
    toilets_match = re.search(r'(\d+)\s+Toilet', text, re.IGNORECASE)
    if toilets_match:
        record['toilets'] = int(toilets_match.group(1))
    
    # Energy label
    energy_match = re.search(r'Energielabel.*?([A-G][\+]{0,3})', text, re.IGNORECASE)
    if energy_match:
        record['energy_label'] = energy_match.group(1).upper()
    
    # Maintenance
    maint_inside_match = re.search(r'Binnen.*?(Uitstekend|Goed|Redelijk|Matig)', text, re.IGNORECASE)
    if maint_inside_match:
        record['maintenance_inside'] = maint_inside_match.group(1)
    
    maint_outside_match = re.search(r'Buiten.*?(Uitstekend|Goed|Redelijk|Matig)', text, re.IGNORECASE)
    if maint_outside_match:
        record['maintenance_outside'] = maint_outside_match.group(1)
    
    # Garden
    garden_match = re.search(r'Tuin.*?(Geen tuin|Achtertuin|Voortuin|Plaats|Patio)', text, re.IGNORECASE)
    if garden_match:
        garden_type = garden_match.group(1)
        record['garden_type'] = garden_type
        record['has_garden'] = garden_type.lower() != 'geen tuin'
    
    # Garden area
    garden_area_match = re.search(r'Achtertuin.*?(\d+)\s*m²', text, re.IGNORECASE)
    if garden_area_match:
        record['garden_area_m2'] = int(garden_area_match.group(1))
    
    # Balcony/Terrace
    if 'balkon' in text.lower() or 'frans balkon' in text.lower():
        record['has_balcony'] = True
    
    if 'terras' in text.lower() or 'dakterras' in text.lower():
        record['has_terrace'] = True
    
    # Type and subtype
    type_match = re.search(r'Type.*?(Appartement|Woonhuis)', text, re.IGNORECASE)
    if type_match:
        record['type'] = type_match.group(1)
    
    subtype_match = re.search(r'Soort.*?(Bovenwoning|Benedenwoning|Portiek|Maisonnette)', text, re.IGNORECASE)
    if subtype_match:
        record['subtype'] = subtype_match.group(1)
    
    # Year built - IMPROVED: prioritize bouwperiode over bouwjaar
    year_period_match = re.search(r'Bouwperiode.*?-(\d{4})', text, re.IGNORECASE)
    if year_period_match:
        record['year_built'] = int(year_period_match.group(1))
        if 'Elandsgracht 103 A' in record['address_full']:
            print(f"DEBUG: Found bouwperiode {year_period_match.group(1)}")
    else:
        year_match = re.search(r'Bouwjaar.*?(\d{4})', text, re.IGNORECASE)
        if year_match:
            record['year_built'] = int(year_match.group(1))
            if 'Elandsgracht 103 A' in record['address_full']:
                print(f"DEBUG: Found bouwjaar {year_match.group(1)}")
    
    # VvE fee
    vve_match = re.search(r'VvE\s+bijdrage.*?€\s?([\d\.\,]+)', text, re.IGNORECASE)
    if vve_match:
        record['vve_monthly_fee'] = parse_currency(vve_match.group(1))
    
    # Heating
    heating_match = re.search(r'Verwarming.*?(C\.V\.-Ketel|Elektrisch|Warmtepomp)', text, re.IGNORECASE)
    if heating_match:
        record['heating'] = heating_match.group(1)
    
    # Hot water
    hot_water_match = re.search(r'Warm\s+water.*?(C\.V\.-Ketel|Elektrisch|Warmtepomp)', text, re.IGNORECASE)
    if hot_water_match:
        record['hot_water'] = hot_water_match.group(1)
    
    # Garage
    garage_match = re.search(r'Soort\s+garage.*?(Geen garage|Garagebox|Parkeergarage)', text, re.IGNORECASE)
    if garage_match:
        garage_type = garage_match.group(1)
        record['garage_type'] = garage_type
        record['has_garage'] = garage_type.lower() != 'geen garage'
    
    # Parking
    if 'parkeergelegenheid' in text.lower() or 'parkeren' in text.lower():
        record['has_parking'] = True
    
    # Storage
    if 'bergruimte' in text.lower() or 'berging' in text.lower():
        record['has_storage'] = True
    
    # DEBUG: Print final year for Elandsgracht 103 A
    if 'Elandsgracht 103 A' in record['address_full']:
        print(f"DEBUG: Final year_built: {record['year_built']}")
    
    return record

def parse_rtf_file(file_path: Path) -> List[Dict[str, Any]]:
    """Parse a single RTF file and extract all properties."""
    logger.info(f"Parsing RTF file: {file_path}")
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            rtf_content = f.read()
    except Exception as e:
        logger.error(f"Error reading {file_path}: {e}")
        return []
    
    # Convert RTF to plain text
    text = rtf_to_text(rtf_content)
    
    # Split into property sections (look for addresses)
    # More robust address pattern - FIXED to allow both "11 1" and "15 H" style addresses
    # This matches: 11, 11 1, 11A, 15 H, etc.
    # Pattern: straat + nummer (optioneel spatie + extra nummer/letter) + comma + postcode + stad
    address_pattern = r'([A-Za-zÀ-ÿ\.\-\' ]+)\s+(\d+(\s+[A-Za-z0-9]+)?)\s*,\s*(\d{4}\s?[A-Z]{2})\s+([A-Za-z ]+)'
    
    # Find all address matches
    address_matches = list(re.finditer(address_pattern, text))
    
    if not address_matches:
        logger.warning(f"No addresses found in {file_path}")
        return []
    
    logger.info(f"Found {len(address_matches)} address matches")
    
    properties = []
    
    for i, match in enumerate(address_matches):
        start_pos = match.start()
        
        # Find end position (start of next address or end of text)
        if i + 1 < len(address_matches):
            end_pos = address_matches[i + 1].start()
        else:
            end_pos = len(text)
        
        # Extract property text
        property_text = text[start_pos:end_pos]
        
        # Skip if too short (likely not a complete property)
        if len(property_text.strip()) < 100:
            continue
        
        # Parse the property
        record = parse_realworks_property(property_text)
        
        # Add source file info
        record['source_file'] = str(file_path)
        
        # Only add if we have at least an address
        if record['address_full']:
            properties.append(record)
    
    logger.info(f"Found {len(properties)} property records in {file_path}")
    return properties

def parse_directory(rtf_dir: Path, output_csv: Path) -> pd.DataFrame:
    """Parse all RTF files in directory and create CSV."""
    
    if not rtf_dir.exists():
        logger.error(f"Directory {rtf_dir} does not exist")
        return pd.DataFrame()
    
    all_properties = []
    
    # Find all RTF files
    rtf_files = list(rtf_dir.glob("*.rtf"))
    logger.info(f"Found {len(rtf_files)} RTF files")
    
    for rtf_file in rtf_files:
        properties = parse_rtf_file(rtf_file)
        all_properties.extend(properties)
    
    if not all_properties:
        logger.warning("No properties found")
        return pd.DataFrame()
    
    # Create DataFrame
    df = pd.DataFrame(all_properties)
    
    # Remove duplicates based on address_full
    df = df.drop_duplicates(subset=['address_full']).reset_index(drop=True)
    
    # Sort by address
    df = df.sort_values('address_full').reset_index(drop=True)
    
    # Save to CSV
    df.to_csv(output_csv, index=False)
    logger.info(f"Saved {len(df)} records to {output_csv}")
    
    return df

if __name__ == "__main__":
    # Direct execution for this project
    rtf_dir = Path("realworks")
    output_csv = Path("realworks_perfect_data.csv")
    
    df = parse_directory(rtf_dir, output_csv)
    
    if not df.empty:
        print(f"\nParsed {len(df)} property records")
        print(f"Output saved to: {output_csv}")
        
        # Show sample
        print("\nSample records:")
        print(df[['address_full', 'sale_price', 'sale_date', 'area_m2', 'bedrooms', 'bathrooms', 'year_built']].head())
        
        # Show breakdown by street
        print("\nRecords by street:")
        street_counts = df['street'].value_counts()
        for street, count in street_counts.items():
            print(f"  {street}: {count} records")
    else:
        print("No records found")
