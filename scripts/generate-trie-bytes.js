/**
 * Temporary script to generate embedded trie bytes for fontkit and linebreak
 * Run: node scripts/generate-trie-bytes.js
 */

const fs = require('fs');
const path = require('path');

const fontkitPath = path.join(process.cwd(), 'node_modules', '@foliojs-fork', 'fontkit');
const linebreakPath = path.join(process.cwd(), 'node_modules', '@foliojs-fork', 'linebreak');

console.log('Reading trie files from fontkit and linebreak...');

const trieData = {};

// Fontkit tries
const fontkitTries = ['data.trie', 'indic.trie', 'use.trie'];
for (const trieFile of fontkitTries) {
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
    console.warn(`⚠ File not found: ${trieFile} (tried: ${candidates.join(', ')})`);
  }
}

// Linebreak classes.trie (used by @foliojs-fork/linebreak)
const classesTriePath = path.join(linebreakPath, 'src', 'classes.trie');
if (fs.existsSync(classesTriePath)) {
  const buffer = fs.readFileSync(classesTriePath);
  const base64 = buffer.toString('base64');
  trieData['classes.trie'] = {
    varName: 'classesTrie',
    base64,
    size: buffer.length
  };
  console.log(`✓ Loaded classes.trie from ${classesTriePath}: ${buffer.length} bytes`);
} else {
  console.warn(`⚠ classes.trie not found at ${classesTriePath} - creating empty placeholder`);
  trieData['classes.trie'] = {
    varName: 'classesTrie',
    base64: Buffer.alloc(0).toString('base64'),
    size: 0
  };
}

// Generate TypeScript file content
const tsContent = `/**
 * Embedded trie files for @foliojs-fork/fontkit and @foliojs-fork/linebreak
 * Generated from node_modules/@foliojs-fork/fontkit/*.trie and node_modules/@foliojs-fork/linebreak/src/classes.trie
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

