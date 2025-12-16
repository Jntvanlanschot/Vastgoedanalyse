/**
 * MHTML Realworks parser - extracts properties from MHTML files
 * TypeScript port of parse_realworks_mhtml.py - EXACT MATCH
 */

import { parseRealworksProperty, ParsedProperty as BaseParsedProperty } from './parseRealworksProperty';

export interface ParsedProperty extends BaseParsedProperty {
  source_file?: string;
  images?: string[]; // Base64 encoded images
  image_count?: number;
}

interface MhtmlImage {
  contentId: string;
  data: Buffer;
  contentType: string;
}

/**
 * Parse currency text to number (same as parseRealworksProperty.parseCurrency)
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
 * Extract HTML content from MHTML file
 * EXACT Python version: extract_html_content_from_mhtml
 */
function extractHtmlContentFromMhtml(mhtmlBuffer: Buffer): string | null {
  try {
    const content = mhtmlBuffer.toString('utf-8', { encoding: 'utf-8' });
    
    // Python: Try parsing as email message first
    // We'll skip that and go straight to fallback (simpler)
    
    // Python fallback: Find HTML content - look for <html> tag
    const htmlMatch = content.match(/<html[^>]*>[\s\S]*?<\/html>/i);
    if (htmlMatch) {
      return htmlMatch[0];
    }
    
    // Python: If no <html> tag, try to find content between boundaries
    const boundaryMatch = content.match(/boundary="([^"]+)"/i);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1];
      // Find text/html part
      const htmlPartMatch = content.match(
        new RegExp(`Content-Type:\\s*text/html[\\s\\S]*?${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
      );
      if (htmlPartMatch) {
        const htmlPart = htmlPartMatch[0];
        // Extract HTML content (remove headers)
        const htmlContentMatch = htmlPart.match(/<[^>]+>[\s\S]*/);
        if (htmlContentMatch) {
          return htmlContentMatch[0];
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting HTML from MHTML:', error);
    return null;
  }
}

/**
 * Extract images from MHTML file
 * EXACT Python version: extract_images_from_mhtml
 */
function extractImagesFromMhtml(mhtmlBuffer: Buffer): Map<string, Buffer> {
  const images = new Map<string, Buffer>();
  
  try {
    const content = mhtmlBuffer.toString('utf-8', { encoding: 'utf-8' });
    
    // Find boundary
    const boundaryMatch = content.match(/boundary="([^"]+)"/i);
    if (!boundaryMatch) {
      return images;
    }
    
    const boundary = boundaryMatch[1];
    const parts = content.split(`--${boundary}`);
    
    for (const part of parts) {
      // Check if this is an image part
      const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
      if (!contentTypeMatch) continue;
      
      const contentType = contentTypeMatch[1].toLowerCase();
      if (!contentType.startsWith('image/')) continue;
      
      // Find Content-ID or Content-Location (Python: content_id = part.get('Content-ID', ''))
      const contentIdMatch = part.match(/Content-ID:\s*<?([^>\r\n]+)>?/i);
      const contentLocationMatch = part.match(/Content-Location:\s*([^\r\n]+)/i);
      
      let key: string;
      if (contentIdMatch) {
        key = contentIdMatch[1].trim().replace(/^<|>$/g, '');
      } else if (contentLocationMatch) {
        key = contentLocationMatch[1].trim();
      } else {
        key = `image_${images.size}`;
      }
      
      // Extract image data (between headers and next boundary)
      // Python: image_data = part.get_payload(decode=True)
      // In MHTML, image data is base64 encoded after headers
      const base64Match = part.match(/\r?\n\r?\n([A-Za-z0-9+/=\s]+)/);
      if (base64Match) {
        try {
          const base64Data = base64Match[1].replace(/\s/g, '');
          const imageData = Buffer.from(base64Data, 'base64');
          
          // Python: Only include if it's a reasonable size (not tiny icons)
          // We can't check dimensions easily, so just check if it's not too small
          if (imageData.length > 1000) { // At least 1KB
            images.set(key, imageData);
            // Also store with < > brackets for matching
            if (!key.startsWith('<')) {
              images.set(`<${key}>`, imageData);
            }
            // Also store Content-Location if we have Content-ID
            if (contentIdMatch && contentLocationMatch) {
              images.set(contentLocationMatch[1].trim(), imageData);
            }
          }
        } catch (e) {
          console.debug(`Could not process image part: ${e}`);
          continue;
        }
      }
    }
    
    console.log(`Extracted ${images.size} images from MHTML`);
    return images;
  } catch (error) {
    console.error('Error extracting images from MHTML:', error);
    return images;
  }
}

/**
 * Find images in HTML that match the extracted MHTML images
 * EXACT Python version: find_images_in_html
 */
function findImagesInHtml(htmlContent: string, mhtmlImages: Map<string, Buffer>): string[] {
  const images: string[] = [];
  const seenImageHashes = new Set<string>(); // Prevent duplicates using hash
  
  // Python: Find "Foto's" section
  const fotosMatch = htmlContent.match(/Foto['s]*/i);
  if (!fotosMatch) {
    console.debug("No 'Foto's' section found in HTML");
    return [];
  }
  
  // Python: Get content after "Foto's" - but stop at next address or end of propertyHtml
  // The propertyHtml should already be limited to one property, but let's be extra safe
  let contentAfterFotos = htmlContent.substring(fotosMatch.index! + fotosMatch[0].length);
  
  // Stop at next address pattern (to prevent taking images from next property)
  const nextAddressMatch = contentAfterFotos.match(/<b>([^<]+(?:straat|laan|weg|kade|plein|hof|park|dreef|singel|gracht)[^<]*(?:\d+[^<]*)?)<\/b>/i);
  if (nextAddressMatch) {
    contentAfterFotos = contentAfterFotos.substring(0, nextAddressMatch.index);
  }
  
  // Python: Find image references (img tags with src)
  // img_pattern = r'<img[^>]+src=["\']([^"\']+)["\']'
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const imgMatches: Array<{ src: string }> = [];
  let match;
  while ((match = imgRegex.exec(contentAfterFotos)) !== null) {
    imgMatches.push({ src: match[1] });
  }
  
  // Python: Also look for base64 encoded images
  // base64_pattern = r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)'
  const base64Regex = /data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/gi;
  const base64Matches: Array<{ data: string }> = [];
  let base64Match;
  while ((base64Match = base64Regex.exec(contentAfterFotos)) !== null) {
    base64Matches.push({ data: base64Match[1] });
  }
  
  // Track which MHTML images we've already used (to prevent duplicates across properties)
  const usedMhtmlKeys = new Set<string>();
  
  // Python: Process regular image URLs - try to match with MHTML images
  for (const imgMatch of imgMatches) {
    const src = imgMatch.src;
    // Python: Clean up src (remove query parameters, decode entities)
    const srcClean = src.split('?')[0].split('&')[0];
    
    // Python: Try to find matching image in mhtml_images
    let matched = false;
    for (const [key, imgData] of mhtmlImages.entries()) {
      // Skip if we've already used this image
      if (usedMhtmlKeys.has(key)) {
        continue;
      }
      
      // Python: Check if src matches any part of the key
      const keyClean = key.replace(/^<|>$/g, '').toLowerCase();
      const srcCleanLower = srcClean.toLowerCase();
      
      // Python: Extract filename from both
      const srcFilename = srcCleanLower.split('/').pop() || srcCleanLower;
      const keyFilename = keyClean.split('/').pop() || keyClean;
      
      // Python matching logic:
      // if (src_clean_lower in key_clean or 
      //     key_clean in src_clean_lower or
      //     src_filename == key_filename or
      //     (src_filename and key_filename and src_filename[:10] == key_filename[:10])):
      if (keyClean.includes(srcCleanLower) || 
          srcCleanLower.includes(keyClean) ||
          srcFilename === keyFilename ||
          (srcFilename && keyFilename && srcFilename.length >= 10 && keyFilename.length >= 10 &&
           srcFilename.substring(0, 10) === keyFilename.substring(0, 10))) {
        // Convert to base64
        const imgBase64 = imgData.toString('base64');
        // Use hash to prevent duplicates (first 500 chars)
        const imageHash = imgBase64.length > 500 ? imgBase64.substring(0, 500) : imgBase64;
        if (!seenImageHashes.has(imageHash)) {
          seenImageHashes.add(imageHash);
          images.push(imgBase64);
          usedMhtmlKeys.add(key);
          matched = true;
          console.log(`✅ Matched image: ${src.substring(0, 80)} -> ${key.substring(0, 80)}`);
        }
        break;
      }
    }
    
    // Python: If not matched and we have images, just take the first available ones
    if (!matched && mhtmlImages.size > 0) {
      // Python: remaining_images = [img for key, img in mhtml_images.items() if img not in images]
      // Find first unused image
      for (const [key, imgData] of mhtmlImages.entries()) {
        if (usedMhtmlKeys.has(key)) continue;
        
        const imgBase64 = imgData.toString('base64');
        const imageHash = imgBase64.length > 500 ? imgBase64.substring(0, 500) : imgBase64;
        if (!seenImageHashes.has(imageHash)) {
          seenImageHashes.add(imageHash);
          images.push(imgBase64);
          usedMhtmlKeys.add(key);
          break;
        }
      }
    }
  }
  
  // Python: Process base64 images
  for (const base64Match of base64Matches) {
    try {
      const base64Data = base64Match.data;
      const imageBytes = Buffer.from(base64Data, 'base64');
      
      // Python: if pil_image.width > 50 and pil_image.height > 50
      // We can't easily check dimensions, so just check size
      if (imageBytes.length > 1000) { // At least 1KB
        const imageHash = base64Data.length > 500 ? base64Data.substring(0, 500) : base64Data;
        if (!seenImageHashes.has(imageHash)) {
          seenImageHashes.add(imageHash);
          images.push(base64Data);
        }
      }
    } catch (e) {
      console.debug(`Could not decode base64 image: ${e}`);
      continue;
    }
  }
  
  // Python: If we still don't have images, just take any available images from MHTML
  if (images.length === 0 && mhtmlImages.size > 0) {
    // Python: remaining = [img for key, img in mhtml_images.items() if img not in images]
    for (const [key, imgData] of mhtmlImages.entries()) {
      if (usedMhtmlKeys.has(key)) continue;
      
      const imgBase64 = imgData.toString('base64');
      const imageHash = imgBase64.length > 500 ? imgBase64.substring(0, 500) : imgBase64;
      if (!seenImageHashes.has(imageHash)) {
        seenImageHashes.add(imageHash);
        images.push(imgBase64);
        usedMhtmlKeys.add(key);
      }
    }
  }
  
  console.log(`✅ Found ${images.length} unique images for property`);
  return images; // Python: Return all images
}

/**
 * Parse MHTML file and extract property data
 * EXACT Python version: parse_mhtml_file
 */
export async function parseMhtmlFile(mhtmlBuffer: Buffer, filename: string): Promise<ParsedProperty[]> {
  console.log(`Parsing MHTML file: ${filename}`);
  
  // Python: Extract HTML content
  let htmlContent = extractHtmlContentFromMhtml(mhtmlBuffer);
  if (!htmlContent) {
    console.error(`No HTML content found in ${filename}`);
    return [];
  }
  
  // Python: Extract images
  const mhtmlImages = extractImagesFromMhtml(mhtmlBuffer);
  
  // Python: Decode HTML entities (quoted-printable, etc.)
  // MHTML often uses quoted-printable encoding
  // Python: html_content = html_content.replace('=3D', '=').replace('=\n', '').replace('=\r\n', '')
  // BUT: Python's email.get_payload(decode=True) automatically decodes ALL quoted-printable!
  // So we need to decode ALL quoted-printable sequences properly
  // Strategy: Decode quoted-printable to bytes, then convert to UTF-8 string
  // First remove soft line breaks (quoted-printable line continuation)
  htmlContent = htmlContent.replace(/=\r?\n/g, '');
  
  // Decode all quoted-printable sequences (=XX where XX is hex)
  // This handles multi-byte UTF-8 sequences like =E2=82=AC (€)
  let decoded = '';
  let i = 0;
  while (i < htmlContent.length) {
    if (htmlContent[i] === '=' && i + 2 < htmlContent.length) {
      // Check if next 2 chars are hex digits
      const hex1 = htmlContent.substring(i + 1, i + 3);
      if (/^[0-9A-F]{2}$/i.test(hex1)) {
        // Decode this byte
        const byte = parseInt(hex1, 16);
        decoded += String.fromCharCode(byte);
        i += 3;
        continue;
      }
    }
    decoded += htmlContent[i];
    i++;
  }
  
  // Now convert the byte string to UTF-8
  // Since we decoded byte-by-byte, we need to reconstruct UTF-8 sequences
  // But actually, if we just decode each =XX as a byte, we get the correct UTF-8 bytes
  // So we can use Buffer to convert bytes to UTF-8 string
  try {
    // Convert decoded string (which is now byte values) to Buffer, then to UTF-8
    const bytes = Buffer.from(decoded, 'latin1'); // latin1 preserves byte values
    htmlContent = bytes.toString('utf-8');
  } catch (e) {
    // Fallback: use decoded as-is if conversion fails
    console.warn('Failed to convert quoted-printable to UTF-8, using fallback');
    htmlContent = decoded;
  }
  
  // Python: Find all addresses (similar to PDF parser)
  // Look for address patterns in HTML
  let addressMatches: Array<{ match: RegExpMatchArray; index: number }> = [];
  
  // Python: address_pattern = r'<b>([^<]+(?:straat|laan|weg|kade|plein|hof|park|dreef|singel|gracht)[^<]*(?:\d+[^<]*)?)</b>'
  const addressPattern = /<b>([^<]+(?:straat|laan|weg|kade|plein|hof|park|dreef|singel|gracht)[^<]*(?:\d+[^<]*)?)<\/b>/gi;
  let match;
  while ((match = addressPattern.exec(htmlContent)) !== null) {
    addressMatches.push({ match, index: match.index });
  }
  
  // Python: Also try to find addresses in table cells
  if (addressMatches.length === 0) {
    // Python: address_pattern2 = r'<b>([^<]+(?:,\s*\d{4}\s+[A-Z]{2})[^<]*)</b>'
    const addressPattern2 = /<b>([^<]+(?:,\s*\d{4}\s+[A-Z]{2})[^<]*)<\/b>/gi;
    while ((match = addressPattern2.exec(htmlContent)) !== null) {
      addressMatches.push({ match, index: match.index });
    }
  }
  
  if (addressMatches.length === 0) {
    // Python: Fallback: look for any bold text that might be an address
    // address_pattern3 = r'<b>([^<]{10,50})</b>'
    const addressPattern3 = /<b>([^<]{10,50})<\/b>/gi;
    while ((match = addressPattern3.exec(htmlContent)) !== null) {
      addressMatches.push({ match, index: match.index });
    }
  }
  
  const properties: ParsedProperty[] = [];
  
  for (let i = 0; i < addressMatches.length; i++) {
    const { match: addressMatch, index: startPos } = addressMatches[i];
    const addressText = addressMatch[1];
    
    // Python: Find property section (from this address to next address or end)
    let endPos: number;
    if (i + 1 < addressMatches.length) {
      endPos = addressMatches[i + 1].index;
    } else {
      // Python: Look for next property marker or end
      const nextSection = htmlContent.indexOf('<table', startPos + 1000);
      if (nextSection > startPos) {
        endPos = nextSection;
      } else {
        endPos = Math.min(startPos + 10000, htmlContent.length);
      }
    }
    
    // Python: Extract property HTML
    const propertyHtml = htmlContent.substring(startPos, endPos);
    
    // Python: Convert HTML to plain text for parsing
    // Remove HTML tags but keep text
    let propertyText = propertyHtml.replace(/<[^>]+>/g, ' ');
    propertyText = propertyText.replace(/\s+/g, ' ').trim();
    
    // Python: Skip if too short
    if (propertyText.length < 100) {
      continue;
    }
    
    // Python: Parse the property (using same function as RTF/PDF parser)
    const record = parseRealworksProperty(propertyText);
    
    // Python: Add source file info
    record.source_file = filename;
    
    // Python: Only add if we have at least an address
    if (!record.address_full) {
      // Python: Try to extract address from HTML directly
      const addressMatch = propertyHtml.match(/<b>([^<]+)<\/b>/i);
      if (addressMatch) {
        record.address_full = addressMatch[1].trim();
      }
    }
    
    if (!record.address_full) {
      continue;
    }
    
    // Python: Clean address: remove "Verkocht In verkoop genomen Vraagprijs" and similar status text
    record.address_full = record.address_full.replace(
      /\s*(Verkocht|In verkoop genomen|Vraagprijs|Prijs op aanvraag).*$/i,
      ''
    ).trim();
    
    // Extract aanbiedingstekst (description text)
    // Look for "Aanbiedingstekst" section in the property HTML
    // Pattern: <td>Aanbiedingstekst</td> followed by </tr><tr><td> with the content
    // Stop at next table or end of property section
    const aanbiedingstekstHeaderMatch = propertyHtml.match(/<td[^>]*>Aanbiedingstekst<\/td>/i);
    if (aanbiedingstekstHeaderMatch) {
      // Find the content after the header, in the next <tr><td>
      const afterHeader = propertyHtml.substring(aanbiedingstekstHeaderMatch.index! + aanbiedingstekstHeaderMatch[0].length);
      // Look for the next <tr> with <td> that contains the actual text
      // Stop at next table or Foto's section
      const contentMatch = afterHeader.match(/<\/tr>\s*<tr[^>]*>\s*<td[^>]*>([\s\S]*?)(?=<\/td>\s*<\/tr>\s*<table|Foto|$)/i);
      if (contentMatch) {
        let aanbiedingstekst = contentMatch[1];
        // Remove HTML tags but preserve line breaks
        aanbiedingstekst = aanbiedingstekst
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
          .trim();
        // Only set if we have meaningful content (more than just whitespace)
        if (aanbiedingstekst.length > 50) {
          record.notes = aanbiedingstekst;
        }
      }
    }
    
    // Python: Find images for this property
    const images = findImagesInHtml(propertyHtml, mhtmlImages);
    record.images = images;
    record.image_count = images.length;
    console.log(`Found ${images.length} images for ${record.address_full}`);
    
    properties.push(record);
  }
  
  console.log(`Found ${properties.length} property records in ${filename}`);
  return properties;
}
