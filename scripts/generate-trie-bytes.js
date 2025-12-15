/**
 * Temporary script to generate embedded trie bytes for fontkit
 * Run: node scripts/generate-trie-bytes.js
 */

const fs = require('fs');
const path = require('path');

const fontkitPath = path.join(process.cwd(), 'node_modules', '@foliojs-fork', 'fontkit');
const trieFiles = ['data.trie', 'indic.trie', 'use.trie'];

console.log('Reading trie files from:', fontkitPath);

const trieData = {};

for (const trieFile of trieFiles) {
  const filePath = path.join(fontkitPath, trieFile);
  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const varName = trieFile.replace('.trie', 'Trie').replace(/([A-Z])/g, (m, p1) => p1.toLowerCase()).replace(/^./, m => m.toUpperCase());
    trieData[trieFile] = {
      varName: varName.charAt(0).toLowerCase() + varName.slice(1),
      base64,
      size: buffer.length
    };
    console.log(`✓ Loaded ${trieFile}: ${buffer.length} bytes`);
  } else {
    console.error(`✗ File not found: ${filePath}`);
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

