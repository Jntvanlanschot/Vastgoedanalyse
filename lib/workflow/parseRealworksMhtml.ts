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
      const contentIdMatch = part.match(/Content-ID:\s*<([^>]+)>/i) || 
                            part.match(/Content-Location:\s*([^\r\n]+)/i);
      if (!contentIdMatch) continue;
      
      const contentId = contentIdMatch[1];
      
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
 */
function findImagesInHtml(htmlContent: string, mhtmlImages: Map<string, Buffer>): string[] {
  const images: string[] = [];
  
  // Find all img tags with src pointing to cid: or data: URLs
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  
  while ((match = imgRegex.exec(htmlContent)) !== null) {
    const src = match[1];
    
    // Check for cid: URLs (remove < and > if present)
    if (src.startsWith('cid:') || src.includes('cid:')) {
      const cidMatch = src.match(/cid:([^"'>\s]+)/i);
      if (cidMatch) {
        let contentId = cidMatch[1];
        // Remove < and > if present
        contentId = contentId.replace(/^<|>$/g, '');
        const imageData = mhtmlImages.get(contentId);
        if (imageData) {
          images.push(imageData.toString('base64'));
          continue;
        }
        // Try without < >
        const imageData2 = mhtmlImages.get(`<${contentId}>`);
        if (imageData2) {
          images.push(imageData2.toString('base64'));
          continue;
        }
      }
    }
    
    // Check for data: URLs
    if (src.startsWith('data:image/')) {
      const base64Match = src.match(/data:image\/[^;]+;base64,([^"']+)/);
      if (base64Match) {
        images.push(base64Match[1]);
      }
    }
  }
  
  // Also try to find images by searching for common image patterns in HTML
  // Sometimes images are referenced differently
  if (images.length === 0) {
    // Look for any image references in the HTML section
    const allImageRefs = htmlContent.match(/[Ii]mage[^<]*\.(jpg|jpeg|png|gif)/gi);
    if (allImageRefs) {
      console.log(`Found ${allImageRefs.length} image references in HTML (but no matching images in mhtml)`);
    }
  }
  
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
    
    // Convert HTML to plain text for parsing
    // Keep some structure for better parsing (especially for prices)
    let propertyText = propertyHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Also try to extract text from HTML more carefully (preserve line breaks for price detection)
    // This helps with finding "Transactieprijs" which might be on a separate line
    const propertyTextWithBreaks = propertyHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/td>/gi, ' ')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Use the version with breaks for parsing (better for finding prices)
    const textToParse = propertyTextWithBreaks.length > propertyText.length ? propertyTextWithBreaks : propertyText;
    
    // Skip if too short
    if (textToParse.length < 100) {
      continue;
    }
    
    // Parse the property
    const record = parseRealworksProperty(textToParse);
    
    // Add source file info
    record.source_file = filename;
    
    // Only add if we have at least an address
    if (!record.address_full) {
      // Try to extract address from HTML directly
      const addressMatch = propertyHtml.match(/<b>([^<]+)<\/b>/i);
      if (addressMatch) {
        record.address_full = addressMatch[1].trim();
      }
    }
    
    if (!record.address_full) {
      continue;
    }
    
    // Clean address: remove status text
    record.address_full = record.address_full.replace(
      /\s*(Verkocht|In verkoop genomen|Vraagprijs|Prijs op aanvraag).*$/i,
      ''
    ).trim();
    
    // Find images for this property
    const images = findImagesInHtml(propertyHtml, mhtmlImages);
    record.images = images;
    record.image_count = images.length;
    
    properties.push(record);
  }
  
  console.log(`Parsed ${properties.length} properties from ${filename}`);
  return properties;
}

