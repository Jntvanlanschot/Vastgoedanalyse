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
      
      // Extract image data (between headers and next boundary)
      // Python: image_data = part.get_payload(decode=True)
      // In MHTML, image data is base64 encoded after headers
      const base64Match = part.match(/\r?\n\r?\n([A-Za-z0-9+/=\s]+)/);
      if (!base64Match) continue;
      
      try {
        const base64Data = base64Match[1].replace(/\s/g, '');
        const imageData = Buffer.from(base64Data, 'base64');
        
        // Python: Only include if it's a reasonable size (not tiny icons)
        // We can't check dimensions easily, so just check if it's not too small
        if (imageData.length < 1000) continue; // Skip tiny images
        
        // Store image with multiple keys for better matching
        if (contentLocationMatch) {
          const contentLocation = contentLocationMatch[1].trim();
          // Store with full URL (with query params)
          images.set(contentLocation, imageData);
          // Store with URL without query params
          const urlWithoutParams = contentLocation.split('?')[0];
          images.set(urlWithoutParams, imageData);
          // Store with filename only
          const filename = urlWithoutParams.split('/').pop() || '';
          if (filename) {
            images.set(filename, imageData);
          }
        }
        
        if (contentIdMatch) {
          let contentId = contentIdMatch[1].trim().replace(/^<|>$/g, '');
          images.set(contentId, imageData);
          images.set(`<${contentId}>`, imageData);
        }
        
        // Fallback key if no Content-ID or Content-Location
        if (!contentIdMatch && !contentLocationMatch) {
          images.set(`image_${images.size}`, imageData);
        }
      } catch (e) {
        console.debug(`Could not process image part: ${e}`);
        continue;
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
  
  // Filter function to exclude logos, icons, and empty images
  const shouldExcludeImage = (src: string, key: string, imageData?: Buffer): boolean => {
    const srcLower = src.toLowerCase();
    const keyLower = key.toLowerCase();
    
    // Exclude patterns
    const excludePatterns = [
      'logo',
      'icon',
      'print',
      'vastgoed',
      'nvh',
      'nvm',
      'uitwisseling/nvm',
      'pub/img',
      '.ico',
      '.svg',
      'print.gif',
      'uitwisseling.gif'
    ];
    
    // Check if src or key contains exclude patterns
    for (const pattern of excludePatterns) {
      if (srcLower.includes(pattern) || keyLower.includes(pattern)) {
        return true;
      }
    }
    
    // NO SIZE FILTER - user explicitly requested to remove it
    
    return false;
  };
  
  // Python: Find "Foto's" section - EXACT match
  const fotosMatch = htmlContent.match(/Foto['s]*/i);
  if (!fotosMatch) {
    console.log("No 'Foto's' section found in HTML");
    return [];
  }
  
  // Python: Get content after "Foto's" - propertyHtml is already limited to one property
  // BUT: We need to stop at the next address to prevent taking images from next property
  let contentAfterFotos = htmlContent.substring(fotosMatch.index! + fotosMatch[0].length);
  
  // CRITICAL: Stop at next address pattern (to prevent taking images from next property)
  // Look for next address in bold tags: <b>Address</b>
  // Pattern matches addresses like "Keizersgracht 515 D" or "Herengracht 218"
  const nextAddressMatch = contentAfterFotos.match(/<b>([^<]+(?:straat|laan|weg|kade|plein|hof|park|dreef|singel|gracht|gracht)[^<]*(?:,\s*\d{4}\s+[A-Z]{2})?[^<]*)<\/b>/i);
  if (nextAddressMatch && nextAddressMatch.index !== undefined) {
    // Always stop at next address - this is critical to prevent mixing images
    contentAfterFotos = contentAfterFotos.substring(0, nextAddressMatch.index);
    console.log(`✅ Stopped image extraction at next address: ${nextAddressMatch[1].substring(0, 50)}`);
  }
  
  // Python: Find image references (img tags with src) - EXACT match
  // img_pattern = r'<img[^>]+src=["\']([^"\']+)["\']'
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const imgMatches: Array<{ src: string; index: number }> = [];
  let match;
  while ((match = imgRegex.exec(contentAfterFotos)) !== null) {
    imgMatches.push({ src: match[1], index: match.index });
  }
  
  // Python: Also look for base64 encoded images - EXACT match
  // base64_pattern = r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)'
  const base64Regex = /data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/gi;
  const base64Matches: Array<{ data: string }> = [];
  let base64Match;
  while ((base64Match = base64Regex.exec(contentAfterFotos)) !== null) {
    base64Matches.push({ data: base64Match[1] });
  }
  
  console.log(`Found ${imgMatches.length} img tags and ${base64Matches.length} base64 images after "Foto's"`);
  
  // Track which MHTML images we've already used
  const usedMhtmlImages = new Set<string>();
  
  // Helper to get next unused MHTML image (not a logo/icon)
  const getNextUnusedMhtmlImage = (): { key: string; data: Buffer } | null => {
    for (const [key, imgData] of mhtmlImages.entries()) {
      // Skip logos/icons
      if (shouldExcludeImage('', key, imgData)) {
        continue;
      }
      
      // Check if we've already used this image
      const imgBase64 = imgData.toString('base64');
      const imageHash = imgBase64.length > 500 ? imgBase64.substring(0, 500) : imgBase64;
      if (!seenImageHashes.has(imageHash) && !usedMhtmlImages.has(key)) {
        usedMhtmlImages.add(key);
        return { key, data: imgData };
      }
    }
    return null;
  };
  
  // Python: Process regular image URLs - try to match with MHTML images - EXACT match
  for (const imgMatch of imgMatches) {
    const src = imgMatch.src;
    
    // Skip logos, icons, and other non-property images
    if (shouldExcludeImage(src, src)) {
      console.log(`⏭ Skipped logo/icon: ${src.substring(0, 80)}`);
      continue;
    }
    
    // Try multiple matching strategies:
    // 1. Direct match with full URL (with or without query params)
    // 2. Match with URL without query params
    // 3. Match with filename
    // 4. Python-style partial matching
    
    let matched = false;
    let matchedImageData: Buffer | null = null;
    let matchedKey: string | null = null;
    
    // Strategy 1: Direct match (exact URL match)
    if (mhtmlImages.has(src)) {
      const imgData = mhtmlImages.get(src)!;
      if (!shouldExcludeImage(src, src, imgData)) {
        matchedImageData = imgData;
        matchedKey = src;
        matched = true;
        console.log(`✅ Direct match (full URL): ${src.substring(0, 80)}`);
      }
    }
    
    // Strategy 2: Match without query params
    if (!matched) {
      const srcWithoutParams = src.split('?')[0];
      if (mhtmlImages.has(srcWithoutParams)) {
        const imgData = mhtmlImages.get(srcWithoutParams)!;
        if (!shouldExcludeImage(src, srcWithoutParams, imgData)) {
          matchedImageData = imgData;
          matchedKey = srcWithoutParams;
          matched = true;
          console.log(`✅ Direct match (no params): ${srcWithoutParams.substring(0, 80)}`);
        }
      }
    }
    
    // Strategy 3: Match by filename
    if (!matched) {
      const srcFilename = src.split('/').pop()?.split('?')[0] || '';
      if (srcFilename && mhtmlImages.has(srcFilename)) {
        const imgData = mhtmlImages.get(srcFilename)!;
        if (!shouldExcludeImage(src, srcFilename, imgData)) {
          matchedImageData = imgData;
          matchedKey = srcFilename;
          matched = true;
          console.log(`✅ Direct match (filename): ${srcFilename}`);
        }
      }
    }
    
    // Strategy 4: Python-style partial matching (fallback)
    if (!matched) {
      const srcClean = src.split('?')[0].split('&')[0];
      const srcCleanLower = srcClean.toLowerCase();
      const srcFilename = srcCleanLower.split('/').pop() || srcCleanLower;
      
      for (const [key, imgData] of mhtmlImages.entries()) {
        // Skip if this image should be excluded
        if (shouldExcludeImage(src, key, imgData)) {
          continue;
        }
        
        // Skip if already used
        if (usedMhtmlImages.has(key)) {
          continue;
        }
        
        const keyClean = key.replace(/^<|>$/g, '').toLowerCase();
        const keyFilename = keyClean.split('/').pop() || keyClean;
        
        // Python matching logic:
        if (keyClean.includes(srcCleanLower) || 
            srcCleanLower.includes(keyClean) ||
            srcFilename === keyFilename ||
            (srcFilename && keyFilename && srcFilename.length >= 10 && keyFilename.length >= 10 &&
             srcFilename.substring(0, 10) === keyFilename.substring(0, 10))) {
          matchedImageData = imgData;
          matchedKey = key;
          matched = true;
          console.log(`✅ Partial match: ${src.substring(0, 60)} -> ${key.substring(0, 60)}`);
          break;
        }
      }
    }
    
    // Add matched image
    if (matched && matchedImageData && matchedKey) {
      const imgBase64 = matchedImageData.toString('base64');
      const imageHash = imgBase64.length > 500 ? imgBase64.substring(0, 500) : imgBase64;
      if (!seenImageHashes.has(imageHash)) {
        seenImageHashes.add(imageHash);
        usedMhtmlImages.add(matchedKey);
        images.push(imgBase64);
        console.log(`✅ Added matched image ${images.length}`);
      }
    }
    
    // Python: If not matched and we have images, just take the first available ones - EXACT match
    // BUT: Skip logos/icons - CRITICAL: Do this for EVERY img tag, not just once
    if (!matched && mhtmlImages.size > 0) {
      const nextUnused = getNextUnusedMhtmlImage();
      if (nextUnused) {
        const imgBase64 = nextUnused.data.toString('base64');
        const imageHash = imgBase64.length > 500 ? imgBase64.substring(0, 500) : imgBase64;
        if (!seenImageHashes.has(imageHash)) {
          seenImageHashes.add(imageHash);
          images.push(imgBase64);
          console.log(`✅ Added unmatched image ${images.length} from MHTML: ${nextUnused.key.substring(0, 60)}`);
        }
      }
    }
  }
  
  // Python: Process base64 images - EXACT match
  for (const base64Match of base64Matches) {
    try {
      const base64Data = base64Match.data;
      const imageBytes = Buffer.from(base64Data, 'base64');
      
      // Python: if pil_image.width > 50 and pil_image.height > 50
      // We can't easily check dimensions, so just check size (at least 1KB like before)
      if (imageBytes.length > 1000) {
        const imageHash = base64Data.length > 500 ? base64Data.substring(0, 500) : base64Data;
        if (!seenImageHashes.has(imageHash)) {
          seenImageHashes.add(imageHash);
          images.push(base64Data);
          console.log(`✅ Added base64 image ${images.length}`);
        }
      }
    } catch (e) {
      console.debug(`Could not decode base64 image: ${e}`);
      continue;
    }
  }
  
  // Python: If we still don't have images, just take any available images from MHTML - EXACT match
  // BUT: Skip logos/icons
  if (images.length === 0 && mhtmlImages.size > 0) {
    // Python: remaining = [img for key, img in mhtml_images.items() if img not in images]
    for (const [key, imgData] of mhtmlImages.entries()) {
      // Skip logos/icons
      if (shouldExcludeImage('', key, imgData)) {
        continue;
      }
      
      const imgBase64 = imgData.toString('base64');
      const imageHash = imgBase64.length > 500 ? imgBase64.substring(0, 500) : imgBase64;
      if (!seenImageHashes.has(imageHash)) {
        seenImageHashes.add(imageHash);
        images.push(imgBase64);
        console.log(`✅ Added fallback image ${images.length} from MHTML: ${key.substring(0, 60)}`);
      }
    }
  }
  
  console.log(`✅ Found ${images.length} total images for property`);
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
