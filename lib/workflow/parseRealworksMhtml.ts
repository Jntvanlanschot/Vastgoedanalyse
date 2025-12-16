/**
 * MHTML Realworks parser - extracts properties from MHTML files
 * TypeScript port of parse_realworks_mhtml.py
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
 * Extract HTML content from MHTML file
 */
function extractHtmlContentFromMhtml(mhtmlBuffer: Buffer): string | null {
  try {
    const content = mhtmlBuffer.toString('utf-8', { encoding: 'utf-8' });
    
    // Try to find HTML content - look for <html> tag
    const htmlMatch = content.match(/<html[^>]*>[\s\S]*?<\/html>/i);
    if (htmlMatch) {
      return htmlMatch[0];
    }
    
    // If no <html> tag, try to find content between boundaries
    // MHTML uses multipart boundaries
    const boundaryMatch = content.match(/boundary="([^"]+)"/i);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1];
      const parts = content.split(`--${boundary}`);
      
      for (const part of parts) {
        if (part.includes('Content-Type: text/html') || part.includes('Content-Type:text/html')) {
          // Extract HTML from this part
          const htmlStart = part.indexOf('<html');
          if (htmlStart >= 0) {
            return part.substring(htmlStart);
          }
        }
      }
    }
    
    // Fallback: return entire content if it looks like HTML
    if (content.includes('<html') || content.includes('<HTML')) {
      return content;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting HTML from MHTML:', error);
    return null;
  }
}

/**
 * Extract images from MHTML file
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
      
      // Find Content-ID or Content-Location
      // Content-ID can be with or without < >
      const contentIdMatch = part.match(/Content-ID:\s*<?([^>\r\n]+)>?/i) || 
                            part.match(/Content-Location:\s*([^\r\n]+)/i);
      if (!contentIdMatch) continue;
      
      let contentId = contentIdMatch[1].trim();
      // Store both with and without < > for lookup
      const contentIdWithBrackets = `<${contentId}>`;
      const contentIdWithoutBrackets = contentId;
      
      // Extract base64 data
      const base64Match = part.match(/Content-Transfer-Encoding:\s*base64[\s\S]*?\r?\n\r?\n([\s\S]+?)(?=\r?\n--|$)/i);
      if (base64Match) {
        try {
          const imageData = Buffer.from(base64Match[1].replace(/\s/g, ''), 'base64');
          // Store with both keys for easier lookup
          images.set(contentIdWithBrackets, imageData);
          images.set(contentIdWithoutBrackets, imageData);
          // Also try just the filename part if it's a URL
          if (contentId.includes('/')) {
            const filename = contentId.split('/').pop() || contentId;
            images.set(filename, imageData);
          }
        } catch (e) {
          console.warn(`Failed to decode base64 image ${contentId}:`, e);
        }
      }
    }
  } catch (error) {
    console.error('Error extracting images from MHTML:', error);
  }
  
  return images;
}

/**
 * Find images in HTML content that match MHTML images
 * Strategy: Find "Foto's" section and take ALL images after it until next address
 * NO LIMITS - take all images, prevent duplicates
 */
function findImagesInHtml(htmlContent: string, mhtmlImages: Map<string, Buffer>): string[] {
  const images: string[] = [];
  const seenImageHashes = new Set<string>(); // Prevent duplicates
  
  // Find "Foto's" section (case insensitive, with or without apostrophe)
  const fotosMatch = htmlContent.match(/Foto['s]*/i);
  if (!fotosMatch) {
    console.log('No "Foto\'s" section found in HTML');
    return images; // Return empty if no Foto's section
  }
  
  // Get content after "Foto's" - this is where all images should be
  // Images end when next address starts (handled by caller - we get propertyHtml that stops at next address)
  const contentAfterFotos = htmlContent.substring(fotosMatch.index + fotosMatch[0].length);
  
  // Find ALL img tags after "Foto's" section (no limit)
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  const foundImageRefs: string[] = [];
  
  while ((match = imgRegex.exec(contentAfterFotos)) !== null) {
    const src = match[1];
    foundImageRefs.push(src);
    
    let imageData: Buffer | null = null;
    let imageBase64: string | null = null;
    
    // Check for cid: URLs (remove < and > if present)
    if (src.includes('cid:')) {
      const cidMatch = src.match(/cid:([^"'>\s]+)/i);
      if (cidMatch) {
        let contentId = cidMatch[1];
        // Remove < and > if present
        contentId = contentId.replace(/^<|>$/g, '');
        
        // Try multiple lookup strategies
        imageData = mhtmlImages.get(contentId) || 
                   mhtmlImages.get(`<${contentId}>`) ||
                   mhtmlImages.get(contentId.replace(/^<|>$/g, ''));
        
        if (!imageData) {
          // Try filename matching (like Python version)
          const srcFilename = contentId.split('/').pop() || contentId;
          for (const [key, imgData] of mhtmlImages.entries()) {
            const keyFilename = key.replace(/^<|>$/g, '').split('/').pop() || key;
            if (srcFilename === keyFilename || 
                (srcFilename.length > 10 && keyFilename.length > 10 && 
                 srcFilename.substring(0, 10) === keyFilename.substring(0, 10))) {
              imageData = imgData;
              break;
            }
          }
        }
      }
    }
    
    // Check for data: URLs
    if (!imageData && src.startsWith('data:image/')) {
      const base64Match = src.match(/data:image\/[^;]+;base64,([^"']+)/);
      if (base64Match) {
        imageBase64 = base64Match[1];
      }
    }
    
    // Convert to base64 if we have imageData
    if (imageData) {
      imageBase64 = imageData.toString('base64');
    }
    
    // Add image if we found one and haven't seen it before
    if (imageBase64) {
      // Create a hash of first 100 chars to detect duplicates
      const imageHash = imageBase64.substring(0, 100);
      if (!seenImageHashes.has(imageHash)) {
        seenImageHashes.add(imageHash);
        images.push(imageBase64);
      }
    }
  }
  
  console.log(`Found ${images.length} unique images for property (from ${foundImageRefs.length} image refs in HTML after Foto's)`);
  
  return images;
}

/**
 * Parse MHTML file and extract property data
 */
export async function parseMhtmlFile(mhtmlBuffer: Buffer, filename: string): Promise<ParsedProperty[]> {
  console.log(`Parsing MHTML file: ${filename}`);
  
  // Extract HTML content
  let htmlContent = extractHtmlContentFromMhtml(mhtmlBuffer);
  if (!htmlContent) {
    console.error(`No HTML content found in ${filename}`);
    return [];
  }
  
  // Extract images
  const mhtmlImages = extractImagesFromMhtml(mhtmlBuffer);
  
  // Decode HTML entities (quoted-printable, etc.)
  htmlContent = htmlContent.replace(/=3D/g, '=').replace(/=\r?\n/g, '');
  
  // Find all addresses
  const addressPatterns = [
    /<b>([^<]+(?:straat|laan|weg|kade|plein|hof|park|dreef|singel|gracht)[^<]*(?:\d+[^<]*)?)<\/b>/gi,
    /<b>([^<]+(?:,\s*\d{4}\s+[A-Z]{2})[^<]*)<\/b>/gi,
    /<b>([^<]{10,50})<\/b>/gi
  ];
  
  const addressMatches: Array<{ match: RegExpMatchArray; index: number }> = [];
  
  for (const pattern of addressPatterns) {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      addressMatches.push({ match, index: match.index });
    }
    if (addressMatches.length > 0) break; // Use first pattern that finds matches
  }
  
  // Sort by position
  addressMatches.sort((a, b) => a.index - b.index);
  
  const properties: ParsedProperty[] = [];
  
  for (let i = 0; i < addressMatches.length; i++) {
    const { match, index: startPos } = addressMatches[i];
    const addressText = match[1];
    
    // Find property section (from this address to next address or end)
    let endPos: number;
    if (i + 1 < addressMatches.length) {
      endPos = addressMatches[i + 1].index;
    } else {
      // Look for next property marker or end
      const nextSection = htmlContent.indexOf('<table', startPos + 1000);
      if (nextSection > startPos) {
        endPos = nextSection;
      } else {
        endPos = Math.min(startPos + 10000, htmlContent.length);
      }
    }
    
    // Extract property HTML
    const propertyHtml = htmlContent.substring(startPos, endPos);
    
    // Extract address first
    let addressFull = addressText.trim();
    
    // Try to extract full address from HTML (might be in a table or bold tag)
    const addressMatch = propertyHtml.match(/<b>([^<]+)<\/b>/i);
    if (addressMatch) {
      addressFull = addressMatch[1].trim();
    }
    
    // Clean address: remove status text
    addressFull = addressFull.replace(
      /\s*(Verkocht|In verkoop genomen|Vraagprijs|Prijs op aanvraag).*$/i,
      ''
    ).trim();
    
    if (!addressFull) {
      continue;
    }
    
    // Convert HTML to plain text for parsing (preserve structure for price detection)
    const propertyTextWithBreaks = propertyHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/td>/gi, ' ')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Skip if too short
    if (propertyTextWithBreaks.length < 100) {
      continue;
    }
    
    // Parse the property (this will extract most fields)
    const record = parseRealworksProperty(propertyTextWithBreaks);
    
    // Override address with the one we extracted
    record.address_full = addressFull;
    
    // Extract address components
    const addressParts = addressFull.match(/^([^,]+),\s*(\d{4}\s?[A-Z]{2})\s+(.+)$/);
    if (addressParts) {
      const streetPart = addressParts[1].trim();
      const numberMatch = streetPart.match(/(\d+(?:\s+[A-Za-z0-9]+)?)\s*$/);
      if (numberMatch) {
        record.house_number = numberMatch[1].trim();
        record.street = streetPart.substring(0, numberMatch.index).trim();
      } else {
        record.street = streetPart;
        record.house_number = '';
      }
      record.postal_code = addressParts[2].replace(/\s/g, '');
      record.city = addressParts[3].trim();
    }
    
    // Extract Transactieprijs directly from HTML/text (more reliable)
    // Look for "Transactieprijs: € 550.000" or "Transactieprijs €550.000" or "Transactieprijs: € 550.000,-"
    // Try multiple patterns to catch different formats
    const transactiePatterns = [
      /Transactie\s*prijs\s*:?\s*€\s*([\d\.]+(?:\.\d{3})*(?:,\d+)?)/i,  // € 550.000 or € 550.000,50
      /Transactie\s*prijs\s*:?\s*€\s*([\d,]+)/i,  // € 550000,50
      /Transactie\s*prijs\s*:?\s*([\d\.]+(?:\.\d{3})*(?:,\d+)?)/i,  // 550.000 or 550.000,50
    ];
    
    let transactiePrice: number | null = null;
    for (const pattern of transactiePatterns) {
      const match = propertyTextWithBreaks.match(pattern);
      if (match) {
        let priceStr = match[1];
        // Remove dots (thousand separators) and replace comma with dot for decimal
        priceStr = priceStr.replace(/\./g, '').replace(',', '.');
        const price = parseFloat(priceStr);
        if (!isNaN(price) && price > 100) { // Sanity check: price should be > 100
          transactiePrice = Math.round(price);
          break;
        }
      }
    }
    
    if (transactiePrice) {
      record.sale_price = transactiePrice;
      console.log(`Found Transactieprijs for ${addressFull}: €${record.sale_price}`);
    } else {
      console.warn(`Could not find Transactieprijs for ${addressFull}. Text snippet: ${propertyTextWithBreaks.substring(0, 500)}`);
    }
    
    // Add source file info
    record.source_file = filename;
    
    // Find images for this property (after "Foto's" section, until next address)
    const images = findImagesInHtml(propertyHtml, mhtmlImages);
    record.images = images;
    record.image_count = images.length;
    
    if (images.length > 0) {
      console.log(`Found ${images.length} images for ${addressFull}`);
    }
    
    properties.push(record);
  }
  
  console.log(`Parsed ${properties.length} properties from ${filename}`);
  return properties;
}

