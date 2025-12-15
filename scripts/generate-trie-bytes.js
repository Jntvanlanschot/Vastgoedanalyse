/**
 * Temporary script to generate embedded trie bytes for fontkit
 * Run: node scripts/generate-trie-bytes.js
 */

const fs = require('fs');
const path = require('path');

const fontkitPath = path.join(process.cwd(), 'node_modules', '@foliojs-fork', 'fontkit');
const trieFiles = ['data.trie', 'indic.trie', 'use.trie', 'classes.trie'];

console.log('Reading trie files from:', fontkitPath);

const trieData = {};

for (const trieFile of trieFiles) {
  // Try multiple possible locations
  const candidates = [
    path.join(fontkitPath, trieFile),
    path.join(fontkitPath, 'data', trieFile),
    path.join(fontkitPath, 'src', 'opentype', 'shapers', trieFile),
  ];
  
  let found = false;
  for (const candidatePath of candidates) {
    if (fs.existsSync(candidatePath)) {
      const buffer = fs.readFileSync(candidatePath);
      const base64 = buffer.toString('base64');
      // Convert filename to camelCase export name (e.g., "data.trie" -> "dataTrie")
      const varName = trieFile.replace('.trie', '');
      const camelCaseName = varName.charAt(0).toLowerCase() + varName.slice(1) + 'Trie';
      trieData[trieFile] = {
        varName: camelCaseName,
        base64,
        size: buffer.length
      };
      console.log(`✓ Loaded ${trieFile} from ${candidatePath}: ${buffer.length} bytes`);
      found = true;
      break;
    }
  }
  
  if (!found) {
    // If classes.trie doesn't exist, create empty placeholder
    if (trieFile === 'classes.trie') {
      console.warn(`⚠ classes.trie not found - creating empty placeholder buffer`);
      trieData[trieFile] = {
        varName: 'classesTrie',
        base64: Buffer.alloc(0).toString('base64'), // Empty buffer
        size: 0
      };
    } else {
      console.warn(`⚠ File not found: ${trieFile} (tried: ${candidates.join(', ')})`);
    }
  }
}

// Generate TypeScript file content
const tsContent = `/**
 * Embedded trie files for @foliojs-fork/fontkit
 * Generated from node_modules/@foliojs-fork/fontkit/*.trie
 * These are embedded to avoid filesystem dependency in Vercel serverless runtime
 */

${Object.entries(trieData).map(([file, data]) => 
  `export const ${data.varName} = Buffer.from("${data.base64}", "base64"); // ${data.size} bytes from ${file}`
).join('\n')}
`;

const outputPath = path.join(process.cwd(), 'lib', 'fontkit-trie-bytes.ts');
fs.writeFileSync(outputPath, tsContent, 'utf-8');

console.log(`\n✓ Generated ${outputPath}`);
console.log(`Total size: ${Object.values(trieData).reduce((sum, d) => sum + d.size, 0)} bytes`);

