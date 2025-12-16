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
      const contentIdMatch = part.match(/Content-ID:\s*<?([^>\r\n]+)>?/i);
      const contentLocationMatch = part.match(/Content-Location:\s*([^\r\n]+)/i);
      
      let contentId: string | null = null;
      let contentLocation: string | null = null;
      
      if (contentIdMatch) {
        contentId = contentIdMatch[1].trim().replace(/^<|>$/g, '');
      }
      if (contentLocationMatch) {
        contentLocation = contentLocationMatch[1].trim();
      }
      
      // Use Content-Location if available (often HTTP URLs), otherwise Content-ID
      const primaryKey = contentLocation || contentId;
      if (!primaryKey) continue;
      
      // Store both with and without < > for lookup
      const contentIdWithBrackets = contentId ? `<${contentId}>` : null;
      const contentIdWithoutBrackets = contentId;
      
      // Extract base64 data - try multiple patterns
      let base64Data: string | null = null;
      
      // Pattern 1: Content-Transfer-Encoding: base64 followed by blank line and data
      const base64Match1 = part.match(/Content-Transfer-Encoding:\s*base64[\s\S]*?\r?\n\r?\n([\s\S]+?)(?=\r?\n--|$)/i);
      if (base64Match1) {
        base64Data = base64Match1[1];
      }
      
      // Pattern 2: Just look for base64 data after headers (more flexible)
      if (!base64Data) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd > 0) {
          const dataPart = part.substring(headerEnd + 4);
          // Remove boundary markers and whitespace
          const cleaned = dataPart.replace(/^[\s\S]*?--/m, '').replace(/\s/g, '');
          if (cleaned.length > 100) { // Reasonable size check
            base64Data = cleaned;
          }
        }
      }
      
      if (base64Data) {
        try {
          // Remove all whitespace from base64 data
          const cleanedBase64 = base64Data.replace(/\s/g, '');
          const imageData = Buffer.from(cleanedBase64, 'base64');
          
          // Only store if it's a reasonable size (not tiny icons)
          if (imageData.length > 1000) {
            // Store with multiple keys for easier lookup
            // Primary key (Content-Location or Content-ID)
            images.set(primaryKey, imageData);
            
            // If we have Content-ID, store with brackets too
            if (contentId) {
              if (contentIdWithBrackets) images.set(contentIdWithBrackets, imageData);
              if (contentIdWithoutBrackets) images.set(contentIdWithoutBrackets, imageData);
            }
            
            // Extract filename from URL for matching
            if (primaryKey.includes('/')) {
              const filename = primaryKey.split('/').pop() || primaryKey;
              // Remove query parameters
              const filenameClean = filename.split('?')[0];
              images.set(filenameClean, imageData);
              // Also store with .jpg/.jpeg/.png extension variations
              if (filenameClean.match(/\.(jpg|jpeg|png|gif)$/i)) {
                images.set(filenameClean.toLowerCase(), imageData);
              }
            }
            
            // Also store with just the last part after @ if it's an email-like format
            if (primaryKey.includes('@')) {
              const afterAt = primaryKey.split('@').pop() || primaryKey;
              images.set(afterAt, imageData);
            }
            
            console.log(`✅ Extracted image: ${primaryKey} (${imageData.length} bytes)`);
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
  // Also look for images in different formats (cid:, data:, http/https URLs, etc.)
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  const foundImageRefs: string[] = [];
  
  // Reset regex lastIndex
  imgRegex.lastIndex = 0;
  
  while ((match = imgRegex.exec(contentAfterFotos)) !== null) {
    const src = match[1];
    
    let imageData: Buffer | null = null;
    let imageBase64: string | null = null;
    
    // Check for cid: URLs (remove < and > if present)
    if (src.includes('cid:')) {
      const cidMatch = src.match(/cid:([^"'>\s]+)/i);
      if (cidMatch) {
        let contentId = cidMatch[1];
        // Remove < and > if present
        contentId = contentId.replace(/^<|>$/g, '').trim();
        
        // Try multiple lookup strategies
        imageData = mhtmlImages.get(contentId) || 
                   mhtmlImages.get(`<${contentId}>`) ||
                   mhtmlImages.get(contentId.replace(/^<|>$/g, ''));
        
        if (!imageData) {
          // Try filename matching (like Python version)
          const srcFilename = contentId.split('/').pop() || contentId;
          for (const [key, imgData] of mhtmlImages.entries()) {
            const keyClean = key.replace(/^<|>$/g, '').trim();
            const keyFilename = keyClean.split('/').pop() || keyClean;
            if (srcFilename === keyFilename || 
                keyClean === contentId ||
                (srcFilename.length > 5 && keyFilename.length > 5 && 
                 srcFilename.substring(0, 5) === keyFilename.substring(0, 5))) {
              imageData = imgData;
              console.log(`✅ Matched image by filename: ${srcFilename} -> ${keyFilename}`);
              break;
            }
          }
        } else {
          console.log(`✅ Matched image by Content-ID: ${contentId}`);
        }
      }
    }
    
    // Check for HTTP/HTTPS URLs (like https://images.realworks.nl/...)
    // These might be in the mhtml as Content-Location
    if (!imageData && (src.startsWith('http://') || src.startsWith('https://'))) {
      // First try to match by full URL (might be stored as Content-Location)
      // Remove query params for matching
      const urlWithoutParams = src.split('?')[0];
      imageData = mhtmlImages.get(src) || mhtmlImages.get(`<${src}>`) || 
                  mhtmlImages.get(urlWithoutParams) || mhtmlImages.get(`<${urlWithoutParams}>`);
      if (imageData) {
        console.log(`✅ Matched HTTP URL image by full URL: ${src.substring(0, 80)}`);
      }
      
      // If not found, try by filename
      if (!imageData) {
        const urlMatch = urlWithoutParams.match(/\/([^\/]+\.(jpg|jpeg|png|gif))/i);
        if (urlMatch) {
          const urlFilename = urlMatch[1];
          // Try to match with mhtml images by filename
          for (const [key, imgData] of mhtmlImages.entries()) {
            const keyClean = key.replace(/^<|>$/g, '').trim();
            const keyFilename = keyClean.split('/').pop() || keyClean;
            // Remove query params from key filename too
            const keyFilenameClean = keyFilename.split('?')[0];
            if (urlFilename === keyFilenameClean || 
                keyFilenameClean === urlFilename ||
                keyClean === urlWithoutParams ||
                keyClean.includes(urlFilename) ||
                urlFilename.includes(keyFilenameClean)) {
              imageData = imgData;
              console.log(`✅ Matched HTTP URL image by filename: ${urlFilename} -> ${keyFilenameClean}`);
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
        console.log(`✅ Found data: URL image`);
      }
    }
    
    // Convert to base64 if we have imageData
    if (imageData) {
      imageBase64 = imageData.toString('base64');
    }
    
    // Add image if we found one and haven't seen it before
    if (imageBase64) {
      // Use full base64 string for duplicate detection (more accurate)
      // Or use a longer hash (first 500 chars) to be more accurate
      const imageHash = imageBase64.length > 500 ? imageBase64.substring(0, 500) : imageBase64;
      if (!seenImageHashes.has(imageHash)) {
        seenImageHashes.add(imageHash);
        images.push(imageBase64);
        console.log(`✅ Added image ${images.length} (${imageBase64.length} bytes base64)`);
      } else {
        console.log(`⏭ Skipped duplicate image (hash match)`);
      }
    } else {
      console.log(`❌ Could not find image data for src: ${src.substring(0, 80)}`);
    }
  }
  
  // If we found image refs but no matches, try fallback: use all available mhtml images
  // This happens when HTML has img tags but we can't match them (e.g., external URLs)
  if (foundImageRefs.length > 0 && images.length === 0 && mhtmlImages.size > 0) {
    console.warn(`⚠ Found ${foundImageRefs.length} image refs but 0 matches. Using fallback: all available mhtml images.`);
    console.warn(`Available mhtml image keys (first 10):`, Array.from(mhtmlImages.keys()).slice(0, 10));
    console.warn(`First 3 image refs:`, foundImageRefs.slice(0, 3));
    
    // Fallback: use all available images (up to reasonable limit)
    let count = 0;
    for (const [key, imgData] of mhtmlImages.entries()) {
      if (count >= 50) break; // Limit to 50 images max
      const imgBase64 = imgData.toString('base64');
      const imageHash = imgBase64.length > 500 ? imgBase64.substring(0, 500) : imgBase64;
      if (!seenImageHashes.has(imageHash)) {
        seenImageHashes.add(imageHash);
        images.push(imgBase64);
        count++;
      }
    }
    console.log(`✅ Fallback: Added ${count} images from mhtml`);
  }
  
  console.log(`✅ Found ${images.length} unique images for property (from ${foundImageRefs.length} image refs in HTML after Foto's)`);
  
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
  // MHTML uses quoted-printable: =3D is =, =0A is newline, =E2=82=AC is €, etc.
  // IMPORTANT: Decode ALL quoted-printable sequences BEFORE searching for prices/images
  htmlContent = htmlContent
    .replace(/=([0-9A-F]{2})/gi, (match, hex) => {
      const charCode = parseInt(hex, 16);
      return String.fromCharCode(charCode);
    })
    .replace(/=\r?\n/g, ''); // Remove soft line breaks
  
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
    
    // IMPORTANT: ALWAYS clear sale_price from parseRealworksProperty
    // We'll extract Transactieprijs properly from HTML below
    // parseRealworksProperty might extract wrong price (€2) or Vraagprijs instead
    record.sale_price = null;
    console.log(`Cleared sale_price from parseRealworksProperty for ${addressFull} - will extract from HTML`);
    
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
    // HTML is already decoded (quoted-printable), so € symbol should be visible
    // Look for "Transactieprijs: € 550.000" or "Transactieprijs €550.000" or "Transactieprijs: € 550.000,-"
    // IMPORTANT: Search in decoded HTML first (propertyHtml is already decoded), then text version
    const decodedPropertyHtml = propertyHtml; // Already decoded above
    
    // Try multiple search strategies
    let transactiePrice: number | null = null;
    
    // Strategy 1: Direct pattern match in decoded HTML
    let priceMatch = decodedPropertyHtml.match(/Transactie\s*prijs\s*:?\s*€\s*([\d\.]+(?:\.\d{3})*(?:,\d+)?)/i);
    if (!priceMatch) {
      // Strategy 2: Without € symbol (might be encoded differently)
      priceMatch = decodedPropertyHtml.match(/Transactie\s*prijs\s*:?\s*([\d\.]+(?:\.\d{3})*(?:,\d+)?)/i);
    }
    if (!priceMatch) {
      // Strategy 3: Look for any price near "Transactie" (within 100 chars)
      const transactieIndex = decodedPropertyHtml.search(/Transactie/i);
      if (transactieIndex >= 0) {
        const afterTransactie = decodedPropertyHtml.substring(transactieIndex, transactieIndex + 150);
        priceMatch = afterTransactie.match(/€\s*([\d\.]+(?:\.\d{3})*(?:,\d+)?)/i);
      }
    }
    if (!priceMatch) {
      // Strategy 4: Try in text version
      priceMatch = propertyTextWithBreaks.match(/Transactie\s*prijs\s*:?\s*€\s*([\d\.]+(?:\.\d{3})*(?:,\d+)?)/i);
    }
    if (!priceMatch) {
      // Strategy 5: Try without € in text
      priceMatch = propertyTextWithBreaks.match(/Transactie\s*prijs\s*:?\s*([\d\.]+(?:\.\d{3})*(?:,\d+)?)/i);
    }
    
    if (priceMatch) {
      let priceStr = priceMatch[1];
      // Remove dots (thousand separators) and replace comma with dot for decimal
      priceStr = priceStr.replace(/\./g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 1000) { // Sanity check: price should be > 1000 (not €2!)
        transactiePrice = Math.round(price);
        console.log(`✅ Found Transactieprijs for ${addressFull}: €${transactiePrice}`);
      } else {
        console.warn(`⚠ Found Transactieprijs match but price too low: ${price} (string: ${priceMatch[1]})`);
      }
    } else {
      // Debug: show what we're searching in
      const debugSnippet = decodedPropertyHtml.substring(0, 2000);
      console.warn(`❌ Could not find Transactieprijs for ${addressFull}.`);
      // Look for "Transactie" in the HTML
      const transactieIndex = decodedPropertyHtml.toLowerCase().indexOf('transactie');
      if (transactieIndex >= 0) {
        const context = decodedPropertyHtml.substring(Math.max(0, transactieIndex - 50), transactieIndex + 200);
        console.warn(`Context around "Transactie": ${context}`);
      } else {
        console.warn(`⚠ "Transactie" not found in HTML at all!`);
        console.warn(`HTML snippet (first 1000 chars): ${debugSnippet.substring(0, 1000)}`);
      }
    }
    
    if (transactiePrice) {
      record.sale_price = transactiePrice;
    } else {
      // Don't set sale_price to 2 - leave it null if not found
      record.sale_price = null;
    }
    
    // Add source file info
    record.source_file = filename;
    
    // Find images for this property (after "Foto's" section, until next address)
    // Use decoded HTML for better image matching (already decoded above)
    const images = findImagesInHtml(propertyHtml, mhtmlImages);
    record.images = images;
    record.image_count = images.length;
    
    if (images.length > 0) {
      console.log(`✅ Found ${images.length} images for ${addressFull}`);
    } else {
      console.warn(`❌ No images found for ${addressFull}. MHTML has ${mhtmlImages.size} total images.`);
      // Debug: check if Foto's section exists
      if (propertyHtml.includes('Foto') || propertyHtml.includes('foto')) {
        const fotosIndex = propertyHtml.toLowerCase().indexOf('foto');
        console.warn(`⚠ Foto's section found at index ${fotosIndex} but no images extracted.`);
        const afterFotos = propertyHtml.substring(fotosIndex + 5);
        const imgTagCount = (afterFotos.match(/<img/gi) || []).length;
        console.warn(`⚠ Found ${imgTagCount} <img> tags after Foto's section.`);
        if (imgTagCount > 0) {
          const firstImgMatch = afterFotos.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (firstImgMatch) {
            console.warn(`⚠ First image src: ${firstImgMatch[1].substring(0, 100)}`);
          }
        }
      } else {
        console.warn(`⚠ No Foto's section found in HTML for ${addressFull}`);
      }
    }
    
    properties.push(record);
  }
  
  console.log(`Parsed ${properties.length} properties from ${filename}`);
  return properties;
}

